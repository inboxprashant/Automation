/**
 * Word Timestamps
 *
 * Processes Whisper word-level timestamp data into clean, structured
 * formats used by the rest of the caption pipeline.
 *
 * Whisper returns words in this shape (verbose_json + word granularity):
 *   { word: " hello", start: 0.0, end: 0.42 }
 *
 * This module:
 *   1. Cleans and normalises word objects
 *   2. Builds a word-timestamp JSON file (machine-readable)
 *   3. Builds a VTT file with per-word cues (for web players)
 *   4. Provides helpers for downstream consumers (keyword highlighter, etc.)
 */

'use strict';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} WordEntry
 * @property {string} word        — cleaned word text (no leading space)
 * @property {number} start       — start time in seconds
 * @property {number} end         — end time in seconds
 * @property {number} duration    — end - start
 * @property {number} index       — 0-based position in the word list
 * @property {boolean} isPunctuation
 */

/**
 * @typedef {object} WordTimestampData
 * @property {WordEntry[]} words
 * @property {number}      totalWords
 * @property {number}      totalDuration   — seconds
 * @property {number}      wordsPerMinute
 * @property {object[]}    sentences       — words grouped into sentence-like spans
 */

// ── Normalisation ────────────────────────────────────────────────────────────

const PUNCTUATION_RE = /^[.,!?;:…\-–—"'()[\]{}]+$/;

/**
 * Normalise a raw Whisper word object.
 * @param {{ word: string, start: number, end: number }} raw
 * @param {number} index
 * @returns {WordEntry}
 */
function normaliseWord(raw, index) {
  const word = (raw.word ?? '').trim();
  return {
    word,
    start:          Math.round(raw.start * 1000) / 1000,
    end:            Math.round(raw.end   * 1000) / 1000,
    duration:       Math.round((raw.end - raw.start) * 1000) / 1000,
    index,
    isPunctuation:  PUNCTUATION_RE.test(word),
  };
}

/**
 * Process raw Whisper word array into a clean WordTimestampData object.
 *
 * @param {Array<{word: string, start: number, end: number}>} rawWords
 * @returns {WordTimestampData}
 */
function processWords(rawWords) {
  if (!rawWords || rawWords.length === 0) {
    return { words: [], totalWords: 0, totalDuration: 0, wordsPerMinute: 0, sentences: [] };
  }

  const words = rawWords.map(normaliseWord);

  const contentWords = words.filter((w) => !w.isPunctuation && w.word.length > 0);
  const totalDuration = words[words.length - 1].end - words[0].start;
  const wordsPerMinute = totalDuration > 0
    ? Math.round((contentWords.length / totalDuration) * 60)
    : 0;

  return {
    words,
    totalWords:    contentWords.length,
    totalDuration: Math.round(totalDuration * 100) / 100,
    wordsPerMinute,
    sentences:     groupIntoSentences(words),
  };
}

// ── Sentence grouping ────────────────────────────────────────────────────────

const SENTENCE_END_RE = /[.!?…]$/;

/**
 * Group words into sentence-like spans based on punctuation and pauses.
 * Used for the word-timestamp JSON output.
 *
 * @param {WordEntry[]} words
 * @returns {Array<{ text: string, start: number, end: number, words: WordEntry[] }>}
 */
function groupIntoSentences(words) {
  const sentences = [];
  let current = [];

  for (const word of words) {
    current.push(word);

    const isEnd = SENTENCE_END_RE.test(word.word);
    const nextWord = words[word.index + 1];
    const longPause = nextWord && (nextWord.start - word.end) > 0.5;

    if (isEnd || longPause || word.index === words.length - 1) {
      if (current.length > 0) {
        sentences.push({
          text:  current.map((w) => w.word).join(' ').trim(),
          start: current[0].start,
          end:   current[current.length - 1].end,
          words: current,
        });
        current = [];
      }
    }
  }

  return sentences;
}

// ── VTT builder ──────────────────────────────────────────────────────────────

/**
 * Format seconds → WebVTT timestamp HH:MM:SS.mmm
 * @param {number} seconds
 * @returns {string}
 */
function formatVttTime(seconds) {
  const h   = Math.floor(seconds / 3600);
  const m   = Math.floor((seconds % 3600) / 60);
  const s   = Math.floor(seconds % 60);
  const ms  = Math.round((seconds % 1) * 1000);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/**
 * Build a WebVTT string with one cue per word.
 * Useful for web-based players and accessibility tools.
 *
 * @param {WordEntry[]} words
 * @returns {string}
 */
function wordsToVtt(words) {
  const lines = ['WEBVTT', ''];

  words
    .filter((w) => !w.isPunctuation && w.word.length > 0)
    .forEach((w, i) => {
      lines.push(
        `${i + 1}`,
        `${formatVttTime(w.start)} --> ${formatVttTime(w.end)}`,
        w.word,
        ''
      );
    });

  return lines.join('\n');
}

// ── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Find all word entries that match a keyword (case-insensitive).
 * Used by the keyword highlighter.
 *
 * @param {WordEntry[]} words
 * @param {string} keyword
 * @returns {WordEntry[]}
 */
function findWordOccurrences(words, keyword) {
  const kw = keyword.toLowerCase().trim();
  return words.filter((w) => w.word.toLowerCase().replace(/[^a-z0-9]/g, '') === kw.replace(/[^a-z0-9]/g, ''));
}

/**
 * Get the word entry at a specific timestamp.
 * @param {WordEntry[]} words
 * @param {number} timeSeconds
 * @returns {WordEntry|null}
 */
function getWordAtTime(words, timeSeconds) {
  return words.find((w) => timeSeconds >= w.start && timeSeconds <= w.end) ?? null;
}

module.exports = {
  processWords,
  normaliseWord,
  wordsToVtt,
  findWordOccurrences,
  getWordAtTime,
  groupIntoSentences,
};
