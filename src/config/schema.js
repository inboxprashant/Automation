/**
 * Configuration schema.
 *
 * Each entry describes one environment variable:
 *   key        — exact env var name
 *   required   — throws if missing when true
 *   default    — fallback value when not required and not set
 *   type       — 'string' | 'number' | 'boolean'
 *   validate   — optional fn(value) → true | string (error message)
 *   secret     — if true, value is redacted in logs
 *   description — human-readable purpose
 */

const VALID_CATEGORIES = [
  'tech', 'finance', 'motivation', 'facts', 'health', 'history',
  // Extended niches used by the script generator
  'ai_tools', 'tech_facts', 'automation', 'money_facts', 'productivity', 'general',
];
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const VALID_ENVS = ['development', 'production', 'test'];
const CRON_RE = /^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)$/;
const TIME_RE = /^\d{1,2}:\d{2}(\s?[A-Z]{2,5})?$/i;

/** @type {Array<import('./validator').FieldSchema>} */
const schema = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    key: 'OPENAI_API_KEY',
    required: true,
    type: 'string',
    secret: true,
    description: 'OpenAI API key',
    validate: (v) => v.startsWith('sk-') || 'Must start with "sk-"',
  },
  {
    key: 'OPENAI_MODEL',
    required: false,
    default: 'gpt-3.5-turbo',
    type: 'string',
    description: 'OpenAI model name (gpt-4o requires paid tier; gpt-3.5-turbo works on free tier)',
  },

  // ── ElevenLabs ──────────────────────────────────────────────────────────
  {
    key: 'ELEVENLABS_API_KEY',
    required: true,
    type: 'string',
    secret: true,
    description: 'ElevenLabs API key',
  },
  {
    key: 'ELEVENLABS_VOICE_ID',
    required: false,
    default: '21m00Tcm4TlvDq8ikWAM',
    type: 'string',
    description: 'ElevenLabs voice ID',
  },

  // ── YouTube ─────────────────────────────────────────────────────────────
  {
    key: 'YOUTUBE_CLIENT_ID',
    required: true,
    type: 'string',
    secret: true,
    description: 'Google OAuth2 client ID',
  },
  {
    key: 'YOUTUBE_CLIENT_SECRET',
    required: true,
    type: 'string',
    secret: true,
    description: 'Google OAuth2 client secret',
  },
  {
    key: 'YOUTUBE_REDIRECT_URI',
    required: false,
    default: 'http://localhost:3000/oauth2callback',
    type: 'string',
    description: 'OAuth2 redirect URI',
    validate: (v) => {
      try { new URL(v); return true; } catch { return 'Must be a valid URL'; }
    },
  },
  {
    key: 'YOUTUBE_REFRESH_TOKEN',
    required: true,
    type: 'string',
    secret: true,
    description: 'YouTube OAuth2 refresh token',
  },
  {
    key: 'CHANNEL_NAME',
    required: true,
    type: 'string',
    description: 'YouTube channel display name',
    validate: (v) => v.trim().length > 0 || 'Cannot be blank',
  },

  // ── Gmail ────────────────────────────────────────────────────────────────
  {
    key: 'GMAIL_USER',
    required: true,
    type: 'string',
    description: 'Gmail address for sending notifications',
    validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Must be a valid email address',
  },
  {
    key: 'GMAIL_PASS',
    required: true,
    type: 'string',
    secret: true,
    description: 'Gmail App Password (16 chars, spaces allowed)',
    validate: (v) => {
      const clean = v.replace(/\s/g, '');
      // Allow placeholder during development — warn but don't block startup
      if (clean === 'xxxxxxxxxxxxxxxx' || clean === 'xxxxxxxxxxxx' || v.includes('xxxx')) return true;
      return clean.length === 16 || 'Must be exactly 16 characters (spaces ignored). Generate at: https://myaccount.google.com/apppasswords';
    },
  },
  {
    key: 'NOTIFY_EMAIL',
    required: false,
    default: null, // resolved at runtime to GMAIL_USER
    type: 'string',
    description: 'Notification recipient email',
    validate: (v) =>
      !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Must be a valid email address',
  },

  // ── Pipeline ─────────────────────────────────────────────────────────────
  {
    key: 'TOPIC_CATEGORY',
    required: false,
    default: 'tech',
    type: 'string',
    description: 'Script generation niche',
    validate: (v) =>
      VALID_CATEGORIES.includes(v) ||
      `Must be one of: ${VALID_CATEGORIES.join(', ')}`,
  },
  {
    key: 'SHORTS_PER_DAY',
    required: false,
    default: '1',
    type: 'number',
    description: 'Number of Shorts to publish per day',
    validate: (v) => (v >= 1 && v <= 10) || 'Must be between 1 and 10',
  },
  {
    key: 'CRON_SCHEDULE',
    required: false,
    default: '0 9 * * *',
    type: 'string',
    description: 'Cron expression for the scheduler (legacy — prefer UPLOAD_TIMES)',
    validate: (v) => CRON_RE.test(v.trim()) || 'Must be a valid 5-part cron expression',
  },
  {
    key: 'UPLOAD_TIMES',
    required: false,
    default: '09:00,15:00,20:00',
    type: 'string',
    description: 'Comma-separated HH:MM upload times, e.g. "09:00,15:00,20:00"',
  },
  {
    key: 'SCHEDULE_TIMEZONE',
    required: false,
    default: 'UTC',
    type: 'string',
    description: 'IANA timezone for the scheduler, e.g. "America/New_York"',
  },
  {
    key: 'SLOT_NICHES',
    required: false,
    default: null,
    type: 'string',
    description: 'Optional comma-separated niche per upload slot, e.g. "ai_tools,,money_facts"',
  },
  {
    key: 'VIDEO_POST_TIME',
    required: false,
    default: '09:00 UTC',
    type: 'string',
    description: 'Human-readable post time shown in notifications',
    validate: (v) => TIME_RE.test(v.trim()) || 'Must match HH:MM [TZ] format, e.g. "09:00 UTC"',
  },

  // ── Paths ────────────────────────────────────────────────────────────────
  {
    key: 'OUTPUT_FOLDER',
    required: false,
    default: './output',
    type: 'string',
    description: 'Directory where finished MP4s are saved',
  },
  {
    key: 'ASSETS_DIR',
    required: false,
    default: './assets',
    type: 'string',
    description: 'Directory containing background video clips',
  },
  {
    key: 'TEMP_DIR',
    required: false,
    default: './temp',
    type: 'string',
    description: 'Scratch directory for intermediate files',
  },

  // ── Stock Media APIs ─────────────────────────────────────────────────────
  {
    key: 'PEXELS_API_KEY',
    required: false,
    default: null,
    type: 'string',
    secret: true,
    description: 'Pexels API key for stock video downloads',
  },
  {
    key: 'PIXABAY_API_KEY',
    required: false,
    default: null,
    type: 'string',
    secret: true,
    description: 'Pixabay API key for stock video downloads',
  },
  {
    key: 'MEDIA_TARGET_CLIPS',
    required: false,
    default: '6',
    type: 'number',
    description: 'Number of stock clips to fetch per video',
    validate: (v) => (v >= 1 && v <= 20) || 'Must be between 1 and 20',
  },

  // ── Runtime ──────────────────────────────────────────────────────────────
  {
    key: 'HEALTH_PORT',
    required: false,
    default: '3002',
    type: 'number',
    description: 'Port for the health check HTTP server',
    validate: (v) => (v >= 1024 && v <= 65535) || 'Must be between 1024 and 65535',
  },
  {
    key: 'LOG_LEVEL',
    required: false,
    default: 'info',
    type: 'string',
    description: 'Winston log level',
    validate: (v) =>
      VALID_LOG_LEVELS.includes(v) ||
      `Must be one of: ${VALID_LOG_LEVELS.join(', ')}`,
  },
  {
    key: 'NODE_ENV',
    required: false,
    default: 'production',
    type: 'string',
    description: 'Runtime environment',
    validate: (v) =>
      VALID_ENVS.includes(v) ||
      `Must be one of: ${VALID_ENVS.join(', ')}`,
  },
];

module.exports = schema;
