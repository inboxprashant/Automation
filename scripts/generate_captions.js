#!/usr/bin/env node
/**
 * Standalone caption generator CLI.
 *
 * Modes:
 *   1. From a voice jobId (looks up MP3 from project/voices/index.json):
 *        node scripts/generate_captions.js --job <jobId>
 *
 *   2. From a direct MP3 path:
 *        node scripts/generate_captions.js --audio path/to/file.mp3
 *
 *   3. From a direct MP3 path with script keywords:
 *        node scripts/generate_captions.js --audio path/to/file.mp3 \
 *          --keywords "AI,automation,ChatGPT" --niche ai_tools
 *
 * Options:
 *   --niche <niche>         Niche for keyword highlighting (default: general)
 *   --keywords <csv>        Comma-separated keywords to highlight
 *   --words-per-cue <n>     Words per subtitle card (default: 3)
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs   = require('fs');

const { generateCaptions }    = require('../src/captions/captionGenerator');
const { loadVoiceRecord }     = require('../src/voice/voiceStorage');
const { v4: uuidv4 }          = require('uuid');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Caption Generator');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const jobArg      = getArg('--job');
  const audioArg    = getArg('--audio');
  const nicheArg    = getArg('--niche')    ?? 'general';
  const keywordsArg = getArg('--keywords') ?? '';
  const jobId       = jobArg ?? uuidv4().split('-')[0];

  const scriptKeywords = keywordsArg
    ? keywordsArg.split(',').map((k) => k.trim()).filter(Boolean)
    : [];

  let audioPath;
  let niche = nicheArg;
  let scriptTitle = 'CLI run';

  if (jobArg) {
    // ── Mode 1: from voice record ────────────────────────────────────────
    console.log(`Loading voice record for job: ${jobArg}`);
    const record = loadVoiceRecord(jobArg);
    if (!record) {
      console.error(`❌  No voice record found for jobId: ${jobArg}`);
      console.error('    Run: node scripts/generate_voice.js --job <jobId> first');
      process.exit(1);
    }
    audioPath   = record.mp3Path;
    niche       = record.niche ?? niche;
    scriptTitle = record.scriptTitle ?? scriptTitle;
    console.log(`Voice: ${record.voiceName} | Title: "${scriptTitle}"\n`);

  } else if (audioArg) {
    // ── Mode 2/3: from direct path ───────────────────────────────────────
    audioPath = path.resolve(audioArg);
    if (!fs.existsSync(audioPath)) {
      console.error(`❌  Audio file not found: ${audioPath}`);
      process.exit(1);
    }
    console.log(`Audio: ${audioPath}\n`);

  } else {
    console.error('Usage:');
    console.error('  node scripts/generate_captions.js --job <jobId>');
    console.error('  node scripts/generate_captions.js --audio <path/to/file.mp3> [--niche ai_tools] [--keywords "AI,automation"]');
    process.exit(1);
  }

  const result = await generateCaptions(audioPath, jobId, {
    niche,
    scriptKeywords,
    scriptTitle,
  });

  console.log('✅  Captions generated successfully!\n');
  console.log(`  Job ID           : ${result.jobId}`);
  console.log(`  Niche            : ${result.niche}`);
  console.log(`  Duration         : ${result.duration}s`);
  console.log(`  Words            : ${result.wordCount}`);
  console.log(`  Cues (segments)  : ${result.cueCount}`);
  console.log(`  Keywords found   : ${result.highlightCount}`);
  console.log('\n── Output files ────────────────────────────────────────────');
  console.log(`  Segment SRT      : ${result.paths.srt}`);
  console.log(`  Chunked SRT      : ${result.paths.chunkedSrt}`);
  console.log(`  Highlighted SRT  : ${result.paths.highlightedSrt}`);
  console.log(`  Word timestamps  : ${result.paths.wordsJson}`);
  console.log(`  Highlight map    : ${result.paths.highlightsJson}`);
  console.log(`  WebVTT           : ${result.paths.vtt}`);
  console.log('────────────────────────────────────────────────────────────\n');

  // Print a preview of the highlighted SRT
  const fs2 = require('fs');
  const preview = fs2.readFileSync(result.paths.highlightedSrt, 'utf8')
    .split('\n').slice(0, 24).join('\n');
  console.log('── Highlighted SRT preview (first 6 cues) ──────────────────');
  console.log(preview);
  console.log('────────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\n❌  Caption generation failed:\n');
  console.error(err.message);
  process.exit(1);
});
