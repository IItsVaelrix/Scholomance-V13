/**
 * PB-AMP-RELEVANCE-v1 — the frozen contract for AMP activation relevance.
 *
 * Each of PixelBrain's AMP passes already gates itself on something. Today that
 * gate is an `if` statement inside whichever factory happens to import the AMP —
 * real, but informal, scattered, and invisible to anything outside that file.
 * `chestplate-amp.js` states its own gate in English at the top of the file:
 * "Gated on class:'armor' + archetype containing 'chestplate'". This contract is
 * that same sentence, made into data: checksummed, queryable, and diffable.
 *
 * A record describes ONE AMP module. It never describes an asset — that's what
 * `PB-SCDNA-GENE-v1` (scdna-art-gene.js) is for, and the two are deliberately
 * separate contracts answering separate questions.
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md
 * @bytecode PB-AMP-RELEVANCE-v2
 */

import { sha256Hex } from '../sha256.js';

export const AMP_RELEVANCE_CONTRACT = 'PB-AMP-RELEVANCE-v2';

export const VALID_PIPELINES = Object.freeze([
  'item', 'chestplate-fidelity', 'render-fidelity', 'voxel-world',
  'character', 'image-lattice', 'cross-cutting', 'runtime',
]);

/**
 * Fields a predicate may read off a spec. Dotted paths whose first segment is an
 * array (`parts.profile`) mean "SOME element of that array matches" — the shape
 * real gates already use, e.g. holyfire-motif-amp's
 * `spec.parts.some(p => p.profile === 'weapon.sword.holyfire_motif')`.
 */
export const VALID_FIELDS = Object.freeze([
  'class', 'archetype', 'materials', 'parts',
  'parts.id', 'parts.profile', 'parts.fill.material', 'parts.shading',
]);

