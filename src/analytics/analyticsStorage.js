/**
 * Analytics Storage
 *
 * Fixes over v1:
 *   • Uses shared safeReadJson / safeWriteJson / safeAppendNdjson / readNdjsonTail
 *   • loadLatestSnapshot uses readNdjsonTail(1) — no full-file read
 *   • loadSnapshots bounded to last 90 entries (prevents OOM on large histories)
 *   • Paths resolved from PROJECT_ROOT
 *   • saveReport wraps write in try/catch and returns null on failure
 *   • loadReport wraps JSON.parse in try/catch
 */

'use strict';

const path   = require('path');
const logger = require('../utils/logger');
const {
  ensureDir,
  safeReadJson,
  safeWriteJson,
  safeAppendNdjson,
  readNdjsonTail,
  PROJECT_ROOT,
} = require('../utils/fs');

const ANALYTICS_DIR = path.join(PROJECT_ROOT, 'project', 'analytics');
const SNAPSHOTS_DIR = path.join(ANALYTICS_DIR, 'snapshots');
const REPORTS_DIR   = path.join(ANALYTICS_DIR, 'reports');
const INDEX_FILE    = path.join(ANALYTICS_DIR, 'index.json');
const MAX_SNAPSHOTS = 90;   // per video — ~3 months of daily snapshots

function ensureDirs() {
  [ANALYTICS_DIR, SNAPSHOTS_DIR, REPORTS_DIR].forEach(ensureDir);
}

// ── Index ─────────────────────────────────────────────────────────────────────

function loadIndex() {
  return safeReadJson(INDEX_FILE, []);
}

function saveIndex(index) {
  ensureDirs();
  safeWriteJson(INDEX_FILE, index);
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

/**
 * Append a metric snapshot (bounded NDJSON per video).
 * @param {object} metrics
 */
function saveSnapshot(metrics) {
  ensureDirs();
  const file = path.join(SNAPSHOTS_DIR, `${metrics.videoId}.ndjson`);
  safeAppendNdjson(file, metrics);
}

/**
 * Load up to MAX_SNAPSHOTS recent snapshots for a video.
 * @param {string} videoId
 * @returns {object[]}
 */
function loadSnapshots(videoId) {
  const file = path.join(SNAPSHOTS_DIR, `${videoId}.ndjson`);
  return readNdjsonTail(file, MAX_SNAPSHOTS);
}

/**
 * Load only the most recent snapshot (efficient — reads tail only).
 * @param {string} videoId
 * @returns {object|null}
 */
function loadLatestSnapshot(videoId) {
  const snaps = readNdjsonTail(path.join(SNAPSHOTS_DIR, `${videoId}.ndjson`), 1);
  return snaps.length > 0 ? snaps[0] : null;
}

// ── Reports ───────────────────────────────────────────────────────────────────

/**
 * Save a daily analytics report.
 * @param {object} report
 * @returns {string|null} file path, or null on failure
 */
function saveReport(report) {
  ensureDirs();
  const file = path.join(REPORTS_DIR, `${report.date}.json`);
  try {
    safeWriteJson(file, report);
    logger.info(`[analyticsStorage] Report saved: ${path.relative(PROJECT_ROOT, file)}`);
    return file;
  } catch (err) {
    logger.error(`[analyticsStorage] Failed to save report: ${err.message}`);
    return null;
  }
}

/**
 * Load a report by date (defaults to today).
 * @param {string} [date]
 * @returns {object|null}
 */
function loadReport(date) {
  const target = date ?? new Date().toISOString().slice(0, 10);
  return safeReadJson(path.join(REPORTS_DIR, `${target}.json`), null);
}

/**
 * List all available report dates, newest first.
 * @returns {string[]}
 */
function listReportDates() {
  ensureDirs();
  try {
    return require('fs').readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort()
      .reverse();
  } catch { return []; }
}

// ── Index management ──────────────────────────────────────────────────────────

/**
 * Update the master index with the latest metrics and performance tier.
 * @param {object} metrics
 * @param {object} [performance]
 */
function updateIndex(metrics, performance = null) {
  ensureDirs();
  const index    = loadIndex();
  const existing = index.findIndex((e) => e.videoId === metrics.videoId);

  const entry = {
    videoId:         metrics.videoId,
    title:           metrics.title,
    niche:           metrics.niche ?? 'general',
    publishedAt:     metrics.publishedAt,
    firstTrackedAt:  existing >= 0 ? index[existing].firstTrackedAt : metrics.collectedAt,
    lastTrackedAt:   metrics.collectedAt,
    snapshotCount:   existing >= 0 ? (index[existing].snapshotCount ?? 0) + 1 : 1,
    latestViews:     metrics.views,
    latestCtr:       metrics.ctr,
    latestRetention: metrics.avgViewPercentage,
    latestTier:      performance?.tier ?? null,
  };

  if (existing >= 0) index[existing] = entry;
  else index.unshift(entry);

  saveIndex(index);
}

function listTrackedVideos() { return loadIndex(); }
function getTrackedVideoIds() { return loadIndex().map((e) => e.videoId); }

module.exports = {
  saveSnapshot,
  loadSnapshots,
  loadLatestSnapshot,
  saveReport,
  loadReport,
  listReportDates,
  updateIndex,
  listTrackedVideos,
  getTrackedVideoIds,
  ANALYTICS_DIR,
};
