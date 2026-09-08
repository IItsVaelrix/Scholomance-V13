import { writeFileSync } from 'node:fs';
import { perlinNoiseGrid } from '../codex/core/pixelbrain/procedural-noise.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const W = 48, H = 64;
const CX = 24;

const PAL = {
  c7: '#A2E84A', // Specular sun pop
  c6: '#6EC83C', // Highlight leaf
  c5: '#44A832', // Lit body
  c4: '#288828', // Mid foliage
  c3: '#186424', // Base shadow
  c2: '#0E481C', // Dark under-clump
  c1: '#0A3014', // Deep crevice
  c0: '#04180A', // AO pocket

  t4: '#A66E38', // Lit bark ridge
  t3: '#7E4C20', // Lit face
  t2: '#583212', // Mid bark
  t1: '#3A1E0A', // Shadow face
  t0: '#200E04', // Bark fissure crack

  r2: '#502C0E',
  r1: '#341A08',
  r0: '#1C0C04',
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

const noiseCoarse = perlinNoiseGrid(W, H, { seed: 'oak-v2-c', scale: 0.16, octaves: 3, persistence: 0.55, lacunarity: 2.1 });
const noiseFine   = perlinNoiseGrid(W, H, { seed: 'oak-v2-f', scale: 0.36, octaves: 2, persistence: 0.6,  lacunarity: 2.2 });
const noiseEdge   = perlinNoiseGrid(W, H, { seed: 'oak-v2-e', scale: 0.50, octaves: 2, persistence: 0.5,  lacunarity: 2.0 });

function nc(x, y) { return noiseCoarse.values[clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function nf(x, y) { return noiseFine.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }
function ne(x, y) { return noiseEdge.values  [clamp(y,0,H-1)*W + clamp(x,0,W-1)] ?? 0.5; }

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
const groundY = 58;
for (let dx = -17; dx <= 17; dx++) {
  const d = Math.abs(dx) / 17;
  const fade = 1 - d * d;
  if (fade > 0.05) {
    put('ground_shadow', CX + dx, groundY, PAL.ao);
    if (Math.abs(dx) < 13) put('ground_shadow', CX + dx, groundY + 1, PAL.ao);
    if (Math.abs(dx) < 7)  put('ground_shadow', CX + dx, groundY + 2, PAL.ao);
  }
}

// ── 2. Roots (solid, natural anchoring) ──────────────────────────────────────
const rootSpreads = [
  { startX: CX - 3, startY: groundY - 4, endX: CX - 14, endY: groundY + 1, w: 2 },
  { startX: CX + 3, startY: groundY - 4, endX: CX + 14, endY: groundY + 1, w: 2 },
  { startX: CX - 1, startY: groundY - 3, endX: CX - 7,  endY: groundY + 2, w: 2 },
  { startX: CX + 1, startY: groundY - 3, endX: CX + 7,  endY: groundY + 2, w: 2 },
  { startX: CX,     startY: groundY - 2, endX: CX,      endY: groundY + 1, w: 3 },
];
for (const r of rootSpreads) {
  const steps = 14;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(r.startX + (r.endX - r.startX) * t);
    const y = Math.round(r.startY + (r.endY - r.startY) * t);
    const col = t < 0.4 ? PAL.r2 : t < 0.75 ? PAL.r1 : PAL.r0;
    put('roots_and_ground', x, y, col);
    for (let dw = 1; dw < r.w; dw++) {
      put('roots_and_ground', x + (r.endX < CX ? -dw : dw), y, PAL.r0);
    }
  }
}

// ── 3. Muscular Gnarled Trunk ────────────────────────────────────────────────
const trunkTopY = 32;
for (let y = trunkTopY; y <= groundY - 1; y++) {
  const t = (y - trunkTopY) / (groundY - 1 - trunkTopY);
  // Robust flare reaching outward to the roots
  const flare = t > 0.45 ? Math.round(Math.pow((t - 0.45) / 0.55, 1.8) * 6) : 0;
  const hw = 5 + flare;

  for (let x = CX - hw; x <= CX + hw; x++) {
    const u = (x - (CX - hw)) / Math.max(1, hw * 2); // 0=left, 1=right
    const grain = nf(x * 2.2, y * 0.45); // vertical furrow noise

    let col;
    if (x === CX - hw) {
      col = PAL.t0; // dark contour
    } else if (x === CX - hw + 1) {
      col = PAL.t1;
    } else if (x === CX + hw) {
      col = PAL.t4; // lit contour
    } else if (x === CX + hw - 1) {
      col = PAL.t3;
    } else {
      // Body shading with vertical bark fissures
      if (grain < 0.22) {
        col = PAL.t0; // deep crack
        put('surface_detail', x, y, PAL.t0);
      } else if (grain > 0.70 && u > 0.35) {
        col = PAL.t4; // raised ridge
        put('surface_detail', x, y, PAL.t4);
      } else if (u < 0.35) {
        col = PAL.t1;
      } else if (u < 0.65) {
        col = PAL.t2;
      } else {
        col = PAL.t3;
      }
    }
    put('trunk', x, y, col);
  }
}

// Fill any root base gap so it's a solid, heavy wooden anchor
for (let y = groundY - 4; y <= groundY; y++) {
  for (let x = CX - 7; x <= CX + 7; x++) {
    if (!layers.trunk[y][x] && !layers.roots_and_ground[y][x]) {
      put('roots_and_ground', x, y, PAL.r1);
    }
  }
}

// ── 4. Heavy Scaffold Primary Branches ───────────────────────────────────────
const scaffoldBranches = [
  // Left heavy bough
  { sx: CX - 3, sy: 36, ex: CX - 15, ey: 26, col: PAL.t1, w: 3 },
  // Right heavy bough
  { sx: CX + 3, sy: 36, ex: CX + 15, ey: 26, col: PAL.t3, w: 3 },
  // Center-left ascending limb
  { sx: CX - 1, sy: 32, ex: CX - 9,  ey: 18, col: PAL.t2, w: 2 },
  // Center-right ascending limb
  { sx: CX + 1, sy: 32, ex: CX + 9,  ey: 18, col: PAL.t3, w: 2 },
  // Vertical crown pillar
  { sx: CX,     sy: 30, ex: CX,      ey: 14, col: PAL.t2, w: 2 },
];
for (const b of scaffoldBranches) {
  const steps = 20;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(b.sx + (b.ex - b.sx) * t);
    const y = Math.round(b.sy + (b.ey - b.sy) * t);
    put('primary_branches', x, y, b.col);
    for (let dw = 1; dw < b.w; dw++) {
      put('primary_branches', x, y + dw, PAL.t0);
      put('primary_branches', x + (b.ex < CX ? -dw : dw), y, b.col === PAL.t1 ? PAL.t0 : PAL.t4);
    }
  }
}

// ── 5. Secondary Twig Offshoots ──────────────────────────────────────────────
const secondaryTwigs = [
  { sx: CX - 15, sy: 26, ex: CX - 19, ey: 23, col: PAL.t2 },
  { sx: CX + 15, sy: 26, ex: CX + 19, ey: 23, col: PAL.t3 },
  { sx: CX - 9,  sy: 18, ex: CX - 14, ey: 13, col: PAL.t2 },
  { sx: CX + 9,  sy: 18, ex: CX + 14, ey: 13, col: PAL.t4 },
  { sx: CX - 4,  sy: 22, ex: CX - 7,  ey: 16, col: PAL.t1 },
  { sx: CX + 4,  sy: 22, ex: CX + 7,  ey: 16, col: PAL.t3 },
];
for (const tw of secondaryTwigs) {
  const steps = 9;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(tw.sx + (tw.ex - tw.sx) * t);
    const y = Math.round(tw.sy + (tw.ey - tw.sy) * t);
    put('secondary_branches', x, y, tw.col);
  }
}

