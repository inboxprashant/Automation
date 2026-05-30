#!/usr/bin/env node
/**
 * Workflow runner CLI — run one or more workflows immediately.
 *
 * Usage:
 *   node scripts/run_workflow.js                        # run once, default niche
 *   node scripts/run_workflow.js --niche ai_tools       # specific niche
 *   node scripts/run_workflow.js --count 3              # run 3 times
 *   node scripts/run_workflow.js --skip findTrends      # skip a step
 *   node scripts/run_workflow.js --status               # show queue status
 *   node scripts/run_workflow.js --history              # show recent runs
 *   node scripts/run_workflow.js --steps                # list all steps
 */

'use strict';

require('dotenv').config();

const { workflowManager } = require('../src/workflow/workflowManager');
const { queue }           = require('../src/workflow/taskQueue');
const { WORKFLOW_STEPS }  = require('../src/workflow/steps');

const args     = process.argv.slice(2);
const getArg   = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag  = (f) => args.includes(f);

// ── Utility commands ──────────────────────────────────────────────────────────

if (hasFlag('--status')) {
  const s = queue.getStatus();
  console.log('\n── Queue Status ────────────────────────────────────────────');
  console.log(`  Pending     : ${s.pending}`);
  console.log(`  Running     : ${s.running}`);
  console.log(`  Paused      : ${s.paused}`);
  console.log(`  Concurrency : ${s.concurrency}`);
  console.log(`  History     : ${s.history} entries`);
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

if (hasFlag('--history')) {
  const runs = workflowManager.getHistory(20);
  console.log(`\n── Recent Workflow Runs (${runs.length}) ──────────────────────────`);
  runs.forEach((r) => {
    const icon    = r.success ? '✅' : '❌';
    const elapsed = r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : '?';
    console.log(`  ${icon} ${r.jobId}  [${r.niche}]  ${elapsed}  "${r.title ?? '—'}"`);
    if (r.videoUrl)     console.log(`       ${r.videoUrl}`);
    if (r.errorMessage) console.log(`       ERR: ${r.errorMessage?.slice(0, 80)}`);
  });
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

if (hasFlag('--steps')) {
  console.log('\n── Workflow Steps ──────────────────────────────────────────');
  WORKFLOW_STEPS.forEach((s, i) => {
    const fatal = s.fatal ? '(fatal)' : '(optional)';
    console.log(`  ${String(i + 1).padStart(2)}. ${s.name.padEnd(22)} ${fatal}`);
  });
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Workflow Runner');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const niche      = getArg('--niche')  ?? undefined;
  const count      = parseInt(getArg('--count') ?? '1', 10);
  const skipRaw    = getArg('--skip');
  const skipSteps  = skipRaw ? skipRaw.split(',').map((s) => s.trim()) : [];

  if (niche)            console.log(`Niche      : ${niche}`);
  if (count > 1)        console.log(`Count      : ${count}`);
  if (skipSteps.length) console.log(`Skip steps : ${skipSteps.join(', ')}`);
  console.log();

  let results;

  if (count > 1) {
    results = await workflowManager.runBatch(count, { niche, skipSteps });
  } else {
    const result = await workflowManager.run({ niche, skipSteps });
    results = [result];
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n── Results ─────────────────────────────────────────────────');
  results.forEach((r, i) => {
    const icon    = r.success ? '✅' : '❌';
    const elapsed = `${(r.durationMs / 1000).toFixed(1)}s`;
    console.log(`\n  ${i + 1}. ${icon} Job: ${r.jobId}  (${elapsed})`);
    if (r.title)        console.log(`     Title   : ${r.title}`);
    if (r.videoUrl)     console.log(`     URL     : ${r.videoUrl}`);
    if (r.errorMessage) console.log(`     Error   : ${r.errorMessage}`);
    console.log(`     Steps   : ✅ ${r.completedSteps.length}  ❌ ${r.failedSteps.length}`);
  });
  console.log('\n────────────────────────────────────────────────────────────\n');

  const allSuccess = results.every((r) => r.success);
  process.exit(allSuccess ? 0 : 1);
}

main().catch((err) => {
  console.error('\n❌  Workflow runner failed:\n');
  console.error(err.message);
  process.exit(1);
});
