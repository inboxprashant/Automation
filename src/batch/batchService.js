/**
 * Batch Service — Daily Shorts batch generation with scheduled publishing.
 *
 * Completely additive — does NOT modify any existing modules.
 * Uses workflowManager.run() with scheduledFor to upload as private+scheduled.
 *
 * Flow:
 *   1. Calculate N evenly-spaced publish times across the next 24 hours
 *   2. Run N workflows sequentially (each uploads as private + scheduledFor)
 *   3. Persist progress to project/logs/batch_state.json (polled by dashboard)
 *   4. Send a summary email when all done
 *
 * Exported API:
 *   startBatch(opts)   → starts async batch, returns batchId immediately
 *   getBatchState()    → returns current/last batch state
 *   isBatchRunning()   → boolean
 */

'use strict';

const path   = require('path');
const { v4: uuidv4 } = require('uuid');

const logger  = require('../utils/logger');
const { safeReadJson, safeWriteJson, PROJECT_ROOT } = require('../utils/fs');
const { workflowManager } = require('../workflow/workflowManager');
const { sendMail }        = require('../notifications/mailService');
const { esc }             = require('../notifications/mailService');

const STATE_FILE = path.join(PROJECT_ROOT, 'project', 'logs', 'batch_state.json');

// ── Niches to rotate through in a batch ──────────────────────────────────────

const BATCH_NICHES = [
  'ai_tools',
  'money_facts',
  'productivity',
  'tech_facts',
  'automation',
];

// ── State helpers ─────────────────────────────────────────────────────────────

function loadState() {
  return safeReadJson(STATE_FILE, null);
}

function saveState(state) {
  safeWriteJson(STATE_FILE, state);
}

// ── Schedule calculator ───────────────────────────────────────────────────────

/**
 * Calculate N evenly-spaced publish times starting from `startHour` today
 * (or tomorrow if startHour has already passed).
 *
 * Default spread: 09:00, 13:00, 17:00, 21:00 (4 videos, 4h apart)
 *
 * @param {number} count        — number of videos
 * @param {string} timezone     — IANA timezone (used for display only; times are UTC)
 * @param {number} startHour    — first publish hour in UTC (default 9)
 * @param {number} intervalHours — hours between each video (default 4)
 * @returns {string[]} ISO 8601 datetime strings
 */
function calculateScheduleTimes(count, timezone = 'UTC', startHour = 9, intervalHours = 4) {
  const now   = new Date();
  const times = [];

  // Start from today's startHour; if already past, start from tomorrow
  const base = new Date(now);
  base.setUTCHours(startHour, 0, 0, 0);
  if (base <= now) {
    base.setUTCDate(base.getUTCDate() + 1);
  }

  for (let i = 0; i < count; i++) {
    const t = new Date(base.getTime() + i * intervalHours * 3_600_000);
    times.push(t.toISOString());
  }

  return times;
}

// ── Batch runner ──────────────────────────────────────────────────────────────

let _running = false;

/**
 * Start a daily batch generation.
 * Returns immediately with the batchId — progress is tracked in STATE_FILE.
 *
 * @param {object} [opts]
 * @param {number}   [opts.count=4]          — number of videos (1–5)
 * @param {number}   [opts.startHour=9]      — first publish hour (UTC)
 * @param {number}   [opts.intervalHours=4]  — hours between videos
 * @param {string[]} [opts.niches]           — override niche list
 * @returns {{ batchId: string, scheduledTimes: string[] }}
 */
function startBatch({
  count         = 4,
  startHour     = 9,
  intervalHours = 4,
  niches,
} = {}) {
  if (_running) {
    throw new Error('A batch is already running. Wait for it to complete.');
  }

  const batchId       = uuidv4().split('-')[0];
  const resolvedCount = Math.min(5, Math.max(1, count));
  const timezone      = process.env.SCHEDULE_TIMEZONE ?? 'UTC';
  const scheduleTimes = calculateScheduleTimes(resolvedCount, timezone, startHour, intervalHours);
  const nicheList     = niches ?? BATCH_NICHES.slice(0, resolvedCount);

  // Initial state
  const state = {
    batchId,
    status:        'running',
    startedAt:     new Date().toISOString(),
    completedAt:   null,
    count:         resolvedCount,
    timezone,
    videos: scheduleTimes.map((scheduledFor, i) => ({
      index:        i,
      jobId:        null,
      niche:        nicheList[i] ?? BATCH_NICHES[i % BATCH_NICHES.length],
      scheduledFor,
      status:       'pending',   // pending | generating | rendering | uploading | scheduled | failed
      title:        null,
      videoId:      null,
      videoUrl:     null,
      errorMessage: null,
      startedAt:    null,
      completedAt:  null,
      currentStep:  null,
    })),
  };

  saveState(state);
  logger.info(`[batchService] Starting batch ${batchId} — ${resolvedCount} videos`);

  // Run async (don't await — returns immediately)
  _runBatchAsync(state).catch((err) => {
    logger.error(`[batchService] Batch ${batchId} crashed: ${err.message}`);
    const s = loadState();
    if (s?.batchId === batchId) {
      s.status = 'failed';
      s.completedAt = new Date().toISOString();
      saveState(s);
    }
    _running = false;
  });

  return { batchId, scheduledTimes: scheduleTimes };
}

