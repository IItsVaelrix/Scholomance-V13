/**
 * Tapered-ribbon constructor — monotonic width taper between two endpoints.
 * PDR §3: solveTaperedRibbon({start, end, startWidth, endWidth}, canvas)
 *   → left and right bank polylines with monotonic width taper.
 */

import { q, qp, buildSolvedPart, dist, normalize, perp, lerp } from '../geometry-utils.js';

const SEGMENTS = 32;

/**
 * Resolve an AnchorRef or PartRef to a point.
 */
function resolvePoint(ref, ctx) {
  if (ref.anchor) {
    const pt = ctx.anchors[ref.anchor];
    if (!pt) throw new Error(`TaperedRibbon: unknown anchor "${ref.anchor}"`);
    return [
      pt[0] + (ref.offset?.[0] ?? 0),
      pt[1] + (ref.offset?.[1] ?? 0),
    ];
  }
  if (ref.ref) {
    const part = ctx.resolvedParts[ref.ref];
    if (!part) throw new Error(`TaperedRibbon: unresolved part "${ref.ref}"`);
    const pt = part.namedPoints[ref.point];
    if (!pt) throw new Error(`TaperedRibbon: unknown point "${ref.point}" on "${ref.ref}"`);
    return pt;
  }
  throw new Error('TaperedRibbon: start/end must be an AnchorRef or PartRef');
}

/**
 * Solve a tapered-ribbon primitive.
 * @param {object} spec - { kind:'tapered-ribbon', start, end, startWidth, endWidth }
 * @param {object} ctx - { anchors, canvas, resolvedParts }
 * @returns {object} SolvedPart
 */
export function solveTaperedRibbon(spec, ctx) {
  const start = resolvePoint(spec.start, ctx);
  const end = resolvePoint(spec.end, ctx);
  const startWidth = spec.startWidth;
  const endWidth = spec.endWidth;

  const dir = normalize([end[0] - start[0], end[1] - start[1]]);
  const nrm = perp(dir); // left normal

  const spine = [];
  const leftBank = [];
  const rightBank = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const center = lerp(start, end, t);
    const halfW = (startWidth + (endWidth - startWidth) * t) / 2;

    spine.push(center);
    leftBank.push([center[0] + nrm[0] * halfW, center[1] + nrm[1] * halfW]);
    rightBank.push([center[0] - nrm[0] * halfW, center[1] - nrm[1] * halfW]);
  }

  const namedPoints = {
    start: start,
    end: end,
    startLeft: leftBank[0],
    startRight: rightBank[0],
    endLeft: leftBank[leftBank.length - 1],
    endRight: rightBank[rightBank.length - 1],
    center: lerp(start, end, 0.5),
  };

  return buildSolvedPart(spec._partId || 'tapered-ribbon', 'tapered-ribbon', {
    spine,
    leftBank,
    rightBank,
    namedPoints,
    measurements: {
      length: dist(start, end),
      startWidth,
      endWidth,
    },
    closed: false,
  });
}