// ── 6. Oak Foliage Masses (9 Overlapping Billowing Cloud Lobes) ──────────────
const OAK_LOBES_V2 = [
  // Lower lateral boughs (wide spread, heavy under-shadow)
  { cx: CX - 14, cy: 28, rx: 8,  ry: 6,  ao: 0.28 },
  { cx: CX + 14, cy: 28, rx: 8,  ry: 6,  ao: 0.22 },
  // Mid canopy shelves
  { cx: CX - 11, cy: 21, rx: 9,  ry: 7,  ao: 0.16 },
  { cx: CX + 11, cy: 21, rx: 9,  ry: 7,  ao: 0.12 },
  { cx: CX,      cy: 23, rx: 10, ry: 7,  ao: 0.22 },
  // Upper crown lobes
  { cx: CX - 6,  cy: 14, rx: 8,  ry: 6,  ao: 0.08 },
  { cx: CX + 6,  cy: 14, rx: 8,  ry: 6,  ao: 0.04 },
  // Crown apex dome
  { cx: CX,      cy: 9,  rx: 8,  ry: 6,  ao: 0.00 },
  // Left highlight puff
  { cx: CX - 9,  cy: 12, rx: 6,  ry: 5,  ao: 0.02 },
];

for (const cl of OAK_LOBES_V2) {
  const { cx, cy, rx, ry, ao } = cl;

  for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
    for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
      if (x < 0 || x >= W || y < 0 || y >= H) continue;

      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dist = Math.hypot(dx, dy);

      // Organic edge noise jitter (leaves, notches)
      const edgeJitter = (ne(x * 2.6, y * 2.6) - 0.5) * 0.45;
      const perturbedDist = dist + edgeJitter;

      if (perturbedDist > 1.04) continue; // outside lobe

      // Negative space break
      const holeNoise = nf(x * 1.8, y * 1.8);
      if (holeNoise < 0.14 && perturbedDist > 0.50 && perturbedDist < 0.82) {
        continue;
      }

      // Local spherical volume lighting (key light upper-left: [-0.62, -0.78])
      const localDot = dx * (-0.62) + dy * (-0.78);

      // Dual-octave leaf cluster noise: produces crisp 2-4px leaf tufts!
      const cN = nc(x, y);
      const fN = nf(x, y);
      const leafClusterNoise = (cN - 0.5) * 0.32 + (fN - 0.5) * 0.18;

      const light = clampF(
        0.51
        + localDot * 0.37
        - ao
        + leafClusterNoise,
        0, 1
      );

      // Bayer 2x2 ordered dithering at transitions
      const dither = ((x & 1) ^ (y & 1));
      let col;
      if (light > 0.83) {
        col = dither ? PAL.c7 : PAL.c6;
      } else if (light > 0.67) {
        col = (light < 0.71 && dither) ? PAL.c5 : PAL.c6;
      } else if (light > 0.51) {
        col = (light < 0.55 && dither) ? PAL.c4 : PAL.c5;
      } else if (light > 0.35) {
        col = (light < 0.39 && dither) ? PAL.c3 : PAL.c4;
      } else if (light > 0.20) {
        col = (light < 0.24 && dither) ? PAL.c2 : PAL.c3;
      } else if (light > 0.08) {
        col = (light < 0.12 && dither) ? PAL.c1 : PAL.c2;
      } else {
        col = PAL.c0;
      }

      const isEdge = perturbedDist > 0.85;
      let targetLayer = 'canopy_masses';

      if (isEdge) {
        targetLayer = 'foliage_edges';
        if (localDot < -0.22) col = PAL.c1;
        else if (localDot > 0.30) col = PAL.c6;
      } else if (light > 0.83) {
        targetLayer = 'highlights';
      }

      put(targetLayer, x, y, col);
    }
  }
}

