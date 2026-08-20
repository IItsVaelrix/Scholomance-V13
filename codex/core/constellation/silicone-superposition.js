/**
 * SILICONE SUPERPOSITION
 *
 * Every frozen silicone attachment on a head is a simultaneous state.
 * Near and far are the same kind of fact: the state exists. Position
 * is not an observable and does not enter the amplitude.
 *
 * Amplitude is what the state *is*:
 *   1
 *   + held field energy (charge, voltage, ingested, won cells)
 *   + realization (how many derivations already build that part)
 *
 * Held energy is what the atom already owns. It is not Coulomb 1/r.
 * Distance and width do not enter. Gold does not enter. When one
 * amplitude is ahead by COLLAPSE_MARGIN the bag collapses. Otherwise
 * all states remain.
 *
 * A collapse is not a new bond. Grimoire derivations are not touched.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/silicone-superposition
 */

import {
  FROZEN_EPITOPE_SILICONE,
  signatureOfBond,
} from './epitope-silicone.js';

export const SILICONE_SUPERPOSITION_CONTRACT = 'PB-SILICONE-SUPERPOSITION-v1';

/** Leader must be at least this times the runner-up. Frozen. */
export const COLLAPSE_MARGIN = 1.5;

const FROZEN_SIGS = new Set(FROZEN_EPITOPE_SILICONE.bonds.map(signatureOfBond));

export function locusKey(node) {
  return `${node.from}:${node.to}:${node.type}`;
}

function preservedOrigin(stem, type) {
  let node = stem;
  const seen = new Set();
  while (node && !seen.has(node) && node.from !== node.to) {
    seen.add(node);
    const rows = node.derivations || [];
    const next = rows.find((d) => d.lift && d.child)
      || rows.find((d) => d.left?.type === type)
      || rows.find((d) => d.right?.type === type)
      || rows[0];
    if (!next) break;
    if (next.lift && next.child) {
      node = next.child;
      continue;
    }
    if (next.left?.type === type) {
      node = next.left;
      continue;
    }
    if (next.right?.type === type) {
      node = next.right;
      continue;
    }
    break;
  }
  return node?.from ?? stem?.from ?? null;
}

export function stemLocus(host, derivation) {
  const stem = hostChild(derivation, host?.type);
  if (!stem || !derivation?.bond) return null;
  const origin = preservedOrigin(stem, host.type);
  if (!Number.isInteger(origin)) return null;
  return `${origin}:${host.type}|${signatureOfBond(derivation.bond)}`;
}

function isFrozenSilicone(derivation) {
  const bond = derivation?.bond;
  if (!bond) return false;
  return FROZEN_SIGS.has(`${bond[0]}|${bond[1]}|${bond[2]}`);
}

function adjunctOf(derivation, hostType) {
  if (!derivation?.bond) return null;
  const left = derivation.left;
  const right = derivation.right;
  if (left?.type === hostType && right && right.type !== hostType) return right;
  if (right?.type === hostType && left && left.type !== hostType) return left;
  return derivation.bond[3] === 0 ? right : left;
}

function hostChild(derivation, hostType) {
  if (derivation.left?.type === hostType) return derivation.left;
  if (derivation.right?.type === hostType) return derivation.right;
  return derivation.bond[3] === 0 ? derivation.left : derivation.right;
}

function fieldLeaf(node, field) {
  if (!field || !node || !Number.isInteger(node.from) || node.from !== node.to) return null;
  const atoms = field[node.from]?.atoms || [];
  return atoms.find((atom) => atom.type === node.type) || null;
}

function heldEnergy(atom, field) {
  const leaf = fieldLeaf(atom, field) || atom;
  if (!leaf) return 0;
  const charge = Number(leaf.charge) || 0;
  const voltage = Number(leaf.chloroplast?.voltage) || 0;
  const ingested = Number(leaf.ingested?.energy) || 0;
  const owned = (leaf.wonCells || []).length;
  return charge + voltage + ingested + owned;
}

function realization(atom) {
  return (atom?.derivations || []).length;
}

/**
 * Amplitude of one frozen attachment. Existence + held field energy +
 * realization. Distance and width do not enter.
 */
export function weightSiliconeDerivation(host, derivation, field = null) {
  const adjunct = adjunctOf(derivation, host.type);
  const stem = hostChild(derivation, host.type);
  if (!adjunct || !stem) return 0;
  return 1
    + heldEnergy(stem, field) + heldEnergy(adjunct, field)
    + realization(stem) + realization(adjunct);
}

/**
 * Collapse a weighted bag. Tied or lonely bags stay superposed.
 */
export function collapseSuperposition(candidates, margin = COLLAPSE_MARGIN) {
  const ranked = [...(candidates || [])]
    .map((c, i) => ({ ...c, weight: Number(c.weight) || 0, i }))
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  if (ranked.length <= 1) {
    return Object.freeze({
      collapsed: false,
      kept: Object.freeze(ranked),
      dropped: Object.freeze([]),
    });
  }
  const lead = ranked[0];
  const second = ranked[1];
  const ahead = second.weight > 0
    ? lead.weight >= margin * second.weight
    : lead.weight > 0;
  if (!ahead) {
    return Object.freeze({
      collapsed: false,
      kept: Object.freeze(ranked),
      dropped: Object.freeze([]),
    });
  }
  return Object.freeze({
    collapsed: true,
    kept: Object.freeze([lead]),
    dropped: Object.freeze(ranked.slice(1)),
  });
}

function groupFrozen(chart) {
  const groups = new Map();
  for (const host of chart?.molecules || []) {
    for (const derivation of host.derivations || []) {
      if (!isFrozenSilicone(derivation)) continue;
      const key = stemLocus(host, derivation);
      if (!key) continue;
      const bag = groups.get(key) || [];
      bag.push({ host, derivation });
      groups.set(key, bag);
    }
  }
  return groups;
}

/**
 * In-place purify. Drops collapsed frozen losers. Returns a receipt.
 * Does not admit or retract a Grimoire bond.
 */
export function purifySilicone(chart, options = {}) {
  const margin = Number.isFinite(options.margin) ? options.margin : COLLAPSE_MARGIN;
  const groups = groupFrozen(chart);
  let collapsed = 0;
  let superposed = 0;
  let dropped = 0;
  for (const rows of groups.values()) {
    const bag = rows.map((row, i) => ({
      id: i,
      host: row.host,
      derivation: row.derivation,
      weight: weightSiliconeDerivation(row.host, row.derivation, chart?.field),
    }));
    superposed += 1;
    const verdict = collapseSuperposition(bag, margin);
    if (!verdict.collapsed) continue;
    collapsed += 1;
    for (const loser of verdict.dropped) {
      const host = loser.host;
      const before = host.derivations.length;
      host.derivations = host.derivations.filter((d) => d !== loser.derivation);
      if (host.derivations.length < before) dropped += 1;
    }
  }
  return Object.freeze({
    contract: SILICONE_SUPERPOSITION_CONTRACT,
    loci: groups.size,
    superposed,
    collapsed,
    dropped,
    margin,
  });
}
