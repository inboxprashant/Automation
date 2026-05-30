/**
 * YouTube Uploader — production upload module.
 *
 * Features:
 *   • OAuth2 with automatic token refresh  (oauthManager)
 *   • Rich metadata: title, description, hashtags, tags  (metadataBuilder)
 *   • Custom thumbnail upload after video is live
 *   • Scheduled publish time support (publishAt)
 *   • Real-time upload progress logging  (uploadProgress)
 *   • Smart retry: re-authorises on 401, backs off on 5xx, skips 4xx
 *   • Structured upload logs  (uploadLogger)
 *   • Returns a full UploadResult object
 *
 * Exported API:
 *   uploadVideo(opts)  → Promise<UploadResult>
 *
 * @typedef {object} UploadResult
 * @property {string}  jobId
 * @property {string}  videoId
 * @property {string}  videoUrl
 * @property {string}  title
 * @property {string}  privacyStatus
 * @property {string|null} scheduledFor
 * @property {boolean} thumbnailSet
 * @property {number}  retryCount
 * @property {number}  durationMs
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const logger  = require('../utils/logger');
const { sleep } = require('../utils/retry');

const { getYouTubeClient, invalidateClient } = require('./oauthManager');
const { buildMetadata }                      = require('./metadataBuilder');
const { createProgressStream }               = require('./uploadProgress');
const { logSuccess, logFailure }             = require('./uploadLogger');

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_UPLOAD_ATTEMPTS  = 3;
const BASE_RETRY_DELAY_MS  = 8_000;
const UPLOAD_TIMEOUT_MS    = 20 * 60 * 1000;   // 20 min — large files can be slow

// ── Core upload ──────────────────────────────────────────────────────────────

/**
 * Perform a single upload attempt.
 *
 * @param {object} youtube   — authenticated YouTube client
 * @param {object} metadata  — { snippet, status }
 * @param {string} videoPath
 * @param {string} jobId
 * @returns {Promise<string>} videoId
 */
async function _attemptUpload(youtube, metadata, videoPath, jobId) {
  const fileStat  = fs.statSync(videoPath);
  const fileSize  = fileStat.size;
  const label     = `${jobId} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`;

  logger.info(`[youtubeUploader] Uploading ${label}`);

  const fileStream = fs.createReadStream(videoPath);
  const { stream: progressStream } = createProgressStream(
    fileStream, fileSize, jobId
  );

  const response = await youtube.videos.insert(
    {
      part:        ['snippet', 'status'],
      requestBody: metadata,
      media: {
        mimeType: 'video/mp4',
        body:     progressStream,
      },
    },
    { timeout: UPLOAD_TIMEOUT_MS }
  );

  const videoId = response.data.id;
  if (!videoId) throw new Error('YouTube API returned no video ID');
  return videoId;
}

// ── Thumbnail upload ─────────────────────────────────────────────────────────

/**
 * Set a custom thumbnail on an already-uploaded video.
 * Non-fatal — logs a warning on failure.
 *
 * @param {object} youtube
 * @param {string} videoId
 * @param {string} thumbnailPath
 * @returns {Promise<boolean>} true if set successfully
 */
async function _setThumbnail(youtube, videoId, thumbnailPath) {
  if (!thumbnailPath || !fs.existsSync(thumbnailPath)) return false;

  try {
    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: 'image/jpeg',
        body:     fs.createReadStream(thumbnailPath),
      },
    });
    logger.info(`[youtubeUploader] Thumbnail set: ${path.basename(thumbnailPath)}`);
    return true;
  } catch (err) {
    logger.warn(
      `[youtubeUploader] Thumbnail upload failed (non-fatal): ${err.message}. ` +
      'Channel may need to be verified for custom thumbnails.'
    );
    return false;
  }
}

// ── Error classification ─────────────────────────────────────────────────────

function _isAuthError(err) {
  const status = err?.response?.status ?? err?.code;
  return status === 401 || status === 403;
}

function _isRetryableError(err) {
  const status = err?.response?.status ?? err?.code;
  // Retry on server errors and rate limits; not on client errors
  return status === 429 || (status >= 500 && status < 600) || !status;
}

