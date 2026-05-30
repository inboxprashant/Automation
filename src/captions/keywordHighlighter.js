/**
 * Keyword Highlighter
 *
 * Dynamically identifies and marks high-impact keywords in the
 * word-timestamp data. Produces two outputs:
 *
 *   1. A highlighted SRT — keywords are wrapped in UPPERCASE for
 *      emphasis (compatible with all SRT renderers including FFmpeg's
 *      subtitles filter which doesn't support HTML tags).
 *
 *   2. A highlight map JSON — machine-readable list of every keyword
 *      occurrence with its exact timestamp, used by the video builder
 *      to apply dynamic text effects (scale, colour flash, etc.).
 *
 * Keyword detection strategy (layered):
 *   a. Explicit keywords from the script object (highest priority)
 *   b. Niche-specific power words from the built-in dictionary
 *   c. TF-IDF-style scoring — words that appear rarely but carry
 *      semantic weight (filters out stop words)
 */

'use strict';

const { findWordOccurrences } = require('./wordTimestamps');
const { formatSrtTime }       = require('./srtFormatter');

// ── Stop words ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','during','is','are','was',
  'were','be','been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','shall','can','need','dare',
  'this','that','these','those','i','you','he','she','it','we','they',
  'me','him','her','us','them','my','your','his','its','our','their',
  'what','which','who','whom','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','not',
  'only','same','so','than','too','very','just','also','as','if','then',
  'there','here','now','get','got','let','like','know','think','make',
  'go','going','come','coming','one','two','three','four','five',
]);

// ── Niche power-word dictionary ──────────────────────────────────────────────

/** @type {Record<string, string[]>} */
const NICHE_POWER_WORDS = {
  ai_tools:    ['AI', 'ChatGPT', 'GPT', 'Claude', 'Gemini', 'automation', 'model',
                 'prompt', 'agent', 'tool', 'free', 'replace', 'generate', 'instantly'],
  tech_facts:  ['billion', 'million', 'trillion', 'secret', 'hidden', 'never', 'always',
                 'quantum', 'NASA', 'impossible', 'fact', 'actually', 'discovered'],
  automation:  ['automate', 'automated', 'workflow', 'Zapier', 'n8n', 'script', 'hours',
                 'minutes', 'passive', 'system', 'replace', 'zero', 'free'],
  money_facts: ['money', 'rich', 'wealth', 'invest', 'profit', 'income', 'bank',
                 'compound', 'interest', 'tax', 'million', 'billion', 'dollar', 'free'],
  productivity:['focus', 'habit', 'routine', 'morning', 'deep', 'work', 'hours',
                 'minutes', 'system', 'hack', 'trick', 'secret', 'best', 'top'],
  general:     ['secret', 'never', 'always', 'free', 'best', 'worst', 'top', 'first',
                 'last', 'only', 'every', 'instantly', 'immediately', 'shocking'],
};

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Score a word for highlight worthiness.
 * Higher = more likely to be highlighted.
 *
 * @param {string}   word
 * @param {string}   niche
 * @param {string[]} scriptKeywords
 * @param {Map<string, number>} freqMap  — word frequency in the full text
 * @param {number}   totalWords
 * @returns {number}
 */
function scoreWord(word, niche, scriptKeywords, freqMap, totalWords) {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean || clean.length < 3 || STOP_WORDS.has(clean)) return 0;

  let score = 0;

  // Script keywords (explicit — highest weight)
  if (scriptKeywords.some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === clean)) {
    score += 100;
  }

  // Niche power words
  const nicheWords = [
    ...(NICHE_POWER_WORDS[niche] ?? []),
    ...(NICHE_POWER_WORDS.general ?? []),
  ];
  if (nicheWords.some((k) => k.toLowerCase() === clean)) {
    score += 60;
  }

  // TF-IDF-style: rare words in the transcript are more meaningful
  const freq = freqMap.get(clean) ?? 0;
  const tf = freq / totalWords;
  if (tf < 0.02 && freq >= 1) score += 20;   // rare but present
  if (freq === 1)              score += 10;   // appears exactly once

  // Length bonus — longer words tend to be more meaningful
  if (clean.length >= 7) score += 10;
  if (clean.length >= 10) score += 5;

  // Numbers and stats are always highlight-worthy
  if (/^\d+$/.test(clean)) score += 40;
  if (/^\d+[kmbt%]$/i.test(clean)) score += 50;

  return score;
}

