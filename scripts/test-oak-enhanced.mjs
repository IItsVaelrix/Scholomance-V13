import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { perlinNoiseGrid } from '../codex/core/pixelbrain/procedural-noise.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const W = 48, H = 64;
const CX = 24;

// ── 8-Stop Botanical Oak Foliage Palette (Warm sunlit tips -> Rich Emerald -> Cool Deep Pine Shadow) ──
const PAL = {
  // Canopy: Hue-shifted from golden lime (sunlight) to deep teal-abyss (crevices)
  c7: '#A2E84A', // Sun specular glint
  c6: '#6EC83C', // Lit leaf highlights
  c5: '#44A832', // Lit body
  c4: '#288828', // Midtone foliage
  c3: '#186424', // Base body shadow
  c2: '#0E481C', // Dark under-clump
  c1: '#0A3014', // Deep crevice
  c0: '#04180A', // Ambient occlusion pocket

  // Trunk & Bark (Warm Russet & Cedar Oak)
  t4: '#A66E38', // Lit bark ridge highlight
  t3: '#7E4C20', // Lit face
  t2: '#583212', // Mid bark
  t1: '#3A1E0A', // Shadow face
  t0: '#200E04', // Deep fissure crack

  // Roots
  r2: '#502C0E',
  r1: '#341A08',
  r0: '#1C0C04',

  // Ground Shadow
  ao: '#030806',
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
function clampF(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

const noiseCoarse = perlinNoiseGrid(W, H, { seed: 'bot-oak-c1', scale: 0.16, octaves: 3, persistence: 0.55, lacunarity: 2.1 });
const noiseFine   = perlinNoiseGrid(W, H, { seed: 'bot-oak-f1', scale: 0.38, octaves: 2, persistence: 0.6,  lacunarity: 2.2 });
const noiseEdge   = perlinNoiseGrid(W, H, { seed: 'bot-oak-e1', scale: 0.52, octaves: 2, persistence: 0.5,  lacunarity: 2.0 });

function nc(x, y) { return noiseCoarse.values[clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function nf(x, y) { return noiseFine.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function ne(x, y) { return noiseEdge.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }

// Layer buffers
const layers = {
  ground_shadow: Array.from({ length: H }, () => Array(W).fill(null)),
  roots_and_ground: Array.from({ length: H }, () => Array(W).fill(null)),
  trunk: Array.from({ length: H }, () => Array(W).fill(null)),
  primary_branches: Array.from({ length: H }, () => Array(W).fill(null)),
  secondary_branches: Array.from({ length: H }, () => Array(W).fill(null)),
  canopy_masses: Array.from({ length: H }, () => Array(W).fill(null)),
  foliage_edges: Array.from({ length: H }, () => Array(W).fill(null)),
  surface_detail: Array.from({ length: H }, () => Array(W).fill(null)),
  highlights: Array.from({ length: H }, () => Array(W).fill(null)),
};

function put(layerName, x, y, col) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  layers[layerName][y][x] = col;
}

// ── 1. Ground AO ─────────────────────────────────────────────────────────────
const groundY = 56;
for (let dx = -16; dx <= 16; dx++) {
  const d = Math.abs(dx) / 16;
  const fade = 1 - d * d;
  if (fade > 0.08) {
    put('ground_shadow', CX + dx, groundY, PAL.ao);
    if (Math.abs(dx) < 12) put('ground_shadow', CX + dx, groundY + 1, PAL.ao);
    if (Math.abs(dx) < 6)  put('ground_shadow', CX + dx, groundY + 2, PAL.ao);
  }
}

// ── 2. Roots and Ground ──────────────────────────────────────────────────────
const rootDefs = [
  { sx: CX - 3, sy: groundY - 5, ex: CX - 13, ey: groundY + 1, w: 2 },
  { sx: CX + 3, sy: groundY - 5, ex: CX + 13, ey: groundY + 1, w: 2 },
  { sx: CX - 1, sy: groundY - 3, ex: CX - 6,  ey: groundY + 2, w: 1 },
  { sx: CX + 1, sy: groundY - 3, ex: CX + 6,  ey: groundY + 2, w: 1 },
];
for (const r of rootDefs) {
  const steps = 14;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(r.sx + (r.ex - r.sx) * t);
    const y = Math.round(r.sy + (r.ey - r.sy) * t);
    const col = t < 0.35 ? PAL.r2 : t < 0.7 ? PAL.r1 : PAL.r0;
    put('roots_and_ground', x, y, col);
    if (r.w > 1 && t < 0.6) put('roots_and_ground', x, y + 1, PAL.r0);
  }
}

// ── 3. Trunk Column ──────────────────────────────────────────────────────────
const trunkTopY = 24;
for (let y = trunkTopY; y <= groundY - 3; y++) {
  const t = (y - trunkTopY) / (groundY - 3 - trunkTopY);
  // Muscular base flare
  const flare = t > 0.6 ? Math.round(Math.pow((t - 0.6) / 0.4, 2) * 5) : 0;
  const hw = 4 + flare;

  for (let x = CX - hw; x <= CX + hw; x++) {
    const u = (x - (CX - hw)) / Math.max(1, hw * 2); // 0=left shadow, 1=right lit
    const grain = nf(x * 2.5, y * 0.6); // fine vertical grain

    let col;
    if (x === CX - hw) {
      col = PAL.t0; // hard shadow edge
    } else if (x === CX - hw + 1) {
      col = PAL.t1;
    } else if (x === CX + hw) {
      col = PAL.t4; // rim highlight
    } else if (x === CX + hw - 1) {
      col = PAL.t3;
    } else {
      // Body shading with vertical bark fissures
      if (grain < 0.20) {
        col = PAL.t0;
        put('surface_detail', x, y, PAL.t0);
      } else if (grain > 0.72 && u > 0.35) {
        col = PAL.t4;
        put('surface_detail', x, y, PAL.t4);
      } else if (u < 0.38) {
        col = ((x & 1) ^ (y & 1)) && u > 0.28 ? PAL.t2 : PAL.t1;
      } else {
        col = ((x & 1) ^ (y & 1)) && u < 0.52 ? PAL.t2 : PAL.t3;
      }
    }
    put('trunk', x, y, col);
  }
}

// ── 4. Scaffold Primary Branches ─────────────────────────────────────────────
const branchDefs = [
  { sx: CX - 2, sy: 31, ex: CX - 14, ey: 22, col: PAL.t1, w: 2 },
  { sx: CX + 2, sy: 31, ex: CX + 14, ey: 22, col: PAL.t3, w: 2 },
  { sx: CX - 1, sy: 26, ex: CX - 9,  ey: 16, col: PAL.t2, w: 2 },
  { sx: CX + 1, sy: 26, ex: CX + 9,  ey: 16, col: PAL.t3, w: 2 },
  { sx: CX,     sy: 24, ex: CX - 2,  ey: 13, col: PAL.t2, w: 1 },
  { sx: CX + 1, sy: 24, ex: CX + 3,  ey: 13, col: PAL.t3, w: 1 },
];
for (const b of branchDefs) {
  const steps = 18;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(b.sx + (b.ex - b.sx) * t);
    const y = Math.round(b.sy + (b.ey - b.sy) * t);
    put('primary_branches', x, y, b.col);
    if (b.w > 1) {
      put('primary_branches', x, y + 1, PAL.t0);
      put('primary_branches', x + 1, y, b.col === PAL.t1 ? PAL.t1 : PAL.t4);
    }
  }
}

// ── 5. Secondary Twigs ───────────────────────────────────────────────────────
const twigDefs = [
  { sx: CX - 14, sy: 22, ex: CX - 18, ey: 20, col: PAL.t2 },
  { sx: CX + 14, sy: 22, ex: CX + 18, ey: 20, col: PAL.t3 },
  { sx: CX - 9,  sy: 16, ex: CX - 13, ey: 12, col: PAL.t2 },
  { sx: CX + 9,  sy: 16, ex: CX + 13, ey: 12, col: PAL.t4 },
];
for (const tw of twigDefs) {
  const steps = 8;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(tw.sx + (tw.ex - tw.sx) * t);
    const y = Math.round(tw.sy + (tw.ey - tw.sy) * t);
    put('secondary_branches', x, y, tw.col);
  }
}

// ── 6. Oak Foliage Masses (7 Distinct Volumetric Cloud Billows) ───────────────
const CLUSTERS = [
  // Low boughs (wide lateral reach, heavy shadow underside)
  { cx: CX - 13, cy: 26, rx: 8,  ry: 6,  ao: 0.35, key: 'bough_L' },
  { cx: CX + 13, cy: 26, rx: 8,  ry: 6,  ao: 0.30, key: 'bough_R' },
  // Mid canopy shelves
  { cx: CX - 9,  cy: 19, rx: 10, ry: 7,  ao: 0.20, key: 'mid_L' },
  { cx: CX + 9,  cy: 19, rx: 10, ry: 7,  ao: 0.15, key: 'mid_R' },
  { cx: CX,      cy: 22, rx: 9,  ry: 7,  ao: 0.25, key: 'mid_C' },
  // Upper crown billows
  { cx: CX - 5,  cy: 12, rx: 8,  ry: 6,  ao: 0.10, key: 'top_L' },
  { cx: CX + 5,  cy: 12, rx: 8,  ry: 6,  ao: 0.05, key: 'top_R' },
  { cx: CX,      cy: 8,  rx: 7,  ry: 5,  ao: 0.00, key: 'apex' },
];

for (const cl of CLUSTERS) {
  const { cx, cy, rx, ry, ao } = cl;

  for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
    for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;

      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = Math.hypot(dx, dy);

      // Organic edge perturbation using fine noise
      const edgeJitter = (ne(x * 2.8, y * 2.8) - 0.5) * 0.42;
      const perturbedDist = dist + edgeJitter;

      if (perturbedDist > 1.05) continue; // outside this clump

      // Negative space: occasional small sky notch inside dense clusters
      const holeNoise = nf(x * 1.5, y * 1.5);
      if (holeNoise < 0.12 && perturbedDist > 0.45 && perturbedDist < 0.85) {
        continue; // negative space foliage break!
      }

      // Local spherical volume lighting
      // Key light is upper-left: [-0.60, -0.80]
      const localDot = dx * (-0.60) + dy * (-0.80);

      // Dual-octave leaf cluster noise: forms distinct pixel clumps!
      const cN = nc(x, y);
      const fN = nf(x, y);
      const leafClusterNoise = (cN - 0.5) * 0.30 + (fN - 0.5) * 0.16;

      // Combined light value
      const light = clampF(
        0.50
        + localDot * 0.36
        - ao
        + leafClusterNoise,
        0, 1
      );

      // Bayer 2x2 ordered dither at value transitions
      const dither = ((x & 1) ^ (y & 1));
      let col;
      if (light > 0.84) {
        col = dither ? PAL.c7 : PAL.c6;
      } else if (light > 0.68) {
        col = (light < 0.72 && dither) ? PAL.c5 : PAL.c6;
      } else if (light > 0.52) {
        col = (light < 0.56 && dither) ? PAL.c4 : PAL.c5;
      } else if (light > 0.36) {
        col = (light < 0.40 && dither) ? PAL.c3 : PAL.c4;
      } else if (light > 0.22) {
        col = (light < 0.26 && dither) ? PAL.c2 : PAL.c3;
      } else if (light > 0.10) {
        col = (light < 0.14 && dither) ? PAL.c1 : PAL.c2;
      } else {
        col = PAL.c0;
      }

      // Is this pixel on the perimeter edge of this cluster?
      const isEdge = perturbedDist > 0.86;
      let targetLayer = 'canopy_masses';

      if (isEdge) {
        targetLayer = 'foliage_edges';
        // Selective outline (selout)
        if (localDot < -0.25) col = PAL.c1; // dark outline on shadow side
        else if (localDot > 0.35) col = PAL.c6; // bright rim on lit side
      } else if (light > 0.84) {
        targetLayer = 'highlights';
      }

      put(targetLayer, x, y, col);
    }
  }
}

