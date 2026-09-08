import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { perlinNoiseGrid } from '../codex/core/pixelbrain/procedural-noise.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';
import { TREE_PALETTES } from '../codex/core/pixelbrain/scholomium-ink/families/tree/tree-realization.vocabulary.js';

const W = 48, H = 64;
const CX = 24;
const pal = TREE_PALETTES.verdant_forest;

function seededRng(seed) {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), s | 1)) >>> 0;
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = seededRng(4242);
const noiseCoarse = perlinNoiseGrid(W, H, { seed: 'oak-coarse', scale: 0.18, octaves: 3, persistence: 0.55, lacunarity: 2.1 });
const noiseFine   = perlinNoiseGrid(W, H, { seed: 'oak-fine',   scale: 0.42, octaves: 2, persistence: 0.6,  lacunarity: 2.2 });
const noiseEdge   = perlinNoiseGrid(W, H, { seed: 'oak-edge',   scale: 0.55, octaves: 2, persistence: 0.5,  lacunarity: 2.0 });

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
function clampF(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function nc(x, y) { return noiseCoarse.values[clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function nf(x, y) { return noiseFine.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function ne(x, y) { return noiseEdge.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }

function hexToRgb(hex) {
  const raw = String(hex).replace('#','').padEnd(6,'0');
  return { r: parseInt(raw.slice(0,2),16), g: parseInt(raw.slice(2,4),16), b: parseInt(raw.slice(4,6),16) };
}

function _nearestNeighbourUpscale(rgba, w, h, s) {
  const dw = w * s;
  const out = new Uint8Array(dw * h * s * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (y * w + x) * 4;
      const r = rgba[src], g = rgba[src + 1], b = rgba[src + 2], a = rgba[src + 3];
      for (let dy = 0; dy < s; dy += 1) {
        let dst = ((y * s + dy) * dw + x * s) * 4;
        for (let dx = 0; dx < s; dx += 1) {
          out[dst] = r; out[dst + 1] = g; out[dst + 2] = b; out[dst + 3] = a;
          dst += 4;
        }
      }
    }
  }
  return out;
}

// ── 1. Broadleaf Oak Habit Synthesis ──────────────────────────────────────────
// Oak crown is composed of 8 distinct organic foliage lobes
const OAK_LOBES = [
  // Lower canopy tier (shadowed underneath, wide spread)
  { cx: CX - 12, cy: 30, rx: 9,  ry: 7,  z: 1 },
  { cx: CX + 12, cy: 30, rx: 9,  ry: 7,  z: 1 },
  { cx: CX,      cy: 28, rx: 11, ry: 8,  z: 2 },
  // Mid canopy tier
  { cx: CX - 8,  cy: 21, rx: 10, ry: 8,  z: 3 },
  { cx: CX + 8,  cy: 21, rx: 10, ry: 8,  z: 3 },
  // Upper crown tier
  { cx: CX - 4,  cy: 14, rx: 8,  ry: 7,  z: 4 },
  { cx: CX + 5,  cy: 14, rx: 8,  ry: 7,  z: 4 },
  { cx: CX,      cy: 10, rx: 7,  ry: 6,  z: 5 },
];

// Grid layers: 0=empty, or color hex string
const grid = Array.from({ length: H }, () => Array(W).fill(null));
const layerMap = Array.from({ length: H }, () => Array(W).fill(null));

function setCell(x, y, color, layerId) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  grid[y][x] = color;
  layerMap[y][x] = layerId;
}

// ── Ground AO ────────────────────────────────────────────────────────────────
const groundY = 56;
for (let dx = -18; dx <= 18; dx++) {
  const t = Math.abs(dx) / 18;
  const fade = 1 - t * t;
  if (fade > 0.1) {
    setCell(CX + dx, groundY, pal.shadow_abyss, 'ground_shadow');
    if (Math.abs(dx) < 14) setCell(CX + dx, groundY + 1, pal.shadow_abyss, 'ground_shadow');
    if (Math.abs(dx) < 8) setCell(CX + dx, groundY + 2, pal.shadow_abyss, 'ground_shadow');
  }
}

// ── Roots ────────────────────────────────────────────────────────────────────
const roots = [
  { startX: CX - 4, startY: groundY - 4, endX: CX - 13, endY: groundY + 1, thick: 2 },
  { startX: CX + 4, startY: groundY - 4, endX: CX + 13, endY: groundY + 1, thick: 2 },
  { startX: CX - 1, startY: groundY - 2, endX: CX - 6,  endY: groundY + 2, thick: 1 },
  { startX: CX + 1, startY: groundY - 2, endX: CX + 6,  endY: groundY + 2, thick: 1 },
];
for (const r of roots) {
  const steps = 14;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(r.startX + (r.endX - r.startX) * t);
    const y = Math.round(r.startY + (r.endY - r.startY) * t);
    const col = t < 0.3 ? pal.bark_base : t < 0.7 ? pal.bark_dark : pal.bark_dark;
    setCell(x, y, col, 'roots_and_ground');
    if (r.thick > 1 && t < 0.6) setCell(x, y + 1, pal.bark_dark, 'roots_and_ground');
  }
}

// ── Trunk Column with Root Flare & Bark Fissures ─────────────────────────────
const trunkTopY = 26;
for (let y = trunkTopY; y <= groundY - 2; y++) {
  const t = (y - trunkTopY) / (groundY - 2 - trunkTopY);
  // Muscular root flare
  const flare = t > 0.65 ? Math.round(Math.pow((t - 0.65) / 0.35, 2) * 5) : 0;
  const hw = 4 + flare;

  for (let x = CX - hw; x <= CX + hw; x++) {
    const u = (x - (CX - hw)) / Math.max(1, hw * 2); // 0=left (shadow), 1=right (lit)
    const grain = nf(x * 2, y * 0.5); // vertical bark grain
    const dither = ((x & 1) ^ (y & 1));

    let col;
    if (x === CX - hw || (x === CX - hw + 1 && u < 0.2)) {
      col = pal.bark_dark; // shadow face
    } else if (x === CX + hw || (x === CX + hw - 1 && u > 0.8)) {
      col = pal.bark_lit; // lit edge
    } else {
      // Body shading with vertical furrow crevices
      if (grain < 0.22) {
        col = pal.bark_dark; // deep bark fissure
      } else if (grain > 0.68 && u > 0.45) {
        col = pal.bark_lit; // light-catching bark ridge
      } else if (u < 0.40) {
        col = dither && u > 0.30 ? pal.bark_mid : pal.bark_base;
      } else {
        col = dither && u < 0.55 ? pal.bark_base : pal.bark_mid;
      }
    }
    setCell(x, y, col, grain < 0.22 ? 'surface_detail' : 'trunk');
  }
}

// ── Scaffold Primary Branches ────────────────────────────────────────────────
const branches = [
  { sx: CX - 2, sy: 32, ex: CX - 13, ey: 24, thick: 2, col: pal.bark_base },
  { sx: CX + 2, sy: 32, ex: CX + 13, ey: 24, thick: 2, col: pal.bark_mid },
  { sx: CX,     sy: 28, ex: CX - 7,  ey: 18, thick: 2, col: pal.bark_base },
  { sx: CX + 1, sy: 28, ex: CX + 7,  ey: 18, thick: 2, col: pal.bark_mid },
  { sx: CX,     sy: 24, ex: CX,      ey: 14, thick: 2, col: pal.bark_mid },
];
for (const b of branches) {
  const steps = 18;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(b.sx + (b.ex - b.sx) * t);
    const y = Math.round(b.sy + (b.ey - b.sy) * t);
    setCell(x, y, b.col, 'primary_branches');
    if (b.thick > 1) setCell(x + 1, y, b.col === pal.bark_base ? pal.bark_dark : pal.bark_lit, 'primary_branches');
  }
}

