/**
 * T6 — CONTRASTIVE SPECTRAL RESPONSE PARTICLES
 *
 * Frozen probe registry. Response vectors are measured deltas, not labels.
 * Interpretation stays in reports, not in the parser.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/contrastive-probes
 */

import { quantizeScore } from './schema.js';

function dropLast(tokens) {
  return tokens.length ? tokens.slice(0, -1) : tokens.slice();
}

function dropFirst(tokens) {
  return tokens.length ? tokens.slice(1) : tokens.slice();
}

function swapAdjacent(tokens) {
  if (tokens.length < 2) return tokens.slice();
  const out = tokens.slice();
  const tmp = out[0];
  out[0] = out[1];
  out[1] = tmp;
  return out;
}

function maskFirst(tokens) {
  if (tokens.length === 0) return tokens.slice();
  return ['UNK', ...tokens.slice(1)];
}

export const PROBE_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'drop-last',
    invariance: 'coverage-may-fall',
    apply: dropLast,
  }),
  Object.freeze({
    id: 'drop-first',
    invariance: 'coverage-may-fall',
    apply: dropFirst,
  }),
  Object.freeze({
    id: 'swap-adjacent',
    invariance: 'order-sensitive',
    apply: swapAdjacent,
  }),
  Object.freeze({
    id: 'mask-first',
    invariance: 'identity-sensitive',
    apply: maskFirst,
  }),
]);

export function applyProbe(tokens, probe) {
  if (!probe || typeof probe.apply !== 'function') return [...(tokens || [])];
  return probe.apply(tokens || []);
}

export function responseVector(before, after) {
  return Object.freeze({
    dCoverage: (after?.coverage ?? 0) - (before?.coverage ?? 0),
    dRoot: (after?.roots ?? 0) - (before?.roots ?? 0),
    dContainment: (after?.containment ?? 0) - (before?.containment ?? 0),
    dRank: (after?.rank ?? 0) - (before?.rank ?? 0),
    dEvents: (after?.events ?? 0) - (before?.events ?? 0),
    dRecPres: (after?.recPres ?? 0) - (before?.recPres ?? 0),
  });
}

function meanVector(rows) {
  const keys = ['dCoverage', 'dRoot', 'dContainment', 'dRank', 'dEvents', 'dRecPres'];
  const acc = Object.fromEntries(keys.map((k) => [k, 0]));
  const n = rows.length || 1;
  for (const row of rows) {
    for (const k of keys) acc[k] += Number(row[k] || 0);
  }
  for (const k of keys) acc[k] /= n;
  return acc;
}

export function selectivity(targeted, controls) {
  const t = meanVector(targeted || []);
  const c = meanVector(controls || []);
  const keys = Object.keys(t);
  let sum = 0;
  for (const k of keys) {
    const d = t[k] - c[k];
    sum += d * d;
  }
  return Object.freeze({
    separation: quantizeScore(Math.sqrt(sum)),
    targeted: Object.freeze(t),
    control: Object.freeze(c),
  });
}
