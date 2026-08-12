/**
 * Shared bank + utility ranking for codebase nuclei mining and ablations.
 * Pure helpers except existsSync for evidence-path realization checks.
 * Callers pass ritual base atoms/bridges — this module does not import scripts/.
 */

import { existsSync } from 'node:fs';

export const SHIPPED = Object.freeze([
  'bytecode-seal|canonical-serializer|diagnostic-event-bus|immutable-packet|schema-verifier',
  'bytecode-seal|canonical-serializer|cyclotron-reactor|evidence-ledger|schema-verifier',
  'bytecode-seal|canonical-serializer|immutable-packet|schema-verifier|semantic-memory',
]);

export const SEAL_CLIQUE = new Set([
  'bytecode-seal', 'canonical-serializer', 'immutable-packet',
  'schema-verifier', 'semantic-memory', 'diagnostic-event-bus',
]);

/** Atoms whose job is evidence/process observation (removed in no_evidence_atoms). */
export const EVIDENCE_SENSOR_IDS = Object.freeze([
  'process-sensor',
  'artifact-auditor',
  'subtlety-fingerprint',
  'subtlety-closed-loop',
  'evidence-ledger',
  'corpus-loader',
  'grounding-index',
  'holdout-validator',
]);

const atom = (id, label, domain, offers, seeks, evidence, traits = [], inhibits = []) => ({
  id,
  label,
  domain,
  offers,
  seeks,
  traits,
  inhibits,
  evidence: [evidence],
});

export const CODEBASE_ATOMS = Object.freeze([
  atom(
    'process-sensor',
    'cyclotron process drift sensor',
    'immunity',
    ['process-verdict', 'experiment-receipt'],
    ['candidate-frontier', 'feasibility-score', 'validation-verdict'],
    'codex/core/pixelbrain/cyclotron-sensor.js',
    ['sensor', 'propose-only'],
  ),
  atom(
    'artifact-auditor',
    'evidence integrity harness A2',
    'immunity',
    ['integrity-verdict', 'diagnostic-event'],
    ['artifact', 'checksum', 'structure'],
    'scripts/evidence-integrity-harness.mjs',
    ['sensor', 'propose-only'],
  ),
  atom(
    'subtlety-fingerprint',
    'subtlety APM fingerprint sensor',
    'immunity',
    ['anomaly-fingerprint', 'anomaly-signal'],
    ['diagnostic-event'],
    'codex/core/pixelbrain/subtlety-fingerprint-apm.js',
    ['sensor'],
  ),
  atom(
    'subtlety-closed-loop',
    'subtlety closed loop observe only',
    'immunity',
    ['sensor-observation'],
    ['anomaly-fingerprint', 'process-verdict'],
    'codex/core/pixelbrain/subtlety-closed-loop.js',
    ['sensor', 'propose-only'],
  ),
  atom(
    'raid-healer',
    'iterative healer propose only',
    'immunity',
    ['heal-proposal'],
    ['risk-classification', 'process-verdict', 'integrity-verdict'],
    'codex/core/immunity/iterative-healer.js',
    ['propose-only'],
  ),
  atom(
    'fission-reactor',
    'semantic fission reactor',
    'linguistic',
    ['fission-daughters', 'construction-tree', 'proposal'],
    ['token-stream', 'semantic-relation', 'corpus-grounding'],
    'codex/core/pixelbrain/semantic-fission-reactor.js',
  ),
  atom(
    'ccg-channel',
    'CCG derivation channel',
    'linguistic',
    ['ccg-derivation', 'construction-tree', 'semantic-relation'],
    ['token-stream', 'semantic-primitives'],
    'codex/core/semantic/ccg-channel.js',
  ),
  atom(
    'treebank-metrics',
    'constellation treebank metrics',
    'linguistic',
    ['grammar-metrics', 'validation-verdict'],
    ['construction-tree'],
    'codex/core/constellation/treebank-metrics.js',
  ),
  atom(
    'precedent-compose',
    'constellation precedent composer',
    'retrieval',
    ['chart-composition', 'candidate-frontier', 'proposal'],
    ['grammar-metrics', 'corpus-grounding', 'construction-tree'],
    'codex/server/services/constellation/precedent.adapter.js',
  ),
  atom(
    'entropy-dampener',
    'occupancy entropy dampener',
    'synthesis',
    ['occupancy-signal', 'candidate-frontier', 'novelty-signal'],
    ['trial-counter', 'atom-inventory'],
    'codex/core/pixelbrain/entropic-decay-dampener.js',
  ),
  atom(
    'test-contract',
    'vitest contract for sensor and reactor',
    'governance',
    ['test-verdict', 'validation-verdict'],
    ['schema-verdict', 'process-verdict', 'integrity-verdict'],
    'tests/codex/core/pixelbrain/cyclotron-sensor.test.js',
  ),
  atom(
    'canonical-tokenizer-atom',
    'canonical linguistic tokenizer module',
    'linguistic',
    ['token-stream', 'text'],
    [],
    'codex/core/canonical-tokenizer.js',
  ),
]);

