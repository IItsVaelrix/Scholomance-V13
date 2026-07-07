#!/usr/bin/env node
/**
 * Procedural grass isometric tiles at combat arena dimensions (80×40 + 5px depth).
 * Palette and silhouette inspired by docs/references/Grass Tile Isometric.aseprite.
 *
 * Matches PolarisForestScene / CombatArenaScene: tw=80, th=40, depth=5.
 *
 * Usage:
 *   node scripts/generate-grass-tile-variations.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';
import { encodeAsepriteBinary } from '../codex/core/pixelbrain/aseprite-binary-codec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REF_DIR = resolve(ROOT, 'docs/references');
const SRC = resolve(REF_DIR, 'Grass Tile Isometric.aseprite');
const OUT_DIR = REF_DIR;
const OUT_ASE = resolve(REF_DIR, 'Grass Tile Variations.aseprite');
const OUT_MANIFEST = resolve(REF_DIR, 'Grass Tile Manifest.json');

/** Authoritative combat iso tile footprint (see PolarisForestScene / CombatArenaScene). */
export const COMBAT_ISO_TILE = Object.freeze({
  tw: 80,
  th: 40,
  depth: 5,
  width: 80,
  height: 45,
  centerX: 40,
  centerY: 20,
});

const TOP_PALETTE = Object.freeze({
  shine: 0x6abe30,
  lit: 0x5c8831,
  core: 0x457b1f,
  rim: 0x3f5c23,
  shadow: 0x294615,
});

const SIDE_LEFT_PALETTE = Object.freeze({
  shine: 0x8f563b,
  lit: 0x76503a,
  core: 0x654231,
  rim: 0x4a3020,
  shadow: 0x2a1810,
});

const SIDE_RIGHT_PALETTE = Object.freeze({
  shine: 0xa06848,
  lit: 0x886040,
  core: 0x705038,
  rim: 0x503828,
  shadow: 0x302018,
});

const FOLIAGE = Object.freeze({
  grassBright: [106, 190, 48],
  grassMid: [92, 154, 49],
  grassAccent: [76, 154, 26],
  grassDark: [63, 92, 35],
  grassDeep: [41, 70, 21],
  moss: [45, 80, 24],
  mossLit: [58, 120, 40],
  mossDeep: [34, 62, 18],
  stem: [47, 100, 32],
  flowerPurple: [168, 112, 196],
  flowerYellow: [232, 200, 72],
  flowerWhite: [228, 236, 210],
  flowerCenter: [240, 180, 60],
  leafTan: [138, 106, 64],
  leafBrown: [106, 80, 48],
  stone: [106, 112, 120],
  stoneDark: [74, 78, 86],
  stoneLit: [140, 148, 156],
  mushroomCap: [196, 148, 104],
  mushroomSpot: [240, 228, 210],
  mushroomStem: [220, 210, 188],
  vine: [55, 110, 42],
});

const VARIATIONS = [
  { id: 'grass-plain', label: 'Plain', apply: null },
  { id: 'grass-tufts', label: 'Tufts', apply: applyTufts },
  { id: 'grass-moss', label: 'Moss Patch', apply: applyMoss },
  { id: 'grass-clover', label: 'Clover', apply: applyClover },
  { id: 'grass-fern', label: 'Fern Sprig', apply: applyFern },
  { id: 'grass-wildflower', label: 'Wildflower', apply: applyWildflower },
  { id: 'grass-litter', label: 'Leaf Litter', apply: applyLeafLitter },
  { id: 'grass-pebble', label: 'Pebble', apply: applyPebbles },
  { id: 'grass-mushroom', label: 'Mushroom', apply: applyMushroom },
  { id: 'grass-vines', label: 'Ground Vines', apply: applyVines },
  { id: 'grass-dense', label: 'Dense Foliage', apply: applyDense },
];

function exportPngName(label) {
  if (label === 'Plain') return 'Grass Tile Plain.png';
  if (label === 'Dense Foliage') return 'Grass Tile Dense Foliage.png';
  return `Grass Tile ${label}.png`;
}

function u16(buf, o) { return buf.readUInt16LE(o); }
function i16(buf, o) { return buf.readInt16LE(o); }
function u32(buf, o) { return buf.readUInt32LE(o); }

