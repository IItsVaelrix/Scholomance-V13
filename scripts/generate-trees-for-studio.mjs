#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MASTER_TREE_SPECS,
  buildMasterTreeBundle,
} from '../codex/core/pixelbrain/scholomium-ink/corpus/tree-masters.js';
import {
  NATURAL_VARIANTS_SPEC,
  HYBRID_SPECIES_SPEC,
  generateTreeDescendant,
} from '../codex/core/pixelbrain/scholomium-ink/families/tree/tree-derivation.js';
import { compileSCDL } from '../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';
import { perlinNoiseGrid } from '../codex/core/pixelbrain/procedural-noise.js';
import {
  TREE_PALETTES,
  TREE_REALIZATION_ARCHETYPES,
} from '../codex/core/pixelbrain/scholomium-ink/families/tree/tree-realization.vocabulary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_ROOT = resolve(__dirname, '..', 'Pixel-Art-Studio-Skeleton', 'SCDL-V2-ASSETS', 'TREES');

// ── 8-Stop Botanical Palettes with Rich Hue Shifting ─────────────────────────
const BOTANICAL_PALETTES = {
  verdant_forest: {
    c7: '#A2E84A', c6: '#6EC83C', c5: '#44A832', c4: '#288828',
    c3: '#186424', c2: '#0E481C', c1: '#0A3014', c0: '#04180A',
    t4: '#A66E38', t3: '#7E4C20', t2: '#583212', t1: '#3A1E0A', t0: '#200E04',
    r2: '#502C0E', r1: '#341A08', r0: '#1C0C04', ao: '#030806',
  },
  olive_green: {
    c7: '#BEF264', c6: '#84CC16', c5: '#65A30D', c4: '#4D7C0F',
    c3: '#365314', c2: '#273C0E', c1: '#1A2E05', c0: '#0E1A03',
    t4: '#A8A29E', t3: '#78716C', t2: '#57534E', t1: '#44403C', t0: '#1C1917',
    r2: '#44403C', r1: '#292524', r0: '#1C1917', ao: '#030806',
  },
  cinnamon_and_emerald: {
    c7: '#6EE7B7', c6: '#10B981', c5: '#059669', c4: '#047857',
    c3: '#064E3B', c2: '#033B2C', c1: '#022C22', c0: '#011712',
    t4: '#D97706', t3: '#B45309', t2: '#92400E', t1: '#78350F', t0: '#451A03',
    r2: '#78350F', r1: '#5A260B', r0: '#381404', ao: '#030806',
  },
  deep_sage: {
    c7: '#99F6E4', c6: '#2DD4BF', c5: '#0D9488', c4: '#115E59',
    c3: '#134E4A', c2: '#0B3835', c1: '#042F2E', c0: '#021C1B',
    t4: '#A8A29E', t3: '#78716C', t2: '#57534E', t1: '#292524', t0: '#1C1917',
    r2: '#44403C', r1: '#292524', r0: '#1C1917', ao: '#030806',
  },
  voidpine_dark: {
    c7: '#8FD490', c6: '#6BA870', c5: '#4A7A55', c4: '#2E5C3F',
    c3: '#1E4430', c2: '#122B1D', c1: '#0A1F14', c0: '#060F09',
    t4: '#7A5234', t3: '#5C3A1F', t2: '#3D2513', t1: '#2A1A0C', t0: '#1A0A04',
    r2: '#4A2E14', r1: '#2E1A08', r0: '#150A02', ao: '#000000',
  },
  spruce_bluegreen: {
    c7: '#BAE6FD', c6: '#38BDF8', c5: '#0284C7', c4: '#0369A1',
    c3: '#075985', c2: '#08446B', c1: '#0C4A6E', c0: '#052438',
    t4: '#78716C', t3: '#57534E', t2: '#44403C', t1: '#292524', t0: '#1C1917',
    r2: '#44403C', r1: '#292524', r0: '#1C1917', ao: '#02060A',
  },
  autumn_scarlet_gold: {
    c7: '#FDE047', c6: '#F97316', c5: '#EF4444', c4: '#DC2626',
    c3: '#B91C1C', c2: '#991B1B', c1: '#7F1D1D', c0: '#450A0A',
    t4: '#A8A29E', t3: '#78716C', t2: '#57534E', t1: '#292524', t0: '#1C1917',
    r2: '#44403C', r1: '#292524', r0: '#1C1917', ao: '#080303',
  },
  void_purple: {
    c7: '#E9D5FF', c6: '#C084FC', c5: '#9333EA', c4: '#7E22CE',
    c3: '#6B21A8', c2: '#581C87', c1: '#3B0764', c0: '#1F0338',
    t4: '#78716C', t3: '#57534E', t2: '#3B2D54', t1: '#2E1F42', t0: '#1A1028',
    r2: '#3B2D54', r1: '#2E1F42', r0: '#1A1028', ao: '#05020A',
  },
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
function clampF(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function hexToRgb(hex) {
  const raw = String(hex).replace('#', '').padEnd(6, '0');
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

/**
 * Integer nearest-neighbour upscale — the only lawful magnification for pixel art.
 * Each source cell becomes an s×s block of identical bytes, preserving crisp square pixels.
 */
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

/**
 * Synthesizes authentic botanical pixel-art geometry and lighting for a tree.
 * Populates all 9 semantic layers with organic leaf clumps / boughs, bark furrows,
 * root flares, and dithered depth shading.
 */
export function synthesizeBotanicalTreeArt({ W, H, family = 'oak', envelope, paletteTheme = 'verdant_forest', seed = 1337 }) {
  const pal = BOTANICAL_PALETTES[paletteTheme] || BOTANICAL_PALETTES.verdant_forest;
  const CX = Math.floor(W / 2);
  const groundY = H - 5;

  const noiseCoarse = perlinNoiseGrid(W, H, { seed: `coarse-${family}-${seed}`, scale: 0.16, octaves: 3, persistence: 0.55, lacunarity: 2.1 });
  const noiseFine   = perlinNoiseGrid(W, H, { seed: `fine-${family}-${seed}`,   scale: 0.38, octaves: 2, persistence: 0.6,  lacunarity: 2.2 });
  const noiseEdge   = perlinNoiseGrid(W, H, { seed: `edge-${family}-${seed}`,   scale: 0.52, octaves: 2, persistence: 0.5,  lacunarity: 2.0 });

  function nc(x, y) { return noiseCoarse.values[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] ?? 0.5; }
  function nf(x, y) { return noiseFine.values[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] ?? 0.5; }
  function ne(x, y) { return noiseEdge.values[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] ?? 0.5; }

  const layerBuffers = {
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

  function put(layerId, x, y, col) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    layerBuffers[layerId][y][x] = col;
  }

  // ── 1. Ground AO Ellipse ───────────────────────────────────────────────────
  const shadowRadius = Math.max(10, Math.floor(W * 0.34));
  for (let dx = -shadowRadius; dx <= shadowRadius; dx++) {
    const d = Math.abs(dx) / shadowRadius;
    const fade = 1 - d * d;
    if (fade > 0.05) {
      put('ground_shadow', CX + dx, groundY, pal.ao);
      if (Math.abs(dx) < shadowRadius * 0.75) put('ground_shadow', CX + dx, groundY + 1, pal.ao);
      if (Math.abs(dx) < shadowRadius * 0.40) put('ground_shadow', CX + dx, groundY + 2, pal.ao);
    }
  }

  // ── 2. Roots & Ground ──────────────────────────────────────────────────────
  const rootSpread = Math.max(7, Math.floor(W * 0.26));
  const rootDefs = [
    { sx: CX - 3, sy: groundY - 4, ex: CX - rootSpread,     ey: groundY + 1, w: 2 },
    { sx: CX + 3, sy: groundY - 4, ex: CX + rootSpread,     ey: groundY + 1, w: 2 },
    { sx: CX - 1, sy: groundY - 3, ex: CX - Math.round(rootSpread * 0.5), ey: groundY + 2, w: 2 },
    { sx: CX + 1, sy: groundY - 3, ex: CX + Math.round(rootSpread * 0.5), ey: groundY + 2, w: 2 },
    { sx: CX,     sy: groundY - 2, ex: CX,                  ey: groundY + 1, w: 3 },
  ];
  for (const r of rootDefs) {
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(r.sx + (r.ex - r.sx) * t);
      const y = Math.round(r.sy + (r.ey - r.sy) * t);
      const col = t < 0.4 ? pal.r2 : t < 0.75 ? pal.r1 : pal.r0;
      put('roots_and_ground', x, y, col);
      for (let dw = 1; dw < r.w; dw++) {
        put('roots_and_ground', x + (r.ex < CX ? -dw : dw), y, pal.r0);
      }
    }
  }
  for (let y = groundY - 3; y <= groundY; y++) {
    for (let x = CX - 5; x <= CX + 5; x++) {
      if (!layerBuffers.roots_and_ground[y][x]) {
        put('roots_and_ground', x, y, pal.r1);
      }
    }
  }

  // ── 3. Habit Synthesis ─────────────────────────────────────────────────────
  const isConifer = ['pine', 'evergreen', 'redwood', 'cedar', 'scholo_frostpine_evergreen', 'scholo_ironbark_redcedar'].includes(family);

  if (isConifer) {
    // ── CONIFER HABIT ────────────────────────────────────────────────────────
    let trunkTopY = Math.floor(H * 0.35);
    let baseTrunkHW = 3;
    let numTiers = 5;

    if (family === 'redwood' || family === 'scholo_ironbark_redcedar') {
      trunkTopY = Math.floor(H * 0.45);
      baseTrunkHW = 5;
      numTiers = 7;
    } else if (family === 'evergreen' || family === 'scholo_frostpine_evergreen') {
      trunkTopY = Math.floor(H * 0.55);
      baseTrunkHW = 3;
      numTiers = 4;
    } else if (family === 'cedar') {
      trunkTopY = Math.floor(H * 0.35);
      baseTrunkHW = 4;
      numTiers = 5;
    }

    const crownTop = Math.floor(H * 0.08);
    const crownBottom = Math.floor(groundY - (family === 'evergreen' ? H * 0.06 : H * 0.16));

    // Trunk column (under foliage, visible below crownBottom)
    for (let y = trunkTopY; y <= groundY - 1; y++) {
      const t = (y - trunkTopY) / Math.max(1, groundY - 1 - trunkTopY);
      const flare = t > 0.45 ? Math.round(Math.pow((t - 0.45) / 0.55, 1.8) * (baseTrunkHW + 1)) : 0;
      const hw = baseTrunkHW + flare;

      for (let x = CX - hw; x <= CX + hw; x++) {
        const u = (x - (CX - hw)) / Math.max(1, hw * 2);
        const grain = nf(x * 2.5, y * 0.5);

        let col;
        if (x === CX - hw) col = pal.t0;
        else if (x === CX - hw + 1) col = pal.t1;
        else if (x === CX + hw) col = pal.t4;
        else if (x === CX + hw - 1) col = pal.t3;
        else {
          if (grain < 0.20 && y >= crownBottom - 1) {
            col = pal.t0;
            put('surface_detail', x, y, pal.t0);
          } else if (grain > 0.70 && u > 0.35 && y >= crownBottom - 1) {
            col = pal.t4;
            put('surface_detail', x, y, pal.t4);
          } else if (u < 0.40) col = pal.t1;
          else if (u < 0.65) col = pal.t2;
          else col = pal.t3;
        }
        put('trunk', x, y, col);
      }
    }

    // Tiers definition
    const totalSpan = crownBottom - crownTop;
    const tiers = [];

    if (family === 'cedar') {
      for (let i = 0; i < numTiers; i++) {
        const t = (i + 0.5) / numTiers;
        const cy = Math.round(crownTop + t * totalSpan);
        const apexY = cy - 4;
        const baseY = cy + 4;
        const baseHW = Math.round(W * (0.20 + 0.25 * Math.pow((i + 1) / numTiers, 0.7)));
        tiers.push({ apexY, baseY, baseHW, isTerrace: true });
      }
    } else {
      for (let i = 0; i < numTiers; i++) {
        const tApex = i / numTiers;
        const tBase = (i + (family === 'evergreen' ? 1.5 : 1.25)) / numTiers;
        const apexY = Math.round(crownTop + tApex * totalSpan);
        const baseY = Math.min(crownBottom, Math.round(crownTop + tBase * totalSpan));
        const maxHW = Math.round(W * (0.16 + 0.28 * Math.pow((i + 1) / numTiers, 0.85)));
        tiers.push({ apexY, baseY, baseHW: maxHW });
      }
    }

    // Draw tiers
    for (const tier of tiers) {
      const { apexY, baseY, baseHW } = tier;
      const span = Math.max(1, baseY - apexY);

      // Drooping branch hints peeking out under bough shelf
      const numBranches = 4;
      for (let b = 0; b < numBranches; b++) {
        const bt = (b + 0.5) / numBranches;
        const bx = Math.round(CX - baseHW * 0.65 + bt * baseHW * 1.3);
        const len = 3 + Math.round(nf(bx, baseY) * 3);
        const side = bx < CX ? -1 : 1;
        for (let k = 1; k <= len; k++) {
          const px = bx + side * k;
          const py = baseY + k;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            put('secondary_branches', px, py, k === 1 ? pal.t1 : pal.t2);
          }
        }
      }

      // Foliage shelf rows
      for (let y = apexY; y <= baseY; y++) {
        const yt = (y - apexY) / span;
        const smooth = Math.round(yt * baseHW);
        if (smooth <= 0) continue;

        const edgeJitter = (ne(CX - smooth, y) - 0.5) * 3.5;
        const hw = Math.max(1, Math.round(smooth + edgeJitter));

        for (let x = CX - hw; x <= CX + hw; x++) {
          const horiz = (x - CX) / hw;
          const depthAO = yt * 0.40;

          const cN = nc(x, y);
          const fN = nf(x, y);
          const needleNoise = (cN - 0.5) * 0.28 + (fN - 0.5) * 0.16;

          const light = clampF(
            0.50
            + horiz * 0.36
            - depthAO
            + needleNoise,
            0, 1
          );

          const dither = ((x & 1) ^ (y & 1));
          let col;
          if (light > 0.82) col = dither ? pal.c7 : pal.c6;
          else if (light > 0.68) col = (light < 0.72 && dither) ? pal.c5 : pal.c6;
          else if (light > 0.52) col = (light < 0.56 && dither) ? pal.c4 : pal.c5;
          else if (light > 0.36) col = (light < 0.40 && dither) ? pal.c3 : pal.c4;
          else if (light > 0.20) col = (light < 0.24 && dither) ? pal.c2 : pal.c3;
          else if (light > 0.08) col = (light < 0.12 && dither) ? pal.c1 : pal.c2;
          else col = pal.c0;

          let targetLayer = 'canopy_masses';
          if (x === CX - hw || x === CX + hw) {
            targetLayer = 'foliage_edges';
            if (horiz < -0.2) col = pal.c1;
            else if (horiz > 0.3) col = pal.c6;
          } else if (light > 0.82) {
            targetLayer = 'highlights';
          }
          put(targetLayer, x, y, col);
        }

        // Needle clusters protruding off edges (2-4px)
        const edgeLeftN = ne(CX - hw, y);
        if (hw > 3 && edgeLeftN > 0.52) {
          const len = 2 + Math.round(edgeLeftN * 2);
          for (let k = 1; k <= len; k++) {
            const px = CX - hw - k;
            const py = y + Math.round(k * 0.4);
            put('foliage_edges', px, py, k === 1 ? pal.c2 : pal.c1);
          }
        }
        const edgeRightN = ne(CX + hw, y);
        if (hw > 3 && edgeRightN > 0.50) {
          const len = 2 + Math.round(edgeRightN * 2);
          for (let k = 1; k <= len; k++) {
            const px = CX + hw + k;
            const py = y + Math.round(k * 0.4);
            put('foliage_edges', px, py, k === 1 ? pal.c6 : pal.c5);
          }
        }
      }

      put('highlights', CX, apexY, pal.c7);
      put('highlights', CX, apexY + 1, pal.c6);
    }

  } else {
    // ── BROADLEAF HABIT (Oak, Hickory, Maple, Weeping Voidmaple) ────────────
    const trunkTopY = Math.floor(H * 0.40);
    const trunkHW = Math.max(3, Math.floor(W * 0.10));
    const crownTop = Math.floor(H * 0.08);
    const crownBottom = Math.floor(trunkTopY + H * 0.06);

    // Trunk column with muscular root flare
    for (let y = trunkTopY; y <= groundY - 1; y++) {
      const t = (y - trunkTopY) / Math.max(1, groundY - 1 - trunkTopY);
      const flare = t > 0.35 ? Math.round(Math.pow((t - 0.35) / 0.65, 1.8) * (trunkHW + 1.5)) : 0;
      const hw = trunkHW + flare;

      for (let x = CX - hw; x <= CX + hw; x++) {
        const u = (x - (CX - hw)) / Math.max(1, hw * 2);
        const grain = nf(x * 2.2, y * 0.45);

        let col;
        if (x === CX - hw) col = pal.t0;
        else if (x === CX - hw + 1) col = pal.t1;
        else if (x === CX + hw) col = pal.t4;
        else if (x === CX + hw - 1) col = pal.t3;
        else {
          if (grain < 0.22 && y >= crownBottom - 2) {
            col = pal.t0;
            put('surface_detail', x, y, pal.t0);
          } else if (grain > 0.70 && u > 0.35 && y >= crownBottom - 2) {
            col = pal.t4;
            put('surface_detail', x, y, pal.t4);
          } else if (u < 0.35) col = pal.t1;
          else if (u < 0.65) col = pal.t2;
          else col = pal.t3;
        }
        put('trunk', x, y, col);
      }
    }

    // Scaffold Primary Branches
    const branchReachX = Math.round(W * 0.30);
    const branchReachY = Math.round(H * 0.18);
    const scaffoldBranches = [
      { sx: CX - 2, sy: trunkTopY + 4, ex: CX - branchReachX, ey: trunkTopY - branchReachY + 4, col: pal.t1, w: 2 },
      { sx: CX + 2, sy: trunkTopY + 4, ex: CX + branchReachX, ey: trunkTopY - branchReachY + 4, col: pal.t3, w: 2 },
      { sx: CX - 1, sy: trunkTopY,     ex: CX - Math.round(branchReachX * 0.5), ey: trunkTopY - branchReachY - 2, col: pal.t2, w: 2 },
      { sx: CX + 1, sy: trunkTopY,     ex: CX + Math.round(branchReachX * 0.5), ey: trunkTopY - branchReachY - 2, col: pal.t3, w: 2 },
      { sx: CX,     sy: trunkTopY - 2, ex: CX, ey: trunkTopY - branchReachY - 4, col: pal.t2, w: 1 },
    ];
    for (const b of scaffoldBranches) {
      const steps = 20;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round(b.sx + (b.ex - b.sx) * t);
        const y = Math.round(b.sy + (b.ey - b.sy) * t);
        put('primary_branches', x, y, b.col);
        if (b.w > 1) {
          put('primary_branches', x, y + 1, pal.t0);
          put('primary_branches', x + (b.ex < CX ? -1 : 1), y, b.col === pal.t1 ? pal.t0 : pal.t4);
        }
      }
    }

    // Clusters Configuration
    let clusters = [];
    const crownCenterY = Math.floor((crownTop + crownBottom) / 2);
    const spreadX = Math.floor(W * 0.28);
    const baseR = Math.floor(W * 0.18);

    if (family === 'hickory') {
      const numTufts = 8;
      for (let i = 0; i < numTufts; i++) {
        const t = i / (numTufts - 1);
        const cy = Math.round(crownTop + 2 + t * (crownBottom - crownTop - 2));
        const rx = Math.round(W * 0.32 * (0.6 + 0.4 * Math.sin(t * Math.PI)));
        const ry = Math.round(rx * 0.75);
        const ox = (i % 2 === 0 ? -1 : 1) * Math.round(rx * 0.2);
        clusters.push({ cx: CX + ox, cy, rx, ry, ao: t * 0.32 });
      }
    } else if (family === 'maple' || family === 'scholo_weeping_voidmaple') {
      clusters = [
        { cx: CX - Math.round(spreadX * 1.05), cy: crownCenterY + 4, rx: baseR, ry: Math.round(baseR * 0.8), ao: 0.24 },
        { cx: CX + Math.round(spreadX * 1.05), cy: crownCenterY + 4, rx: baseR, ry: Math.round(baseR * 0.8), ao: 0.20 },
        { cx: CX - Math.round(spreadX * 0.7),  cy: crownCenterY - 4, rx: Math.round(baseR * 1.1), ry: baseR, ao: 0.14 },
        { cx: CX + Math.round(spreadX * 0.7),  cy: crownCenterY - 4, rx: Math.round(baseR * 1.1), ry: baseR, ao: 0.10 },
        { cx: CX - Math.round(spreadX * 0.3),  cy: crownTop + 6,     rx: Math.round(baseR * 0.9), ry: baseR, ao: 0.05 },
        { cx: CX + Math.round(spreadX * 0.3),  cy: crownTop + 6,     rx: Math.round(baseR * 0.9), ry: baseR, ao: 0.02 },
        { cx: CX,                              cy: crownTop + 1,     rx: Math.round(baseR * 0.85), ry: Math.round(baseR * 0.8), ao: 0.00 },
      ];
    } else {
      // Classic Oak
      clusters = [
        { cx: CX - spreadX,                    cy: crownBottom - 3, rx: baseR,                 ry: Math.round(baseR * 0.75), ao: 0.28 },
        { cx: CX + spreadX,                    cy: crownBottom - 3, rx: baseR,                 ry: Math.round(baseR * 0.75), ao: 0.22 },
        { cx: CX - Math.round(spreadX * 0.75), cy: crownCenterY,    rx: Math.round(baseR * 1.1), ry: Math.round(baseR * 0.85), ao: 0.16 },
        { cx: CX + Math.round(spreadX * 0.75), cy: crownCenterY,    rx: Math.round(baseR * 1.1), ry: Math.round(baseR * 0.85), ao: 0.12 },
        { cx: CX,                              cy: crownCenterY + 1, rx: Math.round(baseR * 1.2), ry: Math.round(baseR * 0.85), ao: 0.20 },
        { cx: CX - Math.round(spreadX * 0.4),  cy: crownTop + 6,     rx: baseR,                 ry: Math.round(baseR * 0.8),  ao: 0.08 },
        { cx: CX + Math.round(spreadX * 0.4),  cy: crownTop + 6,     rx: baseR,                 ry: Math.round(baseR * 0.8),  ao: 0.04 },
        { cx: CX,                              cy: crownTop + 1,     rx: baseR,                 ry: Math.round(baseR * 0.75), ao: 0.00 },
      ];
    }

    // Under-canopy backing
    for (let y = crownTop + 4; y <= crownBottom + 2; y++) {
      const yt = (y - (crownTop + 4)) / Math.max(1, crownBottom - crownTop);
      const hw = Math.round((family === 'hickory' ? W * 0.25 : spreadX) * (0.8 + 0.4 * Math.sin(yt * Math.PI)));
      for (let x = CX - hw; x <= CX + hw; x++) {
        if (!layerBuffers.trunk[y][x]) {
          put('canopy_masses', x, y, pal.c1);
        }
      }
    }

    // Foliage clusters
    for (const cl of clusters) {
      const { cx, cy, rx, ry, ao } = cl;

      for (let y = cy - ry - 2; y <= cy + ry + 2; y++) {
        for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
          if (x < 0 || x >= W || y < 0 || y >= H) continue;

          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const dist = Math.hypot(dx, dy);

          const edgeJitter = (ne(x * 2.6, y * 2.6) - 0.5) * 0.45;
          const perturbedDist = dist + edgeJitter;
          if (perturbedDist > 1.04) continue;

          const localDot = dx * (-0.62) + dy * (-0.78);
          const cN = nc(x, y);
          const fN = nf(x, y);
          const leafNoise = (cN - 0.5) * 0.32 + (fN - 0.5) * 0.18;

          const light = clampF(
            0.51
            + localDot * 0.37
            - ao
            + leafNoise,
            0, 1
          );

          const dither = ((x & 1) ^ (y & 1));
          let col;
          if (light > 0.83) col = dither ? pal.c7 : pal.c6;
          else if (light > 0.67) col = (light < 0.71 && dither) ? pal.c5 : pal.c6;
          else if (light > 0.51) col = (light < 0.55 && dither) ? pal.c4 : pal.c5;
          else if (light > 0.35) col = (light < 0.39 && dither) ? pal.c3 : pal.c4;
          else if (light > 0.20) col = (light < 0.24 && dither) ? pal.c2 : pal.c3;
          else if (light > 0.08) col = (light < 0.12 && dither) ? pal.c1 : pal.c2;
          else col = pal.c0;

          const isEdge = perturbedDist > 0.85;
          let targetLayer = 'canopy_masses';
          if (isEdge) {
            targetLayer = 'foliage_edges';
            if (localDot < -0.22) col = pal.c1;
            else if (localDot > 0.30) col = pal.c6;
          } else if (light > 0.83) {
            targetLayer = 'highlights';
          }
          put(targetLayer, x, y, col);
        }
      }
    }

    // Leaf notch fringe tufts
    for (const cl of clusters) {
      const numTufts = 6;
      for (let k = 0; k < numTufts; k++) {
        const angle = (k / numTufts) * Math.PI * 2 + (nc(cl.cx + k, cl.cy) - 0.5) * 0.6;
        const px = Math.round(cl.cx + Math.cos(angle) * (cl.rx + 1));
        const py = Math.round(cl.cy + Math.sin(angle) * (cl.ry + 1));
        if (px >= 0 && px < W && py >= 0 && py < H && !layerBuffers.canopy_masses[py][px]) {
          const isLit = Math.cos(angle) < 0 || Math.sin(angle) < 0;
          put('foliage_edges', px, py, isLit ? pal.c6 : pal.c2);
        }
      }
    }

    // Weeping tendrils for scholo_weeping_voidmaple
    if (family === 'scholo_weeping_voidmaple') {
      const tendrilPositions = [CX - 16, CX - 10, CX - 4, CX + 4, CX + 10, CX + 16];
      for (const tx of tendrilPositions) {
        const tLen = 4 + Math.round(nf(tx, crownBottom) * 5);
        for (let dy = 0; dy < tLen; dy++) {
          const ty = crownBottom + dy;
          const col = dy === tLen - 1 ? pal.c6 : dy > tLen / 2 ? pal.c4 : pal.c2;
          put('foliage_edges', tx, ty, col);
        }
      }
    }

    put('highlights', CX - 1, crownTop + 1, pal.c7);
    put('highlights', CX,     crownTop,     pal.c7);
    put('highlights', CX + 1, crownTop + 1, pal.c6);
  }

  // ── Convert to Coordinates & layerSurfaces ──────────────────────────────────
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
  const layerSurfaces = [];
  const shadedCoordinates = [];

  for (let idx = 0; idx < LAYER_ORDER.length; idx++) {
    const layerId = LAYER_ORDER[idx];
    const buf = layerBuffers[layerId];
    const coords = [];

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cHex = buf[y][x];
        if (cHex) {
          composite[y][x] = cHex;
          coords.push({ x, y, color: cHex, partId: layerId, role: 'paint' });
        }
      }
    }

    layerSurfaces.push({
      id: layerId,
      order: (idx + 1) * 10,
      coordinates: coords,
      cells: coords,
    });
    shadedCoordinates.push(...coords);
  }

  const rgba1x = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const colHex = composite[y][x];
      if (!colHex) continue;
      const { r, g, b } = hexToRgb(colHex);
      const i = (y * W + x) * 4;
      rgba1x[i]   = r;
      rgba1x[i+1] = g;
      rgba1x[i+2] = b;
      rgba1x[i+3] = 255;
    }
  }

  const rgba8x = _nearestNeighbourUpscale(rgba1x, W, H, 8);
  const png1x = encodePng(W, H, rgba1x);
  const png8x = encodePng(W * 8, H * 8, rgba8x);

  return {
    layerSurfaces,
    shadedCoordinates,
    rgba1x,
    rgba8x,
    png1x,
    png8x,
    paletteTheme,
  };
}

