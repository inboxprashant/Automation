#!/usr/bin/env node
/**
 * Standalone thumbnail generator CLI.
 *
 * Modes:
 *   1. From a saved script (by jobId):
 *        node scripts/generate_thumbnail.js --job <jobId>
 *
 *   2. From a script JSON file:
 *        node scripts/generate_thumbnail.js --file project/scripts/ai_tools/2024-01-15_abc.json
 *
 *   3. Quick test with raw text:
 *        node scripts/generate_thumbnail.js \
 *          --title "The AI Tool That Replaced My Team" \
 *          --hook  "One AI tool just made 3 job roles obsolete" \
 *          --niche ai_tools
 *
 * Options:
 *   --scheme <name>   Force a colour scheme (red_black, yellow_black, etc.)
 *   --list-schemes    Print available colour schemes and exit
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs   = require('fs');

const { generateThumbnail }  = require('../src/thumbnail/thumbnailGenerator');
const { COLOR_SCHEMES }      = require('../src/thumbnail/textGenerator');
const { loadScript }         = require('../src/ai/scriptStorage');
const { v4: uuidv4 }         = require('uuid');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; }
function hasFlag(flag) { return args.includes(flag); }

// ── List schemes ─────────────────────────────────────────────────────────────

if (hasFlag('--list-schemes')) {
  console.log('\n── Colour Schemes ──────────────────────────────────────────');
  Object.entries(COLOR_SCHEMES).forEach(([name, c]) => {
    console.log(`  ${name.padEnd(16)} primary: ${c.primary}  text: ${c.text}`);
  });
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Thumbnail Generator');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const jobArg   = getArg('--job');
  const fileArg  = getArg('--file');
  const titleArg = getArg('--title');
  const hookArg  = getArg('--hook')  ?? '';
  const nicheArg = getArg('--niche') ?? 'general';
  const jobId    = jobArg ?? uuidv4().split('-')[0];

  let script;

  if (jobArg) {
    script = loadScript(jobArg);
    if (!script) {
      console.error(`❌  No script found for jobId: ${jobArg}`);
      process.exit(1);
    }
    console.log(`Script: "${script.title}" | niche: ${script.niche}\n`);

  } else if (fileArg) {
    const p = path.resolve(fileArg);
    if (!fs.existsSync(p)) { console.error(`❌  File not found: ${p}`); process.exit(1); }
    script = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`Script: "${script.title}"\n`);

  } else if (titleArg) {
    script = {
      title:    titleArg,
      hook:     hookArg,
      niche:    nicheArg,
      keywords: [],
    };
    console.log(`Title: "${titleArg}" | niche: ${nicheArg}\n`);

  } else {
    console.error('Usage:');
    console.error('  node scripts/generate_thumbnail.js --job <jobId>');
    console.error('  node scripts/generate_thumbnail.js --file <path/to/script.json>');
    console.error('  node scripts/generate_thumbnail.js --title "Your Title" --niche ai_tools');
    console.error('  node scripts/generate_thumbnail.js --list-schemes');
    process.exit(1);
  }

  const result = await generateThumbnail(script, jobId);

  console.log('✅  Thumbnail generated!\n');
  console.log(`  Job ID       : ${result.jobId}`);
  console.log(`  Headline     : ${result.headline}`);
  console.log(`  Colour scheme: ${result.colorScheme}`);
  console.log(`  File size    : ${result.fileSizeKb} KB`);
  console.log(`  Saved to     : ${result.jpgPath}`);
  console.log(`\n  Copy details:`);
  console.log(`    Subheadline: ${result.copy.subheadline}`);
  console.log(`    Badge      : ${result.copy.badge}`);
  console.log(`    Arrow      : ${result.copy.arrowLabel}`);
  console.log(`    CTA        : ${result.copy.ctaText}`);
  console.log(`    Emotion    : ${result.copy.emotion}`);
  console.log();
}

main().catch((err) => {
  console.error('\n❌  Thumbnail generation failed:\n');
  console.error(err.message);
  process.exit(1);
});