// `matches` is a literal whole-value comparison, never an executable regex.
// This preserves the frozen grammar without allowing a relevance record to
// introduce backtracking work into the deterministic selector.
export const VALID_OPS = Object.freeze(['eq', 'includes', 'matches']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Canonical JSON for checksumming. Field order here IS part of the contract —
 * changing it changes every record's checksum, which is the point: a record
 * whose meaning changed must not keep its old identity.
 */
export function canonicalAmpRelevanceJSON(record) {
  return JSON.stringify({
    contract: AMP_RELEVANCE_CONTRACT,
    pipeline: record?.pipeline,
    ampId: record?.ampId,
    order: record?.order,
    description: record?.description,
    concept: record?.concept,
    version: record?.version,
    appliesTo: record?.appliesTo ?? [],
    requires: record?.requires ?? [],
    schemaVersion: AMP_RELEVANCE_CONTRACT,
  });
}

/** The checksum a record's own content demands. */
export function computeAmpRelevanceChecksum(record) {
  return sha256Hex(canonicalAmpRelevanceJSON(record));
}

function validateLeafClause(clause, path, errors) {
  if (!VALID_FIELDS.includes(clause.field)) {
    errors.push(`${path}.field: unknown field '${clause.field}' (valid: ${VALID_FIELDS.join(', ')})`);
  }
  if (!VALID_OPS.includes(clause.op)) {
    errors.push(`${path}.op: unknown op '${clause.op}' (valid: ${VALID_OPS.join(', ')})`);
  }
  const value = clause.value;
  const valueOk = typeof value === 'string'
    || (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string'));
  if (!valueOk) {
    errors.push(`${path}.value: must be a string or a non-empty array of strings`);
  }
  if (clause.op === 'matches' && Array.isArray(value)) {
    errors.push(`${path}.value: op 'matches' takes a single pattern string, not an array`);
  }
}

function validateClause(clause, path, errors) {
  if (!isPlainObject(clause)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  if ('anyOf' in clause) {
    if (!Array.isArray(clause.anyOf) || clause.anyOf.length === 0) {
      errors.push(`${path}.anyOf: must be a non-empty array of leaf clauses`);
      return;
    }
    clause.anyOf.forEach((sub, i) => {
      if (isPlainObject(sub) && 'anyOf' in sub) {
        // One level of disjunction is enough for every real gate measured so
        // far; nesting would make records harder to read than the `if` they
        // replace, which would defeat the point.
        errors.push(`${path}.anyOf[${i}]: nested anyOf is not allowed`);
        return;
      }
      validateClause(sub, `${path}.anyOf[${i}]`, errors);
    });
    return;
  }
  validateLeafClause(clause, path, errors);
}

/**
 * Validate a record against PB-AMP-RELEVANCE-v1, including its checksum.
 *
 * A checksum mismatch is a hard error, not a thing to quietly recompute: a
 * record whose declared identity disagrees with its own content is exactly the
 * drift this contract exists to make impossible.
 *
 * @returns {{ ok: boolean, errors: string[], expectedChecksum: string }}
 */
export function validateAmpRelevance(record) {
  const errors = [];

  if (!isPlainObject(record)) {
    return { ok: false, errors: ['record: must be an object'], expectedChecksum: null };
  }
  if (record.contract !== AMP_RELEVANCE_CONTRACT) {
    errors.push(`contract: expected '${AMP_RELEVANCE_CONTRACT}', got '${record.contract}'`);
  }
  if (record.schemaVersion !== AMP_RELEVANCE_CONTRACT) {
    errors.push(`schemaVersion: expected '${AMP_RELEVANCE_CONTRACT}', got '${record.schemaVersion}'`);
  }
  if (typeof record.ampId !== 'string' || record.ampId.trim() === '') {
    errors.push('ampId: required non-empty string');
  }
  if (typeof record.version !== 'string' || record.version.trim() === '') {
    errors.push('version: required non-empty string');
  }

  if (typeof record.pipeline !== 'string' || !VALID_PIPELINES.includes(record.pipeline)) {
    errors.push(`pipeline: must be one of ${VALID_PIPELINES.join(', ')}, got '${record.pipeline}'`);
  }
  if (!Number.isInteger(record.order)) {
    errors.push('order: required integer (conveyor-belt position within its pipeline)');
  }
  if (typeof record.description !== 'string' || record.description.trim() === '') {
    errors.push('description: required non-empty string');
  }
  if (typeof record.concept !== 'string' || record.concept.trim() === '') {
    errors.push('concept: required non-empty string');
  }

  const appliesTo = record.appliesTo ?? [];
  if (!Array.isArray(appliesTo)) {
    errors.push('appliesTo: must be an array (empty array means "always relevant")');
  } else {
    appliesTo.forEach((clause, i) => validateClause(clause, `appliesTo[${i}]`, errors));
  }

  const requires = record.requires ?? [];
  if (!Array.isArray(requires) || !requires.every((r) => typeof r === 'string' && r.trim() !== '')) {
    errors.push('requires: must be an array of non-empty dotted-path strings');
  }

  const expectedChecksum = computeAmpRelevanceChecksum(record);
  if (record.checksum !== expectedChecksum) {
    errors.push(`checksum: declared '${record.checksum}', content computes to '${expectedChecksum}'`);
  }

  return { ok: errors.length === 0, errors, expectedChecksum };
}

/**
 * Build a complete, checksummed record from its parts. The only sanctioned way
 * to produce a valid checksum — authors never hand-write one.
 */
export function createAmpRelevanceRecord({
  pipeline, ampId, order, description, concept, version, appliesTo = [], requires = [],
}) {
  const base = {
    contract: AMP_RELEVANCE_CONTRACT,
    pipeline,
    ampId,
    order,
    description,
    concept,
    version,
    appliesTo,
    requires,
    schemaVersion: AMP_RELEVANCE_CONTRACT,
  };
  return Object.freeze({ ...base, checksum: computeAmpRelevanceChecksum(base) });
}
