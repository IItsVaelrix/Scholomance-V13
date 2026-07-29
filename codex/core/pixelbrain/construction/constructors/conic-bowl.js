/**
 * Conic-bowl constructor — parabolic profile tangent to a reference part's lower arc.
 * PDR §3: solveConicBowl({topRef, depth}, canvas) → closed profile, tangent join < 5°.
 */

import { buildSolvedPart } from '../geometry-utils.js';
import { resolveRatioSpec } from '../proportion-laws.js';

const SEGMENTS = 48;

/**
 * Solve a conic-bowl primitive.
 * The bowl's top edge is tangent to the referenced part's lower arc.
 * The bowl profile is a parabola: y = topY + depth * (x/halfWidth)².
 *
 * @param {object} spec - { kind:'conic-bowl', topRef: PartRef, depth: RatioSpec }
 * @param {object} ctx - { anchors, canvas, resolvedParts }
 * @returns {object} SolvedPart
 */
export function solveConicBowl(spec, ctx) {
  const refPart = ctx.resolvedParts[spec.topRef.ref];
  if (!refPart) throw new Error(`ConicBowl: unresolved topRef "${spec.topRef.ref}"`);

  // Get the reference point (e.g. bottomCenter of the rim)
  const refPoint = refPart.namedPoints[spec.topRef.point];
  if (!refPoint) throw new Error(`ConicBowl: unknown named point "${spec.topRef.point}" on "${spec.topRef.ref}"`);

  // Resolve depth from ratio spec
  const resolvedRefs = {};
  // Build resolved refs from all solved parts' named points
  for (const [partId, part] of Object.entries(ctx.resolvedParts)) {
    for (const [ptName, pt] of Object.entries(part.namedPoints)) {
      // For ratio references, we use scalar distances
      resolvedRefs[`${partId}.${ptName}`] = pt[0]; // x-coordinate as default scalar
    }
  }
  // Also add radiusX/radiusY if available from named points
  if (refPart.namedPoints.right && refPart.namedPoints.left) {
    const rx = Math.abs(refPart.namedPoints.right[0] - refPart.namedPoints.left[0]) / 2;
    resolvedRefs[`${spec.topRef.ref}.radiusX`] = rx;
  }

  const depth = resolveRatioSpec(spec.depth, resolvedRefs);

  const topX = refPoint[0];
  const topY = refPoint[1];

  // Half-width from the reference part's extent
  let halfWidth;
  if (refPart.namedPoints.left && refPart.namedPoints.right) {
    halfWidth = Math.abs(refPart.namedPoints.right[0] - refPart.namedPoints.left[0]) / 2;
  } else {
    halfWidth = Math.abs(depth); // fallback: square profile
  }

  // Build the bowl profile: parabola from left rim to right rim
  // y(x) = topY + depth * (x / halfWidth)²
  const leftProfile = [];
  const rightProfile = [];
  const halfSegs = SEGMENTS / 2;

  for (let i = 0; i <= halfSegs; i++) {
    const t = i / halfSegs;
    const x = topX - halfWidth + t * halfWidth; // left half: -halfWidth → 0
    const y = topY + depth * Math.pow((x - topX) / halfWidth, 2);
    leftProfile.push([x, y]);
  }
  for (let i = 1; i <= halfSegs; i++) {
    const t = i / halfSegs;
    const x = topX + t * halfWidth; // right half: 0 → +halfWidth
    const y = topY + depth * Math.pow((x - topX) / halfWidth, 2);
    rightProfile.push([x, y]);
  }

  // Closed contour: left profile down to bottom, right profile back up to rim
  const contour = [...leftProfile, ...rightProfile];
  contour.push([contour[0][0], contour[0][1]]); // close

  const bottomY = topY + depth;
  const namedPoints = {
    topCenter: [topX, topY],
    bottomCenter: [topX, bottomY],
    left: [topX - halfWidth, topY],
    right: [topX + halfWidth, topY],
    center: [topX, topY + depth / 2],
  };

  // Spine: centerline from top to bottom
  const spine = [
    [topX, topY],
    [topX, topY + depth * 0.25],
    [topX, topY + depth * 0.5],
    [topX, topY + depth * 0.75],
    [topX, bottomY],
  ];

  return buildSolvedPart(spec._partId || 'conic-bowl', 'conic-bowl', {
    spine,
    closedContour: contour,
    namedPoints,
    measurements: {
      depth,
      halfWidth,
      width: halfWidth * 2,
    },
    closed: true,
  });
}
