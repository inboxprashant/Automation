/**
 * Config validator.
 *
 * Reads process.env, applies the schema, and returns a validated + typed
 * config object. Collects ALL errors before throwing so you see every
 * problem at once instead of fixing them one by one.
 *
 * @typedef {{ key: string, required: boolean, default?: any, type: string,
 *             secret?: boolean, description?: string,
 *             validate?: (v: any) => true | string }} FieldSchema
 */

const schema = require('./schema');

/**
 * Cast a raw string value to the declared type.
 * @param {string} raw
 * @param {'string'|'number'|'boolean'} type
 * @returns {string|number|boolean}
 */
function cast(raw, type) {
  switch (type) {
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new TypeError(`"${raw}" is not a valid number`);
      return n;
    }
    case 'boolean':
      if (['true', '1', 'yes'].includes(raw.toLowerCase())) return true;
      if (['false', '0', 'no'].includes(raw.toLowerCase())) return false;
      throw new TypeError(`"${raw}" is not a valid boolean (use true/false)`);
    default:
      return raw;
  }
}

/**
 * Validate all env vars against the schema.
 * Returns a flat map of { KEY: typedValue } for every field.
 * Throws a single descriptive error listing all problems found.
 *
 * @returns {Record<string, any>}
 */
function validate() {
  const errors = [];
  const result = {};

  for (const field of schema) {
    const raw = process.env[field.key];
    const isEmpty = raw === undefined || raw === '';

    // ── Presence check ──────────────────────────────────────────────────
    if (isEmpty) {
      if (field.required) {
        errors.push(`  ✗ ${field.key} — required but not set. ${field.description ? `(${field.description})` : ''}`);
        continue;
      }
      // Use default (may be null — handled by consumers)
      result[field.key] = field.default ?? null;
      continue;
    }

    // ── Type cast ───────────────────────────────────────────────────────
    let value;
    try {
      value = cast(raw, field.type || 'string');
    } catch (e) {
      errors.push(`  ✗ ${field.key} — ${e.message}`);
      continue;
    }

    // ── Custom validation ────────────────────────────────────────────────
    if (field.validate) {
      const verdict = field.validate(value);
      if (verdict !== true) {
        errors.push(`  ✗ ${field.key} — ${verdict}`);
        continue;
      }
    }

    result[field.key] = value;
  }

  if (errors.length > 0) {
    throw new Error(
      `\n\nConfiguration errors (${errors.length}):\n${errors.join('\n')}\n\n` +
      `Fix the above in your .env file. See .env.example for reference.\n`
    );
  }

  return result;
}

/**
 * Return a sanitised copy of the validated config suitable for logging.
 * Secret fields are replaced with "***".
 *
 * @param {Record<string, any>} validated
 * @returns {Record<string, any>}
 */
function redact(validated) {
  const secretKeys = new Set(schema.filter((f) => f.secret).map((f) => f.key));
  return Object.fromEntries(
    Object.entries(validated).map(([k, v]) => [k, secretKeys.has(k) ? '***' : v])
  );
}

module.exports = { validate, redact };