function decodeReferencePalette(buffer) {
  try {
    const cels = [];
    let offset = 128;
    const frameEnd = offset + u32(buffer, offset);
    let chunkOffset = offset + 16;
    const chunkCount = u32(buffer, offset + 12) || u16(buffer, offset + 6);
    for (let ci = 0; ci < chunkCount && chunkOffset < frameEnd; ci += 1) {
      const chunkSize = u32(buffer, chunkOffset);
      const type = u16(buffer, chunkOffset + 4);
      const payload = chunkOffset + 6;
      const chunkEnd = chunkOffset + chunkSize;
      if (type === 0x2005 && u16(buffer, payload + 7) === 2) {
        cels.push(inflateSync(buffer.subarray(payload + 20, chunkEnd)));
      }
      chunkOffset = chunkEnd;
    }
    const counts = new Map();
    for (const raw of cels) {
      for (let i = 0; i < raw.length; i += 4) {
        if (!raw[i + 3]) continue;
        const hex = `#${[raw[i], raw[i + 1], raw[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        counts.set(hex, (counts.get(hex) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([hex]) => hex);
  } catch {
    return [];
  }
}

function hash2(x, y, salt) {
  let h = 2166136261;
  h ^= x + 374761393; h = Math.imul(h, 16777619);
  h ^= y + 668265263; h = Math.imul(h, 16777619);
  h ^= salt + 1274126177; h = Math.imul(h, 16777619);
  return (h >>> 0) / 4294967295;
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function paletteToRgb(palette) {
  return [
    (palette.core >> 16) & 0xff,
    (palette.core >> 8) & 0xff,
    palette.core & 0xff,
  ];
}

function lambertRgb(palette, nx, ny, nz) {
  const core = paletteToRgb(palette);
  const lit = [
    (palette.lit >> 16) & 0xff,
    (palette.lit >> 8) & 0xff,
    palette.lit & 0xff,
  ];
  const shadow = [
    (palette.shadow >> 16) & 0xff,
    (palette.shadow >> 8) & 0xff,
    palette.shadow & 0xff,
  ];
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const dot = Math.max(0, nz / len);
  const shade = 0.32 + dot * 0.68;
  const accent = dot > 0.72 ? lit : shadow;
  const t = Math.min(1, Math.abs(nx) * 0.18 + Math.abs(ny) * 0.12);
  return [
    Math.min(255, mix(mix(shadow[0], core[0], shade), accent[0], t * 0.35)),
    Math.min(255, mix(mix(shadow[1], core[1], shade), accent[1], t * 0.35)),
    Math.min(255, mix(mix(shadow[2], core[2], shade), accent[2], t * 0.35)),
  ];
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function pointInTri(px, py, ax, ay, bx, by, cx, cy) {
  const c1 = cross(bx - ax, by - ay, px - ax, py - ay);
  const c2 = cross(cx - bx, cy - by, px - bx, py - by);
  const c3 = cross(ax - cx, ay - cy, px - cx, py - cy);
  const hasNeg = (c1 < 0) || (c2 < 0) || (c3 < 0);
  const hasPos = (c1 > 0) || (c2 > 0) || (c3 > 0);
  return !(hasNeg && hasPos);
}

function tileGeometry() {
  const { tw, th, depth, centerX: cx, centerY: cy } = COMBAT_ISO_TILE;
  const p1 = { x: cx, y: cy - th / 2 };
  const p2 = { x: cx + tw / 2, y: cy };
  const p3 = { x: cx, y: cy + th / 2 };
  const p4 = { x: cx - tw / 2, y: cy };
  const p3d = { x: p3.x, y: p3.y + depth };
  const p4d = { x: p4.x, y: p4.y + depth };
  const p2d = { x: p2.x, y: p2.y + depth };
  return { cx, cy, tw, th, depth, p1, p2, p3, p4, p2d, p3d, p4d };
}

function classifyPixel(x, y, geom) {
  const { p1, p2, p3, p4, p2d, p3d, p4d } = geom;
  if (
    pointInTri(x, y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y)
    || pointInTri(x, y, p1.x, p1.y, p3.x, p3.y, p4.x, p4.y)
  ) {
    return 'top';
  }
  if (pointInTri(x, y, p4.x, p4.y, p3.x, p3.y, p3d.x, p3d.y)
    || pointInTri(x, y, p4.x, p4.y, p3d.x, p3d.y, p4d.x, p4d.y)) {
    return 'left';
  }
  if (pointInTri(x, y, p3.x, p3.y, p2.x, p2.y, p2d.x, p2d.y)
    || pointInTri(x, y, p3.x, p3.y, p2d.x, p2d.y, p3d.x, p3d.y)) {
    return 'right';
  }
  return null;
}

function topGrassColor(x, y, geom, seed) {
  const { cx, cy, tw, th } = geom;
  const nx = (x - cx) / (tw / 2);
  const ny = (y - cy) / (th / 2);
  const noise = hash2(x, y, seed);
  const fine = hash2(x * 2, y * 3, seed + 17);
  const blade = hash2(x + y * 2, y - x, seed + 41) > 0.84;
  const tuft = hash2(x * 5, y * 7, seed + 59) > 0.93;
  const streak = ((x * 2 + y * 5 + Math.floor(seed)) % 11) < 1;

  let rgb = lambertRgb(TOP_PALETTE, nx * 0.35, ny * 0.35, 1);
  const bright = paletteToRgb({ core: TOP_PALETTE.shine });
  const dark = paletteToRgb({ core: TOP_PALETTE.rim });

  const t = noise * 0.22 + fine * 0.12;
  rgb = [
    mix(rgb[0], bright[0], t * 0.5),
    mix(rgb[1], bright[1], t * 0.5),
    mix(rgb[2], bright[2], t * 0.35),
  ];

  if (blade) {
    rgb = [
      mix(rgb[0], bright[0], 0.45),
      mix(rgb[1], bright[1], 0.55),
      mix(rgb[2], dark[2], 0.15),
    ];
  }
  if (tuft) {
    rgb = [
      mix(rgb[0], dark[0], 0.25),
      mix(rgb[1], dark[1], 0.2),
      mix(rgb[2], dark[2], 0.15),
    ];
  }
  if (streak) {
    rgb = [mix(rgb[0], dark[0], 0.18), mix(rgb[1], dark[1], 0.18), mix(rgb[2], dark[2], 0.12)];
  }

  return rgb;
}

function sideColor(x, y, face, geom, seed) {
  const { p3, p4, depth } = geom;
  const palette = face === 'left' ? SIDE_LEFT_PALETTE : SIDE_RIGHT_PALETTE;
  const band = Math.floor((y - p3.y) / Math.max(1, depth / 2));
  const grain = hash2(x, y, seed + (face === 'left' ? 3 : 9));
  const nx = face === 'left' ? -0.75 : 0.75;
  const ny = 0.45;
  const nz = 0.35;
  let rgb = lambertRgb(palette, nx, ny, nz);
  if (band % 2 === 0) {
    rgb = [mix(rgb[0], rgb[0] + 12, 0.3), mix(rgb[1], rgb[1] + 8, 0.3), mix(rgb[2], rgb[2] + 6, 0.3)];
  }
  if (grain > 0.88) {
    rgb = [mix(rgb[0], 30, 0.2), mix(rgb[1], 24, 0.2), mix(rgb[2], 16, 0.2)];
  }
  const rootShadow = (y - p3.y) / depth;
  rgb = [
    mix(rgb[0], 18, rootShadow * 0.25),
    mix(rgb[1], 14, rootShadow * 0.25),
    mix(rgb[2], 10, rootShadow * 0.25),
  ];
  return rgb.map((v) => Math.max(0, Math.min(255, v)));
}

function buildCombatGrassTile(seed = 1) {
  const { width, height } = COMBAT_ISO_TILE;
  const rgba = Buffer.alloc(width * height * 4);
  const geom = tileGeometry();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const face = classifyPixel(x, y, geom);
      if (!face) continue;
      const rgb = face === 'top'
        ? topGrassColor(x, y, geom, seed)
        : sideColor(x, y, face, geom, seed);
      const i = (y * width + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }

  drawTopRim(rgba, width, geom);
  return rgba;
}

function drawTopRim(rgba, width, geom) {
  const { p1, p2, p3, p4 } = geom;
  const rim = paletteToRgb({ core: TOP_PALETTE.lit });
  const edgePixels = [
    ...bresenham(p1.x, p1.y, p2.x, p2.y),
    ...bresenham(p2.x, p2.y, p3.x, p3.y),
    ...bresenham(p3.x, p3.y, p4.x, p4.y),
    ...bresenham(p4.x, p4.y, p1.x, p1.y),
  ];
  for (const [x, y] of edgePixels) {
    setPixel(rgba, width, x, y, rim, 200);
  }
}

function bresenham(x0, y0, x1, y1) {
  const points = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    points.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return points;
}

function clone(rgba) {
  return Buffer.from(rgba);
}

function getPixel(rgba, width, x, y) {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}

function setPixel(rgba, width, x, y, rgb, alpha = 255) {
  const height = rgba.length / (width * 4);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  const srcA = alpha / 255;
  const dstA = rgba[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    rgba[i + c] = Math.round((rgb[c] * srcA + rgba[i + c] * dstA * (1 - srcA)) / outA);
  }
  rgba[i + 3] = Math.round(outA * 255);
}

function isTopPlantable(rgba, width, x, y) {
  const [r, g, b, a] = getPixel(rgba, width, x, y);
  if (!a) return false;
  if (g < 50 || g < r + 6) return false;
  const { cx, cy, tw, th } = COMBAT_ISO_TILE;
  const dx = Math.abs(x - cx) / (tw / 2);
  const dy = Math.abs(y - cy) / (th / 2);
  return dx + dy <= 0.92 && y <= cy + th * 0.15;
}

function stampPixels(rgba, width, points) {
  for (const [x, y, rgb, alpha] of points) {
    setPixel(rgba, width, x, y, rgb, alpha ?? 255);
  }
}

function drawGrassBlade(rgba, width, x, baseY, height, rgb, lean = 0) {
  const points = [];
  for (let step = 0; step < height; step += 1) {
    const fade = step / Math.max(1, height - 1);
    const px = x + Math.round(lean * step);
    const py = baseY - step;
    const tone = [
      mix(rgb[0], FOLIAGE.grassBright[0], fade * 0.7),
      mix(rgb[1], FOLIAGE.grassBright[1], fade * 0.7),
      mix(rgb[2], FOLIAGE.grassBright[2], fade * 0.4),
    ];
    points.push([px, py, tone]);
    if (step > 0) points.push([px + (lean >= 0 ? 1 : -1), py, FOLIAGE.grassMid]);
  }
  stampPixels(rgba, width, points);
}

function applyTufts(rgba, width, height, seed) {
  for (let n = 0; n < 14; n += 1) {
    const x = 14 + Math.floor(hash2(n, seed, 11) * 52);
    const baseY = 8 + Math.floor(hash2(n, seed, 29) * 14);
    if (!isTopPlantable(rgba, width, x, baseY)) continue;
    const bladeH = 4 + Math.floor(hash2(n, seed, 37) * 4);
    const lean = hash2(n, seed, 51) > 0.5 ? 1 : -1;
    drawGrassBlade(rgba, width, x, baseY, bladeH, FOLIAGE.grassAccent, lean);
    if (hash2(n, seed, 61) > 0.45) {
      drawGrassBlade(rgba, width, x - 2, baseY - 1, bladeH - 1, FOLIAGE.grassDark, -lean);
      drawGrassBlade(rgba, width, x + 2, baseY - 1, bladeH - 1, FOLIAGE.grassDark, lean);
    }
  }
}

function applyMoss(rgba, width, height, seed) {
  const cx = 24 + Math.floor(hash2(1, seed, 3) * 32);
  const cy = 8 + Math.floor(hash2(2, seed, 5) * 10);
  const points = [];
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -8; dx <= 8; dx += 1) {
      const el = (dx * dx) / 64 + (dy * dy) / 16;
      if (el > 1) continue;
      const mix = hash2(cx + dx, cy + dy, seed);
      const rgb = mix > 0.55 ? FOLIAGE.mossLit : (mix > 0.25 ? FOLIAGE.moss : FOLIAGE.mossDeep);
      points.push([cx + dx, cy + dy, rgb]);
    }
  }
  stampPixels(rgba, width, points);
}

function applyClover(rgba, width, height, seed) {
  const spots = [
    [24, 12], [40, 10], [52, 14], [32, 16],
  ];
  for (const [bx, by] of spots) {
    const x = bx + (hash2(bx, seed, 7) > 0.5 ? 1 : 0);
    const y = by;
    stampPixels(rgba, width, [
      [x, y, FOLIAGE.grassAccent],
      [x - 2, y, FOLIAGE.grassMid],
      [x + 2, y, FOLIAGE.grassMid],
      [x, y - 2, FOLIAGE.grassBright],
      [x, y + 2, FOLIAGE.grassDark],
      [x - 1, y - 1, FOLIAGE.grassBright],
      [x + 1, y - 1, FOLIAGE.grassBright],
      [x - 1, y + 1, FOLIAGE.grassMid],
      [x + 1, y + 1, FOLIAGE.grassMid],
    ]);
  }
}

function applyFern(rgba, width, height, seed) {
  const x = 34 + Math.floor(hash2(seed, 4, 9) * 12);
  const y = 16;
  const frond = [];
  for (let step = 0; step < 12; step += 1) {
    const py = y - step;
    frond.push([x, py, FOLIAGE.stem]);
    frond.push([x - 1 - Math.floor(step / 4), py - 1, FOLIAGE.grassAccent]);
    frond.push([x + 1 + Math.floor(step / 4), py - 1, FOLIAGE.grassAccent]);
    if (step % 2 === 0) {
      frond.push([x - 2 - Math.floor(step / 3), py - 2, FOLIAGE.grassBright]);
      frond.push([x + 2 + Math.floor(step / 3), py - 2, FOLIAGE.grassBright]);
    }
  }
  stampPixels(rgba, width, frond);
}

function applyWildflower(rgba, width, height, seed) {
  const stems = [
    { x: 20, color: FOLIAGE.flowerYellow },
    { x: 48, color: FOLIAGE.flowerPurple },
    { x: 36, color: FOLIAGE.flowerWhite },
    { x: 58, color: FOLIAGE.flowerYellow },
  ];
  for (const stem of stems) {
    const x = stem.x + (hash2(stem.x, seed, 13) > 0.7 ? 1 : 0);
    const base = 14 + Math.floor(hash2(stem.x, seed, 17) * 4);
    const bloom = [];
    for (let s = 0; s < 6; s += 1) bloom.push([x, base - s, FOLIAGE.stem]);
    bloom.push([x, base - 7, stem.color]);
    bloom.push([x - 2, base - 8, stem.color]);
    bloom.push([x + 2, base - 8, stem.color]);
    bloom.push([x, base - 9, stem.color]);
    bloom.push([x, base - 8, FOLIAGE.flowerCenter]);
    stampPixels(rgba, width, bloom);
  }
}

function applyLeafLitter(rgba, width, height, seed) {
  const points = [];
  for (let n = 0; n < 22; n += 1) {
    const x = 10 + Math.floor(hash2(n, seed, 17) * 60);
    const y = 8 + Math.floor(hash2(n, seed, 19) * 12);
    if (!isTopPlantable(rgba, width, x, y)) continue;
    const rgb = hash2(x, y, seed) > 0.5 ? FOLIAGE.leafTan : FOLIAGE.leafBrown;
    points.push([x, y, rgb]);
    points.push([x + 1, y, rgb]);
    if (hash2(y, x, seed) > 0.5) points.push([x, y + 1, FOLIAGE.leafBrown]);
  }
  stampPixels(rgba, width, points);
}

function applyPebbles(rgba, width, height, seed) {
  const clusters = [
    [22, 14], [38, 12], [50, 15], [30, 10],
  ];
  const points = [];
  for (const [bx, by] of clusters) {
    const tone = hash2(bx, by, seed) > 0.5 ? FOLIAGE.stone : FOLIAGE.stoneDark;
    points.push([bx, by, tone]);
    points.push([bx + 1, by, FOLIAGE.stoneDark]);
    points.push([bx + 2, by, FOLIAGE.stoneLit]);
    points.push([bx, by + 1, FOLIAGE.stone]);
    points.push([bx + 1, by + 1, FOLIAGE.stoneDark]);
  }
  stampPixels(rgba, width, points);
}

function applyMushroom(rgba, width, height, seed) {
  const x = 36 + Math.floor(hash2(seed, 2, 23) * 10);
  const y = 14;
  stampPixels(rgba, width, [
    [x, y + 1, FOLIAGE.mushroomStem],
    [x, y + 2, FOLIAGE.mushroomStem],
    [x, y + 3, FOLIAGE.mushroomStem],
    [x - 2, y, FOLIAGE.mushroomCap],
    [x - 1, y, FOLIAGE.mushroomCap],
    [x, y, FOLIAGE.mushroomCap],
    [x + 1, y, FOLIAGE.mushroomCap],
    [x + 2, y, FOLIAGE.mushroomCap],
    [x, y - 1, FOLIAGE.mushroomCap],
    [x - 1, y - 1, FOLIAGE.mushroomCap],
    [x + 1, y - 1, FOLIAGE.mushroomCap],
    [x, y, FOLIAGE.mushroomSpot],
    [x - 1, y - 1, FOLIAGE.mushroomSpot],
  ]);
}

function applyVines(rgba, width, height, seed) {
  const startX = 18 + Math.floor(hash2(seed, 8, 31) * 44);
  let x = startX;
  let y = 16;
  const points = [];
  for (let step = 0; step < 18; step += 1) {
    points.push([x, y, FOLIAGE.vine]);
    points.push([x + 1, y, FOLIAGE.grassDark]);
    if (step % 3 === 0) {
      points.push([x + 2, y - 1, FOLIAGE.grassAccent]);
      points.push([x - 1, y - 1, FOLIAGE.grassAccent]);
    }
    x += hash2(step, seed, 43) > 0.5 ? 1 : -1;
    y -= 1;
  }
  stampPixels(rgba, width, points);
}

function applyDense(rgba, width, height, seed) {
  applyTufts(rgba, width, height, seed + 1);
  applyMoss(rgba, width, height, seed + 2);
  applyClover(rgba, width, height, seed + 3);
  applyFern(rgba, width, height, seed + 4);
  applyWildflower(rgba, width, height, seed + 5);
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filePath, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(filePath, Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function rgbaToCells(rgba, width, height) {
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!rgba[i + 3]) continue;
      cells.push({
        x,
        y,
        color: `#${[rgba[i], rgba[i + 1], rgba[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`,
        alpha: rgba[i + 3] / 255,
      });
    }
  }
  return cells;
}

