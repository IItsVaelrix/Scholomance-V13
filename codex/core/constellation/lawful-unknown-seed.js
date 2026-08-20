/**
 * LAWFUL UNKNOWN SEED
 *
 * Atomless slots hear a known call and cannot become NP/PP, so existing
 * carbon (DET+N→NP, P+NP→PP, V+NP→VP) never fires. This module does not
 * write a bond. It exposes a rival *reading* the Grimoire already eats.
 *
 * Type comes from known-side SEEKING valence (DET looks right for N).
 * Not gold. Not a new pair. Not a marker promoted into admission.
 *
 * Field law: rank/orient/gate. Seeding a licensed complement is gating
 * a vacancy, not inventing structure.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/lawful-unknown-seed
 */

import { leafNucleus } from './atom-nucleus.js';
import { mintValence } from './atom-valence.js';
import { SEEKING } from './unknown-capability-marker.js';

export const LAWFUL_UNKNOWN_SEED_CONTRACT = 'PB-LAWFUL-UNKNOWN-SEED-v1';

/**
 * Lexical stand-in for the phrase a seeking caller is allowed to bind.
 * N lifts to NP; V lifts to VP. The leaf is never a phrase type.
 */
export const LAWFUL_LEAF_SEED = Object.freeze({
  DET: 'N',
  P: 'N',
  POSS: 'N',
});

function faces(from, direction, target) {
  if (direction === 'right') return from < target;
  if (direction === 'left') return from > target;
  return false;
}

/**
 * Complement types a hole at `index` may lawfully assume.
 * Neighbors are already-typed leaves. Empty when nothing seeks this way.
 */
export function lawfulComplementTypes(index, neighbors) {
  const types = new Set();
  for (const neighbor of neighbors || []) {
    const seek = SEEKING[neighbor.type];
    if (!seek) continue;
    if (!faces(neighbor.from, seek, index)) continue;
    const seed = LAWFUL_LEAF_SEED[neighbor.type];
    if (seed) types.add(seed);
  }
  return [...types].sort();
}

function neighborsFromCell(cell, index, n) {
  const out = [];
  for (const j of [index - 1, index + 1]) {
    if (j < 0 || j >= n) continue;
    for (const node of cell[j][j].values()) {
      if (node?.type) out.push({ type: node.type, from: j });
    }
  }
  return out;
}

/**
 * Mint licensed complement atoms in empty packed cells.
 * Returns new leaf nodes. Does not admit a bond.
 */
/**
 * A seeded complement may only crystallize with the caller that sought it.
 * Lifts of the seed stay locked. The carbon product of that crystallization
 * is an ordinary molecule.
 */
export function vacancyLockReject(left, right) {
  const seed = left?.unknownSeed ? left : right?.unknownSeed ? right : null;
  if (!seed) return null;
  const other = seed === left ? right : left;
  const seeker = seed.soughtBy;
  if (!seeker || !other) return 'seed-without-seeker';
  if (other.from === seeker.from && (other.to ?? other.from) === (seeker.to ?? seeker.from)) {
    if (other.type === seeker.type) return null;
    const d = (other.derivations && other.derivations[0]) || null;
    if (d?.lift && d.child?.type === seeker.type && d.child.from === seeker.from) return null;
    return 'vacancy-lock';
  }
  return 'vacancy-lock';
}

/**
 * Lift of a seed stays locked. Bond with the seeker yields a carbon product.
 */
export function stampCarbonProduct(node, derivation) {
  if (!node || !derivation) return node;
  if (derivation.lift && derivation.child?.unknownSeed) {
    node.unknownSeed = true;
    node.soughtBy = derivation.child.soughtBy || null;
    return node;
  }
  if (derivation.bond && (derivation.left?.unknownSeed || derivation.right?.unknownSeed)) {
    node.carbonProduct = true;
    node.unknownSeed = false;
    node.soughtBy = null;
  }
  return node;
}

export function seedLawfulUnknownAtoms(tokens, cell, options = {}) {
  if (options.seedLawfulUnknowns !== true) return [];
  const n = tokens.length;
  const seeded = [];
  for (let i = 0; i < n; i += 1) {
    if (cell[i][i].size > 0) continue;
    const types = lawfulComplementTypes(i, neighborsFromCell(cell, i, n));
    for (const type of types) {
      const token = tokens[i];
      const seeker = neighborsFromCell(cell, i, n).find((nbor) => (
        SEEKING[nbor.type] && faces(nbor.from, SEEKING[nbor.type], i) && LAWFUL_LEAF_SEED[nbor.type] === type
      ));
      const node = {
        type,
        from: i,
        to: i,
        derivations: [],
        token,
        nucleus: leafNucleus(token, type, i),
        valence: mintValence(type),
        unknownSeed: true,
        soughtBy: seeker
          ? Object.freeze({ from: seeker.from, to: seeker.from, type: seeker.type })
          : null,
      };
      seeded.push(node);
    }
  }
  return seeded;
}
