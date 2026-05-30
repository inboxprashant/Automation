/**
 * Caption Storage
 *
 * Persists all caption artefacts to project/captions/<niche>/:
 *
 *   <date>_<jobId>.srt          — segment-level SRT (for FFmpeg burn-in)
 *   <date>_<jobId>.chunked.srt  — word-chunked SRT (fast-paced Shorts style)
 *   <date>_<jobId>.highlighted.srt — chunked SRT with keywords UPPERCASED
 *   <date>_<jobId>.words.json   — word-timestamp data (machine-readable)
 *   <date>_<jobId>.highlights.json — keyword highlight map
 *   <date>_<jobId>.vtt          — WebVTT (per-word cues, for web players)
 *
 * Index: project/captions/index.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CAPTIONS_DIR = path.resolve(__dirname, '..', '..', 'project', 'captions');
const INDEX_FILE   = path.join(CAPTIONS_DIR, 'index.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
  catch { return []; }
}

function saveIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
}

/**
 * @typedef {object} CaptionPaths
 * @property {string} srt              — segment SRT (absolute)
 * @property {string} chunkedSrt       — word-chunked SRT (absolute)
 * @property {string} highlightedSrt   — highlighted SRT (absolute)
 * @property {string} wordsJson        — word timestamps JSON (absolute)
 * @property {string} highlightsJson   — highlight map JSON (absolute)
 * @property {string} vtt              — WebVTT (absolute)
 * @property {string} dir              — directory containing all files
 */

/**
 * @typedef {object} CaptionBundle
 * @property {string} srt
 * @property {string} chunkedSrt
 * @property {string} highlightedSrt
 * @property {object} wordsData
 * @property {Array}  highlights
 * @property {string} vtt
 */

/**
 * Save all caption artefacts for a job.
 *
 * @param {string}        jobId
 * @param {string}        niche
 * @param {CaptionBundle} bundle
 * @returns {CaptionPaths}
 */
function saveCaptions(jobId, niche, bundle) {
  const date     = new Date().toISOString().slice(0, 10);
  const nicheDir = path.join(CAPTIONS_DIR, niche || 'general');
  ensureDir(nicheDir);

  const base = path.join(nicheDir, `${date}_${jobId}`);

  const paths = {
    srt:            `${base}.srt`,
    chunkedSrt:     `${base}.chunked.srt`,
    highlightedSrt: `${base}.highlighted.srt`,
    wordsJson:      `${base}.words.json`,
    highlightsJson: `${base}.highlights.json`,
    vtt:            `${base}.vtt`,
    dir:            nicheDir,
  };

  // Write all artefacts
  fs.writeFileSync(paths.srt,            bundle.srt,            'utf8');
  fs.writeFileSync(paths.chunkedSrt,     bundle.chunkedSrt,     'utf8');
  fs.writeFileSync(paths.highlightedSrt, bundle.highlightedSrt, 'utf8');
  fs.writeFileSync(paths.vtt,            bundle.vtt,            'utf8');
  fs.writeFileSync(paths.wordsJson,      JSON.stringify(bundle.wordsData,  null, 2), 'utf8');
  fs.writeFileSync(paths.highlightsJson, JSON.stringify(bundle.highlights, null, 2), 'utf8');

  // Relative paths for logging / index
  const rel = (p) => path.relative(process.cwd(), p).replace(/\\/g, '/');

  logger.info(`[captionStorage] Saved captions for job ${jobId}:`);
  logger.info(`  SRT (segments)  : ${rel(paths.srt)}`);
  logger.info(`  SRT (chunked)   : ${rel(paths.chunkedSrt)}`);
  logger.info(`  SRT (highlight) : ${rel(paths.highlightedSrt)}`);
  logger.info(`  Word timestamps : ${rel(paths.wordsJson)}`);
  logger.info(`  Highlight map   : ${rel(paths.highlightsJson)}`);
  logger.info(`  WebVTT          : ${rel(paths.vtt)}`);

  // Update index
  const index = loadIndex();
  const existing = index.findIndex((e) => e.jobId === jobId);
  const entry = {
    jobId,
    niche: niche || 'general',
    cueCount:       bundle.wordsData?.totalWords ?? 0,
    highlightCount: bundle.highlights?.length ?? 0,
    duration:       bundle.wordsData?.totalDuration ?? 0,
    generatedAt:    new Date().toISOString(),
    files: {
      srt:            rel(paths.srt),
      chunkedSrt:     rel(paths.chunkedSrt),
      highlightedSrt: rel(paths.highlightedSrt),
      wordsJson:      rel(paths.wordsJson),
      highlightsJson: rel(paths.highlightsJson),
      vtt:            rel(paths.vtt),
    },
  };

  if (existing >= 0) index[existing] = entry;
  else index.unshift(entry);

  saveIndex(index);
  return paths;
}

/**
 * Load caption paths for a job from the index.
 * @param {string} jobId
 * @returns {{ files: object }|null}
 */
function loadCaptionRecord(jobId) {
  const index = loadIndex();
  return index.find((e) => e.jobId === jobId) ?? null;
}

/**
 * Return the full index.
 * @returns {Array<object>}
 */
function listCaptions() {
  return loadIndex();
}

module.exports = { saveCaptions, loadCaptionRecord, listCaptions, CAPTIONS_DIR };
