import {
  makeRational,
  addRational,
  subRational,
  mulRational,
  compareRational,
} from './scdl-v2.rational.js';
import { computeBounds } from './scdl-v2.geometry.js';
import { invertTransform, applyTransformToPoint, createTranslation, applyTransformToShape } from './scdl-v2.transforms.js';
import { v2Diagnostic } from './scdl-v2.diagnostics.js';
import { GEOM_CODES } from './scdl-v2.types.js';

function toRational(val) {
  if (val && typeof val === 'object' && 'numerator' in val && 'denominator' in val) {
    return val;
  }
  if (val && typeof val === 'object' && 'value' in val) {
    return toRational(val.value);
  }
  return makeRational(val);
}

const HALF = makeRational(1n, 2n);

export function getAnchor(shape, name) {
  const norm = String(name).toUpperCase();
  if (shape && shape.anchors && shape.anchors[norm]) {
    return shape.anchors[norm];
  }
  const bounds = computeBounds(shape);
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;
  const halfW = mulRational(w, HALF);
  const halfH = mulRational(h, HALF);

  switch (norm) {
    case 'CENTER':
      return Object.freeze({ x: addRational(x, halfW), y: addRational(y, halfH) });
    case 'MIN_X':
    case 'LEFT':
      return Object.freeze({ x, y: addRational(y, halfH) });
    case 'MAX_X':
    case 'RIGHT':
      return Object.freeze({ x: addRational(x, w), y: addRational(y, halfH) });
    case 'MIN_Y':
    case 'TOP':
      return Object.freeze({ x: addRational(x, halfW), y });
    case 'MAX_Y':
    case 'BOTTOM':
      return Object.freeze({ x: addRational(x, halfW), y: addRational(y, h) });
    case 'TOP_LEFT':
      return Object.freeze({ x, y });
    case 'TOP_RIGHT':
      return Object.freeze({ x: addRational(x, w), y });
    case 'BOTTOM_LEFT':
      return Object.freeze({ x, y: addRational(y, h) });
    case 'BOTTOM_RIGHT':
      return Object.freeze({ x: addRational(x, w), y: addRational(y, h) });
    default:
      throw new RangeError(`Unknown anchor '${name}' on shape kind '${shape && shape.kind}'`);
  }
}

export function defineAnchor(shape, name, point) {
  const norm = String(name).toUpperCase();
  const pt = Object.freeze({ x: toRational(point.x), y: toRational(point.y) });
  const existing = shape.anchors || {};
  return Object.freeze({
    ...shape,
    anchors: Object.freeze({ ...existing, [norm]: pt }),
  });
}

export const alignShape = alignShapes;
export function alignShapes(targetOrOptions, targetAnchor, refShape, refAnchor = 'CENTER', offset = { x: makeRational(0), y: makeRational(0) }) {
  let targetShape;
  let tAnchor;
  let rShape;
  let rAnchor;
  let off = offset;

  if (targetOrOptions && typeof targetOrOptions === 'object' && 'targetShape' in targetOrOptions) {
    targetShape = targetOrOptions.targetShape;
    tAnchor = targetOrOptions.targetAnchor;
    rShape = targetOrOptions.refShape;
    rAnchor = targetOrOptions.refAnchor || 'CENTER';
    off = targetOrOptions.offset || { x: makeRational(0), y: makeRational(0) };
  } else {
    targetShape = targetOrOptions;
    tAnchor = targetAnchor;
    rShape = refShape;
    rAnchor = refAnchor;
  }

  const targetPt = getAnchor(targetShape, tAnchor);
  const refPt = getAnchor(rShape, rAnchor);
  const offX = toRational(off.x);
  const offY = toRational(off.y);

  // delta = refPt + offset - targetPt
  const dx = subRational(addRational(refPt.x, offX), targetPt.x);
  const dy = subRational(addRational(refPt.y, offY), targetPt.y);

  let updatedAnchors = undefined;
  if (targetShape.anchors && typeof targetShape.anchors === 'object') {
    const translatedAnchors = {};
    for (const [k, v] of Object.entries(targetShape.anchors)) {
      translatedAnchors[k] = Object.freeze({
        x: addRational(v.x, dx),
        y: addRational(v.y, dy),
      });
    }
    updatedAnchors = Object.freeze(translatedAnchors);
  }

  if (targetShape.kind === 'RECT' || targetShape.kind === 'ROUNDED_RECT') {
    return Object.freeze({
      ...targetShape,
      origin: Object.freeze({
        x: addRational(targetShape.origin.x, dx),
        y: addRational(targetShape.origin.y, dy),
      }),
      ...(updatedAnchors ? { anchors: updatedAnchors } : {}),
    });
  }

  if (targetShape.kind === 'CIRCLE' || targetShape.kind === 'RING' || targetShape.kind === 'ELLIPSE') {
    return Object.freeze({
      ...targetShape,
      center: Object.freeze({
        x: addRational(targetShape.center.x, dx),
        y: addRational(targetShape.center.y, dy),
      }),
      ...(updatedAnchors ? { anchors: updatedAnchors } : {}),
    });
  }

  if (targetShape.kind === 'POLYGON' || targetShape.kind === 'PATH') {
    const vertices = (targetShape.vertices || targetShape.points || []).map((v) => Object.freeze({
      x: addRational(v.x, dx),
      y: addRational(v.y, dy),
    }));
    return Object.freeze({
      ...targetShape,
      vertices: Object.freeze(vertices),
      ...(targetShape.points ? { points: Object.freeze(vertices) } : {}),
      ...(updatedAnchors ? { anchors: updatedAnchors } : {}),
    });
  }

  if (targetShape.kind === 'TRIANGLE') {
    return Object.freeze({
      ...targetShape,
      a: Object.freeze({ x: addRational(targetShape.a.x, dx), y: addRational(targetShape.a.y, dy) }),
      b: Object.freeze({ x: addRational(targetShape.b.x, dx), y: addRational(targetShape.b.y, dy) }),
      c: Object.freeze({ x: addRational(targetShape.c.x, dx), y: addRational(targetShape.c.y, dy) }),
      ...(updatedAnchors ? { anchors: updatedAnchors } : {}),
    });
  }

  const translation = createTranslation({ x: dx, y: dy });
  return applyTransformToShape(translation, targetShape);
}

