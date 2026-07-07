#!/usr/bin/env node
/**
 * prepare-ai-reference.mjs
 *
 * Takes raw AI-enhanced (or external) image output and prepares it as a
 * scan-ready reference for PixelBrain silhouette blueprints or construction
 * skeleton extraction.
 *
 * Responsibilities:
 * - Resize to exact target grid using nearest-neighbor (preserves pixel intent)
 * - Ensure RGBA with usable alpha (key out solid backgrounds if needed)
 * - Pad or letterbox to exact canvas size, respecting common registration (center or bottom)
 * - Optional isometric diamond mask for floor tiles
 * - Output clean PNG ready for --front/--side etc. to silhouette-scan
 *
 * Philosophy: AI raster is only ever a reference. We derive lattice from it.
 * Post-prep images should be minimal, high-contrast edge, exact integer dims.
 *
 * Usage examples:
 *   node scripts/prepare-ai-reference.mjs raw-ai.png --grid 64x64 --view front --out prepared/front.png
 *   node scripts/prepare-ai-reference.mjs tile-raw.png --grid 128x64 --isometric-diamond --out void_floor_prepared.png
 *   node scripts/prepare-ai-reference.mjs chibi.png --grid 64x64 --registration bottom-center --out prepared/chibi.png
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? def : process.argv[i + 1];
}

function parseGrid(str) {
  if (!str) return { w: 64, h: 64 };
  const m = /^(\d+)x(\d+)(?:x(\d+))?$/.exec(str);
  if (!m) throw new Error('GRID must be WxH or WxHxD e.g. 64x64 or 128x64');
  return { w: Number(m[1]), h: Number(m[2]) };
}

function usage() {
  console.error(`Usage:
  node scripts/prepare-ai-reference.mjs <input.png> --grid WxH [--view front|side|top] [--out out.png]
                                         [--registration center|bottom-center]
                                         [--isometric-diamond] [--key-bg] [--verbose]
`);
  process.exit(1);
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith('--')) usage();

  const gridStr = arg('--grid');
  if (!gridStr) usage();
  const { w: targetW, h: targetH } = parseGrid(gridStr);

  const outPath = arg('--out');
  const view = arg('--view', 'front');
  const registration = arg('--registration', 'center'); // or 'bottom-center'
  const doDiamond = process.argv.includes('--isometric-diamond');
  const keyBg = process.argv.includes('--key-bg');
  const verbose = process.argv.includes('--verbose');

  const inPath = resolve(input);
  const finalOut = outPath ? resolve(outPath) : resolve(`prepared/${view || 'ref'}.png`);

  mkdirSync(dirname(finalOut), { recursive: true });

  if (verbose) console.log(`[prep] input=${inPath} target=${targetW}x${targetH} registration=${registration} diamond=${doDiamond}`);

  // Load + force alpha
  let img = sharp(inPath).ensureAlpha();

  const meta = await img.metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  if (verbose) console.log(`[prep] src=${srcW}x${srcH}`);

  // 1. Resize to target using nearest neighbor (sharp 'nearest')
  // We first compute the scale that fits while preserving aspect for the reference shape.
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const fitW = Math.round(srcW * scale);
  const fitH = Math.round(srcH * scale);

  img = img.resize(fitW, fitH, { kernel: sharp.kernel.nearest });

  // 2. Create exact size canvas, paste the fitted image according to registration
  let left = 0;
  let top = 0;

  if (registration === 'bottom-center') {
    left = Math.round((targetW - fitW) / 2);
    top = targetH - fitH;
  } else {
    // center
    left = Math.round((targetW - fitW) / 2);
    top = Math.round((targetH - fitH) / 2);
  }

  // Composite onto transparent target canvas of exact size
  const canvas = sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  });

  img = canvas.composite([{
    input: await img.toBuffer(),
    left: Math.max(0, left),
    top: Math.max(0, top)
  }]).png();

  // 3. Optional solid bg keying (useful if AI gave solid color bg instead of alpha)
  if (keyBg) {
    // Sample corners to guess bg, then make near-bg fully transparent
    const buf = await img.toBuffer({ resolveWithObject: true });
    const { data, info } = buf;
    const bgTol = 22;

    // Sample 4 corners
    const samples = [
      [0, 0], [info.width - 1, 0],
      [0, info.height - 1], [info.width - 1, info.height - 1]
    ];
    const bg = { r: 0, g: 0, b: 0, count: 0 };

    for (const [x, y] of samples) {
      const i = (y * info.width + x) * 4;
      bg.r += data[i]; bg.g += data[i+1]; bg.b += data[i+2]; bg.count++;
    }
    bg.r = Math.round(bg.r / bg.count);
    bg.g = Math.round(bg.g / bg.count);
    bg.b = Math.round(bg.b / bg.count);

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        const dr = Math.abs(data[i] - bg.r);
        const dg = Math.abs(data[i+1] - bg.g);
        const db = Math.abs(data[i+2] - bg.b);
        if (dr <= bgTol && dg <= bgTol && db <= bgTol) {
          data[i+3] = 0;
        }
      }
    }
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }

  // 4. Isometric diamond mask (for floor tiles per SCDNA gene)
  if (doDiamond) {
    // Diamond inscribed in targetW x targetH (classic 2:1 iso)
    // For 128x64: the diamond touches left/right mid and top/bottom center-ish.
    // We zero alpha outside the diamond.
    const buf = await img.toBuffer({ resolveWithObject: true });
    const { data, info } = buf;
    const cx = (info.width - 1) / 2;
    const cy = (info.height - 1) / 2;

    // Manhattan-ish diamond: |dx| / (w/2) + |dy| / (h/2) <= 1.0
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const dx = (x - cx) / (info.width / 2);
        const dy = (y - cy) / (info.height / 2);
        if (Math.abs(dx) + Math.abs(dy) > 1.02) {  // small epsilon for crisp
          const i = (y * info.width + x) * 4;
          data[i + 3] = 0;
        }
      }
    }
    img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  }

  // Final output as PNG (no compression artifacts)
  const outBuffer = await img.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(finalOut, outBuffer);

  // Quick verification
  const finalMeta = await sharp(finalOut).metadata();
  console.log(`[prep] wrote ${finalOut}  (${finalMeta.width}x${finalMeta.height} RGBA)`);

  // Hint for next step
  console.log(`Next: node scripts/pixelbrain-silhouette-scan.mjs --front ${finalOut} --id YOUR.ID --grid ${targetW}x${targetH}x16 --out specs/your.silh`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
