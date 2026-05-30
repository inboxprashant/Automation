/**
 * Script Storage
 *
 * Fixes over v1:
 *   • Uses shared safeReadJson / safeWriteJson helpers (no duplicate I/O code)
 *   • Paths resolved from PROJECT_ROOT, not process.cwd() (portable)
 *   • loadScript wraps JSON.parse in try/catch (corrupt file won't crash)
 *   • Index capped at 500 entries to prevent unbounded growth
 *   • jobId validated before lookup
 */

'use strict';

const path   = require('path');
const logger = require('../utils/logger');
const {
  ensureDir,
  safeReadJson,
  safeWriteJson,
  PROJECT_ROOT,
} = require('../utils/fs');

const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'project', 'scripts');
const INDEX_FILE  = path.join(SCRIPTS_DIR, 'index.json');
const MAX_INDEX   = 500;

function loadIndex() {
  return safeReadJson(INDEX_FILE, []);
}

function saveIndex(index) {
  safeWriteJson(INDEX_FILE, index.slice(0, MAX_INDEX));
}

/**
 * Persist a validated script to disk.
 *
 * @param {object} script
 * @param {string} jobId
 * @returns {{ filePath: string, relativePath: string }}
 */
function saveScript(script, jobId) {
  const niche    = script.niche || 'general';
  const date     = new Date().toISOString().slice(0, 10);
  const nicheDir = path.join(SCRIPTS_DIR, niche);
  ensureDir(nicheDir);

  const filePath     = path.join(nicheDir, `${date}_${jobId}.json`);
  const relativePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  const payload = {
    ...script,
    _meta: {
      jobId,
      generatedAt: new Date().toISOString(),
      savedAt:     filePath,
    },
  };

  safeWriteJson(filePath, payload);
  logger.info(`[scriptStorage] Saved: ${relativePath}`);

  const index = loadIndex();
  index.unshift({
    jobId,
    niche,
    title:             script.title,
    angle:             script.angle,
    estimatedDuration: script.estimatedDuration,
    generatedAt:       payload._meta.generatedAt,
    file:              relativePath,
  });
  saveIndex(index);

  return { filePath, relativePath };
}

/**
 * Load a script by jobId.
 * @param {string} jobId
 * @returns {object|null}
 */
function loadScript(jobId) {
  if (!jobId || typeof jobId !== 'string') return null;

  const index = loadIndex();
  const entry = index.find((e) => e.jobId === jobId);
  if (!entry) return null;

  const filePath = path.resolve(PROJECT_ROOT, entry.file);
  return safeReadJson(filePath, null);
}

/**
 * Return the index (summary of all generated scripts).
 * @returns {Array<object>}
 */
function listScripts() {
  return loadIndex();
}

module.exports = { saveScript, loadScript, listScripts, SCRIPTS_DIR };
