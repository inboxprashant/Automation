/**
 * AI Script Generator
 *
 * Generates viral YouTube Shorts scripts using OpenAI GPT-4o.
 *
 * Pipeline per call:
 *   1. Pick a topic from the topic bank (by niche or random)
 *   2. Build system + user prompts via the prompt engine
 *   3. Call OpenAI with json_object response format
 *   4. Parse + validate the response (with auto-repair)
 *   5. Retry up to MAX_RETRIES times on validation failure
 *   6. Save the validated script to project/scripts/<niche>/
 *   7. Return the script object
 *
 * Exported API:
 *   generateScript(category?, jobId?)  → Promise<ScriptResult>
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

const config = require('../config');
const logger = require('../utils/logger');
const { retry, sleep } = require('../utils/retry');

const { pickTopic, resolveNiche } = require('./topics');
const { buildPrompts } = require('./prompts');
const { validateScript } = require('./scriptValidator');
const { saveScript } = require('./scriptStorage');

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ── Local script fallback (no OpenAI needed) ─────────────────────────────────

/**
 * Generate a script locally from the topic bank without calling OpenAI.
 * Used when the API quota is exceeded.
 *
 * @param {import('./topics').Topic} topic
 * @param {string} jobId
 * @returns {object} script object
 */
function generateScriptLocally(topic, jobId) {
  logger.warn(`[scriptGenerator] Using LOCAL fallback (no OpenAI) for job ${jobId}`);

  const kw       = topic.keywords.slice(0, 5);
  const kwStr    = kw.join(', ');
  const niche    = topic.niche;
  const angle    = topic.angle;

  // Build a structured script from the topic data
  const hook  = `Did you know ${angle.toLowerCase()}? This changes everything.`;
  const body  = `Here's what most people don't know. ${angle}. ` +
    `This is one of the most powerful things happening right now in ${niche.replace('_', ' ')}. ` +
    `The people using this are getting results that seem impossible. ` +
    `And the best part? You can start today, completely free. ` +
    `Most people scroll past this and wonder why they're stuck. ` +
    `Don't be that person. The information is out there. You just have to use it.`;
  const cta   = `Follow for more ${niche.replace('_', ' ')} tips every day.`;

  const title       = angle.length <= 60 ? angle : angle.slice(0, 57) + '...';
  const description = `${angle}. ${kw.slice(0, 2).join(' ')} tips you need to know. #${niche} #Shorts #${kw[0]?.replace(/\s+/g, '') ?? 'AI'}`;
  const tags        = [...kw.map(k => k.replace(/\s+/g, '')), niche, 'Shorts', 'viral', 'tips'].slice(0, 8);

  return {
    title,
    description,
    tags,
    niche,
    angle,
    hook,
    body,
    cta,
    narration:         `${hook} ${body} ${cta}`,
    estimatedDuration: 45,
    keywords:          kw,
  };
}

// Temperature schedule: start creative, cool down on retries
const TEMPERATURES = [0.92, 0.75, 0.55];

// ── OpenAI client (lazy singleton) ──────────────────────────────────────────

let _client = null;
function getClient() {
  if (!_client) _client = new OpenAI({ apiKey: config.openai.apiKey });
  return _client;
}

// ── Core generator ───────────────────────────────────────────────────────────

/**
 * @typedef {object} ScriptResult
 * @property {string}   jobId
 * @property {string}   title
 * @property {string}   description
 * @property {string[]} tags
 * @property {string}   niche
 * @property {string}   angle
 * @property {string}   hook
 * @property {string}   body
 * @property {string}   cta
 * @property {string}   narration        — hook + body + cta (ready for TTS)
 * @property {number}   estimatedDuration — seconds
 * @property {string[]} keywords
 * @property {string}   savedTo          — relative path of the JSON file
 */

/**
 * Generate a viral YouTube Shorts script.
 *
 * @param {string} [category]  — niche key or legacy category (e.g. 'tech', 'ai_tools')
 * @param {string} [jobId]     — optional job ID; generated if omitted
 * @returns {Promise<ScriptResult>}
 */
