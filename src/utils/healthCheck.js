/**
 * Health Check Server
 *
 * Exposes a lightweight HTTP server on HEALTH_PORT (default 3002) with:
 *   GET /health  — liveness probe (always 200 if process is alive)
 *   GET /ready   — readiness probe (checks queue + config)
 *   GET /metrics — basic runtime metrics (uptime, memory, queue depth)
 *
 * Used by Docker HEALTHCHECK, Kubernetes probes, and monitoring tools.
 */

'use strict';

const http   = require('http');
const logger = require('./logger');

const PORT = parseInt(process.env.HEALTH_PORT ?? '3002', 10);

let _server = null;
const _startTime = Date.now();

/**
 * Start the health check HTTP server.
 * Safe to call multiple times — only starts once.
 */
function startHealthServer() {
  if (_server) return;

  _server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0];

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', uptime: _uptimeSec() }));
      return;
    }

    if (url === '/ready') {
      const ready = _checkReadiness();
      res.writeHead(ready.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ready));
      return;
    }

    if (url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(_getMetrics()));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  _server.on('error', (err) => {
    logger.warn(`[healthCheck] Server error: ${err.message}`);
  });

  _server.listen(PORT, '0.0.0.0', () => {
    logger.info(`[healthCheck] Listening on :${PORT} (/health /ready /metrics)`);
  });
}

function stopHealthServer() {
  if (_server) {
    _server.close();
    _server = null;
  }
}

function _uptimeSec() {
  return Math.round((Date.now() - _startTime) / 1000);
}

function _checkReadiness() {
  const checks = {};

  // Config loaded
  try {
    const config = require('../config');
    checks.config = !!config.openai?.apiKey ? 'ok' : 'missing_api_key';
  } catch (err) {
    checks.config = `error: ${err.message}`;
  }

  // Queue accessible
  try {
    const { queue } = require('../workflow/taskQueue');
    const s = queue.getStatus();
    checks.queue = `ok (pending=${s.pending}, running=${s.running})`;
  } catch (err) {
    checks.queue = `error: ${err.message}`;
  }

  const ok = Object.values(checks).every((v) => v === 'ok' || v.startsWith('ok '));
  return { ok, checks, uptime: _uptimeSec() };
}

function _getMetrics() {
  const mem = process.memoryUsage();
  let queueStatus = {};

  try {
    const { queue } = require('../workflow/taskQueue');
    queueStatus = queue.getStatus();
  } catch { /* ignore */ }

  return {
    uptime:    _uptimeSec(),
    memory: {
      heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb:       Math.round(mem.rss       / 1024 / 1024),
    },
    queue:     queueStatus,
    pid:       process.pid,
    nodeVersion: process.version,
  };
}

module.exports = { startHealthServer, stopHealthServer };
