/**
 * Shared Lab lattice preprocessing for perceptual evidence.
 * Contract: docs/superpowers/specs/2026-07-28-perceptual-quality-trio-design.md §5.1
 */

import { quantize6 } from './schema.js';

const ALPHA_OCCUPIED = 0.5;

function srgbChannelToLinear(c) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r, g, b) {
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  x /= 0.95047;
  y /= 1.0;
  z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function parseColor(color) {
  if (!color || typeof color !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
  let hex = color.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function isVixelField(input) {
  return input && Array.isArray(input.vixels);
}

function normalizeCells(input) {
  if (isVixelField(input)) {
    return input.vixels.map((v) => ({
      x: v.x,
      y: v.y,
      color: v.pixel?.color ?? '#000000',
      occupied: true,
      alpha: v.pixel?.alpha !== undefined ? v.pixel.alpha : 1,
      partId: v.pixel?.partId,
      material: v.pixel?.material,
      role: v.feel?.role,
      canonicalRole: v.pixel?.role ?? v.feel?.role,
      emphasis: v.pixel?.emphasis ?? 1,
      z: v.pixel?.z ?? 0,
      pathRef: v.vector?.pathRef,
      salience: v.feel?.salience,
      isBoundary: v.feel?.isBoundary,
      curvature: v.vector?.curvature,
    }));
  }
  const cells = input.cells ?? input.coordinates ?? [];
  return cells.map((c) => ({
    x: c.x,
    y: c.y,
    color: c.color ?? '#000000',
    occupied: c.occupied !== false,
    alpha: c.alpha !== undefined ? c.alpha : 1,
    partId: c.partId,
    material: c.material,
    role: c.role ?? c.semanticRole,
    canonicalRole: c.canonicalRole ?? c.role ?? c.semanticRole,
    emphasis: c.emphasis !== undefined ? c.emphasis : 1,
    z: c.z ?? 0,
    pathRef: c.pathRef,
    salience: c.salience,
    isBoundary: c.isBoundary,
    curvature: c.curvature,
  }));
}

/**
 * Build a Lab lattice from SpatialField or VixelField.
 * @param {object} input
 * @param {{ targetSize?: number }} [options]
 */
export function toLabLattice(input, options = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('PERCEPTUAL_EVIDENCE_INVALID_INPUT: expected SpatialField or VixelField');
  }

  const mode = isVixelField(input) ? 'vixel' : 'spatial';
  const width = Number(input.width ?? input.canvas?.width);
  const height = Number(input.height ?? input.canvas?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('PERCEPTUAL_EVIDENCE_INVALID_INPUT: width/height required');
  }

  const reasons = [];
  let cells = normalizeCells(input);

  // Optional aspect-preserving pad to targetSize (square)
  let outW = width;
  let outH = height;
  if (options.targetSize && Number.isInteger(options.targetSize) && options.targetSize > 0) {
    const scale = Math.min(options.targetSize / width, options.targetSize / height);
    const nw = Math.max(1, Math.round(width * scale));
    const nh = Math.max(1, Math.round(height * scale));
    const padX = Math.floor((options.targetSize - nw) / 2);
    const padY = Math.floor((options.targetSize - nh) / 2);
    cells = cells.map((c) => ({
      ...c,
      x: Math.round(c.x * scale) + padX,
      y: Math.round(c.y * scale) + padY,
    }));
    outW = options.targetSize;
    outH = options.targetSize;
    reasons.push('resampled-targetSize');
  }

  const occupied = [];
  const L = new Float64Array(outW * outH);
  const a = new Float64Array(outW * outH);
  const b = new Float64Array(outW * outH);
  const mask = new Uint8Array(outW * outH);

  for (const cell of cells) {
    if (!cell.occupied) continue;
    if (cell.alpha < ALPHA_OCCUPIED) continue;
    const x = Math.round(cell.x);
    const y = Math.round(cell.y);
    if (x < 0 || y < 0 || x >= outW || y >= outH) continue;
    const { r, g, b: bb, a: alphaFromColor } = parseColor(cell.color);
    const alpha = cell.alpha !== undefined ? cell.alpha : alphaFromColor;
    if (alpha < ALPHA_OCCUPIED) continue;
    const lab = rgbToLab(r, g, bb);
    const idx = y * outW + x;
    L[idx] = lab.L;
    a[idx] = lab.a;
    b[idx] = lab.b;
    mask[idx] = 1;
    occupied.push({
      x,
      y,
      L: quantize6(lab.L),
      a: quantize6(lab.a),
      b: quantize6(lab.b),
      partId: cell.partId,
      material: cell.material,
      canonicalRole: cell.canonicalRole,
      role: cell.role,
      emphasis: cell.emphasis,
      z: cell.z,
      pathRef: cell.pathRef,
      salience: cell.salience,
      isBoundary: cell.isBoundary,
      curvature: cell.curvature,
      color: cell.color,
    });
  }

  occupied.sort((p, q) => (p.y - q.y) || (p.x - q.x));

  let minX = outW; let minY = outH; let maxX = -1; let maxY = -1;
  for (const c of occupied) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  const bbox = occupied.length === 0
    ? Object.freeze({ x: 0, y: 0, w: 0, h: 0 })
    : Object.freeze({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });

  return Object.freeze({
    mode,
    width: outW,
    height: outH,
    occupied: Object.freeze(occupied),
    occupiedCount: occupied.length,
    L,
    a,
    b,
    mask,
    bbox,
    reasons: Object.freeze(reasons),
    preprocessing: Object.freeze({
      colorSpace: 'sRGB→linear→CIELAB',
      alphaOccupiedThreshold: ALPHA_OCCUPIED,
      boundary: 'clamp',
      symmetryOrigin: 'bbox-center',
      precision: 6,
      targetSize: options.targetSize ?? null,
    }),
  });
}

export function deltaE76(lab1, lab2) {
  return Math.hypot(lab1.L - lab2.L, lab1.a - lab2.a, lab1.b - lab2.b);
}
