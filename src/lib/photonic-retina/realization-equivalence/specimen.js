/**
 * Shared specimen normalization + lattice raster helpers for equivalence vessels.
 */

import { contentHash, quantize6 } from './schema.js';

export function isVixelField(input) {
  return input && Array.isArray(input.vixels);
}

export function normalizeSpecimen(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('REALIZATION_EQUIV_INVALID_SPECIMEN');
  }
  if (isVixelField(input)) {
    const cells = input.vixels.map((v) => ({
      x: v.x,
      y: v.y,
      color: v.pixel?.color ?? '#000000',
      partId: v.pixel?.partId ?? null,
      material: v.pixel?.material ?? null,
      pathRef: v.vector?.pathRef ?? null,
      curvature: v.vector?.curvature ?? 0,
      salience: v.feel?.salience ?? 0,
      z: v.pixel?.z ?? 0,
    }));
    return {
      kind: 'vixel',
      id: input.id ?? 'specimen',
      width: input.width,
      height: input.height,
      cells,
      vixelHash: input.vixelHash ?? null,
      provenance: input.provenance ?? null,
    };
  }
  const raw = input.cells ?? input.coordinates ?? [];
  return {
    kind: 'spatial',
    id: input.id ?? 'specimen',
    width: input.width ?? input.canvas?.width,
    height: input.height ?? input.canvas?.height,
    cells: raw.map((c) => ({
      x: c.x,
      y: c.y,
      color: c.color ?? '#000000',
      partId: c.partId ?? null,
      material: c.material ?? null,
      pathRef: c.pathRef ?? null,
      curvature: c.curvature ?? 0,
      salience: c.salience ?? c.emphasis ?? 0,
      z: c.z ?? 0,
    })),
    vixelHash: null,
    provenance: null,
  };
}

export function scaleSpecimen(specimen, scale) {
  const s = Math.max(1, Math.round(scale));
  if (s === 1) return specimen;
  return {
    ...specimen,
    width: specimen.width * s,
    height: specimen.height * s,
    cells: specimen.cells.flatMap((c) => {
      const out = [];
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          out.push({ ...c, x: c.x * s + dx, y: c.y * s + dy });
        }
      }
      return out;
    }),
  };
}

export function parseHex(color) {
  let hex = String(color || '#000000').trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length < 6) return { r: 0, g: 0, b: 0, a: 255 };
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
    a: hex.length >= 8 ? (parseInt(hex.slice(6, 8), 16) || 255) : 255,
  };
}

/** RGBA Uint8ClampedArray + metadata */
export function rasterizeCells(specimen) {
  const { width, height, cells } = specimen;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const partMap = new Array(width * height).fill(null);
  const pathMap = new Array(width * height).fill(null);
  const curvMap = new Float64Array(width * height);
  const salMap = new Float64Array(width * height);

  for (const c of cells) {
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = y * width + x;
    const { r, g, b, a } = parseHex(c.color);
    const o = i * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    partMap[i] = c.partId;
    pathMap[i] = c.pathRef;
    curvMap[i] = c.curvature ?? 0;
    salMap[i] = c.salience ?? 0;
  }

  return {
    width,
    height,
    rgba,
    partMap,
    pathMap,
    curvMap,
    salMap,
    artifactHash: contentHash({
      w: width,
      h: height,
      rgba: Buffer.from(rgba).toString('base64'),
      parts: partMap,
      paths: pathMap,
    }),
  };
}

export function occupiedMask(rgba, w, h) {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
  return mask;
}

export function silhouetteCellIds(mask, w, h) {
  const ids = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) ids.push(`${x},${y}`);
    }
  }
  return ids;
}

export function meanSalienceCenter(salMap, mask, w, h) {
  let m = 0; let mx = 0; let my = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const s = Math.max(0.01, salMap[i] || 0.01);
      m += s; mx += x * s; my += y * s;
    }
  }
  if (m <= 0) return { x: 0.5, y: 0.5 };
  return {
    x: quantize6(mx / m / Math.max(1, w - 1)),
    y: quantize6(my / m / Math.max(1, h - 1)),
  };
}