export const CODEBASE_BRIDGES = Object.freeze([
  { from: 'process-verdict', to: 'anomaly-signal', relation: 'surfaces', strength: 0.88 },
  { from: 'integrity-verdict', to: 'anomaly-signal', relation: 'surfaces', strength: 0.86 },
  { from: 'anomaly-fingerprint', to: 'anomaly-signal', relation: 'specializes', strength: 0.9 },
  { from: 'sensor-observation', to: 'diagnostic-event', relation: 'emits', strength: 0.84 },
  { from: 'heal-proposal', to: 'promotion-decision', relation: 'requires-human', strength: 0.8 },
  { from: 'fission-daughters', to: 'construction-tree', relation: 'yields', strength: 0.92 },
  { from: 'ccg-derivation', to: 'construction-tree', relation: 'projects', strength: 0.9 },
  { from: 'grammar-metrics', to: 'validation-verdict', relation: 'scores', strength: 0.82 },
  { from: 'chart-composition', to: 'proposal', relation: 'renders', strength: 0.78 },
  { from: 'occupancy-signal', to: 'novelty-signal', relation: 'modulates', strength: 0.85 },
  { from: 'test-verdict', to: 'build-decision', relation: 'gates', strength: 0.9 },
  { from: 'diagnostic-event', to: 'anomaly-signal', relation: 'excites', strength: 0.83 },
]);

/**
 * Membrane permeability calibrated for the DEFAULT (base + extension) bank:
 * p90 of measured crowding, derived at seed 0x4f534d4f and validated at
 * 0x484f4c44. Evidence: docs/superpowers/evidence/2026-08-12-osmotic-equilibrium.md
 *
 * Not portable. It clears 41.0% of the 44-atom ritual bank against a 10%
 * target, because occupancy heat scales with graph size.
 */
export const FULL_BANK_CONCENTRATION_LIMIT = 0.93436;

export function retargetBaseAtoms(blueprints) {
  return blueprints.map((blueprint) => {
    if (blueprint.id !== 'diagnostic-event-bus') return blueprint;
    return {
      ...blueprint,
      evidence: ['scripts/evidence-integrity-harness.mjs'],
      label: 'diagnostic event bus (inline in A2 harness)',
    };
  });
}

