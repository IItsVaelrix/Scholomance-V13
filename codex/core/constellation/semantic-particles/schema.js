/**
 * SEMANTIC PARTICLE CONTRACT — Phase 0.
 *
 * A particle is the smallest independently testable unit of semantic evidence
 * or semantic control. It annotates an atom, span, derivation, root, or
 * Cyclotron candidate. It cannot license a bond.
 *
 * I1 Grammar sovereignty — no ADMIT_BOND permission exists.
 * I3 Evidence abstention — missing confidence is null, never 0.5.
 * I5 Deterministic identity — canonical key order, sorted arrays, quantized
 *    finite scores, no wall-clock or object identity in the hash.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/schema
 */

import { createHash } from 'node:crypto';

export const SEMANTIC_PARTICLE_CONTRACT = 'PB-SEMANTIC-PARTICLE-v1';
export const SEMANTIC_PARTICLE_SCHEMA_VERSION = '1.0.0';

export const PARTICLE_SCOPES = Object.freeze([
  'LEXICAL', 'NODE', 'DERIVATION', 'ROOT', 'MOLECULE',
]);

export const PARTICLE_POLARITIES = Object.freeze([
  'SUPPORT', 'INHIBIT', 'BIND', 'IDENTIFY', 'OBSERVE',
]);

export const PARTICLE_PERMISSIONS = Object.freeze([
  'OBSERVE',
  'SCORE_TOKEN',
  'SCORE_DERIVATION',
  'PROPAGATE_SUPPORT',
  'CARRY_CAPABILITY',
  'PROPOSE_EXPERIMENT',
]);

export const FORBIDDEN_PERMISSIONS = Object.freeze(['ADMIT_BOND']);

export const CREATED_BY = Object.freeze([
  'authoredRule', 'frozenIndex', 'derivation', 'probe',
]);

const SCOPE_SET = new Set(PARTICLE_SCOPES);
const POLARITY_SET = new Set(PARTICLE_POLARITIES);
const PERMISSION_SET = new Set(PARTICLE_PERMISSIONS);
const CREATED_SET = new Set(CREATED_BY);

const SCORE_PLACES = 6;
const interned = new Map();

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function quantizeScore(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error('semantic particle score must be finite');
  }
  return Number(n.toFixed(SCORE_PLACES));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deterministic JSON: sorted object keys, sorted object-arrays by their
 * own canonical form, no undefined slots.
 */
export function canonicalSerialize(value) {
  return stringify(value);
}

function stringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('canonicalSerialize rejects non-finite numbers');
    }
    return JSON.stringify(quantizeScore(value));
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t !== 'object') {
    throw new Error(`canonicalSerialize rejects ${t}`);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => stringify(item));
    if (items.every((item, i) => typeof value[i] === 'object' && value[i] !== null && !Array.isArray(value[i]))) {
      items.sort();
    }
    return `[${items.join(',')}]`;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${stringify(value[k])}`);
  return `{${body.join(',')}}`;
}

export function particleSchemaChecksum() {
  return sha256Hex(canonicalSerialize({
    contract: SEMANTIC_PARTICLE_CONTRACT,
    version: SEMANTIC_PARTICLE_SCHEMA_VERSION,
    scopes: PARTICLE_SCOPES,
    polarities: PARTICLE_POLARITIES,
    permissions: PARTICLE_PERMISSIONS,
    forbidden: FORBIDDEN_PERMISSIONS,
    createdBy: CREATED_BY,
    scorePlaces: SCORE_PLACES,
  }));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

function normalizeEvidence(evidence) {
  if (evidence == null) return [];
  if (!Array.isArray(evidence)) throw new Error('evidence must be an array');
  const rows = evidence.map((row) => {
    if (!isPlainObject(row) || !row.source) {
      throw new Error('evidence entries need a source');
    }
    const out = {};
    for (const key of Object.keys(row).sort()) out[key] = row[key];
    return out;
  });
  rows.sort((a, b) => stringify(a).localeCompare(stringify(b)));
  const ids = new Set();
  for (const row of rows) {
    const id = stringify(row);
    if (ids.has(id)) throw new Error('duplicate evidence IDs');
    ids.add(id);
  }
  return rows;
}

function normalizeList(values, name) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new Error(`${name} must be an array`);
  return [...values].map(String).sort();
}

function assertPermissions(permissions) {
  for (const p of permissions) {
    if (FORBIDDEN_PERMISSIONS.includes(p)) {
      throw new Error(`forbidden permission: ${p}`);
    }
    if (!PERMISSION_SET.has(p)) {
      throw new Error(`unsupported permission: ${p}`);
    }
  }
}

/**
 * Seal a particle. Identity fields determine `id` and `deterministicKey`.
 */
export function mintParticle(draft) {
  if (!isPlainObject(draft)) throw new Error('particle draft required');
  const scope = draft.scope;
  if (!SCOPE_SET.has(scope)) throw new Error(`invalid particle scope: ${scope}`);
  const kind = draft.kind;
  if (!kind || typeof kind !== 'string') throw new Error('particle kind required');
  const polarity = draft.polarity;
  if (!POLARITY_SET.has(polarity)) throw new Error(`invalid particle polarity: ${polarity}`);
  const createdBy = draft.createdBy || 'authoredRule';
  if (!CREATED_SET.has(createdBy)) throw new Error(`invalid createdBy: ${createdBy}`);

  const confidence = draft.confidence == null ? null : quantizeScore(draft.confidence);
  const corpusHash = draft.corpusHash == null ? null : String(draft.corpusHash);
  if (confidence != null && createdBy === 'frozenIndex' && !corpusHash) {
    throw new Error('corpus-backed confidence requires corpusHash');
  }

  const evidence = normalizeEvidence(draft.evidence);
  const provenance = normalizeList(draft.provenance, 'provenance');
  const permissions = normalizeList(draft.permissions, 'permissions');
  if (permissions.length === 0) permissions.push('OBSERVE');
  assertPermissions(permissions);

  const identity = {
    schemaVersion: SEMANTIC_PARTICLE_SCHEMA_VERSION,
    scope,
    kind,
    value: draft.value === undefined ? null : draft.value,
    polarity,
    confidence,
    evidence,
    provenance,
    permissions,
    createdBy,
    corpusHash,
  };
  const deterministicKey = sha256Hex(canonicalSerialize(identity));
  const particle = freezeDeep({
    ...identity,
    id: deterministicKey,
    deterministicKey,
  });
  return particle;
}

export function validateParticle(particle) {
  if (!particle || particle.schemaVersion !== SEMANTIC_PARTICLE_SCHEMA_VERSION) {
    throw new Error('particle missing schemaVersion');
  }
  const reminted = mintParticle(particle);
  if (reminted.id !== particle.id) {
    throw new Error('particle id does not match sealed identity');
  }
  return particle;
}

export function internParticle(draft) {
  const particle = mintParticle(draft);
  const existing = interned.get(particle.deterministicKey);
  if (existing) return existing;
  interned.set(particle.deterministicKey, particle);
  return particle;
}

export function resetParticleInterner() {
  interned.clear();
}
