#!/usr/bin/env node
/**
 * Standalone trend finder CLI.
 *
 * Usage:
 *   node scripts/find_trends.js           # run all sources
 *   node scripts/find_trends.js --dry-run # score but don't save
 *
 * Output is saved to project/trends/YYYY-MM-DD.json
 */

'use strict';

require('dotenv').config();

const { findTrends } = require('../src/trends/trendFinder');

const isDryRun = process.argv.includes('--dry-run');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Trend Finder');
if (isDryRun) console.log('  [DRY RUN — results will not be saved]');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

findTrends()
  .then((report) => {
    console.log(`\n✅  Trend report for ${report.date}\n`);
    console.log(`  Total raw trends collected : ${report._meta.totalRawTrends}`);
    console.log(`  Topics saved               : ${report._meta.topicCount}`);
    console.log(`  Sources:`);
    for (const [src, count] of Object.entries(report._meta.sourceCounts)) {
      console.log(`    ${src.padEnd(30)} ${count}`);
    }
    console.log('\n── Top 10 ──────────────────────────────────────────────');
    report.trends.forEach((t) => {
      const score = String(t.viralScore).padStart(5);
      const niche = t.niche.padEnd(14);
      console.log(`  #${t.rank}  score:${score}  [${niche}]  ${t.topic}`);
      console.log(`         keywords: ${t.keywords.slice(0, 4).join(', ')}`);
    });
    console.log('────────────────────────────────────────────────────────\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌  Trend finder failed:\n');
    console.error(err.message);
    process.exit(1);
  });
