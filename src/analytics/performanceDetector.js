/**
 * Performance Detector
 *
 * Analyses a set of VideoMetrics snapshots to identify:
 *   • High-performing videos (outliers above threshold)
 *   • Underperforming videos (below average on key metrics)
 *   • Trending videos (rapid view growth vs previous snapshot)
 *   • Best niche, best upload time, best title patterns
 *
 * All thresholds are relative to the channel's own average,
 * not absolute numbers — so the system works for both small
 * and large channels.
 */

'use strict';

// ── Thresholds (relative to channel average) ─────────────────────────────────

const HIGH_PERFORMER_MULTIPLIER = 1.5;   // 50% above average = high performer
const LOW_PERFORMER_MULTIPLIER  = 0.5;   // 50% below average = underperformer
const TRENDING_GROWTH_RATE      = 0.20;  // 20% view growth since last snapshot

// ── Statistical helpers ───────────────────────────────────────────────────────

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid    = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ── Channel averages ──────────────────────────────────────────────────────────

/**
 * Compute channel-wide averages from a set of metrics.
 *
 * @param {import('./analyticsCollector').VideoMetrics[]} metrics
 * @returns {object}
 */
function computeChannelAverages(metrics) {
  const withViews = metrics.filter((m) => m.views > 0);
  if (withViews.length === 0) return { views: 0, likeRate: 0, ctr: 0, retention: 0 };

  return {
    views:      avg(withViews.map((m) => m.views)),
    likeRate:   avg(withViews.map((m) => m.likeRate)),
    ctr:        avg(withViews.filter((m) => m.ctr != null).map((m) => m.ctr)),
    retention:  avg(withViews.filter((m) => m.avgViewPercentage != null).map((m) => m.avgViewPercentage)),
    medianViews: median(withViews.map((m) => m.views)),
    stdDevViews: stdDev(withViews.map((m) => m.views)),
  };
}

// ── Performance classification ────────────────────────────────────────────────

/**
 * @typedef {'high' | 'average' | 'low'} PerformanceTier
 *
 * @typedef {object} PerformanceResult
 * @property {string}          videoId
 * @property {string}          title
 * @property {PerformanceTier} tier
 * @property {number}          score          — composite 0–100
 * @property {string[]}        strengths      — what's working
 * @property {string[]}        weaknesses     — what needs improvement
 * @property {object}          metrics        — raw metrics snapshot
 * @property {object}          vsAverage      — % difference from channel avg
 */

/**
 * Classify a single video's performance relative to channel averages.
 *
 * @param {import('./analyticsCollector').VideoMetrics} m
 * @param {object} channelAvg
 * @returns {PerformanceResult}
 */
function classifyVideo(m, channelAvg) {
  const strengths  = [];
  const weaknesses = [];
  let   score      = 50;   // start at neutral

  // ── Views ──────────────────────────────────────────────────────────────────
  const viewRatio = channelAvg.views > 0 ? m.views / channelAvg.views : 1;
  const vsViews   = Math.round((viewRatio - 1) * 100);

  if (viewRatio >= HIGH_PERFORMER_MULTIPLIER) {
    strengths.push(`Views ${vsViews}% above channel average`);
    score += 20;
  } else if (viewRatio <= LOW_PERFORMER_MULTIPLIER) {
    weaknesses.push(`Views ${Math.abs(vsViews)}% below channel average`);
    score -= 15;
  }

  // ── CTR ────────────────────────────────────────────────────────────────────
  let vsCtr = null;
  if (m.ctr != null && channelAvg.ctr > 0) {
    const ctrRatio = m.ctr / channelAvg.ctr;
    vsCtr = Math.round((ctrRatio - 1) * 100);
    if (ctrRatio >= HIGH_PERFORMER_MULTIPLIER) {
      strengths.push(`CTR ${vsCtr}% above average (${(m.ctr * 100).toFixed(1)}%)`);
      score += 15;
    } else if (ctrRatio <= LOW_PERFORMER_MULTIPLIER) {
      weaknesses.push(`CTR ${Math.abs(vsCtr)}% below average (${(m.ctr * 100).toFixed(1)}%)`);
      score -= 10;
    }
  }

  // ── Retention ──────────────────────────────────────────────────────────────
  let vsRetention = null;
  if (m.avgViewPercentage != null && channelAvg.retention > 0) {
    const retRatio = m.avgViewPercentage / channelAvg.retention;
    vsRetention = Math.round((retRatio - 1) * 100);
    if (retRatio >= HIGH_PERFORMER_MULTIPLIER) {
      strengths.push(`Retention ${vsRetention}% above average (${m.avgViewPercentage.toFixed(1)}%)`);
      score += 15;
    } else if (retRatio <= LOW_PERFORMER_MULTIPLIER) {
      weaknesses.push(`Retention ${Math.abs(vsRetention)}% below average (${m.avgViewPercentage.toFixed(1)}%)`);
      score -= 10;
    }
  }

  // ── Like rate ──────────────────────────────────────────────────────────────
  if (channelAvg.likeRate > 0) {
    const likeRatio = m.likeRate / channelAvg.likeRate;
    if (likeRatio >= HIGH_PERFORMER_MULTIPLIER) {
      strengths.push(`Like rate ${Math.round((likeRatio - 1) * 100)}% above average`);
      score += 10;
    } else if (likeRatio <= LOW_PERFORMER_MULTIPLIER) {
      weaknesses.push(`Like rate ${Math.round((1 - likeRatio) * 100)}% below average`);
      score -= 5;
    }
  }

  // ── Absolute thresholds ────────────────────────────────────────────────────
  if (m.avgViewPercentage != null) {
    if (m.avgViewPercentage >= 70) strengths.push('Excellent retention (≥70%)');
    else if (m.avgViewPercentage < 30) weaknesses.push('Poor retention (<30%) — hook may be weak');
  }
  if (m.ctr != null) {
    if (m.ctr >= 0.08) strengths.push('High CTR (≥8%) — thumbnail/title working well');
    else if (m.ctr < 0.02) weaknesses.push('Low CTR (<2%) — thumbnail or title needs work');
  }

  score = Math.max(0, Math.min(100, score));

  const tier = score >= 65 ? 'high' : score >= 35 ? 'average' : 'low';

  return {
    videoId:   m.videoId,
    title:     m.title,
    tier,
    score,
    strengths,
    weaknesses,
    metrics:   m,
    vsAverage: { views: vsViews, ctr: vsCtr, retention: vsRetention },
  };
}

