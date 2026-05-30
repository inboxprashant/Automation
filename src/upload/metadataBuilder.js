/**
 * Metadata Builder
 *
 * Constructs the YouTube video metadata payload from a script object.
 *
 * Handles:
 *   • Title sanitisation (YouTube max 100 chars, no < > characters)
 *   • Description assembly (body + hashtags + channel branding)
 *   • Tag deduplication and length enforcement (max 500 chars total)
 *   • Hashtag injection into description (YouTube shows first 3)
 *   • Category ID selection by niche
 *   • Privacy status + optional scheduled publish time
 *   • Shorts-specific metadata (#Shorts tag always included)
 */

'use strict';

const config = require('../config');

// ── YouTube category IDs ─────────────────────────────────────────────────────
// https://developers.google.com/youtube/v3/docs/videoCategories/list

const NICHE_CATEGORY = {
  ai_tools:    '28',   // Science & Technology
  tech_facts:  '28',
  automation:  '28',
  money_facts: '22',   // People & Blogs
  productivity:'22',
  general:     '22',
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_TITLE_LEN       = 100;
const MAX_DESC_LEN        = 5000;
const MAX_TAGS_TOTAL_CHARS = 500;
const SHORTS_TAG          = 'Shorts';
const DEFAULT_LANGUAGE    = 'en';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitise a YouTube title.
 * Removes forbidden characters, trims whitespace, enforces length.
 * @param {string} raw
 * @returns {string}
 */
function sanitiseTitle(raw) {
  return (raw ?? '')
    .replace(/[<>]/g, '')          // YouTube rejects these
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LEN);
}

/**
 * Build the full video description.
 *
 * Structure:
 *   <script description>
 *
 *   <hashtags line>
 *
 *   ─────────────────────────────
 *   📺 <channel name>
 *   🔔 Subscribe for daily Shorts!
 *
 * @param {object} script
 * @returns {string}
 */
function buildDescription(script) {
  const parts = [];

  // Main description from script
  if (script.description) {
    parts.push(script.description.trim());
  }

  // Hashtag line — YouTube surfaces the first 3 in the feed
  const hashtags = buildHashtags(script);
  if (hashtags.length > 0) {
    parts.push('');
    parts.push(hashtags.join(' '));
  }

  // Channel branding footer
  const channelName = config.youtube.channelName ?? 'Our Channel';
  parts.push('');
  parts.push('─'.repeat(32));
  parts.push(`📺 ${channelName}`);
  parts.push('🔔 Subscribe for daily Shorts!');

  return parts.join('\n').slice(0, MAX_DESC_LEN);
}

/**
 * Build the hashtag list for the description.
 * Always includes #Shorts. Deduplicates and normalises.
 *
 * @param {object} script
 * @returns {string[]}
 */
function buildHashtags(script) {
  const raw = [
    SHORTS_TAG,
    ...(script.tags ?? []),
    ...(script.keywords ?? []).slice(0, 3),
    script.niche ?? '',
  ];

  const seen = new Set();
  const tags = [];

  for (const tag of raw) {
    const clean = tag.trim().replace(/\s+/g, '').replace(/^#/, '');
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    tags.push(`#${clean}`);
  }

  return tags.slice(0, 15);   // YouTube allows up to 15 hashtags in description
}

/**
 * Build the tags array for the snippet.tags field.
 * Enforces the 500-character total limit.
 *
 * @param {object} script
 * @returns {string[]}
 */
function buildTags(script) {
  const raw = [
    SHORTS_TAG,
    ...(script.tags ?? []),
    ...(script.keywords ?? []),
  ];

  const seen = new Set();
  const tags = [];
  let totalChars = 0;

  for (const tag of raw) {
    const clean = tag.trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    if (totalChars + clean.length + 1 > MAX_TAGS_TOTAL_CHARS) break;
    seen.add(clean.toLowerCase());
    tags.push(clean);
    totalChars += clean.length + 1;
  }

  return tags;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @typedef {object} VideoMetadata
 * @property {object} snippet
 * @property {object} status
 */

/**
 * Build the full YouTube video metadata payload.
 *
 * @param {object} script         — script object from scriptGenerator
 * @param {object} [opts]
 * @param {string} [opts.privacyStatus]   — 'public' | 'private' | 'unlisted'
 * @param {string} [opts.scheduledFor]    — ISO 8601 datetime for scheduled publish
 * @returns {VideoMetadata}
 */
function buildMetadata(script, { privacyStatus = 'public', scheduledFor = null } = {}) {
  const title       = sanitiseTitle(script.title);
  const description = buildDescription(script);
  const tags        = buildTags(script);
  const categoryId  = NICHE_CATEGORY[script.niche] ?? NICHE_CATEGORY.general;

  const snippet = {
    title,
    description,
    tags,
    categoryId,
    defaultLanguage:      DEFAULT_LANGUAGE,
    defaultAudioLanguage: DEFAULT_LANGUAGE,
  };

  // Status — scheduled publish requires 'private' initially
  const status = {
    selfDeclaredMadeForKids: false,
    madeForKids:             false,
  };

  if (scheduledFor) {
    // YouTube requires privacyStatus = 'private' for scheduled uploads
    status.privacyStatus      = 'private';
    status.publishAt          = new Date(scheduledFor).toISOString();
  } else {
    status.privacyStatus = privacyStatus;
  }

  return { snippet, status };
}

module.exports = { buildMetadata, sanitiseTitle, buildDescription, buildTags, buildHashtags };