function buildSheet(width, height, variants) {
  const sheetW = width * variants.length;
  const sheet = Buffer.alloc(sheetW * height * 4);
  variants.forEach((variant, index) => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const si = (y * width + x) * 4;
        const di = (y * sheetW + (index * width + x)) * 4;
        variant.rgba.copy(sheet, di, si, si + 4);
      }
    }
  });
  return sheet;
}

function main() {
  const { width, height, tw, th, depth } = COMBAT_ISO_TILE;
  const referenceSwatches = decodeReferencePalette(readFileSync(SRC));
  const base = buildCombatGrassTile(4242);

  mkdirSync(OUT_DIR, { recursive: true });

  const variants = VARIATIONS.map((spec, index) => {
    const rgba = clone(base);
    spec.apply?.(rgba, width, height, index * 97 + 13);
    const pngPath = resolve(OUT_DIR, exportPngName(spec.label));
    writePng(pngPath, width, height, rgba);
    return { ...spec, rgba, pngPath };
  });

  writePng(resolve(OUT_DIR, 'Grass Tile Sheet.png'), width * variants.length, height, buildSheet(width, height, variants));

  const baseCells = rgbaToCells(base, width, height);
  const frames = variants.map((variant, frameIndex) => {
    const overlayCells = [];
    if (variant.id !== 'grass-plain') {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          if (!variant.rgba[i + 3]) continue;
          if (
            base[i] === variant.rgba[i]
            && base[i + 1] === variant.rgba[i + 1]
            && base[i + 2] === variant.rgba[i + 2]
            && base[i + 3] === variant.rgba[i + 3]
          ) continue;
          overlayCells.push({
            x,
            y,
            color: `#${[variant.rgba[i], variant.rgba[i + 1], variant.rgba[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`,
            alpha: variant.rgba[i + 3] / 255,
          });
        }
      }
    }
    return {
      frame: frameIndex,
      duration: 100,
      layers: [
        { name: '10_Grass_Base', cells: baseCells },
        { name: '20_Foliage', cells: overlayCells },
      ],
    };
  });

  writeFileSync(OUT_ASE, encodeAsepriteBinary({ width, height, frames }));
  writeFileSync(OUT_MANIFEST, `${JSON.stringify({
    version: 'combat-iso-grass-v2',
    combatMetrics: { tw, th, depth, spriteWidth: width, spriteHeight: height },
    reference: 'docs/references/Grass Tile Isometric.aseprite',
    referencePaletteSample: referenceSwatches,
    sceneAlignment: ['CombatArenaScene', 'PolarisForestScene'],
    variations: variants.map((v) => ({ id: v.id, label: v.label, file: exportPngName(v.label) })),
    sheet: 'Grass Tile Sheet.png',
    aseprite: 'Grass Tile Variations.aseprite',
  }, null, 2)}\n`);

  console.log(`[grass-tiles] combat iso ${tw}x${th}+${depth} → ${width}x${height} sprite`);
  console.log(`[grass-tiles] ${variants.length} variations → ${OUT_DIR}`);
  for (const variant of variants) console.log(`  - ${exportPngName(variant.label)}`);
}

main();