/**
 * Cron Scheduler — multi-slot, timezone-aware, retry-enabled.
 *
 * Features:
 *   • Multiple upload times per day (default: 09:00, 15:00, 20:00)
 *   • Full IANA timezone support via node-cron
 *   • Per-slot niche assignment
 *   • Automatic retry of failed jobs (via retryTracker)
 *   • Daily summary email at 23:55 in the configured timezone
 *   • Graceful shutdown — waits for active workflows before exiting
 *   • Status reporting: next run times, queue depth, retry queue
 *
 * Configuration (all optional — sensible defaults apply):
 *   UPLOAD_TIMES       "09:00,15:00,20:00"   comma-separated HH:MM
 *   SCHEDULE_TIMEZONE  "America/New_York"     IANA timezone
 *   SLOT_NICHES        "ai_tools,,money_facts" per-slot niche override
 *   SHORTS_PER_DAY     1                      videos per slot trigger
 */

'use strict';

const cron   = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config');

const { queue, Priority }   = require('../workflow/taskQueue');
const { workflowManager }   = require('../workflow/workflowManager');
const { ensureWorkDirs }    = require('../utils/fs');
const { buildScheduleSlots, formatSlot } = require('./scheduleConfig');
const { retryTracker }      = require('./retryTracker');

// ── State ─────────────────────────────────────────────────────────────────────

const _cronTasks = [];   // all registered cron.Task instances
let   _started   = false;

// ── Enqueue helper ────────────────────────────────────────────────────────────

/**
 * Enqueue a single workflow run into the task queue.
 *
 * @param {object} [opts]
 * @param {string} [opts.niche]
 * @param {string} [opts.jobId]      — used when re-enqueuing a retry
 * @param {number} [opts.priority]
 * @param {string} [opts.triggeredBy]
 */
function enqueueWorkflow({ niche, jobId, priority, triggeredBy = 'cron' } = {}) {
  const resolvedNiche = niche ?? config.pipeline.topicCategory;

  const taskId = queue.enqueue({
    name:     `workflow:${resolvedNiche}`,
    priority: priority ?? Priority.NORMAL,
    timeout:  45 * 60 * 1000,
    meta:     { niche: resolvedNiche, triggeredBy, jobId },
    fn:       async () => {
      const result = await workflowManager.run({ niche: resolvedNiche, jobId });

      // Register failures for automatic retry
      if (!result.success) {
        retryTracker.registerFailure(result);
      } else {
        // Clear any pending retry for this job on success
        retryTracker.markResolved(result.jobId);
      }

      return result;
    },
  });

  return taskId;
}

// ── Scheduler start ───────────────────────────────────────────────────────────

function start() {
  if (_started) {
    logger.warn('[scheduler] Already started — ignoring duplicate start()');
    return;
  }
  _started = true;

  ensureWorkDirs();

  const slots    = buildScheduleSlots();
  const perSlot  = config.pipeline.shortsPerDay;

  // ── Print schedule banner ──────────────────────────────────────────────────
  logger.info('╔═══════════════════════════════════════════════════════╗');
  logger.info('║           Scheduler Starting                          ║');
  logger.info('╠═══════════════════════════════════════════════════════╣');
  slots.forEach((slot) => logger.info(`║ ${formatSlot(slot).padEnd(53)} ║`));
  logger.info(`║  Per slot : ${String(perSlot).padEnd(42)} ║`);
  logger.info('╚═══════════════════════════════════════════════════════╝');

  // ── Register one cron task per slot ───────────────────────────────────────
  for (const slot of slots) {
    const task = cron.schedule(
      slot.cronExpr,
      () => {
        logger.info(`[scheduler] ⏰ Slot ${slot.index + 1} triggered — enqueuing ${perSlot} workflow(s) [${slot.niche}]`);
        for (let i = 0; i < perSlot; i++) {
          enqueueWorkflow({ niche: slot.niche, triggeredBy: `slot-${slot.index + 1}` });
        }
      },
      { timezone: slot.timezone, scheduled: true }
    );

    _cronTasks.push(task);
    logger.info(`[scheduler] ✅ Slot ${slot.index + 1} registered: ${slot.cronExpr} [${slot.timezone}]`);
  }

  // ── Daily summary cron (23:55 in configured timezone) ─────────────────────
  const summaryTz = process.env.SCHEDULE_TIMEZONE ?? 'UTC';
  const summaryTask = cron.schedule('55 23 * * *', async () => {
    logger.info('[scheduler] 📊 Daily summary triggered');
    await _sendDailySummary();
  }, { timezone: summaryTz, scheduled: true });

  _cronTasks.push(summaryTask);

  // ── Wire up retry tracker ──────────────────────────────────────────────────
  retryTracker.setEnqueueFn(enqueueWorkflow);
  retryTracker.start();

  // ── Queue event logging ────────────────────────────────────────────────────
  queue.on('enqueued',  (t)    => logger.debug(`[scheduler] Enqueued: ${t.name} (id=${t.id})`));
  queue.on('started',   (t)    => logger.info(`[scheduler] ▶ Started: ${t.name} (id=${t.id})`));
  queue.on('completed', (t)    => logger.info(`[scheduler] ✅ Done: ${t.name} (id=${t.id})`));
  queue.on('failed',    (t, e) => logger.error(`[scheduler] ❌ Failed: ${t.name} — ${e.message}`));
  queue.on('drained',   ()     => logger.info('[scheduler] Queue empty'));

  logger.info(`[scheduler] Running. Next runs logged above. Retry check: every 60s`);
}

// ── Daily summary helper ──────────────────────────────────────────────────────

async function _sendDailySummary() {
  try {
    const history   = workflowManager.getHistory(50);
    const today     = new Date().toISOString().slice(0, 10);
    const todayRuns = history.filter((r) => r.startedAt?.startsWith(today));

    if (todayRuns.length === 0) {
      logger.info('[scheduler] No runs today — skipping summary email');
      return;
    }

    const { sendDailySummary } = require('../notifications/emailNotifier');
    await sendDailySummary({
      date:         today,
      totalUploads: todayRuns.length,
      successCount: todayRuns.filter((r) => r.success).length,
      failureCount: todayRuns.filter((r) => !r.success).length,
      uploads:      todayRuns.map((r) => ({
        title:    r.title    ?? 'Unknown',
        videoUrl: r.videoUrl ?? null,
        niche:    r.niche,
      })),
    });
  } catch (err) {
    logger.warn(`[scheduler] Daily summary failed: ${err.message}`);
  }
}

// ── Stop ──────────────────────────────────────────────────────────────────────

function stop() {
  logger.info('[scheduler] Stopping...');
  _cronTasks.forEach((t) => t.stop());
  _cronTasks.length = 0;
  retryTracker.stop();
  _started = false;
  logger.info('[scheduler] Stopped');
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Return a full status snapshot for monitoring / CLI display.
 */
function getStatus() {
  const slots   = buildScheduleSlots();
  const qStatus = queue.getStatus();
  const rStatus = retryTracker.getStatus();

  return {
    started:    _started,
    slots:      slots.map((s) => ({ label: s.label, niche: s.niche })),
    queue:      qStatus,
    retry:      rStatus,
    activeRuns: workflowManager.getActiveRuns(),
  };
}

module.exports = { start, stop, enqueueWorkflow, getStatus };
