/**
 * Email Templates
 *
 * All HTML email templates live here. Each function returns a complete
 * HTML string ready to pass to mailService.sendMail().
 *
 * Design principles:
 *   • Inline CSS only — email clients strip <style> blocks
 *   • Table-based layout — maximum client compatibility
 *   • Dark header with YouTube red branding
 *   • All user values passed through esc() before insertion
 *   • Plain-text fallback generated automatically by mailService
 */

'use strict';

const { esc } = require('./mailService');
const config  = require('../config');

// ── Shared design tokens ──────────────────────────────────────────────────────

const COLORS = {
  ytRed:      '#FF0000',
  ytDark:     '#0F0F0F',
  success:    '#00C853',
  warning:    '#FF6D00',
  error:      '#D50000',
  scheduled:  '#0066FF',
  bgPage:     '#F5F5F5',
  bgCard:     '#FFFFFF',
  textPrimary:'#212121',
  textMuted:  '#757575',
  border:     '#E0E0E0',
};

// ── Shared layout wrappers ────────────────────────────────────────────────────

function wrapEmail(headerColor, headerIcon, headerTitle, bodyContent) {
  const channelName = esc(config.youtube.channelName ?? 'Shorts Bot');
  const year        = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(headerTitle)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bgPage};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bgPage};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${COLORS.bgCard};border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${headerColor};padding:28px 32px;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">${headerIcon}</div>
            <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${esc(headerTitle)}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">${channelName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${bodyContent}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${COLORS.bgPage};padding:20px 32px;border-top:1px solid ${COLORS.border};text-align:center;">
            <p style="margin:0;color:${COLORS.textMuted};font-size:12px;">
              YouTube Shorts Automation System &nbsp;·&nbsp; ${year}<br>
              <span style="color:${COLORS.border};">This is an automated message — do not reply.</span>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label, value, valueStyle = '') {
  return `
  <tr>
    <td style="padding:8px 0;color:${COLORS.textMuted};font-size:13px;width:130px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:8px 0;color:${COLORS.textPrimary};font-size:14px;font-weight:500;${valueStyle}">${value}</td>
  </tr>`;
}

function ctaButton(label, url, color = COLORS.ytRed) {
  return `
  <div style="text-align:center;margin:28px 0 8px;">
    <a href="${esc(url)}"
       style="display:inline-block;padding:14px 32px;background:${color};color:#FFFFFF;
              text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;
              letter-spacing:0.2px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
      ${esc(label)}
    </a>
  </div>`;
}

function divider() {
  return `<hr style="border:none;border-top:1px solid ${COLORS.border};margin:24px 0;">`;
}

function badge(text, color) {
  return `<span style="display:inline-block;padding:3px 10px;background:${color};color:#fff;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${esc(text)}</span>`;
}

// ── Template: Upload Success ──────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {string} data.jobId
 * @param {string} data.videoId
 * @param {string} data.videoUrl
 * @param {string} data.title
 * @param {string} data.niche
 * @param {string} data.privacyStatus
 * @param {string|null} data.scheduledFor
 * @param {boolean} data.thumbnailSet
 * @param {number} data.retryCount
 * @param {number} data.durationMs
 * @param {number|null} data.fileSizeKb
 * @param {string} data.publishedAt
 * @returns {string} HTML
 */
