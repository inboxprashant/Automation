/**
 * Video Creator — Node.js orchestrator for the Python video builder.
 *
 * Responsibilities:
 *   1. Resolve all input paths
 *   2. Spawn the Python builder as a child process
 *   3. Stream stdout/stderr to the Winston logger in real time
 *   4. Capture the final render path from the last stdout line
 *   5. Register the render in renderStorage
 *   6. Return a VideoResult object to the pipeline
 *
 * @typedef {object} VideoResult
 * @property {string} jobId
 * @property {string} mp4Path       — final output path (in project/renders/)
 * @property {string} tempPath      — temp output path (in output/)
 * @property {number} fileSizeKb
 * @property {string} niche
 * @property {string} title
 */

'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');

const logger        = require('../utils/logger');
const { outputPath, ensureDir } = require('../utils/fs');
const { saveRender } = require('./renderStorage');

const PYTHON_SCRIPT = path.resolve(__dirname, '..', '..', 'python', 'video_builder.py');
const TIMEOUT_MS    = 10 * 60 * 1000;   // 10 minutes — video rendering can be slow

// ── Python runner ────────────────────────────────────────────────────────────

/**
 * Spawn the Python video builder and stream its output to the logger.
 * Resolves with the last non-empty stdout line (the render path).
 *
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function runPython(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [PYTHON_SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastLine = '';
    let stderrBuf = '';

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        logger.debug(`[python] ${trimmed}`);
        lastLine = trimmed;
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      // Stream line-by-line to avoid flooding the log
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) logger.debug(`[python:err] ${line.trim()}`);
      }
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`[videoCreator] Python builder timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stderrBuf.trim()) logger.debug(`[python:err] ${stderrBuf.trim()}`);

      if (code !== 0) {
        reject(new Error(
          `[videoCreator] Python builder exited with code ${code}. ` +
          `Check logs for details.`
        ));
      } else {
        resolve(lastLine);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`[videoCreator] Failed to spawn Python: ${err.message}`));
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a YouTube Short video.
 *
 * @param {object} opts
 * @param {string}  opts.audioPath         — voice MP3 (temp/)
 * @param {string}  opts.srtPath           — highlighted SRT (temp/)
 * @param {string}  opts.title             — video title
 * @param {string}  opts.jobId             — pipeline job ID
 * @param {string}  [opts.niche]           — content niche
 * @param {string}  [opts.scriptPath]      — path to script JSON (for scene planning)
 * @param {string}  [opts.musicPath]       — explicit music file path
 * @param {boolean} [opts.noMusic]         — disable background music
 * @returns {Promise<VideoResult>}
 */
async function createVideo({
  audioPath,
  srtPath,
  title,
  jobId,
  niche       = 'general',
  scriptPath  = null,
  musicPath   = null,
  noMusic     = false,
}) {
  // Temp output path (before moving to renders/)
  const tempOutput = outputPath(`${jobId}_short.mp4`);

  logger.info(`[videoCreator] Building video for job ${jobId}`);
  logger.info(`[videoCreator] Audio: ${path.basename(audioPath)}`);
  logger.info(`[videoCreator] SRT:   ${path.basename(srtPath)}`);

  // Build argument list — all values passed as separate array elements
  // so shell injection via title/niche is impossible (spawn, not exec)
  const args = [
    '--audio',  audioPath,
    '--srt',    srtPath,
    '--output', tempOutput,
    '--niche',  niche,
    '--title',  title.replace(/"/g, "'"),   // sanitise quotes for Python argparse
    '--job-id', jobId,
  ];

  if (scriptPath && fs.existsSync(scriptPath)) {
    args.push('--script', scriptPath);
  }
  if (musicPath) {
    args.push('--music', musicPath);
  }
  if (noMusic) {
    args.push('--no-music');
  }

  const startMs = Date.now();
  const renderPath = await runPython(args);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  // The Python builder prints the render path as the last stdout line.
  // Fall back to tempOutput if it didn't print anything useful.
  const finalPath = (renderPath && fs.existsSync(renderPath))
    ? renderPath
    : tempOutput;

  if (!fs.existsSync(finalPath)) {
    throw new Error(`[videoCreator] Output file not found: ${finalPath}`);
  }

  const fileSizeKb = Math.round(fs.statSync(finalPath).size / 1024);
  logger.info(`[videoCreator] ✅ Video ready in ${elapsed}s — ${fileSizeKb} KB`);
  logger.info(`[videoCreator] Path: ${finalPath}`);

  // Register in render index
  const record = saveRender({ jobId, niche, title, mp4Path: finalPath });

  return {
    jobId,
    mp4Path:    finalPath,
    tempPath:   tempOutput,
    fileSizeKb: record.fileSizeKb,
    niche,
    title,
  };
}

module.exports = { createVideo };
