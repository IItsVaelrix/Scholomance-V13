import {
  makeRational,
  addRational,
  subRational,
  mulRational,
  minRational,
  maxRational,
  compareRational,
  parseRational,
} from './scdl-v2.rational.js';
import { createAngle, applyTransformToPoint } from './scdl-v2.transforms.js';

function toRational(val) {
  if (val && typeof val === 'object' && 'numerator' in val && 'denominator' in val) {
    return makeRational(BigInt(val.numerator), BigInt(val.denominator));
  }
  if (val && typeof val === 'object' && 'value' in val) {
    return toRational(val.value);
  }
  return makeRational(val);
}

function numberToRational(value) {
  if (!Number.isFinite(value)) throw new RangeError(`Non-finite geometry coordinate '${value}'`);
  if (Number.isInteger(value)) return makeRational(BigInt(value));
  const raw = value.toString();
  if (!/[eE]/.test(raw)) return parseRational(raw);
  const [mantissa, exponentRaw] = raw.toLowerCase().split('e');
  const exponent = Number(exponentRaw);
  const negative = mantissa.startsWith('-');
  const unsigned = mantissa.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = BigInt(`${whole}${fraction}`);
  const scalePower = exponent - fraction.length;
  const signedDigits = negative ? -digits : digits;
  return scalePower >= 0
    ? makeRational(signedDigits * (10n ** BigInt(scalePower)))
    : makeRational(signedDigits, 10n ** BigInt(-scalePower));
}

function ensurePositive(val, name) {
  const r = toRational(val);
  if (BigInt(r.numerator) <= 0n) {
    throw new RangeError(`${name} must be positive, received ${r.numerator}/${r.denominator}`);
  }
  return r;
}

function ensureNonNegative(val, name) {
  const r = toRational(val);
  if (BigInt(r.numerator) < 0n) {
    throw new RangeError(`${name} cannot be negative, received ${r.numerator}/${r.denominator}`);
  }
  return r;
}

export function createLine({ from, to, width = makeRational(1) }) {
  return Object.freeze({
    kind: 'LINE',
    from: Object.freeze({ x: toRational(from.x), y: toRational(from.y) }),
    to: Object.freeze({ x: toRational(to.x), y: toRational(to.y) }),
    width: ensurePositive(width, 'Line width'),
  });
}

export function createPolyline({ points, closed = false, width = makeRational(1) }) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new RangeError('Polyline requires at least 2 points');
  }
  return Object.freeze({
    kind: 'POLYLINE',
    points: Object.freeze(points.map((p) => Object.freeze({ x: toRational(p.x), y: toRational(p.y) }))),
    closed: Boolean(closed),
    width: ensurePositive(width, 'Polyline width'),
  });
}

export function createRay({ origin, dir, length, width = makeRational(1) }) {
  const rOrigin = Object.freeze({ x: toRational(origin.x), y: toRational(origin.y) });
  const rDir = Object.freeze({ x: toRational(dir.x), y: toRational(dir.y) });
  if (BigInt(rDir.x.numerator) === 0n && BigInt(rDir.y.numerator) === 0n) {
    throw new RangeError('Ray direction cannot be zero');
  }
  return Object.freeze({
    kind: 'RAY',
    origin: rOrigin,
    dir: rDir,
    length: ensurePositive(length, 'Ray length'),
    width: ensurePositive(width, 'Ray width'),
  });
}

export function createCircle({ center, radius }) {
  return Object.freeze({
    kind: 'CIRCLE',
    center: Object.freeze({ x: toRational(center.x), y: toRational(center.y) }),
    radius: ensurePositive(radius, 'Circle radius'),
  });
}

export function createRect({ origin = null, center = null, size }) {
  const w = ensurePositive(size.x ?? size.width, 'Rect width');
  const h = ensurePositive(size.y ?? size.height, 'Rect height');
  let ox, oy;
  if (center) {
    const halfW = makeRational(BigInt(w.numerator), BigInt(w.denominator) * 2n);
    const halfH = makeRational(BigInt(h.numerator), BigInt(h.denominator) * 2n);
    ox = subRational(toRational(center.x), halfW);
    oy = subRational(toRational(center.y), halfH);
  } else if (origin) {
    ox = toRational(origin.x);
    oy = toRational(origin.y);
  } else {
    throw new TypeError('createRect requires origin or center');
  }
  return Object.freeze({
    kind: 'RECT',
    origin: Object.freeze({ x: ox, y: oy }),
    size: Object.freeze({ width: w, height: h }),
  });
}

export function createRoundedRect({ origin = null, center = null, size, cornerRadius }) {
  const base = createRect({ origin, center, size });
  const cr = ensureNonNegative(cornerRadius, 'Corner radius');
  const maxCr = minRational(
    makeRational(BigInt(base.size.width.numerator), BigInt(base.size.width.denominator) * 2n),
    makeRational(BigInt(base.size.height.numerator), BigInt(base.size.height.denominator) * 2n),
  );
  if (compareRational(cr, maxCr) > 0) {
    throw new RangeError(`Corner radius cannot exceed half of rect width or height (max ${maxCr.numerator}/${maxCr.denominator}, received ${cr.numerator}/${cr.denominator})`);
  }
  return Object.freeze({
    kind: 'ROUNDED_RECT',
    origin: base.origin,
    size: base.size,
    cornerRadius: cr,
  });
}

