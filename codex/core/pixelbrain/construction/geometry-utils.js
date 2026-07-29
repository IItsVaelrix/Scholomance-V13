/**
 * Shared geometry utilities for construction constructors.
 * Pure functions. No I/O. Deterministic.
 */

import { roundTo } from '../shared.js';

export const Q = 3; // quantization decimal places (PDR §5)

/** Quantize a scalar to 3dp. */
export function q(v) { return roundTo(v, Q); }

/** Quantize a point [x,y]. */
export function qp(p) { return [q(p[0]), q(p[1])]; }

/** Distance between two points. */
export function dist(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Lerp between two points. */
export function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Normalize a 2D vector. Returns [0,0] for zero-length. */
export function normalize(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (len < 1e-12) return [0, 0];
  return [v[0] / len, v[1] / len];
}

/** Perpendicular (left normal) of a 2D vector. */
export function perp(v) {
  return [-v[1], v[0]];
}

/** Dot product. */
export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}

/** Cross product (z-component). */
export function cross(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}

/** Angle of vector in radians. */
export function angle(v) {
  return Math.atan2(v[1], v[0]);
}

/** Angle between two vectors in radians [0, π]. */
export function angleBetween(a, b) {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/**
 * Compute tangent, normal, curvature at each point of a polyline.
 * Returns { tangents, normals, curvature, arcLength }.
 */
export function computeDifferentials(points, closed = false) {
  const n = points.length;
  if (n < 2) return { tangents: [], normals: [], curvature: [], arcLength: 0 };

  const tangents = [];
  const normals = [];
  const curvature = [];
  let arcLength = 0;

  for (let i = 0; i < n; i++) {
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const curr = points[i];

    // Tangent: central difference
    const t = normalize([next[0] - prev[0], next[1] - prev[1]]);
    tangents.push(qp(t));

    // Normal: left perpendicular of tangent
    const nm = perp(t);
    normals.push(qp(nm));

    // Curvature: Menger curvature from prev, curr, next
    const a = dist(prev, curr);
    const b = dist(curr, next);
    const c = dist(prev, next);
    if (a < 1e-9 || b < 1e-9 || c < 1e-9) {
      curvature.push(0);
    } else {
      // Area of triangle via cross product
      const area = Math.abs(cross(
        [curr[0] - prev[0], curr[1] - prev[1]],
        [next[0] - prev[0], next[1] - prev[1]]
      )) / 2;
      const R = (a * b * c) / (4 * area + 1e-12);
      curvature.push(q(1 / R));
    }

    // Arc length accumulation
    if (i > 0) {
      arcLength += dist(points[i - 1], points[i]);
    }
  }

  if (closed && n > 1) {
    arcLength += dist(points[n - 1], points[0]);
  }

  return { tangents, normals, curvature, arcLength: q(arcLength) };
}

/**
 * Build a SolvedPart from a spine/contour and metadata.
 */
export function buildSolvedPart(id, primitiveKind, opts) {
  const {
    spine = [],
    leftBank,
    rightBank,
    closedContour,
    namedPoints = {},
    closed = false,
  } = opts;

  const primary = closedContour || spine;
  const diffs = computeDifferentials(primary, closed);

  const part = {
    id,
    primitiveKind,
    spine: spine.map(qp),
    surfaceNormals: diffs.normals,
    tangents: diffs.tangents,
    curvature: diffs.curvature,
    arcLength: diffs.arcLength,
    namedPoints: Object.fromEntries(
      Object.entries(namedPoints).map(([k, v]) => [k, qp(v)])
    ),
  };

  if (leftBank) part.leftBank = leftBank.map(qp);
  if (rightBank) part.rightBank = rightBank.map(qp);
  if (closedContour) part.closedContour = closedContour.map(qp);

  return part;
}

/**
 * Check if a point is within canvas bounds.
 */
export function inBounds(p, canvas) {
  return p[0] >= 0 && p[0] < canvas.width && p[1] >= 0 && p[1] < canvas.height;
}

/**
 * Clamp a point to canvas bounds.
 */
export function clampToCanvas(p, canvas) {
  return [
    Math.max(0, Math.min(canvas.width - 1, p[0])),
    Math.max(0, Math.min(canvas.height - 1, p[1])),
  ];
}

/**
 * Segment-segment intersection test.
 * Returns the intersection point or null.
 */
export function segmentIntersection(p1, p2, p3, p4) {
  const d1 = [p2[0] - p1[0], p2[1] - p1[1]];
  const d2 = [p4[0] - p3[0], p4[1] - p3[1]];
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-12) return null; // parallel

  const d3 = [p3[0] - p1[0], p3[1] - p1[1]];
  const t = cross(d3, d2) / denom;
  const u = cross(d3, d1) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
  }
  return null;
}

