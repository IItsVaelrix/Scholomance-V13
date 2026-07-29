/**
 * Capsule constructor — stadium shape with semicircle caps.
 * PDR §3: solveCapsule({start, end, radius}, canvas) → closed contour with semicircle caps.
 */

import { q, qp, buildSolvedPart, dist, normalize, perp, lerp } from '../geometry-utils.js';

const CAP_SEGMENTS = 16; // segments per semicircle cap

/**
 * Solve a capsule primitive.
 * @param {object} spec - { kind:'capsule', start: AnchorRef, end: AnchorRef, radius }
 * @param {object} ctx - { anchors, canvas, resolvedParts }
 * @returns {object} SolvedPart
 */
export function solveCapsule(spec, ctx) {
  const startAnchor = ctx.anchors[spec.start.anchor];
  const endAnchor = ctx.anchors[spec.end.anchor];
  if (!startAnchor) throw new Error(`Capsule: unknown anchor "${spec.start.anchor}"`);
  if (!endAnchor) throw new Error(`Capsule: unknown anchor "${spec.end.anchor}"`);

  const start = [
    startAnchor[0] + (spec.start.offset?.[0] ?? 0),
    startAnchor[1] + (spec.start.offset?.[1] ?? 0),
  ];
  const end = [
    endAnchor[0] + (spec.end.offset?.[0] ?? 0),
    endAnchor[1] + (spec.end.offset?.[1] ?? 0),
  ];
  const r = spec.radius;

  const dir = normalize([end[0] - start[0], end[1] - start[1]]);
  const nrm = perp(dir);
  const baseAngle = Math.atan2(dir[1], dir[0]);

  const contour = [];

  // Start cap (semicircle from -90° to +90° relative to direction)
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const theta = baseAngle + Math.PI / 2 + (Math.PI * i) / CAP_SEGMENTS;
    contour.push([start[0] + r * Math.cos(theta), start[1] + r * Math.sin(theta)]);
  }

  // End cap (semicircle from +90° to +270° relative to direction)
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const theta = baseAngle - Math.PI / 2 + (Math.PI * i) / CAP_SEGMENTS;
    contour.push([end[0] + r * Math.cos(theta), end[1] + r * Math.sin(theta)]);
  }

  // Close
  contour.push([contour[0][0], contour[0][1]]);

  // Spine: centerline
  const spine = [start, lerp(start, end, 0.5), end];

  // Banks: offset lines
  const leftBank = [
    [start[0] + nrm[0] * r, start[1] + nrm[1] * r],
    [end[0] + nrm[0] * r, end[1] + nrm[1] * r],
  ];
  const rightBank = [
    [start[0] - nrm[0] * r, start[1] - nrm[1] * r],
    [end[0] - nrm[0] * r, end[1] - nrm[1] * r],
  ];

  const namedPoints = {
    start: start,
    end: end,
    center: lerp(start, end, 0.5),
    topCenter: [start[0] + nrm[0] * r, start[1] + nrm[1] * r],
    bottomCenter: [end[0] - nrm[0] * r, end[1] - nrm[1] * r],
    left: leftBank[0],
    right: rightBank[0],
  };

  return buildSolvedPart(spec._partId || 'capsule', 'capsule', {
    spine,
    leftBank,
    rightBank,
    closedContour: contour,
    namedPoints,
    measurements: {
      radius: r,
      length: dist(start, end),
      totalLength: dist(start, end) + r * 2,
    },
    closed: true,
  });
}
