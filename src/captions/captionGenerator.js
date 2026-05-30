/**
 * Caption Generator — main orchestrator.
 *
 * Transcription strategy (tries in order):
 *   1. OpenAI Whisper API  — best quality, requires API credits
 *   2. Local Whisper       — runs via python/transcribe.py, no API needed
 *
 * All artefacts saved to project/captions/<niche>/
 */

'use strict';

const OpenAI  = require('openai');
const fs      = require('fs');
const path    = require('path');
const { spawn } = require('child_process');

const config  = require('../config');
const logger  = require('../utils/logger');
const { retry }    = require('../utils/retry');
const { tempPath, PROJECT_ROOT } = require('../utils/fs');

const { segmentsToSrt, wordsToChunkedSrt, validateSrt } = require('./srtFormatter');
const { processWords, wordsToVtt }                       = require('./wordTimestamps');
const { buildHighlightMap, buildHighlightedSrt }         = require('./keywordHighlighter');
const { saveCaptions }                                   = require('./captionStorage');

const WHISPER_MODEL = 'whisper-1';
const WORDS_PER_CUE = 3;
const MIN_SCORE     = 55;

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: config.openai.apiKey });
  return _client;
}

// ── OpenAI Whisper API ────────────────────────────────────────────────────────

async function transcribeViaAPI(audioPath, jobId) {
  logger.info(`[captionGenerator] Transcribing via OpenAI API: ${path.basename(audioPath)}`);

  const transcription = await retry(
    () => getClient().audio.transcriptions.create({
      file:                    fs.createReadStream(audioPath),
      model:                   WHISPER_MODEL,
      response_format:         'verbose_json',
      timestamp_granularities: ['segment', 'word'],
    }),
    { attempts: 1, delay: 2000, label: `Whisper API (job=${jobId})` }
  );

  return {
    segments: transcription.segments ?? [],
    words:    transcription.words    ?? [],
    duration: transcription.duration ?? 0,
  };
}

// ── Local Whisper fallback ────────────────────────────────────────────────────

function transcribeLocally(audioPath, jobId) {
  return new Promise((resolve, reject) => {
    const outputJson = tempPath(`${jobId}_whisper.json`);
    const scriptPath = path.join(PROJECT_ROOT, 'python', 'transcribe.py');

    logger.info(`[captionGenerator] Transcribing locally (no API): ${path.basename(audioPath)}`);

    const proc = spawn('python', [scriptPath, '--audio', audioPath, '--output', outputJson, '--model', 'base'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stdout.on('data', (d) => logger.debug(`[whisper:local] ${d.toString().trim()}`));
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Local Whisper timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Local Whisper failed (exit ${code}): ${stderr.slice(-200)}`));
      }
      try {
        const data = JSON.parse(fs.readFileSync(outputJson, 'utf8'));
        // Normalise to same shape as API response
        resolve({
          segments: data.segments ?? [],
          words:    data.words    ?? [],
          duration: data.duration ?? 0,
        });
      } catch (e) {
        reject(new Error(`Failed to parse local Whisper output: ${e.message}`));
      }
    });

    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Quota state (skip API if we know it's exhausted) ─────────────────────────
let _apiQuotaExhausted = false;

async function transcribe(audioPath, jobId) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Try OpenAI API first (skip if quota already known to be exhausted)
  if (!_apiQuotaExhausted) {
    try {
      const result = await transcribeViaAPI(audioPath, jobId);
      if (result.segments.length > 0) return result;
      logger.warn('[captionGenerator] API returned 0 segments — falling back to local Whisper');
    } catch (apiErr) {
      const msg = apiErr.message ?? '';
      const isQuota = msg.includes('429') || msg.includes('quota') || apiErr.cause?.message?.includes('quota');
      const isConn  = msg.includes('Connection error') || msg.includes('ECONNRESET') || msg.includes('timeout');

      if (isQuota) {
        _apiQuotaExhausted = true;
        logger.warn('[captionGenerator] OpenAI quota exhausted — using local Whisper for all future jobs');
      } else if (isConn) {
        logger.warn('[captionGenerator] Whisper API connection failed — using local Whisper');
      } else {
        logger.warn(`[captionGenerator] API failed (${msg.slice(0, 80)}) — falling back to local Whisper`);
      }
    }
  } else {
    logger.info('[captionGenerator] Skipping Whisper API (quota exhausted) — using local Whisper');
  }

  // Local Whisper fallback
  const result = await transcribeLocally(audioPath, jobId);
  if (result.segments.length === 0) {
    throw new Error('[captionGenerator] Both API and local Whisper returned 0 segments');
  }
  return result;
}

// ── Core generator ────────────────────────────────────────────────────────────

async function generateCaptions(audioPath, jobId, options = {}) {
  const { niche = 'general', scriptKeywords = [], scriptTitle = 'Untitled' } = options;

  const startMs = Date.now();
  logger.info(`[captionGenerator] Job ${jobId} | niche: ${niche} | title: "${scriptTitle}"`);

  const { segments, words: rawWords } = await transcribe(audioPath, jobId);

  const srtContent    = segmentsToSrt(segments);
  const srtValidation = validateSrt(srtContent);
  if (!srtValidation.valid) {
    logger.warn(`[captionGenerator] SRT issues: ${srtValidation.errors.join(', ')}`);
  }

  const wordsData      = processWords(rawWords);
  const chunkedSrt     = wordsData.words.length > 0
    ? wordsToChunkedSrt(wordsData.words, { wordsPerCue: WORDS_PER_CUE })
    : srtContent;

  const highlights     = buildHighlightMap(wordsData.words, { niche, scriptKeywords, minScore: MIN_SCORE });
  const highlightedSrt = wordsData.words.length > 0
    ? buildHighlightedSrt(wordsData.words, highlights, { wordsPerCue: WORDS_PER_CUE })
    : chunkedSrt;

  const vtt = wordsToVtt(wordsData.words);

  const persistentPaths = saveCaptions(jobId, niche, {
    srt: srtContent, chunkedSrt, highlightedSrt, wordsData, highlights, vtt,
  });

  const tempSrt            = tempPath(`${jobId}_captions.srt`);
  const tempHighlightedSrt = tempPath(`${jobId}_captions.highlighted.srt`);
  fs.writeFileSync(tempSrt,            srtContent,     'utf8');
  fs.writeFileSync(tempHighlightedSrt, highlightedSrt, 'utf8');

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  logger.info(`[captionGenerator] ✅ Done in ${elapsed}s | words: ${wordsData.totalWords} | highlights: ${highlights.length}`);

  return {
    jobId,
    srtPath:            tempSrt,
    highlightedSrtPath: tempHighlightedSrt,
    persistentSrtPath:  persistentPaths.srt,
    paths:              persistentPaths,
    cueCount:           srtValidation.cueCount,
    wordCount:          wordsData.totalWords,
    highlightCount:     highlights.length,
    duration:           wordsData.totalDuration,
    niche,
  };
}

async function generateCaptionsFromVoiceRecord(voiceRecord, jobId, scriptKeywords = []) {
  if (!voiceRecord?.mp3Path) throw new Error('[captionGenerator] Voice record missing mp3Path');
  return generateCaptions(voiceRecord.mp3Path, jobId, {
    niche: voiceRecord.niche, scriptKeywords, scriptTitle: voiceRecord.scriptTitle,
  });
}

module.exports = { generateCaptions, generateCaptionsFromVoiceRecord };
