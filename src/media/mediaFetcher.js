/**
 * Media Fetcher — main orchestrator for the stock clip downloader.
 *
 * Flow per call:
 *   1. Build search queries from script keywords + niche  (keywordMapper)
 *   2. Check cache — return cached clips if enough are available
 *   3. Search Pexels + Pixabay in parallel for each query
 *   4. Deduplicate results against the cache (skip already-downloaded IDs)
 *   5. Score and rank results (portrait > landscape, longer > shorter)
 *   6. Download top N clips concurrently (configurable concurrency)
 *   7. Register each clip in the cache index
 *   8. Return an array of local clip paths ready for the video builder
 *
 * Exported API:
 *   fetchClips(script, options?)  → Promise<FetchResult>
 *   fetchClipsForQueries(queries, options?) → Promise<FetchResult>
 *
 * @typedef {object} FetchResult
 * @property {string[]} clipPaths     — absolute paths to downloaded MP4s
 * @property {number}   downloaded    — new clips downloaded this run
 * @property {number}   fromCache     — clips served from cache
 * @property {string[]} queries       — queries used
 */

'use strict';

const path   = require('path');
const logger = require('../utils/logger');
const config = require('../config');

const pexels    = require('./providers/pexels');
const pixabay   = require('./providers/pixabay');
const { buildQueries }                          = require('./keywordMapper');
const { findById, findByQueries, registerClip, providerDir } = require('./clipCache');
const { downloadFile }                          = require('./downloader');

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TARGET_CLIPS  = 6;    // clips to have ready per video
const MAX_CONCURRENT_DL     = 2;    // parallel downloads
const MIN_CLIP_DURATION     = 5;    // seconds
const CACHE_HIT_THRESHOLD   = 4;    // if cache has ≥ this many matches, skip API calls

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a MediaResult for download priority.
 * Higher = better.
 *
 * @param {import('./providers/pexels').MediaResult} result
 * @returns {number}
 */
function scoreResult(result) {
  let score = 0;
  if (result.isPortrait)          score += 50;   // portrait is ideal for 9:16
  if (result.height >= 1920)      score += 30;   // HD portrait
  if (result.height >= 1080)      score += 15;
  if (result.duration >= 10)      score += 20;   // longer clips = more flexibility
  if (result.duration >= 20)      score += 10;
  if (result.duration <= 60)      score += 5;    // not too long
  if (result.tags.length > 0)     score += 5;    // has metadata
  return score;
}

// ── Concurrent download pool ─────────────────────────────────────────────────

/**
 * Download an array of MediaResults with limited concurrency.
 * Returns the ClipRecords for successfully downloaded clips.
 *
 * @param {import('./providers/pexels').MediaResult[]} results
 * @param {string[]} queries  — queries that found these results (for index)
 * @returns {Promise<import('./clipCache').ClipRecord[]>}
 */
async function downloadBatch(results, queries) {
  const downloaded = [];
  const queue = [...results];

  async function worker() {
    while (queue.length > 0) {
      const result = queue.shift();
      if (!result) break;

      // Skip if already cached
      if (findById(result.id)) {
        logger.debug(`[mediaFetcher] Already cached: ${result.id}`);
        continue;
      }

      const dir      = providerDir(result.provider);
      const filename = `${result.id}.mp4`;
      const destPath = path.join(dir, filename);

      try {
        logger.info(`[mediaFetcher] Downloading ${result.id} (${result.duration}s, ${result.width}×${result.height})`);
        const bytes = await downloadFile(result.downloadUrl, destPath, result.id);

        const record = registerClip({ ...result, localPath: destPath, queries });
        downloaded.push(record);
        logger.info(`[mediaFetcher] ✅ ${result.id} — ${Math.round(bytes / 1024)} KB`);

      } catch (err) {
        logger.warn(`[mediaFetcher] Failed to download ${result.id}: ${err.message}`);
      }
    }
  }

  // Run workers in parallel
  const workers = Array.from({ length: MAX_CONCURRENT_DL }, () => worker());
  await Promise.all(workers);

  return downloaded;
}

// ── Search all providers ─────────────────────────────────────────────────────

/**
 * Search both providers for a single query and return combined results.
 *
 * @param {string} query
 * @returns {Promise<import('./providers/pexels').MediaResult[]>}
 */
