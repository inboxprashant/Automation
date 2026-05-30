/**
 * Workflow Steps
 *
 * Each step is a named async function that:
 *   • Accepts a shared `context` object (passed through the whole workflow)
 *   • Reads inputs from context, writes outputs back to context
 *   • Throws on unrecoverable failure (workflow manager handles retry/abort)
 *   • Logs its own start/end with timing
 *
 * Context shape (built up as steps run):
 * {
 *   jobId, niche, startedAt,
 *   trend,          ← from findTrends
 *   script,         ← from generateScript
 *   voiceResult,    ← from generateVoice
 *   audioPath,
 *   captionResult,  ← from generateCaptions
 *   srtPath,
 *   clipPaths,      ← from fetchClips
 *   videoResult,    ← from createVideo
 *   videoPath,
 *   thumbnailResult,← from generateThumbnail
 *   thumbnailPath,
 *   uploadResult,   ← from uploadVideo
 *   videoId,
 *   videoUrl,
 * }
 */

'use strict';

const logger = require('../utils/logger');
const config = require('../config');
const { cleanTemp } = require('../utils/fs');

// ── Step factory ──────────────────────────────────────────────────────────────

/**
 * Wrap a step function with consistent timing logs.
 *
 * @param {string}   name
 * @param {Function} fn   — async (context) => void
 * @returns {Function}    — async (context) => void
 */
function step(name, fn) {
  return async function runStep(context) {
    const t0 = Date.now();
    logger.info(`  ┌─ [step] ${name}`);
    try {
      await fn(context);
      const ms = Date.now() - t0;
      logger.info(`  └─ [step] ${name} ✅ (${(ms / 1000).toFixed(1)}s)`);
    } catch (err) {
      const ms = Date.now() - t0;
      logger.error(`  └─ [step] ${name} ❌ (${(ms / 1000).toFixed(1)}s): ${err.message}`);
      throw err;
    }
  };
}

// ── Step 1: Find Trends ───────────────────────────────────────────────────────

const stepFindTrends = step('Find Trends', async (ctx) => {
  const { findTrends } = require('../trends/trendFinder');
  const report = await findTrends();

  // Pick the top trend for this job's niche, or the overall #1
  const nicheMatch = report.trends.find((t) => t.niche === ctx.niche);
  ctx.trend = nicheMatch ?? report.trends[0] ?? null;

  if (ctx.trend) {
    logger.info(`  │  Trend: "${ctx.trend.topic}" (score: ${ctx.trend.viralScore})`);
  } else {
    logger.warn('  │  No trend found — using configured niche only');
  }
});

// ── Step 2: Generate Script ───────────────────────────────────────────────────

const stepGenerateScript = step('Generate Script', async (ctx) => {
  const { generateScript } = require('../ai/scriptGenerator');
  ctx.script = await generateScript(ctx.niche, ctx.jobId);
  logger.info(`  │  Title: "${ctx.script.title}"`);
  logger.info(`  │  Niche: ${ctx.script.niche} | ~${ctx.script.estimatedDuration}s`);
});

// ── Step 3: Generate Voice ────────────────────────────────────────────────────

const stepGenerateVoice = step('Generate Voice', async (ctx) => {
  const { generateVoiceFromScript } = require('../voice/voiceGenerator');
  ctx.voiceResult = await generateVoiceFromScript(ctx.script, ctx.jobId);
  ctx.audioPath   = ctx.voiceResult.tempPath;
  logger.info(`  │  Voice: ${ctx.voiceResult.voiceName} | ${ctx.voiceResult.durationEstimate}s`);
});

// ── Step 4: Download Stock Clips ──────────────────────────────────────────────

const stepFetchClips = step('Download Stock Clips', async (ctx) => {
  const { fetchClips } = require('../media/mediaFetcher');
  try {
    const result = await fetchClips(ctx.script, {
      targetClips: config.media?.targetClips ?? 6,
    });
    ctx.clipPaths = result.clipPaths;
    logger.info(`  │  Clips: ${result.clipPaths.length} ready (${result.downloaded} new, ${result.fromCache} cached)`);
  } catch (err) {
    // Non-fatal — video builder falls back to assets/backgrounds/
    logger.warn(`  │  Clip fetch failed (non-fatal): ${err.message}`);
    ctx.clipPaths = [];
  }
});

// ── Step 5: Generate Subtitles ────────────────────────────────────────────────

const stepGenerateCaptions = step('Generate Subtitles', async (ctx) => {
  const { generateCaptions } = require('../captions/captionGenerator');
  ctx.captionResult = await generateCaptions(ctx.audioPath, ctx.jobId, {
    niche:          ctx.script.niche,
    scriptKeywords: ctx.script.keywords ?? [],
    scriptTitle:    ctx.script.title,
  });
  ctx.srtPath = ctx.captionResult.highlightedSrtPath;
  logger.info(`  │  Words: ${ctx.captionResult.wordCount} | Highlights: ${ctx.captionResult.highlightCount}`);
});

// ── Step 6: Create Video ──────────────────────────────────────────────────────

