/**
 * BOND ANATOMY — projection of the Construction Registry.
 *
 * The catalogue is no longer hand-duplicated against BONDS. The Grimoire is
 * canonical; this module re-exports the anatomy view and path-grading helpers
 * so audit scripts and tests keep stable import paths.
 *
 * @module codex/core/constellation/bond-anatomy
 */

import {
  CONSTRUCTIONS,
  BONDS,
  BOND_ANATOMY,
  constructionByBond,
  mayClaimLinguisticFact,
  isScaffold,
  CONSTRUCTION_STATUS,
} from './grimoire/index.js';

export { BOND_ANATOMY, CONSTRUCTIONS, BONDS };

/** Scaffold result types: parser machinery, not free-standing UD constituents. */
export const SCAFFOLD_TYPES = Object.freeze(new Set(
  CONSTRUCTIONS
    .filter((c) => c.status === CONSTRUCTION_STATUS.SCAFFOLD)
    .map((c) => c.result),
));

/**
 * Every active bond has a matching anatomy row (by signature). Deprecated
 * constructions may exist in anatomy without appearing in BONDS.
 * @param {Array} bonds
 */
export function validateAnatomyAgainstBonds(bonds) {
  if (!Array.isArray(bonds)) throw new Error('bonds required');
  const bySig = anatomyBySignature();
  for (const bond of bonds) {
    const [l, r, result, head] = bond;
    const key = bondKey(l, r, result);
    const a = bySig.get(key);
    if (!a) {
      throw new Error(`BONDS entry ${key} has no anatomy row`);
    }
    if (a.head !== head) {
      throw new Error(`Anatomy head for ${key} is ${a.head} but BONDS has ${head}`);
    }
    if (a.status === 'deprecated') {
      throw new Error(`Active BONDS still projects deprecated construction ${key}`);
    }
  }
}

export function bondKey(left, right, result) {
  return `${left}+${right}->${result}`;
}

export function anatomyBySignature() {
  const map = new Map();
  for (const a of BOND_ANATOMY) {
    map.set(bondKey(a.left, a.right, a.result), a);
  }
  return map;
}

export function summarizeAnatomy(rows = BOND_ANATOMY) {
  const dims = ['C', 'R', 'H', 'X'];
  const tallies = Object.fromEntries(dims.map((d) => [d, { G: 0, Y: 0, R: 0 }]));
  const critical = [];
  const yellowFlags = [];
  for (const a of rows) {
    for (const d of dims) tallies[d][a[d]] += 1;
    if ((a.flags || []).includes('critical') || a.C === 'R' || a.H === 'R' || a.X === 'R') {
      critical.push(a);
    } else if (a.C === 'Y' || a.R === 'Y' || a.H === 'Y' || a.X === 'Y') {
      yellowFlags.push(a);
    }
  }
  const allGreen = rows.filter((a) => a.C === 'G' && a.R === 'G' && a.H === 'G' && a.X === 'G');
  const byStatus = { grammar: 0, scaffold: 0, approximation: 0, deprecated: 0 };
  for (const a of rows) {
    if (a.status && byStatus[a.status] != null) byStatus[a.status] += 1;
  }
  return {
    n: rows.length,
    tallies,
    headshipGreen: tallies.H.G,
    headshipGreenRate: tallies.H.G / rows.length,
    allGreen: allGreen.length,
    allGreenRate: allGreen.length / rows.length,
    critical,
    yellowFlags,
    scaffoldResults: rows.filter((a) => SCAFFOLD_TYPES.has(a.result)),
    byStatus,
  };
}

export function gradePath(bondSignatures, bySig = anatomyBySignature()) {
  let worst = 'G';
  const flags = new Set();
  const steps = [];
  for (const sig of bondSignatures) {
    const a = bySig.get(sig);
    if (!a) {
      steps.push({ sig, missing: true });
      worst = 'R';
      flags.add('unknown-bond');
      continue;
    }
    steps.push({
      sig, C: a.C, R: a.R, H: a.H, X: a.X, flags: a.flags || [], status: a.status,
    });
    for (const f of a.flags || []) flags.add(f);
    for (const g of [a.C, a.R, a.H, a.X]) {
      if (g === 'R') worst = 'R';
      else if (g === 'Y' && worst !== 'R') worst = 'Y';
    }
  }
  const theoryClean = steps.every((s) => !s.missing && s.C === 'G' && s.R === 'G' && s.H === 'G' && s.X === 'G');
  const headshipClean = steps.every((s) => !s.missing && s.H === 'G');
  const criticalHit = [...flags].some((f) => f === 'critical' || f === 'cop-vs-aux' || f === 'theory-wrong-category');
  const usedScaffold = steps.some((s) => s.status === 'scaffold');
  const usedApproximation = steps.some((s) => s.status === 'approximation');
  return {
    worst,
    theoryClean,
    headshipClean,
    criticalHit,
    usedScaffold,
    usedApproximation,
    flags: [...flags],
    steps,
  };
}

export { constructionByBond, mayClaimLinguisticFact, isScaffold };
