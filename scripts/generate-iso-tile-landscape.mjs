#!/usr/bin/env node
/**
 * Perlin fBm landscape compositor using grass + water combat iso tiles.
 *
 * Usage:
 *   node scripts/generate-iso-tile-landscape.mjs
 *   node scripts/generate-iso-tile-landscape.mjs --width 40 --height 40 --seed polaris-lake
 */

import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import {
  GRASS_VARIANT_IDS,
  ISO_TILE_METRICS,
  WATER_VARIANT_IDS,
  generateIsoTileLandscape,
} from '../src/game/world/isoTileLandscape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REF_DIR = resolve(ROOT, 'docs/references');
const PUBLIC_TILE_DIR = resolve(ROOT, 'public/assets/combat/iso-tiles');

const DEFAULTS = Object.freeze({
  width: 40,
  height: 40,
  seed: 'polaris-landscape',
  pad: 4,
});

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--width') options.width = Number(argv[++i]);
    else if (arg === '--height') options.height = Number(argv[++i]);
    else if (arg === '--seed') options.seed = argv[++i];
    else if (arg === '--pad') options.pad = Number(argv[++i]);
  }
  return options;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
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

async function loadTileCatalog(manifestPath, sheetPath, variantIds) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { data, info } = await sharp(readFileSync(sheetPath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tiles = new Map();
  for (let index = 0; index < variantIds.length; index += 1) {
    const rgba = Buffer.alloc(info.width / variantIds.length * info.height * 4);
    const frameWidth = info.width / variantIds.length;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const si = (y * info.width + (index * frameWidth + x)) * 4;
        const di = (y * frameWidth + x) * 4;
        rgba[di] = data[si];
        rgba[di + 1] = data[si + 1];
        rgba[di + 2] = data[si + 2];
        rgba[di + 3] = data[si + 3];
      }
    }
    tiles.set(variantIds[index], {
      id: variantIds[index],
      label: manifest.variations[index]?.label ?? variantIds[index],
      width: frameWidth,
      height: info.height,
      rgba,
    });
  }
  return tiles;
}

function blitTile(canvas, canvasW, destX, destY, tile) {
  for (let y = 0; y < tile.height; y += 1) {
    const targetY = destY + y;
    if (targetY < 0 || targetY >= canvas.length / (canvasW * 4)) continue;
    for (let x = 0; x < tile.width; x += 1) {
      const targetX = destX + x;
      if (targetX < 0 || targetX >= canvasW) continue;
      const si = (y * tile.width + x) * 4;
      const alpha = tile.rgba[si + 3] / 255;
      if (alpha <= 0) continue;
      const di = (targetY * canvasW + targetX) * 4;
      if (alpha >= 1) {
        canvas[di] = tile.rgba[si];
        canvas[di + 1] = tile.rgba[si + 1];
        canvas[di + 2] = tile.rgba[si + 2];
        canvas[di + 3] = tile.rgba[si + 3];
      } else {
        canvas[di] = Math.round(canvas[di] * (1 - alpha) + tile.rgba[si] * alpha);
        canvas[di + 1] = Math.round(canvas[di + 1] * (1 - alpha) + tile.rgba[si + 1] * alpha);
        canvas[di + 2] = Math.round(canvas[di + 2] * (1 - alpha) + tile.rgba[si + 2] * alpha);
        canvas[di + 3] = Math.min(255, Math.round(canvas[di + 3] * (1 - alpha) + tile.rgba[si + 3] * alpha));
      }
    }
  }
}

function toIsoPixel(tx, ty, centerTx, centerTy, tw, th) {
  const ox = tx - centerTx;
  const oy = ty - centerTy;
  return {
    x: (ox - oy) * (tw / 2),
    y: (ox + oy) * (th / 2),
  };
}

