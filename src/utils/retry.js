/**
 * Retry utility — exponential backoff with jitter and max-delay cap.
 *
 * Improvements over v1:
 *   • Jitter (±20%) prevents thundering-herd when multiple jobs retry simultaneously
 *   • MAX_DELAY_MS cap prevents absurdly long waits
 *   • Preserves original error cause chain via Error.cause
 *   • Logs attempt number, label, and truncated message at warn level
 *   • Logs final failure at error level with full context
 */

'use strict';

const logger = require('./logger');

const MAX_DELAY_MS = 60_000;   // never wait more than 60 s between retries
const JITTER_RATIO = 0.2;      // ±20% random jitter

/**
 * Run `fn` up to `attempts` times with exponential backoff + jitter.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object}  [opts]
 * @param {number}  [opts.attempts=3]
 * @param {number}  [opts.delay=1000]   — base delay in ms
 * @param {string}  [opts.label='operation']
 * @returns {Promise<T>}
 */
async function retry(fn, { attempts = 3, delay = 1000, label = 'operation' } = {}) {
  let lastError;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (i < attempts) {
        const base    = Math.min(delay * 2 ** (i - 1), MAX_DELAY_MS);
        const jitter  = base * JITTER_RATIO * (Math.random() * 2 - 1);
        const waitMs  = Math.max(0, Math.round(base + jitter));

        logger.warn(
          `[retry] "${label}" attempt ${i}/${attempts} failed — ` +
          `retrying in ${waitMs}ms. Error: ${err.message}`
        );
        await sleep(waitMs);
      } else {
        logger.error(
          `[retry] "${label}" failed after ${attempts} attempt(s): ${err.message}`
        );
      }
    }
  }

  // Preserve cause chain
  const wrapped = new Error(
    `[retry] "${label}" failed after ${attempts} attempt(s): ${lastError?.message}`
  );
  wrapped.cause = lastError;
  throw wrapped;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { retry, sleep };