// ── Foliage Lobes Synthesis ──────────────────────────────────────────────────
// Build a coverage map of which pixels belong to which lobe
for (const lobe of OAK_LOBES) {
  const { cx, cy, rx, ry } = lobe;
  for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
    for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      // Elliptical distance with edge noise jag
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = Math.hypot(dx, dy);
      const edgeN = ne(x * 3, y * 3);
      const jaggedDist = dist + (edgeN - 0.5) * 0.45;

      if (jaggedDist > 1.05) continue; // outside lobe

      // Local spherical volumetric lighting (light from top-left: [-0.65, -0.75])
      const localNormX = dx;
      const localNormY = dy;
      const localDot = localNormX * (-0.60) + localNormY * (-0.80);

      // Height AO: lower lobes receive ambient shadow from upper crown
      const crownHeightAO = ((y - 8) / 30) * 0.35;

      // Dual-octave leaf cluster noise (breaks flat bands into crisp foliage clusters!)
      const cNoise = nc(x, y);
      const fNoise = nf(x, y);
      const leafVariation = (cNoise - 0.5) * 0.32 + (fNoise - 0.5) * 0.16;

      const light = clampF(
        0.52
        + localDot * 0.38
        - crownHeightAO
        + leafVariation,
        0, 1
      );

      // Bayer 2x2 dithering at threshold boundaries
      const dither = ((x & 1) ^ (y & 1));
      let col;
      if (light > 0.82) {
        col = dither ? pal.canopy_spec : pal.canopy_hi;
      } else if (light > 0.66) {
        col = (light < 0.70 && dither) ? pal.canopy_lit : pal.canopy_hi;
      } else if (light > 0.50) {
        col = (light < 0.54 && dither) ? pal.canopy_mid : pal.canopy_lit;
      } else if (light > 0.35) {
        col = (light < 0.39 && dither) ? pal.canopy_base : pal.canopy_mid;
      } else if (light > 0.18) {
        col = (light < 0.22 && dither) ? pal.canopy_dark : pal.canopy_base;
      } else {
        col = pal.canopy_dark;
      }

      // Is this on the outer perimeter edge?
      const isEdge = jaggedDist > 0.88;
      const layerId = isEdge ? 'foliage_edges' : (light > 0.82 ? 'highlights' : 'canopy_masses');

      // Selective rim on edge: shadow edge gets dark outline, lit edge gets lit/hi
      if (isEdge) {
        if (localDot < -0.3) col = pal.canopy_dark;
        else if (localDot > 0.4) col = pal.canopy_hi;
      }

      setCell(x, y, col, layerId);
    }
  }
}

