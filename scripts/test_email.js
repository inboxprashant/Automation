#!/usr/bin/env node
/**
 * Email notification tester.
 *
 * Sends a real test email for each notification type so you can
 * verify templates and SMTP credentials before running the pipeline.
 *
 * Usage:
 *   node scripts/test_email.js                  # test SMTP connection only
 *   node scripts/test_email.js --published       # send published notification
 *   node scripts/test_email.js --failure         # send upload failure notification
 *   node scripts/test_email.js --error           # send pipeline error notification
 *   node scripts/test_email.js --summary         # send daily summary
 *   node scripts/test_email.js --all             # send all four
 */

'use strict';

require('dotenv').config();

const {
  sendPublishedNotification,
  sendUploadFailureNotification,
  sendErrorNotification,
  sendDailySummary,
  testConnection,
} = require('../src/notifications/emailNotifier');

const args   = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const sendAll = hasFlag('--all');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  YouTube Shorts — Email Tester');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function main() {
  // Always verify connection first
  console.log('1. Verifying SMTP connection...');
  const ok = await testConnection();
  if (!ok) {
    console.error('❌  SMTP connection failed. Check GMAIL_USER and GMAIL_PASS in .env');
    process.exit(1);
  }
  console.log('✅  SMTP connection OK\n');

  if (args.length === 0) {
    console.log('Connection verified. Use --all to send test emails for all templates.\n');
    process.exit(0);
  }

  // ── Published notification ─────────────────────────────────────────────
  if (sendAll || hasFlag('--published')) {
    console.log('2. Sending "published" notification...');
    await sendPublishedNotification({
      jobId:         'test_abc123',
      videoId:       'dQw4w9WgXcQ',
      videoUrl:      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      title:         'The AI Tool That Replaced My Entire Team',
      niche:         'ai_tools',
      privacyStatus: 'public',
      scheduledFor:  null,
      thumbnailSet:  true,
      retryCount:    0,
      durationMs:    154_000,
      fileSizeKb:    18_432,
    });
    console.log('✅  Published notification sent\n');
  }

  // ── Scheduled notification ─────────────────────────────────────────────
  if (sendAll || hasFlag('--scheduled')) {
    console.log('3. Sending "scheduled" notification...');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await sendPublishedNotification({
      jobId:         'test_sched456',
      videoId:       'abc123xyz',
      videoUrl:      'https://www.youtube.com/shorts/abc123xyz',
      title:         '5 Money Facts Banks Hide From You',
      niche:         'money_facts',
      privacyStatus: 'private',
      scheduledFor:  tomorrow,
      thumbnailSet:  true,
      retryCount:    0,
      durationMs:    98_000,
      fileSizeKb:    14_200,
    });
    console.log('✅  Scheduled notification sent\n');
  }

  // ── Upload failure ─────────────────────────────────────────────────────
  if (sendAll || hasFlag('--failure')) {
    console.log('4. Sending "upload failure" notification...');
    await sendUploadFailureNotification({
      jobId:        'test_fail789',
      title:        'How Automation Saves 10 Hours a Week',
      niche:        'automation',
      error:        new Error('quotaExceeded: The request cannot be completed because you have exceeded your quota.'),
      errorCode:    'quotaExceeded',
      retryCount:   3,
      durationMs:   45_000,
    });
    console.log('✅  Upload failure notification sent\n');
  }

  // ── Pipeline error ─────────────────────────────────────────────────────
  if (sendAll || hasFlag('--error')) {
    console.log('5. Sending "pipeline error" notification...');
    const err = new Error('ElevenLabs API returned 429: Too Many Requests');
    err.stack = err.stack ?? err.message;
    await sendErrorNotification({
      jobId: 'test_err000',
      error: err,
      step:  'voice generation',
    });
    console.log('✅  Pipeline error notification sent\n');
  }

  // ── Daily summary ──────────────────────────────────────────────────────
  if (sendAll || hasFlag('--summary')) {
    console.log('6. Sending "daily summary" notification...');
    await sendDailySummary({
      date:         new Date().toISOString().slice(0, 10),
      totalUploads: 3,
      successCount: 2,
      failureCount: 1,
      uploads: [
        { title: 'The AI Tool That Replaced My Team',   videoUrl: 'https://youtube.com/shorts/abc', niche: 'ai_tools' },
        { title: '5 Money Facts Banks Hide From You',   videoUrl: 'https://youtube.com/shorts/def', niche: 'money_facts' },
        { title: 'How Automation Saves 10 Hours a Week', videoUrl: null,                             niche: 'automation' },
      ],
    });
    console.log('✅  Daily summary sent\n');
  }

  console.log('All done! Check your inbox.\n');
}

main().catch((err) => {
  console.error('\n❌  Test failed:\n');
  console.error(err.message);
  process.exit(1);
});
