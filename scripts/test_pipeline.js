/**
 * Manual pipeline test — runs the full pipeline once immediately.
 *
 *   node scripts/test_pipeline.js
 */
require('dotenv').config();
const { runPipeline } = require('../src/pipeline/run');

console.log('Running pipeline test...\n');

runPipeline().then((result) => {
  console.log('\nResult:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
});
