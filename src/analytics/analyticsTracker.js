/**
 * Analytics Tracker — main orchestrator.
 *
 * Ties together: collector → detector → suggestions → storage
 *
 * Flow:
 *   1. Load all tracked video IDs (from index + upload logs)
 *   2. Collect fresh metrics from YouTube APIs
 *   3. Save metric snapshots (time-series)
 *   4. Load previous snapshots for trending detection
 *   5. Run performance analysis
 *   6. Generate optimisation suggestions
 *   7. Save daily report to project/analytics/reports/
 *   8. Update the master index
 *   9. Return the full report
 *
 * Exported API:
 *   trackAll(opts?)          → Promise<AnalyticsReport>
 *   trackVideo(videoId)      → Promise<VideoMetrics>
 *   addVideoToTracking(id, meta) → void
 *   getReport(date?)         → AnalyticsReport|null
 */

'use strict';

const logger = require('../utils/logger');
const { collectMetrics }     = require('./analyticsCollector');
const { analysePerformance } = require('./performanceDetector');
const { generateSuggestions }= require('./suggestionEngine');
const {
  saveSnapshot,
  loadLatestSnapshot,
  saveReport,
  loadReport,
  updateIndex,
  listTrackedVideos,
  getTrackedVideoIds,
} = require('./analyticsStorage');

// ── Video registry helpers ────────────────────────────────────────────────────

/**
 * Get all video IDs to track.
 * Merges: analytics index + upload log index.
 *
 * @returns {string[]}
 */
function getAllTrackedIds() {
  const fromIndex = getTrackedVideoIds();

  // Also pull from upload log if available
  let fromUploads = [];
  try {
    const { listUploads } = require('../upload/uploadLogger');
    fromUploads = listUploads()
      .filter((u) => u.videoId && u.status === 'success')
      .map((u) => u.videoId);
  } catch { /* upload logger may not exist in all environments */ }

  return [...new Set([...fromIndex, ...fromUploads])];
}

// ── Main tracker ──────────────────────────────────────────────────────────────

/**
 * Run a full analytics collection and analysis cycle.
 *
 * @param {object} [opts]
 * @param {number}   [opts.lookbackDays=90]  — Analytics API date range
 * @param {string[]} [opts.videoIds]         — override tracked IDs
 * @returns {Promise<import('./analyticsStorage').AnalyticsReport>}
 */
async function trackAll({ lookbackDays = 90, videoIds } = {}) {
  const ids = videoIds ?? getAllTrackedIds();

  if (ids.length === 0) {
    logger.warn('[analyticsTracker] No videos to track. Upload some videos first.');
    return _emptyReport();
  }

  logger.info(`[analyticsTracker] Tracking ${ids.length} video(s)`);
  const startMs = Date.now();

  // ── 1. Collect fresh metrics ───────────────────────────────────────────────
  const metrics = await collectMetrics(ids, { lookbackDays });

  if (metrics.length === 0) {
    logger.warn('[analyticsTracker] No metrics returned from API');
    return _emptyReport();
  }

  // ── 2. Save snapshots + load previous for trending ─────────────────────────
  const previousMetrics = [];
  for (const m of metrics) {
    const prev = loadLatestSnapshot(m.videoId);
    if (prev) previousMetrics.push(prev);
    saveSnapshot(m);
  }

  // ── 3. Performance analysis ────────────────────────────────────────────────
  const analysis = analysePerformance(metrics, previousMetrics);

  // ── 4. Suggestions ─────────────────────────────────────────────────────────
  const suggestions = generateSuggestions(analysis, metrics);

  // ── 5. Update index ────────────────────────────────────────────────────────
  const perfMap = new Map(analysis.results.map((r) => [r.videoId, r]));
  for (const m of metrics) {
    updateIndex(m, perfMap.get(m.videoId));
  }

  // ── 6. Build and save report ───────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10);

  /** @type {import('./analyticsStorage').AnalyticsReport} */
  const report = {
    date,
    generatedAt:    new Date().toISOString(),
    videosAnalysed: metrics.length,
    channelAvg:     analysis.channelAvg,
    results:        analysis.results,
    highPerformers: analysis.highPerformers.map((r) => ({
      videoId: r.videoId, title: r.title, score: r.score, strengths: r.strengths,
    })),
    lowPerformers:  analysis.lowPerformers.map((r) => ({
      videoId: r.videoId, title: r.title, score: r.score, weaknesses: r.weaknesses,
    })),
    trending:       analysis.trending,
    bestNiche:      analysis.bestNiche,
    suggestions,
  };

  saveReport(report);

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  logger.info(`[analyticsTracker] ✅ Report complete in ${elapsed}s`);
  logger.info(`[analyticsTracker] High performers: ${analysis.highPerformers.length} | Low: ${analysis.lowPerformers.length} | Suggestions: ${suggestions.length}`);

  return report;
}

/**
 * Track a single video and return its metrics.
 *
 * @param {string} videoId
 * @returns {Promise<import('./analyticsCollector').VideoMetrics>}
 */
async function trackVideo(videoId) {
  const [metrics] = await collectMetrics([videoId]);
  if (!metrics) throw new Error(`No metrics returned for video ${videoId}`);
  const prev = loadLatestSnapshot(videoId);
  saveSnapshot(metrics);
  updateIndex(metrics);
  return metrics;
}

/**
 * Manually add a video ID to the tracking index.
 *
 * @param {string} videoId
 * @param {object} [meta]  — { title, niche, publishedAt }
 */
function addVideoToTracking(videoId, meta = {}) {
  updateIndex({
    videoId,
    title:       meta.title       ?? 'Unknown',
    niche:       meta.niche       ?? 'general',
    publishedAt: meta.publishedAt ?? new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    views: 0, likes: 0, comments: 0,
    likeRate: 0, commentRate: 0,
    watchTimeMinutes: null, avgViewDurationSec: null,
    avgViewPercentage: null, impressions: null,
    ctr: null, subscribersGained: null,
    dataSource: 'manual',
  });
  logger.info(`[analyticsTracker] Added to tracking: ${videoId}`);
}

/**
 * Load the most recent report (or a specific date).
 * @param {string} [date]
 * @returns {import('./analyticsStorage').AnalyticsReport|null}
 */
function getReport(date) {
  return loadReport(date);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _emptyReport() {
  return {
    date:           new Date().toISOString().slice(0, 10),
    generatedAt:    new Date().toISOString(),
    videosAnalysed: 0,
    channelAvg:     {},
    results:        [],
    highPerformers: [],
    lowPerformers:  [],
    trending:       [],
    bestNiche:      null,
    suggestions:    [],
  };
}

module.exports = { trackAll, trackVideo, addVideoToTracking, getReport };