function toNumCoord(val) {
  if (typeof val === 'number') return val;
  const rat = toRational(val);
  return Number(rat.numerator) / Number(rat.denominator);
}

function pointInPolygon(px, py, vertices) {
  if (!vertices || vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = toNumCoord(vertices[i].x);
    const yi = toNumCoord(vertices[i].y);
    const xj = toNumCoord(vertices[j].x);
    const yj = toNumCoord(vertices[j].y);
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInsideBounds(point, shapeOrRect) {
  const b = computeBounds(shapeOrRect);
  const px = toRational(point.x);
  const py = toRational(point.y);
  const bxEnd = addRational(b.x, b.width);
  const byEnd = addRational(b.y, b.height);

  return (
    compareRational(px, b.x) >= 0 &&
    compareRational(px, bxEnd) <= 0 &&
    compareRational(py, b.y) >= 0 &&
    compareRational(py, byEnd) <= 0
  );
}

export function containsBounds(container, contained) {
  const b1 = computeBounds(container);
  const b2 = computeBounds(contained);
  const b1xEnd = addRational(b1.x, b1.width);
  const b1yEnd = addRational(b1.y, b1.height);
  const b2xEnd = addRational(b2.x, b2.width);
  const b2yEnd = addRational(b2.y, b2.height);

  return (
    compareRational(b2.x, b1.x) >= 0 &&
    compareRational(b2.y, b1.y) >= 0 &&
    compareRational(b2xEnd, b1xEnd) <= 0 &&
    compareRational(b2yEnd, b1yEnd) <= 0
  );
}

export function isInside(point, shapeOrRect) {
  if (!isInsideBounds(point, shapeOrRect)) return false;
  if (!shapeOrRect || !shapeOrRect.kind) return true;

  const px = Number(toRational(point.x).numerator) / Number(toRational(point.x).denominator);
  const py = Number(toRational(point.y).numerator) / Number(toRational(point.y).denominator);

  switch (shapeOrRect.kind) {
    case 'RING': {
      const cx = Number(toRational(shapeOrRect.center.x).numerator) / Number(toRational(shapeOrRect.center.x).denominator);
      const cy = Number(toRational(shapeOrRect.center.y).numerator) / Number(toRational(shapeOrRect.center.y).denominator);
      const inR = Number(toRational(shapeOrRect.innerRadius).numerator) / Number(toRational(shapeOrRect.innerRadius).denominator);
      const outR = Number(toRational(shapeOrRect.outerRadius).numerator) / Number(toRational(shapeOrRect.outerRadius).denominator);
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      return d2 >= inR * inR && d2 <= outR * outR;
    }
    case 'CIRCLE': {
      const cx = Number(toRational(shapeOrRect.center.x).numerator) / Number(toRational(shapeOrRect.center.x).denominator);
      const cy = Number(toRational(shapeOrRect.center.y).numerator) / Number(toRational(shapeOrRect.center.y).denominator);
      const r = Number(toRational(shapeOrRect.radius).numerator) / Number(toRational(shapeOrRect.radius).denominator);
      const dx = px - cx;
      const dy = py - cy;
      return dx * dx + dy * dy <= r * r;
    }
    case 'ELLIPSE': {
      const cx = Number(toRational(shapeOrRect.center.x).numerator) / Number(toRational(shapeOrRect.center.x).denominator);
      const cy = Number(toRational(shapeOrRect.center.y).numerator) / Number(toRational(shapeOrRect.center.y).denominator);
      const rx = Number(toRational(shapeOrRect.radiusX).numerator) / Number(toRational(shapeOrRect.radiusX).denominator);
      const ry = Number(toRational(shapeOrRect.radiusY).numerator) / Number(toRational(shapeOrRect.radiusY).denominator);
      if (rx === 0 || ry === 0) return false;
      const dx = (px - cx) / rx;
      const dy = (py - cy) / ry;
      return dx * dx + dy * dy <= 1.0000001;
    }
    case 'STAR': {
      const cx = Number(toRational(shapeOrRect.center.x).numerator) / Number(toRational(shapeOrRect.center.x).denominator);
      const cy = Number(toRational(shapeOrRect.center.y).numerator) / Number(toRational(shapeOrRect.center.y).denominator);
      const inR = Number(toRational(shapeOrRect.innerRadius).numerator) / Number(toRational(shapeOrRect.innerRadius).denominator);
      const outR = Number(toRational(shapeOrRect.outerRadius).numerator) / Number(toRational(shapeOrRect.outerRadius).denominator);
      const pts = shapeOrRect.points;
      const verts = [];
      for (let i = 0; i < pts * 2; i++) {
        const r = i % 2 === 0 ? outR : inR;
        const angle = (i * Math.PI) / pts - Math.PI / 2;
        verts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      return pointInPolygon(px, py, verts);
    }
    case 'TRIANGLE': {
      const verts = [shapeOrRect.p1, shapeOrRect.p2, shapeOrRect.p3];
      return pointInPolygon(px, py, verts);
    }
    case 'REGULAR_POLYGON': {
      const cx = Number(toRational(shapeOrRect.center.x).numerator) / Number(toRational(shapeOrRect.center.x).denominator);
      const cy = Number(toRational(shapeOrRect.center.y).numerator) / Number(toRational(shapeOrRect.center.y).denominator);
      const r = Number(toRational(shapeOrRect.radius).numerator) / Number(toRational(shapeOrRect.radius).denominator);
      const sides = shapeOrRect.sides || 6;
      const verts = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
        verts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      }
      return pointInPolygon(px, py, verts);
    }
    case 'POLYGON': {
      return pointInPolygon(px, py, shapeOrRect.vertices);
    }
    case 'TRANSFORMED_SHAPE': {
      try {
        const invT = invertTransform(shapeOrRect.transform);
        const invPt = applyTransformToPoint(invT, point);
        return isInside(invPt, shapeOrRect.shape);
      } catch {
        return false;
      }
    }
    case 'UNION': {
      return isInside(point, shapeOrRect.left) || isInside(point, shapeOrRect.right);
    }
    case 'SUBTRACT': {
      return isInside(point, shapeOrRect.left) && !isInside(point, shapeOrRect.right);
    }
    case 'INTERSECT': {
      return isInside(point, shapeOrRect.left) && isInside(point, shapeOrRect.right);
    }
    case 'XOR': {
      return Boolean(isInside(point, shapeOrRect.left) ^ isInside(point, shapeOrRect.right));
    }
    default:
      return true;
  }
}

export function contains(container, contained) {
  if (!containsBounds(container, contained)) return false;
  if (!contained || !contained.kind) return true;
  // If contained is a point-like shape:
  if (contained.kind === 'PIXEL') {
    return isInside(contained.at, container);
  }
  // Check key points of contained shape:
  const bounds = computeBounds(contained);
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: addRational(bounds.x, bounds.width), y: bounds.y },
    { x: bounds.x, y: addRational(bounds.y, bounds.height) },
    { x: addRational(bounds.x, bounds.width), y: addRational(bounds.y, bounds.height) },
  ];
  return corners.every((pt) => isInside(pt, container));
}