/**
 * Check if a polyline self-intersects.
 * Returns array of intersection points (empty = no self-intersection).
 */
export function findSelfIntersections(points, closed = false) {
  const intersections = [];
  let n = points.length;

  // If the last point duplicates the first, strip it — the closed flag
  // already implies the closing segment. This avoids a degenerate
  // zero-length segment and a duplicate of segment 0.
  if (closed && n > 1 && dist(points[0], points[n - 1]) < 1e-9) {
    n = n - 1;
  }

  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 2; j < segCount; j++) {
      // Skip adjacent segments (they share a vertex)
      if (closed && i === 0 && j === segCount - 1) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (hit) intersections.push(hit);
    }
  }
  return intersections;
}

/**
 * Compute signed area of a polygon (shoelace formula).
 * Positive = counterclockwise, negative = clockwise.
 */
export function signedArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return area / 2;
}

/**
 * Determine winding direction of a closed polygon.
 * Returns 'counterclockwise' or 'clockwise'.
 */
export function windingDirection(points) {
  return signedArea(points) >= 0 ? 'counterclockwise' : 'clockwise';
}

/**
 * Point-in-polygon test (ray casting).
 */
export function pointInPolygon(p, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > p[1]) !== (yj > p[1]) &&
        p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether a point lies on a segment within a finite tolerance. */
export function pointOnSegment(point, a, b, tolerance = 0.01) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [point[0] - a[0], point[1] - a[1]];
  return Math.abs(cross(ab, ap)) <= tolerance
    && point[0] >= Math.min(a[0], b[0]) - tolerance
    && point[0] <= Math.max(a[0], b[0]) + tolerance
    && point[1] >= Math.min(a[1], b[1]) - tolerance
    && point[1] <= Math.max(a[1], b[1]) + tolerance;
}

/** Point-in-polygon including points on the polygon boundary. */
export function polygonContainsPoint(point, polygon, tolerance = 0.01) {
  for (let index = 0; index < polygon.length; index += 1) {
    if (pointOnSegment(
      point,
      polygon[index],
      polygon[(index + 1) % polygon.length],
      tolerance,
    )) {
      return true;
    }
  }
  return pointInPolygon(point, polygon);
}

/** Whether any pair of contour segments intersects. */
export function contoursIntersect(a, b) {
  for (let aIndex = 0; aIndex < a.length - 1; aIndex += 1) {
    for (let bIndex = 0; bIndex < b.length - 1; bIndex += 1) {
      if (segmentIntersection(
        a[aIndex],
        a[aIndex + 1],
        b[bIndex],
        b[bIndex + 1],
      )) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether an inner contour segment crosses an outer boundary away from the
 * inner segment's endpoints. Endpoint contact is allowed; transit through a
 * concavity is not.
 */
export function contourCrossesBoundary(inner, outer, tolerance = 0.01) {
  for (let innerIndex = 0; innerIndex < inner.length - 1; innerIndex += 1) {
    const innerStart = inner[innerIndex];
    const innerEnd = inner[innerIndex + 1];
    for (let outerIndex = 0; outerIndex < outer.length - 1; outerIndex += 1) {
      const intersection = segmentIntersection(
        innerStart,
        innerEnd,
        outer[outerIndex],
        outer[outerIndex + 1],
      );
      if (
        intersection
        && dist(intersection, innerStart) > tolerance
        && dist(intersection, innerEnd) > tolerance
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Minimum sampled-point distance between two contours. */
export function minimumContourDistance(a, b) {
  let minimum = Infinity;
  for (const pointA of a) {
    for (const pointB of b) {
      minimum = Math.min(minimum, dist(pointA, pointB));
    }
  }
  return minimum;
}

/** Index of the nearest sampled point, with first-index tie breaking. */
export function nearestPointIndex(points, target) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const candidate = dist(point, target);
    if (candidate < bestDistance) {
      bestDistance = candidate;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/** Whether a contour contains the reflection of a point about x = axisX. */
export function hasReflectedCounterpart(point, contour, axisX, tolerance = 0.01) {
  const reflected = [2 * axisX - point[0], point[1]];
  return contour.some(candidate => dist(reflected, candidate) <= tolerance);
}

/**
 * Centroid of a set of points.
 */
export function centroid(points) {
  if (points.length === 0) return [0, 0];
  const sx = points.reduce((s, p) => s + p[0], 0);
  const sy = points.reduce((s, p) => s + p[1], 0);
  return [sx / points.length, sy / points.length];
}
