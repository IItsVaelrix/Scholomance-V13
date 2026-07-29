/**
 * Offset-contour constructor — derives a parallel contour from a source part.
 * PDR §3: { kind:'offset-contour', source: PartRef, distance, side: 1|-1 }
 */

import { buildSolvedPart, normalize, perp, dist } from '../geometry-utils.js';

/**
 * Solve an offset-contour primitive.
 * Offsets the source part's closed contour (or spine) by a signed distance
 * along the outward normal. side=1 is outward, side=-1 is inward.
 */
export function solveOffsetContour(spec, ctx) {
  const sourcePart = ctx.resolvedParts[spec.source.ref];
  if (!sourcePart) throw new Error(`OffsetContour: unresolved source "${spec.source.ref}"`);

  const sourceContour = sourcePart.closedContour || sourcePart.spine;
  if (!sourceContour || sourceContour.length < 3) {
    throw new Error(`OffsetContour: source "${spec.source.ref}" has no usable contour`);
  }

  // Strip duplicate closing point if present — we re-close after offsetting
  let src = sourceContour;
  if (src.length > 1 && dist(src[0], src[src.length - 1]) < 1e-9) {
    src = src.slice(0, -1);
  }

  const distance = spec.distance * spec.side;
  const n = src.length;
  const offset = [];

  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const next = src[(i + 1) % n];
    const dir = normalize([next[0] - prev[0], next[1] - prev[1]]);
    const nrm = perp(dir);

    offset.push([
      src[i][0] + nrm[0] * distance,
      src[i][1] + nrm[1] * distance,
    ]);
  }

  // Close only if not already closed
  if (offset.length > 1 && dist(offset[0], offset[offset.length - 1]) > 1e-9) {
    offset.push([offset[0][0], offset[0][1]]);
  }

  const namedPoints = {
    center: sourcePart.namedPoints.center || offset[0],
  };

  return buildSolvedPart(spec._partId || 'offset-contour', 'offset-contour', {
    spine: offset,
    closedContour: offset,
    namedPoints,
    closed: true,
  });
}