// ── 7. Leaf Notch Fringe Pixels (1-2px organic tufts) ────────────────────────
for (const cl of CLUSTERS) {
  const numTufts = 6;
  for (let k = 0; k < numTufts; k++) {
    const angle = (k / numTufts) * Math.PI * 2 + (nc(cl.cx + k, cl.cy) - 0.5);
    const px = Math.round(cl.cx + Math.cos(angle) * (cl.rx + 1));
    const py = Math.round(cl.cy + Math.sin(angle) * (cl.ry + 1));
    if (px >= 0 && px < W && py >= 0 && py < H && !layers.canopy_masses[py][px]) {
      const isLit = Math.cos(angle) < 0 || Math.sin(angle) < 0;
      put('foliage_edges', px, py, isLit ? PAL.c6 : PAL.c2);
    }
  }
}

// ── 8. Specular Glints ───────────────────────────────────────────────────────
put('highlights', CX - 1, 6, PAL.c7);
put('highlights', CX,     5, PAL.c7);
put('highlights', CX + 1, 6, PAL.c6);
put('highlights', CX - 8, 14, PAL.c7);
put('highlights', CX + 6, 14, PAL.c7);

// ── Composite Final RGBA Buffer ──────────────────────────────────────────────
// Render in strict semantic layer order
const LAYER_ORDER = [
  'ground_shadow',
  'roots_and_ground',
  'trunk',
  'primary_branches',
  'secondary_branches',
  'canopy_masses',
  'foliage_edges',
  'surface_detail',
  'highlights',
];

const composite = Array.from({ length: H }, () => Array(W).fill(null));
for (const layerId of LAYER_ORDER) {
  const buf = layers[layerId];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (buf[y][x]) composite[y][x] = buf[y][x];
    }
  }
}

const rgba1x = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const colHex = composite[y][x];
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
writeFileSync('output/test-botanical/oak-enhanced-1x.png', png1x);
writeFileSync('output/test-botanical/oak-enhanced-8x.png', png8x);

console.log('✓ Emitted output/test-botanical/oak-enhanced-1x.png');
console.log('✓ Emitted output/test-botanical/oak-enhanced-8x.png');
