/**
 * Pass 3 — tier-based value shading for Pine Tree Isometric.aseprite
 * Follows the 6-step shading guide (base values → shadow → highlight → smooth → trunk → validate).
 *
 * Usage:
 *   node scripts/shade-pine-tree-pass3.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import sharp from 'sharp';
import { encodeAsepriteBinary } from '../codex/core/pixelbrain/aseprite-binary-codec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INPUT = resolve(ROOT, 'docs/references/trees/Pine Tree Isometric.aseprite');
const BACKUP = resolve(ROOT, 'docs/references/trees/Pine Tree Isometric.before-pass3.aseprite');
const OUT_DIR = resolve(ROOT, 'docs/references/trees');
const DIAG = resolve(OUT_DIR, 'Pine Tree Isometric.pass3.diagnostics.json');

const FRAME_NAMES = ['Base Pine', 'Snow Cap', 'Ember Autumn', 'Void Corrupted'];
const ASE_MAGIC = 0xA5E0;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;

/** 4-value green ladder + rim (Base Pine / Snow foliage) */
const GREEN_LADDER = [
  { r: 10, g: 31, b: 20 },   // 0 darkest underside
  { r: 18, g: 43, b: 29 },   // 1 shadow
  { r: 30, g: 68, b: 48 },   // 2 mid body
  { r: 46, g: 92, b: 63 },   // 3 highlight
  { r: 107, g: 168, b: 112 }, // 4 rim / top edge
  { r: 128, g: 187, b: 133 }, // 5 star glow / snow sparkle neighbor
];

const STAR_CORE = { r: 255, g: 240, b: 150 };
const STAR_GLOW = { r: 255, g: 220, b: 100 };
const STAR_RIM = { r: 255, g: 200, b: 80 };
const SNOW = { r: 232, g: 244, b: 255 };
const SNOW_SPARK = { r: 255, g: 252, b: 220 };

const TRUNK_SHADOW = { r: 48, g: 28, b: 14 };
const TRUNK_MID = { r: 88, g: 52, b: 28 };
const TRUNK_LIGHT = { r: 118, g: 72, b: 38 };
const TRUNK_TEXTURE = { r: 68, g: 40, b: 20 };
const ROOT_SHADOW = { r: 32, g: 18, b: 10 };

const FOLIAGE_TIERS = [
  { top: 8, bottom: 26 },
  { top: 27, bottom: 47 },
  { top: 48, bottom: 64 },
  { top: 65, bottom: 84 },
];
const TRUNK_TOP = 85;
const CENTER_X = 40;

function u16(buf, o) { return buf[o] | (buf[o + 1] << 8); }
function u32(buf, o) { return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24); }
function i16(buf, o) { const v = u16(buf, o); return v > 0x7fff ? v - 0x10000 : v; }
function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function rgbaToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
}

function readString(buf, offset) {
  const len = u16(buf, offset);
  const start = offset + 2;
  return { value: new TextDecoder().decode(buf.subarray(start, start + len)), offset: start + len };
}

