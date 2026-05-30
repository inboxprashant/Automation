/**
 * Pexels API client — video search.
 *
 * Docs: https://www.pexels.com/api/documentation/#videos-search
 *
 * Pexels returns videos with multiple quality files per result.
 * We always pick the highest-resolution file that is:
 *   • portrait orientation (height > width), OR
 *   • at least 1080p wide (we'll crop to 9:16 in the video builder)
 *
 * Rate limits: 200 req/hour, 20,000 req/month (free tier).
 * We stay well under by caching aggressively.
 */

'use strict';

const axios  = require('axios');
const logger = require('../../utils/logger');
const { retry, sleep } = require('../../utils/retry');

const BASE_URL          = 'https://api.pexels.com/videos';
const PER_PAGE          = 15;
const MIN_DURATION_S    = 5;
const MAX_DURATION_S    = 60;
const PREFERRED_MIN_H   = 1080;
const INTER_REQ_DELAY   = 600;   // ms between requests

/**
 * @typedef {object} MediaResult
 * @property {string}   id          — provider-scoped unique ID  e.g. "pexels_12345"
 * @property {string}   provider    — 'pexels' | 'pixabay'
 * @property {string}   downloadUrl — direct MP4 URL
 * @property {string}   pageUrl     — human-readable page URL
 * @property {number}   width
 * @property {number}   height
 * @property {number}   duration    — seconds
 * @property {string}   query       — the search query that found this
 * @property {string[]} tags        — keywords from the provider
 * @property {boolean}  isPortrait  — height > width
 * @property {string}   photographer
 */

/**
 * Pick the best video file from a Pexels video result.
 * Prefers portrait HD, falls back to landscape HD.
 *
 * @param {object[]} files — video_files array from Pexels API
 * @returns {object|null}
 */
function pickBestFile(files) {
  if (!files || files.length === 0) return null;

  // Sort by resolution descending
  const sorted = [...files].sort((a, b) => (b.height * b.width) - (a.height * a.width));

  // Prefer portrait
  const portrait = sorted.find((f) => f.height > f.width && f.height >= PREFERRED_MIN_H);
  if (portrait) return portrait;

  // Fall back to any HD file
  const hd = sorted.find((f) => f.height >= PREFERRED_MIN_H || f.width >= PREFERRED_MIN_H);
  if (hd) return hd;

  // Last resort: highest resolution available
  return sorted[0];
}

/**
 * Search Pexels for videos matching a query.
 *
 * @param {string} query
 * @param {string} apiKey
 * @param {object} [opts]
 * @param {number} [opts.perPage]
 * @param {number} [opts.page]
 * @returns {Promise<MediaResult[]>}
 */
async function search(query, apiKey, { perPage = PER_PAGE, page = 1 } = {}) {
  if (!apiKey) {
    logger.warn('[pexels] No API key — skipping');
    return [];
  }

  logger.debug(`[pexels] Searching: "${query}" (page ${page})`);

  const response = await retry(
    () => axios.get(`${BASE_URL}/search`, {
      headers: { Authorization: apiKey },
      params: {
        query,
        per_page: perPage,
        page,
        orientation: 'portrait',   // request portrait clips directly
        size: 'medium',
      },
      timeout: 15_000,
    }),
    { attempts: 3, delay: 1500, label: `Pexels search: "${query}"` }
  );

  const videos = response.data?.videos ?? [];
  const results = [];

  for (const video of videos) {
    // Filter by duration
    if (video.duration < MIN_DURATION_S || video.duration > MAX_DURATION_S) continue;

    const file = pickBestFile(video.video_files);
    if (!file || !file.link) continue;

    results.push({
      id:           `pexels_${video.id}`,
      provider:     'pexels',
      downloadUrl:  file.link,
      pageUrl:      video.url,
      width:        file.width  ?? video.width,
      height:       file.height ?? video.height,
      duration:     video.duration,
      query,
      tags:         [],   // Pexels doesn't return tags in video search
      isPortrait:   (file.height ?? video.height) > (file.width ?? video.width),
      photographer: video.user?.name ?? 'Unknown',
    });
  }

  await sleep(INTER_REQ_DELAY);
  logger.debug(`[pexels] "${query}" → ${results.length} usable results`);
  return results;
}

module.exports = { search };
