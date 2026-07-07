/**
 * enhance-grass-tile.mjs
 *
 * Reads "Grass Tile Isometric.aseprite", applies PixelBrain procedural passes,
 * then appends new frames into "Grass Tile Variations.aseprite".
 *
 * Added frames:
 *   Frame 11 — Noise Detail      (Perlin surface variation blended at 22%)
 *   Frame 12 — Emerald variant   (emerald material palette)
 *   Frame 13 — Void Ice variant  (void-ice material palette)
 *   Frame 14 — Pine Needle       (deep forest shadow palette)
 *
 * Usage:
 *   node scripts/enhance-grass-tile.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { inflateSync, deflateSync } from 'zlib';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

import { perlinNoiseGrid, noiseToTexture, applyDithering } from '../codex/core/pixelbrain/procedural-noise.js';
import { transmuteMaterialColor } from '../codex/core/pixelbrain/material-registry.js';

const SOURCE_PATH     = resolve(ROOT, 'docs/references/Grass Tile Isometric.aseprite');
const VARIATIONS_PATH = resolve(ROOT, 'docs/references/Grass Tile Variations.aseprite');

// ── Aseprite binary helpers ───────────────────────────────────────────────────

function ru8(buf, off)  { return buf[off]; }
function ru16(buf, off) { return buf[off] | (buf[off+1] << 8); }
function ru32(buf, off) { return (buf[off] | (buf[off+1]<<8) | (buf[off+2]<<16) | (buf[off+3]<<24)) >>> 0; }
function wi16(buf, off, v) { buf[off] = v & 0xFF; buf[off+1] = (v >> 8) & 0xFF; }
function wi32(buf, off, v) { buf[off]=v&0xFF; buf[off+1]=(v>>8)&0xFF; buf[off+2]=(v>>16)&0xFF; buf[off+3]=(v>>24)&0xFF; }
function ri16(buf, off) { const v = ru16(buf, off); return v >= 0x8000 ? v - 0x10000 : v; }

// ── Decode source aseprite into flat RGBA buffer ──────────────────────────────

function decodeSourceRGBA(filePath) {
  const buf = readFileSync(filePath);
  const width  = ru16(buf, 8);
  const height = ru16(buf, 10);
  // Full canvas RGBA, start transparent
  const rgba = new Uint8Array(width * height * 4);

  const numFrames = ru16(buf, 6);
  let frameOff = 128;
  for (let f = 0; f < numFrames; f++) {
    const frameSize = ru32(buf, frameOff);
    const numChunks = ru16(buf, frameOff + 6);
    let chunkOff = frameOff + 16;
    for (let c = 0; c < numChunks; c++) {
      const chunkSize = ru32(buf, chunkOff);
      const chunkType = ru16(buf, chunkOff + 4);
      if (chunkType === 0x2005) { // CEL chunk
        const celX    = ri16(buf, chunkOff + 8);
        const celY    = ri16(buf, chunkOff + 10);
        const celType = ru16(buf, chunkOff + 13);
        if (celType === 2) { // compressed image
          const celW = ru16(buf, chunkOff + 22);
          const celH = ru16(buf, chunkOff + 24);
          const compressed = buf.subarray(chunkOff + 26, chunkOff + chunkSize);
          const pixels = inflateSync(compressed);
          // Composite onto canvas (simple top-down, alpha blend)
          for (let py = 0; py < celH; py++) {
            for (let px = 0; px < celW; px++) {
              const srcIdx = (py * celW + px) * 4;
              const srcA = pixels[srcIdx + 3] / 255;
              if (srcA === 0) continue;
              const dstX = celX + px;
              const dstY = celY + py;
              if (dstX < 0 || dstY < 0 || dstX >= width || dstY >= height) continue;
              const dstIdx = (dstY * width + dstX) * 4;
              // Alpha-over composite
              const dstA = rgba[dstIdx + 3] / 255;
              const outA = srcA + dstA * (1 - srcA);
              if (outA > 0) {
                rgba[dstIdx]   = Math.round((pixels[srcIdx]   * srcA + rgba[dstIdx]   * dstA * (1 - srcA)) / outA);
                rgba[dstIdx+1] = Math.round((pixels[srcIdx+1] * srcA + rgba[dstIdx+1] * dstA * (1 - srcA)) / outA);
                rgba[dstIdx+2] = Math.round((pixels[srcIdx+2] * srcA + rgba[dstIdx+2] * dstA * (1 - srcA)) / outA);
                rgba[dstIdx+3] = Math.round(outA * 255);
              }
            }
          }
        }
      }
      chunkOff += chunkSize;
    }
    frameOff += frameSize;
  }
  return { rgba, width, height };
}

// ── Build a compressed CEL chunk from a flat RGBA buffer ──────────────────────

function buildCompressedCelChunk(layerIdx, x, y, width, height, rgba) {
  // Compress the raw pixels
  const compressed = deflateSync(rgba, { level: 6 });

  // CEL chunk body: 16 bytes header + 4 bytes (w/h) + compressed data
  const bodyLen = 16 + 4 + compressed.length;
  const chunk   = Buffer.alloc(6 + bodyLen);
  wi32(chunk, 0, chunk.length);            // chunk size
  wi16(chunk, 4, 0x2005);                  // chunk type CEL
  wi16(chunk, 6, layerIdx);               // layer index
  wi16(chunk, 8, x);                      // x pos
  wi16(chunk, 10, y);                     // y pos
  chunk[12] = 255;                         // opacity
  wi16(chunk, 13, 2);                     // cel type: compressed image
  wi16(chunk, 15, 0);                     // z-index
  // future[5] stays 0
  wi16(chunk, 22, width);                 // cel width
  wi16(chunk, 24, height);               // cel height
  compressed.copy(chunk, 26);
  return chunk;
}

// ── Build a LAYER chunk ───────────────────────────────────────────────────────

function buildLayerChunk(name, visible = true) {
  const nameBytes = Buffer.from(name, 'utf8');
  const bodyLen   = 16 + 2 + nameBytes.length;
  const chunk     = Buffer.alloc(6 + bodyLen);
  wi32(chunk, 0, chunk.length);
  wi16(chunk, 4, 0x2004);                  // LAYER chunk type
  wi16(chunk, 6, visible ? 3 : 0);        // flags: 1=visible 2=editable
  wi16(chunk, 8, 0);                       // layer type: normal
  wi16(chunk, 10, 0);                      // child level
  wi16(chunk, 16, 0);                      // blend mode: normal
  chunk[18] = 255;                          // opacity
  wi16(chunk, 22, nameBytes.length);       // name length (string header)
  nameBytes.copy(chunk, 24);
  return chunk;
}

// ── Build a full Aseprite FRAME from chunk buffers ────────────────────────────

function buildFrame(chunks, durationMs = 100) {
  const body = Buffer.concat(chunks);
  const frame = Buffer.alloc(16 + body.length);
  wi32(frame, 0, frame.length);            // frame size
  wi16(frame, 4, 0xF1FA);                 // frame magic
  wi16(frame, 6, chunks.length);          // chunk count
  wi16(frame, 8, durationMs);             // duration ms
  // bytes 10-15: future, stay 0
  body.copy(frame, 16);
  return frame;
}

// ── Build a complete single-layer Aseprite file (for appending frames) ────────

function buildAsepriteFile(width, height, frames) {
  // 128-byte file header
  const header = Buffer.alloc(128);
  // size filled in at end
  wi16(header, 4, 0xA5E0);                // magic
  wi16(header, 6, frames.length);         // num frames
  wi16(header, 8, width);
  wi16(header, 10, height);
  wi16(header, 12, 32);                   // color depth: RGBA
  wi32(header, 14, 1);                    // flags: layer opacity valid
  wi16(header, 18, 100);                  // deprecated speed
  // transparent color index, palette entries, etc – all 0
  wi16(header, 108, 1);                   // number of colors in palette
  header[122] = 1;                         // pixel width ratio
  header[123] = 1;                         // pixel height ratio
  wi16(header, 124, -1);                  // x grid pos (int16 -1 = none)
  wi16(header, 126, 64);                  // y grid pos
  // grid w/h stay 0

  const body = Buffer.concat(frames);
  const file = Buffer.concat([header, body]);
  wi32(file, 0, file.length);             // file size
  return file;
}

// ── PixelBrain passes ─────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const raw = String(hex || '#888').replace('#', '').padEnd(6, '0');
  return { r: parseInt(raw.slice(0,2),16), g: parseInt(raw.slice(2,4),16), b: parseInt(raw.slice(4,6),16) };
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
}

function applyNoisePass(rgba, width, height) {
  const noiseGrid = perlinNoiseGrid(width, height, {
    seed: 'grass-tile-enhance-v1',
    scale: 0.22,
    octaves: 3,
    persistence: 0.55,
    lacunarity: 2.0,
  });
  const noiseTex    = noiseToTexture(noiseGrid, 'organic', { contrast: 1.3, bias: -0.05 });
  const ditheredTex = applyDithering(noiseTex, 'ordered4x4', { strength: 0.45 });

  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < width * height; i++) {
    const srcA = rgba[i*4+3];
    if (srcA === 0) { out.set([0,0,0,0], i*4); continue; }
    // 22% tint blend from noise toward source
    const tR = ditheredTex.buffer[i*4];
    const tG = ditheredTex.buffer[i*4+1];
    const tB = ditheredTex.buffer[i*4+2];
    const alpha = 0.22;
    out[i*4]   = Math.round(rgba[i*4]   * (1-alpha) + tR * alpha);
    out[i*4+1] = Math.round(rgba[i*4+1] * (1-alpha) + tG * alpha);
    out[i*4+2] = Math.round(rgba[i*4+2] * (1-alpha) + tB * alpha);
    out[i*4+3] = srcA;
  }
  return out;
}

function applyMaterialPass(rgba, width, height, material) {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i*4+3];
    if (a === 0) { out.set([0,0,0,0], i*4); continue; }
    const srcHex  = rgbToHex(rgba[i*4], rgba[i*4+1], rgba[i*4+2]);
    const outHex  = transmuteMaterialColor(srcHex, material);
    const { r, g, b } = hexToRgb(outHex);
    out[i*4]=r; out[i*4+1]=g; out[i*4+2]=b; out[i*4+3]=a;
  }
  return out;
}

// ── Nearest-neighbour scale ───────────────────────────────────────────────────

function scaleNearestNeighbour(rgba, srcW, srcH, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.floor(dx * srcW / dstW);
      const sy = Math.floor(dy * srcH / dstH);
      const si = (sy * srcW + sx) * 4;
      const di = (dy * dstW + dx) * 4;
      out[di]   = rgba[si];
      out[di+1] = rgba[si+1];
      out[di+2] = rgba[si+2];
      out[di+3] = rgba[si+3];
    }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`Reading source: ${SOURCE_PATH}`);
const { rgba: rawRGBA, width: rawW, height: rawH } = decodeSourceRGBA(SOURCE_PATH);

// Verify we got real pixels
const nonEmpty = Array.from(rawRGBA).filter((_, i) => i % 4 === 3 && rawRGBA[i] > 0).length;
console.log(`  Decoded ${rawW}×${rawH}  opaque pixels: ${nonEmpty}`);
if (nonEmpty === 0) {
  console.error('ERROR: No opaque pixels decoded — check source file.');
  process.exit(1);
}

// Read the existing Variations file early so we know the target canvas size
console.log(`\nReading variations: ${VARIATIONS_PATH}`);
const varBuf = readFileSync(VARIATIONS_PATH);
const existingFrameCount = ru16(varBuf, 6);
const width  = ru16(varBuf, 8);
const height = ru16(varBuf, 10);
console.log(`  Existing: ${width}×${height}  frames: ${existingFrameCount}`);

// Scale source up to the variations canvas size (nearest-neighbour to preserve pixel art edges)
let sourceRGBA = rawRGBA;
if (rawW !== width || rawH !== height) {
  console.log(`  Scaling ${rawW}×${rawH} → ${width}×${height} (nearest-neighbour)…`);
  sourceRGBA = scaleNearestNeighbour(rawRGBA, rawW, rawH, width, height);
}

// Build four new RGBA buffers via PixelBrain passes
console.log('Running PixelBrain passes…');
const passes = [
  { name: 'Noise Detail',        rgba: applyNoisePass(sourceRGBA, width, height) },
  { name: 'Variant: Emerald',    rgba: applyMaterialPass(sourceRGBA, width, height, 'emerald') },
  { name: 'Variant: Void Ice',   rgba: applyMaterialPass(sourceRGBA, width, height, 'void_ice') },
  { name: 'Variant: Pine Needle',rgba: applyMaterialPass(sourceRGBA, width, height, 'pine_needle') },
];
passes.forEach(p => console.log(`  ✓ ${p.name}`));

// Build new frames — each frame has one layer definition + one cel
const newFrameBuffers = passes.map((pass) => {
  const layerChunk = buildLayerChunk(pass.name, true);
  const celChunk   = buildCompressedCelChunk(0, 0, 0, width, height, Buffer.from(pass.rgba));
  return buildFrame([layerChunk, celChunk], 100);
});

// Assemble: original file bytes + new frames appended
// Update frame count and file size in the header copy
const combined = Buffer.concat([varBuf, ...newFrameBuffers]);
const newFrameCount = existingFrameCount + newFrameBuffers.length;
wi16(combined, 6, newFrameCount);   // update frame count
wi32(combined, 0, combined.length); // update file size

writeFileSync(VARIATIONS_PATH, combined);

console.log(`\n✓ Written: ${VARIATIONS_PATH}`);
console.log(`  Frames: ${existingFrameCount} → ${newFrameCount}`);
console.log(`  Added:`);
passes.forEach((p, i) => {
  console.log(`    Frame ${existingFrameCount + i + 1}: ${p.name}`);
});
console.log('\n  Open in Aseprite — new frames appear at the end of the timeline.');