function decodeAsepriteFrames(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 128 || u16(buffer, 4) !== ASE_MAGIC) throw new Error('Invalid Aseprite file');
  const framesCount = u16(buffer, 6);
  const width = u16(buffer, 8);
  const height = u16(buffer, 10);
  const layers = [];
  const frames = [];
  let offset = 128;

  for (let frameIndex = 0; frameIndex < framesCount; frameIndex += 1) {
    const frameBytes = u32(buffer, offset);
    const frameEnd = offset + frameBytes;
    const chunkCount = u32(buffer, offset + 12) || u16(buffer, offset + 6);
    let chunkOffset = offset + 16;

    for (let chunkIndex = 0; chunkIndex < chunkCount && chunkOffset < frameEnd; chunkIndex += 1) {
      const chunkSize = u32(buffer, chunkOffset);
      const type = u16(buffer, chunkOffset + 4);
      const payload = chunkOffset + 6;
      const chunkEnd = chunkOffset + chunkSize;

      if (type === CHUNK_LAYER) {
        const name = readString(buffer, payload + 16);
        layers.push({ name: name.value || 'Layer', cells: [] });
      } else if (type === CHUNK_CEL) {
        const layerIndex = u16(buffer, payload);
        const celX = i16(buffer, payload + 2);
        const celY = i16(buffer, payload + 4);
        const celType = u16(buffer, payload + 7);
        const celW = u16(buffer, payload + 16);
        const celH = u16(buffer, payload + 18);
        const dataOffset = payload + 20;
        let rgba;
        if (celType === 0) rgba = Buffer.from(buffer.subarray(dataOffset, dataOffset + celW * celH * 4));
        else if (celType === 2) rgba = inflateSync(buffer.subarray(dataOffset, chunkEnd));
        else { chunkOffset = chunkEnd; continue; }

        const layer = layers[layerIndex] || { name: `Layer ${layerIndex + 1}`, cells: [] };
        layers[layerIndex] = layer;
        layer.cells = [];
        for (let py = 0; py < celH; py += 1) {
          for (let px = 0; px < celW; px += 1) {
            const idx = (py * celW + px) * 4;
            if (!rgba[idx + 3]) continue;
            layer.cells.push({
              x: celX + px,
              y: celY + py,
              color: rgbaToHex(rgba[idx], rgba[idx + 1], rgba[idx + 2]),
            });
          }
        }
      }
      chunkOffset = chunkEnd;
    }

    frames.push({
      frame: frameIndex,
      duration: u16(buffer, offset + 8) || 120,
      layers: layers.map((layer) => ({ name: layer.name, cells: [...layer.cells] })),
    });
    offset = frameEnd;
  }
  return { width, height, frames };
}

function cellsToRgba(cells, width, height) {
  const rgba = Buffer.alloc(width * height * 4, 0);
  for (const cell of cells) {
    const idx = (cell.y * width + cell.x) * 4;
    const rgb = hexToRgb(cell.color);
    if (!rgb) continue;
    rgba[idx] = rgb.r;
    rgba[idx + 1] = rgb.g;
    rgba[idx + 2] = rgb.b;
    rgba[idx + 3] = 255;
  }
  return rgba;
}

function rgbaToCells(rgba, width, height, layerName) {
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (!rgba[idx + 3]) continue;
      cells.push({
        x, y,
        color: rgbaToHex(rgba[idx], rgba[idx + 1], rgba[idx + 2]),
        emphasis: 1,
        metadata: { partId: layerName, source: 'pine_tree_pass3' },
      });
    }
  }
  return cells;
}

function getPixel(rgba, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const idx = (y * width + x) * 4;
  if (!rgba[idx + 3]) return null;
  return { r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2], idx };
}

function setPixel(rgba, width, x, y, color, a = 255) {
  const idx = (y * width + x) * 4;
  rgba[idx] = color.r;
  rgba[idx + 1] = color.g;
  rgba[idx + 2] = color.b;
  rgba[idx + 3] = a;
}

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function isSnow(r, g, b) {
  return r > 200 && g > 215 && b > 230;
}

function isStar(r, g, b) {
  return r > 200 && g > 170 && b < 170;
}

function isTrunkPixel(y, x, width, height, r, g, b) {
  if (y < TRUNK_TOP) return false;
  if (Math.abs(x - CENTER_X) > 5) return false;
  if (isSnow(r, g, b) || isStar(r, g, b)) return false;
  return lum(r, g, b) < 200;
}

function tierAt(y) {
  return FOLIAGE_TIERS.find((t) => y >= t.top && y <= t.bottom) || null;
}

