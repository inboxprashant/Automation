/**
 * Retry Tracker
 *
 * Fixes over v1:
 *   • Uses safeReadJson / safeWriteJson helpers
 *   • Dead-letter list capped at 100 entries
 *   • _check() is idempotent — safe to call concurrently
 *   • registerFailure validates result shape before storing
 *   • Structured log metadata on every entry
 */

'use strict';

const path   = require('path');
const logger = require('../utils/logger');
const { safeReadJson, safeWriteJson, PROJECT_ROOT } = require('../utils/fs');

const STATE_FILE           = path.join(PROJECT_ROOT, 'project', 'logs', 'retry_state.json');
const MAX_RETRIES          = 3;
const BASE_DELAY_MS        = 5 * 60 * 1000;   // 5 min
const RETRY_CHECK_INTERVAL = 60 * 1000;        // 60 s
const MAX_DEAD_LETTER      = 100;

function loadState() {
  return safeReadJson(STATE_FILE, { pending: [], deadLetter: [] });
}

function saveState(state) {
  // Cap dead-letter to prevent unbounded growth
  if (state.deadLetter.length > MAX_DEAD_LETTER) {
    state.deadLetter = state.deadLetter.slice(-MAX_DEAD_LETTER);
  }
  safeWriteJson(STATE_FILE, state);
}

class RetryTracker {
  constructor() {
    this._state   = loadState();
    this._timer   = null;
    this._enqueue = null;
    this._running = false;   // prevent concurrent _check() calls
  }

  setEnqueueFn(fn) {
    this._enqueue = fn;
  }

  /**
   * Register a failed workflow for retry.
   * @param {object} result — WorkflowResult
   */
  registerFailure(result) {
    if (!result?.jobId || !result?.niche) {
      logger.warn('[retryTracker] registerFailure: invalid result shape');
      return;
    }

    if (this._state.pending.some((r) => r.jobId === result.jobId)) return;

    const entry = {
      jobId:        result.jobId,
      niche:        result.niche,
      errorMessage: result.errorMessage?.slice(0, 200) ?? 'unknown',
      failedAt:     new Date().toISOString(),
      attempts:     0,
      nextRetryAt:  new Date(Date.now() + BASE_DELAY_MS).toISOString(),
    };

    this._state.pending.push(entry);
    saveState(this._state);
    logger.info(`[retryTracker] Registered: ${result.jobId} (retry in 5 min)`, {
      jobId: result.jobId,
      niche: result.niche,
    });
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._check(), RETRY_CHECK_INTERVAL);
    logger.info('[retryTracker] Started');
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _check() {
    if (this._running) return;
    this._running = true;

    try {
      const now   = Date.now();
      const ready = this._state.pending.filter(
        (r) => new Date(r.nextRetryAt).getTime() <= now
      );

      if (ready.length === 0) return;

      logger.info(`[retryTracker] ${ready.length} job(s) ready for retry`);

      for (const entry of ready) {
        entry.attempts++;

        if (entry.attempts > MAX_RETRIES) {
          this._state.pending    = this._state.pending.filter((r) => r.jobId !== entry.jobId);
          this._state.deadLetter.push({ ...entry, deadAt: new Date().toISOString() });
          logger.error(`[retryTracker] Dead-letter: ${entry.jobId} (exceeded ${MAX_RETRIES} retries)`, {
            jobId: entry.jobId,
          });
          continue;
        }

        const nextDelay       = BASE_DELAY_MS * 2 ** (entry.attempts - 1);
        entry.nextRetryAt     = new Date(Date.now() + nextDelay).toISOString();

        logger.info(`[retryTracker] Retrying ${entry.jobId} (attempt ${entry.attempts}/${MAX_RETRIES})`, {
          jobId: entry.jobId,
          niche: entry.niche,
        });

        if (this._enqueue) {
          this._enqueue({ niche: entry.niche, jobId: entry.jobId });
        } else {
          logger.warn('[retryTracker] No enqueue function — cannot retry');
        }
      }

      saveState(this._state);
    } finally {
      this._running = false;
    }
  }

  markResolved(jobId) {
    const before = this._state.pending.length;
    this._state.pending = this._state.pending.filter((r) => r.jobId !== jobId);
    if (this._state.pending.length < before) {
      saveState(this._state);
      logger.info(`[retryTracker] Resolved: ${jobId}`);
    }
  }

  getStatus() {
    return {
      pending:    this._state.pending.length,
      deadLetter: this._state.deadLetter.length,
      jobs:       this._state.pending.map((r) => ({
        jobId:       r.jobId,
        niche:       r.niche,
        attempts:    r.attempts,
        nextRetryAt: r.nextRetryAt,
        error:       r.errorMessage?.slice(0, 80),
      })),
    };
  }

  getDeadLetter() { return this._state.deadLetter; }

  requeueDeadLetter(jobId) {
    const idx = this._state.deadLetter.findIndex((r) => r.jobId === jobId);
    if (idx === -1) return false;
    const [entry] = this._state.deadLetter.splice(idx, 1);
    entry.attempts    = 0;
    entry.nextRetryAt = new Date(Date.now() + 1000).toISOString();
    this._state.pending.push(entry);
    saveState(this._state);
    logger.info(`[retryTracker] Re-queued dead-letter: ${jobId}`);
    return true;
  }
}

const retryTracker = new RetryTracker();
module.exports = { RetryTracker, retryTracker, MAX_RETRIES };