export function touches(shapeA, shapeB) {
  const a = computeBounds(shapeA);
  const b = computeBounds(shapeB);
  const aXEnd = addRational(a.x, a.width);
  const aYEnd = addRational(a.y, a.height);
  const bXEnd = addRational(b.x, b.width);
  const bYEnd = addRational(b.y, b.height);

  if (compareRational(aXEnd, b.x) < 0 || compareRational(bXEnd, a.x) < 0) return false;
  if (compareRational(aYEnd, b.y) < 0 || compareRational(bYEnd, a.y) < 0) return false;
  return true;
}

export function overlaps(shapeA, shapeB) {
  const a = computeBounds(shapeA);
  const b = computeBounds(shapeB);
  const aXEnd = addRational(a.x, a.width);
  const aYEnd = addRational(a.y, a.height);
  const bXEnd = addRational(b.x, b.width);
  const bYEnd = addRational(b.y, b.height);

  if (compareRational(aXEnd, b.x) <= 0 || compareRational(bXEnd, a.x) <= 0) return false;
  if (compareRational(aYEnd, b.y) <= 0 || compareRational(bYEnd, a.y) <= 0) return false;
  return true;
}

export const resolveAnchor = getAnchor;

export function assertGeometricCondition(condition, { message = 'Geometric assertion failed', span = null, context: _context = {} } = {}) {
  if (!condition) {
    const diag = v2Diagnostic({
      code: GEOM_CODES.ASSERTION_FAILED,
      phase: 'GEOMETRY',
      message,
      span: span || { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
      expected: ['true'],
      received: ['false'],
    });
    const err = Object.assign(new Error(message), { diagnostic: diag });
    throw err;
  }
}
