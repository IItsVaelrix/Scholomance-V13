import { unzlibSync } from 'fflate';
export const ASEPRITE_BINARY_CODEC_VERSION = '0.2.0';

const ASE_MAGIC = 0xA5E0;
const FRAME_MAGIC = 0xF1FA;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_PALETTE = 0x2019;
const COLOR_DEPTH_RGBA = 32;
const COLOR_DEPTH_INDEXED = 8;
const HAS_BUFFER = typeof Buffer !== 'undefined' && typeof Buffer.from === 'function';

function alloc(size) {
  return HAS_BUFFER ? Buffer.alloc(size) : new Uint8Array(size);
}

function concatBytes(parts) {
  if (HAS_BUFFER) {
    return Buffer.concat(parts.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part)));
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function copyBytes(source, target, offset = 0) {
  target.set(source, offset);
}

function bytesFromString(value) {
  if (HAS_BUFFER) return Buffer.from(String(value || ''), 'utf8');
  return new TextEncoder().encode(String(value || ''));
}

function stringFromBytes(bytes) {
  if (HAS_BUFFER) return Buffer.from(bytes).toString('utf8');
  return new TextDecoder().decode(bytes);
}

function view(buffer) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function writeUInt8(buffer, value, offset) {
  if (typeof buffer.writeUInt8 === 'function') buffer.writeUInt8(value, offset);
  else view(buffer).setUint8(offset, value);
}

function writeUInt16LE(buffer, value, offset) {
  if (typeof buffer.writeUInt16LE === 'function') buffer.writeUInt16LE(value, offset);
  else view(buffer).setUint16(offset, value, true);
}

function writeInt16LE(buffer, value, offset) {
  if (typeof buffer.writeInt16LE === 'function') buffer.writeInt16LE(value, offset);
  else view(buffer).setInt16(offset, value, true);
}

function writeUInt32LE(buffer, value, offset) {
  if (typeof buffer.writeUInt32LE === 'function') buffer.writeUInt32LE(value, offset);
  else view(buffer).setUint32(offset, value, true);
}

function readUInt8(buffer, offset) {
  return typeof buffer.readUInt8 === 'function' ? buffer.readUInt8(offset) : view(buffer).getUint8(offset);
}

function readUInt16LE(buffer, offset) {
  return typeof buffer.readUInt16LE === 'function' ? buffer.readUInt16LE(offset) : view(buffer).getUint16(offset, true);
}

function readInt16LE(buffer, offset) {
  return typeof buffer.readInt16LE === 'function' ? buffer.readInt16LE(offset) : view(buffer).getInt16(offset, true);
}

function readUInt32LE(buffer, offset) {
  return typeof buffer.readUInt32LE === 'function' ? buffer.readUInt32LE(offset) : view(buffer).getUint32(offset, true);
}

function writeString(value) {
  const bytes = bytesFromString(value);
  const out = alloc(2 + bytes.length);
  writeUInt16LE(out, bytes.length, 0);
  copyBytes(bytes, out, 2);
  return out;
}

function readString(buffer, offset) {
  const length = readUInt16LE(buffer, offset);
  const start = offset + 2;
  return {
    value: stringFromBytes(buffer.subarray(start, start + length)),
    offset: start + length,
  };
}

function chunk(type, payload) {
  const out = alloc(6 + payload.length);
  writeUInt32LE(out, out.length, 0);
  writeUInt16LE(out, type, 4);
  copyBytes(payload, out, 6);
  return out;
}

function layerChunk(layer) {
  const name = writeString(layer.name || 'Layer');
  const payload = alloc(16 + name.length);
  let flags = layer.visible === false ? 0 : 1;
  if (layer.editable !== false && layer.locked !== true) flags |= 2;
  writeUInt16LE(payload, flags, 0);
  writeUInt16LE(payload, 0, 2); // normal layer
  writeUInt16LE(payload, 0, 4); // child level
  writeUInt16LE(payload, 0, 6); // default width ignored
  writeUInt16LE(payload, 0, 8); // default height ignored
  writeUInt16LE(payload, 0, 10); // normal blend mode
  writeUInt8(payload, Math.max(0, Math.min(255, Math.round(Number(layer.opacity ?? 255)))), 12);
  copyBytes(name, payload, 16);
  return chunk(CHUNK_LAYER, payload);
}

