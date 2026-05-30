/**
 * Schedule Configuration
 *
 * Defines and parses the multi-slot upload schedule.
 *
 * Supports two formats in UPLOAD_TIMES env var:
 *   "09:00,15:00,20:00"          — HH:MM list (uses SCHEDULE_TIMEZONE)
 *   "0 9 * * *|0 15 * * *"       — raw cron expressions separated by |
 *
 * Each slot produces one workflow run. Slots are spaced at least
 * MIN_SLOT_GAP_MINUTES apart to avoid API rate limits.
 *
 * Default schedule (when UPLOAD_TIMES is not set):
 *   09:00, 15:00, 20:00  in the configured timezone
 */

'use strict';

const cron   = require('node-cron');
const logger = require('../utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMES      = ['09:00', '15:00', '20:00'];
const MIN_SLOT_GAP_MIN   = 30;   // minimum minutes between slots
const DEFAULT_TIMEZONE   = 'UTC';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ScheduleSlot
 * @property {string} label       — human-readable e.g. "09:00 America/New_York"
 * @property {string} cronExpr    — 5-part cron expression
 * @property {string} timezone    — IANA timezone string
 * @property {string} niche       — content niche for this slot
 * @property {number} index       — 0-based slot index
 */

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Convert "HH:MM" to a cron expression "M H * * *".
 * @param {string} time  — e.g. "09:00" or "9:00"
 * @returns {string}
 */
function timeToCron(time) {
  const [hStr, mStr] = time.trim().split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? '0', 10);

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time format: "${time}" — expected HH:MM`);
  }
  return `${m} ${h} * * *`;
}

/**
 * Parse UPLOAD_TIMES env value into an array of cron expressions.
 *
 * @param {string} raw  — e.g. "09:00,15:00,20:00" or "0 9 * * *|0 15 * * *"
 * @returns {string[]}  — array of cron expressions
 */
function parseUploadTimes(raw) {
  if (!raw || !raw.trim()) return DEFAULT_TIMES.map(timeToCron);

  // Detect format: pipe-separated cron expressions
  if (raw.includes('|')) {
    return raw.split('|').map((e) => e.trim()).filter(Boolean);
  }

  // Comma-separated HH:MM times
  return raw.split(',').map((t) => timeToCron(t.trim()));
}

/**
 * Validate all cron expressions and throw with a clear message if any are invalid.
 * @param {string[]} expressions
 */
function validateExpressions(expressions) {
  const invalid = expressions.filter((e) => !cron.validate(e));
  if (invalid.length > 0) {
    throw new Error(
      `[scheduleConfig] Invalid cron expression(s): ${invalid.join(', ')}\n` +
      'Use HH:MM format (e.g. "09:00,15:00,20:00") or valid 5-part cron expressions.'
    );
  }
}

/**
 * Enforce minimum gap between slots.
 * Logs a warning if any two slots are closer than MIN_SLOT_GAP_MIN.
 *
 * @param {string[]} times  — HH:MM strings
 */
function warnIfTooClose(times) {
  const minutes = times.map((t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }).sort((a, b) => a - b);

  for (let i = 1; i < minutes.length; i++) {
    const gap = minutes[i] - minutes[i - 1];
    if (gap < MIN_SLOT_GAP_MIN) {
      logger.warn(
        `[scheduleConfig] Slots at ${times[i - 1]} and ${times[i]} are only ${gap} min apart. ` +
        `Minimum recommended gap is ${MIN_SLOT_GAP_MIN} min.`
      );
    }
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build the full list of schedule slots from environment variables.
 *
 * Reads:
 *   UPLOAD_TIMES      — comma-separated HH:MM or pipe-separated cron
 *   SCHEDULE_TIMEZONE — IANA timezone (default: UTC)
 *   TOPIC_CATEGORY    — default niche for all slots
 *   SLOT_NICHES       — optional comma-separated niche per slot
 *                       e.g. "ai_tools,money_facts,productivity"
 *
 * @returns {ScheduleSlot[]}
 */
function buildScheduleSlots() {
  const rawTimes  = process.env.UPLOAD_TIMES      ?? '';
  const timezone  = process.env.SCHEDULE_TIMEZONE ?? DEFAULT_TIMEZONE;
  const niche     = process.env.TOPIC_CATEGORY    ?? 'tech';
  const rawNiches = process.env.SLOT_NICHES       ?? '';

  const cronExprs = parseUploadTimes(rawTimes);
  validateExpressions(cronExprs);

  // Per-slot niches (optional — falls back to default niche)
  const slotNiches = rawNiches
    ? rawNiches.split(',').map((n) => n.trim())
    : [];

  const slots = cronExprs.map((expr, i) => ({
    label:    `slot-${i + 1} [${expr}] ${timezone}`,
    cronExpr: expr,
    timezone,
    niche:    slotNiches[i] ?? niche,
    index:    i,
  }));

  // Warn if HH:MM times are too close together
  if (!rawTimes.includes('|') && rawTimes.includes(':')) {
    const times = (rawTimes || DEFAULT_TIMES.join(',')).split(',').map((t) => t.trim());
    warnIfTooClose(times);
  }

  return slots;
}

/**
 * Format a slot for display.
 * @param {ScheduleSlot} slot
 * @returns {string}
 */
function formatSlot(slot) {
  return `  Slot ${slot.index + 1}: ${slot.cronExpr.padEnd(14)} [${slot.timezone}]  niche: ${slot.niche}`;
}

module.exports = { buildScheduleSlots, parseUploadTimes, timeToCron, formatSlot, DEFAULT_TIMES };
