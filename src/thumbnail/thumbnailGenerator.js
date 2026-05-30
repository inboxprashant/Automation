/**
 * Thumbnail Generator — Node.js orchestrator.
 *
 * 1. Generates thumbnail copy via GPT-4o  (textGenerator)
 * 2. Spawns the Python renderer           (python/thumbnail_builder.py)
 * 3. Registers the result in storage      (thumbnailStorage)
 * 4. Returns a ThumbnailResult object
 *
 * @typedef {object} ThumbnailResult
 * @property {string} jobId
 * @property {string} jpgPath       — absolute path to the 1280×720 JPG
 * @property {string} jpgRelative   — relative path
 * @property {number} fileSizeKb
 * @property {string} headline
 * @property {string} colorScheme
 * @property {string} niche
 */

'use strict';

const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');

const logger             = require('../utils/logger');
const { generateThumbnailText } = require('./textGenerator');
const { saveThumbnail }  = require('./thumbnailStorage');

const PYTHON_SCRIPT = path.resolve(__dirname, '..', '..', 'python', 'thumbnail_builder.py');
const TIMEOUT_MS    = 60_000;   // 1 minute — image rendering is fast

// ── Python runner ────────────────────────────────────────────────────────────

function runPython(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [PYTHON_SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastLine  = '';
    let stderrBuf = '';

    proc.stdout.on('data', (chunk) => {
      chunk.toString().split('\n').forEach((line) => {
        const t = line.trim();
        if (t) { logger.debug(`[python:thumb] ${t}`); lastLine = t; }
      });
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      lines.forEach((l) => { if (l.trim()) logger.debug(`[python:thumb:err] ${l.trim()}`); });
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`[thumbnailGenerator] Python renderer timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stderrBuf.trim()) logger.debug(`[python:thumb:err] ${stderrBuf.trim()}`);
      if (code !== 0) {
        reject(new Error(`[thumbnailGenerator] Python renderer exited with code ${code}`));
      } else {
        resolve(lastLine);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`[thumbnailGenerator] Failed to spawn Python: ${err.message}`));
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a thumbnail for a script object.
 *
 * @param {object} script  — script with title, hook, niche, keywords
 * @param {string} jobId
 * @returns {Promise<ThumbnailResult>}
 */
async function generateThumbnail(script, jobId) {
  logger.info(`[thumbnailGenerator] Starting job ${jobId}`);

  // ── Step 1: Generate copy ────────────────────────────────────────────────
  const copy = await generateThumbnailText(script);

  // ── Step 2: Determine output path ────────────────────────────────────────
  const date     = new Date().toISOString().slice(0, 10);
  const niche    = script.niche ?? 'general';
  const outDir   = path.resolve(__dirname, '..', '..', 'project', 'thumbnails', niche);
  fs.mkdirSync(outDir, { recursive: true });
  const jpgPath  = path.join(outDir, `${date}_${jobId}.jpg`);

  // ── Step 3: Render via Python ─────────────────────────────────────────────
  logger.info(`[thumbnailGenerator] Rendering thumbnail — scheme: ${copy.colorScheme}`);

  const args = [
    '--output',      jpgPath,
    '--headline',    copy.headline,
    '--subheadline', copy.subheadline,
    '--badge',       copy.badge,
    '--arrow-label', copy.arrowLabel,
    '--cta-text',    copy.ctaText,
    '--scheme',      copy.colorScheme,
    '--emotion',     copy.emotion,
    '--niche',       niche,
    '--job-id',      jobId,
  ];

  const startMs = Date.now();
  await runPython(args);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  if (!fs.existsSync(jpgPath)) {
    throw new Error(`[thumbnailGenerator] Output file not found: ${jpgPath}`);
  }

  // ── Step 4: Register in storage ──────────────────────────────────────────
  const record = saveThumbnail({
    jobId,
    niche,
    title:       script.title,
    jpgPath,
    colorScheme: copy.colorScheme,
    headline:    copy.headline,
  });

  logger.info(`[thumbnailGenerator] ✅ Done in ${elapsed}s — ${record.fileSizeKb} KB`);

  return {
    jobId,
    jpgPath,
    jpgRelative: record.jpgRelative,
    fileSizeKb:  record.fileSizeKb,
    headline:    copy.headline,
    colorScheme: copy.colorScheme,
    niche,
    copy,
  };
}

module.exports = { generateThumbnail };
