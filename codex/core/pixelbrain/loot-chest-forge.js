import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { compileSCDL } from './scdl/scdl.compiler.js';
import { exportSCDL } from './scdl/scdl.exporters.js';
import { emitLattice } from './scdl/scdl.lattice-emitter.js';
import {
  LOOT_CHEST_PNG_SCALE,
  transmuteLootChestPacket,
} from './loot-chest-shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const LOOT_CHEST_SCDL_FIXTURE = resolve(__dirname, 'scdl/fixtures/loot_chest/loot_chest.scdl');

/**
 * Compile the canonical loot chest SCDL into a PixelBrainAssetPacket.
 * @param {string} [source]
 */
export function compileLootChestSource(source = readFileSync(LOOT_CHEST_SCDL_FIXTURE, 'utf8')) {
  const result = compileSCDL(source);
  if (!result.ok || !result.packet) {
    const messages = (result.errors || [])
      .filter((entry) => entry.isError?.())
      .map((entry) => entry.message)
      .join('; ');
    throw new Error(`loot_chest.scdl compile failed: ${messages || 'unknown error'}`);
  }
  return result;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  let c = 0xffffffff;
  for (let i = 0; i < crcInput.length; i += 1) {
    c ^= crcInput[i];
    for (let j = 0; j < 8; j += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function renderScaledCoordinatePng(coordinates, canvas, scale = 1) {
  const width = Math.max(1, Math.round(Number(canvas?.width) || 1));
  const height = Math.max(1, Math.round(Number(canvas?.height) || 1));
  const pixelScale = Math.max(1, Math.round(scale));
  const outW = width * pixelScale;
  const outH = height * pixelScale;
  const pixels = Buffer.alloc(outW * outH * 4, 0);

  for (const coord of coordinates || []) {
    const x = Math.round(coord?.snappedX ?? coord?.x ?? -1);
    const y = Math.round(coord?.snappedY ?? coord?.y ?? -1);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const hex = String(coord?.color || '').trim().replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) continue;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    for (let dy = 0; dy < pixelScale; dy += 1) {
      for (let dx = 0; dx < pixelScale; dx += 1) {
        const off = ((y * pixelScale + dy) * outW + (x * pixelScale + dx)) * 4;
        pixels[off] = r;
        pixels[off + 1] = g;
        pixels[off + 2] = b;
        pixels[off + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(outW, 0);
  ihdr.writeUInt32BE(outH, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = outW * 4;
  const filtered = Buffer.alloc((stride + 1) * outH);
  for (let row = 0; row < outH; row += 1) {
    filtered[row * (stride + 1)] = 0;
    pixels.copy(filtered, row * (stride + 1) + 1, row * stride, row * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(filtered)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderLootChestPacketPng(packet, options = {}) {
  const ast = options?.ast ?? null;
  const scale = Math.max(1, Math.round(options?.scale ?? LOOT_CHEST_PNG_SCALE));
  if (scale === 1) {
    const exports = exportSCDL(packet, ['png'], ast);
    if (!exports.png?.ok) {
      throw new Error(String(exports.png?.output || 'loot chest PNG export failed'));
    }
    return exports.png.output;
  }
  const lattice = emitLattice(packet, ast);
  return renderScaledCoordinatePng(lattice.geometry.coordinates, lattice.canvas, scale);
}

export function renderLootChestSourcePng(sourcePacket, options = {}) {
  return renderLootChestPacketPng(sourcePacket, options);
}

export function renderLootChestTierPng(sourcePacket, tier, options = {}) {
  const renderPacket = transmuteLootChestPacket(sourcePacket, tier);
  return renderLootChestPacketPng(renderPacket, options);
}

export function getLootChestFramePackets(compiled) {
  if (Array.isArray(compiled?.framePackets) && compiled.framePackets.length > 0) {
    return compiled.framePackets;
  }
  return compiled?.packet ? [compiled.packet] : [];
}

export function renderLootChestTierFramePng(compiled, tier, frameIndex, options = {}) {
  const packet = getLootChestFramePackets(compiled)[frameIndex];
  if (!packet) {
    throw new Error(`loot chest frame ${frameIndex} is missing from compiled SCDL`);
  }
  return renderLootChestTierPng(packet, tier, options);
}