function composeLandscapePng(landscape, grassTiles, waterTiles) {
  const { tw, th, spriteWidth, spriteHeight } = ISO_TILE_METRICS;
  const centerTx = landscape.originTx + landscape.width / 2;
  const centerTy = landscape.originTy + landscape.height / 2;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const placements = landscape.cells.map((cell) => {
    const pt = toIsoPixel(cell.tx, cell.ty, centerTx, centerTy, tw, th);
    const destX = Math.round(pt.x - spriteWidth / 2);
    const destY = Math.round(pt.y - th / 2);
    minX = Math.min(minX, destX);
    minY = Math.min(minY, destY);
    maxX = Math.max(maxX, destX + spriteWidth);
    maxY = Math.max(maxY, destY + spriteHeight);
    const catalog = cell.terrain === 'water' ? waterTiles : grassTiles;
    return { cell, destX, destY, tile: catalog.get(cell.variantId) };
  });

  const canvasW = maxX - minX;
  const canvasH = maxY - minY;
  const canvas = Buffer.alloc(canvasW * canvasH * 4);

  for (const placement of placements) {
    if (!placement.tile) continue;
    blitTile(canvas, canvasW, placement.destX - minX, placement.destY - minY, placement.tile);
  }

  return { canvas, canvasW, canvasH, placements, offsetX: minX, offsetY: minY };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(REF_DIR, { recursive: true });
  mkdirSync(PUBLIC_TILE_DIR, { recursive: true });

  const grassSheetSrc = resolve(REF_DIR, 'Grass Tile Sheet.png');
  const waterSheetSrc = resolve(REF_DIR, 'Water Tile Sheet.png');
  copyFileSync(grassSheetSrc, resolve(PUBLIC_TILE_DIR, 'grass-sheet.png'));
  copyFileSync(waterSheetSrc, resolve(PUBLIC_TILE_DIR, 'water-sheet.png'));

  const grassTiles = await loadTileCatalog(
    resolve(REF_DIR, 'Grass Tile Manifest.json'),
    grassSheetSrc,
    GRASS_VARIANT_IDS,
  );
  const waterTiles = await loadTileCatalog(
    resolve(REF_DIR, 'Water Tile Manifest.json'),
    waterSheetSrc,
    WATER_VARIANT_IDS,
  );

  const landscape = generateIsoTileLandscape(options);
  const { canvas, canvasW, canvasH } = composeLandscapePng(landscape, grassTiles, waterTiles);

  const landscapePng = resolve(REF_DIR, 'Iso Tile Landscape.png');
  const previewPng = resolve(REF_DIR, 'Iso Tile Landscape Preview.png');
  writePng(landscapePng, canvasW, canvasH, canvas);
  writePng(previewPng, canvasW, canvasH, canvas);

  const manifest = {
    version: 'combat-iso-landscape-v1',
    seed: landscape.seed,
    width: landscape.width,
    height: landscape.height,
    pad: landscape.pad,
    metrics: landscape.metrics,
    outputs: {
      landscape: 'Iso Tile Landscape.png',
      preview: 'Iso Tile Landscape Preview.png',
      grassSheet: 'public/assets/combat/iso-tiles/grass-sheet.png',
      waterSheet: 'public/assets/combat/iso-tiles/water-sheet.png',
    },
    catalogs: {
      grass: GRASS_VARIANT_IDS,
      water: WATER_VARIANT_IDS,
    },
    stats: {
      grassTiles: landscape.cells.filter((cell) => cell.terrain === 'grass').length,
      waterTiles: landscape.cells.filter((cell) => cell.terrain === 'water').length,
      canvasWidth: canvasW,
      canvasHeight: canvasH,
    },
    cells: landscape.cells,
  };

  writeFileSync(resolve(REF_DIR, 'Iso Tile Landscape Manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`[iso-landscape] seed=${landscape.seed} grid=${landscape.width}x${landscape.height}+${landscape.pad}`);
  console.log(`[iso-landscape] grass=${manifest.stats.grassTiles} water=${manifest.stats.waterTiles}`);
  console.log(`[iso-landscape] canvas ${canvasW}x${canvasH} → ${landscapePng}`);
  console.log(`[iso-landscape] sheets copied → ${PUBLIC_TILE_DIR}`);
}

main().catch((error) => {
  console.error('[iso-landscape] failed', error);
  process.exit(1);
});