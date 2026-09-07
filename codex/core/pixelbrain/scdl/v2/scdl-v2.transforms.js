import {
  makeRational,
  parseRational,
  addRational,
  subRational,
  mulRational,
  divRational,
} from './scdl-v2.rational.js';

function toRational(val) {
  if (val && typeof val === 'object' && 'numerator' in val && 'denominator' in val) {
    return val;
  }
  if (val && typeof val === 'object' && 'value' in val) {
    return toRational(val.value);
  }
  if (typeof val === 'number' && !Number.isInteger(val)) {
    return parseRational(val.toString());
  }
  if (typeof val === 'string' && val.includes('.')) {
    return parseRational(val);
  }
  return makeRational(val);
}

const R_0 = makeRational(0);
const R_1 = makeRational(1);
const R_NEG_1 = makeRational(-1);
// sqrt(2)/2 high precision rational representation for exact octants
const R_SQRT2_OVER_2 = makeRational(7071067811865475n, 10000000000000000n);
const R_NEG_SQRT2_OVER_2 = makeRational(-7071067811865475n, 10000000000000000n);

export function createAngle(value, unit = 'DEGREES') {
  const rVal = toRational(value);
  let turns;
  const u = String(unit).toUpperCase();
  if (u === 'DEGREES') {
    turns = divRational(rVal, makeRational(360));
  } else if (u === 'TURNS') {
    turns = rVal;
  } else if (u === 'RADIANS') {
    // 2 * PI ~ 6283185307 / 1000000000
    const twoPi = makeRational(6283185307179586n, 1000000000000000n);
    turns = divRational(rVal, twoPi);
  } else {
    throw new TypeError(`Unknown angle unit '${unit}'`);
  }

  // Normalize turns to [0, 1)
  let n = BigInt(turns.numerator);
  const d = BigInt(turns.denominator);
  n = ((n % d) + d) % d;
  const normTurns = makeRational(n, d);

  return Object.freeze({
    kind: 'ANGLE',
    unit: u,
    raw: rVal,
    turns: normTurns,
  });
}

export function angleToTurns(angle) {
  return angle.turns;
}

export function exactSinCos(angle) {
  const t = angle.turns;
  const n = BigInt(t.numerator);
  const d = BigInt(t.denominator);

  // Check cardinal angles:
  // 0 turns: (n/d == 0)
  if (n === 0n) {
    return Object.freeze({ sin: R_0, cos: R_1 });
  }
  // 1/4 turns (90 deg): n*4 == d
  if (n * 4n === d) {
    return Object.freeze({ sin: R_1, cos: R_0 });
  }
  // 1/2 turns (180 deg): n*2 == d
  if (n * 2n === d) {
    return Object.freeze({ sin: R_0, cos: R_NEG_1 });
  }
  // 3/4 turns (270 deg): n*4 == d*3
  if (n * 4n === d * 3n) {
    return Object.freeze({ sin: R_NEG_1, cos: R_0 });
  }

  // Check 45-degree octants:
  // 1/8 turns (45 deg): n*8 == d
  if (n * 8n === d) {
    return Object.freeze({ sin: R_SQRT2_OVER_2, cos: R_SQRT2_OVER_2 });
  }
  // 3/8 turns (135 deg): n*8 == d*3
  if (n * 8n === d * 3n) {
    return Object.freeze({ sin: R_SQRT2_OVER_2, cos: R_NEG_SQRT2_OVER_2 });
  }
  // 5/8 turns (225 deg): n*8 == d*5
  if (n * 8n === d * 5n) {
    return Object.freeze({ sin: R_NEG_SQRT2_OVER_2, cos: R_NEG_SQRT2_OVER_2 });
  }
  // 7/8 turns (315 deg): n*8 == d*7
  if (n * 8n === d * 7n) {
    return Object.freeze({ sin: R_NEG_SQRT2_OVER_2, cos: R_SQRT2_OVER_2 });
  }

  // General angles: deterministic rational approximation
  const rad = (Number(n) / Number(d)) * 2 * Math.PI;
  const sinFloat = Math.sin(rad);
  const cosFloat = Math.cos(rad);
  const SCALE = 1000000000n;
  const sinR = makeRational(BigInt(Math.round(sinFloat * 1000000000)), SCALE);
  const cosR = makeRational(BigInt(Math.round(cosFloat * 1000000000)), SCALE);
  return Object.freeze({ sin: sinR, cos: cosR });
}

