/**
 * Analytics Collector
 *
 * Fetches video metrics from the YouTube Data API v3 and
 * YouTube Analytics API for all tracked videos.
 *
 * Metrics collected per video:
 *   • views, likes, comments, favourites (Data API — videos.list)
 *   • estimatedMinutesWatched, averageViewDuration,
 *     averageViewPercentage (Analytics API — reports.query)
 *   • impressions, impressionClickThroughRate (Analytics API)
 *   • subscribersGained (Analytics API)
 *
 * Note: YouTube Analytics API requires the same OAuth2 credentials
 * as the upload flow. The channel must have at least 1,000 subscribers
 * for some metrics to be available; others are available immediately.
 */

'use strict';

const { google }  = require('googleapis');
const logger      = require('../utils/logger');
const { retry }   = require('../utils/retry');
const { getAuthClient } = require('../upload/oauthManager');

// ── API clients ───────────────────────────────────────────────────────────────

async function getClients() {
  const auth = await getAuthClient();
  return {
    youtube:   google.youtube({ version: 'v3', auth }),
    youtubeAnalytics: google.youtubeAnalytics({ version: 'v2', auth }),
  };
}

// ── Data API — video statistics ───────────────────────────────────────────────

/**
 * Fetch statistics for up to 50 video IDs in one request.
 *
 * @param {object} yt       — YouTube Data API client
 * @param {string[]} ids    — video IDs
 * @returns {Promise<Map<string, object>>}  videoId → statistics object
 */
async function fetchVideoStats(yt, ids) {
  if (ids.length === 0) return new Map();

  const response = await retry(
    () => yt.videos.list({
      part:  ['statistics', 'snippet', 'contentDetails'],
      id:    ids,
      maxResults: 50,
    }),
    { attempts: 3, delay: 2000, label: 'YouTube videos.list' }
  );

  const map = new Map();
  for (const item of response.data.items ?? []) {
    map.set(item.id, {
      title:        item.snippet?.title,
      publishedAt:  item.snippet?.publishedAt,
      duration:     item.contentDetails?.duration,
      viewCount:    parseInt(item.statistics?.viewCount    ?? '0', 10),
      likeCount:    parseInt(item.statistics?.likeCount    ?? '0', 10),
      commentCount: parseInt(item.statistics?.commentCount ?? '0', 10),
      favoriteCount:parseInt(item.statistics?.favoriteCount ?? '0', 10),
    });
  }
  return map;
}

// ── Analytics API — retention, CTR, watch time ────────────────────────────────

/**
 * Fetch analytics metrics for a single video.
 * Returns null if the Analytics API is unavailable or returns no data.
 *
 * @param {object} ya       — YouTube Analytics API client
 * @param {string} videoId
 * @param {string} startDate — YYYY-MM-DD
 * @param {string} endDate   — YYYY-MM-DD
 * @returns {Promise<object|null>}
 */
async function fetchVideoAnalytics(ya, videoId, startDate, endDate) {
  try {
    const response = await retry(
      () => ya.reports.query({
        ids:        'channel==MINE',
        startDate,
        endDate,
        metrics:    [
          'views',
          'estimatedMinutesWatched',
          'averageViewDuration',
          'averageViewPercentage',
          'likes',
          'comments',
          'subscribersGained',
          'impressions',
          'impressionClickThroughRate',
        ].join(','),
        dimensions: 'video',
        filters:    `video==${videoId}`,
        maxResults: 1,
      }),
      { attempts: 2, delay: 1500, label: `Analytics: ${videoId}` }
    );

    const rows = response.data.rows ?? [];
    if (rows.length === 0) return null;

    const headers = (response.data.columnHeaders ?? []).map((h) => h.name);
    const row     = rows[0];

    const result = {};
    headers.forEach((h, i) => { result[h] = row[i]; });
    return result;

  } catch (err) {
    // Analytics API may not be available for all channels
    logger.debug(`[analyticsCollector] Analytics API unavailable for ${videoId}: ${err.message}`);
    return null;
  }
}

// ── Main collector ────────────────────────────────────────────────────────────

/**
 * @typedef {object} VideoMetrics
 * @property {string}  videoId
 * @property {string}  title
 * @property {string}  publishedAt
 * @property {string}  collectedAt
 * @property {number}  views
 * @property {number}  likes
 * @property {number}  comments
 * @property {number}  likeRate          — likes / views (0–1)
 * @property {number}  commentRate       — comments / views (0–1)
 * @property {number|null} watchTimeMinutes
 * @property {number|null} avgViewDurationSec
 * @property {number|null} avgViewPercentage  — 0–100
 * @property {number|null} impressions
 * @property {number|null} ctr               — 0–1 (impressionClickThroughRate)
 * @property {number|null} subscribersGained
 * @property {string}  dataSource        — 'full' | 'stats_only'
 */

/**
 * Collect metrics for a list of video IDs.
 *
 * @param {string[]} videoIds
 * @param {object}   [opts]
 * @param {number}   [opts.lookbackDays=90]
 * @returns {Promise<VideoMetrics[]>}
 */
async function collectMetrics(videoIds, { lookbackDays = 90 } = {}) {
  if (videoIds.length === 0) return [];

  logger.info(`[analyticsCollector] Collecting metrics for ${videoIds.length} video(s)`);

  const { youtube, youtubeAnalytics } = await getClients();

  // Batch video stats (up to 50 per request)
  const statsMap = await fetchVideoStats(youtube, videoIds.slice(0, 50));

  // Date range for Analytics API
  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

  const results = [];

  for (const videoId of videoIds) {
    const stats     = statsMap.get(videoId);
    const analytics = await fetchVideoAnalytics(youtubeAnalytics, videoId, startDate, endDate);

    const views    = analytics?.views    ?? stats?.viewCount    ?? 0;
    const likes    = analytics?.likes    ?? stats?.likeCount    ?? 0;
    const comments = analytics?.comments ?? stats?.commentCount ?? 0;

    /** @type {VideoMetrics} */
    const metrics = {
      videoId,
      title:               stats?.title        ?? 'Unknown',
      publishedAt:         stats?.publishedAt  ?? null,
      collectedAt:         new Date().toISOString(),
      views,
      likes,
      comments,
      likeRate:            views > 0 ? Math.round((likes    / views) * 10000) / 10000 : 0,
      commentRate:         views > 0 ? Math.round((comments / views) * 10000) / 10000 : 0,
      watchTimeMinutes:    analytics?.estimatedMinutesWatched ?? null,
      avgViewDurationSec:  analytics?.averageViewDuration     ?? null,
      avgViewPercentage:   analytics?.averageViewPercentage   ?? null,
      impressions:         analytics?.impressions             ?? null,
      ctr:                 analytics?.impressionClickThroughRate ?? null,
      subscribersGained:   analytics?.subscribersGained       ?? null,
      dataSource:          analytics ? 'full' : 'stats_only',
    };

    results.push(metrics);
    logger.debug(`[analyticsCollector] ${videoId}: ${views} views, CTR: ${metrics.ctr ?? 'n/a'}`);
  }

  logger.info(`[analyticsCollector] Collected ${results.length} metric snapshots`);
  return results;
}

module.exports = { collectMetrics, fetchVideoStats, fetchVideoAnalytics };
