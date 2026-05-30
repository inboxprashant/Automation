#!/usr/bin/env node
/**
 * Standalone stock clip fetcher CLI.
 *
 * Modes:
 *   1. From a saved script (by jobId):
 *        node scripts/fetch_clips.js --job <jobId>
 *
 *   2. From explicit keywords + niche:
 *        node scripts/fetch_clips.js --keywords "AI,automation,robot" --niche ai_tools
 *
 *   3. From explicit search queries:
 *        node scripts/fetch_clips.js --queries "robot technology,computer screen code"
 *
 * Options:
 *   --count <n>       Number of clips to fetch (default: 6)
 *   --portrait        Only download portrait-orientation clips
 *   --cache-stats     Print cache statistics and exit
 *   --list-cache      List all cached clips and exit
 *   --clear-unused    Remove never-used clips from cache and exit
 */

'use strict';

require('dotenv').config();

const { fetchClips, fetchClipsForQueries } = require('../src/media/mediaFetcher');
const { buildQueries }  = require('../src/media/keywordMapper');
const { loadScript }    = require('../src/ai/scriptStorage');
const { stats, listAll, CLIPS_DIR } = require('../src/media/clipCache');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; }
function hasFlag(flag) { return args.includes(flag); }

// ── Utility commands ─────────────────────────────────────────────────────────

if (hasFlag('--cache-stats')) {
  const s = stats();
  console.log('\n── Clip Cache Statistics ───────────────────────────────────');
  console.log(`  Total clips    : ${s.total}`);
  console.log(`  Total size     : ${s.totalSizeMb} MB`);
  console.log(`  By provider    :`);
  for (const [p, n] of Object.entries(s.byProvider)) {
    console.log(`    ${p.padEnd(12)} ${n}`);
  }
  console.log(`  Cache dir      : ${CLIPS_DIR}`);
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

if (hasFlag('--list-cache')) {
  const clips = listAll();
  console.log(`\n── Cached Clips (${clips.length}) ──────────────────────────────────`);
  clips.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. [${c.provider}] ${c.id} | ${c.duration}s | ${c.width}×${c.height} | used:${c.usedCount}`);
    console.log(`       ${c.localRelative}`);
  });
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Stock Clip Fetcher');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const jobArg      = getArg('--job');
  const keywordsArg = getArg('--keywords');
  const queriesArg  = getArg('--queries');
  const nicheArg    = getArg('--niche') ?? 'general';
  const countArg    = parseInt(getArg('--count') ?? '6', 10);
  const portraitOnly = hasFlag('--portrait');

  let result;

  if (jobArg) {
    // ── Mode 1: from script ──────────────────────────────────────────────
    console.log(`Loading script for job: ${jobArg}`);
    const script = loadScript(jobArg);
    if (!script) {
      console.error(`❌  No script found for jobId: ${jobArg}`);
      process.exit(1);
    }
    console.log(`Script: "${script.title}" | niche: ${script.niche}\n`);
    result = await fetchClips(script, { targetClips: countArg, portraitOnly });

  } else if (keywordsArg) {
    // ── Mode 2: from keywords ────────────────────────────────────────────
    const keywords = keywordsArg.split(',').map((k) => k.trim()).filter(Boolean);
    const queries  = buildQueries({ keywords, niche: nicheArg, maxQueries: 8 });
    console.log(`Keywords : ${keywords.join(', ')}`);
    console.log(`Queries  : ${queries.join(' | ')}\n`);
    result = await fetchClipsForQueries(queries, { targetClips: countArg, portraitOnly });

  } else if (queriesArg) {
    // ── Mode 3: from explicit queries ────────────────────────────────────
    const queries = queriesArg.split(',').map((q) => q.trim()).filter(Boolean);
    console.log(`Queries: ${queries.join(' | ')}\n`);
    result = await fetchClipsForQueries(queries, { targetClips: countArg, portraitOnly });

  } else {
    console.error('Usage:');
    console.error('  node scripts/fetch_clips.js --job <jobId>');
    console.error('  node scripts/fetch_clips.js --keywords "AI,robot,tech" --niche ai_tools');
    console.error('  node scripts/fetch_clips.js --queries "robot technology,computer screen"');
    console.error('  node scripts/fetch_clips.js --cache-stats');
    console.error('  node scripts/fetch_clips.js --list-cache');
    process.exit(1);
  }

  console.log('\n✅  Clips ready!\n');
  console.log(`  Downloaded  : ${result.downloaded}`);
  console.log(`  From cache  : ${result.fromCache}`);
  console.log(`  Total ready : ${result.clipPaths.length}`);
  console.log('\n── Clip paths ──────────────────────────────────────────────');
  result.clipPaths.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log('────────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\n❌  Clip fetch failed:\n');
  console.error(err.message);
  process.exit(1);
});
