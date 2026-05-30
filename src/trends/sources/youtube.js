/**
 * YouTube source.
 *
 * Uses the YouTube Data API v3 to find:
 *   1. Trending videos in relevant categories (videoCategoryId)
 *   2. Search results for niche seed queries filtered to Shorts
 *      (videoDuration=short, order=viewCount / relevance)
 *
 * Viral score signal: view velocity (views ÷ hours since publish),
 * like ratio, and comment density.
 */

'use strict';

const { google } = require('googleapis');
const logger = require('../../utils/logger');
const { retry, sleep } = require('../../utils/retry');
const config = require('../../config');

// YouTube category IDs relevant to our niches
// https://developers.google.com/youtube/v3/docs/videoCategories/list
const CATEGORY_IDS = {
  ai_tools:    '28', // Science & Technology
  tech_facts:  '28',
  automation:  '28',
  money_facts: '22', // People & Blogs (finance content lives here)
  productivity:'22',
};

// Seed search queries per niche
const NICHE_QUERIES = {
  ai_tools:    ['AI tools 2024', 'ChatGPT tips', 'AI automation shorts', 'best AI apps'],
  tech_facts:  ['tech facts shorts', 'technology facts', 'mind blowing tech'],
  automation:  ['automation tools', 'no code automation', 'workflow automation shorts'],
  money_facts: ['money facts shorts', 'personal finance tips', 'investing shorts'],
  productivity:['productivity hacks shorts', 'morning routine', 'time management tips'],
};

const INTER_REQUEST_DELAY = 500;

/**
 * Build an authenticated YouTube client using the OAuth2 refresh token.
 */
function buildYouTubeClient() {
  const auth = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    config.youtube.redirectUri
  );
  auth.setCredentials({ refresh_token: config.youtube.refreshToken });
  return google.youtube({ version: 'v3', auth });
}

/**
 * Compute a viral score from YouTube video statistics.
 * Returns 0–100.
 *
 * @param {object} stats  — video statistics object
 * @param {string} publishedAt — ISO date string
 * @returns {number}
 */
function computeVideoScore(stats, publishedAt) {
  const views = parseInt(stats?.viewCount ?? '0', 10);
  const likes = parseInt(stats?.likeCount ?? '0', 10);
  const comments = parseInt(stats?.commentCount ?? '0', 10);

  const hoursOld = Math.max(1, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
  const viewVelocity = views / hoursOld; // views per hour

  const likeRatio = views > 0 ? likes / views : 0;
  const commentDensity = views > 0 ? comments / views : 0;

  // Weighted formula — velocity is the strongest signal
  const raw =
    Math.log10(Math.max(1, viewVelocity)) * 30 +
    likeRatio * 40 +
    commentDensity * 500 +
    Math.log10(Math.max(1, views)) * 5;

  return Math.min(100, Math.round(raw));
}

/**
 * Fetch trending videos for a category.
 *
 * @param {object} yt — YouTube client
 * @param {string} categoryId
 * @param {string} niche
 * @returns {Promise<import('./googleTrends').RawTrend[]>}
 */
async function fetchTrending(yt, categoryId, niche) {
  const response = await retry(
    () =>
      yt.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        chart: 'mostPopular',
        regionCode: 'US',
        videoCategoryId: categoryId,
        maxResults: 20,
      }),
    { attempts: 3, delay: 1500, label: `YouTube trending cat=${categoryId}` }
  );

  return (response.data.items ?? []).map((item) => ({
    topic: item.snippet.title,
    keywords: extractVideoKeywords(item),
    niche,
    source: 'youtube_trending',
    rawScore: computeVideoScore(item.statistics, item.snippet.publishedAt),
    _meta: {
      videoId: item.id,
      channelTitle: item.snippet.channelTitle,
      viewCount: item.statistics?.viewCount,
      url: `https://youtube.com/watch?v=${item.id}`,
    },
  }));
}

/**
 * Search for Shorts by query.
 *
 * @param {object} yt
 * @param {string} query
 * @param {string} niche
 * @returns {Promise<import('./googleTrends').RawTrend[]>}
 */
