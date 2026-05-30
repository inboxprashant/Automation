/**
 * Main Entry Point — YouTube Shorts Automation System
 *
 * Startup sequence:
 *   1. Load and validate environment config
 *   2. Ensure all working directories exist
 *   3. Start health check HTTP server
 *   4. Register process signal handlers for graceful shutdown
 *   5. Print system status banner
 *   6. Start the cron scheduler
 */

'use strict';

require('dotenv').config();

const logger = require('./utils/logger');
const config = require('./config');
const { ensureWorkDirs }    = require('./utils/fs');
const { startHealthServer, stopHealthServer } = require('./utils/healthCheck');
const { start, stop }       = require('./scheduler/cron');
const { queue }             = require('./workflow/taskQueue');
const { workflowManager }   = require('./workflow/workflowManager');

// ── Graceful shutdown ─────────────────────────────────────────────────────────

let _shuttingDown = false;

async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;

  logger.info(`[main] ${signal} received — shutting down gracefully`);

  stop();
  stopHealthServer();

  const activeRuns = workflowManager.getActiveRuns();
  if (activeRuns.length > 0) {
    logger.info(`[main] Waiting for ${activeRuns.length} active workflow(s) to finish...`);
    try {
      await Promise.race([
        queue.drain(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('drain timeout')), 10 * 60 * 1000)
        ),
      ]);
    } catch {
      logger.warn('[main] Drain timeout — forcing exit');
    }
  }

  logger.info('[main] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('[main] Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('[main] Unhandled rejection', { error: err.message, stack: err.stack });
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────────────────

function printBanner() {
  const line = '═'.repeat(55);
  logger.info(line);
  logger.info('  YouTube Shorts Automation System');
  logger.info(`  Niche     : ${config.pipeline.topicCategory}`);
  logger.info(`  Schedule  : ${config.pipeline.uploadTimes}`);
  logger.info(`  Timezone  : ${config.pipeline.timezone}`);
  logger.info(`  Per slot  : ${config.pipeline.shortsPerDay}`);
  logger.info(`  Channel   : ${config.youtube.channelName}`);
  logger.info(`  Log level : ${config.log.level}`);
  logger.info(`  Env       : ${config.env}`);
  logger.info(`  PID       : ${process.pid}`);
  logger.info(line);
}

ensureWorkDirs();
startHealthServer();
printBanner();
start();
