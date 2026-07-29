/**
 * Bézier-chain constructor — quadratic or cubic Bézier spline through control points.
 * PDR §3: { kind:'bezier-chain', controlPoints: AnchorRef[], degree: 2|3 }
 */

import { buildSolvedPart } from '../geometry-utils.js';

const SEGMENTS_PER_SPAN = 16;

/**
 * Evaluate a quadratic Bézier at parameter t.
 */
function quadBezier(p0, p1, p2, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

/**
 * Evaluate a cubic Bézier at parameter t.
 */
function cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return [
    mt2 * mt * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t2 * t * p3[0],
    mt2 * mt * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t2 * t * p3[1],
  ];
}

/**
 * Solve a bezier-chain primitive.
 * For degree=2: control points are [on, control, on, control, ...] — every other is on-curve.
 * For degree=3: control points are [on, ctrl, ctrl, on, ctrl, ctrl, ...] — Catmull-Rom style.
 */
export function solveBezierChain(spec, ctx) {
  const refs = spec.controlPoints;
  const degree = spec.degree || 3;

  if (!Array.isArray(refs) || refs.length < degree + 1) {
    throw new Error(`BezierChain: need ≥${degree + 1} control points for degree ${degree}`);
  }

  // Resolve all control points
  const pts = refs.map(ref => {
    const pt = ctx.anchors[ref.anchor];
    if (!pt) throw new Error(`BezierChain: unknown anchor "${ref.anchor}"`);
    return [pt[0] + (ref.offset?.[0] ?? 0), pt[1] + (ref.offset?.[1] ?? 0)];
  });

  const curve = [];

  if (degree === 2) {
    // Quadratic: spans of 3 points (on, ctrl, on)
    for (let i = 0; i + 2 < pts.length; i += 2) {
      const [p0, p1, p2] = [pts[i], pts[i + 1], pts[i + 2]];
      const startJ = (i === 0) ? 0 : 1; // avoid duplicating junction points
      for (let s = startJ; s <= SEGMENTS_PER_SPAN; s++) {
        curve.push(quadBezier(p0, p1, p2, s / SEGMENTS_PER_SPAN));
      }
    }
  } else {
    // Cubic: spans of 4 points (on, ctrl, ctrl, on)
    for (let i = 0; i + 3 < pts.length; i += 3) {
      const [p0, p1, p2, p3] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
      const startJ = (i === 0) ? 0 : 1;
      for (let s = startJ; s <= SEGMENTS_PER_SPAN; s++) {
        curve.push(cubicBezier(p0, p1, p2, p3, s / SEGMENTS_PER_SPAN));
      }
    }
  }

  const namedPoints = {
    start: pts[0],
    end: pts[pts.length - 1],
    center: curve[Math.floor(curve.length / 2)],
  };

  return buildSolvedPart(spec._partId || 'bezier-chain', 'bezier-chain', {
    spine: curve,
    namedPoints,
    closed: false,
  });
}
