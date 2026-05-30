/**
 * Config entry point.
 *
 * All modules import from here:
 *   const config = require('../config');
 *
 * Actual loading, validation, and structuring live in:
 *   loader.js    — env file loading + config assembly
 *   validator.js — schema-based validation
 *   schema.js    — field definitions
 */
module.exports = require('./loader');
