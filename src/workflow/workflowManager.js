/**
 * Workflow Manager
 *
 * Fixes over v1:
 *   • _persistRun logs the error instead of silently swallowing it
 *   • getHistory uses readNdjsonTail (bounded memory, no full-file read)
 *   • runBatch validates count before starting
 *   • Structured log metadata (jobId, niche) on every entry
 *   • _activeRuns cleaned up in finally block (not just on success/failure)
 *   • sendErrorNotification failure is logged, not silently ignored
 */

'use strict';

const EventEmitter   = require('events');
const path           = require('path');
const { v4: uuidv4 } = require('uuid');

const logger             = require('../utils/logger');
const config             = require('../config');
const { sleep }          = require('../utils/retry');
const { ensureWorkDirs, safeAppendNdjson, readNdjsonTail, PROJECT_ROOT } = require('../utils/fs');
const { WORKFLOW_STEPS } = require('./steps');
const { sendErrorNotification, sendDailySummary } = require('../notifications/emailNotifier');

const RUNS_FILE = path.join(PROJECT_ROOT, 'project', 'logs', 'workflow_runs.ndjson');

// ── Per-step retry config ─────────────────────────────────────────────────────

const STEP_RETRY = {
  generateScript:   { attempts: 3, delay: 2000 },
  generateVoice:    { attempts: 3, delay: 3000 },
  generateCaptions: { attempts: 2, delay: 2000 },
  createVideo:      { attempts: 2, delay: 5000 },
  uploadVideo:      { attempts: 3, delay: 8000 },
  default:          { attempts: 1, delay: 1000 },
};

// ── WorkflowManager ───────────────────────────────────────────────────────────

class WorkflowManager extends EventEmitter {
  constructor() {
    super();
    this._activeRuns = new Map();
  }

  /**
   * Run the full workflow for one Short.
   *
   * @param {object}   [opts]
   * @param {string}   [opts.niche]
   * @param {string}   [opts.jobId]
   * @param {string[]} [opts.skipSteps]
   * @param {string}   [opts.scheduledFor]  — ISO datetime for scheduled YouTube publish
   * @returns {Promise<WorkflowResult>}
   */
  async run({ niche, jobId, skipSteps = [], scheduledFor = null } = {}) {
    const id        = jobId ?? uuidv4().split('-')[0];
    const startedAt = new Date().toISOString();
    const startMs   = Date.now();

    const ctx = {
      jobId:        id,
      niche:        niche ?? config.pipeline.topicCategory,
      startedAt,
      scheduledFor, // passed to stepUploadVideo via context
    };

    this._activeRuns.set(id, ctx);
    ensureWorkDirs();

    const log = (level, msg, meta = {}) =>
      logger[level](msg, { jobId: id, niche: ctx.niche, ...meta });

    log('info', `Workflow started`);
    this.emit('started', { jobId: id, niche: ctx.niche, startedAt });

    const completedSteps = [];
    const failedSteps    = [];
    let   abortError     = null;

    try {
      for (const stepDef of WORKFLOW_STEPS) {
        if (skipSteps.includes(stepDef.name)) {
          log('info', `Step skipped: ${stepDef.name}`);
          continue;
        }

        const retryOpts = STEP_RETRY[stepDef.name] ?? STEP_RETRY.default;
        let   stepError = null;

        for (let attempt = 1; attempt <= retryOpts.attempts; attempt++) {
          try {
            if (attempt > 1) {
              const waitMs = retryOpts.delay * 2 ** (attempt - 2);
              log('info', `Step retry: ${stepDef.name} (${attempt}/${retryOpts.attempts}) in ${waitMs}ms`);
              await sleep(waitMs);
            }
            await stepDef.fn(ctx);
            stepError = null;
            break;
          } catch (err) {
            stepError = err;
            if (attempt < retryOpts.attempts) {
              log('warn', `Step attempt ${attempt} failed: ${stepDef.name} — ${err.message}`);
            }
          }
        }

        if (stepError) {
          failedSteps.push(stepDef.name);
          this.emit('stepFailed', { jobId: id, step: stepDef.name, error: stepError });

          if (stepDef.fatal) {
            abortError = stepError;
            log('error', `Fatal step failed: ${stepDef.name} — ${stepError.message}`);
            break;
          } else {
            log('warn', `Non-fatal step failed: ${stepDef.name} — continuing`);
          }
        } else {
          completedSteps.push(stepDef.name);
          this.emit('stepCompleted', { jobId: id, step: stepDef.name });
        }
      }
    } finally {
      this._activeRuns.delete(id);
    }

    const completedAt = new Date().toISOString();
    const durationMs  = Date.now() - startMs;
    const success     = !abortError;

    /** @type {WorkflowResult} */
    const result = {
      jobId:          id,
      success,
      niche:          ctx.niche,
      videoUrl:       ctx.videoUrl      ?? null,
      videoId:        ctx.videoId       ?? null,
      title:          ctx.script?.title ?? null,
      scheduledFor:   ctx.scheduledFor  ?? null,
      startedAt,
      completedAt,
      durationMs,
      completedSteps,
      failedSteps,
      errorMessage:   abortError?.message ?? null,
    };

    this._persistRun(result);

    if (success) {
      log('info', `Workflow complete in ${(durationMs / 1000).toFixed(1)}s — ${result.videoUrl}`);
      this.emit('completed', result);
    } else {
      log('error', `Workflow failed — ${abortError?.message}`);

      try {
        await sendErrorNotification({
          jobId: id,
          error: abortError,
          step:  failedSteps[failedSteps.length - 1] ?? 'unknown',
        });
      } catch (notifyErr) {
        log('warn', `Error notification failed: ${notifyErr.message}`);
      }

      this.emit('failed', result, abortError);
    }

    return result;
  }

