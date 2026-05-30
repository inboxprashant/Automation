/**
 * Thumbnail Text Generator
 *
 * Uses GPT-4o to generate high-CTR thumbnail copy from a script object.
 *
 * Returns a structured ThumbnailCopy object with:
 *   headline    — 2–4 words, ALL CAPS, maximum impact
 *   subheadline — 4–7 words, supporting context
 *   badge       — short label for the badge element (e.g. "SHOCKING", "FREE")
 *   emotion     — dominant emotion to drive colour/style selection
 *   arrowLabel  — short text next to the arrow (e.g. "Watch this")
 *   colorScheme — suggested palette key
 *
 * Prompt engineering principles:
 *   • Curiosity gap — headline withholds the answer
 *   • Emotional trigger — fear, greed, curiosity, surprise
 *   • Number specificity — "7x faster" beats "much faster"
 *   • Power words — SECRET, FREE, NEVER, SHOCKING, EXPOSED
 */

'use strict';

const OpenAI  = require('openai');
const config  = require('../config');
const logger  = require('../utils/logger');
const { retry } = require('../utils/retry');

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: config.openai.apiKey });
  return _client;
}

// ── Colour scheme catalogue ──────────────────────────────────────────────────
// Keys are referenced by the AI response and consumed by the Python renderer.

const COLOR_SCHEMES = {
  red_black:    { primary: '#FF0000', secondary: '#000000', accent: '#FFFFFF', text: '#FFFFFF' },
  yellow_black: { primary: '#FFD700', secondary: '#1A1A1A', accent: '#FF4500', text: '#000000' },
  blue_white:   { primary: '#0066FF', secondary: '#FFFFFF', accent: '#00CCFF', text: '#FFFFFF' },
  green_dark:   { primary: '#00CC44', secondary: '#0D1117', accent: '#FFFFFF', text: '#FFFFFF' },
  orange_dark:  { primary: '#FF6600', secondary: '#1A0A00', accent: '#FFCC00', text: '#FFFFFF' },
  purple_gold:  { primary: '#7B2FBE', secondary: '#1A0A2E', accent: '#FFD700', text: '#FFFFFF' },
  white_red:    { primary: '#FFFFFF', secondary: '#CC0000', accent: '#FF4444', text: '#CC0000' },
  cyan_dark:    { primary: '#00FFCC', secondary: '#0A1628', accent: '#FFFFFF', text: '#0A1628' },
};

const VALID_SCHEMES = Object.keys(COLOR_SCHEMES);

const SYSTEM_PROMPT = `You are a YouTube thumbnail copywriter who specialises in maximising 
click-through rates. You understand psychological triggers: curiosity gaps, fear of missing out, 
social proof, and shock value. Your copy is always short, punchy, and impossible to ignore.
Respond with valid JSON only — no markdown, no extra text.`;

/**
 * @param {object} script — script object with title, hook, niche, keywords
 * @returns {string}
 */
function buildUserPrompt(script) {
  return `Generate high-CTR YouTube thumbnail copy for this video:

Title: "${script.title}"
Hook: "${script.hook}"
Niche: ${script.niche}
Keywords: ${(script.keywords ?? []).join(', ')}

Return ONLY this JSON object:
{
  "headline": "2-4 WORDS ALL CAPS — maximum shock/curiosity, no filler",
  "subheadline": "4-7 words — supporting context that creates urgency",
  "badge": "1-2 words for badge element (e.g. SHOCKING, FREE, SECRET, EXPOSED, VIRAL)",
  "emotion": "one of: shock | curiosity | fear | greed | excitement | anger",
  "arrowLabel": "2-4 words next to the arrow pointing at headline (e.g. 'They hide this')",
  "colorScheme": "one of: red_black | yellow_black | blue_white | green_dark | orange_dark | purple_gold | white_red | cyan_dark",
  "ctaText": "3-5 word call to action for bottom strip (e.g. 'Watch Before Deleted')"
}

Rules:
- headline must be ALL CAPS and create an immediate curiosity gap
- subheadline must complement, not repeat, the headline
- colorScheme must match the emotion (red_black for shock/anger, yellow_black for greed, etc.)
- badge must be a single power word or short phrase
- arrowLabel must feel like a whisper pointing at the most important element`;
}

/**
 * Generate thumbnail copy from a script object.
 *
 * @param {object} script
 * @returns {Promise<ThumbnailCopy>}
 *
 * @typedef {object} ThumbnailCopy
 * @property {string} headline
 * @property {string} subheadline
 * @property {string} badge
 * @property {string} emotion
 * @property {string} arrowLabel
 * @property {string} colorScheme
 * @property {string} ctaText
 * @property {object} colors       — resolved colour values
 */
async function generateThumbnailText(script) {
  logger.info(`[textGenerator] Generating thumbnail copy for: "${script.title}"`);

  const model = config.openai.model;
  const supportsJsonMode = model.includes('gpt-4') || model === 'gpt-3.5-turbo-1106' || model === 'gpt-3.5-turbo-0125';

  const requestParams = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: buildUserPrompt(script) },
    ],
    temperature: 0.85,
    max_tokens:  400,
  };
  if (supportsJsonMode) requestParams.response_format = { type: 'json_object' };

  const response = await retry(
    () => getClient().chat.completions.create(requestParams),
    { attempts: 3, delay: 1500, label: 'thumbnail text generation' }
  );

  const raw  = response.choices[0].message.content;
  const data = JSON.parse(raw);

  // Validate and normalise
  data.headline    = (data.headline    ?? script.title).toUpperCase().slice(0, 40);
  data.subheadline = (data.subheadline ?? '').slice(0, 60);
  data.badge       = (data.badge       ?? 'WATCH').toUpperCase().slice(0, 15);
  data.emotion     = data.emotion      ?? 'curiosity';
  data.arrowLabel  = (data.arrowLabel  ?? '').slice(0, 30);
  data.ctaText     = (data.ctaText     ?? 'Watch Now').slice(0, 40);
  data.colorScheme = VALID_SCHEMES.includes(data.colorScheme)
    ? data.colorScheme
    : 'red_black';

  // Attach resolved colour values for the renderer
  data.colors = COLOR_SCHEMES[data.colorScheme];

  logger.info(`[textGenerator] Copy ready — headline: "${data.headline}" | scheme: ${data.colorScheme}`);
  return data;
}

module.exports = { generateThumbnailText, COLOR_SCHEMES };
