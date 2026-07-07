// generate-void-ice-island.mjs
// Deterministic asset generator for the VOID Ice Island.
// Complies with the PixelBrain Agent Operating Manual (Lattice Authority, determinism, and packet-first).

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import canonical PixelBrain packet constructors
import { createPixelBrainAssetPacket } from '../codex/core/pixelbrain/pixelbrain-asset-packet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const OUT_DIR = join(repoRoot, 'output', 'foundry', 'void-ice-island');
const CLIENT_ASSETS_DIR = join(repoRoot, 'Scholomance OS', 'client', 'assets');

// --- DETERMINISTIC HASH NOISE ---
function hash2(x, y, salt) {
  let h = 2166136261;
  h ^= x + 374761393; h = Math.imul(h, 16777619);
  h ^= y + 668265263; h = Math.imul(h, 16777619);
  h ^= salt + 1274126177; h = Math.imul(h, 16777619);
  return (h >>> 0) / 4294967295;
}

// --- PNG COMPILER HELPERS ---
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
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(filePath, png);
}

function parseHexColor(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff
  };
}

function renderLatticeToRgba(coordinates, width, height) {
  const buffer = Buffer.alloc(width * height * 4);
  // Transparent background
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 0;
    buffer[i+1] = 0;
    buffer[i+2] = 0;
    buffer[i+3] = 0;
  }
  
  coordinates.forEach(c => {
    if (c.x >= 0 && c.x < width && c.y >= 0 && c.y < height) {
      const idx = (c.y * width + c.x) * 4;
      const color = parseHexColor(c.color);
      buffer[idx] = color.r;
      buffer[idx+1] = color.g;
      buffer[idx+2] = color.b;
      buffer[idx+3] = 255;
    }
  });
  
  return buffer;
}

function upscaleNearestNeighbor(source, width, height, factor) {
  const nextWidth = width * factor;
  const nextHeight = height * factor;
  const out = Buffer.alloc(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) {
    for (let x = 0; x < nextWidth; x += 1) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const srcIdx = (sy * width + sx) * 4;
      const destIdx = (y * nextWidth + x) * 4;
      out[destIdx] = source[srcIdx];
      out[destIdx+1] = source[srcIdx+1];
      out[destIdx+2] = source[srcIdx+2];
      out[destIdx+3] = source[srcIdx+3];
    }
  }
  return out;
}

