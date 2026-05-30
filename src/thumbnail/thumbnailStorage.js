/**
 * Thumbnail Storage
 *
 * Persists generated thumbnails to project/thumbnails/<niche>/.
 *
 * File naming: project/thumbnails/<niche>/<YYYY-MM-DD>_<jobId>.jpg
 * Metadata:    project/thumbnails/<niche>/<YYYY-MM-DD>_<jobId>.json
 * Index:       project/thumbnails/index.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const THUMBNAILS_DIR = path.resolve(__dirname, '..', '..', 'project', 'thumbnails');
const INDEX_FILE     = path.join(THUMBNAILS_DIR, 'index.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return []; }
}

function saveIndex(index) {
  ensureDir(THUMBNAILS_DIR);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

/**
 * @typedef {object} ThumbnailRecord
 * @property {string} jobId
 * @property {string} niche
 * @property {string} title
 * @property {string} jpgPath        — absolute path
 * @property {string} jpgRelative    — relative path
 * @property {number} fileSizeKb
 * @property {string} colorScheme
 * @property {string} headline
 * @property {string} generatedAt
 */

/**
 * Register a completed thumbnail in the index.
 *
 * @param {object} meta
 * @param {string} meta.jobId
 * @param {string} meta.niche
 * @param {string} meta.title
 * @param {string} meta.jpgPath
 * @param {string} meta.colorScheme
 * @param {string} meta.headline
 * @returns {ThumbnailRecord}
 */
function saveThumbnail(meta) {
  const { jobId, niche = 'general', title = 'Untitled', jpgPath, colorScheme, headline } = meta;

  const jpgRelative = path.relative(process.cwd(), jpgPath).replace(/\\/g, '/');
  const fileSizeKb  = fs.existsSync(jpgPath)
    ? Math.round(fs.statSync(jpgPath).size / 1024)
    : 0;

  /** @type {ThumbnailRecord} */
  const record = {
    jobId,
    niche,
    title,
    jpgPath,
    jpgRelative,
    fileSizeKb,
    colorScheme,
    headline,
    generatedAt: new Date().toISOString(),
  };

  const index = loadIndex();
  const existing = index.findIndex((e) => e.jobId === jobId);
  if (existing >= 0) index[existing] = record;
  else index.unshift(record);

  saveIndex(index);
  logger.info(`[thumbnailStorage] Saved: ${jpgRelative} (${fileSizeKb} KB)`);
  return record;
}

/**
 * Load a thumbnail record by jobId.
 * @param {string} jobId
 * @returns {ThumbnailRecord|null}
 */
function loadThumbnail(jobId) {
  return loadIndex().find((e) => e.jobId === jobId) ?? null;
}

/**
 * Return the full index.
 * @returns {ThumbnailRecord[]}
 */
function listThumbnails() {
  return loadIndex();
}

module.exports = { saveThumbnail, loadThumbnail, listThumbnails, THUMBNAILS_DIR };
