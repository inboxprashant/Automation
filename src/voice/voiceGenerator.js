/**
 * Voice Generator — production ElevenLabs TTS module.
 *
 * Features:
 *   • Voice auto-selection by niche (overridable via env)
 *   • Concurrency gate + per-minute throttle (rateLimiter)
 *   • Smart retry: exponential backoff for 5xx, Retry-After for 429
 *   • Streams the audio response directly to a Buffer (no temp disk writes)
 *   • Saves final MP3 + metadata sidecar to project/voices/<niche>/
 *   • Also writes to temp/ for the downstream pipeline (captions, video)
 *   • Full structured logging at every stage
 *
 * Exported API:
 *   generateVoice(narration, jobId, options?)  → Promise<VoiceResult>
 *   generateVoiceFromScript(script, jobId)     → Promise<VoiceResult>
 *
 * @typedef {object} VoiceResult
 * @property {string} jobId
 * @property {string} mp3Path        — persistent path in project/voices/
 * @property {string} tempPath       — temp copy for pipeline use
 * @property {string} voiceId
 * @property {string} voiceName
 * @property {number} characterCount
 * @property {number} durationEstimate
 * @property {string} niche
 */

'use strict';

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const config      = require('../config');
const logger      = require('../utils/logger');
const { sleep }   = require('../utils/retry');
const { tempPath, ensureDir } = require('../utils/fs');

const { selectVoice }  = require('./voices');
const rateLimiter      = require('./rateLimiter');
const { saveVoice }    = require('./voiceStorage');

// ── Constants ────────────────────────────────────────────────────────────────

const ELEVENLABS_BASE  = 'https://api.elevenlabs.io/v1';
const TTS_MODEL        = 'eleven_multilingual_v2';
const MAX_ATTEMPTS     = 4;
const BASE_DELAY_MS    = 2_000;
const REQUEST_TIMEOUT  = 90_000;   // 90 s — long audio can take a while
const MAX_CHARS        = 5_000;    // ElevenLabs hard limit per request

// ── HTTP client ──────────────────────────────────────────────────────────────

const httpClient = axios.create({
  baseURL: ELEVENLABS_BASE,
  timeout: REQUEST_TIMEOUT,
  headers: { Accept: 'audio/mpeg' },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate and sanitise narration text before sending to the API.
 * @param {string} text
 * @returns {string}
 */
function sanitiseText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Narration text must be a non-empty string');
  }

  const cleaned = text
    .replace(/[\u0000-\u001F\u007F]/g, ' ')  // strip control chars
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) {
    throw new Error('Narration text is empty after sanitisation');
  }

  if (cleaned.length > MAX_CHARS) {
    logger.warn(
      `[voiceGenerator] Text length ${cleaned.length} exceeds ${MAX_CHARS} chars — truncating`
    );
    return cleaned.slice(0, MAX_CHARS);
  }

  return cleaned;
}

/**
 * Make a single TTS API call and return the audio as a Buffer.
 *
 * @param {string} text
 * @param {import('./voices').VoiceProfile} voice
 * @returns {Promise<Buffer>}
 */
async function callTTS(text, voice) {
  const url = `/text-to-speech/${voice.id}`;

  const response = await httpClient.post(
    url,
    {
      text,
      model_id: TTS_MODEL,
      voice_settings: voice.settings,
    },
    {
      headers: {
        'xi-api-key': config.elevenlabs.apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    }
  );

  return Buffer.from(response.data);
}

// ── Core generator ───────────────────────────────────────────────────────────

/**
 * Generate voice audio for a narration string.
 *
 * @param {string} narration   — full narration text (hook + body + cta)
 * @param {string} jobId       — pipeline job ID
 * @param {object} [options]
 * @param {string} [options.niche]        — used for voice selection + storage path
 * @param {string} [options.scriptTitle]  — used in metadata
 * @param {string} [options.voiceId]      — explicit voice override
 * @returns {Promise<VoiceResult>}
 */
async function generateVoice(narration, jobId, options = {}) {
  const { niche = 'general', scriptTitle = 'Untitled', voiceId } = options;

  const text  = sanitiseText(narration);
  const voice = selectVoice(niche, voiceId ?? config.elevenlabs.voiceId);

  logger.info(
    `[voiceGenerator] Job ${jobId} | voice: ${voice.name} (${voice.id}) | ` +
    `niche: ${niche} | chars: ${text.length}`
  );

  // ── Retry loop ─────────────────────────────────────────────────────────
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    logger.debug(`[voiceGenerator] Attempt ${attempt}/${MAX_ATTEMPTS}`);

    // Acquire concurrency slot + throttle
    await rateLimiter.acquire();
    await rateLimiter.throttle();

    try {
      const startMs = Date.now();
      const audioBuffer = await callTTS(text, voice);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

      logger.info(
        `[voiceGenerator] TTS complete in ${elapsed}s | ` +
        `size: ${(audioBuffer.length / 1024).toFixed(1)} KB`
      );

      // ── Persist to project/voices/ ──────────────────────────────────
      const record = saveVoice(audioBuffer, {
        jobId,
        niche,
        voiceId: voice.id,
        voiceName: voice.name,
        scriptTitle,
        narration: text,
      });

      // ── Write temp copy for downstream pipeline ──────────────────────
      const tmp = tempPath(`${jobId}_voice.mp3`);
      fs.writeFileSync(tmp, audioBuffer);
      logger.debug(`[voiceGenerator] Temp copy: ${tmp}`);

      return {
        jobId,
        mp3Path:          record.mp3Path,
        tempPath:         tmp,
        voiceId:          voice.id,
        voiceName:        voice.name,
        characterCount:   record.characterCount,
        durationEstimate: record.durationEstimate,
        niche,
      };

    } catch (err) {
      lastError = err;

      if (rateLimiter.isRateLimitError(err)) {
        const waitMs = rateLimiter.parseRetryAfter(err, 30_000);
        logger.warn(
          `[voiceGenerator] Rate limited (429) on attempt ${attempt}. ` +
          `Waiting ${(waitMs / 1000).toFixed(0)}s before retry...`
        );
        await sleep(waitMs);

      } else if (rateLimiter.isRetryableServerError(err)) {
        const waitMs = BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn(
          `[voiceGenerator] Server error ${err.response?.status} on attempt ${attempt}. ` +
          `Retrying in ${waitMs}ms...`
        );
        await sleep(waitMs);

      } else {
        // Non-retryable error (4xx other than 429, network error, etc.)
        logger.error(`[voiceGenerator] Non-retryable error: ${err.message}`);
        // Don't retry — break out and try local fallback
        break;
      }
    } finally {
      rateLimiter.release();
    }
  }

  // ── Local TTS fallback ────────────────────────────────────────────────────
  logger.warn(`[voiceGenerator] ElevenLabs unavailable — falling back to local TTS`);
  return generateVoiceLocally(text, jobId, { niche, scriptTitle });
}