/**
 * New Palette chunk (0x2019). One entry per color, RGBA, no names.
 * Written once (frame 0) for indexed-mode files so Aseprite's own palette
 * editor and the SCDL/foundry source describe the same swatches — the
 * absence of this chunk was why "edit the palette" could only ever mean
 * "edit the hex literals and recompile": there was no palette in the file
 * to edit in the first place, regardless of the colorMode a payload claimed.
 */
function buildPaletteChunk(colors) {
  const count = colors.length;
  const payload = alloc(20 + count * 6);
  writeUInt32LE(payload, count, 0);       // new palette size
  writeUInt32LE(payload, 0, 4);           // first color index to change
  writeUInt32LE(payload, Math.max(0, count - 1), 8); // last color index
  // bytes 12-19: reserved, left zero
  let offset = 20;
  for (const hex of colors) {
    const rgb = parseHex(hex);
    writeUInt16LE(payload, 0, offset); // entry flags: no name
    writeUInt8(payload, rgb.r, offset + 2);
    writeUInt8(payload, rgb.g, offset + 3);
    writeUInt8(payload, rgb.b, offset + 4);
    writeUInt8(payload, 255, offset + 5);
    offset += 6;
  }
  return chunk(CHUNK_PALETTE, payload);
}

function decodePaletteChunk(buffer, offset) {
  const count = readUInt32LE(buffer, offset);
  const first = readUInt32LE(buffer, offset + 4);
  const colors = [];
  let cursor = offset + 20;
  for (let i = 0; i < count; i += 1) {
    const flags = readUInt16LE(buffer, cursor);
    const r = readUInt8(buffer, cursor + 2);
    const g = readUInt8(buffer, cursor + 3);
    const b = readUInt8(buffer, cursor + 4);
    colors[first + i] = rgbaToHex(r, g, b);
    cursor += 6;
    if (flags & 1) {
      const name = readString(buffer, cursor);
      cursor = name.offset;
    }
  }
  return colors;
}

