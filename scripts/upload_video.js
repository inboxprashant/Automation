#!/usr/bin/env node
/**
 * Standalone YouTube upload CLI.
 *
 * Modes:
 *   1. From a pipeline job (looks up video + thumbnail automatically):
 *        node scripts/upload_video.js --job <jobId>
 *
 *   2. From explicit file paths:
 *        node scripts/upload_video.js \
 *          --video     project/renders/ai_tools/2024-01-15_abc.mp4 \
 *          --title     "The AI Tool That Replaced My Team" \
 *          --thumbnail project/thumbnails/ai_tools/2024-01-15_abc.jpg
 *
 * Options:
 *   --privacy  <status>    public | private | unlisted  (default: public)
 *   --schedule <datetime>  ISO 8601 datetime for scheduled publish
 *                          e.g. "2024-01-16T09:00:00Z"
 *   --niche    <niche>     Content niche (default: general)
 *   --dry-run              Build metadata and log it, but don't upload
 *   --logs                 Print recent upload logs and exit
 *   --list                 List all uploads from the index and exit
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs   = require('fs');

const { uploadVideo }       = require('../src/upload/youtubeUploader');
const { buildMetadata }     = require('../src/upload/metadataBuilder');
const { listUploads, getRecentLogs } = require('../src/upload/uploadLogger');
const { loadScript }        = require('../src/ai/scriptStorage');
const { loadRender }        = require('../src/video/renderStorage');
const { loadThumbnail }     = require('../src/thumbnail/thumbnailStorage');
const { v4: uuidv4 }        = require('uuid');

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(flag) { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; }
function hasFlag(flag) { return args.includes(flag); }

// ── Utility commands ─────────────────────────────────────────────────────────

if (hasFlag('--logs')) {
  const logs = getRecentLogs(20);
  console.log(`\n── Recent Upload Logs (${logs.length}) ─────────────────────────────`);
  logs.forEach((e) => {
    const icon = e.status === 'success' ? '✅' : '❌';
    console.log(`  ${icon} [${e.status.padEnd(7)}] ${e.jobId}  "${e.title?.slice(0, 40)}"`);
    if (e.videoUrl)     console.log(`         URL: ${e.videoUrl}`);
    if (e.errorMessage) console.log(`         ERR: ${e.errorMessage?.slice(0, 80)}`);
  });
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

if (hasFlag('--list')) {
  const uploads = listUploads();
  console.log(`\n── Upload Index (${uploads.length} total) ──────────────────────────────`);
  uploads.slice(0, 30).forEach((u, i) => {
    const icon = u.status === 'success' ? '✅' : '❌';
    console.log(`  ${String(i + 1).padStart(3)}. ${icon} ${u.jobId}  "${u.title?.slice(0, 45)}"`);
    if (u.videoUrl) console.log(`       ${u.videoUrl}`);
  });
  console.log('────────────────────────────────────────────────────────────\n');
  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Upload Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  const jobArg       = getArg('--job');
  const videoArg     = getArg('--video');
  const titleArg     = getArg('--title');
  const thumbArg     = getArg('--thumbnail');
  const privacyArg   = getArg('--privacy')  ?? 'public';
  const scheduleArg  = getArg('--schedule') ?? null;
  const nicheArg     = getArg('--niche')    ?? 'general';
  const isDryRun     = hasFlag('--dry-run');
  const jobId        = jobArg ?? uuidv4().split('-')[0];

  let videoPath, thumbnailPath, script, niche;

  if (jobArg) {
    // ── Mode 1: from job records ─────────────────────────────────────────
    console.log(`Loading records for job: ${jobArg}\n`);

    const renderRecord = loadRender(jobArg);
    if (!renderRecord) {
      console.error(`❌  No render found for job: ${jobArg}`);
      console.error('    Run: node scripts/generate_video.js --job <jobId>');
      process.exit(1);
    }

    videoPath     = renderRecord.mp4Path;
    niche         = renderRecord.niche ?? nicheArg;
    script        = loadScript(jobArg);

    const thumbRecord = loadThumbnail(jobArg);
    thumbnailPath = thumbRecord?.jpgPath ?? null;

    console.log(`Video     : ${videoPath}`);
    console.log(`Thumbnail : ${thumbnailPath ?? '(none)'}`);
    console.log(`Title     : "${renderRecord.title}"\n`);

  } else if (videoArg) {
    // ── Mode 2: explicit paths ───────────────────────────────────────────
    videoPath     = path.resolve(videoArg);
    thumbnailPath = thumbArg ? path.resolve(thumbArg) : null;
    niche         = nicheArg;
    script        = titleArg
      ? { title: titleArg, description: '', tags: [], keywords: [], niche }
      : null;

    if (!fs.existsSync(videoPath)) {
      console.error(`❌  Video file not found: ${videoPath}`); process.exit(1);
    }

  } else {
    console.error('Usage:');
    console.error('  node scripts/upload_video.js --job <jobId>');
    console.error('  node scripts/upload_video.js --video <path> --title "Title"');
    console.error('  node scripts/upload_video.js --logs');
    console.error('  node scripts/upload_video.js --list');
    process.exit(1);
  }

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (isDryRun) {
    const meta = buildMetadata(
      script ?? { title: 'Test', description: '', tags: [], keywords: [], niche },
      { privacyStatus: privacyArg, scheduledFor: scheduleArg }
    );
    console.log('[DRY RUN] Metadata that would be uploaded:\n');
    console.log(JSON.stringify(meta, null, 2));
    console.log();
    process.exit(0);
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  if (scheduleArg) {
    console.log(`Scheduled publish: ${scheduleArg}\n`);
  }

  const result = await uploadVideo({
    videoPath,
    title:         script?.title ?? 'YouTube Short',
    description:   script?.description ?? '',
    tags:          script?.tags ?? [],
    thumbnailPath: thumbnailPath ?? undefined,
    jobId,
    niche,
    privacyStatus: privacyArg,
    scheduledFor:  scheduleArg,
    script:        script ?? undefined,
  });

  console.log('\n✅  Upload successful!\n');
  console.log(`  Job ID        : ${result.jobId}`);
  console.log(`  Video ID      : ${result.videoId}`);
  console.log(`  URL           : ${result.videoUrl}`);
  console.log(`  Privacy       : ${result.privacyStatus}`);
  if (result.scheduledFor) {
    console.log(`  Publish at    : ${result.scheduledFor}`);
  }
  console.log(`  Thumbnail     : ${result.thumbnailSet ? '✅ set' : '⚠️  not set'}`);
  console.log(`  Retries       : ${result.retryCount}`);
  console.log(`  Duration      : ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log();
}

main().catch((err) => {
  console.error('\n❌  Upload failed:\n');
  console.error(err.message);
  process.exit(1);
});