/**
 * Build a frequency map from a word list.
 * @param {import('./wordTimestamps').WordEntry[]} words
 * @returns {Map<string, number>}
 */
function buildFreqMap(words) {
  const map = new Map();
  for (const w of words) {
    const clean = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean) map.set(clean, (map.get(clean) ?? 0) + 1);
  }
  return map;
}

// ── Highlight map ────────────────────────────────────────────────────────────

/**
 * @typedef {object} HighlightEntry
 * @property {string} word
 * @property {number} start
 * @property {number} end
 * @property {number} wordIndex
 * @property {number} score
 * @property {string} reason   — 'script_keyword' | 'niche_power_word' | 'tfidf'
 */

/**
 * Build the highlight map — all keyword occurrences with timestamps.
 *
 * @param {import('./wordTimestamps').WordEntry[]} words
 * @param {object} opts
 * @param {string}   opts.niche
 * @param {string[]} opts.scriptKeywords
 * @param {number}   [opts.minScore=60]   — minimum score to be highlighted
 * @returns {HighlightEntry[]}
 */
function buildHighlightMap(words, { niche, scriptKeywords, minScore = 60 }) {
  const freqMap = buildFreqMap(words);
  const totalWords = words.filter((w) => !w.isPunctuation).length;
  const highlights = [];

  for (const word of words) {
    if (word.isPunctuation || !word.word) continue;

    const score = scoreWord(word.word, niche, scriptKeywords, freqMap, totalWords);
    if (score < minScore) continue;

    // Determine reason for logging/debugging
    const clean = word.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    let reason = 'tfidf';
    if (scriptKeywords.some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === clean)) {
      reason = 'script_keyword';
    } else if ([...(NICHE_POWER_WORDS[niche] ?? []), ...NICHE_POWER_WORDS.general]
        .some((k) => k.toLowerCase() === clean)) {
      reason = 'niche_power_word';
    }

    highlights.push({ word: word.word, start: word.start, end: word.end, wordIndex: word.index, score, reason });
  }

  return highlights.sort((a, b) => a.start - b.start);
}

// ── Highlighted SRT ──────────────────────────────────────────────────────────

/**
 * Build an SRT string where highlighted keywords are UPPERCASED.
 *
 * Works on the chunked word list so each cue is 2–4 words.
 * Highlighted words within a cue are uppercased.
 *
 * @param {import('./wordTimestamps').WordEntry[]} words
 * @param {HighlightEntry[]} highlights
 * @param {object} [opts]
 * @param {number} [opts.wordsPerCue=3]
 * @returns {string}
 */
function buildHighlightedSrt(words, highlights, { wordsPerCue = 3 } = {}) {
  const highlightedIndices = new Set(highlights.map((h) => h.wordIndex));

  // Build chunks
  const contentWords = words.filter((w) => !w.isPunctuation && w.word.length > 0);
  const chunks = [];
  for (let i = 0; i < contentWords.length; i += wordsPerCue) {
    chunks.push(contentWords.slice(i, i + wordsPerCue));
  }

  return chunks
    .map((chunk, i) => {
      const start = chunk[0].start;
      const end   = Math.max(start + 0.1, chunk[chunk.length - 1].end - 0.05);

      const text = chunk
        .map((w) => highlightedIndices.has(w.index) ? w.word.toUpperCase() : w.word)
        .join(' ');

      return [
        i + 1,
        `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
        text,
        '',
      ].join('\n');
    })
    .join('\n');
}

module.exports = { buildHighlightMap, buildHighlightedSrt, scoreWord, NICHE_POWER_WORDS };
