/**
 * Professional polish pass for Pine Tree Isometric.aseprite
 *
 * Applies symmetry repair, edge cleanup, and consistent top-center lighting
 * per the pixel-art Christmas tree fix guide (scaled to native 80×120 canvas).
 *
 * Usage:
 *   node scripts/polish-pine-tree-isometric-aseprite.mjs
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
const BACKUP = resolve(ROOT, 'docs/references/trees/Pine Tree Isometric.before-polish.aseprite');
const OUT_ASE = INPUT;
const OUT_DIR = resolve(ROOT, 'docs/references/trees');
const DIAG = resolve(OUT_DIR, 'Pine Tree Isometric.polish.diagnostics.json');

const FRAME_NAMES = [
  'Base Pine',
  'Snow Cap',
  'Ember Autumn',
  'Void Corrupted',
];

const ASE_MAGIC = 0xA5E0;
const FRAME_MAGIC = 0xF1FA;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;

function u8(buf, o) { return buf[o]; }
function u16(buf, o) { return buf[o] | (buf[o + 1] << 8); }
function u32(buf, o) { return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24); }
function i16(buf, o) { const v = u16(buf, o); return v > 0x7fff ? v - 0x10000 : v; }

function readString(buf, offset) {
  const len = u16(buf, offset);
  const start = offset + 2;
  return { value: new TextDecoder().decode(buf.subarray(start, start + len)), offset: start + len };
}

function rgbaToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16) };
}

function luminance(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function decodeAsepriteFrames(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 128 || u16(buffer, 4) !== ASE_MAGIC) {
    throw new Error('Invalid Aseprite file');
  }

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
        if (celType === 0) {
          rgba = Buffer.from(buffer.subarray(dataOffset, dataOffset + celW * celH * 4));
        } else if (celType === 2) {
          rgba = inflateSync(buffer.subarray(dataOffset, chunkEnd));
        } else {
          chunkOffset = chunkEnd;
          continue;
        }

        const layer = layers[layerIndex] || { name: `Layer ${layerIndex + 1}`, cells: [] };
        layers[layerIndex] = layer;
        layer.cells = [];

        for (let py = 0; py < celH; py += 1) {
          for (let px = 0; px < celW; px += 1) {
            const idx = (py * celW + px) * 4;
            const a = rgba[idx + 3];
            if (!a) continue;
            layer.cells.push({
              x: celX + px,
              y: celY + py,
              color: rgbaToHex(rgba[idx], rgba[idx + 1], rgba[idx + 2]),
              emphasis: Number((a / 255).toFixed(4)),
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

  return { width, height, frames, layers };
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
      const a = rgba[idx + 3];
      if (!a) continue;
      cells.push({
        x,
        y,
        color: rgbaToHex(rgba[idx], rgba[idx + 1], rgba[idx + 2]),
        emphasis: Number((a / 255).toFixed(4)),
        metadata: { partId: layerName, source: 'pine_tree_polish' },
      });
    }
  }
  return cells;
}

function getPixel(rgba, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const idx = (y * width + x) * 4;
  const a = rgba[idx + 3];
  if (!a) return null;
  return { r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2], a, idx };
}

function setPixel(rgba, idx, r, g, b, a = 255) {
  rgba[idx] = r;
  rgba[idx + 1] = g;
  rgba[idx + 2] = b;
  rgba[idx + 3] = a;
}

function blendRgb(a, b, t) {
  return {
    r: clampByte(a.r + (b.r - a.r) * t),
    g: clampByte(a.g + (b.g - a.g) * t),
    b: clampByte(a.b + (b.b - a.b) * t),
  };
}

function enforceSymmetry(rgba, width, height) {
  let mirrored = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mx = width - x;
      if (mx <= x) continue;
      const left = getPixel(rgba, width, height, x, y);
      const right = getPixel(rgba, width, height, mx, y);
      const master = right || left;
      if (!master) continue;
      if (left && right && left.r === right.r && left.g === right.g && left.b === right.b) continue;
      setPixel(rgba, (y * width + x) * 4, master.r, master.g, master.b, 255);
      setPixel(rgba, (y * width + mx) * 4, master.r, master.g, master.b, 255);
      mirrored += 1;
    }
  }
  return mirrored;
}

function isBoundary(rgba, width, height, x, y) {
  const p = getPixel(rgba, width, height, x, y);
  if (!p) return false;
  const neighbors = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  return neighbors.some(([dx, dy]) => !getPixel(rgba, width, height, x + dx, y + dy));
}

function cleanupEdges(rgba, width, height) {
  let softened = 0;
  const additions = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!isBoundary(rgba, width, height, x, y)) continue;

      const here = getPixel(rgba, width, height, x, y);
      const diagSteps = [
        [[1, 0], [1, 1], [0, 1]],
        [[-1, 0], [-1, 1], [0, 1]],
        [[1, 0], [1, -1], [0, -1]],
        [[-1, 0], [-1, -1], [0, -1]],
      ];

      for (const chain of diagSteps) {
        const [a, b, c] = chain.map(([dx, dy]) => getPixel(rgba, width, height, x + dx, y + dy));
        if (here && a && b && !c) {
          const mid = blendRgb(here, a, 0.45);
          const tx = x + chain[2][0];
          const ty = y + chain[2][1];
          if (!getPixel(rgba, width, height, tx, ty)) {
            additions.push({ x: tx, y: ty, ...mid, a: 180 });
            softened += 1;
          }
        }
      }
    }
  }

  for (const px of additions) {
    setPixel(rgba, (px.y * width + px.x) * 4, px.r, px.g, px.b, px.a);
  }

  return softened;
}

function applyLighting(rgba, width, height) {
  let adjusted = 0;
  const trunkStartY = Math.floor(height * 0.72);
  const trunkHalfW = Math.max(3, Math.floor(width * 0.12));
  const centerX = width / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = getPixel(rgba, width, height, x, y);
      if (!px) continue;

      let r = px.r;
      let g = px.g;
      let b = px.b;

      const nx = (x - centerX) / centerX;
      const ny = y / height;
      const light = (0.55 - ny * 0.35) + (nx * 0.22);
      const shade = clampByte(1 + light * 0.18);

      if (y >= trunkStartY && Math.abs(x - centerX) <= trunkHalfW) {
        const trunkBias = (x >= centerX ? 1.08 : 0.9);
        r = clampByte(r * trunkBias);
        g = clampByte(g * trunkBias);
        b = clampByte(b * trunkBias);
        adjusted += 1;
        setPixel(rgba, px.idx, r, g, b, 255);
        continue;
      }

      if (!isBoundary(rgba, width, height, x, y)) continue;

      const upperRight = (x >= centerX && y < height * 0.65);
      const lowerLeft = (x < centerX && y > height * 0.35);

      if (upperRight) {
        r = clampByte(Math.min(255, r * 1.12 + 8));
        g = clampByte(Math.min(255, g * 1.08 + 6));
        b = clampByte(Math.min(255, b * 1.1 + 10));
        adjusted += 1;
      } else if (lowerLeft) {
        r = clampByte(r * 0.86);
        g = clampByte(g * 0.88);
        b = clampByte(b * 0.9);
        adjusted += 1;
      } else {
        r = clampByte(r * shade);
        g = clampByte(g * shade);
        b = clampByte(b * shade);
        adjusted += 1;
      }

      setPixel(rgba, px.idx, r, g, b, 255);
    }
  }

  return adjusted;
}

function polishFrame(rgba, width, height) {
  const out = Buffer.from(rgba);
  const symmetry = enforceSymmetry(out, width, height);
  const edges = cleanupEdges(out, width, height);
  const lighting = applyLighting(out, width, height);
  enforceSymmetry(out, width, height);
  return { rgba: out, symmetry, edges, lighting };
}

async function writePng(rgba, width, height, path) {
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(path);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(INPUT, BACKUP);

  const doc = decodeAsepriteFrames(INPUT);
  const diagnostics = {
    input: INPUT,
    width: doc.width,
    height: doc.height,
    frames: [],
  };

  const polishedFrames = doc.frames.map((frame, index) => {
    const layerName = frame.layers[0]?.name || FRAME_NAMES[index] || `Frame ${index}`;
    const cells = frame.layers[0]?.cells || [];
    const rgba = cellsToRgba(cells, doc.width, doc.height);
    const result = polishFrame(rgba, doc.width, doc.height);
    const polishedCells = rgbaToCells(result.rgba, doc.width, doc.height, layerName);

    diagnostics.frames.push({
      index,
      name: FRAME_NAMES[index] || layerName,
      cellsBefore: cells.length,
      cellsAfter: polishedCells.length,
      symmetry: result.symmetry,
      edges: result.edges,
      lighting: result.lighting,
    });

    return {
      frame: index,
      duration: frame.duration,
      layers: [{ name: layerName, cells: polishedCells }],
    };
  });

  const encoded = encodeAsepriteBinary({
    width: doc.width,
    height: doc.height,
    frames: polishedFrames,
  });
  writeFileSync(OUT_ASE, encoded);

  const baseFrame = polishedFrames[0].layers[0].cells;
  const baseRgba = cellsToRgba(baseFrame, doc.width, doc.height);
  const fixedPng = resolve(OUT_DIR, 'tree_fixed.png');
  await writePng(baseRgba, doc.width, doc.height, fixedPng);

  const pngExports = [
    ['Pine Tree Base Pine.png', 0],
    ['Pine Tree Snow Cap.png', 1],
    ['Pine Tree Ember Autumn.png', 2],
    ['Pine Tree Void Corrupted.png', 3],
  ];

  for (const [name, frameIndex] of pngExports) {
    const cells = polishedFrames[frameIndex]?.layers?.[0]?.cells || [];
    const rgba = cellsToRgba(cells, doc.width, doc.height);
    await writePng(rgba, doc.width, doc.height, resolve(OUT_DIR, name));
  }

  writeFileSync(DIAG, JSON.stringify(diagnostics, null, 2));

  console.log('[pine-tree-polish] complete');
  console.log('  backup :', BACKUP);
  console.log('  aseprite:', OUT_ASE);
  console.log('  png    :', fixedPng);
  for (const frame of diagnostics.frames) {
    console.log(`  frame ${frame.index} (${frame.name}): symmetry=${frame.symmetry} edges=${frame.edges} lighting=${frame.lighting}`);
  }
}

main().catch((error) => {
  console.error('[pine-tree-polish] failed', error);
  process.exitCode = 1;
});