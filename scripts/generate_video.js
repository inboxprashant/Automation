#!/usr/bin/env node
/**
 * Standalone video generator CLI.
 *
 * Modes:
 *   1. From a pipeline job (looks up voice + captions automatically):
 *        node scripts/generate_video.js --job <jobId>
 *
 *   2. From explicit file paths:
 *        node scripts/generate_video.js \
 *          --audio  project/voices/ai_tools/2024-01-15_abc.mp3 \
 *          --srt    project/captions/ai_tools/2024-01-15_abc.highlighted.srt \
 *          --script project/scripts/ai_tools/2024-01-15_abc.json
 *
 * Options:
 *   --niche   <niche>     Content niche (default: general)
 *   --title   <str>       Video title
 *   --music   <path>      Explicit music file path
 *   --no-music            Disable background music
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs   = require('fs');

const { createVideo }      = require('../src/video/videoCreator');
const { loadVoiceRecord }  = require('../src/voice/voiceStorage');
const { loadCaptionRecord }= require('../src/captions/captionStorage');
const { v4: uuidv4 }       = require('uuid');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Video Generator');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const jobArg    = getArg('--job');
  const audioArg  = getArg('--audio');
  const srtArg    = getArg('--srt');
  const scriptArg = getArg('--script');
  const nicheArg  = getArg('--niche')  ?? 'general';
  const titleArg  = getArg('--title')  ?? 'YouTube Short';
  const musicArg  = getArg('--music');
  const noMusic   = hasFlag('--no-music');
  const jobId     = jobArg ?? uuidv4().split('-')[0];

  let audioPath, srtPath, scriptPath, niche, title;

  if (jobArg) {
    // ── Mode 1: from job records ─────────────────────────────────────────
    console.log(`Loading records for job: ${jobArg}\n`);

    const voiceRecord   = loadVoiceRecord(jobArg);
    const captionRecord = loadCaptionRecord(jobArg);

    if (!voiceRecord) {
      console.error(`❌  No voice record found for job: ${jobArg}`);
      console.error('    Run: node scripts/generate_voice.js --job <jobId>');
      process.exit(1);
    }
    if (!captionRecord) {
      console.error(`❌  No caption record found for job: ${jobArg}`);
      console.error('    Run: node scripts/generate_captions.js --job <jobId>');
      process.exit(1);
    }

    audioPath  = voiceRecord.mp3Path;
    srtPath    = path.resolve(captionRecord.files.highlightedSrt);
    niche      = voiceRecord.niche ?? nicheArg;
    title      = voiceRecord.scriptTitle ?? titleArg;

    console.log(`Voice  : ${voiceRecord.voiceName} — "${title}"`);
    console.log(`Audio  : ${audioPath}`);
    console.log(`SRT    : ${srtPath}\n`);

  } else if (audioArg && srtArg) {
    // ── Mode 2: explicit paths ───────────────────────────────────────────
    audioPath  = path.resolve(audioArg);
    srtPath    = path.resolve(srtArg);
    scriptPath = scriptArg ? path.resolve(scriptArg) : null;
    niche      = nicheArg;
    title      = titleArg;

    if (!fs.existsSync(audioPath)) {
      console.error(`❌  Audio file not found: ${audioPath}`); process.exit(1);
    }
    if (!fs.existsSync(srtPath)) {
      console.error(`❌  SRT file not found: ${srtPath}`); process.exit(1);
    }

  } else {
    console.error('Usage:');
    console.error('  node scripts/generate_video.js --job <jobId>');
    console.error('  node scripts/generate_video.js --audio <mp3> --srt <srt> [--script <json>]');
    process.exit(1);
  }

  console.log('Starting video build (this takes 2–5 minutes)...\n');

  const result = await createVideo({
    audioPath,
    srtPath,
    title,
    jobId,
    niche,
    scriptPath: scriptPath ?? null,
    musicPath:  musicArg ?? null,
    noMusic,
  });

  console.log('\n✅  Video generated successfully!\n');
  console.log(`  Job ID     : ${result.jobId}`);
  console.log(`  Title      : ${result.title}`);
  console.log(`  Niche      : ${result.niche}`);
  console.log(`  File size  : ${result.fileSizeKb} KB`);
  console.log(`  Output     : ${result.mp4Path}`);
  console.log();
}

main().catch((err) => {
  console.error('\n❌  Video generation failed:\n');
  console.error(err.message);
  process.exit(1);
});
