/**
 * Rounded-polygon constructor — polygon with arc-filleted corners.
 * PDR §3: { kind:'rounded-polygon', points: AnchorRef[], cornerRadius }
 */

import { buildSolvedPart, dist, normalize } from '../geometry-utils.js';

const ARC_SEGMENTS = 8; // segments per corner arc

/**
 * Solve a rounded-polygon primitive.
 * Each corner is replaced by a circular arc of the given radius,
 * tangent to the two adjacent edges.
 */
export function solveRoundedPolygon(spec, ctx) {
  const anchorRefs = spec.points;
  const cornerRadius = spec.cornerRadius;

  if (!Array.isArray(anchorRefs) || anchorRefs.length < 3) {
    throw new Error('RoundedPolygon: need ≥3 points');
  }

  // Resolve anchor points
  const verts = anchorRefs.map(ref => {
    const pt = ctx.anchors[ref.anchor];
    if (!pt) throw new Error(`RoundedPolygon: unknown anchor "${ref.anchor}"`);
    return [pt[0] + (ref.offset?.[0] ?? 0), pt[1] + (ref.offset?.[1] ?? 0)];
  });

  const n = verts.length;
  const contour = [];

  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n];
    const curr = verts[i];
    const next = verts[(i + 1) % n];

    // Direction vectors from curr to prev and next
    const toPrev = normalize([prev[0] - curr[0], prev[1] - curr[1]]);
    const toNext = normalize([next[0] - curr[0], next[1] - curr[1]]);
    const directionDot = toPrev[0] * toNext[0] + toPrev[1] * toNext[1];

    // A redundant point on a straight edge has no corner to fillet.
    if (directionDot < -0.999999) {
      contour.push(curr);
      continue;
    }

    // Compute the true circular fillet. The authored cornerRadius is the
    // circle radius, while the tangent offset depends on the corner angle.
    const dPrev = dist(prev, curr);
    const dNext = dist(curr, next);

    // Arc center: offset from corner along the angle bisector
    const bisector = normalize([toPrev[0] + toNext[0], toPrev[1] + toNext[1]]);
    const halfAngle = Math.acos(Math.max(-1, Math.min(1,
      toPrev[0] * bisector[0] + toPrev[1] * bisector[1]
    )));
    const tangentDistance = Math.min(
      cornerRadius / Math.max(Math.tan(halfAngle), 1e-12),
      dPrev / 2,
      dNext / 2,
    );
    const arcRadius = tangentDistance * Math.tan(halfAngle);
    const centerDist = arcRadius / Math.max(Math.sin(halfAngle), 1e-12);
    const arcCenter = [curr[0] + bisector[0] * centerDist, curr[1] + bisector[1] * centerDist];

    // Tangent points lie on both adjacent edges and exactly on the fillet
    // circle, which preserves mirrored input geometry after sampling.
    const tStart = [
      curr[0] + toPrev[0] * tangentDistance,
      curr[1] + toPrev[1] * tangentDistance,
    ];
    const tEnd = [
      curr[0] + toNext[0] * tangentDistance,
      curr[1] + toNext[1] * tangentDistance,
    ];

    // Arc from tStart to tEnd around arcCenter
    const startAngle = Math.atan2(tStart[1] - arcCenter[1], tStart[0] - arcCenter[0]);
    const endAngle = Math.atan2(tEnd[1] - arcCenter[1], tEnd[0] - arcCenter[0]);

    // Determine sweep direction (shortest arc)
    let sweep = endAngle - startAngle;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;

    // Line from previous tangent point to this tangent start
    contour.push(tStart);

    // Arc segments
    for (let s = 1; s <= ARC_SEGMENTS; s++) {
      const t = s / ARC_SEGMENTS;
      const angle = startAngle + sweep * t;
      contour.push([
        arcCenter[0] + arcRadius * Math.cos(angle),
        arcCenter[1] + arcRadius * Math.sin(angle),
      ]);
    }
  }

  // Close
  contour.push([contour[0][0], contour[0][1]]);

  const namedPoints = {};
  verts.forEach((v, i) => {
    namedPoints[`vertex${i}`] = v;
  });
  namedPoints.center = [
    verts.reduce((s, v) => s + v[0], 0) / n,
    verts.reduce((s, v) => s + v[1], 0) / n,
  ];

  return buildSolvedPart(spec._partId || 'rounded-polygon', 'rounded-polygon', {
    spine: contour,
    closedContour: contour,
    namedPoints,
    closed: true,
  });
}