// ── Local TTS fallback ────────────────────────────────────────────────────────

/**
 * Generate voice using local pyttsx3 (offline, no API needed).
 * Quality is lower than ElevenLabs but works without any API key.
 *
 * @param {string} text
 * @param {string} jobId
 * @param {object} options
 * @returns {Promise<VoiceResult>}
 */
async function generateVoiceLocally(text, jobId, { niche = 'general', scriptTitle = 'Untitled' } = {}) {
  const { spawn } = require('child_process');
  const pathMod   = require('path');
  const { PROJECT_ROOT } = require('../utils/fs');

  const scriptPath = pathMod.join(PROJECT_ROOT, 'python', 'tts_local.py');
  const tmp        = tempPath(`${jobId}_voice.mp3`);

  logger.info(`[voiceGenerator] Local TTS: ${text.length} chars → ${pathMod.basename(tmp)}`);

  await new Promise((resolve, reject) => {
    const proc = spawn('python', [scriptPath, '--text', text, '--output', tmp, '--rate', '160'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stdout.on('data', (d) => logger.debug(`[tts_local] ${d.toString().trim()}`));
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => { proc.kill(); reject(new Error('Local TTS timed out')); }, 120_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Local TTS failed (exit ${code}): ${stderr.slice(-200)}`));
      resolve();
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });

  if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) {
    throw new Error('[voiceGenerator] Local TTS produced empty output');
  }

  const audioBuffer = fs.readFileSync(tmp);
  const record = saveVoice(audioBuffer, {
    jobId, niche, voiceId: 'local', voiceName: 'Local TTS', scriptTitle, narration: text,
  });

  logger.info(`[voiceGenerator] ✅ Local TTS complete — ${(audioBuffer.length / 1024).toFixed(1)} KB`);

  return {
    jobId,
    mp3Path:          record.mp3Path,
    tempPath:         tmp,
    voiceId:          'local',
    voiceName:        'Local TTS',
    characterCount:   text.length,
    durationEstimate: Math.round(text.split(/\s+/).length / 2.5),
    niche,
  };
}

/**
 * Convenience wrapper — reads narration + metadata directly from a script object.
 *
 * @param {object} script  — output of scriptGenerator.generateScript()
 * @param {string} jobId
 * @returns {Promise<VoiceResult>}
 */
async function generateVoiceFromScript(script, jobId) {
  if (!script?.narration) {
    throw new Error('[voiceGenerator] Script object is missing the "narration" field');
  }

  return generateVoice(script.narration, jobId, {
    niche:       script.niche,
    scriptTitle: script.title,
  });
}

// ── Error enrichment ─────────────────────────────────────────────────────────

/**
 * Attach context to an error before re-throwing.
 * @param {Error} err
 * @param {string} jobId
 * @param {import('./voices').VoiceProfile} voice
 * @param {number} attempt
 * @returns {Error}
 */
function enrichError(err, jobId, voice, attempt) {
  const status  = err?.response?.status;
  const detail  = err?.response?.data
    ? tryParseErrorBody(err.response.data)
    : err.message;

  const msg = [
    `[voiceGenerator] TTS failed after ${attempt} attempt(s).`,
    `Job: ${jobId} | Voice: ${voice.name} (${voice.id})`,
    status ? `HTTP ${status}: ${detail}` : detail,
  ].join(' — ');

  const enriched = new Error(msg);
  enriched.cause = err;
  enriched.jobId = jobId;
  enriched.voiceId = voice.id;
  enriched.httpStatus = status;
  return enriched;
}

/**
 * Try to parse an error body from an arraybuffer or string.
 * @param {any} data
 * @returns {string}
 */
function tryParseErrorBody(data) {
  try {
    const text = Buffer.isBuffer(data) || data instanceof ArrayBuffer
      ? Buffer.from(data).toString('utf8')
      : String(data);
    const parsed = JSON.parse(text);
    return parsed?.detail?.message ?? parsed?.detail ?? text;
  } catch {
    return String(data).slice(0, 200);
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { generateVoice, generateVoiceFromScript };
