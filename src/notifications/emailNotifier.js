/**
 * Email Notifier — public notification API.
 *
 * All pipeline code imports from here. This module composes
 * mailService + templates into named, purpose-specific functions.
 *
 * Exported functions:
 *   sendPublishedNotification(data)  — video went live / was scheduled
 *   sendUploadFailureNotification(data) — upload failed after all retries
 *   sendErrorNotification(data)      — generic pipeline error (backward compat)
 *   sendDailySummary(data)           — end-of-day digest
 *   testConnection()                 — verify SMTP works without sending
 */

'use strict';

const config    = require('../config');
const logger    = require('../utils/logger');
const { sendMail, verifyConnection } = require('./mailService');
const templates = require('./templates');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wrap a send call so notification failures are never fatal to the pipeline.
 * Logs the error and returns false instead of throwing.
 *
 * @param {Function} fn
 * @param {string}   label
 * @returns {Promise<boolean>}
 */
async function safeSend(fn, label) {
  try {
    await fn();
    return true;
  } catch (err) {
    logger.error(`[emailNotifier] Failed to send "${label}": ${err.message}`);
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a "Short published" or "Short scheduled" notification.
 *
 * Accepts either the rich UploadResult from youtubeUploader, or the
 * legacy { title, videoUrl, jobId } shape for backward compatibility.
 *
 * @param {object} data
 * @param {string}  data.jobId
 * @param {string}  data.title
 * @param {string}  data.videoUrl
 * @param {string}  [data.videoId]
 * @param {string}  [data.niche]
 * @param {string}  [data.privacyStatus]
 * @param {string}  [data.scheduledFor]
 * @param {boolean} [data.thumbnailSet]
 * @param {number}  [data.retryCount]
 * @param {number}  [data.durationMs]
 * @param {number}  [data.fileSizeKb]
 * @returns {Promise<boolean>}
 */
async function sendPublishedNotification(data) {
  const isScheduled = !!data.scheduledFor;
  const subject     = isScheduled
    ? `🕐 Short Scheduled: ${data.title}`
    : `✅ Short Published: ${data.title}`;

  logger.info(`[emailNotifier] Sending published notification for job ${data.jobId}`);

  return safeSend(
    () => sendMail({
      to:      config.gmail.notifyEmail,
      subject,
      html:    templates.uploadSuccess({
        jobId:         data.jobId,
        videoId:       data.videoId       ?? '',
        videoUrl:      data.videoUrl,
        title:         data.title,
        niche:         data.niche         ?? 'general',
        privacyStatus: data.privacyStatus ?? 'public',
        scheduledFor:  data.scheduledFor  ?? null,
        thumbnailSet:  data.thumbnailSet  ?? false,
        retryCount:    data.retryCount    ?? 0,
        durationMs:    data.durationMs    ?? 0,
        fileSizeKb:    data.fileSizeKb    ?? null,
        publishedAt:   new Date().toISOString(),
      }),
    }),
    subject
  );
}

/**
 * Send an upload failure notification.
 *
 * @param {object} data
 * @param {string}  data.jobId
 * @param {string}  data.title
 * @param {string}  [data.niche]
 * @param {Error|string} data.error
 * @param {string}  [data.errorCode]
 * @param {number}  [data.retryCount]
 * @param {number}  [data.durationMs]
 * @returns {Promise<boolean>}
 */
async function sendUploadFailureNotification(data) {
  const errorMessage = data.error?.message ?? String(data.error ?? 'Unknown error');
  const subject      = `❌ Upload Failed: ${data.title ?? 'Unknown video'}`;

  logger.info(`[emailNotifier] Sending upload failure notification for job ${data.jobId}`);

  return safeSend(
    () => sendMail({
      to:      config.gmail.notifyEmail,
      subject,
      html:    templates.uploadFailure({
        jobId:        data.jobId,
        title:        data.title        ?? 'Unknown video',
        niche:        data.niche        ?? 'general',
        errorMessage,
        errorCode:    data.errorCode    ?? null,
        retryCount:   data.retryCount   ?? 0,
        durationMs:   data.durationMs   ?? 0,
        failedAt:     new Date().toISOString(),
      }),
    }),
    subject
  );
}

/**
 * Send a generic pipeline error notification.
 * Backward-compatible with the old { error, jobId } signature.
 *
 * @param {object} data
 * @param {string}  data.jobId
 * @param {Error|string} data.error
 * @param {string}  [data.step]   — pipeline step name
 * @returns {Promise<boolean>}
 */
async function sendErrorNotification(data) {
  const err     = data.error;
  const message = err?.message ?? String(err ?? 'Unknown error');
  const stack   = err?.stack   ?? null;
  const subject = `⚠️ Pipeline Error — Job ${data.jobId}`;

  logger.info(`[emailNotifier] Sending pipeline error notification for job ${data.jobId}`);

  return safeSend(
    () => sendMail({
      to:      config.gmail.notifyEmail,
      subject,
      html:    templates.pipelineError({
        jobId:        data.jobId,
        step:         data.step         ?? 'unknown',
        errorMessage: message,
        stack,
        failedAt:     new Date().toISOString(),
      }),
    }),
    subject
  );
}

/**
 * Send a daily summary digest.
 *
 * @param {object} data
 * @param {string}  [data.date]          — YYYY-MM-DD (defaults to today)
 * @param {number}  data.totalUploads
 * @param {number}  data.successCount
 * @param {number}  data.failureCount
 * @param {Array}   data.uploads         — array of { title, videoUrl, niche }
 * @returns {Promise<boolean>}
 */
async function sendDailySummary(data) {
  const date    = data.date ?? new Date().toISOString().slice(0, 10);
  const subject = `📊 Daily Summary — ${date} (${data.successCount}/${data.totalUploads} published)`;

  logger.info(`[emailNotifier] Sending daily summary for ${date}`);

  return safeSend(
    () => sendMail({
      to:      config.gmail.notifyEmail,
      subject,
      html:    templates.dailySummary({ ...data, date }),
    }),
    subject
  );
}

/**
 * Verify SMTP connectivity without sending a message.
 * Useful for the check:config script.
 *
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    await verifyConnection();
    logger.info('[emailNotifier] SMTP connection test passed');
    return true;
  } catch (err) {
    logger.error(`[emailNotifier] SMTP connection test failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  sendPublishedNotification,
  sendUploadFailureNotification,
  sendErrorNotification,
  sendDailySummary,
  testConnection,
};
