#!/usr/bin/env node
/**
 * Config checker — validates your .env without running the pipeline.
 *
 *   node scripts/check_config.js
 *
 * Exits 0 on success, 1 on validation errors.
 */

'use strict';

try {
  const config = require('../src/config');

  console.log('\n✅  Configuration is valid.\n');
  console.log('Loaded values (secrets redacted):\n');

  // Pretty-print the redacted flat env map
  const rows = Object.entries(config._redacted).sort(([a], [b]) => a.localeCompare(b));
  const keyWidth = Math.max(...rows.map(([k]) => k.length));

  for (const [key, value] of rows) {
    const display = value === null ? '(not set — using runtime default)' : value;
    console.log(`  ${key.padEnd(keyWidth)}  =  ${display}`);
  }

  console.log('\nStructured config:\n');
  // Print structured config without the _redacted helper key
  const { _redacted, ...safe } = config;
  // Mask secrets in nested structure too
  const masked = JSON.parse(
    JSON.stringify(safe, (k, v) => {
      const secretSuffixes = ['apiKey', 'appPassword', 'refreshToken', 'clientSecret'];
      return secretSuffixes.includes(k) && typeof v === 'string' ? '***' : v;
    })
  );
  console.log(JSON.stringify(masked, null, 2));
  console.log();

  process.exit(0);
} catch (err) {
  console.error('\n❌  Configuration invalid:\n');
  console.error(err.message);
  process.exit(1);
}