async function _runBatchAsync(initialState) {
  _running = true;
  const batchId = initialState.batchId;

  try {
    for (let i = 0; i < initialState.videos.length; i++) {
      const slot = initialState.videos[i];

      // Reload state (may have been updated)
      const state = loadState();
      if (!state || state.batchId !== batchId) break;

      // Update slot status
      state.videos[i].status    = 'generating';
      state.videos[i].startedAt = new Date().toISOString();
      state.videos[i].currentStep = 'generateScript';
      saveState(state);

      logger.info(`[batchService] Video ${i + 1}/${state.count} | niche: ${slot.niche} | scheduled: ${slot.scheduledFor}`);

      try {
        // Listen for step progress
        const onStepCompleted = ({ jobId: jid, step }) => {
          if (jid !== state.videos[i].jobId) return;
          const s = loadState();
          if (!s) return;
          s.videos[i].currentStep = step;
          // Map step names to status labels
          const statusMap = {
            generateScript:    'generating',
            generateVoice:     'generating',
            fetchClips:        'generating',
            generateCaptions:  'generating',
            createVideo:       'rendering',
            generateThumbnail: 'rendering',
            uploadVideo:       'uploading',
            notify:            'uploading',
          };
          s.videos[i].status = statusMap[step] ?? s.videos[i].status;
          saveState(s);
        };

        workflowManager.on('stepCompleted', onStepCompleted);

        const result = await workflowManager.run({
          niche:       slot.niche,
          skipSteps:   ['findTrends'],   // skip trend finding for speed
          // Pass scheduledFor via opts — the uploadVideo step reads it from ctx
          scheduledFor: slot.scheduledFor,
        });

        workflowManager.off('stepCompleted', onStepCompleted);

        // Update slot with result
        const s = loadState();
        if (!s) break;
        s.videos[i].jobId        = result.jobId;
        s.videos[i].title        = result.title;
        s.videos[i].videoId      = result.videoId;
        s.videos[i].videoUrl     = result.videoUrl;
        s.videos[i].completedAt  = new Date().toISOString();
        s.videos[i].currentStep  = null;

        if (result.success) {
          s.videos[i].status = 'scheduled';
          logger.info(`[batchService] ✅ Video ${i + 1} scheduled: ${result.videoUrl}`);
        } else {
          s.videos[i].status       = 'failed';
          s.videos[i].errorMessage = result.errorMessage;
          logger.warn(`[batchService] ⚠️ Video ${i + 1} failed: ${result.errorMessage}`);
        }
        saveState(s);

      } catch (err) {
        logger.error(`[batchService] Video ${i + 1} threw: ${err.message}`);
        const s = loadState();
        if (s) {
          s.videos[i].status       = 'failed';
          s.videos[i].errorMessage = err.message;
          s.videos[i].completedAt  = new Date().toISOString();
          s.videos[i].currentStep  = null;
          saveState(s);
        }
        // Continue to next video — don't abort the batch
      }

      // Small gap between videos to avoid rate limits
      if (i < initialState.videos.length - 1) {
        logger.info(`[batchService] Waiting 30s before next video...`);
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }

    // Finalise
    const finalState = loadState();
    if (finalState?.batchId === batchId) {
      finalState.status      = 'completed';
      finalState.completedAt = new Date().toISOString();
      saveState(finalState);

      // Send summary email
      await _sendBatchSummary(finalState);
    }

  } finally {
    _running = false;
  }
}

// ── Email summary ─────────────────────────────────────────────────────────────

async function _sendBatchSummary(state) {
  try {
    const config   = require('../config');
    const success  = state.videos.filter((v) => v.status === 'scheduled').length;
    const failed   = state.videos.filter((v) => v.status === 'failed').length;

    const rows = state.videos.map((v) => {
      const time = v.scheduledFor
        ? new Date(v.scheduledFor).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: state.timezone ?? 'UTC' })
        : '—';
      const icon = v.status === 'scheduled' ? '✅' : '❌';
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #2A2A2A;">${icon} ${esc(v.title ?? v.niche)}</td>
        <td style="padding:8px;border-bottom:1px solid #2A2A2A;color:#9CA3AF;">${time}</td>
        <td style="padding:8px;border-bottom:1px solid #2A2A2A;">
          ${v.videoUrl ? `<a href="${esc(v.videoUrl)}" style="color:#FF0000;">Watch</a>` : `<span style="color:#EF4444;">${esc(v.errorMessage?.slice(0, 60) ?? 'failed')}</span>`}
        </td>
      </tr>`;
    }).join('');

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;background:#0F0F0F;color:#E5E7EB;padding:24px;border-radius:12px;">
        <h2 style="color:#FF0000;margin:0 0 8px;">📅 Daily Batch Complete</h2>
        <p style="color:#9CA3AF;margin:0 0 20px;">Batch ID: <code>${esc(state.batchId)}</code></p>
        <div style="display:flex;gap:16px;margin-bottom:20px;">
          <div style="background:#1A1A1A;padding:12px 20px;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#22C55E;">${success}</div>
            <div style="font-size:12px;color:#9CA3AF;">Scheduled</div>
          </div>
          <div style="background:#1A1A1A;padding:12px 20px;border-radius:8px;text-align:center;">
            <div style="font-size:24px;font-weight:700;color:#EF4444;">${failed}</div>
            <div style="font-size:12px;color:#9CA3AF;">Failed</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#1A1A1A;">
              <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:12px;">Title</th>
              <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:12px;">Publish Time</th>
              <th style="padding:8px;text-align:left;color:#9CA3AF;font-size:12px;">Link</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#6B7280;font-size:12px;margin-top:20px;">YouTube Shorts Automation · Daily Batch</p>
      </div>`;

    await sendMail({
      to:      config.gmail.notifyEmail,
      subject: `📅 Daily Batch: ${success}/${state.count} Shorts Scheduled`,
      html,
    });

    logger.info(`[batchService] Summary email sent`);
  } catch (err) {
    logger.warn(`[batchService] Summary email failed: ${err.message}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function getBatchState() {
  return loadState();
}

function isBatchRunning() {
  return _running;
}

module.exports = { startBatch, getBatchState, isBatchRunning, calculateScheduleTimes };