async function generateScript(category, jobId) {
  jobId = jobId || uuidv4().split('-')[0];

  const niche = resolveNiche(category || config.pipeline.topicCategory);
  const topic = pickTopic(niche);

  logger.info(`[scriptGenerator] Job ${jobId} | niche: ${topic.niche} | angle: "${topic.angle}"`);

  let lastErrors  = [];
  let quotaFailed = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const temperature = TEMPERATURES[attempt - 1] ?? 0.55;

    let raw;
    try {
      raw = await callOpenAI(topic, temperature, jobId, attempt);
    } catch (apiErr) {
      const msg    = apiErr.message ?? '';
      const is429  = msg.includes('429') || msg.includes('quota') || apiErr.cause?.message?.includes('quota');
      lastErrors   = [msg];

      if (is429) {
        quotaFailed = true;
        logger.warn(`[scriptGenerator] OpenAI quota exceeded — switching to local fallback`);
        break;   // no point retrying quota errors
      }

      logger.warn(`[scriptGenerator] OpenAI error on attempt ${attempt}: ${msg.slice(0, 120)}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }

    let parsed;
    try {
      // Strip markdown fences if model returned them despite instructions
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      logger.warn(`[scriptGenerator] JSON parse failed on attempt ${attempt}: ${parseErr.message}`);
      lastErrors = [`JSON parse error: ${parseErr.message}`];
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }

    const { valid, script, errors } = validateScript(parsed);
    if (!valid) {
      logger.warn(`[scriptGenerator] Validation failed (${errors.length} issues) on attempt ${attempt}`);
      lastErrors = errors;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
      continue;
    }

    logger.info(`[scriptGenerator] ✅ Script ready (OpenAI) — "${script.title}"`);
    const { relativePath } = saveScript(script, jobId);
    return { jobId, ...script, savedTo: relativePath };
  }

  // ── Local fallback ────────────────────────────────────────────────────────
  if (quotaFailed || lastErrors.length > 0) {
    logger.warn(`[scriptGenerator] Falling back to local script generation`);
    const localScript = generateScriptLocally(topic, jobId);
    const { valid, script: repaired } = validateScript(localScript);
    const finalScript = valid ? repaired : localScript;
    const { relativePath } = saveScript(finalScript, jobId);
    logger.info(`[scriptGenerator] ✅ Script ready (local) — "${finalScript.title}"`);
    return { jobId, ...finalScript, savedTo: relativePath };
  }

  throw new Error(
    `[scriptGenerator] Failed after ${MAX_RETRIES} attempts.\n` +
    lastErrors.map((e) => `  • ${e}`).join('\n')
  );
}

// ── OpenAI call ──────────────────────────────────────────────────────────────

/**
 * Make a single OpenAI chat completion call.
 * Wrapped in the retry utility for transient network/rate-limit errors.
 *
 * @param {import('./topics').Topic} topic
 * @param {number} temperature
 * @param {string} jobId
 * @param {number} attempt
 * @returns {Promise<string>} raw JSON string
 */
async function callOpenAI(topic, temperature, jobId, attempt) {
  const { system, user } = buildPrompts(topic);
  const client  = getClient();
  const model   = config.openai.model;

  // json_object response_format only supported on gpt-4o / gpt-4-turbo / gpt-3.5-turbo-1106+
  const supportsJsonMode = model.includes('gpt-4') || model === 'gpt-3.5-turbo-1106' || model === 'gpt-3.5-turbo-0125';

  logger.debug(`[scriptGenerator] Calling ${model} (job=${jobId}, attempt=${attempt}, jsonMode=${supportsJsonMode})`);

  const requestParams = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    temperature,
    max_tokens: 1200,
  };

  if (supportsJsonMode) {
    requestParams.response_format = { type: 'json_object' };
  }

  const response = await retry(
    () => client.chat.completions.create(requestParams),
    {
      attempts: 2,
      delay:    1500,
      label:    `OpenAI call (job=${jobId}, attempt=${attempt})`,
    }
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty response');

  const usage = response.usage;
  if (usage) {
    logger.debug(
      `[scriptGenerator] Tokens — prompt: ${usage.prompt_tokens}, ` +
      `completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`
    );
  }

  return content;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { generateScript };