function emitTreeAssets(dir, id, scdlSource, meta = {}) {
  mkdirSync(dir, { recursive: true });
  const scdlPath = join(dir, `${id}.scdl`);
  writeFileSync(scdlPath, scdlSource, 'utf8');

  const compiled = compileSCDL(scdlSource);
  if (!compiled.ok) {
    throw new Error(`Compile failed for ${id}: ${JSON.stringify(compiled.errors)}`);
  }

  const canvas = meta.canvas || compiled.packet?.geometry?.canvas || { width: 48, height: 64 };
  const W = canvas.width;
  const H = canvas.height;

  const family = meta.family || 'oak';
  const paletteTheme =
    meta.palette ||
    (family && TREE_REALIZATION_ARCHETYPES[family]?.paletteTheme) ||
    'verdant_forest';

  const synthesized = synthesizeBotanicalTreeArt({
    W,
    H,
    family,
    envelope: meta.envelope,
    paletteTheme,
    seed: 1337,
  });

  const updatedPacket = {
    ...compiled.packet,
    canvas: { ...canvas, cellSize: 1, gridSize: 1, transparent: true },
    geometry: {
      ...compiled.packet.geometry,
      canvas: { ...canvas, cellSize: 1, gridSize: 1, transparent: true },
      coordinates: synthesized.shadedCoordinates,
    },
    layerSurfaces: synthesized.layerSurfaces,
  };

  // 1. JSON Asset Packet
  writeFileSync(join(dir, `${id}-json.json`), JSON.stringify(updatedPacket, null, 2), 'utf8');

  // 2. 1x Native Pixel-Art PNG with authentic grain, furrows, and dithering
  writeFileSync(join(dir, `${id}-png.png`), synthesized.png1x);

  // 3. 8x Nearest-Neighbour Upscaled Preview PNG (crisp, razor-sharp authentic pixel blocks)
  writeFileSync(join(dir, `${id}-preview-8x.png`), synthesized.png8x);

  return {
    id,
    scdlPath,
    pngPath: join(dir, `${id}-png.png`),
    previewPath: join(dir, `${id}-preview-8x.png`),
    jsonPath: join(dir, `${id}-json.json`),
    canvas,
    cellsCount: synthesized.shadedCoordinates.length,
    ...meta,
  };
}

