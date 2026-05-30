/**
 * Config loader.
 *
 * Responsibilities:
 *   1. Locate and load the correct .env file for the current NODE_ENV
 *   2. Run the validator
 *   3. Build and export the structured config object used by the rest of the app
 *
 * Load order (later files override earlier ones):
 *   .env  →  .env.local  →  .env.<NODE_ENV>  →  .env.<NODE_ENV>.local
 *
 * This mirrors the convention used by Create React App / Vite / Next.js
 * so the pattern is familiar to most developers.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { validate, redact } = require('./validator');

// ── 1. Determine root ────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..', '..');

// ── 2. Load .env files in priority order ─────────────────────────────────────
function loadEnvFiles() {
  const nodeEnv = process.env.NODE_ENV || 'production';

  const candidates = [
    '.env',
    '.env.local',
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  for (const file of candidates) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      // override: true so later files win
      dotenv.config({ path: fullPath, override: true });
    }
  }
}

// ── 3. Build structured config ───────────────────────────────────────────────

/**
 * Treat placeholder values ('...', 'xxx...', empty) as null.
 * @param {string|null} val
 * @returns {string|null}
 */
function _cleanApiKey(val) {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed === '...' || trimmed === '' || /^x+$/i.test(trimmed)) return null;
  return trimmed;
}

function buildConfig(env) {
  return {
    /** Runtime environment */
    env: env.NODE_ENV,

    /** OpenAI settings */
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
    },

    /** ElevenLabs TTS settings */
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY,
      voiceId: env.ELEVENLABS_VOICE_ID,
    },

    /** YouTube Data API v3 settings */
    youtube: {
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      redirectUri: env.YOUTUBE_REDIRECT_URI,
      refreshToken: env.YOUTUBE_REFRESH_TOKEN,
      channelName: env.CHANNEL_NAME,
    },

    /** Gmail SMTP settings */
    gmail: {
      user:        env.GMAIL_USER,
      // Normalise: strip spaces from App Password (users often copy with spaces)
      appPassword: (env.GMAIL_PASS ?? '').replace(/\s/g, ''),
      notifyEmail: env.NOTIFY_EMAIL || env.GMAIL_USER,
    },

    /** Pipeline / scheduling settings */
    pipeline: {
      topicCategory: env.TOPIC_CATEGORY,
      shortsPerDay:  env.SHORTS_PER_DAY,
      cronSchedule:  env.CRON_SCHEDULE,
      uploadTimes:   env.UPLOAD_TIMES   ?? '09:00,15:00,20:00',
      timezone:      env.SCHEDULE_TIMEZONE ?? 'UTC',
      slotNiches:    env.SLOT_NICHES    ?? null,
      videoPostTime: env.VIDEO_POST_TIME,
    },

    /** File-system paths */
    paths: {
      output: env.OUTPUT_FOLDER,
      assets: env.ASSETS_DIR,
      temp:   env.TEMP_DIR,
    },

    /** Stock media APIs */
    media: {
      pexelsApiKey:   _cleanApiKey(env.PEXELS_API_KEY),
      pixabayApiKey:  _cleanApiKey(env.PIXABAY_API_KEY),
      targetClips:    env.MEDIA_TARGET_CLIPS ?? 6,
    },

    /** Logging */
    log: {
      level: env.LOG_LEVEL,
    },
  };
}

// ── 4. Load, validate, export ────────────────────────────────────────────────
loadEnvFiles();
const validated = validate();
const config = buildConfig(validated);

// Expose redacted snapshot for safe logging (no secrets)
config._redacted = redact(validated);

module.exports = config;
