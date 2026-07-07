//
// The "light" channel of the photonic retina. Shadow change is NON-LOCAL: a
// cell's lighting can change because a neighbour moved, even though the cell's
// own value did not. No per-cell value delta can detect that; this module does.
// Pure: shadow fields are passed in by the caller (no codex import).

export const SHADOW_DELTA_EPSILON = 1 / 255;

/** shadowMask: 1 where a cell's lighting changed. */
export function diffShadowField(prevField, currField, options = {}) {
  const curr = Array.isArray(currField) || ArrayBuffer.isView(currField) ? currField : [];
  const epsilon = Number.isFinite(options.epsilon) ? options.epsilon : SHADOW_DELTA_EPSILON;
  const mask = new Uint8Array(curr.length);

  if (!prevField) { mask.fill(1); return mask; }

  for (let i = 0; i < curr.length; i += 1) {
    const c = Number(curr[i]);
    const p = Number(prevField[i]);
    if (!Number.isFinite(c) || !Number.isFinite(p)) { mask[i] = 1; continue; } // fail-safe
    mask[i] = Math.abs(c - p) > epsilon ? 1 : 0;
  }
  return mask;
}
