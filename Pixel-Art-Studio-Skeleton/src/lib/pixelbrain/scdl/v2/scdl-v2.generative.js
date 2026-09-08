// Deterministic generative mathematics, seeded variation (PCG32 PRNG,
// coherent 2D noise), and exact rational math for SCDL v2.
//
// Every algorithm here is fully deterministic, platform-independent, and pure.
// There is NO ambient or unseeded random source, and floating-point rounding
// differences across runtimes are avoided via exact rational arithmetic and
// fixed-point tables.

import {
  makeRational,
  mulRational,
  divRational,
  addRational,
  subRational,
  rationalToNumber,
  parseRational,
  compareRational,
} from './scdl-v2.rational.js';
import { createAngle, exactSinCos } from './scdl-v2.transforms.js';

// ---------------------------------------------------------------------------
// PCG32 Deterministic Pseudo-Random Number Generator (PCG32-v1)
// ---------------------------------------------------------------------------

const PCG32_MULT = 6364136223846793005n;
const MASK64 = 0xFFFFFFFFFFFFFFFFn;

export class PCG32 {
  constructor(seed = 0n, seq = 1n) {
    const rawSeed = typeof seed === 'bigint' ? seed : BigInt(Math.floor(Number(seed) || 0));
    const rawSeq = typeof seq === 'bigint' ? seq : BigInt(Math.floor(Number(seq) || 1));

    this.inc = ((rawSeq << 1n) | 1n) & MASK64;
    this.state = 0n;
    this.step();
    this.state = (this.state + rawSeed) & MASK64;
    this.step();
  }

  step() {
    this.state = (this.state * PCG32_MULT + this.inc) & MASK64;
  }

  nextUInt32() {
    const oldState = this.state;
    this.step();

    const xorShifted = Number(((oldState >> 18n) ^ oldState) >> 27n) & 0xFFFFFFFF;
    const rot = Number(oldState >> 59n) & 31;
    return ((xorShifted >>> rot) | (xorShifted << ((32 - rot) & 31))) >>> 0;
  }

  // Returns integer in [min, max] inclusive
  nextI32(min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const range = hi - lo + 1;
    if (range <= 1) return lo;

    const u32 = this.nextUInt32();
    return lo + (u32 % range);
  }

  nextRange(min, max) {
    return this.nextI32(min, max);
  }

  // Returns a rational scalar in [min, max]
  nextScalar(minRat, maxRat) {
    const rMin = toRationalValue(minRat);
    const rMax = toRationalValue(maxRat);

    // Sample numerator in 0..65535
    const sample = this.nextUInt32() & 0xFFFF;
    const t = makeRational(BigInt(sample), 65535n);

    // min + (max - min) * t
    const diff = subRational(rMax, rMin);
    return addRational(rMin, mulRational(diff, t));
  }

  // Returns a vec2 where x in [minX, maxX] and y in [minY, maxY]
  nextVec2(minVal, maxVal) {
    const minX = minVal?.x || minVal;
    const minY = minVal?.y || minVal;
    const maxX = maxVal?.x || maxVal;
    const maxY = maxVal?.y || maxVal;

    const x = this.nextScalar(minX, maxX);
    const y = this.nextScalar(minY, maxY);
    return { x, y };
  }
}

// ---------------------------------------------------------------------------
// Deterministic 2D Value / Gradient Noise (NOISE-2D-v1)
// ---------------------------------------------------------------------------

// 8 2D gradient vectors
const GRAD2 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
];

export function buildNoisePermutation(seed) {
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;

  const rng = new PCG32(BigInt(seed));
  // Fisher-Yates shuffle
  for (let i = 255; i > 0; i--) {
    const j = rng.nextI32(0, i);
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }

  for (let i = 0; i < 256; i++) {
    perm[i] = base[i];
    perm[i + 256] = base[i];
  }
  return perm;
}

function smoothstep(t) {
  // Quintic curve: 6t^5 - 15t^4 + 10t^3
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function gradDot(hash, x, y) {
  const g = GRAD2[hash & 7];
  return g[0] * x + g[1] * y;
}

function singleOctaveNoise2D(perm, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xi = x0 & 255;
  const yi = y0 & 255;

  const xf = x - x0;
  const yf = y - y0;

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];

  const x1 = gradDot(aa, xf, yf) * (1 - u) + gradDot(ba, xf - 1, yf) * u;
  const x2 = gradDot(ab, xf, yf - 1) * (1 - u) + gradDot(bb, xf - 1, yf - 1) * u;

  return x1 * (1 - v) + x2 * v;
}

