/**
 * Script output validator.
 *
 * Validates the JSON returned by OpenAI against the expected schema.
 * Returns { valid: true, script } or { valid: false, errors: string[] }.
 *
 * Also runs auto-repair for common fixable issues (e.g. missing narration,
 * wrong tag count) so we don't waste a retry on trivial problems.
 */

const REQUIRED_FIELDS = [
  'title', 'description', 'tags', 'niche', 'angle',
  'hook', 'body', 'cta', 'narration', 'estimatedDuration', 'keywords',
];

const MAX_TITLE_LEN = 60;
const MAX_DESC_LEN = 200;
const BODY_WORDS_MIN = 80;   // allow slight under-count after repair
const BODY_WORDS_MAX = 130;  // allow slight over-count
const EXACT_TAGS = 8;
const HASHTAG_RE = /#\w+/g;

/**
 * Count words in a string.
 * @param {string} str
 * @returns {number}
 */
function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Attempt to auto-repair common issues before failing validation.
 * Mutates the script object in place.
 *
 * @param {Record<string, any>} script
 */
function autoRepair(script) {
  // 1. Rebuild narration if missing or clearly wrong
  if (!script.narration || script.narration.trim().length < 20) {
    const parts = [script.hook, script.body, script.cta].filter(Boolean);
    script.narration = parts.join(' ');
  }

  // 2. Trim title if slightly over
  if (typeof script.title === 'string' && script.title.length > MAX_TITLE_LEN) {
    script.title = script.title.slice(0, MAX_TITLE_LEN).trimEnd();
  }

  // 3. Trim description if slightly over
  if (typeof script.description === 'string' && script.description.length > MAX_DESC_LEN) {
    // Preserve trailing hashtags
    const hashMatches = script.description.match(HASHTAG_RE) || [];
    const suffix = hashMatches.slice(-3).join(' ');
    const base = script.description.slice(0, MAX_DESC_LEN - suffix.length - 1).trimEnd();
    script.description = `${base} ${suffix}`.trim();
  }

  // 4. Normalise tags — strip # prefix, deduplicate, trim to 8
  if (Array.isArray(script.tags)) {
    script.tags = [
      ...new Set(script.tags.map((t) => String(t).replace(/^#/, '').trim().toLowerCase())),
    ].slice(0, EXACT_TAGS);
  }

  // 5. Ensure estimatedDuration is an integer
  if (script.estimatedDuration !== undefined) {
    script.estimatedDuration = Math.round(Number(script.estimatedDuration));
  } else if (script.narration) {
    script.estimatedDuration = Math.round(wordCount(script.narration) / 2.2);
  }

  // 6. Ensure keywords is an array
  if (!Array.isArray(script.keywords)) {
    script.keywords = [];
  }
}

/**
 * Validate a parsed script object.
 *
 * @param {Record<string, any>} script
 * @returns {{ valid: boolean, script: Record<string, any>, errors: string[] }}
 */
function validateScript(script) {
  if (!script || typeof script !== 'object') {
    return { valid: false, script, errors: ['Response is not a JSON object'] };
  }

  // Run repairs first — fixes trivial issues before we check
  autoRepair(script);

  const errors = [];

  // ── Required fields ──────────────────────────────────────────────────────
  for (const field of REQUIRED_FIELDS) {
    if (script[field] === undefined || script[field] === null || script[field] === '') {
      errors.push(`Missing or empty field: "${field}"`);
    }
  }

  if (errors.length > 0) return { valid: false, script, errors };

  // ── Field-level checks ───────────────────────────────────────────────────
  if (script.title.length > MAX_TITLE_LEN) {
    errors.push(`title too long: ${script.title.length} chars (max ${MAX_TITLE_LEN})`);
  }

  if (script.description.length > MAX_DESC_LEN) {
    errors.push(`description too long: ${script.description.length} chars (max ${MAX_DESC_LEN})`);
  }

  const descHashtags = (script.description.match(HASHTAG_RE) || []).length;
  if (descHashtags < 1) {
    errors.push('description must contain at least 1 hashtag');
  }

  if (!Array.isArray(script.tags) || script.tags.length !== EXACT_TAGS) {
    errors.push(`tags must be an array of exactly ${EXACT_TAGS} items (got ${script.tags?.length ?? 0})`);
  }

  const bodyWords = wordCount(script.body || '');
  if (bodyWords < BODY_WORDS_MIN || bodyWords > BODY_WORDS_MAX) {
    errors.push(`body word count out of range: ${bodyWords} words (expected ${BODY_WORDS_MIN}–${BODY_WORDS_MAX})`);
  }

  if (typeof script.estimatedDuration !== 'number' || script.estimatedDuration < 20 || script.estimatedDuration > 90) {
    errors.push(`estimatedDuration must be a number between 20 and 90 (got ${script.estimatedDuration})`);
  }

  return {
    valid: errors.length === 0,
    script,
    errors,
  };
}

module.exports = { validateScript, autoRepair, wordCount };
