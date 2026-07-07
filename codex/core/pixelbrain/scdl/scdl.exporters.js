/**
 * SCDL Exporters
 *
 * Dispatcher and implementations for SCDL export targets:
 *   - json     → raw PixelBrainAssetPacket JSON string
 *   - svg      → SVG with one <rect> per coordinate
 *   - phaser   → Phaser texture config JSON
 *   - png      → deterministic RGBA PNG bytes
 *   - aseprite → Aseprite binary via aseprite-binary-codec (SCDL v1.1)
 */

import { emitLattice } from './scdl.lattice-emitter.js';
import { encodeAsepriteBinary } from '../aseprite-binary-codec.js';
import { renderSceneGraph, framebufferToCoordinates, renderMaterialCoordinateFramebuffer } from '../scene-graph-renderer.js';

/**
 * Export a compiled asset to one or more targets.
 *
 * @param {object} packet  - PixelBrainAssetPacket
 * @param {string[]} targets - e.g. ['json', 'svg', 'phaser']
 * @param {object} [ast]   - Optional: original SCDL AST
 * @returns {Record<string, {ok:boolean, output:string|object, mimeType:string}>}
 */
export function exportSCDL(packet, targets, ast, options = {}) {
  const isGraph = packet?.geometry?.mode === 'scene-graph';
  const rawLattice = isGraph
    ? _latticeFromSceneGraph(packet, options)
    : emitLattice(packet, ast);
  const lattice = !isGraph && options.shade === 'material'
    ? _materialShadeLattice(rawLattice, options)
    : rawLattice;
  const includeSemantic = options.includeSemantic || false;
  const results = {};

  for (const target of targets) {
    switch (target) {
      case 'json':   results[target] = exportJSON(packet, includeSemantic ? ast : null);    break;
      case 'svg':    results[target] = exportSVG(lattice, includeSemantic);    break;
      case 'phaser': results[target] = exportPhaser(lattice, includeSemantic); break;
      case 'png':    results[target] = exportPNG(lattice);    break;
      case 'aseprite':
        results[target] = isGraph
          ? { ok: false, output: 'aseprite export for scene-graph assets lands in PR-3', mimeType: 'text/plain' }
          : exportAseprite([packet], null, lattice.canvas);
        break;
      default:
        results[target] = { ok: false, output: `Unknown export target '${target}'`, mimeType: 'text/plain' };
    }
  }

  return results;
}

function _materialShadeLattice(lattice, options = {}) {
  const fb = renderMaterialCoordinateFramebuffer(lattice.geometry.coordinates, lattice.canvas, {
    shade: 'material',
    antialias: options.antialias,
    antialiasStrength: options.antialiasStrength,
    bloom: options.bloom,
    bloomStrength: options.bloomStrength,
  });
  return Object.freeze({
    ...lattice,
    geometry: {
      mode: 'coordinates',
      coordinates: framebufferToCoordinates(fb),
    },
  });
}

