//
// Pure assembler. Composes the three cell-indexed channels into one
// PerceptionFrame. Depends only on plain mask arrays — never on lattice or
// phosphorylation internals. All masks are row-major (index = row*cols + col).

import { cellCount as countCells } from './retina-cell-index.js';
import { stableHash } from './retina-hash.js';

function indicesOf(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) out.push(i);
  return Uint32Array.from(out);
}

/**
 * Assembles a frozen PerceptionFrame from the three input masks.
 *
 * frameHash is a deterministic content fingerprint over all masks
 * (cols, rows, attend/committed/shadow/changed); it intentionally EXCLUDES
 * generation so identical frame content across ticks dedupes to the same hash.
 *
 * NOTE: the freeze applied to the returned frame is shallow. The input masks
 * (changedMask, committedMask, shadowMask) are retained BY REFERENCE in the
 * frozen frame; callers must not mutate input masks after assembly.
 */
function buildFrame(changedMask, committedMask, shadowMask, rows, cols, generation) {
  const total = countCells(rows, cols);
  const attendMask = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    // attend = (changed AND NOT committed) OR shadow-moved
    attendMask[i] = ((changedMask[i] && !committedMask[i]) || shadowMask[i]) ? 1 : 0;
  }
  const attendIndices = indicesOf(attendMask);
  // frameHash covers the full frame content; generation is excluded so that
  // identical mask content across ticks produces the same hash (enables dedup).
  const frameHash = stableHash({
    cols,
    rows,
    attend: Array.from(attendMask),
    committed: Array.from(committedMask),
    shadow: Array.from(shadowMask),
    changed: Array.from(changedMask),
  });
  return Object.freeze({
    cellCount: total,
    cols,
    rows,
    attendMask,
    attendIndices,
    committedMask,
    shadowMask,
    changedMask,
    generation,
    frameHash,
  });
}

export function assemblePerceptionFrame({ changedMask, committedMask, shadowMask, rows, cols, generation = 0 }) {
  const total = countCells(rows, cols);
  for (const [name, mask] of [['changedMask', changedMask], ['committedMask', committedMask], ['shadowMask', shadowMask]]) {
    if (!mask || mask.length !== total) {
      throw new Error(`PerceptionFrame ${name} length ${mask ? mask.length : 'undefined'} !== cellCount ${total}`);
    }
  }
  return buildFrame(changedMask, committedMask, shadowMask, rows, cols, generation);
}

export function fullAttendFrame(rows, cols, generation = 0) {
  const total = countCells(rows, cols);
  const zero = new Uint8Array(total);
  const ones = new Uint8Array(total).fill(1);
  // changed=1, committed=0, shadow=0 => attend everywhere.
  return buildFrame(ones, zero, zero, rows, cols, generation);
}
