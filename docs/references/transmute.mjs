// Standalone PixelBrain transmute demo.
// Usage: node transmute.mjs <packet-json> <material> <out-png>
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { transmuteMaterialCoordinates } from '../../codex/core/pixelbrain/material-registry.js';

const [, , packetPath, material = 'void_ice', outPath = 'out.png'] = process.argv;

const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const { width, height } = packet.canvas;
const coords = packet.geometry.coordinates;

// The one call that matters — luminance-banded anchor remap, pure + deterministic.
const transmuted = transmuteMaterialCoordinates(coords, material);

// Rasterize {x,y,color} -> RGBA buffer (painter order = array order).
const buf = Buffer.alloc(width * height * 4, 0);
for (const c of transmuted) {
  const x = c.snappedX ?? c.x;
  const y = c.snappedY ?? c.y;
  if (x < 0 || y < 0 || x >= width || y >= height) continue;
  const hex = c.color.replace('#', '');
  const i = (y * width + x) * 4;
  buf[i] = parseInt(hex.slice(0, 2), 16);
  buf[i + 1] = parseInt(hex.slice(2, 4), 16);
  buf[i + 2] = parseInt(hex.slice(4, 6), 16);
  buf[i + 3] = 255;
}
await sharp(buf, { raw: { width, height, channels: 4 } }).png().toFile(outPath);
console.log(`transmuted ${coords.length} cells under "${material}" -> ${outPath}`);