// ── 7. Leaf Notch Fringe Pixels (1-2px organic tufts) ────────────────────────
for (const cl of OAK_LOBES_V2) {
  const numTufts = 7;
  for (let k = 0; k < numTufts; k++) {
    const angle = (k / numTufts) * Math.PI * 2 + (nc(cl.cx + k, cl.cy) - 0.5) * 0.6;
    const px = Math.round(cl.cx + Math.cos(angle) * (cl.rx + 1));
    const py = Math.round(cl.cy + Math.sin(angle) * (cl.ry + 1));
    if (px >= 0 && px < W && py >= 0 && py < H && !layers.canopy_masses[py][px]) {
      const isLit = Math.cos(angle) < 0 || Math.sin(angle) < 0;
      put('foliage_edges', px, py, isLit ? PAL.c6 : PAL.c2);
    }
  }
}

// ── 8. Specular Glints ───────────────────────────────────────────────────────
put('highlights', CX - 1, 5, PAL.c7);
put('highlights', CX,     4, PAL.c7);
put('highlights', CX + 1, 5, PAL.c6);
put('highlights', CX - 9, 11, PAL.c7);
put('highlights', CX - 8, 12, PAL.c7);
put('highlights', CX + 7, 12, PAL.c7);

// ── Composite Final RGBA Buffer ──────────────────────────────────────────────
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

writeFileSync('output/test-botanical/oak-v2-1x.png', png1x);
writeFileSync('output/test-botanical/oak-v2-8x.png', png8x);
console.log('✓ Emitted output/test-botanical/oak-v2-8x.png');
