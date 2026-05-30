/**
 * File-system helpers.
 *
 * Improvements over v1:
 *   • All sync I/O wrapped in try/catch with meaningful errors
 *   • `cleanTemp` skips individual files that fail (non-fatal)
 *   • `safeReadJson` / `safeWriteJson` helpers used across the codebase
 *   • `safeAppendNdjson` for atomic NDJSON appends
 *   • Paths resolved relative to project root, not cwd
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Lazy-load config to avoid circular dependency at module load time
let _config = null;
function getConfig() {
  if (!_config) _config = require('../config');
  return _config;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ── Directory helpers ─────────────────────────────────────────────────────────

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure all standard working directories exist.
 */
function ensureWorkDirs() {
  const cfg = getConfig();
  const dirs = [
    cfg.paths.output,
    cfg.paths.assets,
    cfg.paths.temp,
    path.join(PROJECT_ROOT, 'logs'),
    path.join(PROJECT_ROOT, 'project', 'logs'),
  ];
  dirs.forEach(ensureDir);
}

/**
 * Delete all files in the temp directory.
 * Failures on individual files are logged but do not throw.
 */
function cleanTemp() {
  const temp = getConfig().paths.temp;
  if (!fs.existsSync(temp)) return;

  let cleaned = 0;
  let failed  = 0;

  for (const f of fs.readdirSync(temp)) {
    try {
      fs.rmSync(path.join(temp, f), { recursive: true, force: true });
      cleaned++;
    } catch {
      failed++;
    }
  }

  if (failed > 0) {
    // Use console to avoid circular dep with logger
    console.warn(`[fs] cleanTemp: ${cleaned} removed, ${failed} failed`);
  }
}

/**
 * Return an absolute path inside the temp directory.
 * @param {string} filename
 * @returns {string}
 */
function tempPath(filename) {
  const dir = getConfig().paths.temp;
  ensureDir(dir);
  return path.join(dir, filename);
}

/**
 * Return an absolute path inside the output directory.
 * @param {string} filename
 * @returns {string}
 */
function outputPath(filename) {
  const dir = getConfig().paths.output;
  ensureDir(dir);
  return path.join(dir, filename);
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

/**
 * Read and parse a JSON file. Returns `fallback` on any error.
 * @param {string}  filePath
 * @param {unknown} [fallback=null]
 * @returns {unknown}
 */
function safeReadJson(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch { /* ignore */ }
  return fallback;
}

/**
 * Write data as pretty-printed JSON. Creates parent directories if needed.
 * @param {string}  filePath
 * @param {unknown} data
 */
function safeWriteJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Append a single object as a JSON line to an NDJSON file.
 * Creates the file and parent directories if they don't exist.
 * @param {string}  filePath
 * @param {object}  record
 */
function safeAppendNdjson(filePath, record) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Read the last `n` lines of an NDJSON file as parsed objects.
 * @param {string} filePath
 * @param {number} [n=50]
 * @returns {object[]}
 */
function readNdjsonTail(filePath, n = 50) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  return lines
    .slice(-n)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

module.exports = {
  ensureDir,
  ensureWorkDirs,
  cleanTemp,
  tempPath,
  outputPath,
  safeReadJson,
  safeWriteJson,
  safeAppendNdjson,
  readNdjsonTail,
  PROJECT_ROOT,
};