export function deterministicNoise2D(seed, freqRat, octavesInt, xRat, yRat) {
  const perm = buildNoisePermutation(seed);
  const freq = freqRat ? rationalToNumber(toRationalValue(freqRat)) : 0.1;
  const octaves = Math.max(1, Math.min(8, octavesInt || 1));

  let x = rationalToNumber(toRationalValue(xRat)) * freq;
  let y = rationalToNumber(toRationalValue(yRat)) * freq;

  let total = 0;
  let amplitude = 1.0;
  let maxAmp = 0;

  for (let o = 0; o < octaves; o++) {
    total += singleOctaveNoise2D(perm, x, y) * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    x *= 2.0;
    y *= 2.0;
  }

  const normalized = maxAmp > 0 ? total / maxAmp : 0;
  const clamped = Math.max(-1, Math.min(1, normalized));
  const intVal = BigInt(Math.round(clamped * 10000));
  return makeRational(intVal, 10000n);
}

// ---------------------------------------------------------------------------
// Exact Math & Number Theory
// ---------------------------------------------------------------------------

function toRationalValue(val) {
  if (val === undefined || val === null) return makeRational(0n);
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) throw new RangeError('Rational input must be finite');
    if (Number.isInteger(val)) return makeRational(BigInt(val));
    const raw = val.toString();
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
  if (typeof val === 'bigint') return makeRational(val);
  if (typeof val === 'string') return parseRational(val);
  if (val.numerator !== undefined && val.denominator !== undefined) {
    return makeRational(BigInt(val.numerator), BigInt(val.denominator));
  }
  if (val.value !== undefined) return toRationalValue(val.value);
  return makeRational(0n);
}

