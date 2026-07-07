/**
 * Pass 2 enhancement for Pine Tree Isometric.aseprite
 * — deeper undersides, trunk texture, edge pass, snow + star (base frame).
 *
 * Usage:
 *   node scripts/enhance-pine-tree-pass2.mjs
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
const BACKUP = resolve(ROOT, 'docs/references/trees/Pine Tree Isometric.before-pass2.aseprite');
const OUT_DIR = resolve(ROOT, 'docs/references/trees');
const DIAG = resolve(OUT_DIR, 'Pine Tree Isometric.pass2.diagnostics.json');

const FRAME_NAMES = ['Base Pine', 'Snow Cap', 'Ember Autumn', 'Void Corrupted'];
const ASE_MAGIC = 0xA5E0;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;

const STAR_GOLD = { r: 255, g: 213, b: 106 };
const SNOW = { r: 232, g: 244, b: 255 };
const TRUNK_DARK = { r: 58, g: 34, b: 18 };
const TRUNK_MID = { r: 92, g: 56, b: 30 };
const TRUNK_LIGHT = { r: 128, g: 78, b: 42 };

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
        metadata: { partId: layerName, source: 'pine_tree_pass2' },
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

function blendRgb(a, b, t) {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
  };
}

function isFoliage(r, g, b) {
  return g > r * 1.05 && g > b * 1.05 && g > 50;
}

function isTrunk(r, g, b) {
  return r > 55 && g < r * 0.9 && b < r * 0.75 && r > g && r - b > 12;
}

function isSnowPixel(r, g, b) {
  return r > 200 && g > 220 && b > 235;
}

function isCanopy(r, g, b, y, height) {
  if (isSnowPixel(r, g, b) || isTrunk(r, g, b)) return false;
  if (y >= Math.floor(height * 0.68)) return false;
  if (isFoliage(r, g, b)) return true;
  const lum = (r + g + b) / 3;
  return lum > 18 && lum < 245;
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

function cleanupStairSteps(rgba, width, height) {
  let fixed = 0;
  const additions = [];

  const patterns = [
    { a: [1, 0], b: [0, 1], fill: [1, 1] },
    { a: [-1, 0], b: [0, 1], fill: [-1, 1] },
    { a: [1, 0], b: [0, -1], fill: [1, -1] },
    { a: [-1, 0], b: [0, -1], fill: [-1, -1] },
  ];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const here = getPixel(rgba, width, height, x, y);
      if (!here) continue;

      for (const pat of patterns) {
        const pa = getPixel(rgba, width, height, x + pat.a[0], y + pat.a[1]);
        const pb = getPixel(rgba, width, height, x + pat.b[0], y + pat.b[1]);
        const pf = getPixel(rgba, width, height, x + pat.fill[0], y + pat.fill[1]);
        if (pa && pb && !pf) {
          const mid = blendRgb(pa, pb, 0.5);
          const softened = blendRgb(mid, here, 0.35);
          additions.push({ x: x + pat.fill[0], y: y + pat.fill[1], color: softened, a: 220 });
          fixed += 1;
        }
      }
    }
  }

  for (const px of additions) setPixel(rgba, width, px.x, px.y, px.color, px.a);
  return fixed;
}

function deepenUndersides(rgba, width, height) {
  let adjusted = 0;
  const centerX = width / 2;

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px || !isCanopy(px.r, px.g, px.b, y, height)) continue;

      const below = getPixel(rgba, width, height, x, y + 1);
      const belowLeft = getPixel(rgba, width, height, x - 1, y + 1);
      const above = getPixel(rgba, width, height, x, y - 1);
      const belowCanopy = below && isCanopy(below.r, below.g, below.b, y + 1, height);
      const aboveCanopy = above && isCanopy(above.r, above.g, above.b, y - 1, height);
      const exposedUnderside = !belowCanopy && aboveCanopy;
      const lowerLeftShadow = x < centerX && belowLeft && !isCanopy(belowLeft.r, belowLeft.g, belowLeft.b, y + 1, height);

      if (!exposedUnderside && !lowerLeftShadow) continue;

      const factor = lowerLeftShadow ? 0.72 : 0.8;
      setPixel(rgba, width, x, y, {
        r: clampByte(px.r * factor),
        g: clampByte(px.g * factor),
        b: clampByte(px.b * factor),
      });
      adjusted += 1;
    }
  }
  return adjusted;
}

function addRimHighlights(rgba, width, height) {
  let adjusted = 0;
  const centerX = width / 2;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px || !isCanopy(px.r, px.g, px.b, y, height)) continue;

      const above = getPixel(rgba, width, height, x, y - 1);
      const right = getPixel(rgba, width, height, x + 1, y);
      const aboveCanopy = above && isCanopy(above.r, above.g, above.b, y - 1, height);
      const rightCanopy = right && isCanopy(right.r, right.g, right.b, y, height);
      const isRim = !aboveCanopy || (x >= centerX && right && !rightCanopy);

      if (!isRim || y > height * 0.82) continue;
      setPixel(rgba, width, x, y, {
        r: clampByte(Math.min(255, px.r * 1.08 + 10)),
        g: clampByte(Math.min(255, px.g * 1.06 + 14)),
        b: clampByte(Math.min(255, px.b * 1.05 + 8)),
      });
      adjusted += 1;
    }
  }
  return adjusted;
}

function isTrunkRegionPixel(rgba, width, height, x, y, trunkStartY, centerX, trunkHalf) {
  const px = getPixel(rgba, width, height, x, y);
  if (!px || y < trunkStartY) return false;
  if (Math.abs(x - centerX) > trunkHalf) return false;
  if (isSnowPixel(px.r, px.g, px.b)) return false;
  if (isCanopy(px.r, px.g, px.b, y, height)) return false;
  return true;
}

function enhanceTrunk(rgba, width, height) {
  let adjusted = 0;
  const trunkStartY = Math.floor(height * 0.7);
  const centerX = Math.floor(width / 2);
  const trunkHalf = 4;

  let trunkBottomY = trunkStartY;
  for (let y = height - 1; y >= trunkStartY; y -= 1) {
    if (getPixel(rgba, width, height, centerX, y)) { trunkBottomY = y; break; }
  }

  for (let y = trunkStartY; y < height; y += 1) {
    for (let x = centerX - trunkHalf; x <= centerX + trunkHalf; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!isTrunkRegionPixel(rgba, width, height, x, y, trunkStartY, centerX, trunkHalf)) continue;

      const t = (y - trunkStartY) / Math.max(1, trunkBottomY - trunkStartY);
      const grain = ((x + y) % 3 === 0) ? TRUNK_DARK : ((x + y) % 3 === 1) ? TRUNK_MID : TRUNK_LIGHT;
      const litSide = x >= centerX ? 1.06 : 0.92;
      const baseDarken = y >= trunkBottomY - 1 ? 0.82 : 1;

      setPixel(rgba, width, x, y, {
        r: clampByte((grain.r * 0.45 + px.r * 0.55) * litSide * baseDarken),
        g: clampByte((grain.g * 0.45 + px.g * 0.55) * litSide * baseDarken),
        b: clampByte((grain.b * 0.45 + px.b * 0.55) * litSide * baseDarken),
      });
      adjusted += 1;

      if (y === trunkBottomY && Math.abs(x - centerX) <= trunkHalf + 1) {
        setPixel(rgba, width, x, trunkBottomY, {
          r: clampByte(grain.r * 0.75),
          g: clampByte(grain.g * 0.75),
          b: clampByte(grain.b * 0.75),
        });
        adjusted += 1;
      }
    }
  }

  for (const dx of [-trunkHalf - 1, trunkHalf + 1]) {
    const x = centerX + dx;
    const innerX = centerX + Math.sign(dx) * trunkHalf;
    if (!getPixel(rgba, width, height, x, trunkBottomY) && isTrunkRegionPixel(rgba, width, height, innerX, trunkBottomY, trunkStartY, centerX, trunkHalf)) {
      const inner = getPixel(rgba, width, height, innerX, trunkBottomY);
      const root = inner
        ? { r: clampByte(inner.r * 0.72), g: clampByte(inner.g * 0.72), b: clampByte(inner.b * 0.72) }
        : TRUNK_DARK;
      setPixel(rgba, width, x, trunkBottomY, root, 255);
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

function addSnowDots(rgba, width, height, seed, maxDots = 10) {
  const rand = mulberry32(seed);
  const candidates = [];

  for (let y = 2; y < Math.floor(height * 0.62); y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px || !isCanopy(px.r, px.g, px.b, y, height) || isSnowPixel(px.r, px.g, px.b)) continue;
      const above = getPixel(rgba, width, height, x, y - 1);
      if (above && isCanopy(above.r, above.g, above.b, y - 1, height)) continue;
      candidates.push({ x, y, w: 1 + (x / width) + (1 - y / height) });
    }
  }

  candidates.sort((a, b) => (rand() * b.w) - (rand() * a.w));
  let placed = 0;
  for (const spot of candidates) {
    if (placed >= maxDots) break;
    if (rand() > 0.55) continue;
    setPixel(rgba, width, spot.x, spot.y, SNOW);
    placed += 1;
  }
  return placed;
}

function addStar(rgba, width, height) {
  const cx = Math.floor(width / 2);
  const cy = 2;
  const star = [
    [0, -1, STAR_GOLD],
    [-1, 0, STAR_GOLD], [0, 0, { r: 255, g: 240, b: 180 }], [1, 0, STAR_GOLD],
    [0, 1, STAR_GOLD],
    [-1, -1, { r: 255, g: 230, b: 150 }], [1, -1, { r: 255, g: 230, b: 150 }],
  ];
  let placed = 0;
  for (const [dx, dy, color] of star) {
    const x = cx + dx;
    const y = cy + dy;
    if (y < 0 || y >= height) continue;
    setPixel(rgba, width, x, y, color);
    placed += 1;
  }
  return placed;
}

function enhanceFrame(rgba, width, height, frameIndex) {
  const out = Buffer.from(rgba);
  const stats = {
    stairSteps: cleanupStairSteps(out, width, height),
    undersides: deepenUndersides(out, width, height),
    rimHighlights: addRimHighlights(out, width, height),
    trunk: enhanceTrunk(out, width, height),
    snow: 0,
    star: 0,
    symmetry: 0,
  };

  if (frameIndex === 0) {
    stats.snow = addSnowDots(out, width, height, 0x50C1E, 9);
    stats.star = addStar(out, width, height);
  } else if (frameIndex === 1) {
    stats.snow = addSnowDots(out, width, height, 0x51C0F, 6);
  }

  stats.symmetry = enforceSymmetry(out, width, height);
  return { rgba: out, stats };
}

async function writePng(rgba, width, height, path) {
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(path);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(INPUT, BACKUP);

  const doc = decodeAsepriteFrames(INPUT);
  const diagnostics = { pass: 2, width: doc.width, height: doc.height, frames: [] };
  const polishedFrames = [];

  for (const [index, frame] of doc.frames.entries()) {
    const layerName = frame.layers[0]?.name || FRAME_NAMES[index] || `Frame ${index}`;
    const cells = frame.layers[0]?.cells || [];
    const rgba = cellsToRgba(cells, doc.width, doc.height);
    const result = enhanceFrame(rgba, doc.width, doc.height, index);
    const outCells = rgbaToCells(result.rgba, doc.width, doc.height, layerName);

    diagnostics.frames.push({
      index,
      name: FRAME_NAMES[index] || layerName,
      cellsBefore: cells.length,
      cellsAfter: outCells.length,
      ...result.stats,
    });

    polishedFrames.push({
      frame: index,
      duration: frame.duration,
      layers: [{ name: layerName, cells: outCells }],
    });
  }

  writeFileSync(INPUT, encodeAsepriteBinary({
    width: doc.width,
    height: doc.height,
    frames: polishedFrames,
  }));

  await writePng(
    cellsToRgba(polishedFrames[0].layers[0].cells, doc.width, doc.height),
    doc.width,
    doc.height,
    resolve(OUT_DIR, 'tree_fixed.png'),
  );

  const pngExports = [
    ['Pine Tree Base Pine.png', 0],
    ['Pine Tree Snow Cap.png', 1],
    ['Pine Tree Ember Autumn.png', 2],
    ['Pine Tree Void Corrupted.png', 3],
  ];
  for (const [name, frameIndex] of pngExports) {
    const cells = polishedFrames[frameIndex]?.layers?.[0]?.cells || [];
    await writePng(cellsToRgba(cells, doc.width, doc.height), doc.width, doc.height, resolve(OUT_DIR, name));
  }

  writeFileSync(DIAG, JSON.stringify(diagnostics, null, 2));
  console.log('[pine-tree-pass2] complete');
  console.log('  backup :', BACKUP);
  for (const frame of diagnostics.frames) {
    console.log(`  ${frame.name}:`, frame);
  }
}

main().catch((error) => {
  console.error('[pine-tree-pass2] failed', error);
  process.exitCode = 1;
});