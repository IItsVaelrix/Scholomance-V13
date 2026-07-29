/**
 * Ellipse constructor — analytic parametric sampling.
 * PDR §3: solveEllipse({center, radiusX, radiusY}, canvas) → closed polyline ≥32 pts.
 */

import { buildSolvedPart } from '../geometry-utils.js';

const MIN_SEGMENTS = 32;

/**
 * Solve an ellipse primitive.
 * @param {object} spec - { kind:'ellipse', center: AnchorRef, radiusX, radiusY }
 * @param {object} ctx - { anchors, canvas, resolvedParts }
 * @returns {object} SolvedPart
 */
export function solveEllipse(spec, ctx) {
  const anchor = ctx.anchors[spec.center.anchor];
  if (!anchor) throw new Error(`Ellipse: unknown anchor "${spec.center.anchor}"`);

  const cx = anchor[0] + (spec.center.offset?.[0] ?? 0);
  const cy = anchor[1] + (spec.center.offset?.[1] ?? 0);
  const rx = spec.radiusX;
  const ry = spec.radiusY;

  // Segment count: at least 32, scaled by perimeter estimate
  const perimeterEstimate = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const segments = Math.max(MIN_SEGMENTS, Math.ceil(perimeterEstimate));

  const contour = [];
  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    contour.push([cx + rx * Math.cos(theta), cy + ry * Math.sin(theta)]);
  }
  // Close: first == last within tolerance
  contour.push([contour[0][0], contour[0][1]]);

  const namedPoints = {
    center: [cx, cy],
    topCenter: [cx, cy - ry],
    bottomCenter: [cx, cy + ry],
    left: [cx - rx, cy],
    right: [cx + rx, cy],
  };

  return buildSolvedPart(spec._partId || 'ellipse', 'ellipse', {
    spine: contour,
    closedContour: contour,
    namedPoints,
    measurements: {
      radiusX: rx,
      radiusY: ry,
      width: rx * 2,
      height: ry * 2,
    },
    closed: true,
  });
}
