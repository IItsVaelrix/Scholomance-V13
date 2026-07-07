import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { sketchToSilhouette } from '../codex/core/pixelbrain/sketch-amp.js';
import { fillTemplate } from '../codex/core/pixelbrain/template-fill-bridge.js';
import { buildSquareSharpnessContrastPayload } from '../codex/core/pixelbrain/square-sharpness-contrast-amp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'src', 'pages', 'Combat', 'assets', 'generated');
mkdirSync(OUT_DIR, { recursive: true });

function crc32(buf) {
  let c;
  const table = (crc32._t ||= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function hexToRgb(hex) {
  const m = String(hex || '').trim().replace('#', '');
  if (m.length !== 6) return null;
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}

function renderPng(coordinates, width, height, scale = 4) {
  const bg = { r: 10, g: 10, b: 18 };
  const outW = width * scale;
  const outH = height * scale;
  const pixels = Buffer.alloc(outW * outH * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bg.r; pixels[i + 1] = bg.g; pixels[i + 2] = bg.b; pixels[i + 3] = 0; // transparent
  }
  for (const c of coordinates) {
    const x = Math.round(c?.snappedX ?? c?.x);
    const y = Math.round(c?.snappedY ?? c?.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const rgb = hexToRgb(c?.color) || bg;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const px = x * scale + dx;
        const py = y * scale + dy;
        const off = (py * outW + px) * 4;
        pixels[off] = rgb.r;
        pixels[off + 1] = rgb.g;
        pixels[off + 2] = rgb.b;
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
  for (let y = 0; y < outH; y += 1) {
    filtered[y * (stride + 1)] = 0;
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(filtered);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function place(x, y, occupied, seen) {
  const key = `${x},${y}`;
  if (!seen.has(key)) {
    seen.add(key);
    occupied.push({ x, y });
  }
}

function buildTile() {
  const occupied = [];
  const seen = new Set();
  const width = 64;
  const height = 32;
  const cx = width / 2;
  const cy = height / 2;
  
  for (let y = 0; y < height; y++) {
    const dy = Math.abs(y - cy);
    const halfWidth = (height / 2 - dy) * 2;
    for (let x = Math.round(cx - halfWidth); x <= Math.round(cx + halfWidth); x++) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        place(x, y, occupied, seen);
      }
    }
  }
  return { occupied, width, height };
}

function buildTorch() {
  const occupied = [];
  const seen = new Set();
  const width = 30;
  const height = 60;
  const cx = width / 2;
  
  for (let y = 0; y < height; y++) {
    let hw = 0;
    if (y < 20) hw = 4; // flame
    else if (y < 30) hw = 8; // bowl
    else hw = 4; // pillar
    
    for (let x = cx - hw; x <= cx + hw; x++) {
      if (x >= 0 && x < width) place(x, y, occupied, seen);
    }
  }
  return { occupied, width, height };
}

function buildLeyline() {
  const occupied = [];
  const seen = new Set();
  const width = 64;
  const height = 32;
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / 2;
      const dy = y - cy;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d >= 8 && d <= 12) {
        place(x, y, occupied, seen);
      }
    }
  }
  return { occupied, width, height };
}

function runPipeline(name, builderFn, bytecode, material) {
  const { occupied, width, height } = builderFn();
  const canvas = { width, height, gridSize: 1 };
  
  const template = sketchToSilhouette(occupied, canvas, {
    bands: 4,
    symmetry: 'none',
  });

  const filled = fillTemplate(template, bytecode, { bands: template.bands });

  const sharpness = buildSquareSharpnessContrastPayload({
    coordinates: filled,
    material,
    canvas,
    options: { enabled: true, edgeContrast: 0.2, interiorContrast: 0.1 },
    intent: 'enhance_square_render_readability',
  });

  const polished = sharpness.outputCoordinates;

  const pngBytes = renderPng(polished, width, height, 4);
  writeFileSync(resolve(OUT_DIR, `${name}.png`), pngBytes);
  
  const base64 = pngBytes.toString('base64');
  writeFileSync(resolve(OUT_DIR, `${name}.js`), `export const ${name.replace('-', '_')}Uri = "data:image/png;base64,${base64}";\n`);
  console.log(`Generated ${name}`);
}

try {
  runPipeline('combat-tile', buildTile, 'VW-VOID-INEXPLICABLE-HARMONIC', 'black_steel');
  runPipeline('combat-torch', buildTorch, 'VW-ABJURATION-INEXPLICABLE-HARMONIC', 'gold');
  runPipeline('combat-leyline', buildLeyline, 'VW-SONIC-INEXPLICABLE-HARMONIC', 'amethyst');
} catch (e) {
  console.error(e);
}
