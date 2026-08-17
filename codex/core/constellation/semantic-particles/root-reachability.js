/**
 * T5 — ROOT-REACHABILITY IDENTITY PHOTONS
 *
 * Exact downward closure from every spanning root. Annotation only.
 * Identity is (type, from, to, derivationId), never the 32-bit aura.
 *
 * Reuses the standing descendFromRoots walk so "lit" remains the same
 * graph property already tested in descending-light.test.js.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/root-reachability
 */

import { descendFromRoots } from '../resonance-beacon.js';

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function identityKey(node) {
  const type = node?.type ?? '?';
  const from = node?.from ?? 0;
  const to = node?.to ?? from;
  if (!node?.derivations?.length) return `${type}:${from}:${to}:leaf`;
  return `${type}:${from}:${to}:packed`;
}

function walkFrom(roots) {
  const lit = new Set();
  const stack = [...(roots || [])];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || lit.has(node)) continue;
    lit.add(node);
    for (const derivation of node.derivations || []) {
      if (derivation.child) stack.push(derivation.child);
      if (derivation.left) stack.push(derivation.left);
      if (derivation.right) stack.push(derivation.right);
    }
  }
  return lit;
}

function auraOf(node) {
  return node?.nucleus?.aura || null;
}

function collisionCount(chart, union) {
  const byAura = new Map();
  for (const node of chart?.molecules || []) {
    const aura = auraOf(node);
    if (!aura) continue;
    const row = byAura.get(aura) || { lit: 0, dark: 0 };
    if (union.has(node)) row.lit += 1;
    else row.dark += 1;
    byAura.set(aura, row);
  }
  let collisions = 0;
  for (const row of byAura.values()) {
    if (row.lit > 0 && row.dark > 0) collisions += 1;
  }
  return collisions;
}

export function descendExact(chart) {
  const union = descendFromRoots(chart);
  return Object.freeze({
    union,
    collisions: collisionCount(chart, union),
    identity: 'type-from-to-derivation',
  });
}

export function perRootReachability(chart) {
  const perRoot = (chart?.stable || []).map((root) => {
    const lit = walkFrom([root]);
    return Object.freeze({
      root: identityKey(root),
      type: root.type,
      from: root.from,
      to: root.to,
      lit: Object.freeze([...lit]),
    });
  });
  const union = new Set();
  for (const row of perRoot) {
    for (const node of row.lit) union.add(node);
  }
  return Object.freeze({ perRoot: Object.freeze(perRoot), union });
}

function sameMention(side, node) {
  if (!side || !node) return false;
  return side.type === node.type && side.from === node.from && side.to === node.to;
}

export function joinRefusals(chart, exact) {
  const union = exact?.union || new Set();
  const unlitNodes = (chart?.molecules || []).filter((node) => !union.has(node));
  const ledger = chart?.ledger || [];
  let unlitRefused = 0;
  for (const node of unlitNodes) {
    const refused = ledger.some((row) => sameMention(row.left, node) || sameMention(row.right, node));
    if (refused) unlitRefused += 1;
  }
  const unlit = unlitNodes.length;
  return Object.freeze({
    unlit,
    unlitRefused,
    unlitNeverBonded: unlit - unlitRefused,
  });
}

export function shuffleLitMarks(chart, litSet, seed) {
  const molecules = chart?.molecules || [];
  const byWidth = new Map();
  for (const node of molecules) {
    const width = node.to - node.from;
    const row = byWidth.get(width) || [];
    row.push(node);
    byWidth.set(width, row);
  }
  const rand = lcg(seed >>> 0);
  const out = new Set();
  for (const [, group] of [...byWidth.entries()].sort((a, b) => a[0] - b[0])) {
    const litHere = group.filter((node) => litSet.has(node));
    const k = litHere.length;
    const pool = [...group];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    for (let i = 0; i < k; i += 1) out.add(pool[i]);
  }
  return out;
}

export function collapseReport(chart, exact) {
  const union = exact?.union || new Set();
  const byIndex = new Map();
  for (const atom of chart?.atoms || []) {
    if (atom.from !== atom.to) continue;
    const row = byIndex.get(atom.from) || [];
    row.push(atom);
    byIndex.set(atom.from, row);
  }
  let ambiguousTokens = 0;
  let collapsed = 0;
  for (const row of byIndex.values()) {
    if (row.length < 2) continue;
    ambiguousTokens += 1;
    const litCount = row.filter((atom) => union.has(atom)).length;
    if (litCount === 1) collapsed += 1;
  }
  return Object.freeze({ ambiguousTokens, collapsed });
}
