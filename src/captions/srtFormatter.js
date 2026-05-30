/**
 * SRT Formatter
 *
 * Converts Whisper transcription data into SRT subtitle format.
 *
 * Two modes:
 *   1. Segment-level SRT  — one cue per Whisper segment (~sentence)
 *   2. Word-chunked SRT   — groups words into short display chunks
 *      optimised for Shorts (2–4 words per cue, fast pace)
 *
 * SRT spec:
 *   <index>
 *   HH:MM:SS,mmm --> HH:MM:SS,mmm
 *   <text>
 *   <blank line>
 */

'use strict';

// ── Time formatting ──────────────────────────────────────────────────────────

/**
 * Format seconds → SRT timestamp string HH:MM:SS,mmm
 * @param {number} seconds
 * @returns {string}
 */
function formatSrtTime(seconds) {
  const h   = Math.floor(seconds / 3600);
  const m   = Math.floor((seconds % 3600) / 60);
  const s   = Math.floor(seconds % 60);
  const ms  = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

// ── Segment-level SRT ────────────────────────────────────────────────────────

/**
 * Build SRT from Whisper segment objects.
 * Each segment becomes one subtitle cue.
 *
 * @param {Array<{start: number, end: number, text: string}>} segments
 * @returns {string}
 */
function segmentsToSrt(segments) {
  if (!segments || segments.length === 0) return '';

  return segments
    .map((seg, i) => {
      const text = seg.text.trim();
      if (!text) return null;
      return [
        i + 1,
        `${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}`,
        text,
        '',
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

// ── Word-chunked SRT ─────────────────────────────────────────────────────────

/**
 * Build a word-chunked SRT from Whisper word-level timestamps.
 *
 * Groups words into display chunks of `wordsPerCue` words.
 * Each chunk's timing spans from the first word's start to the last
 * word's end, with a small gap before the next cue.
 *
 * This produces the fast-paced caption style used in viral Shorts.
 *
 * @param {Array<{word: string, start: number, end: number}>} words
 * @param {object} [opts]
 * @param {number} [opts.wordsPerCue=3]   — words per subtitle card
 * @param {number} [opts.gapMs=50]        — gap between cues in ms
 * @returns {string}
 */
function wordsToChunkedSrt(words, { wordsPerCue = 3, gapMs = 50 } = {}) {
  if (!words || words.length === 0) return '';

  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    chunks.push(words.slice(i, i + wordsPerCue));
  }

  return chunks
    .map((chunk, i) => {
      const start = chunk[0].start;
      const rawEnd = chunk[chunk.length - 1].end;

      // Trim end slightly so cues don't overlap
      const end = Math.max(start + 0.1, rawEnd - gapMs / 1000);
      const text = chunk.map((w) => w.word.trim()).join(' ');

      return [
        i + 1,
        `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
        text,
        '',
      ].join('\n');
    })
    .join('\n');
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Basic SRT content validation.
 * Returns { valid: boolean, cueCount: number, errors: string[] }
 *
 * @param {string} srtContent
 * @returns {{ valid: boolean, cueCount: number, errors: string[] }}
 */
function validateSrt(srtContent) {
  const errors = [];

  if (!srtContent || srtContent.trim().length === 0) {
    return { valid: false, cueCount: 0, errors: ['SRT content is empty'] };
  }

  // Count cues by looking for index lines (lines that are just a number)
  const cueCount = (srtContent.match(/^\d+\s*$/gm) || []).length;

  if (cueCount === 0) {
    errors.push('No valid SRT cues found');
  }

  // Check for timestamp lines
  const tsCount = (srtContent.match(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/g) || []).length;
  if (tsCount !== cueCount) {
    errors.push(`Cue count (${cueCount}) does not match timestamp count (${tsCount})`);
  }

  return { valid: errors.length === 0, cueCount, errors };
}

module.exports = { segmentsToSrt, wordsToChunkedSrt, validateSrt, formatSrtTime };