function uploadSuccess(data) {
  const isScheduled = !!data.scheduledFor;
  const headerColor = isScheduled ? COLORS.scheduled : COLORS.success;
  const headerIcon  = isScheduled ? '🕐' : '🎉';
  const headerTitle = isScheduled ? 'Short Scheduled!' : 'Short Published!';

  const publishTime = isScheduled
    ? new Date(data.scheduledFor).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
    : new Date(data.publishedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });

  const statusBadge = isScheduled
    ? badge('Scheduled', COLORS.scheduled)
    : badge('Live', COLORS.success);

  const body = `
    <h2 style="margin:0 0 4px;color:${COLORS.textPrimary};font-size:20px;font-weight:700;">${esc(data.title)}</h2>
    <p style="margin:0 0 24px;color:${COLORS.textMuted};font-size:13px;">Your Short is ${isScheduled ? 'scheduled and ready' : 'live on YouTube'}.</p>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${infoRow('Status',       statusBadge)}
      ${infoRow('Published',    esc(publishTime))}
      ${infoRow('Niche',        esc(data.niche ?? 'general'))}
      ${infoRow('Privacy',      esc(data.privacyStatus ?? 'public'))}
      ${infoRow('Thumbnail',    data.thumbnailSet ? '✅ Set' : '⚠️ Not set')}
      ${infoRow('File size',    data.fileSizeKb ? `${data.fileSizeKb} KB` : '—')}
      ${infoRow('Upload time',  `${((data.durationMs ?? 0) / 1000).toFixed(1)}s`)}
      ${infoRow('Retries',      String(data.retryCount ?? 0))}
      ${infoRow('Job ID',       `<code style="font-size:12px;background:#F5F5F5;padding:2px 6px;border-radius:4px;">${esc(data.jobId)}</code>`)}
    </table>

    ${ctaButton('▶ Watch on YouTube', data.videoUrl)}

    ${divider()}

    <p style="margin:0;color:${COLORS.textMuted};font-size:12px;text-align:center;">
      Video ID: <code>${esc(data.videoId)}</code>
    </p>`;

  return wrapEmail(headerColor, headerIcon, headerTitle, body);
}

// ── Template: Upload Failure ──────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {string} data.jobId
 * @param {string} data.title
 * @param {string} data.niche
 * @param {string} data.errorMessage
 * @param {string|null} data.errorCode
 * @param {number} data.retryCount
 * @param {number} data.durationMs
 * @param {string} data.failedAt
 * @returns {string} HTML
 */
function uploadFailure(data) {
  const body = `
    <h2 style="margin:0 0 4px;color:${COLORS.textPrimary};font-size:20px;font-weight:700;">${esc(data.title ?? 'Unknown video')}</h2>
    <p style="margin:0 0 24px;color:${COLORS.textMuted};font-size:13px;">The upload failed after ${data.retryCount ?? 0} attempt(s). Manual action may be required.</p>

    <!-- Error box -->
    <div style="background:#FFF5F5;border:1px solid #FFCDD2;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:${COLORS.error};font-size:13px;font-weight:700;">Error Details</p>
      <p style="margin:0;color:${COLORS.textPrimary};font-size:13px;font-family:monospace;word-break:break-all;">${esc(data.errorMessage ?? 'Unknown error')}</p>
      ${data.errorCode ? `<p style="margin:8px 0 0;color:${COLORS.textMuted};font-size:12px;">Code: <code>${esc(data.errorCode)}</code></p>` : ''}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${infoRow('Status',      badge('Failed', COLORS.error))}
      ${infoRow('Failed at',   esc(new Date(data.failedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })))}
      ${infoRow('Niche',       esc(data.niche ?? 'general'))}
      ${infoRow('Retries',     String(data.retryCount ?? 0))}
      ${infoRow('Duration',    `${((data.durationMs ?? 0) / 1000).toFixed(1)}s`)}
      ${infoRow('Job ID',      `<code style="font-size:12px;background:#F5F5F5;padding:2px 6px;border-radius:4px;">${esc(data.jobId)}</code>`)}
    </table>

    ${divider()}

    <p style="margin:0;color:${COLORS.textMuted};font-size:12px;">
      <strong>Common fixes:</strong><br>
      • <strong>401/403</strong> — Re-run <code>node scripts/get_token.js</code> to refresh OAuth<br>
      • <strong>quotaExceeded</strong> — YouTube API quota reset at midnight Pacific<br>
      • <strong>Network error</strong> — Check internet connection and retry
    </p>`;

  return wrapEmail(COLORS.error, '❌', 'Upload Failed', body);
}

// ── Template: Pipeline Error ──────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {string} data.jobId
 * @param {string} data.step        — pipeline step name
 * @param {string} data.errorMessage
 * @param {string} data.stack
 * @param {string} data.failedAt
 * @returns {string} HTML
 */
