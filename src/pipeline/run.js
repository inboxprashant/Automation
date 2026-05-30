/**
 * Pipeline Runner — thin wrapper around workflowManager.run().
 *
 * Kept for backward compatibility with existing scripts and tests.
 * All real logic now lives in src/workflow/.
 *
 * Direct execution:
 *   node src/pipeline/run.js
 *   node src/pipeline/run.js --niche ai_tools
 */

'use strict';

const { workflowManager } = require('../workflow/workflowManager');

/**
 * Run the full pipeline for one Short.
 *
 * @param {object} [opts]
 * @param {string} [opts.niche]
 * @param {string} [opts.jobId]
 * @returns {Promise<import('../workflow/workflowManager').WorkflowResult>}
 */
async function runPipeline(opts = {}) {
  return workflowManager.run(opts);
}

// Allow direct execution
if (require.main === module) {
  require('dotenv').config();
  const niche = process.argv.includes('--niche')
    ? process.argv[process.argv.indexOf('--niche') + 1]
    : undefined;

  runPipeline({ niche }).then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { runPipeline };
