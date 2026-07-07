/**
 * SCDL 2D affine transforms — the Transform Law (spec §4).
 *
 * Matrix {a,b,c,d,e,f} represents [[a, c, e], [b, d, f]] (SVG convention):
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 *
 * matFromTransform composes T(tx,ty) · R(θ) · Mir · S(sx,sy) — the fixed
 * per-node application order scale → mirror → rotate → translate.
 * θ multiples of 90° use an exact integer table so lattice rotations
 * never carry 6.1e-17 float residue.
 */

export function identity() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

const EXACT_TRIG = new Map([
  [0,   { cos: 1,  sin: 0 }],
  [90,  { cos: 0,  sin: 1 }],
  [180, { cos: -1, sin: 0 }],
  [270, { cos: 0,  sin: -1 }],
]);

function trig(thetaDegrees) {
  const norm = ((thetaDegrees % 360) + 360) % 360;
  const exact = EXACT_TRIG.get(norm);
  if (exact) return exact;
  const rad = (norm * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
}

export function matMul(m1, m2) {
  // Apply m2 first, then m1.
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function matFromTransform(t = {}) {
  const tx = Number(t.tx) || 0;
  const ty = Number(t.ty) || 0;
  const sx = t.sx === undefined ? 1 : Number(t.sx);
  const sy = t.sy === undefined ? sx : Number(t.sy);
  const { cos, sin } = trig(Number(t.theta) || 0);
  const mirror = t.mirror || null;
  const mx = (mirror === 'x' || mirror === 'xy') ? -1 : 1;
  const my = (mirror === 'y' || mirror === 'xy') ? -1 : 1;

  const S   = { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
  const Mir = { a: mx, b: 0, c: 0, d: my, e: 0, f: 0 };
  const R   = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  const T   = { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
  return matMul(T, matMul(R, matMul(Mir, S)));
}

export function matInvert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  const ia = m.d / det;
  const ib = -m.b / det;
  const ic = -m.c / det;
  const id = m.a / det;
  return {
    a: ia, b: ib, c: ic, d: id,
    e: -(ia * m.e + ic * m.f),
    f: -(ib * m.e + id * m.f),
  };
}

export function matApply(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function isIntegerTranslation(m) {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1
    && Number.isInteger(m.e) && Number.isInteger(m.f);
}

export function transformAABB(m, box) {
  const corners = [
    matApply(m, box.minX, box.minY),
    matApply(m, box.maxX, box.minY),
    matApply(m, box.minX, box.maxY),
    matApply(m, box.maxX, box.maxY),
  ];
  return {
    minX: Math.min(...corners.map(c => c[0])),
    minY: Math.min(...corners.map(c => c[1])),
    maxX: Math.max(...corners.map(c => c[0])),
    maxY: Math.max(...corners.map(c => c[1])),
  };
}
