/**
 * Render Storage — persists render metadata to project/renders/index.json.
 *
 * The actual MP4 files are written by the Python builder directly into
 * project/renders/<niche>/.  This module only manages the index.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const RENDERS_DIR = path.resolve(__dirname, '..', '..', 'project', 'renders');
const INDEX_FILE  = path.join(RENDERS_DIR, 'index.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return []; }
}

function saveIndex(index) {
  ensureDir(RENDERS_DIR);
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

/**
 * @typedef {object} RenderRecord
 * @property {string} jobId
 * @property {string} niche
 * @property {string} title
 * @property {string} mp4Path        — absolute path
 * @property {string} mp4Relative    — relative path
 * @property {number} fileSizeKb
 * @property {string} generatedAt
 */

/**
 * Register a completed render in the index.
 *
 * @param {object} meta
 * @param {string} meta.jobId
 * @param {string} meta.niche
 * @param {string} meta.title
 * @param {string} meta.mp4Path
 * @returns {RenderRecord}
 */
function saveRender(meta) {
  const { jobId, niche = 'general', title = 'Untitled', mp4Path } = meta;

  const mp4Relative = path.relative(process.cwd(), mp4Path).replace(/\\/g, '/');
  const fileSizeKb  = fs.existsSync(mp4Path)
    ? Math.round(fs.statSync(mp4Path).size / 1024)
    : 0;

  /** @type {RenderRecord} */
  const record = {
    jobId,
    niche,
    title,
    mp4Path,
    mp4Relative,
    fileSizeKb,
    generatedAt: new Date().toISOString(),
  };

  const index = loadIndex();
  const existing = index.findIndex((e) => e.jobId === jobId);
  if (existing >= 0) index[existing] = record;
  else index.unshift(record);

  saveIndex(index);
  logger.info(`[renderStorage] Registered: ${mp4Relative} (${fileSizeKb} KB)`);
  return record;
}

/**
 * Load a render record by jobId.
 * @param {string} jobId
 * @returns {RenderRecord|null}
 */
function loadRender(jobId) {
  return loadIndex().find((e) => e.jobId === jobId) ?? null;
}

/**
 * Return the full render index.
 * @returns {RenderRecord[]}
 */
function listRenders() {
  return loadIndex();
}

module.exports = { saveRender, loadRender, listRenders, RENDERS_DIR };