function buildHueLadder(r, g, b, steps = 4) {
  const baseLum = lum(r, g, b);
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const scale = 0.45 + t * 0.75;
    out.push({
      r: clampByte(r * scale),
      g: clampByte(g * scale),
      b: clampByte(b * scale),
    });
  }
  out.push({
    r: clampByte(Math.min(255, r * 1.15 + 18)),
    g: clampByte(Math.min(255, g * 1.12 + 22)),
    b: clampByte(Math.min(255, b * 1.1 + 16)),
  });
  return out;
}

function classifyFoliageLevel(x, y, tier, width, isTopRim, isRightRim) {
  const tierH = tier.bottom - tier.top + 1;
  const tierT = (y - tier.top) / Math.max(1, tierH - 1);
  const relX = (x - CENTER_X) / Math.max(8, width * 0.45);

  if (isTopRim) return 4;
  if (tierT >= 0.66 || relX <= -0.28) return 0;
  if (tierT >= 0.45 && relX <= -0.05) return 1;
  if (tierT <= 0.34 || relX >= 0.22 || isRightRim) return 3;
  return 2;
}

function enforceSymmetry(rgba, width, height) {
  let fixed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mx = width - x;
      if (mx <= x) continue;
      const left = getPixel(rgba, width, height, x, y);
      const right = getPixel(rgba, width, height, mx, y);
      const master = right || left;
      if (!master) continue;
      if (left && right && left.r === right.r && left.g === right.g && left.b === right.b) continue;
      setPixel(rgba, width, x, y, master);
      setPixel(rgba, width, mx, y, master);
      fixed += 1;
    }
  }
  return fixed;
}

function shadeFoliage(rgba, width, height, frameIndex) {
  const levels = Buffer.alloc(width * height, -1);
  const stats = { shadow: 0, mid: 0, highlight: 0, rim: 0 };

  const useGreenLadder = frameIndex <= 1;
  const sample = getPixel(rgba, width, height, CENTER_X, 40) || { r: 30, g: 68, b: 48 };
  const hueLadder = buildHueLadder(sample.r, sample.g, sample.b);
  const ladder = useGreenLadder ? GREEN_LADDER : hueLadder;

  for (let y = 0; y < TRUNK_TOP; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px) continue;
      if (isSnow(px.r, px.g, px.b) || isStar(px.r, px.g, px.b)) continue;

      const tier = tierAt(y);
      if (!tier) continue;

      const above = getPixel(rgba, width, height, x, y - 1);
      const right = getPixel(rgba, width, height, x + 1, y);
      const isTopRim = !above;
      const isRightRim = x >= CENTER_X && right && lum(right.r, right.g, right.b) < lum(px.r, px.g, px.b) - 8;

      const level = classifyFoliageLevel(x, y, tier, width, isTopRim, isRightRim);
      levels[y * width + x] = level;
      const color = ladder[Math.min(level, ladder.length - 1)];
      setPixel(rgba, width, x, y, color);

      if (level <= 1) stats.shadow += 1;
      else if (level === 2) stats.mid += 1;
      else if (level === 3) stats.highlight += 1;
      else stats.rim += 1;
    }
  }

  return { levels, stats, ladder };
}

function smoothTransitions(rgba, width, height, levels) {
  let smoothed = 0;
  const useGreen = true;
  const additions = [];

  for (let y = 1; y < TRUNK_TOP - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const level = levels[idx];
      if (level < 0) continue;

      const neighbors = [
        levels[idx - 1], levels[idx + 1], levels[idx - width], levels[idx + width],
      ].filter((v) => v >= 0);

      if (neighbors.length === 0) continue;
      const minN = Math.min(...neighbors);
      const maxN = Math.max(...neighbors);
      if (maxN - minN < 2) continue;

      const midLevel = clampByte(Math.round((level + (minN + maxN) / 2) / 2));
      const px = getPixel(rgba, width, height, x, y);
      if (!px) continue;

      const a = GREEN_LADDER[Math.min(level, 4)];
      const b = GREEN_LADDER[Math.min(midLevel, 4)];
      const blend = {
        r: clampByte((a.r + b.r) / 2),
        g: clampByte((a.g + b.g) / 2),
        b: clampByte((a.b + b.b) / 2),
      };

      if (Math.abs(level - minN) >= 2 || Math.abs(level - maxN) >= 2) {
        setPixel(rgba, width, x, y, blend);
        smoothed += 1;
      }

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const nIdx = ny * width + nx;
        if (levels[nIdx] < 0 && levels[idx] >= 0 && levels[nIdx - (dy * width + dx)] >= 0) {
          // dither mid-tone in 1px crevices
        }
      }
    }
  }

  return smoothed;
}