  /**
   * Run N workflows sequentially with a gap between each.
   * Validates count and sends a daily summary on completion.
   *
   * @param {number} count
   * @param {object} [opts]
   * @returns {Promise<WorkflowResult[]>}
   */
  async runBatch(count, opts = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw new RangeError(`[workflowManager] runBatch count must be 1–20, got ${count}`);
    }

    logger.info(`[workflowManager] Starting batch of ${count} workflow(s)`);
    const results = [];

    for (let i = 0; i < count; i++) {
      if (i > 0) {
        logger.info(`[workflowManager] Waiting 5 min before run ${i + 1}/${count}...`);
        await sleep(5 * 60 * 1000);
      }
      results.push(await this.run(opts));
    }

    try {
      await sendDailySummary({
        date:         new Date().toISOString().slice(0, 10),
        totalUploads: results.length,
        successCount: results.filter((r) => r.success).length,
        failureCount: results.filter((r) => !r.success).length,
        uploads:      results.map((r) => ({
          title:    r.title    ?? 'Unknown',
          videoUrl: r.videoUrl ?? null,
          niche:    r.niche,
        })),
      });
    } catch (err) {
      logger.warn(`[workflowManager] Daily summary failed: ${err.message}`);
    }

    return results;
  }

  /** Return currently active run contexts (safe copy). */
  getActiveRuns() {
    return [...this._activeRuns.entries()].map(([id, ctx]) => ({
      jobId:     id,
      niche:     ctx.niche,
      startedAt: ctx.startedAt,
    }));
  }

  /**
   * Return recent workflow run history (bounded, no full-file read).
   * @param {number} [n=20]
   * @returns {WorkflowResult[]}
   */
  getHistory(n = 20) {
    return readNdjsonTail(RUNS_FILE, n);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _persistRun(result) {
    try {
      safeAppendNdjson(RUNS_FILE, result);
    } catch (err) {
      logger.error(`[workflowManager] Failed to persist run ${result.jobId}: ${err.message}`);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const workflowManager = new WorkflowManager();
module.exports = { WorkflowManager, workflowManager };