function parseHex(hex) {
  const raw = String(hex || '#FFFFFF').replace('#', '');
  const safe = /^[0-9a-fA-F]{6}$/.test(raw) ? raw : 'FFFFFF';
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

function rgbaToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function layerBounds(layer) {
  const cells = Array.isArray(layer.cells) ? layer.cells : [];
  if (cells.length === 0) return null;
  const xs = cells.map((cell) => Math.round(Number(cell.x) || 0));
  const ys = cells.map((cell) => Math.round(Number(cell.y) || 0));
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

// Aseprite's binary transparency model for indexed cels: one reserved index
// (conventionally 0) means "no pixel here." There is no per-pixel partial
// alpha in this mode, so a cell below half-opacity is treated as absent
// rather than blended — a real, documented simplification, not a silent one.
const INDEXED_ALPHA_CUTOFF = 0.5;

function celChunk(layerIndex, layer, colorToIndex) {
  const bounds = layerBounds(layer);
  if (!bounds) return null;

  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const indexed = colorToIndex instanceof Map;
  const pixels = alloc(width * height * (indexed ? 1 : 4));

  (layer.cells || []).forEach((cell) => {
    const x = Math.round(Number(cell.x) || 0) - bounds.minX;
    const y = Math.round(Number(cell.y) || 0) - bounds.minY;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    // Aseprite alpha is pixel opacity, not PixelBrain emphasis. Emphasis can
    // be a low analytical weight on perfectly visible armor cells; using it
    // as alpha strips the asset body during native .aseprite export.
    const alphaUnit = Number.isFinite(Number(cell.alpha))
      ? Math.max(0, Math.min(1, Number(cell.alpha)))
      : 1;

    if (indexed) {
      if (alphaUnit < INDEXED_ALPHA_CUTOFF) return; // stays at the zero-filled transparent index
      const idx = y * width + x;
      pixels[idx] = colorToIndex.get(String(cell.color).toUpperCase()) ?? 0;
      return;
    }

    const idx = (y * width + x) * 4;
    const rgb = parseHex(cell.color);
    pixels[idx] = rgb.r;
    pixels[idx + 1] = rgb.g;
    pixels[idx + 2] = rgb.b;
    pixels[idx + 3] = Math.round(alphaUnit * 255);
  });

  const payload = alloc(16 + 4 + pixels.length);
  writeUInt16LE(payload, layerIndex, 0);
  writeInt16LE(payload, bounds.minX, 2);
  writeInt16LE(payload, bounds.minY, 4);
  writeUInt8(payload, 255, 6);
  writeUInt16LE(payload, 0, 7); // raw image cel
  writeInt16LE(payload, 0, 9);
  writeUInt16LE(payload, width, 16);
  writeUInt16LE(payload, height, 18);
  copyBytes(pixels, payload, 20);
  return chunk(CHUNK_CEL, payload);
}

function frameChunk(frame, frameIndex, layerDefs, paletteColors, colorToIndex) {
  const frameLayers = Array.isArray(frame.layers) ? frame.layers : layerDefs;
  const chunks = [];
  if (frameIndex === 0) {
    layerDefs.forEach((layer) => chunks.push(layerChunk(layer)));
    if (paletteColors) chunks.push(buildPaletteChunk(paletteColors));
  }
  frameLayers.forEach((layer, layerIndex) => {
    const cel = celChunk(layerIndex, layer, colorToIndex);
    if (cel) chunks.push(cel);
  });

  const body = concatBytes(chunks);
  const header = alloc(16);
  const frameBytes = header.length + body.length;
  writeUInt32LE(header, frameBytes, 0);
  writeUInt16LE(header, FRAME_MAGIC, 4);
  writeUInt16LE(header, Math.min(chunks.length, 0xffff), 6);
  writeUInt16LE(header, Math.max(1, Math.round(Number(frame.duration) || 100)), 8);
  writeUInt32LE(header, chunks.length, 12);
  return concatBytes([header, body]);
}

/**
 * Collect every distinct color actually used across all frames/layers, in
 * first-seen order, with a reserved transparent slot at index 0. Used both
 * to size the palette chunk and to map each cell to its palette index.
 */
function buildPaletteFromFrames(frames) {
  const colors = ['#000000']; // index 0: reserved transparent slot
  const seen = new Set(colors);
  for (const frame of frames) {
    for (const layer of frame.layers || []) {
      for (const cell of layer.cells || []) {
        const hex = String(cell.color || '').toUpperCase();
        if (hex && !seen.has(hex)) { seen.add(hex); colors.push(hex); }
      }
    }
  }
  return colors;
}

export function encodeAsepriteBinary(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Aseprite payload must be an object');
  const width = Math.max(1, Math.round(Number(payload.width) || 1));
  const height = Math.max(1, Math.round(Number(payload.height) || 1));
  const frames = Array.isArray(payload.frames) && payload.frames.length > 0
    ? payload.frames
    : [{ frame: 0, duration: 100, layers: [] }];
  const layers = Array.isArray(frames[0]?.layers) ? frames[0].layers : [];

  // Respect colorMode: 'indexed' when the payload actually declares it
  // (e.g. foundry-aseprite-bridge.js) — this used to be advertised and
  // silently ignored, so "the palette" existed only in SCDL hex literals,
  // never in the .aseprite file an artist could open and edit.
  const isIndexed = payload.colorMode === 'indexed';
  let paletteColors = null;
  let colorToIndex = null;
  if (isIndexed) {
    paletteColors = Array.isArray(payload.palette?.colors) && payload.palette.colors.length > 0
      ? ['#000000', ...payload.palette.colors.map((c) => String(c).toUpperCase())]
      : buildPaletteFromFrames(frames);
    if (paletteColors.length > 256) {
      throw new Error(`Aseprite indexed mode supports at most 256 colors, got ${paletteColors.length}`);
    }
    colorToIndex = new Map(paletteColors.map((hex, i) => [hex, i]));
  }

  const frameBuffers = frames.map((frame, index) =>
    frameChunk(frame, index, layers, isIndexed ? paletteColors : null, colorToIndex));

  const fileSize = 128 + frameBuffers.reduce((sum, item) => sum + item.length, 0);
  const header = alloc(128);
  writeUInt32LE(header, fileSize, 0);
  writeUInt16LE(header, ASE_MAGIC, 4);
  writeUInt16LE(header, frames.length, 6);
  writeUInt16LE(header, width, 8);
  writeUInt16LE(header, height, 10);
  writeUInt16LE(header, isIndexed ? COLOR_DEPTH_INDEXED : COLOR_DEPTH_RGBA, 12);
  writeUInt32LE(header, 1, 14);
  writeUInt16LE(header, 100, 18);
  writeUInt16LE(header, 0, 30);
  // Field order here is the upstream Aseprite header (docs/ase-file-specs.md):
  //   0x1C transparent index · 0x20 number of colors · 0x22/0x23 pixel ratio
  //   0x24/0x26 grid x/y · 0x28/0x2A grid width/height · 0x2B+ reserved, zero
  //
  // The palette count used to be written as two separate 1-bytes (0x20=1,
  // 0x21=1), i.e. the WORD read back as 257, and was only corrected in the
  // indexed branch below — so an RGBA export claimed a 257-entry palette while
  // carrying no palette chunk at all. Per the spec, 0 is the "no palette" value.
  writeUInt16LE(header, 0, 32);
  writeUInt16LE(header, 0, 34);          // pixel ratio 0/0 => 1:1
  // Grid x/y/width/height. Writing the canvas size here (0x26 = width,
  // 0x28 = height) told Aseprite the grid was offset by the canvas width and
  // `grid width` pixels wide; the canvas size already lives at 0x08/0x0A above.
  // Zero means "no grid", which is what a 1x foundry export is.
  writeUInt16LE(header, 0, 36);
  writeUInt16LE(header, 0, 38);
  writeUInt16LE(header, 0, 40);
  if (isIndexed) {
    writeUInt8(header, 0, 28);           // transparent color index
    writeUInt16LE(header, paletteColors.length, 32);
  }

  return concatBytes([header, ...frameBuffers]);
}

function decodeLayerChunk(buffer, offset, chunkEnd) {
  const flags = readUInt16LE(buffer, offset);
  const opacity = readUInt8(buffer, offset + 12);
  const name = readString(buffer, offset + 16);
  return {
    layer: {
      name: name.value || 'Layer',
      opacity,
      visible: Boolean(flags & 1),
      editable: Boolean(flags & 2),
      locked: !(flags & 2),
      cells: [],
    },
    offset: chunkEnd,
  };
}

function decodeCelChunk(buffer, offset, chunkEnd, layers, ctx) {
  const layerIndex = readUInt16LE(buffer, offset);
  const x = readInt16LE(buffer, offset + 2);
  const y = readInt16LE(buffer, offset + 4);
  const celType = readUInt16LE(buffer, offset + 7);
  if (celType !== 0 && celType !== 2) return { offset: chunkEnd };

  const width = readUInt16LE(buffer, offset + 16);
  const height = readUInt16LE(buffer, offset + 18);
  let pixelsOffset = offset + 20;

  let pixelData;
  if (celType === 2) {
    const compressed = buffer.subarray(pixelsOffset, chunkEnd);
    pixelData = unzlibSync(compressed);
  } else {
    pixelData = buffer.subarray(pixelsOffset, chunkEnd);
  }
  const layer = layers[layerIndex] || { name: `Layer ${layerIndex + 1}`, cells: [] };
  layers[layerIndex] = layer;

  const indexed = ctx?.depth === COLOR_DEPTH_INDEXED;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      let hex, alpha;
      if (indexed) {
        const paletteIndex = pixelData[py * width + px];
        if (paletteIndex === ctx.transparentIndex) continue;
        hex = ctx.palette[paletteIndex];
        if (!hex) continue; // index outside the decoded palette range
        alpha = 255;
      } else {
        const idx = (py * width + px) * 4;
        alpha = pixelData[idx + 3];
        if (alpha === 0) continue;
        hex = rgbaToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]);
      }
      layer.cells.push({
        x: x + px,
        y: y + py,
        color: hex,
        emphasis: Number((alpha / 255).toFixed(4)),
        metadata: {
          partId: layer.name,
          source: 'aseprite_binary_decode',
        },
      });
    }
  }
  return { offset: chunkEnd };
}