function shadeTrunk(rgba, width, height) {
  let adjusted = 0;
  let bottomY = height - 1;
  for (let y = height - 1; y >= TRUNK_TOP; y -= 1) {
    if (getPixel(rgba, width, height, CENTER_X, y)) { bottomY = y; break; }
  }

  for (let y = TRUNK_TOP; y < height; y += 1) {
    for (let x = CENTER_X - 4; x <= CENTER_X + 4; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!isTrunkPixel(y, x, width, height, px?.r ?? 0, px?.g ?? 0, px?.b ?? 0)) continue;

      const rightLit = x >= CENTER_X;
      const base = rightLit ? TRUNK_LIGHT : TRUNK_SHADOW;
      const t = (y - TRUNK_TOP) / Math.max(1, bottomY - TRUNK_TOP);
      const gradient = rightLit ? 1.04 - t * 0.08 : 0.88 - t * 0.04;

      let color = {
        r: clampByte(base.r * gradient),
        g: clampByte(base.g * gradient),
        b: clampByte(base.b * gradient),
      };

      if (x === CENTER_X - 2 || x === CENTER_X + 2) {
        color = TRUNK_TEXTURE;
      }

      setPixel(rgba, width, x, y, color);
      adjusted += 1;
    }
  }

  for (const dx of [-5, 5]) {
    const x = CENTER_X + dx;
    const y = bottomY;
    if (!getPixel(rgba, width, height, x, y)) {
      setPixel(rgba, width, x, y, ROOT_SHADOW);
      adjusted += 1;
    }
  }

  for (let x = CENTER_X - 2; x <= CENTER_X + 2; x += 1) {
    const y = bottomY + 1 < height ? bottomY + 1 : bottomY;
    if (y < height && !getPixel(rgba, width, height, x, y) && getPixel(rgba, width, height, x, bottomY)) {
      setPixel(rgba, width, x, y, ROOT_SHADOW);
      adjusted += 1;
    }
  }

  return adjusted;
}

function enhanceStar(rgba, width, height) {
  let adjusted = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = CENTER_X - 3; x <= CENTER_X + 3; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px || !isStar(px.r, px.g, px.b)) continue;

      const dist = Math.abs(x - CENTER_X) + Math.max(0, y - 2);
      const color = dist === 0 ? STAR_CORE : dist <= 1 ? STAR_GLOW : STAR_RIM;
      setPixel(rgba, width, x, y, color);
      adjusted += 1;
    }
  }

  const glowSpots = [
    [CENTER_X, 3], [CENTER_X - 1, 4], [CENTER_X + 1, 4],
  ];
  for (const [gx, gy] of glowSpots) {
    if (!getPixel(rgba, width, height, gx, gy)) {
      setPixel(rgba, width, gx, gy, GREEN_LADDER[5], 200);
      adjusted += 1;
    }
  }
  return adjusted;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addSnowSpecks(rgba, width, height, seed, count = 3) {
  const rand = mulberry32(seed);
  const spots = [];

  for (let y = 12; y < 58; y += 1) {
    const tier = tierAt(y);
    if (!tier || tier.top > 48) continue;

    for (let x = 10; x < width - 10; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px || isSnow(px.r, px.g, px.b) || isStar(px.r, px.g, px.b)) continue;

      const bright = lum(px.r, px.g, px.b);
      const above = getPixel(rgba, width, height, x, y - 1);
      const exposed = !above;
      const isHighlight = bright >= lum(GREEN_LADDER[3].r, GREEN_LADDER[3].g, GREEN_LADDER[3].b) - 6;

      if (!exposed && !isHighlight) continue;
      spots.push({ x, y, w: exposed ? 2 : 1 });
    }
  }

  spots.sort((a, b) => (rand() * b.w) - (rand() * a.w));
  let placed = 0;
  const used = new Set();

  for (const spot of spots) {
    if (placed >= count) break;
    const key = `${spot.x},${spot.y}`;
    if (used.has(key)) continue;
    if (rand() > 0.72) continue;
    setPixel(rgba, width, spot.x, spot.y, rand() > 0.45 ? SNOW : SNOW_SPARK);
    used.add(key);
    placed += 1;
  }

  return placed;
}