// --- MAIN GENERATOR ---
function generateVoidIceIsland() {
  const width = 64;
  const height = 64;
  const centerX = 32;
  const centerY = 32;
  const seed = 20260702; // seed based on date
  
  const coordinates = [];
  const paletteColors = new Set();

  // Color Definitions:
  // Glacial Ice (cyans/light blues)
  const ICE_SHADES = ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9'];
  // Void Frost Soil (deep purples/indigos)
  const VOID_SHADES = ['#1e1b4b', '#312e81', '#3b0764', '#581c87', '#701a75'];
  // Glowing Veins & Fissures (electric cyan & hot magenta)
  const RUNE_COLOR = '#06b6d4';
  const CORE_COLOR = '#d946ef';

  // 1. Loop through coordinates to build the island shape
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      // Calculate polar distance with flattening (oval ratio for 2.5D perspective look)
      const dist = Math.sqrt(dx * dx + (dy * 1.5) * (dy * 1.5));
      
      // Determine organic edge noise
      const angle = Math.atan2(dy, dx);
      const edgeNoise = Math.sin(angle * 6) * 2.5 + Math.cos(angle * 12) * 1.2 + hash2(x, y, seed) * 1.5;
      const baseRadius = 22 + edgeNoise;

      if (dist <= baseRadius) {
        let color = '#ffffff';
        let partId = 'soil';

        // Check if on a crack/vein path
        const vein = Math.abs(((x * 2 - y + Math.floor(hash2(x, y, seed) * 4)) % 17) - 8) < 1;

        if (dist < 6) {
          // Purple Energy Core
          color = CORE_COLOR;
          partId = 'core';
        } else if (vein && dist < 20) {
          // Cyan glowing runic veins
          color = RUNE_COLOR;
          partId = 'vein';
        } else if (dist > baseRadius - 4) {
          // Glacial Ice Crust
          const shadeIdx = Math.floor(hash2(x, y, seed) * ICE_SHADES.length);
          color = ICE_SHADES[shadeIdx];
          partId = 'ice_crust';
        } else {
          // Deep Void Soil
          const shadeIdx = Math.floor(hash2(x, y, seed) * VOID_SHADES.length);
          color = VOID_SHADES[shadeIdx];
          partId = 'void_soil';
        }

        coordinates.push({ x, y, color, partId });
        paletteColors.add(color);
      }
    }
  }

  // 2. Spawn floating ice shards/fragments around the island
  const shardCenters = [
    { cx: 8, cy: 12, r: 2.2 },
    { cx: 54, cy: 16, r: 3.1 },
    { cx: 48, cy: 50, r: 2.5 },
    { cx: 12, cy: 46, r: 1.8 }
  ];

  shardCenters.forEach((shard, idx) => {
    for (let y = Math.floor(shard.cy - shard.r - 2); y <= Math.ceil(shard.cy + shard.r + 2); y++) {
      for (let x = Math.floor(shard.cx - shard.r - 2); x <= Math.ceil(shard.cx + shard.r + 2); x++) {
        const dx = x - shard.cx;
        const dy = y - shard.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const noise = hash2(x, y, seed + idx) * 0.8;
        if (dist <= shard.r + noise) {
          const shadeIdx = Math.floor(hash2(x, y, seed + idx) * ICE_SHADES.length);
          const color = ICE_SHADES[shadeIdx];
          coordinates.push({ x, y, color, partId: `shard_${idx}` });
          paletteColors.add(color);
        }
      }
    }
  });

  // 3. Compile the canonical PixelBrainAssetPacket
  const assetPacket = createPixelBrainAssetPacket({
    id: 'void.ice.island.v1',
    canvas: { width, height, gridSize: 1 },
    geometry: {
      mode: 'coordinates',
      coordinates
    },
    palettes: [
      { key: 'source', colors: Array.from(paletteColors) }
    ],
    metadata: {
      tags: ['island', 'void', 'ice', 'level_1'],
      notes: ['Lattice authority floating ice island asset with glowing runic core.']
    }
  });

  return assetPacket;
}

// --- EXECUTE WRITE ---
function main() {
  const asset = generateVoidIceIsland();
  
  // Render PNG buffers
  const width = asset.canvas.width;
  const height = asset.canvas.height;
  const rawRgba = renderLatticeToRgba(asset.geometry.coordinates, width, height);
  const upscaledRgba = upscaleNearestNeighbor(rawRgba, width, height, 8); // Upscale 8x for high quality retro sprite

  // Ensure directories exist
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(CLIENT_ASSETS_DIR, { recursive: true });

  // Write canonical JSON representation
  writeFileSync(join(OUT_DIR, 'void-ice-island.json'), JSON.stringify(asset, null, 2), 'utf8');
  console.log(`Saved canonical JSON to ${join(OUT_DIR, 'void-ice-island.json')}`);

  // Write PNG files (1x and 8x)
  writeFileSync(join(OUT_DIR, 'void-ice-island.1x.png'), rawRgba);
  writePng(join(OUT_DIR, 'void-ice-island.png'), width * 8, height * 8, upscaledRgba);
  console.log(`Saved compiled PNGs to ${OUT_DIR}`);

  // Copy 8x PNG directly to client assets for rendering in Phaser
  writePng(join(CLIENT_ASSETS_DIR, 'void-ice-island.png'), width * 8, height * 8, upscaledRgba);
  console.log(`Deployed void-ice-island.png to ${CLIENT_ASSETS_DIR}`);
}

main();
