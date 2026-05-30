/**
 * Winston logger — structured, context-aware, production-ready.
 *
 * Improvements over v1:
 *   • Structured JSON format for file transports (machine-parseable)
 *   • Human-readable coloured format for console only
 *   • `logs/` directory resolved relative to project root, not cwd
 *   • `child(meta)` helper for per-job contextual logging
 *   • Handles logger initialisation before config is available (bootstrap mode)
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// ── Resolve project root robustly ─────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LOGS_DIR     = path.join(PROJECT_ROOT, 'logs');

// ── Formats ───────────────────────────────────────────────────────────────────

const { combine, timestamp, printf, colorize, errors, json, metadata } = format;

// Console: human-readable with colour
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ' ' + JSON.stringify(meta)
      : '';
    return `${ts} [${level}]: ${stack || message}${metaStr}`;
  })
);

// File: structured JSON for log aggregation / grep
const fileFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

// ── Resolve log level ─────────────────────────────────────────────────────────

function resolveLevel() {
  // Read directly from env to avoid circular dependency with config
  return process.env.LOG_LEVEL || 'info';
}

// ── Logger factory ────────────────────────────────────────────────────────────

const logger = createLogger({
  level: resolveLevel(),
  format: fileFormat,
  transports: [
    new transports.Console({ format: consoleFormat }),

    new DailyRotateFile({
      filename:      path.join(LOGS_DIR, 'app-%DATE%.log'),
      datePattern:   'YYYY-MM-DD',
      maxFiles:      '14d',
      zippedArchive: true,
      format:        fileFormat,
    }),

    new DailyRotateFile({
      level:         'error',
      filename:      path.join(LOGS_DIR, 'error-%DATE%.log'),
      datePattern:   'YYYY-MM-DD',
      maxFiles:      '30d',
      zippedArchive: true,
      format:        fileFormat,
    }),
  ],
  // Don't crash the process on logger errors
  exitOnError: false,
});

/**
 * Create a child logger that automatically includes context metadata
 * (e.g. jobId, niche) in every log entry.
 *
 * @param {object} meta  — e.g. { jobId: 'abc123', niche: 'ai_tools' }
 * @returns {import('winston').Logger}
 */
logger.child = function child(meta) {
  return logger.child(meta);
};

module.exports = logger;
