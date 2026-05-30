/**
 * Voice storage — persists generated MP3 files to project/voices/.
 *
 * File naming: project/voices/<niche>/<YYYY-MM-DD>_<jobId>.mp3
 * Metadata:    project/voices/<niche>/<YYYY-MM-DD>_<jobId>.json
 * Index:       project/voices/index.json
 *
 * The metadata sidecar stores everything needed to re-use or audit
 * a voice file without re-generating it.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const VOICES_DIR = path.resolve(__dirname, '..', '..', 'project', 'voices');
const INDEX_FILE = path.join(VOICES_DIR, 'index.json');

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
 * @typedef {object} VoiceRecord
 * @property {string} jobId
 * @property {string} niche
 * @property {string} voiceId
 * @property {string} voiceName
 * @property {string} scriptTitle
 * @property {number} characterCount
 * @property {number} durationEstimate   — seconds (word count ÷ 2.2)
 * @property {string} mp3Path            — absolute path
 * @property {string} mp3Relative        — relative path (for portability)
 * @property {string} generatedAt        — ISO timestamp
 */

/**
 * Save an MP3 buffer to disk and write a metadata sidecar.
 *
 * @param {Buffer}  audioBuffer
 * @param {object}  meta
 * @param {string}  meta.jobId
 * @param {string}  meta.niche
 * @param {string}  meta.voiceId
 * @param {string}  meta.voiceName
 * @param {string}  meta.scriptTitle
 * @param {string}  meta.narration       — full narration text
 * @returns {VoiceRecord}
 */
function saveVoice(audioBuffer, meta) {
  const { jobId, niche = 'general', voiceId, voiceName, scriptTitle, narration = '' } = meta;

  const date = new Date().toISOString().slice(0, 10);
  const nicheDir = path.join(VOICES_DIR, niche);
  ensureDir(nicheDir);

  const baseName  = `${date}_${jobId}`;
  const mp3Path   = path.join(nicheDir, `${baseName}.mp3`);
  const jsonPath  = path.join(nicheDir, `${baseName}.json`);
  const mp3Rel    = path.relative(process.cwd(), mp3Path).replace(/\\/g, '/');

  // Write MP3
  fs.writeFileSync(mp3Path, audioBuffer);

  const wordCount = narration.trim().split(/\s+/).filter(Boolean).length;
  const durationEstimate = Math.round(wordCount / 2.2);

  /** @type {VoiceRecord} */
  const record = {
    jobId,
    niche,
    voiceId,
    voiceName,
    scriptTitle,
    characterCount: narration.length,
    durationEstimate,
    mp3Path,
    mp3Relative: mp3Rel,
    generatedAt: new Date().toISOString(),
  };

  // Write sidecar JSON
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2), 'utf8');

  // Update index
  const index = loadIndex();
  index.unshift({
    jobId,
    niche,
    voiceName,
    scriptTitle,
    durationEstimate,
    generatedAt: record.generatedAt,
    file: mp3Rel,
  });
  saveIndex(index);

  logger.info(`[voiceStorage] Saved: ${mp3Rel} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
  return record;
}

/**
 * Load a voice record by jobId (reads the sidecar JSON).
 * @param {string} jobId
 * @returns {VoiceRecord|null}
 */
function loadVoiceRecord(jobId) {
  const index = loadIndex();
  const entry = index.find((e) => e.jobId === jobId);
  if (!entry) return null;

  // Derive JSON sidecar path from MP3 path
  const jsonPath = path.resolve(process.cwd(), entry.file.replace(/\.mp3$/, '.json'));
  if (!fs.existsSync(jsonPath)) return null;

  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

/**
 * Return the index of all saved voice files.
 * @returns {Array<object>}
 */
function listVoices() {
  return loadIndex();
}

module.exports = { saveVoice, loadVoiceRecord, listVoices, VOICES_DIR };