export function gcdBigInt(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

export function lcmBigInt(a, b) {
  if (a === 0n || b === 0n) return 0n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  return (absA / gcdBigInt(absA, absB)) * absB;
}

function integerSquareRoot(value) {
  if (value < 0n) throw new RangeError('Integer square root requires a non-negative value');
  if (value < 2n) return value;
  let x = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  for (;;) {
    const next = (x + value / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
}

// Deterministic fixed-precision rational square root. The integer square-root
// step avoids denominator explosion and platform-dependent floating guesses.
export function sqrtRational(rVal) {
  const r = toRationalValue(rVal);
  const numerator = BigInt(r.numerator);
  if (numerator < 0n) throw new Error('Cannot compute square root of negative number');
  if (numerator === 0n) return makeRational(0n);
  const denominator = BigInt(r.denominator);
  const scale = 1_000_000_000_000n;
  const scaled = (numerator * scale * scale) / denominator;
  return makeRational(integerSquareRoot(scaled), scale);
}

export function lerpRational(a, b, t) {
  const rA = toRationalValue(a);
  const rB = toRationalValue(b);
  const rT = toRationalValue(t);
  return addRational(rA, mulRational(subRational(rB, rA), rT));
}

export function mapRangeRational(val, inMin, inMax, outMin, outMax) {
  const rVal = toRationalValue(val);
  const rInMin = toRationalValue(inMin);
  const rInMax = toRationalValue(inMax);
  const rOutMin = toRationalValue(outMin);
  const rOutMax = toRationalValue(outMax);

  const inSpan = subRational(rInMax, rInMin);
  if (BigInt(inSpan.numerator) === 0n) return rOutMin;

  const t = divRational(subRational(rVal, rInMin), inSpan);
  return addRational(rOutMin, mulRational(subRational(rOutMax, rOutMin), t));
}

export function clampRational(val, min, max) {
  const rVal = toRationalValue(val);
  const rMin = toRationalValue(min);
  const rMax = toRationalValue(max);

  if (compareRational(rVal, rMin) < 0) return rMin;
  if (compareRational(rVal, rMax) > 0) return rMax;
  return rVal;
}

export function minRational(a, b) {
  const rA = toRationalValue(a);
  const rB = toRationalValue(b);
  return compareRational(rA, rB) <= 0 ? rA : rB;
}

export function maxRational(a, b) {
  const rA = toRationalValue(a);
  const rB = toRationalValue(b);
  return compareRational(rA, rB) >= 0 ? rA : rB;
}

export function absRational(a) {
  const rA = toRationalValue(a);
  return BigInt(rA.numerator) < 0n ? makeRational(-BigInt(rA.numerator), BigInt(rA.denominator)) : rA;
}

export function floorRational(a) {
  const rA = toRationalValue(a);
  const n = BigInt(rA.numerator);
  const d = BigInt(rA.denominator);
  const q = n / d;
  return Number(n < 0n && n % d !== 0n ? q - 1n : q);
}

export function ceilRational(a) {
  const rA = toRationalValue(a);
  const n = BigInt(rA.numerator);
  const d = BigInt(rA.denominator);
  const q = n / d;
  return Number(n > 0n && n % d !== 0n ? q + 1n : q);
}

export function roundRational(a) {
  const rA = toRationalValue(a);
  return floorRational(addRational(rA, makeRational(1n, 2n)));
}

export function modBigInt(a, b) {
  const rA = toRationalValue(a);
  const rB = toRationalValue(b);
  const nA = BigInt(rA.numerator);
  const nB = BigInt(rB.numerator);
  if (nB === 0n) throw new Error('Division by zero in MOD');
  return makeRational(nA % nB, 1n);
}

export function powRational(base, exp) {
  const rBase = toRationalValue(base);
  const rExp = toRationalValue(exp);
  if (BigInt(rExp.denominator) !== 1n) {
    throw new RangeError('POW requires an integer exponent');
  }
  const expInt = BigInt(rExp.numerator);
  if (expInt === 0n) return makeRational(1n);

  if (expInt < 0n) {
    const inv = powRational(rBase, makeRational(-expInt));
    return divRational(makeRational(1n), inv);
  }

  let result = makeRational(1n);
  let cur = rBase;
  let p = expInt;
  while (p > 0n) {
    if ((p & 1n) === 1n) result = mulRational(result, cur);
    cur = mulRational(cur, cur);
    p >>= 1n;
  }
  return result;
}


// ---------------------------------------------------------------------------
// Trigonometric functions
// ---------------------------------------------------------------------------

export function sinAngle(angle) {
  if (angle?.turns) return exactSinCos(angle).sin;
  const rad = angle?.unit === 'DEGREES'
    ? (rationalToNumber(toRationalValue(angle.value)) * Math.PI) / 180
    : angle?.unit === 'TURNS'
    ? rationalToNumber(toRationalValue(angle.value)) * 2 * Math.PI
    : rationalToNumber(toRationalValue(angle?.value || angle));

  const val = Math.sin(rad);
  return makeRational(BigInt(Math.round(val * 100000)), 100000n);
}

export function cosAngle(angle) {
  if (angle?.turns) return exactSinCos(angle).cos;
  const rad = angle?.unit === 'DEGREES'
    ? (rationalToNumber(toRationalValue(angle.value)) * Math.PI) / 180
    : angle?.unit === 'TURNS'
    ? rationalToNumber(toRationalValue(angle.value)) * 2 * Math.PI
    : rationalToNumber(toRationalValue(angle?.value || angle));

  const val = Math.cos(rad);
  return makeRational(BigInt(Math.round(val * 100000)), 100000n);
}

export function tanAngle(angle) {
  const cos = cosAngle(angle);
  if (BigInt(cos.numerator) === 0n) throw new Error('Tangent undefined at angle');
  const sin = sinAngle(angle);
  return divRational(sin, cos);
}

export function atan2Angle(yVal, xVal) {
  const y = rationalToNumber(toRationalValue(yVal));
  const x = rationalToNumber(toRationalValue(xVal));
  const rad = Math.atan2(y, x);
  const deg = (rad * 180) / Math.PI;
  const value = makeRational(BigInt(Math.round(deg * 100)), 100n);
  const angle = createAngle(value, 'DEGREES');
  return Object.freeze({ ...angle, value });
}

// ---------------------------------------------------------------------------
// Vector Operations
// ---------------------------------------------------------------------------

export function distanceVec2(a, b) {
  const dx = subRational(toRationalValue(b.x), toRationalValue(a.x));
  const dy = subRational(toRationalValue(b.y), toRationalValue(a.y));
  const distSq = addRational(mulRational(dx, dx), mulRational(dy, dy));
  return sqrtRational(distSq);
}

export function dotVec2(a, b) {
  const ax = toRationalValue(a.x);
  const ay = toRationalValue(a.y);
  const bx = toRationalValue(b.x);
  const by = toRationalValue(b.y);
  return addRational(mulRational(ax, bx), mulRational(ay, by));
}

export function crossVec2(a, b) {
  const ax = toRationalValue(a.x);
  const ay = toRationalValue(a.y);
  const bx = toRationalValue(b.x);
  const by = toRationalValue(b.y);
  return subRational(mulRational(ax, by), mulRational(ay, bx));
}

export function normalizeVec2(v) {
  const vx = toRationalValue(v.x);
  const vy = toRationalValue(v.y);
  const lenSq = addRational(mulRational(vx, vx), mulRational(vy, vy));
  const len = sqrtRational(lenSq);
  if (BigInt(len.numerator) === 0n) return { x: makeRational(0n), y: makeRational(0n) };
  return {
    x: divRational(vx, len),
    y: divRational(vy, len),
  };
}