export function createTransformMatrix(a, c, tx, b, d, ty) {
  return Object.freeze({
    kind: 'TRANSFORM',
    a: toRational(a),
    c: toRational(c),
    tx: toRational(tx),
    b: toRational(b),
    d: toRational(d),
    ty: toRational(ty),
  });
}

export function identityTransform() {
  return createTransformMatrix(R_1, R_0, R_0, R_0, R_1, R_0);
}

export function translateTransform(offset) {
  return createTransformMatrix(R_1, R_0, toRational(offset.x), R_0, R_1, toRational(offset.y));
}

export function scaleTransform(factorX, factorY = factorX, pivot = null) {
  const sx = toRational(factorX);
  const sy = toRational(factorY);
  const m = createTransformMatrix(sx, R_0, R_0, R_0, sy, R_0);
  if (pivot && (BigInt(toRational(pivot.x).numerator) !== 0n || BigInt(toRational(pivot.y).numerator) !== 0n)) {
    const p = { x: toRational(pivot.x), y: toRational(pivot.y) };
    const negP = { x: mulRational(p.x, R_NEG_1), y: mulRational(p.y, R_NEG_1) };
    return composeTransforms(translateTransform(p), composeTransforms(m, translateTransform(negP)));
  }
  return m;
}

export function rotateTransform(angle, pivot = null) {
  const { sin, cos } = exactSinCos(angle);
  const negSin = mulRational(sin, R_NEG_1);
  const rot = createTransformMatrix(cos, negSin, R_0, sin, cos, R_0);
  if (pivot && (BigInt(toRational(pivot.x).numerator) !== 0n || BigInt(toRational(pivot.y).numerator) !== 0n)) {
    const p = { x: toRational(pivot.x), y: toRational(pivot.y) };
    const negP = { x: mulRational(p.x, R_NEG_1), y: mulRational(p.y, R_NEG_1) };
    return composeTransforms(translateTransform(p), composeTransforms(rot, translateTransform(negP)));
  }
  return rot;
}

export function composeTransforms(t1, t2) {
  // [a, c, tx]   [a2, c2, tx2]
  // [b, d, ty] * [b2, d2, ty2]
  const a = addRational(mulRational(t1.a, t2.a), mulRational(t1.c, t2.b));
  const c = addRational(mulRational(t1.a, t2.c), mulRational(t1.c, t2.d));
  const tx = addRational(addRational(mulRational(t1.a, t2.tx), mulRational(t1.c, t2.ty)), t1.tx);

  const b = addRational(mulRational(t1.b, t2.a), mulRational(t1.d, t2.b));
  const d = addRational(mulRational(t1.b, t2.c), mulRational(t1.d, t2.d));
  const ty = addRational(addRational(mulRational(t1.b, t2.tx), mulRational(t1.d, t2.ty)), t1.ty);

  return createTransformMatrix(a, c, tx, b, d, ty);
}

export function transformDeterminant(t) {
  return subRational(mulRational(t.a, t.d), mulRational(t.b, t.c));
}

export function invertTransform(t) {
  const det = transformDeterminant(t);
  if (BigInt(det.numerator) === 0n) {
    throw new RangeError('Singular transform matrix is non-invertible (determinant is zero)');
  }
  const invA = divRational(t.d, det);
  const invC = divRational(mulRational(t.c, R_NEG_1), det);
  const invTx = divRational(subRational(mulRational(t.c, t.ty), mulRational(t.d, t.tx)), det);

  const invB = divRational(mulRational(t.b, R_NEG_1), det);
  const invD = divRational(t.a, det);
  const invTy = divRational(subRational(mulRational(t.b, t.tx), mulRational(t.a, t.ty)), det);

  return createTransformMatrix(invA, invC, invTx, invB, invD, invTy);
}

export function applyTransformToPoint(t, pt) {
  const px = toRational(pt.x);
  const py = toRational(pt.y);
  const x = addRational(addRational(mulRational(t.a, px), mulRational(t.c, py)), t.tx);
  const y = addRational(addRational(mulRational(t.b, px), mulRational(t.d, py)), t.ty);
  return Object.freeze({ x, y });
}

export function applyTransformToShape(t, shape) {
  return Object.freeze({
    kind: 'TRANSFORMED_SHAPE',
    shape,
    transform: t,
  });
}

export const createTranslation = translateTransform;
export const createRotation = rotateTransform;
export const createScale = scaleTransform;
export const applyTransformToVec2 = applyTransformToPoint;
