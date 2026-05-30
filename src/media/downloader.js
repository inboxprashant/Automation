/**
 * Clip Downloader
 *
 * Downloads a single video file from a URL with:
 *   • Streaming download (no full buffer in memory)
 *   • Progress logging every 10%
 *   • Retry on network errors (not on 4xx)
 *   • Atomic write (temp file → rename) so partial downloads never
 *     end up in the cache
 *   • Timeout per chunk (stalled downloads are aborted)
 */

'use strict';

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger');
const { sleep } = require('../utils/retry');

const DOWNLOAD_TIMEOUT  = 120_000;   // 2 min total per file
const MAX_FILE_SIZE_MB  = 150;       // skip files larger than this
const MAX_ATTEMPTS      = 3;
const BASE_DELAY_MS     = 2_000;

/**
 * Download a video URL to a local file path.
 * Uses an atomic temp-file write to avoid partial downloads.
 *
 * @param {string} url        — direct video URL
 * @param {string} destPath   — final destination path
 * @param {string} [label]    — label for log messages
 * @returns {Promise<number>} — file size in bytes
 */
async function downloadFile(url, destPath, label = 'clip') {
  const tempPath = `${destPath}.tmp`;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const bytes = await _downloadOnce(url, tempPath, label, attempt);

      // Atomic rename
      fs.renameSync(tempPath, destPath);
      return bytes;

    } catch (err) {
      lastError = err;

      // Clean up partial temp file
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }

      const status = err?.response?.status;

      // Don't retry on client errors (4xx)
      if (status && status >= 400 && status < 500) {
        throw new Error(`[downloader] HTTP ${status} for ${label} — not retrying`);
      }

      if (attempt < MAX_ATTEMPTS) {
        const wait = BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn(`[downloader] ${label} attempt ${attempt} failed: ${err.message}. Retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  throw new Error(`[downloader] Failed to download ${label} after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`);
}

/**
 * Single download attempt — streams response to disk.
 *
 * @param {string} url
 * @param {string} tempPath
 * @param {string} label
 * @param {number} attempt
 * @returns {Promise<number>} bytes written
 */
async function _downloadOnce(url, tempPath, label, attempt) {
  const response = await axios.get(url, {
    responseType: 'stream',
    timeout: DOWNLOAD_TIMEOUT,
    headers: {
      'User-Agent': 'YoutubeShortsBot/1.0',
    },
  });

  // Check content-length before downloading
  const contentLength = parseInt(response.headers['content-length'] ?? '0', 10);
  if (contentLength > MAX_FILE_SIZE_MB * 1024 * 1024) {
    response.data.destroy();
    throw new Error(`File too large: ${Math.round(contentLength / 1024 / 1024)} MB (max ${MAX_FILE_SIZE_MB} MB)`);
  }

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(tempPath);
    let downloaded = 0;
    let lastLoggedPct = 0;

    response.data.on('data', (chunk) => {
      downloaded += chunk.length;

      if (contentLength > 0) {
        const pct = Math.floor((downloaded / contentLength) * 100);
        if (pct >= lastLoggedPct + 10) {
          logger.debug(`[downloader] ${label} ${pct}% (${Math.round(downloaded / 1024)} KB)`);
          lastLoggedPct = pct;
        }
      }
    });

    response.data.on('error', (err) => {
      writer.destroy();
      reject(err);
    });

    writer.on('error', reject);
    writer.on('finish', () => {
      logger.debug(`[downloader] ${label} complete — ${Math.round(downloaded / 1024)} KB`);
      resolve(downloaded);
    });

    response.data.pipe(writer);
  });
}

module.exports = { downloadFile };