// ── Outer Leaf Notch Protrusions (1-2px leaf tufts breaking silhouette) ─────
for (const lobe of OAK_LOBES) {
  const numTufts = 5;
  for (let k = 0; k < numTufts; k++) {
    const angle = (k / numTufts) * Math.PI * 2 + rng() * 0.5;
    const px = Math.round(lobe.cx + Math.cos(angle) * (lobe.rx + 1));
    const py = Math.round(lobe.cy + Math.sin(angle) * (lobe.ry + 1));
    if (px >= 0 && px < W && py >= 0 && py < H && !grid[py][px]) {
      const isLit = Math.cos(angle) < 0 || Math.sin(angle) < 0;
      setCell(px, py, isLit ? pal.canopy_hi : pal.canopy_base, 'foliage_edges');
    }
  }
}

// ── Highlights Pop ───────────────────────────────────────────────────────────
setCell(CX, 8, pal.canopy_spec, 'highlights');
setCell(CX - 1, 9, pal.canopy_spec, 'highlights');
setCell(CX + 1, 9, pal.canopy_hi, 'highlights');

// ── Render Native 1x and 8x Nearest-Neighbour PNGs ───────────────────────────
const rgba1x = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const colHex = grid[y][x];
    if (!colHex) continue;
    const { r, g, b } = hexToRgb(colHex);
    const idx = (y * W + x) * 4;
    rgba1x[idx] = r;
    rgba1x[idx + 1] = g;
    rgba1x[idx + 2] = b;
    rgba1x[idx + 3] = 255;
  }
}

const rgba8x = _nearestNeighbourUpscale(rgba1x, W, H, 8);
const png1x = encodePng(W, H, rgba1x);
const png8x = encodePng(W * 8, H * 8, rgba8x);

mkdirSync('output/test-botanical', { recursive: true });
writeFileSync('output/test-botanical/oak-botanical-1x.png', png1x);
writeFileSync('output/test-botanical/oak-botanical-8x.png', png8x);

console.log('✓ Emitted output/test-botanical/oak-botanical-1x.png');
console.log('✓ Emitted output/test-botanical/oak-botanical-8x.png');