function pipelineError(data) {
  const body = `
    <p style="margin:0 0 24px;color:${COLORS.textMuted};font-size:14px;">
      The automation pipeline encountered an error and stopped.
    </p>

    <div style="background:#FFF5F5;border:1px solid #FFCDD2;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:${COLORS.error};font-size:13px;font-weight:700;">Error</p>
      <p style="margin:0;color:${COLORS.textPrimary};font-size:13px;">${esc(data.errorMessage ?? 'Unknown error')}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${infoRow('Job ID',    `<code style="font-size:12px;background:#F5F5F5;padding:2px 6px;border-radius:4px;">${esc(data.jobId)}</code>`)}
      ${infoRow('Step',      esc(data.step ?? 'unknown'))}
      ${infoRow('Failed at', esc(new Date(data.failedAt ?? Date.now()).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })))}
    </table>

    ${data.stack ? `
    ${divider()}
    <details>
      <summary style="cursor:pointer;color:${COLORS.textMuted};font-size:12px;">Stack trace</summary>
      <pre style="margin:8px 0 0;font-size:11px;color:${COLORS.textMuted};white-space:pre-wrap;word-break:break-all;">${esc(data.stack)}</pre>
    </details>` : ''}`;

  return wrapEmail(COLORS.warning, '⚠️', `Pipeline Error — Job ${esc(data.jobId)}`, body);
}

// ── Template: Daily Summary ───────────────────────────────────────────────────

/**
 * @param {object} data
 * @param {string} data.date
 * @param {number} data.totalUploads
 * @param {number} data.successCount
 * @param {number} data.failureCount
 * @param {Array<{title: string, videoUrl: string, niche: string}>} data.uploads
 * @returns {string} HTML
 */
function dailySummary(data) {
  const successRate = data.totalUploads > 0
    ? Math.round((data.successCount / data.totalUploads) * 100)
    : 0;

  const uploadRows = (data.uploads ?? []).map((u) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};">
        <a href="${esc(u.videoUrl ?? '#')}" style="color:${COLORS.ytRed};text-decoration:none;font-weight:600;font-size:14px;">${esc(u.title)}</a>
        <br><span style="color:${COLORS.textMuted};font-size:12px;">${esc(u.niche ?? 'general')}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${COLORS.border};text-align:right;vertical-align:top;">
        ${u.videoUrl ? badge('Live', COLORS.success) : badge('Failed', COLORS.error)}
      </td>
    </tr>`).join('');

  const body = `
    <!-- Stats row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="text-align:center;padding:16px;background:#F9F9F9;border-radius:8px;width:33%;">
          <div style="font-size:28px;font-weight:700;color:${COLORS.textPrimary};">${data.totalUploads}</div>
          <div style="font-size:12px;color:${COLORS.textMuted};margin-top:4px;">Total</div>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:16px;background:#F1FFF5;border-radius:8px;width:33%;">
          <div style="font-size:28px;font-weight:700;color:${COLORS.success};">${data.successCount}</div>
          <div style="font-size:12px;color:${COLORS.textMuted};margin-top:4px;">Published</div>
        </td>
        <td style="width:8px;"></td>
        <td style="text-align:center;padding:16px;background:#FFF5F5;border-radius:8px;width:33%;">
          <div style="font-size:28px;font-weight:700;color:${COLORS.error};">${data.failureCount}</div>
          <div style="font-size:12px;color:${COLORS.textMuted};margin-top:4px;">Failed</div>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;color:${COLORS.textMuted};font-size:13px;">
      Success rate: <strong style="color:${successRate >= 80 ? COLORS.success : COLORS.error};">${successRate}%</strong>
    </p>

    ${uploadRows ? `
    <table width="100%" cellpadding="0" cellspacing="0">
      ${uploadRows}
    </table>` : `<p style="color:${COLORS.textMuted};font-size:14px;text-align:center;">No uploads today.</p>`}`;

  return wrapEmail(
    COLORS.ytDark, '📊',
    `Daily Summary — ${esc(data.date)}`,
    body
  );
}

module.exports = { uploadSuccess, uploadFailure, pipelineError, dailySummary };