export function createRing({ center, radius = undefined, thickness = undefined, innerRadius = undefined, outerRadius = undefined }) {
  const cx = toRational(center.x);
  const cy = toRational(center.y);
  let inner, outer, rad;
  if (radius !== undefined && thickness !== undefined) {
    rad = ensurePositive(radius, 'Ring radius');
    const th = ensurePositive(thickness, 'Ring thickness');
    const halfTh = makeRational(BigInt(th.numerator), BigInt(th.denominator) * 2n);
    inner = subRational(rad, halfTh);
    outer = addRational(rad, halfTh);
    if (BigInt(inner.numerator) < 0n) inner = makeRational(0);
  } else if (innerRadius !== undefined && outerRadius !== undefined) {
    inner = ensureNonNegative(innerRadius, 'Ring inner radius');
    outer = ensurePositive(outerRadius, 'Ring outer radius');
    if (compareRational(inner, outer) >= 0) {
      throw new RangeError('innerRadius must be less than outerRadius');
    }
    rad = makeRational(
      BigInt(inner.numerator) * BigInt(outer.denominator) + BigInt(outer.numerator) * BigInt(inner.denominator),
      BigInt(inner.denominator) * BigInt(outer.denominator) * 2n,
    );
  } else {
    throw new TypeError('createRing requires radius+thickness or innerRadius+outerRadius');
  }
  return Object.freeze({
    kind: 'RING',
    center: Object.freeze({ x: cx, y: cy }),
    radius: rad,
    innerRadius: inner,
    outerRadius: outer,
  });
}

export function createEllipse({ center, radiusX, radiusY }) {
  return Object.freeze({
    kind: 'ELLIPSE',
    center: Object.freeze({ x: toRational(center.x), y: toRational(center.y) }),
    radiusX: ensurePositive(radiusX, 'Ellipse radiusX'),
    radiusY: ensurePositive(radiusY, 'Ellipse radiusY'),
  });
}

export function createArc({ center, radius, startAngle, endAngle, width = makeRational(1) }) {
  const normStart = (startAngle && startAngle.kind === 'ANGLE') ? startAngle : createAngle(startAngle ?? 0, 'DEGREES');
  const normEnd = (endAngle && endAngle.kind === 'ANGLE') ? endAngle : createAngle(endAngle ?? 360, 'DEGREES');
  return Object.freeze({
    kind: 'ARC',
    center: Object.freeze({ x: toRational(center.x), y: toRational(center.y) }),
    radius: ensurePositive(radius, 'Arc radius'),
    startAngle: normStart,
    endAngle: normEnd,
    width: ensurePositive(width, 'Arc width'),
  });
}

export function createSector({ center, radius, startAngle, endAngle }) {
  const normStart = (startAngle && startAngle.kind === 'ANGLE') ? startAngle : createAngle(startAngle ?? 0, 'DEGREES');
  const normEnd = (endAngle && endAngle.kind === 'ANGLE') ? endAngle : createAngle(endAngle ?? 360, 'DEGREES');
  return Object.freeze({
    kind: 'SECTOR',
    center: Object.freeze({ x: toRational(center.x), y: toRational(center.y) }),
    radius: ensurePositive(radius, 'Sector radius'),
    startAngle: normStart,
    endAngle: normEnd,
  });
}

export function createTriangle({ p1 = null, p2 = null, p3 = null, base = null, height = null }) {
  let v1, v2, v3;
  if (p1 && p2 && p3) {
    v1 = Object.freeze({ x: toRational(p1.x), y: toRational(p1.y) });
    v2 = Object.freeze({ x: toRational(p2.x), y: toRational(p2.y) });
    v3 = Object.freeze({ x: toRational(p3.x), y: toRational(p3.y) });
  } else if (base && height) {
    const b = ensurePositive(base, 'Triangle base');
    const h = ensurePositive(height, 'Triangle height');
    const halfB = makeRational(BigInt(b.numerator), BigInt(b.denominator) * 2n);
    v1 = Object.freeze({ x: makeRational(0), y: h });
    v2 = Object.freeze({ x: b, y: h });
    v3 = Object.freeze({ x: halfB, y: makeRational(0) });
  } else {
    throw new TypeError('createTriangle requires p1, p2, p3 or base, height');
  }
  // Cross product (p2.x - p1.x)*(p3.y - p1.y) - (p2.y - p1.y)*(p3.x - p1.x)
  const dx1 = subRational(v2.x, v1.x);
  const dy1 = subRational(v2.y, v1.y);
  const dx2 = subRational(v3.x, v1.x);
  const dy2 = subRational(v3.y, v1.y);
  const cross = subRational(mulRational(dx1, dy2), mulRational(dy1, dx2));
  if (BigInt(cross.numerator) === 0n) {
    throw new RangeError('Triangle vertices cannot be collinear');
  }
  return Object.freeze({
    kind: 'TRIANGLE',
    p1: v1,
    p2: v2,
    p3: v3,
  });
}

export function createRegularPolygon({ sides, radius, center }) {
  const n = Number(sides);
  if (!Number.isInteger(n) || n < 3) {
    throw new RangeError('Regular polygon sides must be at least 3');
  }
  return Object.freeze({
    kind: 'REGULAR_POLYGON',
    sides: n,
    radius: ensurePositive(radius, 'Regular polygon radius'),
    center: Object.freeze({ x: toRational(center.x), y: toRational(center.y) }),
  });
}

export function createPolygon({ vertices }) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new RangeError('Polygon vertices must contain at least 3 points');
  }
  return Object.freeze({
    kind: 'POLYGON',
    vertices: Object.freeze(vertices.map((v) => Object.freeze({ x: toRational(v.x), y: toRational(v.y) }))),
  });
}

