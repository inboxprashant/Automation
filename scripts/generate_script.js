#!/usr/bin/env node
/**
 * Standalone script generator CLI.
 *
 * Usage:
 *   node scripts/generate_script.js                    # random niche
 *   node scripts/generate_script.js ai_tools           # specific niche
 *   node scripts/generate_script.js money_facts        # specific niche
 *
 * Valid niches: ai_tools | tech_facts | automation | money_facts | productivity
 * Legacy values also work: tech | finance | motivation | facts
 *
 * Output is saved to project/scripts/<niche>/<date>_<jobId>.json
 */

'use strict';

require('dotenv').config();

const { generateScript } = require('../src/ai/scriptGenerator');
const { NICHES } = require('../src/ai/topics');

const category = process.argv[2] || null;

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Script Generator');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (category) {
  console.log(`Niche/category: ${category}\n`);
} else {
  console.log(`No niche specified — picking randomly from: ${NICHES.join(', ')}\n`);
}

generateScript(category)
  .then((script) => {
    console.log('✅  Script generated successfully!\n');
    console.log(`  Job ID    : ${script.jobId}`);
    console.log(`  Title     : ${script.title}`);
    console.log(`  Niche     : ${script.niche}`);
    console.log(`  Angle     : ${script.angle}`);
    console.log(`  Duration  : ~${script.estimatedDuration}s`);
    console.log(`  Saved to  : ${script.savedTo}`);
    console.log('\n── Script Preview ──────────────────────────────────────');
    console.log(`\nHOOK:\n  ${script.hook}`);
    console.log(`\nBODY:\n  ${script.body}`);
    console.log(`\nCTA:\n  ${script.cta}`);
    console.log(`\nTITLE:\n  ${script.title}`);
    console.log(`\nDESCRIPTION:\n  ${script.description}`);
    console.log(`\nTAGS:\n  ${script.tags.join(', ')}`);
    console.log('\n────────────────────────────────────────────────────────\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌  Script generation failed:\n');
    console.error(err.message);
    process.exit(1);
  });