function _extractErrorCode(err) {
  return err?.response?.data?.error?.errors?.[0]?.reason
    ?? err?.response?.status?.toString()
    ?? 'unknown';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a video to YouTube with full retry, logging, and thumbnail support.
 *
 * @param {object}  opts
 * @param {string}  opts.videoPath        — absolute path to the MP4
 * @param {string}  opts.title            — video title
 * @param {string}  opts.description      — video description
 * @param {string[]} opts.tags            — tag array
 * @param {string}  [opts.thumbnailPath]  — absolute path to JPG thumbnail
 * @param {string}  [opts.jobId]          — pipeline job ID
 * @param {string}  [opts.niche]          — content niche
 * @param {string}  [opts.privacyStatus]  — 'public' | 'private' | 'unlisted'
 * @param {string}  [opts.scheduledFor]   — ISO 8601 datetime for scheduled publish
 * @param {object}  [opts.script]         — full script object (for rich metadata)
 * @returns {Promise<UploadResult>}
 */
async function uploadVideo({
  videoPath,
  title,
  description,
  tags,
  thumbnailPath,
  jobId        = 'manual',
  niche        = 'general',
  privacyStatus = 'public',
  scheduledFor  = null,
  script        = null,
}) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`[youtubeUploader] Video file not found: ${videoPath}`);
  }

  const startedAt  = new Date().toISOString();
  const startMs    = Date.now();
  const fileSizeKb = Math.round(fs.statSync(videoPath).size / 1024);

  // Build metadata — use full script object if available for richer output
  const scriptObj = script ?? { title, description, tags, niche, keywords: [] };
  const metadata  = buildMetadata(scriptObj, { privacyStatus, scheduledFor });

  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logger.info(`[youtubeUploader] Job: ${jobId}`);
  logger.info(`[youtubeUploader] Title: "${metadata.snippet.title}"`);
  logger.info(`[youtubeUploader] Privacy: ${metadata.status.privacyStatus}${scheduledFor ? ` → publish at ${scheduledFor}` : ''}`);
  logger.info(`[youtubeUploader] File: ${path.basename(videoPath)} (${fileSizeKb} KB)`);
  logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  let lastError;
  let retryCount = 0;

  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    try {
      // Fresh client on every attempt (handles token refresh after 401)
      const youtube = await getYouTubeClient();

      const videoId = await _attemptUpload(youtube, metadata, videoPath, jobId);
      const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

      logger.info(`[youtubeUploader] ✅ Published: ${videoUrl}`);

      // Set thumbnail
      const thumbnailSet = await _setThumbnail(youtube, videoId, thumbnailPath);

      const durationMs = Date.now() - startMs;

      // Log success
      logSuccess({
        jobId,
        videoId,
        title:         metadata.snippet.title,
        niche,
        startedAt,
        durationMs,
        retryCount,
        videoUrl,
        thumbnailSet:  thumbnailSet ? 'yes' : (thumbnailPath ? 'failed' : 'skipped'),
        scheduledFor,
        privacyStatus: metadata.status.privacyStatus,
        fileSizeKb,
      });

      return {
        jobId,
        videoId,
        videoUrl,
        title:         metadata.snippet.title,
        privacyStatus: metadata.status.privacyStatus,
        scheduledFor:  metadata.status.publishAt ?? null,
        thumbnailSet,
        retryCount,
        durationMs,
      };

    } catch (err) {
      lastError  = err;
      retryCount = attempt - 1;   // fix: retryCount = completed retries, not current attempt

      const code = _extractErrorCode(err);
      logger.warn(`[youtubeUploader] Attempt ${attempt}/${MAX_UPLOAD_ATTEMPTS} failed [${code}]: ${err.message}`);

      // 401/403 — invalidate client so next attempt gets a fresh token
      if (_isAuthError(err)) {
        invalidateClient();
        logger.warn('[youtubeUploader] Auth error — invalidating OAuth client');
      }

      // Non-retryable client errors (400, 404, etc.)
      if (!_isRetryableError(err) && !_isAuthError(err)) {
        logger.error(`[youtubeUploader] Non-retryable error [${code}] — aborting`);
        break;
      }

      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        const waitMs = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
        logger.info(`[youtubeUploader] Retrying in ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }

  // All attempts failed
  const durationMs = Date.now() - startMs;
  const errorCode  = _extractErrorCode(lastError);

  logFailure({
    jobId,
    title:         metadata.snippet.title,
    niche,
    startedAt,
    durationMs,
    retryCount,
    scheduledFor,
    privacyStatus: metadata.status.privacyStatus,
    fileSizeKb,
    error:         lastError,
    errorCode,
  });

  throw new Error(
    `[youtubeUploader] Upload failed after ${retryCount} attempt(s) [${errorCode}]: ${lastError?.message}`
  );
}

module.exports = { uploadVideo };
