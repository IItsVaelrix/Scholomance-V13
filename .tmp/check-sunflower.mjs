import { readFileSync, writeFileSync } from 'node:fs';
import { decodeAsepriteBinary } from '../codex/core/pixelbrain/aseprite-binary-codec.js';
import sharp from 'sharp';

const buf = readFileSync('/home/deck/Downloads/sunflower5.aseprite');
const doc = decodeAsepriteBinary(buf);

const width = doc.width;
const height = doc.height;

const rgba = Buffer.alloc(width * height * 4);

function parseHex(hex) {
  const raw = String(hex || '#FFFFFF').replace('#', '');
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

for (const layer of doc.frames[0].layers) {
  for (const c of layer.cells || []) {
    const rgb = parseHex(c.color);
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    const idx = (y * width + x) * 4;
    rgba[idx] = rgb.r;
    rgba[idx+1] = rgb.g;
    rgba[idx+2] = rgb.b;
    rgba[idx+3] = 255;
  }
}

await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile('/home/deck/Downloads/Scholomance-V12-main/docs/references/debug-sunflower5-raw.png');
console.log('Exported raw sunflower to docs/references/debug-sunflower5-raw.png');
