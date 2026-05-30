#!/usr/bin/env node
/**
 * Scheduler status and management CLI.
 *
 * Usage:
 *   node scripts/scheduler_status.js              # show full status
 *   node scripts/scheduler_status.js --slots      # show configured slots
 *   node scripts/scheduler_status.js --queue      # show task queue
 *   node scripts/scheduler_status.js --retry      # show retry queue
 *   node scripts/scheduler_status.js --dead       # show dead-letter jobs
 *   node scripts/scheduler_status.js --requeue <jobId>  # re-queue dead-letter job
 *   node scripts/scheduler_status.js --history    # show recent workflow runs
 */

'use strict';

require('dotenv').config();

const { buildScheduleSlots, formatSlot } = require('../src/scheduler/scheduleConfig');
const { retryTracker }   = require('../src/scheduler/retryTracker');
const { queue }          = require('../src/workflow/taskQueue');
const { workflowManager }= require('../src/workflow/workflowManager');

const args    = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

// ── Re-queue dead-letter ──────────────────────────────────────────────────────

const requeueId = getArg('--requeue');
if (requeueId) {
  const ok = retryTracker.requeueDeadLetter(requeueId);
  console.log(ok
    ? `✅  Job ${requeueId} re-queued for retry`
    : `❌  Job ${requeueId} not found in dead-letter list`
  );
  process.exit(ok ? 0 : 1);
}

// ── Display ───────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Scheduler Status');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const showAll = args.length === 0;

// ── Slots ─────────────────────────────────────────────────────────────────────

if (showAll || hasFlag('--slots')) {
  const slots = buildScheduleSlots();
  console.log('── Upload Schedule ─────────────────────────────────────────');
  slots.forEach((s) => console.log(formatSlot(s)));
  console.log(`\n  Timezone : ${process.env.SCHEDULE_TIMEZONE ?? 'UTC'}`);
  console.log(`  Per slot : ${process.env.SHORTS_PER_DAY ?? 1} workflow(s)`);
  console.log('────────────────────────────────────────────────────────────\n');
}

// ── Queue ─────────────────────────────────────────────────────────────────────

if (showAll || hasFlag('--queue')) {
  const s = queue.getStatus();
  console.log('── Task Queue ──────────────────────────────────────────────');
  console.log(`  Pending     : ${s.pending}`);
  console.log(`  Running     : ${s.running}`);
  console.log(`  Paused      : ${s.paused}`);
  console.log(`  Concurrency : ${s.concurrency}`);

  const pending = queue.getPending();
  if (pending.length > 0) {
    console.log('\n  Pending tasks:');
    pending.forEach((t) => console.log(`    • ${t.id}  ${t.name}  (enqueued: ${t.enqueuedAt})`));
  }
  console.log('────────────────────────────────────────────────────────────\n');
}

// ── Retry queue ───────────────────────────────────────────────────────────────

if (showAll || hasFlag('--retry')) {
  const r = retryTracker.getStatus();
  console.log('── Retry Queue ─────────────────────────────────────────────');
  console.log(`  Pending     : ${r.pending}`);
  console.log(`  Dead-letter : ${r.deadLetter}`);

  if (r.jobs.length > 0) {
    console.log('\n  Jobs pending retry:');
    r.jobs.forEach((j) => {
      const next = new Date(j.nextRetryAt).toLocaleString();
      console.log(`    • ${j.jobId}  [${j.niche}]  attempt ${j.attempts}  next: ${next}`);
      if (j.error) console.log(`      Error: ${j.error}`);
    });
  }
  console.log('────────────────────────────────────────────────────────────\n');
}

// ── Dead-letter ───────────────────────────────────────────────────────────────

if (hasFlag('--dead')) {
  const dead = retryTracker.getDeadLetter();
  console.log(`── Dead-Letter Jobs (${dead.length}) ──────────────────────────────`);
  if (dead.length === 0) {
    console.log('  (none)');
  } else {
    dead.forEach((j) => {
      console.log(`  • ${j.jobId}  [${j.niche}]  failed: ${j.deadAt}`);
      console.log(`    Error: ${j.errorMessage?.slice(0, 80)}`);
      console.log(`    Re-queue: node scripts/scheduler_status.js --requeue ${j.jobId}`);
    });
  }
  console.log('────────────────────────────────────────────────────────────\n');
}

// ── History ───────────────────────────────────────────────────────────────────

if (showAll || hasFlag('--history')) {
  const runs = workflowManager.getHistory(10);
  console.log(`── Recent Workflow Runs (${runs.length}) ──────────────────────────`);
  if (runs.length === 0) {
    console.log('  (no runs yet)');
  } else {
    runs.forEach((r) => {
      const icon    = r.success ? '✅' : '❌';
      const elapsed = r.durationMs ? `${(r.durationMs / 1000).toFixed(0)}s` : '?';
      console.log(`  ${icon} ${r.jobId}  [${r.niche}]  ${elapsed}  "${r.title ?? '—'}"`);
      if (r.videoUrl)     console.log(`     ${r.videoUrl}`);
      if (r.errorMessage) console.log(`     ERR: ${r.errorMessage?.slice(0, 80)}`);
    });
  }
  console.log('────────────────────────────────────────────────────────────\n');
}