/** Forward-render a scene-graph packet into the lattice view exporters consume. */
function _latticeFromSceneGraph(packet, options = {}) {
  const fb = renderSceneGraph(packet.geometry.sceneGraph, packet.canvas, {
    shade: options.shade || 'material',
  });
  return Object.freeze({
    kind: packet.kind,
    id: packet.id,
    source: packet.source,
    canvas: { width: packet.canvas.width, height: packet.canvas.height },
    geometry: { mode: 'coordinates', coordinates: framebufferToCoordinates(fb) },
    palette: packet.palette?.sourcePalette?.[0]?.colors || [],
    _paletteMap: Object.freeze({}),
    parts: Object.freeze([]),
    provenance: packet.provenance,
    scdlSource: 'SCDL-AST-v1',
    regressionSeed: null,
  });
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

function exportJSON(packet, ast = null) {
  const out = { ...packet };
  if (ast && ast.parts) {
    out.semantic = ast.parts.map(p => ({
      id: p.id,
      annotations: p.annotations || [],
      ops: (p.ops || []).map(o => ({ id: o.id, annotations: o.annotations || [] }))
    }));
  }
  return {
    ok:       true,
    output:   JSON.stringify(out, null, 2),
    mimeType: 'application/json',
  };
}

// ─── SVG ──────────────────────────────────────────────────────────────────────

function exportSVG(lattice, includeSemantic = false) {
  const { width, height } = lattice.canvas;
  const coords = lattice.geometry.coordinates;

  // Deduplicate by (x,y) — last write wins (mirrors are on top)
  const pixelMap = new Map();
  for (const c of coords) {
    pixelMap.set(`${c.x},${c.y}`, c.color);
  }

  if (includeSemantic) {
    // TODO: embed semantic annotations as metadata or comments
  }

  const rects = [];
  for (const [key, color] of pixelMap) {
    const [x, y] = key.split(',').map(Number);
    rects.push(`  <rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    ...rects,
    `</svg>`,
  ].join('\n');

  return {
    ok:       true,
    output:   svg,
    mimeType: 'image/svg+xml',
  };
}

// ─── Phaser ───────────────────────────────────────────────────────────────────

/**
 * Phaser texture config.
 * Colors are 32-bit integers (r<<16 | g<<8 | b) for direct Phaser
 * `Graphics.fillStyle(color)` consumption.
 */
function exportPhaser(lattice) {
  const { width, height } = lattice.canvas;
  const coords = lattice.geometry.coordinates;

  const pixels = [];
  const seen = new Map();

  for (const c of coords) {
    const key = `${c.x},${c.y}`;
    seen.set(key, {
      x:     c.x,
      y:     c.y,
      color: _hexToInt(c.color),
    });
  }

  for (const entry of seen.values()) pixels.push(entry);

  // Build integer palette
  const paletteInts = {};
  for (const [name, hex] of Object.entries(lattice._paletteMap || {})) {
    paletteInts[name] = _hexToInt(hex);
  }

  const config = {
    type:    'scdl-phaser-v1',
    key:     lattice.source?.id || 'scdl-asset',
    assetId: lattice.id,
    canvas:  { width, height },
    pixels,
    palette: paletteInts,
    parts:   (lattice.parts || []).map(p => ({
      id:       p.id,
      material: p.material,
    })),
    intentOps: (lattice.parts || []).flatMap(p => p.intentOps || []),
  };

  return {
    ok:       true,
    output:   JSON.stringify(config, null, 2),
    mimeType: 'application/json',
  };
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

function exportPNG(lattice) {
  return {
    ok:       true,
    output:   renderPngBytes(lattice.geometry.coordinates, lattice.canvas.width, lattice.canvas.height),
    mimeType: 'image/png',
  };
}

// ─── Aseprite (SCDL v1.1) ────────────────────────────────────────────────────

/**
 * Build an aseprite-binary-codec payload from frame packets.
 *
 * Per the animation-encoding white paper's Encoder Law:
 *  - the layer table is fixed (union of every frame's part ids, merged in
 *    painter order), identical names/order in every frame;
 *  - every frame gets its OWN layers array and cell arrays — never shared;
 *  - parts absent from a frame are present-but-empty layers.
 *
 * @param {object[]} framePackets - One PixelBrainAssetPacket per frame
 * @param {object|null} frameLoop - SCDL-FRAME-LOOP-v1 manifest (durations)
 * @param {{width:number,height:number}|null} [fallbackCanvas]
 */
export function buildAsepritePayload(framePackets, frameLoop = null, fallbackCanvas = null) {
  const packets = (Array.isArray(framePackets) ? framePackets : [framePackets]).filter(Boolean);
  const canvas = frameLoop?.canvas || packets[0]?.canvas || fallbackCanvas || { width: 1, height: 1 };
  const defaultDuration = frameLoop?.defaultDurationMs ?? 400;

  const layerOrder = _mergePartOrders(packets.map(p => _partOrder(p)));

  const frames = packets.map((packet, i) => {
    const byPart = new Map(layerOrder.map(name => [name, []]));
    for (const c of (packet.geometry?.coordinates || [])) {
      const cells = byPart.get(c.partId);
      if (cells) cells.push({ x: c.x, y: c.y, color: c.color, emphasis: 1 });
    }
    return {
      frame:    i,
      duration: frameLoop?.frames?.[i]?.durationMs ?? defaultDuration,
      layers:   layerOrder.map(name => ({ name, cells: byPart.get(name) })),
    };
  });

  return { width: canvas.width, height: canvas.height, frames };
}

function exportAseprite(framePackets, frameLoop, fallbackCanvas) {
  return {
    ok:       true,
    output:   encodeAsepriteBinary(buildAsepritePayload(framePackets, frameLoop, fallbackCanvas)),
    mimeType: 'application/octet-stream',
  };
}

/** First-appearance part order from a packet's coordinates (painter order). */
function _partOrder(packet) {
  const order = [];
  const seen = new Set();
  for (const c of (packet.geometry?.coordinates || [])) {
    if (c.partId && !seen.has(c.partId)) {
      seen.add(c.partId);
      order.push(c.partId);
    }
  }
  return order;
}

/**
 * Merge per-frame part orders into one fixed layer table, preserving each
 * frame's relative painter order: unseen parts insert after their nearest
 * preceding part already in the table.
 */
function _mergePartOrders(orders) {
  const table = orders.length ? [...orders[0]] : [];
  const inTable = new Set(table);
  for (const order of orders.slice(1)) {
    order.forEach((name, i) => {
      if (inTable.has(name)) return;
      let insertAt = 0;
      for (let j = i - 1; j >= 0; j--) {
        const idx = table.indexOf(order[j]);
        if (idx !== -1) { insertAt = idx + 1; break; }
      }
      table.splice(insertAt, 0, name);
      inTable.add(name);
    });
  }
  return table;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _hexToInt(hex) {
  const raw = String(hex || '#000000').replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map(c => c + c).join('')
    : raw;
  return parseInt(normalized.padEnd(6, '0'), 16) || 0;
}

function _hexToRgb(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const value = parseInt(raw, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function renderPngBytes(coordinates, width, height) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const rgba = new Uint8Array(w * h * 4);

  for (const c of coordinates || []) {
    const x = Math.round(c?.x ?? c?.snappedX ?? -1);
    const y = Math.round(c?.y ?? c?.snappedY ?? -1);
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const rgb = _hexToRgb(c?.color);
    if (!rgb) continue;
    const off = (y * w + x) * 4;
    rgba[off] = rgb.r;
    rgba[off + 1] = rgb.g;
    rgba[off + 2] = rgb.b;
    rgba[off + 3] = 255;
  }

  return encodePng(w, h, rgba);
}

function encodePng(width, height, rgba) {
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  return concatBytes([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStore(filtered)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function zlibStore(data) {
  const blocks = [];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const chunk = data.subarray(offset, Math.min(offset + 65535, data.length));
    const block = new Uint8Array(5 + chunk.length);
    block[0] = offset + chunk.length >= data.length ? 1 : 0;
    writeU16LE(block, 1, chunk.length);
    writeU16LE(block, 3, (~chunk.length) & 0xffff);
    block.set(chunk, 5);
    blocks.push(block);
  }

  const checksum = new Uint8Array(4);
  writeU32BE(checksum, 0, adler32(data));
  return concatBytes([new Uint8Array([0x78, 0x01]), ...blocks, checksum]);
}

function pngChunk(type, data) {
  const typeBytes = asciiBytes(type);
  const lengthBytes = new Uint8Array(4);
  writeU32BE(lengthBytes, 0, data.length);
  const crcBytes = new Uint8Array(4);
  writeU32BE(crcBytes, 0, crc32(concatBytes([typeBytes, data])));
  return concatBytes([lengthBytes, typeBytes, data, crcBytes]);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function asciiBytes(value) {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

function writeU16LE(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32BE(target, offset, value) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
