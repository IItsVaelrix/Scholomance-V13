#!/usr/bin/env node
/**
 * Procedural water isometric tiles at combat arena dimensions (80×40 + 5px depth).
 * Matches CombatArenaScene / PolarisForestScene footprint.
 *
 * Usage:
 *   node scripts/generate-water-tile-variations.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { encodeAsepriteBinary } from '../codex/core/pixelbrain/aseprite-binary-codec.js';
import { COMBAT_ISO_TILE } from './generate-grass-tile-variations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REF_DIR = resolve(ROOT, 'docs/references');
const OUT_DIR = REF_DIR;
const OUT_ASE = resolve(REF_DIR, 'Water Tile Variations.aseprite');
const OUT_MANIFEST = resolve(REF_DIR, 'Water Tile Manifest.json');

const SURFACE_PALETTE = Object.freeze({
  shine: 0x88eeff,
  lit: 0x55ccee,
  core: 0x3388bb,
  rim: 0x2266aa,
  shadow: 0x144466,
});

const DEPTH_LEFT_PALETTE = Object.freeze({
  shine: 0x2a6088,
  lit: 0x1e4a70,
  core: 0x143858,
  rim: 0x0c2840,
  shadow: 0x061828,
});

const DEPTH_RIGHT_PALETTE = Object.freeze({
  shine: 0x3478a0,
  lit: 0x285c88,
  core: 0x1c4468,
  rim: 0x103050,
  shadow: 0x081c30,
});

const ACCENT = Object.freeze({
  foam: [228, 244, 255],
  foamShadow: [180, 210, 230],
  caustic: [160, 230, 255],
  deep: [16, 48, 72],
  shallow: [100, 190, 220],
  sonicGlow: [68, 232, 192],
  sonicDeep: [34, 120, 140],
  lilyPad: [52, 120, 58],
  lilyPadLit: [88, 168, 72],
  lilyFlower: [240, 220, 255],
  reed: [58, 110, 48],
  reedDark: [40, 78, 34],
  stone: [72, 92, 108],
  stoneLit: [110, 130, 148],
  murk: [48, 72, 58],
  murkLit: [68, 98, 72],
  bubble: [200, 240, 255],
});

const VARIATIONS = [
  { id: 'water-plain', label: 'Plain', apply: null },
  { id: 'water-ripples', label: 'Ripples', apply: applyRipples },
  { id: 'water-shallow', label: 'Shallow', apply: applyShallow },
  { id: 'water-deep', label: 'Deep Pool', apply: applyDeep },
  { id: 'water-current', label: 'Current', apply: applyCurrent },
  { id: 'water-foam', label: 'Foam Edge', apply: applyFoam },
  { id: 'water-lily', label: 'Lily Pads', apply: applyLilyPads },
  { id: 'water-reeds', label: 'Reeds', apply: applyReeds },
  { id: 'water-stones', label: 'Submerged Stones', apply: applyStones },
  { id: 'water-sonic', label: 'Sonic Glow', apply: applySonic },
  { id: 'water-murky', label: 'Murky', apply: applyMurky },
  { id: 'water-dense', label: 'Dense Detail', apply: applyDense },
];

function exportPngName(label) {
  if (label === 'Plain') return 'Water Tile Plain.png';
  if (label === 'Dense Detail') return 'Water Tile Dense Detail.png';
  if (label === 'Deep Pool') return 'Water Tile Deep Pool.png';
  return `Water Tile ${label}.png`;
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
  const shade = 0.3 + dot * 0.7;
  const accent = dot > 0.7 ? lit : shadow;
  const t = Math.min(1, Math.abs(nx) * 0.16 + Math.abs(ny) * 0.1);
  return [
    Math.min(255, mix(mix(shadow[0], core[0], shade), accent[0], t * 0.4)),
    Math.min(255, mix(mix(shadow[1], core[1], shade), accent[1], t * 0.4)),
    Math.min(255, mix(mix(shadow[2], core[2], shade), accent[2], t * 0.4)),
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
  ) return 'top';
  if (
    pointInTri(x, y, p4.x, p4.y, p3.x, p3.y, p3d.x, p3d.y)
    || pointInTri(x, y, p4.x, p4.y, p3d.x, p3d.y, p4d.x, p4d.y)
  ) return 'left';
  if (
    pointInTri(x, y, p3.x, p3.y, p2.x, p2.y, p2d.x, p2d.y)
    || pointInTri(x, y, p3.x, p3.y, p2d.x, p2d.y, p3d.x, p3d.y)
  ) return 'right';
  return null;
}

function rippleField(x, y, seed, scale = 1) {
  const waveA = Math.sin((x * 0.42 + y * 0.18 + seed) * scale);
  const waveB = Math.sin((x * 0.18 - y * 0.36 + seed * 0.7) * scale * 1.3);
  return (waveA + waveB) * 0.5;
}

function topWaterColor(x, y, geom, seed, style = 'calm') {
  const { cx, cy, tw, th } = geom;
  const nx = (x - cx) / (tw / 2);
  const ny = (y - cy) / (th / 2);
  const dist = Math.sqrt(nx * nx + ny * ny);
  const noise = hash2(x, y, seed);
  const fine = hash2(x * 3, y * 2, seed + 23);

  let rgb = lambertRgb(SURFACE_PALETTE, nx * 0.25, ny * 0.25, 1);
  const shine = paletteToRgb({ core: SURFACE_PALETTE.shine });
  const deep = paletteToRgb({ core: SURFACE_PALETTE.shadow });

  const ripple = rippleField(x, y, seed, style === 'choppy' ? 1.4 : 0.9);
  const caustic = ripple > 0.55 && fine > 0.62;

  rgb = [
    mix(rgb[0], shine[0], Math.max(0, ripple) * 0.35 + noise * 0.08),
    mix(rgb[1], shine[1], Math.max(0, ripple) * 0.4 + noise * 0.1),
    mix(rgb[2], shine[2], Math.max(0, ripple) * 0.25 + noise * 0.06),
  ];

  if (caustic) {
    rgb = [
      mix(rgb[0], ACCENT.caustic[0], 0.45),
      mix(rgb[1], ACCENT.caustic[1], 0.5),
      mix(rgb[2], ACCENT.caustic[2], 0.35),
    ];
  }

  if (style === 'deep' || dist > 0.55) {
    const depthMix = style === 'deep' ? 0.35 + dist * 0.35 : dist * 0.22;
    rgb = [
      mix(rgb[0], deep[0], depthMix),
      mix(rgb[1], deep[1], depthMix),
      mix(rgb[2], deep[2], depthMix),
    ];
  }

  if (style === 'shallow') {
    rgb = [
      mix(rgb[0], ACCENT.shallow[0], 0.28),
      mix(rgb[1], ACCENT.shallow[1], 0.35),
      mix(rgb[2], ACCENT.shallow[2], 0.22),
    ];
  }

  if (style === 'murky') {
    rgb = [
      mix(rgb[0], ACCENT.murk[0], 0.4),
      mix(rgb[1], ACCENT.murk[1], 0.45),
      mix(rgb[2], ACCENT.murk[2], 0.35),
    ];
  }

  if (style === 'sonic') {
    const pulse = rippleField(x, y, seed + 50, 1.1);
    if (pulse > 0.35) {
      rgb = [
        mix(rgb[0], ACCENT.sonicGlow[0], 0.35),
        mix(rgb[1], ACCENT.sonicGlow[1], 0.45),
        mix(rgb[2], ACCENT.sonicDeep[2], 0.25),
      ];
    }
  }

  return rgb;
}

function sideWaterColor(x, y, face, geom, seed) {
  const { p3, depth } = geom;
  const palette = face === 'left' ? DEPTH_LEFT_PALETTE : DEPTH_RIGHT_PALETTE;
  const grain = hash2(x, y, seed + (face === 'left' ? 5 : 11));
  const bubble = hash2(x * 2, y * 3, seed + 71) > 0.94;
  const nx = face === 'left' ? -0.8 : 0.8;
  let rgb = lambertRgb(palette, nx, 0.35, 0.3);
  const depthT = (y - p3.y) / depth;
  rgb = [
    mix(rgb[0], 8, depthT * 0.35),
    mix(rgb[1], 16, depthT * 0.35),
    mix(rgb[2], 28, depthT * 0.35),
  ];
  if (grain > 0.9) {
    rgb = [mix(rgb[0], 40, 0.2), mix(rgb[1], 70, 0.2), mix(rgb[2], 100, 0.2)];
  }
  if (bubble) {
    rgb = [
      mix(rgb[0], ACCENT.bubble[0], 0.55),
      mix(rgb[1], ACCENT.bubble[1], 0.55),
      mix(rgb[2], ACCENT.bubble[2], 0.45),
    ];
  }
  return rgb.map((v) => Math.max(0, Math.min(255, v)));
}

function buildWaterTile(seed = 1, style = 'calm') {
  const { width, height } = COMBAT_ISO_TILE;
  const rgba = Buffer.alloc(width * height * 4);
  const geom = tileGeometry();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const face = classifyPixel(x, y, geom);
      if (!face) continue;
      const rgb = face === 'top'
        ? topWaterColor(x, y, geom, seed, style)
        : sideWaterColor(x, y, face, geom, seed);
      const i = (y * width + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }

  drawSurfaceRim(rgba, width, geom);
  return rgba;
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

function drawSurfaceRim(rgba, width, geom) {
  const { p1, p2, p3, p4 } = geom;
  const rim = paletteToRgb({ core: SURFACE_PALETTE.shine });
  const edgePixels = [
    ...bresenham(p1.x, p1.y, p2.x, p2.y),
    ...bresenham(p2.x, p2.y, p3.x, p3.y),
    ...bresenham(p3.x, p3.y, p4.x, p4.y),
    ...bresenham(p4.x, p4.y, p1.x, p1.y),
  ];
  for (const [x, y] of edgePixels) {
    setPixel(rgba, width, x, y, rim, 180);
  }
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

function isWaterSurface(rgba, width, x, y) {
  const [, g, b, a] = getPixel(rgba, width, x, y);
  if (!a) return false;
  if (b < 80 || b < g) return false;
  const { cx, cy, tw, th } = COMBAT_ISO_TILE;
  const dx = Math.abs(x - cx) / (tw / 2);
  const dy = Math.abs(y - cy) / (th / 2);
  return dx + dy <= 0.95;
}

function stampPixels(rgba, width, points) {
  for (const [x, y, rgb, alpha] of points) {
    setPixel(rgba, width, x, y, rgb, alpha ?? 255);
  }
}

function applyRipples(rgba, width, height, seed) {
  const geom = tileGeometry();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWaterSurface(rgba, width, x, y)) continue;
      const ring = Math.abs(rippleField(x, y, seed, 1.6));
      if (ring < 0.08 || ring > 0.14) continue;
      setPixel(rgba, width, x, y, ACCENT.caustic, 220);
    }
  }
  for (let n = 0; n < 3; n += 1) {
    const cx = 20 + Math.floor(hash2(n, seed, 3) * 40);
    const cy = 8 + Math.floor(hash2(n, seed, 7) * 10);
    for (let r = 2; r <= 10; r += 3) {
      for (let a = 0; a < 24; a += 1) {
        const ang = (a / 24) * Math.PI * 2;
        const px = Math.round(cx + Math.cos(ang) * r * 1.8);
        const py = Math.round(cy + Math.sin(ang) * r * 0.9);
        if (isWaterSurface(rgba, width, px, py)) {
          setPixel(rgba, width, px, py, ACCENT.foamShadow, 160);
        }
      }
    }
  }
}

function applyShallow(rgba, width, height, seed) {
  for (let n = 0; n < 16; n += 1) {
    const x = 12 + Math.floor(hash2(n, seed, 13) * 56);
    const y = 8 + Math.floor(hash2(n, seed, 17) * 12);
    if (!isWaterSurface(rgba, width, x, y)) continue;
    stampPixels(rgba, width, [
      [x, y, ACCENT.shallow],
      [x + 1, y, ACCENT.shallow, 200],
      [x, y + 1, ACCENT.stoneLit, 140],
    ]);
  }
}

function applyDeep(rgba, width, height, seed) {
  const { cx, cy } = tileGeometry();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWaterSurface(rgba, width, x, y)) continue;
      const dx = (x - cx) / 30;
      const dy = (y - cy) / 14;
      if (dx * dx + dy * dy < 0.42) {
        setPixel(rgba, width, x, y, ACCENT.deep, 230);
      }
    }
  }
}

function applyCurrent(rgba, width, height, seed) {
  const points = [];
  for (let stripe = 0; stripe < 8; stripe += 1) {
    const offset = stripe * 9 + Math.floor(hash2(stripe, seed, 29) * 4);
    for (let t = 0; t < 50; t += 1) {
      const x = 6 + t + offset - Math.floor(t / 3);
      const y = 6 + Math.floor(t / 4) + (stripe % 2);
      if (!isWaterSurface(rgba, width, x, y)) continue;
      points.push([x, y, ACCENT.caustic, 200]);
      points.push([x + 1, y, paletteToRgb({ core: SURFACE_PALETTE.lit }), 180]);
    }
  }
  stampPixels(rgba, width, points);
}

function applyFoam(rgba, width, height, seed) {
  const geom = tileGeometry();
  const edgeBands = [
    ...bresenham(geom.p1.x, geom.p1.y, geom.p2.x, geom.p2.y),
    ...bresenham(geom.p4.x, geom.p4.y, geom.p1.x, geom.p1.y),
  ];
  const points = [];
  for (const [ex, ey] of edgeBands) {
    for (let d = 1; d <= 3; d += 1) {
      const px = ex + (ex < geom.cx ? 1 : -1) * d;
      const py = ey + 1;
      if (!isWaterSurface(rgba, width, px, py)) continue;
      points.push([px, py, hash2(px, py, seed) > 0.5 ? ACCENT.foam : ACCENT.foamShadow, 220]);
    }
  }
  stampPixels(rgba, width, points);
}

function drawLilyPad(rgba, width, cx, cy) {
  const points = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      if ((dx * dx) / 16 + (dy * dy) / 4 > 1) continue;
      const rgb = dy < 0 ? ACCENT.lilyPadLit : ACCENT.lilyPad;
      points.push([cx + dx, cy + dy, rgb]);
    }
  }
  points.push([cx, cy - 3, ACCENT.lilyFlower]);
  points.push([cx - 1, cy - 4, ACCENT.lilyFlower, 200]);
  points.push([cx + 1, cy - 4, ACCENT.lilyFlower, 200]);
  stampPixels(rgba, width, points);
}

function applyLilyPads(rgba, width, height, seed) {
  const pads = [
    [24, 12], [42, 10], [54, 14], [34, 15],
  ];
  for (const [bx, by] of pads) {
    drawLilyPad(rgba, width, bx + (hash2(bx, seed, 3) > 0.5 ? 1 : 0), by);
  }
}

function applyReeds(rgba, width, height, seed) {
  const clusters = [
    [16, 18], [28, 17], [58, 18], [48, 17],
  ];
  for (const [bx, by] of clusters) {
    const x = bx + Math.floor(hash2(bx, seed, 9) * 3);
    for (let h = 0; h < 14; h += 1) {
      const lean = Math.floor(h / 5);
      const rgb = h > 10 ? ACCENT.reed : ACCENT.reedDark;
      setPixel(rgba, width, x + lean, by - h, rgb, h > 11 ? 200 : 255);
      if (h % 3 === 0) setPixel(rgba, width, x + lean + 1, by - h, ACCENT.reedDark, 180);
    }
  }
}

function applyStones(rgba, width, height, seed) {
  const stones = [
    { x: 26, y: 13, r: 3 },
    { x: 40, y: 11, r: 4 },
    { x: 52, y: 14, r: 2 },
    { x: 32, y: 15, r: 3 },
  ];
  for (const stone of stones) {
    for (let dy = -stone.r; dy <= stone.r; dy += 1) {
      for (let dx = -stone.r * 2; dx <= stone.r * 2; dx += 1) {
        if ((dx * dx) / ((stone.r * 2) ** 2) + (dy * dy) / (stone.r ** 2) > 1) continue;
        const px = stone.x + dx;
        const py = stone.y + dy;
        if (!isWaterSurface(rgba, width, px, py)) continue;
        const tone = hash2(px, py, seed) > 0.5 ? ACCENT.stone : ACCENT.stoneLit;
        setPixel(rgba, width, px, py, tone, 190);
      }
    }
  }
}

function applySonic(rgba, width, height, seed) {
  const { cx, cy } = tileGeometry();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWaterSurface(rgba, width, x, y)) continue;
      const pulse = rippleField(x, y, seed + 88, 1.2);
      if (pulse > 0.42) {
        setPixel(rgba, width, x, y, ACCENT.sonicGlow, 210);
      }
    }
  }
  for (let ring = 0; ring < 4; ring += 1) {
    const radius = 6 + ring * 4;
    for (let a = 0; a < 32; a += 1) {
      const ang = (a / 32) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(ang) * radius * 1.6);
      const py = Math.round(cy + Math.sin(ang) * radius * 0.8);
      if (isWaterSurface(rgba, width, px, py)) {
        setPixel(rgba, width, px, py, ACCENT.sonicGlow, 160);
      }
    }
  }
}

function applyMurky(rgba, width, height, seed) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isWaterSurface(rgba, width, x, y)) continue;
      if (hash2(x, y, seed + 33) > 0.7) {
        setPixel(rgba, width, x, y, ACCENT.murkLit, 200);
      }
    }
  }
  applyStones(rgba, width, height, seed + 1);
}

function applyDense(rgba, width, height, seed) {
  applyRipples(rgba, width, height, seed + 1);
  applyLilyPads(rgba, width, height, seed + 2);
  applyReeds(rgba, width, height, seed + 3);
  applyFoam(rgba, width, height, seed + 4);
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

const BASE_STYLE = {
  'water-plain': 'calm',
  'water-ripples': 'choppy',
  'water-shallow': 'shallow',
  'water-deep': 'deep',
  'water-current': 'calm',
  'water-foam': 'calm',
  'water-lily': 'calm',
  'water-reeds': 'calm',
  'water-stones': 'calm',
  'water-sonic': 'sonic',
  'water-murky': 'murky',
  'water-dense': 'calm',
};

function main() {
  const { width, height, tw, th, depth } = COMBAT_ISO_TILE;
  mkdirSync(OUT_DIR, { recursive: true });

  const baseById = new Map();
  for (const spec of VARIATIONS) {
    const style = BASE_STYLE[spec.id] || 'calm';
    baseById.set(spec.id, buildWaterTile(5100 + spec.id.length * 17, style));
  }
  const plainBase = baseById.get('water-plain');

  const variants = VARIATIONS.map((spec, index) => {
    const rgba = clone(baseById.get(spec.id));
    spec.apply?.(rgba, width, height, index * 89 + 17);
    const pngPath = resolve(OUT_DIR, exportPngName(spec.label));
    writePng(pngPath, width, height, rgba);
    return { ...spec, rgba, pngPath };
  });

  writePng(resolve(OUT_DIR, 'Water Tile Sheet.png'), width * variants.length, height, buildSheet(width, height, variants));

  const baseCells = rgbaToCells(plainBase, width, height);
  const frames = variants.map((variant, frameIndex) => {
    const base = baseById.get(variant.id);
    const overlayCells = [];
    if (variant.id !== 'water-plain') {
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
        { name: '10_Water_Base', cells: rgbaToCells(base, width, height) },
        { name: '20_Surface_Detail', cells: overlayCells },
      ],
    };
  });

  writeFileSync(OUT_ASE, encodeAsepriteBinary({ width, height, frames }));
  writeFileSync(OUT_MANIFEST, `${JSON.stringify({
    version: 'combat-iso-water-v1',
    combatMetrics: { tw, th, depth, spriteWidth: width, spriteHeight: height },
    terrainType: 'water',
    sceneAlignment: ['CombatArenaScene', 'PolarisForestScene'],
    variations: variants.map((v) => ({ id: v.id, label: v.label, file: exportPngName(v.label) })),
    sheet: 'Water Tile Sheet.png',
    aseprite: 'Water Tile Variations.aseprite',
  }, null, 2)}\n`);

  console.log(`[water-tiles] combat iso ${tw}x${th}+${depth} → ${width}x${height} sprite`);
  console.log(`[water-tiles] ${variants.length} variations → ${OUT_DIR}`);
  for (const variant of variants) console.log(`  - ${exportPngName(variant.label)}`);
}

main();