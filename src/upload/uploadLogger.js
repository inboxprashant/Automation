/**
 * Upload Logger
 *
 * Writes structured upload logs to project/logs/uploads.json (NDJSON)
 * and maintains a summary index at project/logs/upload_index.json.
 *
 * Every upload attempt — success or failure — is recorded with:
 *   jobId, videoId, title, status, timestamps, error details,
 *   file sizes, retry count, and the full YouTube URL.
 *
 * The NDJSON format (one JSON object per line) means the log file
 * can be tailed, grepped, and parsed without loading the whole file.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const LOGS_DIR    = path.resolve(__dirname, '..', '..', 'project', 'logs');
const NDJSON_FILE = path.join(LOGS_DIR, 'uploads.ndjson');
const INDEX_FILE  = path.join(LOGS_DIR, 'upload_index.json');

function ensureDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ── Index I/O ────────────────────────────────────────────────────────────────

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return []; }
}

function saveIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} UploadLogEntry
 * @property {string}      jobId
 * @property {string|null} videoId
 * @property {string}      title
 * @property {string}      niche
 * @property {'success'|'failure'|'scheduled'} status
 * @property {string}      startedAt       — ISO timestamp
 * @property {string|null} completedAt     — ISO timestamp
 * @property {number}      durationMs
 * @property {number}      retryCount
 * @property {string|null} videoUrl
 * @property {string|null} thumbnailSet    — 'yes' | 'no' | 'skipped'
 * @property {string|null} scheduledFor    — ISO timestamp (if scheduled)
 * @property {string|null} privacyStatus
 * @property {number|null} fileSizeKb
 * @property {string|null} errorMessage
 * @property {string|null} errorCode
 */

/**
 * Write a log entry to the NDJSON file and update the index.
 *
 * @param {UploadLogEntry} entry
 */
function writeLog(entry) {
  const { safeAppendNdjson, safeReadJson, safeWriteJson, ensureDir } = require('../utils/fs');
  ensureDir(LOGS_DIR);

  safeAppendNdjson(NDJSON_FILE, entry);

  // Update summary index
  const index    = safeReadJson(INDEX_FILE, []);
  const existing = index.findIndex((e) => e.jobId === entry.jobId);
  const summary  = {
    jobId:        entry.jobId,
    videoId:      entry.videoId,
    title:        entry.title,
    status:       entry.status,
    videoUrl:     entry.videoUrl,
    completedAt:  entry.completedAt,
    retryCount:   entry.retryCount,
    errorMessage: entry.errorMessage ?? null,
  };

  if (existing >= 0) index[existing] = summary;
  else index.unshift(summary);

  safeWriteJson(INDEX_FILE, index);
  logger.debug(`[uploadLogger] Logged: ${entry.jobId} → ${entry.status}`);
}

/**
 * Log a successful upload.
 * @param {object} data
 */
function logSuccess(data) {
  writeLog({
    jobId:         data.jobId,
    videoId:       data.videoId,
    title:         data.title,
    niche:         data.niche         ?? 'general',
    status:        'success',
    startedAt:     data.startedAt,
    completedAt:   new Date().toISOString(),
    durationMs:    data.durationMs    ?? 0,
    retryCount:    data.retryCount    ?? 0,
    videoUrl:      data.videoUrl,
    thumbnailSet:  data.thumbnailSet  ?? 'skipped',
    scheduledFor:  data.scheduledFor  ?? null,
    privacyStatus: data.privacyStatus ?? 'public',
    fileSizeKb:    data.fileSizeKb    ?? null,
    errorMessage:  null,
    errorCode:     null,
  });
}

/**
 * Log a failed upload attempt.
 * @param {object} data
 */
function logFailure(data) {
  writeLog({
    jobId:         data.jobId,
    videoId:       null,
    title:         data.title         ?? 'Unknown',
    niche:         data.niche         ?? 'general',
    status:        'failure',
    startedAt:     data.startedAt,
    completedAt:   new Date().toISOString(),
    durationMs:    data.durationMs    ?? 0,
    retryCount:    data.retryCount    ?? 0,
    videoUrl:      null,
    thumbnailSet:  'skipped',
    scheduledFor:  data.scheduledFor  ?? null,
    privacyStatus: data.privacyStatus ?? 'public',
    fileSizeKb:    data.fileSizeKb    ?? null,
    errorMessage:  data.error?.message ?? String(data.error),
    errorCode:     data.errorCode     ?? null,
  });
}

/**
 * Return the upload index (summary of all uploads).
 * @returns {Array<object>}
 */
function listUploads() {
  return loadIndex();
}

/**
 * Return the last N upload log entries from the NDJSON file.
 * @param {number} [n=20]
 * @returns {UploadLogEntry[]}
 */
function getRecentLogs(n = 20) {
  if (!fs.existsSync(NDJSON_FILE)) return [];
  const lines = fs.readFileSync(NDJSON_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .slice(-n);
  return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

module.exports = { logSuccess, logFailure, listUploads, getRecentLogs, LOGS_DIR };