async function searchAll(query) {
  const [pexelsResults, pixabayResults] = await Promise.allSettled([
    pexels.search(query,   config.media?.pexelsApiKey   ?? process.env.PEXELS_API_KEY   ?? ''),
    pixabay.search(query,  config.media?.pixabayApiKey  ?? process.env.PIXABAY_API_KEY  ?? ''),
  ]);

  const results = [
    ...(pexelsResults.status  === 'fulfilled' ? pexelsResults.value  : []),
    ...(pixabayResults.status === 'fulfilled' ? pixabayResults.value : []),
  ];

  if (pexelsResults.status  === 'rejected') logger.warn(`[mediaFetcher] Pexels error for "${query}": ${pexelsResults.reason?.message}`);
  if (pixabayResults.status === 'rejected') logger.warn(`[mediaFetcher] Pixabay error for "${query}": ${pixabayResults.reason?.message}`);

  return results;
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Fetch clips for a script object.
 *
 * @param {object} script   — script with keywords, niche, hook fields
 * @param {object} [opts]
 * @param {number}  [opts.targetClips]   — how many clips to have ready
 * @param {boolean} [opts.portraitOnly]  — only return portrait clips
 * @returns {Promise<FetchResult>}
 */
async function fetchClips(script, opts = {}) {
  const queries = buildQueries({
    keywords:   script.keywords  ?? [],
    niche:      script.niche     ?? 'general',
    hook:       script.hook      ?? '',
    maxQueries: 8,
  });

  return fetchClipsForQueries(queries, opts);
}

/**
 * Fetch clips for an explicit list of search queries.
 *
 * @param {string[]} queries
 * @param {object}   [opts]
 * @param {number}   [opts.targetClips]
 * @param {boolean}  [opts.portraitOnly]
 * @returns {Promise<FetchResult>}
 */
async function fetchClipsForQueries(queries, {
  targetClips  = DEFAULT_TARGET_CLIPS,
  portraitOnly = false,
} = {}) {
  logger.info(`[mediaFetcher] Fetching ${targetClips} clips for ${queries.length} queries`);
  logger.debug(`[mediaFetcher] Queries: ${queries.join(' | ')}`);

  // ── 1. Check cache first ─────────────────────────────────────────────────
  const cached = findByQueries(queries, { minDuration: MIN_CLIP_DURATION, portraitOnly });
  logger.info(`[mediaFetcher] Cache hits: ${cached.length}`);

  if (cached.length >= CACHE_HIT_THRESHOLD) {
    logger.info(`[mediaFetcher] Sufficient cache hits — skipping API calls`);
    const clipPaths = cached.slice(0, targetClips).map((c) => c.localPath);
    return { clipPaths, downloaded: 0, fromCache: clipPaths.length, queries };
  }

  // ── 2. Search APIs ───────────────────────────────────────────────────────
  const allResults = [];
  const cachedIds  = new Set(cached.map((c) => c.id));

  for (const query of queries) {
    const results = await searchAll(query);
    for (const r of results) {
      if (!cachedIds.has(r.id)) {
        allResults.push(r);
        cachedIds.add(r.id);   // prevent duplicates across queries
      }
    }
  }

  logger.info(`[mediaFetcher] API returned ${allResults.length} new results`);

  // ── 3. Score and rank ────────────────────────────────────────────────────
  const ranked = allResults
    .filter((r) => r.duration >= MIN_CLIP_DURATION)
    .filter((r) => !portraitOnly || r.isPortrait)
    .sort((a, b) => scoreResult(b) - scoreResult(a));

  // ── 4. Download top N (enough to fill the gap) ───────────────────────────
  const needed = Math.max(0, targetClips - cached.length);
  const toDownload = ranked.slice(0, needed + 2);   // +2 buffer for failures

  logger.info(`[mediaFetcher] Downloading ${toDownload.length} clips...`);
  const newRecords = await downloadBatch(toDownload, queries);

  // ── 5. Combine cache + new downloads ────────────────────────────────────
  const allPaths = [
    ...cached.map((c) => c.localPath),
    ...newRecords.map((c) => c.localPath),
  ].slice(0, targetClips);

  logger.info(`[mediaFetcher] ✅ Ready: ${allPaths.length} clips (${newRecords.length} new, ${cached.length} cached)`);

  return {
    clipPaths:  allPaths,
    downloaded: newRecords.length,
    fromCache:  cached.length,
    queries,
  };
}

module.exports = { fetchClips, fetchClipsForQueries };
