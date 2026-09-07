import {
  makeRational,
  addRational,
  subRational,
  mulRational,
  compareRational,
} from './scdl-v2.rational.js';
import { computeBounds } from './scdl-v2.geometry.js';
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

  if (targetShape.kind === 'RECT' || targetShape.kind === 'ROUNDED_RECT') {
    return Object.freeze({
      ...targetShape,
      origin: Object.freeze({
        x: addRational(targetShape.origin.x, dx),
        y: addRational(targetShape.origin.y, dy),
      }),
    });
  }

  if (targetShape.kind === 'CIRCLE' || targetShape.kind === 'RING' || targetShape.kind === 'ELLIPSE') {
    return Object.freeze({
      ...targetShape,
      center: Object.freeze({
        x: addRational(targetShape.center.x, dx),
        y: addRational(targetShape.center.y, dy),
      }),
    });
  }

  return Object.freeze({
    ...targetShape,
    alignedOffset: Object.freeze({ dx, dy }),
  });
}

export function isInside(point, shapeOrRect) {
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

export function contains(container, contained) {
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