const stepCreateVideo = step('Create Video', async (ctx) => {
  const { createVideo } = require('../video/videoCreator');
  const path = require('path');

  ctx.videoResult = await createVideo({
    audioPath:  ctx.audioPath,
    srtPath:    ctx.srtPath,
    title:      ctx.script.title,
    jobId:      ctx.jobId,
    niche:      ctx.script.niche,
    scriptPath: ctx.script.savedTo ? path.resolve(ctx.script.savedTo) : null,
  });
  ctx.videoPath = ctx.videoResult.mp4Path;
  logger.info(`  │  Video: ${ctx.videoResult.fileSizeKb} KB`);
});

// ── Step 7: Generate Thumbnail ────────────────────────────────────────────────

const stepGenerateThumbnail = step('Generate Thumbnail', async (ctx) => {
  const { generateThumbnail } = require('../thumbnail/thumbnailGenerator');
  try {
    ctx.thumbnailResult = await generateThumbnail(ctx.script, ctx.jobId);
    ctx.thumbnailPath   = ctx.thumbnailResult.jpgPath;
    logger.info(`  │  Thumbnail: ${ctx.thumbnailResult.colorScheme} | ${ctx.thumbnailResult.fileSizeKb} KB`);
  } catch (err) {
    // Non-fatal
    logger.warn(`  │  Thumbnail failed (non-fatal): ${err.message}`);
    ctx.thumbnailPath = null;
  }
});

// ── Step 8: Upload to YouTube ─────────────────────────────────────────────────

const stepUploadVideo = step('Upload to YouTube', async (ctx) => {
  const { uploadVideo } = require('../upload/youtubeUploader');
  ctx.uploadResult = await uploadVideo({
    videoPath:     ctx.videoPath,
    title:         ctx.script.title,
    description:   ctx.script.description,
    tags:          ctx.script.tags,
    thumbnailPath: ctx.thumbnailPath ?? undefined,
    jobId:         ctx.jobId,
    niche:         ctx.script.niche,
    script:        ctx.script,
    scheduledFor:  ctx.scheduledFor ?? null,   // from batch context
    privacyStatus: ctx.scheduledFor ? 'private' : 'public',
  });
  ctx.videoId  = ctx.uploadResult.videoId;
  ctx.videoUrl = ctx.uploadResult.videoUrl;
  const label  = ctx.scheduledFor
    ? `Scheduled for ${new Date(ctx.scheduledFor).toLocaleString()}`
    : `Published: ${ctx.videoUrl}`;
  logger.info(`  │  ${label}`);
});

// ── Step 9: Send Notification ─────────────────────────────────────────────────

const stepNotify = step('Send Notification', async (ctx) => {
  const { sendPublishedNotification } = require('../notifications/emailNotifier');
  await sendPublishedNotification({
    jobId:         ctx.jobId,
    title:         ctx.script.title,
    videoUrl:      ctx.videoUrl,
    videoId:       ctx.videoId,
    niche:         ctx.script.niche,
    privacyStatus: ctx.uploadResult?.privacyStatus ?? 'public',
    thumbnailSet:  !!ctx.thumbnailPath,
    retryCount:    ctx.uploadResult?.retryCount ?? 0,
    durationMs:    ctx.uploadResult?.durationMs ?? 0,
  });
  logger.info(`  │  Notification sent`);
});

// ── Step: Cleanup ─────────────────────────────────────────────────────────────

const stepCleanup = step('Cleanup Temp Files', async (ctx) => {
  cleanTemp();
  logger.info(`  │  Temp files cleaned`);
});

// ── Exported step list ────────────────────────────────────────────────────────

/**
 * The canonical ordered step list for a full workflow run.
 * Each entry: { name, fn, fatal }
 *   fatal: true  → workflow aborts if this step fails
 *   fatal: false → workflow continues (step is best-effort)
 */
const WORKFLOW_STEPS = [
  { name: 'findTrends',        fn: stepFindTrends,        fatal: false },
  { name: 'generateScript',    fn: stepGenerateScript,    fatal: true  },
  { name: 'generateVoice',     fn: stepGenerateVoice,     fatal: true  },
  { name: 'fetchClips',        fn: stepFetchClips,        fatal: false },
  { name: 'generateCaptions',  fn: stepGenerateCaptions,  fatal: true  },
  { name: 'createVideo',       fn: stepCreateVideo,       fatal: true  },
  { name: 'generateThumbnail', fn: stepGenerateThumbnail, fatal: false },
  { name: 'uploadVideo',       fn: stepUploadVideo,       fatal: true  },
  { name: 'notify',            fn: stepNotify,            fatal: false },
  { name: 'cleanup',           fn: stepCleanup,           fatal: false },
];

module.exports = {
  WORKFLOW_STEPS,
  stepFindTrends,
  stepGenerateScript,
  stepGenerateVoice,
  stepFetchClips,
  stepGenerateCaptions,
  stepCreateVideo,
  stepGenerateThumbnail,
  stepUploadVideo,
  stepNotify,
  stepCleanup,
};
