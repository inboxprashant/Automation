/**
 * Upload Progress Tracker
 *
 * Wraps a readable stream to track upload progress and emit
 * periodic log messages. The YouTube API client accepts a stream
 * as the media body — we intercept the 'data' events to count bytes.
 *
 * Also provides a helper to format bytes/s into a human-readable rate.
 */

'use strict';

const { PassThrough } = require('stream');
const logger = require('../utils/logger');

/**
 * Wrap a readable stream with progress tracking.
 * Logs progress every `logIntervalPct` percent.
 *
 * @param {import('fs').ReadStream} source   — the file read stream
 * @param {number}                  totalBytes
 * @param {string}                  label    — for log messages
 * @param {number}                  [logIntervalPct=10]
 * @returns {{ stream: PassThrough, getProgress: () => ProgressSnapshot }}
 *
 * @typedef {object} ProgressSnapshot
 * @property {number} bytesUploaded
 * @property {number} totalBytes
 * @property {number} percent
 * @property {number} elapsedMs
 * @property {number} bytesPerSec
 */
function createProgressStream(source, totalBytes, label, logIntervalPct = 10) {
  const pass      = new PassThrough();
  const startTime = Date.now();
  let uploaded    = 0;
  let lastLogPct  = 0;

  source.on('data', (chunk) => {
    uploaded += chunk.length;

    if (totalBytes > 0) {
      const pct = Math.floor((uploaded / totalBytes) * 100);
      if (pct >= lastLogPct + logIntervalPct) {
        const elapsed    = Date.now() - startTime;
        const bps        = elapsed > 0 ? Math.round((uploaded / elapsed) * 1000) : 0;
        const remaining  = totalBytes - uploaded;
        const etaSec     = bps > 0 ? Math.round(remaining / bps) : '?';

        logger.info(
          `[uploadProgress] ${label} — ${pct}% ` +
          `(${_humanBytes(uploaded)} / ${_humanBytes(totalBytes)}) ` +
          `@ ${_humanBytes(bps)}/s  ETA: ${etaSec}s`
        );
        lastLogPct = pct;
      }
    }
  });

  source.on('end', () => {
    const elapsed = Date.now() - startTime;
    const bps     = elapsed > 0 ? Math.round((uploaded / elapsed) * 1000) : 0;
    logger.info(
      `[uploadProgress] ${label} — 100% complete ` +
      `(${_humanBytes(uploaded)}) in ${(elapsed / 1000).toFixed(1)}s ` +
      `@ ${_humanBytes(bps)}/s`
    );
  });

  source.pipe(pass);

  const getProgress = () => {
    const elapsed = Date.now() - startTime;
    const bps     = elapsed > 0 ? Math.round((uploaded / elapsed) * 1000) : 0;
    return {
      bytesUploaded: uploaded,
      totalBytes,
      percent:       totalBytes > 0 ? Math.round((uploaded / totalBytes) * 100) : 0,
      elapsedMs:     elapsed,
      bytesPerSec:   bps,
    };
  };

  return { stream: pass, getProgress };
}

function _humanBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

module.exports = { createProgressStream };
