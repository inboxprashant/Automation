/**
 * ElevenLabs rate limiter.
 *
 * ElevenLabs enforces two limits that matter for this system:
 *   • Concurrent requests  — max 2 simultaneous TTS calls (Starter plan)
 *   • Per-minute requests  — ~10 req/min on free, ~30 req/min on Starter
 *
 * This module provides:
 *   1. A concurrency gate (semaphore) — queues calls beyond the limit
 *   2. A per-minute token bucket — adds a delay when the bucket is empty
 *   3. Retry-after parsing — reads the Retry-After header from 429 responses
 *      and waits exactly that long before the next attempt
 *
 * Usage:
 *   const limiter = require('./rateLimiter');
 *   await limiter.acquire();
 *   try { ... } finally { limiter.release(); }
 */

'use strict';

const logger = require('../utils/logger');
const { sleep } = require('../utils/retry');

// ── Configuration ────────────────────────────────────────────────────────────
const MAX_CONCURRENT   = 2;    // simultaneous TTS requests
const REQUESTS_PER_MIN = 20;   // conservative — well under Starter limit
const MIN_INTERVAL_MS  = Math.ceil(60_000 / REQUESTS_PER_MIN); // 3 000 ms

// ── State ────────────────────────────────────────────────────────────────────
let _active    = 0;
let _lastCall  = 0;
const _queue   = [];           // resolve callbacks waiting for a slot

// ── Semaphore ────────────────────────────────────────────────────────────────

/**
 * Acquire a slot. Resolves when a concurrent slot is available.
 * @returns {Promise<void>}
 */
function acquire() {
  return new Promise((resolve) => {
    if (_active < MAX_CONCURRENT) {
      _active++;
      resolve();
    } else {
      _queue.push(resolve);
    }
  });
}

/**
 * Release a slot and wake the next waiter if any.
 */
function release() {
  _active = Math.max(0, _active - 1);
  if (_queue.length > 0 && _active < MAX_CONCURRENT) {
    _active++;
    const next = _queue.shift();
    next();
  }
}

// ── Token bucket (min interval) ──────────────────────────────────────────────

/**
 * Wait until the minimum inter-request interval has elapsed.
 * @returns {Promise<void>}
 */
async function throttle() {
  const now = Date.now();
  const elapsed = now - _lastCall;
  if (elapsed < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - elapsed;
    logger.debug(`[rateLimiter] Throttling — waiting ${wait}ms`);
    await sleep(wait);
  }
  _lastCall = Date.now();
}

// ── 429 handler ──────────────────────────────────────────────────────────────

/**
 * Parse a Retry-After value from an Axios error response.
 * Returns milliseconds to wait, or a default if the header is absent.
 *
 * @param {Error} err — Axios error
 * @param {number} [defaultMs=30_000]
 * @returns {number}
 */
function parseRetryAfter(err, defaultMs = 30_000) {
  const header = err?.response?.headers?.['retry-after'];
  if (!header) return defaultMs;

  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds)) return seconds * 1000;

  // RFC 7231 HTTP-date format
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return defaultMs;
}

/**
 * Check whether an Axios error is a rate-limit (429) response.
 * @param {Error} err
 * @returns {boolean}
 */
function isRateLimitError(err) {
  return err?.response?.status === 429;
}

/**
 * Check whether an Axios error is a server error worth retrying (5xx).
 * @param {Error} err
 * @returns {boolean}
 */
function isRetryableServerError(err) {
  const status = err?.response?.status;
  return status >= 500 && status < 600;
}

// ── Stats (for logging) ──────────────────────────────────────────────────────

function stats() {
  return { active: _active, queued: _queue.length };
}

module.exports = {
  acquire,
  release,
  throttle,
  parseRetryAfter,
  isRateLimitError,
  isRetryableServerError,
  stats,
  MIN_INTERVAL_MS,
  MAX_CONCURRENT,
};