async function fetchSearchResults(yt, query, niche) {
  // Search for short videos (< 4 min) — Shorts are typically < 60s
  const searchResponse = await retry(
    () =>
      yt.search.list({
        part: ['snippet'],
        q: query,
        type: ['video'],
        videoDuration: 'short',
        order: 'viewCount',
        maxResults: 10,
        regionCode: 'US',
        relevanceLanguage: 'en',
      }),
    { attempts: 3, delay: 1500, label: `YouTube search: "${query}"` }
  );

  const items = searchResponse.data.items ?? [];
  if (items.length === 0) return [];

  // Fetch statistics for the found videos
  const ids = items.map((i) => i.id.videoId).filter(Boolean).join(',');
  const statsResponse = await retry(
    () => yt.videos.list({ part: ['statistics', 'contentDetails'], id: [ids] }),
    { attempts: 2, delay: 1000, label: `YouTube stats batch` }
  );

  const statsMap = {};
  for (const v of statsResponse.data.items ?? []) {
    statsMap[v.id] = { statistics: v.statistics, publishedAt: v.snippet?.publishedAt };
  }

  return items.map((item) => {
    const vid = item.id.videoId;
    const meta = statsMap[vid] ?? {};
    return {
      topic: item.snippet.title,
      keywords: [query, ...(item.snippet.tags ?? []).slice(0, 4)],
      niche,
      source: `youtube_search:${query}`,
      rawScore: computeVideoScore(meta.statistics ?? {}, item.snippet.publishedAt),
      _meta: {
        videoId: vid,
        channelTitle: item.snippet.channelTitle,
        url: `https://youtube.com/watch?v=${vid}`,
      },
    };
  });
}

/**
 * Extract keywords from a video item.
 * @param {object} item
 * @returns {string[]}
 */
function extractVideoKeywords(item) {
  const title = (item.snippet?.title ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const titleWords = title.split(/\s+/).filter((w) => w.length > 3).slice(0, 4);
  const tags = (item.snippet?.tags ?? []).slice(0, 3).map((t) => t.toLowerCase());
  return [...new Set([...titleWords, ...tags])];
}

/**
 * Collect trending topics from YouTube across all niches.
 *
 * NOTE: Requires youtube.readonly scope. If the OAuth token only has
 * youtube.upload scope, all calls will return "Insufficient Permission".
 * In that case we return [] gracefully — the trend finder continues
 * with Google Trends + Reddit data only.
 *
 * @returns {Promise<import('./googleTrends').RawTrend[]>}
 */
async function collect() {
  logger.info('[youtube] Starting collection');

  // Quick permission check before making many calls
  const yt = buildYouTubeClient();
  try {
    await yt.videos.list({ part: ['id'], chart: 'mostPopular', maxResults: 1 });
  } catch (err) {
    if (err.message?.includes('Insufficient Permission') || err.code === 403) {
      logger.warn(
        '[youtube] Skipping YouTube trend source — OAuth token lacks youtube.readonly scope. ' +
        'Re-run `node scripts/get_token.js` and add the readonly scope to enable this source.'
      );
      return [];
    }
  }

  const results = [];
  const seenCategories = new Set();

  // 1. Trending videos per category (deduplicated by categoryId)
  for (const [niche, categoryId] of Object.entries(CATEGORY_IDS)) {
    if (seenCategories.has(categoryId)) continue;
    seenCategories.add(categoryId);

    try {
      const trends = await fetchTrending(yt, categoryId, niche);
      results.push(...trends);
      await sleep(INTER_REQUEST_DELAY);
    } catch (err) {
      logger.warn(`[youtube] Trending fetch failed for niche=${niche}: ${err.message}`);
    }
  }

  // 2. Search results per niche query
  for (const [niche, queries] of Object.entries(NICHE_QUERIES)) {
    for (const query of queries) {
      try {
        const trends = await fetchSearchResults(yt, query, niche);
        results.push(...trends);
        await sleep(INTER_REQUEST_DELAY);
      } catch (err) {
        logger.warn(`[youtube] Search failed for "${query}": ${err.message}`);
      }
    }
  }

  logger.info(`[youtube] Collected ${results.length} raw trends`);
  return results;
}

module.exports = { collect };