// ── Trending detection ────────────────────────────────────────────────────────

/**
 * Detect trending videos by comparing current vs previous snapshots.
 *
 * @param {import('./analyticsCollector').VideoMetrics[]} current
 * @param {import('./analyticsCollector').VideoMetrics[]} previous
 * @returns {string[]} videoIds that are trending
 */
function detectTrending(current, previous) {
  const prevMap = new Map(previous.map((m) => [m.videoId, m.views]));
  return current
    .filter((m) => {
      const prev = prevMap.get(m.videoId) ?? 0;
      if (prev === 0) return false;
      return (m.views - prev) / prev >= TRENDING_GROWTH_RATE;
    })
    .map((m) => m.videoId);
}

// ── Best patterns ─────────────────────────────────────────────────────────────

/**
 * Find the best-performing niche from a set of results.
 * @param {PerformanceResult[]} results
 * @returns {string|null}
 */
function findBestNiche(results) {
  const byNiche = {};
  for (const r of results) {
    const niche = r.metrics.niche ?? 'general';
    if (!byNiche[niche]) byNiche[niche] = [];
    byNiche[niche].push(r.score);
  }
  let best = null, bestAvg = -1;
  for (const [niche, scores] of Object.entries(byNiche)) {
    const a = avg(scores);
    if (a > bestAvg) { bestAvg = a; best = niche; }
  }
  return best;
}

// ── Main analyser ─────────────────────────────────────────────────────────────

/**
 * Analyse a set of metrics and return performance results.
 *
 * @param {import('./analyticsCollector').VideoMetrics[]} metrics
 * @param {import('./analyticsCollector').VideoMetrics[]} [previousMetrics]
 * @returns {{
 *   results: PerformanceResult[],
 *   channelAvg: object,
 *   highPerformers: PerformanceResult[],
 *   lowPerformers: PerformanceResult[],
 *   trending: string[],
 *   bestNiche: string|null,
 * }}
 */
function analysePerformance(metrics, previousMetrics = []) {
  const channelAvg     = computeChannelAverages(metrics);
  const results        = metrics.map((m) => classifyVideo(m, channelAvg));
  const highPerformers = results.filter((r) => r.tier === 'high').sort((a, b) => b.score - a.score);
  const lowPerformers  = results.filter((r) => r.tier === 'low').sort((a, b) => a.score - b.score);
  const trending       = detectTrending(metrics, previousMetrics);
  const bestNiche      = findBestNiche(results);

  return { results, channelAvg, highPerformers, lowPerformers, trending, bestNiche };
}

module.exports = {
  analysePerformance,
  computeChannelAverages,
  classifyVideo,
  detectTrending,
  findBestNiche,
};
