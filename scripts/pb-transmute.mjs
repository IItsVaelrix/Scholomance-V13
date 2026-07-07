#!/usr/bin/env node
/**
 * pb-transmute — compile an .scdl (or load a packet json), transmute every
 * pixel through a PixelBrain material (luminance -> anchor band), and write a
 * recolored PNG plus an upscaled preview next to the source.
 *
 *   npm run transmute -- <source.scdl|packet-json> <material> [--scale 8] [--out-dir DIR]
 *
 * Examples:
 *   npm run transmute -- docs/references/barrel_hand.scdl void_ice
 *   npm run transmute -- docs/references/barrel_hand.scdl icy_fire --scale 12
 *
 * Output naming (SCDL Export Naming Law): <source>-<material>-transmute.png
 * and <source>-<material>-transmute@<scale>x.png, alongside the source file.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { compileSCDL } from '../codex/core/pixelbrain/scdl/scdl.compiler.js';
import {
  transmuteMaterialCoordinates,
  resolveMaterialId,
  MATERIAL_OPTIONS,
} from '../codex/core/pixelbrain/material-registry.js';

function fail(msg) {
  console.error(`[transmute] ${msg}`);
  process.exit(1);
}

// ---- args ----
const argv = process.argv.slice(2);
const positional = [];
const opts = { scale: 8, outDir: null };
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--scale') opts.scale = Number(argv[++i]) || 8;
  else if (a === '--out-dir') opts.outDir = argv[++i];
  else if (a === '--list') {
    console.log(MATERIAL_OPTIONS.map((o) => o.value).join('\n'));
    process.exit(0);
  } else positional.push(a);
}
const [sourcePath, materialArg = 'void_ice'] = positional;
if (!sourcePath) fail('usage: pb-transmute <source.scdl|packet-json> <material> [--scale N] [--list]');

const material = resolveMaterialId(materialArg);
if (material !== materialArg) {
  console.warn(`[transmute] "${materialArg}" is not a known material — falling back to "${material}". Use --list to see options.`);
}

// ---- load the packet (compile .scdl, or read a packet json) ----
function loadPacket(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.scdl') {
    const src = readFileSync(file, 'utf8');
    const result = compileSCDL(src, { sourcePath: file });
    if (result.errors?.length) {
      for (const e of result.errors) console.error(`  ${e.code || 'ERR'}: ${e.message}`);
      fail(`SCDL compile failed (${result.errors.length} error(s))`);
    }
    return result.packet;
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

const packet = loadPacket(sourcePath);
const { width, height } = packet.canvas;
const coords = packet.geometry?.coordinates;
if (!Array.isArray(coords)) fail('packet has no geometry.coordinates to transmute');

// ---- the transmute (pure, deterministic) ----
const transmuted = transmuteMaterialCoordinates(coords, material);

// ---- rasterize {x,y,color} -> RGBA (painter order = array order) ----
const buf = Buffer.alloc(width * height * 4, 0);
for (const c of transmuted) {
  const x = c.snappedX ?? c.x;
  const y = c.snappedY ?? c.y;
  if (x < 0 || y < 0 || x >= width || y >= height) continue;
  const hex = String(c.color).replace('#', '');
  if (hex.length < 6) continue;
  const i = (y * width + x) * 4;
  buf[i] = parseInt(hex.slice(0, 2), 16);
  buf[i + 1] = parseInt(hex.slice(2, 4), 16);
  buf[i + 2] = parseInt(hex.slice(4, 6), 16);
  buf[i + 3] = 255;
}

// ---- write outputs next to source (Export Naming Law) ----
const dir = opts.outDir || path.dirname(sourcePath);
const base = path.basename(sourcePath, path.extname(sourcePath));
const outPng = path.join(dir, `${base}-${material}-transmute.png`);
const outPrev = path.join(dir, `${base}-${material}-transmute@${opts.scale}x.png`);

const img = sharp(buf, { raw: { width, height, channels: 4 } });
await img.clone().png().toFile(outPng);
await img.resize(width * opts.scale, height * opts.scale, { kernel: 'nearest' }).png().toFile(outPrev);

console.log(`[transmute] ${coords.length} cells | ${width}x${height} | material "${material}"`);
console.log(`  ${outPng}`);
console.log(`  ${outPrev}  (${opts.scale}x preview)`);
