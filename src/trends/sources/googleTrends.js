/**
 * Google Trends source.
 *
 * Fetches daily trending searches and interest-over-time data for
 * each of our target niches using the `google-trends-api` package.
 *
 * Returns an array of RawTrend objects.
 *
 * NOTE: google-trends-api scrapes the public Trends endpoint — no API
 * key required, but it is rate-limited. We add polite delays between
 * calls and wrap everything in the retry utility.
 */

'use strict';

const googleTrends = require('google-trends-api');
const logger = require('../../utils/logger');
const { retry, sleep } = require('../../utils/retry');

// Niche → seed keywords for interest-over-time queries
const NICHE_SEEDS = {
  ai_tools:    ['AI tools', 'ChatGPT', 'Claude AI', 'AI automation', 'Gemini AI'],
  tech_facts:  ['tech facts', 'technology news', 'quantum computing', 'smartphone tips'],
  automation:  ['workflow automation', 'Zapier', 'n8n automation', 'no-code tools'],
  money_facts: ['personal finance', 'investing tips', 'passive income', 'compound interest'],
  productivity:['productivity hacks', 'time management', 'deep work', 'morning routine'],
};

const INTER_REQUEST_DELAY = 1200; // ms — stay well under rate limits

/**
 * @typedef {object} RawTrend
 * @property {string}   topic
 * @property {string[]} keywords
 * @property {string}   niche
 * @property {string}   source
 * @property {number}   rawScore   — 0–100 interest value from Trends
 */

/**
 * Fetch interest-over-time for a single keyword.
 * Returns the average interest value (0–100) over the past 7 days.
 *
 * @param {string} keyword
 * @returns {Promise<number>}
 */
async function fetchInterest(keyword) {
  const result = await retry(
    async () => {
      const raw = await googleTrends.interestOverTime({
        keyword,
        startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        granularTimeResolution: true,
      });
      // Guard: Google Trends sometimes returns HTML when rate-limited
      if (typeof raw === 'string' && raw.trim().startsWith('<')) {
        throw new Error('Google Trends returned HTML — rate limited');
      }
      return JSON.parse(raw);
    },
    { attempts: 2, delay: 3000, label: `Google Trends: "${keyword}"` }
  );

  const timeline = result?.default?.timelineData ?? [];
  if (timeline.length === 0) return 0;

  const values = timeline.map((p) => p.value?.[0] ?? 0);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Fetch daily trending searches (US).
 * Returns up to 20 trending topic strings.
 *
 * @returns {Promise<string[]>}
 */
async function fetchDailyTrending() {
  try {
    const raw = await retry(
      () => googleTrends.dailyTrends({ geo: 'US' }),
      { attempts: 2, delay: 3000, label: 'Google Trends: daily trending' }
    );
    // Guard against HTML response
    if (typeof raw === 'string' && raw.trim().startsWith('<')) {
      logger.warn('[googleTrends] dailyTrends returned HTML — rate limited, skipping');
      return [];
    }
    const data = JSON.parse(raw);
    const stories = data?.default?.trendingSearchesDays?.[0]?.trendingSearches ?? [];
    return stories.map((s) => s.title?.query).filter(Boolean).slice(0, 20);
  } catch (err) {
    logger.warn(`[googleTrends] dailyTrends failed: ${err.message}`);
    return [];
  }
}

/**
 * Collect trends for all niches.
 *
 * @returns {Promise<RawTrend[]>}
 */
async function collect() {
  logger.info('[googleTrends] Starting collection');
  const results = [];

  // 1. Daily trending topics (niche-agnostic, scored by position)
  const daily = await fetchDailyTrending();
  daily.forEach((topic, i) => {
    results.push({
      topic,
      keywords: [topic],
      niche: 'general',
      source: 'google_trends_daily',
      rawScore: Math.max(10, 100 - i * 4), // rank 1 = 100, rank 2 = 96, …
    });
  });

  await sleep(INTER_REQUEST_DELAY);

  // 2. Interest-over-time per niche seed keyword
  for (const [niche, seeds] of Object.entries(NICHE_SEEDS)) {
    for (const keyword of seeds) {
      try {
        const score = await fetchInterest(keyword);
        if (score > 0) {
          results.push({
            topic: keyword,
            keywords: [keyword],
            niche,
            source: 'google_trends_interest',
            rawScore: score,
          });
        }
        await sleep(INTER_REQUEST_DELAY);
      } catch (err) {
        logger.warn(`[googleTrends] Skipping "${keyword}": ${err.message}`);
      }
    }
  }

  logger.info(`[googleTrends] Collected ${results.length} raw trends`);
  return results;
}

module.exports = { collect };
