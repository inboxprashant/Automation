/**
 * Clip Cache
 *
 * Manages the local clip library in project/clips/.
 *
 * Responsibilities:
 *   • Maintain a JSON index of every downloaded clip with metadata
 *   • Deduplicate by provider ID (never download the same clip twice)
 *   • Track which clips have been used in videos (avoid reuse)
 *   • Provide fast lookup by query, niche, or provider ID
 *   • Enforce a configurable max cache size (evicts oldest unused clips)
 *
 * File layout:
 *   project/clips/
 *     index.json              ← master index
 *     pexels/                 ← clips from Pexels
 *       pexels_12345.mp4
 *     pixabay/                ← clips from Pixabay
 *       pixabay_67890.mp4
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CLIPS_DIR  = path.resolve(__dirname, '..', '..', 'project', 'clips');
const INDEX_FILE = path.join(CLIPS_DIR, 'index.json');
const MAX_CACHE_SIZE = 500;   // max clips before eviction

// ── Directory helpers ────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function providerDir(provider) {
  const dir = path.join(CLIPS_DIR, provider);
  ensureDir(dir);
  return dir;
}

// ── Index I/O ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ClipRecord
 * @property {string}   id            — e.g. "pexels_12345"
 * @property {string}   provider      — 'pexels' | 'pixabay'
 * @property {string}   localPath     — absolute path to the MP4
 * @property {string}   localRelative — relative path (portable)
 * @property {string}   downloadUrl   — original URL
 * @property {string}   pageUrl       — human-readable source page
 * @property {number}   width
 * @property {number}   height
 * @property {number}   duration      — seconds
 * @property {boolean}  isPortrait
 * @property {string[]} tags
 * @property {string[]} queries       — search queries that found this clip
 * @property {string}   photographer
 * @property {string}   downloadedAt  — ISO timestamp
 * @property {number}   usedCount     — how many videos used this clip
 * @property {string|null} lastUsedAt — ISO timestamp or null
 */

/** @returns {ClipRecord[]} */
function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return []; }
}

/** @param {ClipRecord[]} index */
function saveIndex(index) {
  ensureDir(CLIPS_DIR);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if a clip ID is already cached.
 * @param {string} id
 * @returns {ClipRecord|null}
 */
function findById(id) {
  return loadIndex().find((c) => c.id === id) ?? null;
}

/**
 * Find cached clips that match any of the given queries.
 * Returns clips sorted by relevance (query match count desc, then least used).
 *
 * @param {string[]} queries
 * @param {object}   [opts]
 * @param {number}   [opts.minDuration]
 * @param {boolean}  [opts.portraitOnly]
 * @returns {ClipRecord[]}
 */
function findByQueries(queries, { minDuration = 5, portraitOnly = false } = {}) {
  const index = loadIndex().filter((c) => {
    if (!fs.existsSync(c.localPath)) return false;
    if (c.duration < minDuration) return false;
    if (portraitOnly && !c.isPortrait) return false;
    return true;
  });

  const lowerQueries = queries.map((q) => q.toLowerCase());

  return index
    .map((clip) => {
      const matchCount = clip.queries.filter((q) =>
        lowerQueries.some((lq) => q.toLowerCase().includes(lq) || lq.includes(q.toLowerCase()))
      ).length;
      return { clip, matchCount };
    })
    .filter(({ matchCount }) => matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount || a.clip.usedCount - b.clip.usedCount)
    .map(({ clip }) => clip);
}

/**
 * Register a newly downloaded clip in the index.
 *
 * @param {object} meta — MediaResult + localPath
 * @returns {ClipRecord}
 */
function registerClip(meta) {
  const index = loadIndex();

  // Evict oldest unused clips if over limit
  if (index.length >= MAX_CACHE_SIZE) {
    _evictOldest(index);
  }

  const rel = path.relative(process.cwd(), meta.localPath).replace(/\\/g, '/');

  /** @type {ClipRecord} */
  const record = {
    id:            meta.id,
    provider:      meta.provider,
    localPath:     meta.localPath,
    localRelative: rel,
    downloadUrl:   meta.downloadUrl,
    pageUrl:       meta.pageUrl ?? '',
    width:         meta.width,
    height:        meta.height,
    duration:      meta.duration,
    isPortrait:    meta.isPortrait,
    tags:          meta.tags ?? [],
    queries:       meta.queries ?? [],
    photographer:  meta.photographer ?? 'Unknown',
    downloadedAt:  new Date().toISOString(),
    usedCount:     0,
    lastUsedAt:    null,
  };

  // Merge queries if clip already exists (shouldn't happen, but be safe)
  const existing = index.findIndex((c) => c.id === meta.id);
  if (existing >= 0) {
    const merged = new Set([...index[existing].queries, ...record.queries]);
    index[existing].queries = [...merged];
    saveIndex(index);
    return index[existing];
  }

  index.unshift(record);
  saveIndex(index);
  logger.debug(`[clipCache] Registered: ${rel}`);
  return record;
}

/**
 * Mark a clip as used (increments usedCount, updates lastUsedAt).
 * @param {string} id
 */
function markUsed(id) {
  const index = loadIndex();
  const clip = index.find((c) => c.id === id);
  if (clip) {
    clip.usedCount++;
    clip.lastUsedAt = new Date().toISOString();
    saveIndex(index);
  }
}

/**
 * Return summary stats for the cache.
 * @returns {{ total: number, byProvider: object, totalSizeMb: number }}
 */
function stats() {
  const index = loadIndex();
  const byProvider = {};
  let totalBytes = 0;

  for (const clip of index) {
    byProvider[clip.provider] = (byProvider[clip.provider] ?? 0) + 1;
    if (fs.existsSync(clip.localPath)) {
      totalBytes += fs.statSync(clip.localPath).size;
    }
  }

  return {
    total:        index.length,
    byProvider,
    totalSizeMb:  Math.round(totalBytes / 1024 / 1024),
  };
}

/**
 * Return all clip records.
 * @returns {ClipRecord[]}
 */
function listAll() {
  return loadIndex();
}

// ── Eviction ─────────────────────────────────────────────────────────────────

/**
 * Remove the oldest never-used clips until we're under MAX_CACHE_SIZE.
 * Mutates the index array in place.
 *
 * @param {ClipRecord[]} index
 */
function _evictOldest(index) {
  const neverUsed = index
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.usedCount === 0)
    .sort((a, b) => new Date(a.c.downloadedAt) - new Date(b.c.downloadedAt));

  const toRemove = neverUsed.slice(0, Math.max(1, index.length - MAX_CACHE_SIZE + 50));

  for (const { c } of toRemove) {
    if (fs.existsSync(c.localPath)) {
      fs.rmSync(c.localPath, { force: true });
      logger.debug(`[clipCache] Evicted: ${c.localRelative}`);
    }
  }

  const removeIds = new Set(toRemove.map(({ c }) => c.id));
  index.splice(0, index.length, ...index.filter((c) => !removeIds.has(c.id)));
}

module.exports = {
  findById,
  findByQueries,
  registerClip,
  markUsed,
  stats,
  listAll,
  providerDir,
  CLIPS_DIR,
};
