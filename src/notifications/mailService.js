/**
 * Mail Service — reusable Gmail SMTP core.
 *
 * Responsibilities:
 *   • Build and cache a single Nodemailer transporter per process
 *   • Verify SMTP connectivity on first use (with a clear error message)
 *   • Send mail with retry + exponential backoff
 *   • Sanitise all user-supplied values before they enter HTML
 *   • Log every send attempt (success and failure) to Winston
 *
 * All other notification modules import from here — they never
 * create their own transporter.
 */

'use strict';

const nodemailer = require('nodemailer');
const config     = require('../config');
const logger     = require('../utils/logger');
const { retry }  = require('../utils/retry');

// ── Transporter (lazy singleton) ─────────────────────────────────────────────

let _transporter = null;
let _verified    = false;

/**
 * Build (or return cached) the Nodemailer transporter.
 * @returns {import('nodemailer').Transporter}
 */
function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmail.user,
      pass: config.gmail.appPassword,
    },
    pool:           true,    // reuse connections
    maxConnections: 3,
    rateDelta:      1000,    // max 1 message per second
    rateLimit:      5,       // max 5 messages per rateDelta window
  });

  return _transporter;
}

/**
 * Verify SMTP connectivity once per process lifetime.
 * Throws a descriptive error if credentials are wrong.
 */
async function verifyConnection() {
  if (_verified) return;

  // Skip verification if password is a placeholder
  const pass = config.gmail.appPassword;
  if (!pass || pass.replace(/x/gi, '').length === 0 || pass.length < 8) {
    logger.warn('[mailService] Gmail App Password appears to be a placeholder — email notifications disabled');
    _verified = true;   // mark as verified so we don't keep trying
    return;
  }

  try {
    await getTransporter().verify();
    _verified = true;
    logger.info('[mailService] SMTP connection verified');
  } catch (err) {
    throw new Error(
      `[mailService] Gmail SMTP verification failed: ${err.message}\n` +
      'Check GMAIL_USER and GMAIL_PASS in your .env file.\n' +
      'GMAIL_PASS must be a 16-character App Password, not your regular password.\n' +
      'Generate one at: https://myaccount.google.com/apppasswords'
    );
  }
}

// ── HTML sanitiser ────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent injection in email bodies.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * @typedef {object} MailOptions
 * @property {string}          to       — recipient (defaults to config.gmail.notifyEmail)
 * @property {string}          subject
 * @property {string}          html     — HTML body
 * @property {string}          [text]   — plain-text fallback
 * @property {string}          [from]   — sender (defaults to "Shorts Bot <user>")
 * @property {object[]}        [attachments]
 */

/**
 * Send an email via Gmail SMTP with retry.
 *
 * @param {MailOptions} opts
 * @returns {Promise<object>} Nodemailer info object
 */
async function sendMail(opts) {
  await verifyConnection();

  const transport = getTransporter();
  const from      = opts.from ?? `"Shorts Bot 🤖" <${config.gmail.user}>`;
  const to        = opts.to   ?? config.gmail.notifyEmail;

  logger.debug(`[mailService] Sending "${opts.subject}" → ${to}`);

  const info = await retry(
    () => transport.sendMail({
      from,
      to,
      subject:     opts.subject,
      html:        opts.html,
      text:        opts.text ?? _htmlToText(opts.html),
      attachments: opts.attachments,
    }),
    { attempts: 3, delay: 2000, label: `email: "${opts.subject}"` }
  );

  logger.info(`[mailService] ✅ Sent "${opts.subject}" → ${to} (msgId: ${info.messageId})`);
  return info;
}

/**
 * Strip HTML tags to produce a plain-text fallback.
 * @param {string} html
 * @returns {string}
 */
function _htmlToText(html) {
  return (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { sendMail, verifyConnection, esc };