export function generateAllStudioTrees() {
  console.log(`Generating textured botanical pixel-art trees into: ${TARGET_ROOT}`);
  mkdirSync(TARGET_ROOT, { recursive: true });

  const mastersDir = join(TARGET_ROOT, 'masters');
  const variantsDir = join(TARGET_ROOT, 'variants');
  const hybridsDir = join(TARGET_ROOT, 'hybrids');

  const mastersSummary = [];
  const variantsSummary = [];
  const hybridsSummary = [];

  for (const familyKey of Object.keys(MASTER_TREE_SPECS)) {
    const bundle = buildMasterTreeBundle(familyKey);
    const id = `${familyKey}_master`;
    const record = emitTreeAssets(mastersDir, id, bundle.scdlSource, {
      family: familyKey,
      canvas: { width: bundle.spec.canvasWidth, height: bundle.spec.canvasHeight },
      name: bundle.spec.name,
      envelope: bundle.spec.envelope,
      brief: bundle.spec.brief,
      checksum128: bundle.counselReceipt.checksum128,
    });
    mastersSummary.push(record);
    console.log(`  ✓ Master: ${id} (${record.canvas.width}x${record.canvas.height}) - ${record.cellsCount} cells`);
  }

  for (const spec of NATURAL_VARIANTS_SPEC) {
    const descendant = generateTreeDescendant({ spec, isHybrid: false });
    const id = spec.id;
    const record = emitTreeAssets(variantsDir, id, descendant.projection.scdlSource, {
      family: spec.family,
      canvas: descendant.projection.compileResult.packet.canvas,
      palette: spec.palette,
      density: spec.density,
      envelope: spec.envelope,
      checksum128: descendant.receipt.checksum128,
    });
    variantsSummary.push(record);
    console.log(`  ✓ Variant: ${id} (${record.canvas.width}x${record.canvas.height}) - ${record.cellsCount} cells`);
  }

  for (const spec of HYBRID_SPECIES_SPEC) {
    const descendant = generateTreeDescendant({
      spec,
      isHybrid: true,
      parentReceipts: spec.parents.map((p) => `parent_${p}`),
    });
    const id = spec.id;
    const record = emitTreeAssets(hybridsDir, id, descendant.projection.scdlSource, {
      parents: spec.parents.join(' + '),
      family: spec.id,
      canvas: descendant.projection.compileResult.packet.canvas,
      palette: spec.realizationArchetype?.paletteTheme || 'verdant_forest',
      transformation: spec.transformation,
      checksum128: descendant.receipt.checksum128,
    });
    hybridsSummary.push(record);
    console.log(`  ✓ Hybrid: ${id} (${record.canvas.width}x${record.canvas.height}) - ${record.cellsCount} cells`);
  }

  const catalogLines = [
    '# Scholomium Ink — Tree Intelligence Gallery',
    '',
    'Deterministic, explainable pixel-art tree assets generated from the **SCD128** Seven-Tree Laboratory.',
    'Synthesized with authentic **Botanical Habit Architecture**: organic cloud lobes, tiered boughs, needle clusters, root flares, vertical bark cracks, dual-octave Perlin noise clustering, 2x2 Bayer dithering, and lawful integer nearest-neighbour block scaling.',
    'Each tree includes semantic SCDL v2 source (`.scdl`), 1x native pixel PNG (`-png.png`), 8x crisp preview (`-preview-8x.png`), and editable 9-layer IR packet (`-json.json`).',
    '',
    '## 1. Seven Canonical Masters',
    '',
    '| Tree Master | Family | Canvas | Silhouette | Assets |',
    '|---|---|---|---|---|',
    ...mastersSummary.map(
      (m) =>
        `| **${m.name}** | \`${m.family}\` | ${m.canvas.width}x${m.canvas.height} | \`${m.envelope}\` | [Preview 8x](masters/${m.id}-preview-8x.png) · [Native 1x](masters/${m.id}-png.png) · [SCDL](masters/${m.id}.scdl) · [JSON](masters/${m.id}-json.json) |`
    ),
    '',
    '## 2. Fourteen Natural Variants',
    '',
    '| Variant | Family | Canvas | Palette | Assets |',
    '|---|---|---|---|---|',
    ...variantsSummary.map(
      (v) =>
        `| **${v.id}** | \`${v.family}\` | ${v.canvas.width}x${v.canvas.height} | \`${v.palette}\` | [Preview 8x](variants/${v.id}-preview-8x.png) · [Native 1x](variants/${v.id}-png.png) · [SCDL](variants/${v.id}.scdl) · [JSON](variants/${v.id}-json.json) |`
    ),
    '',
    '## 3. Three Original Scholomance Hybrids',
    '',
    '| Hybrid | Parents | Canvas | Transformation | Assets |',
    '|---|---|---|---|---|',
    ...hybridsSummary.map(
      (h) =>
        `| **${h.id}** | \`${h.parents}\` | ${h.canvas.width}x${h.canvas.height} | ${h.transformation} | [Preview 8x](hybrids/${h.id}-preview-8x.png) · [Native 1x](hybrids/${h.id}-png.png) · [SCDL](hybrids/${h.id}.scdl) · [JSON](hybrids/${h.id}-json.json) |`
    ),
    '',
    '---',
    `*Generated on ${new Date().toISOString()} by scripts/generate-trees-for-studio.mjs*`,
  ];

  writeFileSync(join(TARGET_ROOT, 'README.md'), catalogLines.join('\n'), 'utf8');
  console.log(`\n✓ Successfully emitted 24 botanical pixel-art tree assets and README to: ${TARGET_ROOT}`);
}

generateAllStudioTrees();