function shadeFrame(rgba, width, height, frameIndex) {
  const out = Buffer.from(rgba);
  const foliage = shadeFoliage(out, width, height, frameIndex);
  const smooth = smoothTransitions(out, width, height, foliage.levels);
  const trunk = shadeTrunk(out, width, height);
  const star = frameIndex === 0 ? enhanceStar(out, width, height) : 0;
  let snow = 0;
  if (frameIndex <= 1) {
    snow = addSnowSpecks(out, width, height, 0xA11CE + frameIndex, frameIndex === 0 ? 3 : 2);
  }
  const symmetry = enforceSymmetry(out, width, height);

  return {
    rgba: out,
    stats: { ...foliage.stats, smooth, trunk, star, snow, symmetry },
  };
}

async function writePng(rgba, width, height, path) {
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(path);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(INPUT, BACKUP);

  const doc = decodeAsepriteFrames(INPUT);
  const diagnostics = { pass: 3, width: doc.width, height: doc.height, tiers: FOLIAGE_TIERS, frames: [] };
  const outFrames = [];

  for (const [index, frame] of doc.frames.entries()) {
    const layerName = frame.layers[0]?.name || FRAME_NAMES[index];
    const cells = frame.layers[0]?.cells || [];
    const rgba = cellsToRgba(cells, doc.width, doc.height);
    const result = shadeFrame(rgba, doc.width, doc.height, index);
    const outCells = rgbaToCells(result.rgba, doc.width, doc.height, layerName);

    diagnostics.frames.push({
      index,
      name: FRAME_NAMES[index],
      cellsBefore: cells.length,
      cellsAfter: outCells.length,
      ...result.stats,
    });

    outFrames.push({
      frame: index,
      duration: frame.duration,
      layers: [{ name: layerName, cells: outCells }],
    });
  }

  writeFileSync(INPUT, encodeAsepriteBinary({
    width: doc.width,
    height: doc.height,
    frames: outFrames,
  }));

  await writePng(
    cellsToRgba(outFrames[0].layers[0].cells, doc.width, doc.height),
    doc.width,
    doc.height,
    resolve(OUT_DIR, 'tree_fixed.png'),
  );

  for (const [name, idx] of [
    ['Pine Tree Base Pine.png', 0],
    ['Pine Tree Snow Cap.png', 1],
    ['Pine Tree Ember Autumn.png', 2],
    ['Pine Tree Void Corrupted.png', 3],
  ]) {
    const cells = outFrames[idx]?.layers?.[0]?.cells || [];
    await writePng(cellsToRgba(cells, doc.width, doc.height), doc.width, doc.height, resolve(OUT_DIR, name));
  }

  writeFileSync(DIAG, JSON.stringify(diagnostics, null, 2));
  console.log('[pine-tree-pass3] tier shading complete');
  console.log('  backup :', BACKUP);
  for (const f of diagnostics.frames) console.log(`  ${f.name}:`, f);
}

main().catch((err) => {
  console.error('[pine-tree-pass3] failed', err);
  process.exitCode = 1;
});