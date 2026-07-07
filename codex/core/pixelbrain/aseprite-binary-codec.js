import { unzlibSync } from 'fflate';
export const ASEPRITE_BINARY_CODEC_VERSION = '0.1.0';

const ASE_MAGIC = 0xA5E0;
const FRAME_MAGIC = 0xF1FA;
const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const COLOR_DEPTH_RGBA = 32;
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

function celChunk(layerIndex, layer) {
  const bounds = layerBounds(layer);
  if (!bounds) return null;

  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const pixels = alloc(width * height * 4);

  (layer.cells || []).forEach((cell) => {
    const x = Math.round(Number(cell.x) || 0) - bounds.minX;
    const y = Math.round(Number(cell.y) || 0) - bounds.minY;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (y * width + x) * 4;
    const rgb = parseHex(cell.color);
    // Aseprite alpha is pixel opacity, not PixelBrain emphasis. Emphasis can
    // be a low analytical weight on perfectly visible armor cells; using it
    // as alpha strips the asset body during native .aseprite export.
    const alpha = Number.isFinite(Number(cell.alpha))
      ? Math.round(Math.max(0, Math.min(1, Number(cell.alpha))) * 255)
      : 255;
    pixels[idx] = rgb.r;
    pixels[idx + 1] = rgb.g;
    pixels[idx + 2] = rgb.b;
    pixels[idx + 3] = alpha;
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

function frameChunk(frame, frameIndex, layerDefs) {
  const frameLayers = Array.isArray(frame.layers) ? frame.layers : layerDefs;
  const chunks = [];
  if (frameIndex === 0) {
    layerDefs.forEach((layer) => chunks.push(layerChunk(layer)));
  }
  frameLayers.forEach((layer, layerIndex) => {
    const cel = celChunk(layerIndex, layer);
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

export function encodeAsepriteBinary(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Aseprite payload must be an object');
  const width = Math.max(1, Math.round(Number(payload.width) || 1));
  const height = Math.max(1, Math.round(Number(payload.height) || 1));
  const frames = Array.isArray(payload.frames) && payload.frames.length > 0
    ? payload.frames
    : [{ frame: 0, duration: 100, layers: [] }];
  const layers = Array.isArray(frames[0]?.layers) ? frames[0].layers : [];
  const frameBuffers = frames.map((frame, index) => frameChunk(frame, index, layers));

  const fileSize = 128 + frameBuffers.reduce((sum, item) => sum + item.length, 0);
  const header = alloc(128);
  writeUInt32LE(header, fileSize, 0);
  writeUInt16LE(header, ASE_MAGIC, 4);
  writeUInt16LE(header, frames.length, 6);
  writeUInt16LE(header, width, 8);
  writeUInt16LE(header, height, 10);
  writeUInt16LE(header, COLOR_DEPTH_RGBA, 12);
  writeUInt32LE(header, 1, 14);
  writeUInt16LE(header, 100, 18);
  writeUInt16LE(header, 0, 30);
  writeUInt8(header, 1, 32);
  writeUInt8(header, 1, 33);
  writeInt16LE(header, 0, 34);
  writeInt16LE(header, 0, 36);
  writeUInt16LE(header, width, 38);
  writeUInt16LE(header, height, 40);

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

function decodeCelChunk(buffer, offset, chunkEnd, layers) {
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

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const idx = ((py * width + px) * 4);
      const alpha = pixelData[idx + 3];
      if (alpha === 0) continue;
      layer.cells.push({
        x: x + px,
        y: y + py,
        color: rgbaToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]),
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
  if (depth !== COLOR_DEPTH_RGBA) throw new Error(`Unsupported Aseprite color depth: ${depth}`);

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
      } else if (type === CHUNK_CEL) {
        decodeCelChunk(buffer, payloadOffset, chunkEnd, layers);
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

  return {
    version: `foundry-aseprite-binary/${ASEPRITE_BINARY_CODEC_VERSION}`,
    width,
    height,
    cellSize: 1,
    gridType: 'rectangular',
    snapStrength: 1,
    colorMode: 'rgba',
    frames,
    anchorPoints: [],
    symmetryAxes: [],
    palette: {
      source: 'aseprite-binary',
      colors: Array.from(new Set(layers.flatMap((layer) => layer.cells.map((cell) => cell.color)))).sort(),
    },
    meta: {
      bridge: 'foundry-aseprite',
      binaryBridge: ASEPRITE_BINARY_CODEC_VERSION,
      sourceKind: 'aseprite-binary',
      editable: true,
    },
  };
}
