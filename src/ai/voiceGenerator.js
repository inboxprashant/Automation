/**
 * @deprecated Use src/voice/voiceGenerator.js directly.
 *
 * This shim keeps the original import path working so the pipeline
 * and any other callers don't need to change.
 *
 * The real implementation lives in src/voice/voiceGenerator.js.
 */

'use strict';

const { generateVoice: _generateVoice, generateVoiceFromScript } = require('../voice/voiceGenerator');

/**
 * Backward-compatible wrapper.
 * Old signature: generateVoice(text, jobId) → tempPath string
 * New signature: generateVoice(text, jobId, options) → VoiceResult object
 *
 * Returns the tempPath string so existing pipeline code is unaffected.
 *
 * @param {string} text
 * @param {string} jobId
 * @returns {Promise<string>} temp MP3 path
 */
async function generateVoice(text, jobId) {
  const result = await _generateVoice(text, jobId);
  return result.tempPath;
}

module.exports = { generateVoice, generateVoiceFromScript };
