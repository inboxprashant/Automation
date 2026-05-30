#!/usr/bin/env node
/**
 * Analytics CLI — collect metrics and generate optimisation report.
 *
 * Usage:
 *   node scripts/run_analytics.js                    # track all videos
 *   node scripts/run_analytics.js --video <videoId>  # track one video
 *   node scripts/run_analytics.js --add <videoId>    # add video to tracking
 *   node scripts/run_analytics.js --report           # show latest report
 *   node scripts/run_analytics.js --report 2024-01-15 # show specific date
 *   node scripts/run_analytics.js --list             # list tracked videos
 *   node scripts/run_analytics.js --dates            # list available reports
 *
 * Options:
 *   --days <n>    Lookback window in days (default: 90)
 */

'use strict';

require('dotenv').config();

const { trackAll, trackVideo, addVideoToTracking, getReport } = require('../src/analytics/analyticsTracker');
const { listTrackedVideos, listReportDates } = require('../src/analytics/analyticsStorage');

const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);

// ── Utility commands ──────────────────────────────────────────────────────────

if (hasFlag('--list')) {
  const videos = listTrackedVideos();
  console.log(`\n── Tracked Videos (${videos.length}) ──────────────────────────────────`);
  if (videos.length === 0) {
    console.log('  (none — upload videos or use --add <videoId>)');
  } else {
    videos.forEach((v, i) => {
      const tier  = v.latestTier ? `[${v.latestTier.toUpperCase()}]` : '';
      const views = v.latestViews ? `${v.latestViews.toLocaleString()} views` : 'no data';
      console.log(`  ${String(i + 1).padStart(3)}. ${tier.padEnd(9)} ${v.videoId}  "${v.title?.slice(0, 45)}"`);
      console.log(`       ${views}  |  niche: ${v.niche}  |  snapshots: ${v.snapshotCount}`);
    });
  }
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

if (hasFlag('--dates')) {
  const dates = listReportDates();
  console.log(`\n── Available Reports (${dates.length}) ──────────────────────────────────`);
  dates.forEach((d) => console.log(`  ${d}`));
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

const addId = getArg('--add');
if (addId) {
  addVideoToTracking(addId);
  console.log(`✅  Added ${addId} to tracking\n`);
  process.exit(0);
}

// ── Report display ────────────────────────────────────────────────────────────

if (hasFlag('--report')) {
  const date   = args[args.indexOf('--report') + 1];
  const target = date && !date.startsWith('--') ? date : undefined;
  const report = getReport(target);

  if (!report) {
    console.log(`\n❌  No report found${target ? ` for ${target}` : ''}. Run without --report to generate one.\n`);
    process.exit(1);
  }

  printReport(report);
  process.exit(0);
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Analytics Tracker');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const videoId    = getArg('--video');
  const lookback   = parseInt(getArg('--days') ?? '90', 10);

  if (videoId) {
    console.log(`Tracking single video: ${videoId}\n`);
    const metrics = await trackVideo(videoId);
    printMetrics(metrics);
    process.exit(0);
  }

  console.log(`Collecting metrics (lookback: ${lookback} days)...\n`);
  const report = await trackAll({ lookbackDays: lookback });
  printReport(report);
}

// ── Display helpers ───────────────────────────────────────────────────────────

function printMetrics(m) {
  console.log(`\n── Metrics: ${m.videoId} ──────────────────────────────────────`);
  console.log(`  Title      : ${m.title}`);
  console.log(`  Views      : ${m.views.toLocaleString()}`);
  console.log(`  Likes      : ${m.likes.toLocaleString()}  (${(m.likeRate * 100).toFixed(2)}%)`);
  console.log(`  Comments   : ${m.comments.toLocaleString()}`);
  if (m.ctr != null)               console.log(`  CTR        : ${(m.ctr * 100).toFixed(2)}%`);
  if (m.avgViewPercentage != null) console.log(`  Retention  : ${m.avgViewPercentage.toFixed(1)}%`);
  if (m.avgViewDurationSec != null)console.log(`  Avg watch  : ${m.avgViewDurationSec.toFixed(0)}s`);
  if (m.watchTimeMinutes != null)  console.log(`  Watch time : ${m.watchTimeMinutes.toFixed(0)} min`);
  console.log(`  Data source: ${m.dataSource}`);
  console.log('────────────────────────────────────────────────────────────\n');
}

function printReport(report) {
  const avg = report.channelAvg;

  console.log(`\n── Analytics Report: ${report.date} ──────────────────────────`);
  console.log(`  Videos analysed : ${report.videosAnalysed}`);
  console.log(`  Generated at    : ${report.generatedAt}`);

  if (report.videosAnalysed > 0) {
    console.log('\n── Channel Averages ────────────────────────────────────────');
    console.log(`  Views      : ${Math.round(avg.views ?? 0).toLocaleString()}`);
    console.log(`  Like rate  : ${((avg.likeRate ?? 0) * 100).toFixed(2)}%`);
    if (avg.ctr)       console.log(`  CTR        : ${(avg.ctr * 100).toFixed(2)}%`);
    if (avg.retention) console.log(`  Retention  : ${avg.retention.toFixed(1)}%`);
    if (report.bestNiche) console.log(`  Best niche : ${report.bestNiche}`);
  }

  if (report.highPerformers?.length > 0) {
    console.log('\n── 🏆 High Performers ──────────────────────────────────────');
    report.highPerformers.forEach((v) => {
      console.log(`  ✅ [${v.score}] "${v.title?.slice(0, 50)}"`);
      v.strengths?.slice(0, 2).forEach((s) => console.log(`     + ${s}`));
    });
  }

  if (report.lowPerformers?.length > 0) {
    console.log('\n── ⚠️  Low Performers ───────────────────────────────────────');
    report.lowPerformers.forEach((v) => {
      console.log(`  ❌ [${v.score}] "${v.title?.slice(0, 50)}"`);
      v.weaknesses?.slice(0, 2).forEach((w) => console.log(`     - ${w}`));
    });
  }

  if (report.trending?.length > 0) {
    console.log('\n── 📈 Trending ─────────────────────────────────────────────');
    report.trending.forEach((id) => console.log(`  🔥 ${id}`));
  }

  if (report.suggestions?.length > 0) {
    console.log('\n── 💡 Optimisation Suggestions ─────────────────────────────');
    report.suggestions.forEach((s, i) => {
      const icon = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🟢';
      console.log(`\n  ${icon} [${s.priority.toUpperCase()}] ${s.category.toUpperCase()}`);
      console.log(`     Finding : ${s.finding}`);
      console.log(`     Action  : ${s.action}`);
      console.log(`     Impact  : ${s.impact}`);
    });
  }

  console.log('\n────────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\n❌  Analytics failed:\n');
  console.error(err.message);
  process.exit(1);
});
