/**
 * Reddit source.
 *
 * Uses Reddit's public JSON API (no auth required) to fetch hot and
 * rising posts from curated subreddits per niche.
 *
 * Endpoint pattern: https://www.reddit.com/r/<sub>/hot.json?limit=25
 *
 * Viral score signal: upvote ratio × log(score) × recency bonus
 */

'use strict';

const axios = require('axios');
const logger = require('../../utils/logger');
const { retry, sleep } = require('../../utils/retry');

// Subreddits mapped to niches — verified to exist and be public
const NICHE_SUBREDDITS = {
  ai_tools:    ['artificial', 'ChatGPT', 'MachineLearning', 'singularity'],
  tech_facts:  ['technology', 'todayilearned', 'interestingasfuck', 'Futurology'],
  automation:  ['automation', 'nocode', 'selfhosted', 'devops'],
  money_facts: ['personalfinance', 'financialindependence', 'investing', 'Frugal'],
  productivity:['productivity', 'getdisciplined', 'selfimprovement', 'LifeProTips'],
};

const BASE_URL = 'https://www.reddit.com';
const INTER_REQUEST_DELAY = 800; // ms — Reddit allows ~10 req/min unauthenticated

const httpClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    // Reddit blocks default axios UA; use a descriptive custom one
    'User-Agent': 'YoutubeShortsBot/1.0 (automation research; contact via GitHub)',
    Accept: 'application/json',
  },
});

/**
 * Compute a raw score for a Reddit post.
 * Higher upvote ratio + higher score + more recent = higher raw score.
 *
 * @param {object} post — Reddit post data object
 * @returns {number} 0–100
 */
function computePostScore(post) {
  const upvoteRatio = post.upvote_ratio ?? 0.5;
  const score = Math.max(1, post.score ?? 1);
  const hoursOld = (Date.now() / 1000 - (post.created_utc ?? 0)) / 3600;
  const recencyBonus = Math.max(0, 1 - hoursOld / 72); // decays over 72 hours

  // log scale so a post with 50k upvotes isn't 1000× better than 50 upvotes
  const raw = upvoteRatio * Math.log10(score) * 20 * (1 + recencyBonus);
  return Math.min(100, Math.round(raw));
}

/**
 * Fetch hot posts from a single subreddit.
 *
 * @param {string} subreddit
 * @param {'hot'|'rising'} listing
 * @returns {Promise<object[]>} array of post data objects
 */
async function fetchSubreddit(subreddit, listing = 'hot') {
  const url = `/r/${subreddit}/${listing}.json?limit=25&raw_json=1`;

  const response = await retry(
    () => httpClient.get(url),
    { attempts: 2, delay: 1500, label: `Reddit r/${subreddit}/${listing}` }
  );

  // Guard against Reddit returning HTML (rate-limited or redirected)
  const contentType = response.headers?.['content-type'] ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(`Reddit returned HTML for r/${subreddit} — likely rate-limited`);
  }

  return (response.data?.data?.children ?? []).map((c) => c.data);
}

/**
 * Extract a clean topic string from a Reddit post title.
 * Strips common noise like "TIL", "ELI5", brackets, etc.
 *
 * @param {string} title
 * @returns {string}
 */
function cleanTitle(title) {
  return title
    .replace(/^(TIL|ELI5|CMV|AMA|PSA|OC|NSFW)[:\s]*/i, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim()
    .slice(0, 120);
}

/**
 * Collect trending topics from Reddit across all niches.
 *
 * @returns {Promise<import('./googleTrends').RawTrend[]>}
 */
async function collect() {
  logger.info('[reddit] Starting collection');
  const results = [];

  for (const [niche, subreddits] of Object.entries(NICHE_SUBREDDITS)) {
    for (const sub of subreddits) {
      for (const listing of ['hot', 'rising']) {
        try {
          const posts = await fetchSubreddit(sub, listing);

          for (const post of posts) {
            const topic = cleanTitle(post.title ?? '');
            if (!topic || topic.length < 10) continue;

            results.push({
              topic,
              keywords: extractKeywords(post),
              niche,
              source: `reddit_r/${sub}_${listing}`,
              rawScore: computePostScore(post),
              _meta: {
                subreddit: sub,
                upvotes: post.score,
                upvoteRatio: post.upvote_ratio,
                url: `https://reddit.com${post.permalink}`,
              },
            });
          }

          await sleep(INTER_REQUEST_DELAY);
        } catch (err) {
          logger.warn(`[reddit] Skipping r/${sub}/${listing}: ${err.message}`);
        }
      }
    }
  }

  logger.info(`[reddit] Collected ${results.length} raw trends`);
  return results;
}

/**
 * Extract keywords from a post's title + flair.
 * @param {object} post
 * @returns {string[]}
 */
function extractKeywords(post) {
  const words = (post.title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const flair = post.link_flair_text ? [post.link_flair_text.toLowerCase()] : [];
  return [...new Set([...words.slice(0, 5), ...flair])];
}

module.exports = { collect };
