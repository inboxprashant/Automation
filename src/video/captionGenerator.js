/**
 * @deprecated Use src/captions/captionGenerator.js directly.
 *
 * This shim keeps the original import path working so the pipeline
 * and any other callers don't need to change.
 *
 * The real implementation lives in src/captions/captionGenerator.js.
 */

'use strict';

const { generateCaptions: _generate, generateCaptionsFromVoiceRecord } = require('../captions/captionGenerator');

/**
 * Backward-compatible wrapper.
 * Old signature: generateCaptions(audioPath, jobId) → srtPath string
 * New signature: generateCaptions(audioPath, jobId, options) → CaptionResult
 *
 * Returns the temp SRT path so existing pipeline code is unaffected.
 *
 * @param {string} audioPath
 * @param {string} jobId
 * @returns {Promise<string>} temp SRT path
 */
async function generateCaptions(audioPath, jobId) {
  const result = await _generate(audioPath, jobId);
  return result.srtPath;
}

module.exports = { generateCaptions, generateCaptionsFromVoiceRecord };
