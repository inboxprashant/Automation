/**
 * Pixabay API client — video search.
 *
 * Docs: https://pixabay.com/api/docs/#api_video
 *
 * Pixabay returns three quality tiers per video: large, medium, small.
 * We prefer "large" (1920px) for portrait clips, fall back to "medium".
 *
 * Rate limits: 100 req/min (free tier). We stay well under.
 */

'use strict';

const axios  = require('axios');
const logger = require('../../utils/logger');
const { retry, sleep } = require('../../utils/retry');

const BASE_URL        = 'https://pixabay.com/api/videos/';
const PER_PAGE        = 15;
const MIN_DURATION_S  = 5;
const MAX_DURATION_S  = 60;
const INTER_REQ_DELAY = 700;   // ms between requests

/**
 * Pick the best video stream from a Pixabay video result.
 * Prefers large → medium → small.
 *
 * @param {object} videos — the `videos` object from Pixabay API
 * @returns {{ url: string, width: number, height: number }|null}
 */
function pickBestStream(videos) {
  if (!videos) return null;

  for (const tier of ['large', 'medium', 'small']) {
    const v = videos[tier];
    if (v?.url) {
      return { url: v.url, width: v.width ?? 0, height: v.height ?? 0 };
    }
  }
  return null;
}

/**
 * Search Pixabay for videos matching a query.
 *
 * @param {string} query
 * @param {string} apiKey
 * @param {object} [opts]
 * @param {number} [opts.perPage]
 * @param {number} [opts.page]
 * @returns {Promise<import('./pexels').MediaResult[]>}
 */
async function search(query, apiKey, { perPage = PER_PAGE, page = 1 } = {}) {
  // Skip if key is missing or placeholder
  if (!apiKey || apiKey === '...' || apiKey.trim().length < 10) {
    return [];
  }

  logger.debug(`[pixabay] Searching: "${query}" (page ${page})`);

  const response = await retry(
    () => axios.get(BASE_URL, {
      params: {
        key:          apiKey,
        q:            query,
        video_type:   'film',
        per_page:     perPage,
        page,
        safesearch:   true,
        order:        'popular',
      },
      timeout: 15_000,
    }),
    { attempts: 3, delay: 1500, label: `Pixabay search: "${query}"` }
  );

  const hits = response.data?.hits ?? [];
  const results = [];

  for (const hit of hits) {
    if (hit.duration < MIN_DURATION_S || hit.duration > MAX_DURATION_S) continue;

    const stream = pickBestStream(hit.videos);
    if (!stream?.url) continue;

    const tags = (hit.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);

    results.push({
      id:           `pixabay_${hit.id}`,
      provider:     'pixabay',
      downloadUrl:  stream.url,
      pageUrl:      hit.pageURL,
      width:        stream.width,
      height:       stream.height,
      duration:     hit.duration,
      query,
      tags,
      isPortrait:   stream.height > stream.width,
      photographer: hit.user ?? 'Unknown',
    });
  }

  await sleep(INTER_REQ_DELAY);
  logger.debug(`[pixabay] "${query}" → ${results.length} usable results`);
  return results;
}

module.exports = { search };