export function buildDefaultBank(baseAtoms, baseBridges, {
  excludeIds = [],
  includeExtensions = true,
} = {}) {
  if (!Array.isArray(baseAtoms) || !Array.isArray(baseBridges)) {
    throw new TypeError('buildDefaultBank(baseAtoms, baseBridges, options) requires ritual arrays');
  }
  const exclude = new Set(excludeIds);
  const base = retargetBaseAtoms(baseAtoms).filter((a) => !exclude.has(a.id));
  const seen = new Set(base.map((a) => a.id));
  const extensions = includeExtensions
    ? CODEBASE_ATOMS.filter((a) => {
      if (exclude.has(a.id) || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    : [];
  return {
    blueprints: [...base, ...extensions],
    bridges: [...baseBridges, ...CODEBASE_BRIDGES],
    baseCount: base.length,
    extensionIds: extensions.map((a) => a.id),
  };
}

export function topologyKey(atomIds) {
  return [...(atomIds ?? [])].sort().join('|');
}

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function pathExists(rel) {
  return existsSync(rel);
}

export function openPorts(moleculeAtoms, bankById) {
  const offered = new Set();
  const sought = new Set();
  for (const id of moleculeAtoms) {
    const a = bankById.get(id);
    if (!a) continue;
    for (const o of a.offers) offered.add(o);
    for (const s of a.seeks) sought.add(s);
  }
  const internal = [...sought].filter((s) => offered.has(s)).sort();
  const dangling = [...sought].filter((s) => !offered.has(s)).sort();
  return { internal, dangling, offered: [...offered].sort() };
}

export function evidenceScore(moleculeAtoms, bankById) {
  let ok = 0;
  const missing = [];
  for (const id of moleculeAtoms) {
    const a = bankById.get(id);
    const path = a?.evidence?.[0];
    if (path && pathExists(path)) ok += 1;
    else missing.push({ id, path: path ?? null });
  }
  return {
    realized: moleculeAtoms.length ? ok / moleculeAtoms.length : 0,
    missing,
  };
}

export function domainsOf(moleculeAtoms, bankById) {
  return [...new Set(moleculeAtoms.map((id) => bankById.get(id)?.domain).filter(Boolean))].sort();
}

export function utilityScore(candidate, bankById, extensionIds = CODEBASE_ATOMS.map((a) => a.id)) {
  const extSet = new Set(extensionIds);
  const ids = candidate.molecule?.atomIds ?? [];
  const topo = topologyKey(ids);
  const shipped = SHIPPED.includes(topo);
  const evidence = evidenceScore(ids, bankById);
  const ports = openPorts(ids, bankById);
  const domains = domainsOf(ids, bankById);
  const closure = ports.internal.length + ports.dangling.length === 0
    ? 1
    : ports.internal.length / Math.max(1, ports.internal.length + ports.dangling.length);
  const newAtomCount = ids.filter((id) => extSet.has(id)).length;
  const newAtomFrac = ids.length ? newAtomCount / ids.length : 0;
  const sealOnly = ids.length > 0 && ids.every(
    (id) => SEAL_CLIQUE.has(id) || id === 'evidence-ledger' || id === 'server-authority',
  );
  const domainFrac = Math.min(1, domains.length / 3);
  const danglingPenalty = Math.min(1, ports.dangling.length / 4);
  const chemistry = Number(candidate.finalScore) || 0;

  let score = 0;
  score += 0.22 * chemistry;
  score += 0.20 * evidence.realized;
  score += 0.12 * closure;
  score += 0.28 * newAtomFrac;
  score += 0.12 * domainFrac;
  score -= 0.08 * danglingPenalty;
  if (newAtomCount === 0) score = Math.min(score, 0.35);
  if (sealOnly && newAtomCount === 0) score = Math.min(score, 0.20);
  if (shipped) score = Math.min(score, 0.12);
  if (evidence.realized < 1) score *= 0.55;

  return {
    utility: Math.max(0, Math.min(1, score)),
    shipped,
    evidence,
    ports,
    domains,
    newAtomCount,
    topology: topo,
  };
}

export function collapseByTopology(candidates, bankById, extensionIds) {
  const best = new Map();
  for (const candidate of candidates) {
    const scored = { candidate, ...utilityScore(candidate, bankById, extensionIds) };
    const key = scored.topology;
    const prev = best.get(key);
    if (!prev
      || scored.utility > prev.utility
      || (scored.utility === prev.utility
        && (scored.candidate.finalScore ?? 0) > (prev.candidate.finalScore ?? 0))) {
      best.set(key, scored);
    }
  }
  return [...best.values()].sort((a, b) => (
    b.utility - a.utility
    || (b.candidate.finalScore ?? 0) - (a.candidate.finalScore ?? 0)
    || a.topology.localeCompare(b.topology)
  ));
}

export function rankProposals(collapsed, {
  requireExtension = true,
  utilityFloor = 0.40,
  evidenceFloor = 0.8,
  limit = 12,
} = {}) {
  return collapsed
    .filter((r) => !r.shipped
      && (!requireExtension || r.newAtomCount >= 1)
      && r.utility >= utilityFloor
      && r.evidence.realized >= evidenceFloor)
    .slice(0, limit)
    .map((row) => ({
      topology: row.topology,
      atomIds: row.candidate.molecule.atomIds,
      verdict: row.candidate.verdict,
      finalScore: row.candidate.finalScore,
      utility: Number(row.utility.toFixed(6)),
      domains: row.domains,
      evidenceRealized: row.evidence.realized,
      openPorts: row.ports.dangling,
      internalPorts: row.ports.internal,
      newAtomCount: row.newAtomCount,
    }));
}

/** Deterministic mulberry32 from a uint32 seed. */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, seed) {
  const arr = [...items];
  const rnd = mulberry32(seed >>> 0);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Derange (offers, seeks) pairs across atoms — ids/labels/evidence fixed. */
export function shuffleOffersSeeks(blueprints, seed) {
  const portPairs = blueprints.map((a) => ({
    offers: [...a.offers],
    seeks: [...a.seeks],
  }));
  const order = seededShuffle(portPairs.map((_, i) => i), seed);
  // rotation derangement
  const mapping = new Array(order.length);
  for (let i = 0; i < order.length; i += 1) {
    mapping[order[i]] = order[(i + 1) % order.length];
  }
  return blueprints.map((a, i) => ({
    ...a,
    offers: portPairs[mapping[i]].offers,
    seeks: portPairs[mapping[i]].seeks,
  }));
}

/** Derange evidence paths across atoms — ports/ids/labels fixed. */
export function shuffleEvidencePaths(blueprints, seed) {
  const paths = blueprints.map((a) => a.evidence?.[0] ?? '');
  const order = seededShuffle(paths.map((_, i) => i), seed);
  const mapping = new Array(order.length);
  for (let i = 0; i < order.length; i += 1) {
    mapping[order[i]] = order[(i + 1) % order.length];
  }
  return blueprints.map((a, i) => ({
    ...a,
    evidence: [paths[mapping[i]]],
  }));
}

/**
 * Topology-matched random control molecules: same size as each proposal,
 * random atoms from the bank, not equal to the proposal topology.
 */
export function randomTopologyMatchedControls(proposals, atomIds, seed, perProposal = 3) {
  const rnd = mulberry32(seed >>> 0);
  const pool = [...atomIds];
  const controls = [];
  for (const proposal of proposals) {
    const size = proposal.atomIds.length;
    const seen = new Set([proposal.topology]);
    let attempts = 0;
    while (controls.filter((c) => c.matchedProposal === proposal.topology).length < perProposal
      && attempts < 500) {
      attempts += 1;
      const pick = new Set();
      while (pick.size < size && pick.size < pool.length) {
        pick.add(pool[Math.floor(rnd() * pool.length)]);
      }
      if (pick.size < size) continue;
      const ids = [...pick];
      const topo = topologyKey(ids);
      if (seen.has(topo)) continue;
      seen.add(topo);
      controls.push({
        matchedProposal: proposal.topology,
        atomIds: ids,
        topology: topo,
        size,
      });
    }
  }
  return controls;
}
