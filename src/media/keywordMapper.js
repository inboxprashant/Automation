/**
 * Keyword Mapper
 *
 * Converts script keywords and niche into optimised search queries
 * for stock video APIs. Stock APIs respond better to visual, concrete
 * terms than abstract script keywords like "compound interest".
 *
 * Strategy:
 *   1. Map niche → base visual queries (always searched)
 *   2. Expand script keywords → visual synonyms
 *   3. Deduplicate and rank by expected visual relevance
 *   4. Return top N queries to keep API usage low
 */

'use strict';

// ── Niche → base visual queries ──────────────────────────────────────────────

const NICHE_BASE_QUERIES = {
  ai_tools:    ['technology abstract', 'computer screen code', 'robot automation', 'digital data', 'futuristic tech'],
  tech_facts:  ['technology background', 'circuit board', 'smartphone screen', 'data center servers', 'digital network'],
  automation:  ['workflow office', 'business automation', 'laptop working', 'productivity desk', 'software interface'],
  money_facts: ['money cash', 'stock market chart', 'business success', 'coins wealth', 'financial growth'],
  productivity:['morning routine', 'focused work desk', 'person working laptop', 'time management', 'success mindset'],
  general:     ['abstract background', 'city timelapse', 'nature aerial', 'people walking', 'modern office'],
};

// ── Keyword → visual synonym map ─────────────────────────────────────────────

const KEYWORD_VISUAL_MAP = {
  // AI / Tech
  'ai':           ['artificial intelligence', 'robot technology', 'computer brain'],
  'chatgpt':      ['chat interface screen', 'typing computer', 'ai assistant'],
  'automation':   ['robot arm factory', 'automated workflow', 'machine working'],
  'coding':       ['programmer typing', 'code screen', 'software development'],
  'data':         ['data visualization', 'digital numbers', 'server room'],
  'algorithm':    ['computer processing', 'digital matrix', 'tech abstract'],
  'machine':      ['robot machine', 'factory automation', 'mechanical gear'],

  // Money / Finance
  'money':        ['cash dollars', 'money bills', 'financial wealth'],
  'invest':       ['stock market', 'investment growth', 'financial chart'],
  'investing':    ['stock market chart', 'bull market', 'trading screen'],
  'wealth':       ['luxury lifestyle', 'success business', 'rich lifestyle'],
  'income':       ['passive income', 'money flow', 'business revenue'],
  'compound':     ['growth chart', 'exponential growth', 'financial graph'],
  'bank':         ['banking finance', 'credit card', 'financial institution'],
  'tax':          ['tax documents', 'financial paperwork', 'accounting'],
  'profit':       ['business profit', 'revenue growth', 'success chart'],
  'savings':      ['piggy bank', 'saving money', 'financial planning'],

  // Productivity
  'productivity': ['focused work', 'efficient workflow', 'productive person'],
  'habit':        ['morning routine', 'daily schedule', 'healthy lifestyle'],
  'routine':      ['morning sunrise', 'daily planner', 'organized desk'],
  'focus':        ['concentration work', 'deep focus', 'studying person'],
  'time':         ['clock time', 'hourglass', 'time management'],
  'morning':      ['sunrise morning', 'morning coffee', 'waking up'],
  'sleep':        ['sleeping person', 'bedroom night', 'rest relaxation'],
  'exercise':     ['gym workout', 'running fitness', 'healthy exercise'],

  // General viral
  'secret':       ['mystery reveal', 'hidden door', 'secret knowledge'],
  'hack':         ['life hack', 'clever solution', 'smart trick'],
  'trick':        ['magic trick', 'clever technique', 'smart solution'],
  'free':         ['gift surprise', 'free offer', 'open hands'],
  'fast':         ['speed motion', 'fast car', 'quick movement'],
  'easy':         ['simple steps', 'easy solution', 'straightforward path'],
  'best':         ['top quality', 'excellence award', 'number one'],
  'never':        ['stop sign', 'forbidden', 'warning'],
  'always':       ['consistent routine', 'daily habit', 'forever'],
  'billion':      ['large crowd', 'massive scale', 'global network'],
  'million':      ['crowd people', 'large number', 'abundance'],
};

// ── Mapper ───────────────────────────────────────────────────────────────────

/**
 * Build a ranked list of search queries for a given script + niche.
 *
 * @param {object} opts
 * @param {string[]} opts.keywords      — from script.keywords
 * @param {string}   opts.niche         — content niche
 * @param {string}   [opts.hook]        — hook text (first sentence)
 * @param {number}   [opts.maxQueries]  — max queries to return (default 8)
 * @returns {string[]}
 */
function buildQueries({ keywords = [], niche = 'general', hook = '', maxQueries = 8 }) {
  const queries = new Set();

  // 1. Niche base queries (always included, highest priority)
  const baseQueries = NICHE_BASE_QUERIES[niche] ?? NICHE_BASE_QUERIES.general;
  baseQueries.slice(0, 3).forEach((q) => queries.add(q));

  // 2. Expand script keywords through the visual synonym map
  for (const kw of keywords) {
    const clean = kw.toLowerCase().trim();
    const synonyms = KEYWORD_VISUAL_MAP[clean];
    if (synonyms) {
      synonyms.slice(0, 2).forEach((s) => queries.add(s));
    } else if (clean.length > 3) {
      // Use the keyword directly if it's likely visual
      queries.add(clean);
    }
  }

  // 3. Extract strong visual words from the hook sentence
  if (hook) {
    const hookWords = hook.toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP_WORDS.has(w));

    for (const word of hookWords.slice(0, 3)) {
      const synonyms = KEYWORD_VISUAL_MAP[word];
      if (synonyms) queries.add(synonyms[0]);
    }
  }

  // 4. Fill remaining slots with more niche base queries
  for (const q of baseQueries.slice(3)) {
    if (queries.size >= maxQueries) break;
    queries.add(q);
  }

  return [...queries].slice(0, maxQueries);
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'will', 'your', 'they',
  'what', 'when', 'where', 'just', 'more', 'some', 'than', 'then',
  'into', 'over', 'also', 'been', 'were', 'their', 'there', 'about',
]);

module.exports = { buildQueries, NICHE_BASE_QUERIES, KEYWORD_VISUAL_MAP };