export function decodeAsepriteBinary(input) {
  const buffer = HAS_BUFFER && Buffer.isBuffer(input) ? input : new Uint8Array(input);
  if (buffer.length < 128 || readUInt16LE(buffer, 4) !== ASE_MAGIC) {
    throw new Error('Invalid Aseprite binary file');
  }
  const framesCount = readUInt16LE(buffer, 6);
  const width = readUInt16LE(buffer, 8);
  const height = readUInt16LE(buffer, 10);
  const depth = readUInt16LE(buffer, 12);
  if (depth !== COLOR_DEPTH_RGBA && depth !== COLOR_DEPTH_INDEXED) {
    throw new Error(`Unsupported Aseprite color depth: ${depth}`);
  }
  const transparentIndex = readUInt8(buffer, 28);
  let palette = null; // populated by the frame-0 palette chunk, if present

  const layers = [];
  const frames = [];
  let offset = 128;
  for (let frameIndex = 0; frameIndex < framesCount; frameIndex += 1) {
    layers.forEach((layer) => { layer.cells = []; });
    const frameBytes = readUInt32LE(buffer, offset);
    const frameEnd = offset + frameBytes;
    if (readUInt16LE(buffer, offset + 4) !== FRAME_MAGIC) throw new Error('Invalid Aseprite frame magic');
    const oldChunkCount = readUInt16LE(buffer, offset + 6);
    const duration = readUInt16LE(buffer, offset + 8);
    const newChunkCount = readUInt32LE(buffer, offset + 12);
    const chunkCount = newChunkCount || oldChunkCount;
    let chunkOffset = offset + 16;

    for (let chunkIndex = 0; chunkIndex < chunkCount && chunkOffset < frameEnd; chunkIndex += 1) {
      const chunkSize = readUInt32LE(buffer, chunkOffset);
      const type = readUInt16LE(buffer, chunkOffset + 4);
      const payloadOffset = chunkOffset + 6;
      const chunkEnd = chunkOffset + chunkSize;
      if (type === CHUNK_LAYER) {
        const decoded = decodeLayerChunk(buffer, payloadOffset, chunkEnd);
        layers.push(decoded.layer);
      } else if (type === CHUNK_PALETTE) {
        palette = decodePaletteChunk(buffer, payloadOffset);
      } else if (type === CHUNK_CEL) {
        decodeCelChunk(buffer, payloadOffset, chunkEnd, layers, { depth, palette, transparentIndex });
      }
      chunkOffset = chunkEnd;
    }

    frames.push({
      frame: frameIndex,
      duration,
      layers: layers.map((layer) => ({
        name: layer.name,
        cells: [...layer.cells],
      })),
    });
    offset = frameEnd;
  }

  const isIndexed = depth === COLOR_DEPTH_INDEXED;
  return {
    version: `foundry-aseprite-binary/${ASEPRITE_BINARY_CODEC_VERSION}`,
    width,
    height,
    cellSize: 1,
    gridType: 'rectangular',
    snapStrength: 1,
    // Report what the file actually is, not what every prior version of
    // this codec assumed — see buildPaletteChunk's doc comment for why that
    // distinction is the whole point of this pass.
    colorMode: isIndexed ? 'indexed' : 'rgba',
    frames,
    anchorPoints: [],
    symmetryAxes: [],
    palette: {
      source: 'aseprite-binary',
      // The file's own palette chunk order when present (indexed mode) —
      // re-encoding must reuse it, not a re-sorted/re-derived list, or a
      // remap tool would silently renumber every index on round-trip.
      colors: isIndexed && Array.isArray(palette)
        ? palette.slice(1) // drop the reserved transparent slot at index 0
        : Array.from(new Set(layers.flatMap((layer) => layer.cells.map((cell) => cell.color)))).sort(),
    },
    meta: {
      bridge: 'foundry-aseprite',
      binaryBridge: ASEPRITE_BINARY_CODEC_VERSION,
      sourceKind: 'aseprite-binary',
      editable: true,
    },
  };
}

