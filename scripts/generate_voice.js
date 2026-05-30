#!/usr/bin/env node
/**
 * Standalone voice generator CLI.
 *
 * Modes:
 *   1. From a saved script (by jobId):
 *        node scripts/generate_voice.js --job <jobId>
 *
 *   2. From a script JSON file:
 *        node scripts/generate_voice.js --file project/scripts/ai_tools/2024-01-15_abc123.json
 *
 *   3. From raw text (quick test):
 *        node scripts/generate_voice.js --text "Your narration here" --niche ai_tools
 *
 * Options:
 *   --voice <voiceId>   Override the voice (ElevenLabs voice ID)
 *   --list-voices       Print the voice catalogue and exit
 */

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const { generateVoice, generateVoiceFromScript } = require('../src/voice/voiceGenerator');
const { loadScript }  = require('../src/ai/scriptStorage');
const { VOICES }      = require('../src/voice/voices');
const { v4: uuidv4 }  = require('uuid');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

// ── List voices ──────────────────────────────────────────────────────────────

if (hasFlag('--list-voices')) {
  console.log('\n── ElevenLabs Voice Catalogue ──────────────────────────────');
  VOICES.forEach((v) => {
    console.log(`\n  ${v.name.padEnd(10)} ${v.gender} / ${v.accent}`);
    console.log(`  ID:     ${v.id}`);
    console.log(`  Tone:   ${v.tone}`);
    console.log(`  Niches: ${v.niches.join(', ')}`);
  });
  console.log('\n────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Voice Generator');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const jobArg    = getArg('--job');
  const fileArg   = getArg('--file');
  const textArg   = getArg('--text');
  const nicheArg  = getArg('--niche') ?? 'general';
  const voiceArg  = getArg('--voice');
  const jobId     = uuidv4().split('-')[0];

  let result;

  if (jobArg) {
    // ── Mode 1: from saved script by jobId ──────────────────────────────
    console.log(`Loading script for job: ${jobArg}`);
    const script = loadScript(jobArg);
    if (!script) {
      console.error(`❌  No script found for jobId: ${jobArg}`);
      process.exit(1);
    }
    console.log(`Script: "${script.title}"\n`);
    result = await generateVoiceFromScript(script, jobArg);

  } else if (fileArg) {
    // ── Mode 2: from a JSON file ─────────────────────────────────────────
    const filePath = path.resolve(fileArg);
    if (!fs.existsSync(filePath)) {
      console.error(`❌  File not found: ${filePath}`);
      process.exit(1);
    }
    const script = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Script: "${script.title}"\n`);
    result = await generateVoiceFromScript(script, jobId);

  } else if (textArg) {
    // ── Mode 3: raw text ─────────────────────────────────────────────────
    console.log(`Text: "${textArg.slice(0, 80)}..."\n`);
    result = await generateVoice(textArg, jobId, {
      niche: nicheArg,
      scriptTitle: 'CLI test',
      voiceId: voiceArg ?? undefined,
    });

  } else {
    console.error('Usage:');
    console.error('  node scripts/generate_voice.js --job <jobId>');
    console.error('  node scripts/generate_voice.js --file <path/to/script.json>');
    console.error('  node scripts/generate_voice.js --text "narration" [--niche ai_tools] [--voice <id>]');
    console.error('  node scripts/generate_voice.js --list-voices');
    process.exit(1);
  }

  console.log('✅  Voice generated successfully!\n');
  console.log(`  Job ID           : ${result.jobId}`);
  console.log(`  Voice            : ${result.voiceName} (${result.voiceId})`);
  console.log(`  Niche            : ${result.niche}`);
  console.log(`  Characters       : ${result.characterCount}`);
  console.log(`  Est. duration    : ~${result.durationEstimate}s`);
  console.log(`  Saved to         : ${result.mp3Path}`);
  console.log(`  Temp copy        : ${result.tempPath}`);
  console.log();
}

main().catch((err) => {
  console.error('\n❌  Voice generation failed:\n');
  console.error(err.message);
  process.exit(1);
});
