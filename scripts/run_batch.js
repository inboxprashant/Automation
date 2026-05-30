#!/usr/bin/env node
/**
 * run_batch.js — CLI entry point for daily batch generation.
 *
 * Called by the dashboard API route as a detached child process.
 * Also usable directly from the terminal.
 *
 * Usage:
 *   node scripts/run_batch.js
 *   node scripts/run_batch.js --count 4 --start-hour 9 --interval 4
 *   node scripts/run_batch.js --count 5 --start-hour 8 --interval 3
 */

'use strict';

require('dotenv').config();

const { startBatch, getBatchState } = require('../src/batch/batchService');

const args = process.argv.slice(2);
function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : def;
}

const count         = parseInt(getArg('--count',       '4'), 10);
const startHour     = parseInt(getArg('--start-hour',  '9'), 10);
const intervalHours = parseInt(getArg('--interval',    '4'), 10);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  YouTube Shorts — Daily Batch Generator`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
console.log(`  Videos      : ${count}`);
console.log(`  First slot  : ${startHour}:00 UTC`);
console.log(`  Interval    : every ${intervalHours}h`);
console.log();

try {
  const { batchId, scheduledTimes } = startBatch({ count, startHour, intervalHours });

  console.log(`  Batch ID    : ${batchId}`);
  console.log(`  Schedule    :`);
  scheduledTimes.forEach((t, i) => {
    const local = new Date(t).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: process.env.SCHEDULE_TIMEZONE ?? 'UTC',
    });
    console.log(`    Video ${i + 1}  → ${local}`);
  });
  console.log(`\n  Batch running in background. Check dashboard for progress.\n`);

  // Keep process alive until batch completes (poll state file)
  const interval = setInterval(() => {
    const state = getBatchState();
    if (!state) return;
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
      const success = (state.videos ?? []).filter((v) => v.status === 'scheduled').length;
      const failed  = (state.videos ?? []).filter((v) => v.status === 'failed').length;
      console.log(`\n  Batch ${state.status.toUpperCase()}`);
      console.log(`  Scheduled: ${success}  Failed: ${failed}`);
      clearInterval(interval);
      process.exit(state.status === 'completed' ? 0 : 1);
    }
  }, 5000);

} catch (err) {
  console.error(`\n❌  Batch failed to start: ${err.message}\n`);
  process.exit(1);
}