/**
 * Recolor a real .aseprite file: decode, remap every matching cell color,
 * re-encode in the SAME color mode the file was already in. This is the
 * first-class replacement for hand-editing hex literals and rewriting every
 * RGBA cell by script — for an indexed-mode file, a remap here lands at the
 * same palette index the color already occupied, so Aseprite's own palette
 * editor and this call describe the same swatch.
 *
 * @param {Buffer|Uint8Array} input - a real .aseprite file's bytes
 * @param {Record<string,string>|Map<string,string>} remap - oldHex -> newHex
 *   (case-insensitive; unmatched colors pass through unchanged)
 * @returns {Buffer|Uint8Array} the recolored .aseprite file's bytes
 */
export function remapAsepriteColors(input, remap) {
  const table = remap instanceof Map ? remap : new Map(Object.entries(remap || {}));
  const normalizedTable = new Map(
    [...table.entries()].map(([from, to]) => [String(from).toUpperCase(), String(to).toUpperCase()])
  );
  const applyRemap = (hex) => normalizedTable.get(String(hex).toUpperCase()) ?? hex;

  const decoded = decodeAsepriteBinary(input);
  const frames = decoded.frames.map((frame) => ({
    ...frame,
    layers: frame.layers.map((layer) => ({
      ...layer,
      // decodeAsepriteBinary emits `emphasis`; celChunk reads `alpha` — carry
      // it across explicitly or every recolored cell silently defaults to
      // fully opaque on re-encode.
      cells: layer.cells.map((cell) => ({ ...cell, color: applyRemap(cell.color), alpha: cell.emphasis })),
    })),
  }));

  return encodeAsepriteBinary({
    ...decoded,
    frames,
    palette: { ...decoded.palette, colors: decoded.palette.colors.map(applyRemap) },
  });
}