export function createStar({ points, innerRadius, outerRadius, center }) {
  const p = Number(points);
  if (!Number.isInteger(p) || p < 3) {
    throw new RangeError('Star points must be at least 3');
  }
  const inR = ensurePositive(innerRadius, 'Star inner radius');
  const outR = ensurePositive(outerRadius, 'Star outer radius');
  if (compareRational(inR, outR) >= 0) {
    throw new RangeError('innerRadius must be less than outerRadius');
  }
  return Object.freeze({
    kind: 'STAR',
    points: p,
    innerRadius: inR,
    outerRadius: outR,
    center: Object.freeze({ x: toRational(center.x), y: toRational(center.y) }),
  });
}

export function createPath({ d, commands = null, winding = 'NON_ZERO' }) {
  const cmds = commands || (typeof d === 'string' ? parseSVGPath(d) : []);
  return Object.freeze({
    kind: 'PATH',
    d: typeof d === 'string' ? d : '',
    commands: Object.freeze(cmds.map((c) => Object.freeze({ ...c }))),
    winding: winding === 'EVEN_ODD' ? 'EVEN_ODD' : 'NON_ZERO',
  });
}

export function computeBounds(shape) {
  switch (shape.kind) {
    case 'PIXEL':
      return Object.freeze({
        x: shape.at.x,
        y: shape.at.y,
        width: makeRational(1),
        height: makeRational(1),
      });

    case 'LINE': {
      const minX = minRational(shape.from.x, shape.to.x);
      const maxX = maxRational(shape.from.x, shape.to.x);
      const minY = minRational(shape.from.y, shape.to.y);
      const maxY = maxRational(shape.from.y, shape.to.y);
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'POLYLINE': {
      let minX = shape.points[0].x;
      let maxX = shape.points[0].x;
      let minY = shape.points[0].y;
      let maxY = shape.points[0].y;
      for (let i = 1; i < shape.points.length; i++) {
        minX = minRational(minX, shape.points[i].x);
        maxX = maxRational(maxX, shape.points[i].x);
        minY = minRational(minY, shape.points[i].y);
        maxY = maxRational(maxY, shape.points[i].y);
      }
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'RAY': {
      const ox = toRational(shape.origin.x);
      const oy = toRational(shape.origin.y);
      const dxNum = Number(shape.dir.x.numerator) / Number(shape.dir.x.denominator);
      const dyNum = Number(shape.dir.y.numerator) / Number(shape.dir.y.denominator);
      const mag = Math.hypot(dxNum, dyNum);
      const lenNum = Number(shape.length.numerator) / Number(shape.length.denominator);
      const exNum = Number(ox.numerator) / Number(ox.denominator) + (dxNum / mag) * lenNum;
      const eyNum = Number(oy.numerator) / Number(oy.denominator) + (dyNum / mag) * lenNum;
      const ex = numberToRational(exNum);
      const ey = numberToRational(eyNum);
      const minX = minRational(ox, ex);
      const maxX = maxRational(ox, ex);
      const minY = minRational(oy, ey);
      const maxY = maxRational(oy, ey);
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'RECT':
    case 'ROUNDED_RECT': {
      const rx = toRational(shape.origin?.x ?? shape.origin?.value?.x);
      const ry = toRational(shape.origin?.y ?? shape.origin?.value?.y);
      const rw = toRational(shape.size?.width ?? shape.size?.x ?? shape.size?.value?.width);
      const rh = toRational(shape.size?.height ?? shape.size?.y ?? shape.size?.value?.height);
      return Object.freeze({
        x: rx,
        y: ry,
        width: rw,
        height: rh,
      });
    }

    case 'CIRCLE': {
      const cx = toRational(shape.center?.x ?? shape.center?.value?.x);
      const cy = toRational(shape.center?.y ?? shape.center?.value?.y);
      const r = toRational(shape.radius?.value ?? shape.radius);
      const diameter = mulRational(r, makeRational(2));
      return Object.freeze({
        x: subRational(cx, r),
        y: subRational(cy, r),
        width: diameter,
        height: diameter,
      });
    }

    case 'RING': {
      const cx = toRational(shape.center?.x ?? shape.center?.value?.x);
      const cy = toRational(shape.center?.y ?? shape.center?.value?.y);
      const outer = toRational(shape.outerRadius);
      const diameter = mulRational(outer, makeRational(2));
      return Object.freeze({
        x: subRational(cx, outer),
        y: subRational(cy, outer),
        width: diameter,
        height: diameter,
      });
    }

    case 'ELLIPSE': {
      const cx = toRational(shape.center?.x ?? shape.center?.value?.x);
      const cy = toRational(shape.center?.y ?? shape.center?.value?.y);
      const rx = toRational(shape.radiusX);
      const ry = toRational(shape.radiusY);
      return Object.freeze({
        x: subRational(cx, rx),
        y: subRational(cy, ry),
        width: mulRational(rx, makeRational(2)),
        height: mulRational(ry, makeRational(2)),
      });
    }

    case 'REGULAR_POLYGON': {
      const cx = toRational(shape.center?.x ?? shape.center?.value?.x);
      const cy = toRational(shape.center?.y ?? shape.center?.value?.y);
      const r = toRational(shape.radius?.value ?? shape.radius);
      const diameter = mulRational(r, makeRational(2));
      return Object.freeze({
        x: subRational(cx, r),
        y: subRational(cy, r),
        width: diameter,
        height: diameter,
      });
    }

    case 'ARC':
    case 'SECTOR': {
      const cx = toRational(shape.center?.x ?? shape.center?.value?.x);
      const cy = toRational(shape.center?.y ?? shape.center?.value?.y);
      const centerlineRadius = toRational(shape.radius?.value ?? shape.radius);
      const r = shape.kind === 'ARC' && shape.width
        ? addRational(centerlineRadius, makeRational(BigInt(shape.width.numerator), BigInt(shape.width.denominator) * 2n))
        : centerlineRadius;

      const startAngle = shape.startAngle;
      const endAngle = shape.endAngle;
      const startTurns = startAngle?.turns ? Number(startAngle.turns.numerator) / Number(startAngle.turns.denominator) : 0;
      const endTurns = endAngle?.turns ? Number(endAngle.turns.numerator) / Number(endAngle.turns.denominator) : 1;
      const startRad = startTurns * 2 * Math.PI;
      const endRad = endTurns * 2 * Math.PI;

      const rNum = Number(r.numerator) / Number(r.denominator);
      const cxNum = Number(cx.numerator) / Number(cx.denominator);
      const cyNum = Number(cy.numerator) / Number(cy.denominator);

      const pts = [
        { x: cxNum + rNum * Math.cos(startRad), y: cyNum + rNum * Math.sin(startRad) },
        { x: cxNum + rNum * Math.cos(endRad), y: cyNum + rNum * Math.sin(endRad) },
      ];
      if (shape.kind === 'SECTOR') {
        pts.push({ x: cxNum, y: cyNum });
      }

      // Check cardinal extrema: 0, PI/2, PI, 3*PI/2
      const cardinals = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      for (const card of cardinals) {
        if (isAngleInSweep(card, startRad, endRad)) {
          pts.push({ x: cxNum + rNum * Math.cos(card), y: cyNum + rNum * Math.sin(card) });
        }
      }

      let minX = pts[0].x;
      let maxX = pts[0].x;
      let minY = pts[0].y;
      let maxY = pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
      }

      const rx = numberToRational(minX);
      const ry = numberToRational(minY);
      const rw = subRational(numberToRational(maxX), rx);
      const rh = subRational(numberToRational(maxY), ry);
      return Object.freeze({ x: rx, y: ry, width: rw, height: rh });
    }

    case 'STAR': {
      const cx = toRational(shape.center?.x ?? shape.center?.value?.x);
      const cy = toRational(shape.center?.y ?? shape.center?.value?.y);
      const outer = toRational(shape.outerRadius);
      const diameter = mulRational(outer, makeRational(2));
      return Object.freeze({
        x: subRational(cx, outer),
        y: subRational(cy, outer),
        width: diameter,
        height: diameter,
      });
    }

    case 'CSG_SUBTRACT':
      return computeBounds(shape.a);

    case 'CSG_UNION':
    case 'CSG_XOR': {
      const b1 = computeBounds(shape.a);
      const b2 = computeBounds(shape.b);
      const minX = minRational(b1.x, b2.x);
      const minY = minRational(b1.y, b2.y);
      const maxX = maxRational(addRational(b1.x, b1.width), addRational(b2.x, b2.width));
      const maxY = maxRational(addRational(b1.y, b1.height), addRational(b2.y, b2.height));
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'CSG_INTERSECT': {
      const b1 = computeBounds(shape.a);
      const b2 = computeBounds(shape.b);
      const minX = maxRational(b1.x, b2.x);
      const minY = maxRational(b1.y, b2.y);
      const maxX = minRational(addRational(b1.x, b1.width), addRational(b2.x, b2.width));
      const maxY = minRational(addRational(b1.y, b1.height), addRational(b2.y, b2.height));
      const w = compareRational(maxX, minX) > 0 ? subRational(maxX, minX) : makeRational(0);
      const h = compareRational(maxY, minY) > 0 ? subRational(maxY, minY) : makeRational(0);
      return Object.freeze({ x: minX, y: minY, width: w, height: h });
    }

    case 'OUTLINE': {
      const b = computeBounds(shape.shape);
      const w = toRational(shape.width);
      return Object.freeze({
        x: subRational(b.x, w),
        y: subRational(b.y, w),
        width: addRational(b.width, mulRational(w, makeRational(2))),
        height: addRational(b.height, mulRational(w, makeRational(2))),
      });
    }

    case 'TRANSFORMED_SHAPE': {
      const b = computeBounds(shape.shape);
      const c1 = { x: b.x, y: b.y };
      const c2 = { x: addRational(b.x, b.width), y: b.y };
      const c3 = { x: addRational(b.x, b.width), y: addRational(b.y, b.height) };
      const c4 = { x: b.x, y: addRational(b.y, b.height) };
      const tc1 = applyTransformToPoint(shape.transform, c1);
      const tc2 = applyTransformToPoint(shape.transform, c2);
      const tc3 = applyTransformToPoint(shape.transform, c3);
      const tc4 = applyTransformToPoint(shape.transform, c4);
      const minX = minRational(tc1.x, minRational(tc2.x, minRational(tc3.x, tc4.x)));
      const maxX = maxRational(tc1.x, maxRational(tc2.x, maxRational(tc3.x, tc4.x)));
      const minY = minRational(tc1.y, minRational(tc2.y, minRational(tc3.y, tc4.y)));
      const maxY = maxRational(tc1.y, maxRational(tc2.y, maxRational(tc3.y, tc4.y)));
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'TRIANGLE': {
      const minX = minRational(shape.p1.x, minRational(shape.p2.x, shape.p3.x));
      const maxX = maxRational(shape.p1.x, maxRational(shape.p2.x, shape.p3.x));
      const minY = minRational(shape.p1.y, minRational(shape.p2.y, shape.p3.y));
      const maxY = maxRational(shape.p1.y, maxRational(shape.p2.y, shape.p3.y));
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'POLYGON': {
      let minX = shape.vertices[0].x;
      let maxX = shape.vertices[0].x;
      let minY = shape.vertices[0].y;
      let maxY = shape.vertices[0].y;
      for (let i = 1; i < shape.vertices.length; i++) {
        minX = minRational(minX, shape.vertices[i].x);
        maxX = maxRational(maxX, shape.vertices[i].x);
        minY = minRational(minY, shape.vertices[i].y);
        maxY = maxRational(maxY, shape.vertices[i].y);
      }
      return Object.freeze({
        x: minX,
        y: minY,
        width: subRational(maxX, minX),
        height: subRational(maxY, minY),
      });
    }

    case 'PATH': {
      if (!shape.commands || shape.commands.length === 0) {
        return Object.freeze({
          x: makeRational(0),
          y: makeRational(0),
          width: makeRational(0),
          height: makeRational(0),
        });
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      const includePt = (px, py) => {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      };

      let curX = 0;
      let curY = 0;
      let startX = 0;
      let startY = 0;

      for (const cmd of shape.commands) {
        switch (cmd.type) {
          case 'M': {
            includePt(cmd.x, cmd.y);
            curX = cmd.x;
            curY = cmd.y;
            startX = cmd.x;
            startY = cmd.y;
            break;
          }
          case 'L':
          case 'H':
          case 'V': {
            includePt(cmd.x, cmd.y);
            curX = cmd.x;
            curY = cmd.y;
            break;
          }
          case 'Z': {
            includePt(startX, startY);
            curX = startX;
            curY = startY;
            break;
          }
          case 'C':
          case 'S': {
            includePt(curX, curY);
            includePt(cmd.x, cmd.y);
            const xRoots = findCubicBezierExtrema(curX, cmd.x1, cmd.x2, cmd.x);
            for (const t of xRoots) {
              includePt(evalCubicBezier(curX, cmd.x1, cmd.x2, cmd.x, t), evalCubicBezier(curY, cmd.y1, cmd.y2, cmd.y, t));
            }
            const yRoots = findCubicBezierExtrema(curY, cmd.y1, cmd.y2, cmd.y);
            for (const t of yRoots) {
              includePt(evalCubicBezier(curX, cmd.x1, cmd.x2, cmd.x, t), evalCubicBezier(curY, cmd.y1, cmd.y2, cmd.y, t));
            }
            curX = cmd.x;
            curY = cmd.y;
            break;
          }
          case 'Q':
          case 'T': {
            includePt(curX, curY);
            includePt(cmd.x, cmd.y);
            const xRoot = findQuadBezierExtremum(curX, cmd.x1, cmd.x);
            if (xRoot !== null) {
              includePt(evalQuadBezier(curX, cmd.x1, cmd.x, xRoot), evalQuadBezier(curY, cmd.y1, cmd.y, xRoot));
            }
            const yRoot = findQuadBezierExtremum(curY, cmd.y1, cmd.y);
            if (yRoot !== null) {
              includePt(evalQuadBezier(curX, cmd.x1, cmd.x, yRoot), evalQuadBezier(curY, cmd.y1, cmd.y, yRoot));
            }
            curX = cmd.x;
            curY = cmd.y;
            break;
          }
          case 'A': {
            includePt(curX, curY);
            includePt(cmd.x, cmd.y);
            const arcRx = cmd.rx || 0;
            const arcRy = cmd.ry || 0;
            includePt(curX - arcRx, curY - arcRy);
            includePt(curX + arcRx, curY + arcRy);
            includePt(cmd.x - arcRx, cmd.y - arcRy);
            includePt(cmd.x + arcRx, cmd.y + arcRy);
            curX = cmd.x;
            curY = cmd.y;
            break;
          }
          default:
            if ('x' in cmd && 'y' in cmd) {
              includePt(cmd.x, cmd.y);
              curX = cmd.x;
              curY = cmd.y;
            }
            break;
        }
      }

      if (!Number.isFinite(minX)) {
        minX = maxX = minY = maxY = 0;
      }

      const rx = numberToRational(minX);
      const ry = numberToRational(minY);
      const rw = subRational(numberToRational(maxX), rx);
      const rh = subRational(numberToRational(maxY), ry);
      return Object.freeze({ x: rx, y: ry, width: rw, height: rh });
    }

    default:
      throw new TypeError(`computeBounds: unsupported shape kind '${shape.kind}'`);
  }
}

export function isAngleInSweep(angle, start, end) {
  const twoPi = 2 * Math.PI;
  const a = ((angle % twoPi) + twoPi) % twoPi;
  const s = ((start % twoPi) + twoPi) % twoPi;
  const e = ((end % twoPi) + twoPi) % twoPi;
  if (Math.abs(s - e) < 1e-9) return true;
  if (s < e) {
    return a >= s && a <= e;
  }
  return a >= s || a <= e;
}

function findCubicBezierExtrema(p0, p1, p2, p3) {
  const A = -p0 + 3 * p1 - 3 * p2 + p3;
  const B = 2 * (p0 - 2 * p1 + p2);
  const C = p1 - p0;
  const roots = [];
  if (Math.abs(A) < 1e-12) {
    if (Math.abs(B) > 1e-12) {
      const t = -C / B;
      if (t > 0 && t < 1) roots.push(t);
    }
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const t1 = (-B + s) / (2 * A);
      const t2 = (-B - s) / (2 * A);
      if (t1 > 0 && t1 < 1) roots.push(t1);
      if (t2 > 0 && t2 < 1) roots.push(t2);
    }
  }
  return roots;
}

function evalCubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function findQuadBezierExtremum(p0, p1, p2) {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) > 1e-12) {
    const t = (p0 - p1) / denom;
    if (t > 0 && t < 1) return t;
  }
  return null;
}

function evalQuadBezier(p0, p1, p2, t) {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

class SVGPathScanner {
  constructor(d) {
    this.d = typeof d === 'string' ? d : '';
    this.pos = 0;
    this.length = this.d.length;
  }

  skipWhitespaceAndCommas() {
    while (this.pos < this.length) {
      const ch = this.d.charCodeAt(this.pos);
      if (ch === 32 || ch === 9 || ch === 13 || ch === 10 || ch === 44) {
        this.pos++;
      } else {
        break;
      }
    }
  }

  hasMore() {
    this.skipWhitespaceAndCommas();
    return this.pos < this.length;
  }

  peekCommand() {
    this.skipWhitespaceAndCommas();
    if (this.pos >= this.length) return null;
    const ch = this.d[this.pos];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      return ch;
    }
    return null;
  }

  readCommand() {
    this.skipWhitespaceAndCommas();
    if (this.pos >= this.length) return null;
    const ch = this.d[this.pos];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      this.pos++;
      return ch;
    }
    return null;
  }

  readFlag() {
    this.skipWhitespaceAndCommas();
    if (this.pos >= this.length) return null;
    const ch = this.d[this.pos];
    if (ch === '0' || ch === '1') {
      this.pos++;
      return Number(ch);
    }
    return null;
  }

  readNumber() {
    this.skipWhitespaceAndCommas();
    if (this.pos >= this.length) return null;

    const start = this.pos;
    let ch = this.d[this.pos];

    if (ch === '+' || ch === '-') {
      this.pos++;
      if (this.pos < this.length) ch = this.d[this.pos];
    }

    let hasDigits = false;

    while (this.pos < this.length && this.d[this.pos] >= '0' && this.d[this.pos] <= '9') {
      this.pos++;
      hasDigits = true;
    }

    if (this.pos < this.length && this.d[this.pos] === '.') {
      this.pos++;
      while (this.pos < this.length && this.d[this.pos] >= '0' && this.d[this.pos] <= '9') {
        this.pos++;
        hasDigits = true;
      }
    }

    if (!hasDigits) {
      this.pos = start;
      return null;
    }

    if (this.pos < this.length && (this.d[this.pos] === 'e' || this.d[this.pos] === 'E')) {
      const ePos = this.pos;
      this.pos++;
      if (this.pos < this.length && (this.d[this.pos] === '+' || this.d[this.pos] === '-')) {
        this.pos++;
      }
      let expDigits = false;
      while (this.pos < this.length && this.d[this.pos] >= '0' && this.d[this.pos] <= '9') {
        this.pos++;
        expDigits = true;
      }
      if (!expDigits) {
        this.pos = ePos;
      }
    }

    const numStr = this.d.slice(start, this.pos);
    const val = Number(numStr);
    return Number.isFinite(val) ? val : null;
  }
}

/**
 * Parses SVG path data string into canonical command records with absolute coordinates.
 */
export function parseSVGPath(dString) {
  if (typeof dString !== 'string') return [];
  const scanner = new SVGPathScanner(dString);
  const commands = [];

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrlX = 0;
  let lastCtrlY = 0;
  let lastCmdType = '';

  let currentCmd = null;

  while (scanner.hasMore()) {
    const iterationStart = scanner.pos;
    const nextCmd = scanner.peekCommand();
    if (nextCmd) {
      currentCmd = scanner.readCommand();
    } else if (!currentCmd) {
      break;
    }

    const isUpper = currentCmd === currentCmd.toUpperCase();
    const type = currentCmd.toUpperCase();

    switch (type) {
      case 'M': {
        const xVal = scanner.readNumber();
        const yVal = scanner.readNumber();
        if (xVal === null || yVal === null) break;
        const x = isUpper ? xVal : curX + xVal;
        const y = isUpper ? yVal : curY + yVal;
        curX = x;
        curY = y;
        startX = x;
        startY = y;
        commands.push({ type: 'M', x, y });
        lastCmdType = 'M';

        while (scanner.hasMore() && !scanner.peekCommand()) {
          const nx = scanner.readNumber();
          const ny = scanner.readNumber();
          if (nx === null || ny === null) break;
          const lx = isUpper ? nx : curX + nx;
          const ly = isUpper ? ny : curY + ny;
          curX = lx;
          curY = ly;
          commands.push({ type: 'L', x: lx, y: ly });
          lastCmdType = 'L';
        }
        break;
      }

      case 'L': {
        do {
          const xVal = scanner.readNumber();
          const yVal = scanner.readNumber();
          if (xVal === null || yVal === null) break;
          const x = isUpper ? xVal : curX + xVal;
          const y = isUpper ? yVal : curY + yVal;
          curX = x;
          curY = y;
          commands.push({ type: 'L', x, y });
          lastCmdType = 'L';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'H': {
        do {
          const xVal = scanner.readNumber();
          if (xVal === null) break;
          const x = isUpper ? xVal : curX + xVal;
          curX = x;
          commands.push({ type: 'H', x, y: curY });
          lastCmdType = 'H';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'V': {
        do {
          const yVal = scanner.readNumber();
          if (yVal === null) break;
          const y = isUpper ? yVal : curY + yVal;
          curY = y;
          commands.push({ type: 'V', x: curX, y });
          lastCmdType = 'V';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'C': {
        do {
          const x1Val = scanner.readNumber();
          const y1Val = scanner.readNumber();
          const x2Val = scanner.readNumber();
          const y2Val = scanner.readNumber();
          const xVal = scanner.readNumber();
          const yVal = scanner.readNumber();
          if (xVal === null || yVal === null) break;
          const x1 = isUpper ? x1Val : curX + x1Val;
          const y1 = isUpper ? y1Val : curY + y1Val;
          const x2 = isUpper ? x2Val : curX + x2Val;
          const y2 = isUpper ? y2Val : curY + y2Val;
          const x = isUpper ? xVal : curX + xVal;
          const y = isUpper ? yVal : curY + yVal;
          lastCtrlX = x2;
          lastCtrlY = y2;
          curX = x;
          curY = y;
          commands.push({ type: 'C', x1, y1, x2, y2, x, y });
          lastCmdType = 'C';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'S': {
        do {
          const x2Val = scanner.readNumber();
          const y2Val = scanner.readNumber();
          const xVal = scanner.readNumber();
          const yVal = scanner.readNumber();
          if (xVal === null || yVal === null) break;
          const x2 = isUpper ? x2Val : curX + x2Val;
          const y2 = isUpper ? y2Val : curY + y2Val;
          const x = isUpper ? xVal : curX + xVal;
          const y = isUpper ? yVal : curY + yVal;
          let x1 = curX;
          let y1 = curY;
          if (lastCmdType === 'C' || lastCmdType === 'S') {
            x1 = 2 * curX - lastCtrlX;
            y1 = 2 * curY - lastCtrlY;
          }
          lastCtrlX = x2;
          lastCtrlY = y2;
          curX = x;
          curY = y;
          commands.push({ type: 'S', x1, y1, x2, y2, x, y });
          lastCmdType = 'S';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'Q': {
        do {
          const x1Val = scanner.readNumber();
          const y1Val = scanner.readNumber();
          const xVal = scanner.readNumber();
          const yVal = scanner.readNumber();
          if (xVal === null || yVal === null) break;
          const x1 = isUpper ? x1Val : curX + x1Val;
          const y1 = isUpper ? y1Val : curY + y1Val;
          const x = isUpper ? xVal : curX + xVal;
          const y = isUpper ? yVal : curY + yVal;
          lastCtrlX = x1;
          lastCtrlY = y1;
          curX = x;
          curY = y;
          commands.push({ type: 'Q', x1, y1, x, y });
          lastCmdType = 'Q';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'T': {
        do {
          const xVal = scanner.readNumber();
          const yVal = scanner.readNumber();
          if (xVal === null || yVal === null) break;
          const x = isUpper ? xVal : curX + xVal;
          const y = isUpper ? yVal : curY + yVal;
          let x1 = curX;
          let y1 = curY;
          if (lastCmdType === 'Q' || lastCmdType === 'T') {
            x1 = 2 * curX - lastCtrlX;
            y1 = 2 * curY - lastCtrlY;
          }
          lastCtrlX = x1;
          lastCtrlY = y1;
          curX = x;
          curY = y;
          commands.push({ type: 'T', x1, y1, x, y });
          lastCmdType = 'T';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'A': {
        do {
          const rx = scanner.readNumber();
          const ry = scanner.readNumber();
          const xAxisRotation = scanner.readNumber();
          const largeArcFlag = scanner.readFlag();
          const sweepFlag = scanner.readFlag();
          const xVal = scanner.readNumber();
          const yVal = scanner.readNumber();
          if (rx === null || ry === null || xAxisRotation === null || largeArcFlag === null || sweepFlag === null || xVal === null || yVal === null) {
            break;
          }
          const x = isUpper ? xVal : curX + xVal;
          const y = isUpper ? yVal : curY + yVal;
          curX = x;
          curY = y;
          commands.push({
            type: 'A',
            rx: Math.abs(rx),
            ry: Math.abs(ry),
            xAxisRotation,
            largeArcFlag,
            sweepFlag,
            x,
            y,
          });
          lastCmdType = 'A';
        } while (scanner.hasMore() && !scanner.peekCommand());
        break;
      }

      case 'Z': {
        commands.push({ type: 'Z' });
        curX = startX;
        curY = startY;
        lastCmdType = 'Z';
        break;
      }

      default:
        break;
    }

    // A malformed operand must never leave the scanner spinning forever.
    if (scanner.pos === iterationStart) break;
  }

  return commands;
}

function pointsEqual(a, b) {
  return a && b && Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12;
}

function pointLineDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }
  return Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) / Math.hypot(dx, dy);
}

function flattenQuadratic(from, control, to, tolerance, output, depth = 0) {
  if (depth >= 16 || pointLineDistance(control, from, to) <= tolerance) {
    output.push(to);
    return;
  }
  const p01 = { x: (from.x + control.x) / 2, y: (from.y + control.y) / 2 };
  const p12 = { x: (control.x + to.x) / 2, y: (control.y + to.y) / 2 };
  const mid = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 };
  flattenQuadratic(from, p01, mid, tolerance, output, depth + 1);
  flattenQuadratic(mid, p12, to, tolerance, output, depth + 1);
}

function flattenCubic(from, control1, control2, to, tolerance, output, depth = 0) {
  const flatness = Math.max(
    pointLineDistance(control1, from, to),
    pointLineDistance(control2, from, to),
  );
  if (depth >= 16 || flatness <= tolerance) {
    output.push(to);
    return;
  }
  const p01 = { x: (from.x + control1.x) / 2, y: (from.y + control1.y) / 2 };
  const p12 = { x: (control1.x + control2.x) / 2, y: (control1.y + control2.y) / 2 };
  const p23 = { x: (control2.x + to.x) / 2, y: (control2.y + to.y) / 2 };
  const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 };
  const p123 = { x: (p12.x + p23.x) / 2, y: (p12.y + p23.y) / 2 };
  const mid = { x: (p012.x + p123.x) / 2, y: (p012.y + p123.y) / 2 };
  flattenCubic(from, p01, p012, mid, tolerance, output, depth + 1);
  flattenCubic(mid, p123, p23, to, tolerance, output, depth + 1);
}

function vectorAngle(ux, uy, vx, vy) {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

function flattenArc(from, command, tolerance, output) {
  let rx = Math.abs(command.rx);
  let ry = Math.abs(command.ry);
  const to = { x: command.x, y: command.y };
  if (rx === 0 || ry === 0) {
    output.push(to);
    return;
  }
  if (pointsEqual(from, to)) return;

  const phi = (command.xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const halfDx = (from.x - to.x) / 2;
  const halfDy = (from.y - to.y) / 2;
  const xPrime = cosPhi * halfDx + sinPhi * halfDy;
  const yPrime = -sinPhi * halfDx + cosPhi * halfDy;

  const scale = (xPrime * xPrime) / (rx * rx) + (yPrime * yPrime) / (ry * ry);
  if (scale > 1) {
    const factor = Math.sqrt(scale);
    rx *= factor;
    ry *= factor;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const numerator = Math.max(0, rxSq * rySq - rxSq * yPrime * yPrime - rySq * xPrime * xPrime);
  const denominator = rxSq * yPrime * yPrime + rySq * xPrime * xPrime;
  const sign = command.largeArcFlag === command.sweepFlag ? -1 : 1;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);
  const cxPrime = coefficient * ((rx * yPrime) / ry);
  const cyPrime = coefficient * (-(ry * xPrime) / rx);
  const cx = cosPhi * cxPrime - sinPhi * cyPrime + (from.x + to.x) / 2;
  const cy = sinPhi * cxPrime + cosPhi * cyPrime + (from.y + to.y) / 2;

  const ux = (xPrime - cxPrime) / rx;
  const uy = (yPrime - cyPrime) / ry;
  const vx = (-xPrime - cxPrime) / rx;
  const vy = (-yPrime - cyPrime) / ry;
  const start = vectorAngle(1, 0, ux, uy);
  let sweep = vectorAngle(ux, uy, vx, vy);
  if (!command.sweepFlag && sweep > 0) sweep -= 2 * Math.PI;
  if (command.sweepFlag && sweep < 0) sweep += 2 * Math.PI;

  const maxRadius = Math.max(rx, ry);
  const ratio = Math.max(-1, Math.min(1, 1 - tolerance / maxRadius));
  const maxStep = Math.max(1e-6, 2 * Math.acos(ratio));
  const segments = Math.max(1, Math.min(4096, Math.ceil(Math.abs(sweep) / maxStep)));
  for (let i = 1; i <= segments; i++) {
    const theta = start + (sweep * i) / segments;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    output.push({
      x: cx + cosPhi * rx * cosTheta - sinPhi * ry * sinTheta,
      y: cy + sinPhi * rx * cosTheta + cosPhi * ry * sinTheta,
    });
  }
}

/**
 * Flattens canonical SVG commands into independent polylines. Curves use a
 * maximum 0.25px chord-error tolerance by default before lattice rasterization.
 */
export function flattenSVGPath(commandsOrString, tolerance = 0.25) {
  const commands = typeof commandsOrString === 'string'
    ? parseSVGPath(commandsOrString)
    : (commandsOrString || []);
  const safeTolerance = Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0.25;
  const subpaths = [];
  let current = null;
  let start = null;

  const flush = () => {
    if (current?.points.length) subpaths.push(current);
    current = null;
    start = null;
  };

  for (const command of commands) {
    if (command.type === 'M') {
      flush();
      start = { x: command.x, y: command.y };
      current = { points: [start], closed: false };
      continue;
    }
    if (!current) {
      start = { x: 0, y: 0 };
      current = { points: [start], closed: false };
    }
    const from = current.points[current.points.length - 1];
    switch (command.type) {
      case 'L':
      case 'H':
      case 'V':
        current.points.push({ x: command.x, y: command.y });
        break;
      case 'C':
      case 'S':
        flattenCubic(from, { x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 }, { x: command.x, y: command.y }, safeTolerance, current.points);
        break;
      case 'Q':
      case 'T':
        flattenQuadratic(from, { x: command.x1, y: command.y1 }, { x: command.x, y: command.y }, safeTolerance, current.points);
        break;
      case 'A':
        flattenArc(from, command, safeTolerance, current.points);
        break;
      case 'Z':
        if (!pointsEqual(current.points[current.points.length - 1], start)) current.points.push(start);
        current.closed = true;
        flush();
        break;
      default:
        break;
    }
  }
  flush();
  return subpaths.map((subpath) => Object.freeze({
    points: Object.freeze(subpath.points.map((point) => Object.freeze({ ...point }))),
    closed: subpath.closed,
  }));
}

/**
 * Pre-normalizes concatenated SVG arc flags and numbers.
 */
export function normalizeSVGPathString(d) {
  const cmds = parseSVGPath(d);
  if (!cmds || cmds.length === 0) return String(d ?? '');
  return cmds.map((cmd) => {
    switch (cmd.type) {
      case 'M': return `M ${cmd.x} ${cmd.y}`;
      case 'L': return `L ${cmd.x} ${cmd.y}`;
      case 'H': return `H ${cmd.x}`;
      case 'V': return `V ${cmd.y}`;
      case 'C': return `C ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;
      case 'S': return `S ${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;
      case 'Q': return `Q ${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`;
      case 'T': return `T ${cmd.x} ${cmd.y}`;
      case 'A': return `A ${cmd.rx} ${cmd.ry} ${cmd.xAxisRotation} ${cmd.largeArcFlag} ${cmd.sweepFlag} ${cmd.x} ${cmd.y}`;
      case 'Z': return 'Z';
      default: return '';
    }
  }).filter(Boolean).join(' ');
}
