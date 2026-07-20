/**
 * SUBTLETY-CANON-v1 — first-class canonicalization subsystem for the
 * Subtlety Fingerprint APM (PDR §3.3).
 *
 * Raw output hashing generates noise: two outputs can be behaviorally identical
 * but byte-different (key order, generated IDs, timestamps, float precision,
 * unordered collections, redacted secrets). This module turns a raw output into
 * THREE deterministic canonical forms so each class of change is diagnosed
 * separately:
 *
 *   exactForm    — byte-exact canonical JSON (catches byte-level drift)
 *   semanticForm — canonical JSON after applying ignoredPaths / orderedPaths /
 *                  numericPolicy / redactionPolicy AND sorting object keys, so
 *                  approved representational variance is absorbed (catches
 *                  genuine behavioral change only)
 *   shapeForm    — the output SHAPE only (keys + types, values stripped) so
 *                  contract / schema changes are caught independent of values
 *
 * Determinism: every form is produced by `canonicalStringify` (Python-compact,
 * insertion/key-sorted order) over a pure transform. No Math.random, no
 * Date.now — the canonicalizer never introduces the nondeterminism it exists
 * to detect.
 */

import { canonicalStringify } from './canonical-json.js';

export const SUBTLETY_CANON_SCHEMA = 'SUBTLETY-CANON-v1';
export const SUBTLETY_CANON_VERSION = 1;

/** Default config: absorb nothing, redact nothing, round nothing. */
export function defaultCanonConfig(overrides = {}) {
  return {
    schema: SUBTLETY_CANON_SCHEMA,
    version: SUBTLETY_CANON_VERSION,
    ignoredPaths: [],
    orderedPaths: [],
    numericPolicy: { precision: null },
    redactionPolicy: { paths: [], marker: '[REDACTED]' },
    ...overrides,
  };
}

/**
 * Does `path` match `pattern`? A pattern matches exactly, or as a subtree
 * prefix when it ends with `.*` (e.g. `meta.*` matches `meta.generatedAt`).
 */
function matchesPath(path, pattern) {
  if (pattern === path) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return path === prefix || path.startsWith(prefix + '.');
  }
  return false;
}

function anyMatch(path, patterns) {
  return (patterns || []).some((p) => matchesPath(path, p));
}

function roundNumber(n, precision) {
  if (precision == null) return n;
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

/**
 * Deep-transform a value for the SEMANTIC form:
 *   - drop subtrees at ignoredPaths,
 *   - sort object keys (order-independence),
 *   - sort arrays whose path matches orderedPaths,
 *   - round numbers per numericPolicy.precision,
 *   - replace string values at redactionPolicy.paths with the marker.
 * Returns a plain JS structure (objects as key-sorted plain objects).
 */
function semanticTransform(value, config, path) {
  if (anyMatch(path, config.ignoredPaths)) return undefined; // sentinel: drop

  if (value === null) return null;
  const t = typeof value;
  if (t === 'number') {
    return Number.isInteger(value) ? value : roundNumber(value, config.numericPolicy?.precision ?? null);
  }
  if (t === 'string') {
    if (anyMatch(path, config.redactionPolicy?.paths)) return config.redactionPolicy?.marker ?? '[REDACTED]';
    return value;
  }
  if (t === 'boolean') return value;
  if (t !== 'object') return value;

  if (Array.isArray(value)) {
    let items = value
      .map((el, i) => semanticTransform(el, config, path ? `${path}.${i}` : `${i}`))
      .filter((el) => el !== undefined);
    if (anyMatch(path, config.orderedPaths)) {
      items = [...items].sort((a, b) => {
        const sa = canonicalStringify(a);
        const sb = canonicalStringify(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
    }
    return items;
  }

  // Map or plain object → key-sorted plain object (order-independent).
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
  const out = {};
  const keys = entries.map(([k]) => String(k)).sort();
  for (const key of keys) {
    const raw = value instanceof Map ? value.get(key) : value[key];
    const childPath = path ? `${path}.${key}` : key;
    const transformed = semanticTransform(raw, config, childPath);
    if (transformed !== undefined) out[key] = transformed;
  }
  return out;
}

/**
 * Structural SHAPE of a value: keys + container structure preserved, leaves
 * replaced by a type tag. Catches contract / schema changes independent of the
 * actual values. Object keys are sorted so shape is order-independent.
 */
export function shapeOf(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (t === 'string') return 'string';
  if (t === 'boolean') return 'bool';
  if (t !== 'object') return t;
  if (Array.isArray(value)) return value.map((el) => shapeOf(el));
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value);
  const out = {};
  for (const key of entries.map(([k]) => String(k)).sort()) {
    const raw = value instanceof Map ? value.get(key) : value[key];
    out[key] = shapeOf(raw);
  }
  return out;
}

/**
 * Produce the three canonical string forms for a raw output value.
 * Returns { exact, semantic, shape } — each a deterministic canonical-JSON
 * string ready to be checksummed.
 */
export function canonicalForms(output, config = defaultCanonConfig()) {
  const cfg = config.schema === SUBTLETY_CANON_SCHEMA ? config : defaultCanonConfig(config);
  return {
    exact: canonicalStringify(output ?? null),
    semantic: canonicalStringify(semanticTransform(output, cfg, '') ?? null),
    shape: canonicalStringify(shapeOf(output ?? null)),
  };
}
