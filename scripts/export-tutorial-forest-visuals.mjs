#!/usr/bin/env node
/**
 * Tutorial Forest Visual Evidence Exporter
 *
 * Renders the complete forge-authored continuous tutorial forest scene and
 * exports individual and composite native and 2x nearest-neighbor PNG artifacts.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { forgeTutorialForestEnvironment } from '../src/game/tutorial-forest/generators/TutorialForestForgeAdapter.js';
import { buildTutorialForestWorld } from '../src/game/tutorial-forest/world/tutorialForestBuilder.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const DEFAULT_ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

export function parseTutorialForestExportArgs(args = []) {
  let seed = 4242;
  let scale = 1;
  let outDir = DEFAULT_ARTIFACT_DIR;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--seed' && i + 1 < args.length) {
      seed = Number.parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--scale' && i + 1 < args.length) {
      const rawScale = args[i + 1];
      const parsed = Number(rawScale);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Scale must be a positive integer, got ${rawScale}`);
      }
      scale = parsed;
      i += 1;
    } else if (arg === '--out' && i + 1 < args.length) {
      outDir = args[i + 1];
      i += 1;
    }
  }

  return { seed, scale, outDir };
}

export function scaleNearestNeighbor(source, srcWidth, srcHeight, scale) {
  const s = Math.floor(scale);
  if (s <= 1) return source instanceof Uint8ClampedArray ? source : new Uint8ClampedArray(source);
  const destWidth = srcWidth * s;
  const destHeight = srcHeight * s;
  const dest = new Uint8ClampedArray(destWidth * destHeight * 4);
  for (let y = 0; y < destHeight; y += 1) {
    const srcY = Math.floor(y / s);
    for (let x = 0; x < destWidth; x += 1) {
      const srcX = Math.floor(x / s);
      const srcOffset = (srcY * srcWidth + srcX) * 4;
      const destOffset = (y * destWidth + x) * 4;
      dest[destOffset] = source[srcOffset];
      dest[destOffset + 1] = source[srcOffset + 1];
      dest[destOffset + 2] = source[srcOffset + 2];
      dest[destOffset + 3] = source[srcOffset + 3];
    }
  }
  return dest;
}

export async function composeTutorialForestVisual(options = {}) {
  const seed = options.seed ?? 4242;
  const world = buildTutorialForestWorld(seed);
  const runtime = forgeTutorialForestEnvironment(world, { seed });
  const ground = runtime.ground;
  const form = ground.form;

  // Compute composite bounds covering ground and all actors
  let minX = 0;
  let maxX = ground.width;
  let minY = 0;
  let maxY = ground.height;

  const actorPlacements = [];
  for (const descriptor of runtime.actors) {
    const anchor = form.cellAnchors[`${descriptor.tx},${descriptor.ty}`];
    if (!anchor) continue;
    const cellCenterX = anchor.x + 40;
    const cellCenterY = anchor.y + 20;
    const asset = descriptor.asset;
    const posX = Math.round(
      cellCenterX - (asset.anchor?.x ?? 0.5) * asset.width + (descriptor.offsetX ?? 0),
    );
    const posY = Math.round(
      cellCenterY - (asset.anchor?.y ?? 1.0) * asset.height + (descriptor.offsetY ?? 0),
    );
    const depth = cellCenterY + (descriptor.offsetY ?? 0) + (asset.depthBias ?? 0);

    actorPlacements.push({
      descriptor,
      asset,
      x: posX,
      y: posY,
      depth,
    });

    if (posX < minX) minX = posX;
    if (posX + asset.width > maxX) maxX = posX + asset.width;
    if (posY < minY) minY = posY;
    if (posY + asset.height > maxY) maxY = posY + asset.height;
  }

  // Padding margin so silhouettes have breathing room
  const pad = 32;
  const originOffsetX = -minX + pad;
  const originOffsetY = -minY + pad;
  const compWidth = (maxX - minX) + pad * 2;
  const compHeight = (maxY - minY) + pad * 2;

  const compData = new Uint8ClampedArray(compWidth * compHeight * 4);

  // 1. Blit ground region
  for (let y = 0; y < ground.height; y += 1) {
    const dstY = y + originOffsetY;
    if (dstY < 0 || dstY >= compHeight) continue;
    for (let x = 0; x < ground.width; x += 1) {
      const dstX = x + originOffsetX;
      if (dstX < 0 || dstX >= compWidth) continue;
      const srcIdx = (y * ground.width + x) * 4;
      const alpha = ground.data[srcIdx + 3];
      if (alpha > 0) {
        const dstIdx = (dstY * compWidth + dstX) * 4;
        compData[dstIdx] = ground.data[srcIdx];
        compData[dstIdx + 1] = ground.data[srcIdx + 1];
        compData[dstIdx + 2] = ground.data[srcIdx + 2];
        compData[dstIdx + 3] = alpha;
      }
    }
  }

  // 2. Sort actors by depth and blit with alpha blending
  actorPlacements.sort((a, b) => a.depth - b.depth);

  for (const placement of actorPlacements) {
    const asset = placement.asset;
    const startX = placement.x + originOffsetX;
    const startY = placement.y + originOffsetY;

    for (let y = 0; y < asset.height; y += 1) {
      const dstY = startY + y;
      if (dstY < 0 || dstY >= compHeight) continue;
      for (let x = 0; x < asset.width; x += 1) {
        const dstX = startX + x;
        if (dstX < 0 || dstX >= compWidth) continue;
        const srcIdx = (y * asset.width + x) * 4;
        const alpha = asset.data[srcIdx + 3];
        if (alpha > 0) {
          const dstIdx = (dstY * compWidth + dstX) * 4;
          if (alpha === 255 || compData[dstIdx + 3] === 0) {
            compData[dstIdx] = asset.data[srcIdx];
            compData[dstIdx + 1] = asset.data[srcIdx + 1];
            compData[dstIdx + 2] = asset.data[srcIdx + 2];
            compData[dstIdx + 3] = alpha;
          } else {
            const a = alpha / 255;
            const invA = 1 - a;
            compData[dstIdx] = Math.round(asset.data[srcIdx] * a + compData[dstIdx] * invA);
            compData[dstIdx + 1] = Math.round(asset.data[srcIdx + 1] * a + compData[dstIdx + 1] * invA);
            compData[dstIdx + 2] = Math.round(asset.data[srcIdx + 2] * a + compData[dstIdx + 2] * invA);
            compData[dstIdx + 3] = Math.max(compData[dstIdx + 3], alpha);
          }
        }
      }
    }
  }

  return {
    width: compWidth,
    height: compHeight,
    data: compData,
    groundRealizationHash: ground.realizationHash,
    quality: runtime.quality,
    runtime,
  };
}

// CLI execution
const isCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const args = parseTutorialForestExportArgs(process.argv.slice(2));
  console.log(`[Export] Composing Tutorial Forest visual with seed ${args.seed}...`);

  composeTutorialForestVisual({ seed: args.seed }).then((composite) => {
    mkdirSync(args.outDir, { recursive: true });

    // 1. Export 1x native composite PNG
    const png1x = encodePng(composite.width, composite.height, composite.data);
    const out1x = resolve(args.outDir, 'tutorial-forest-sunlit-glade.png');
    writeFileSync(out1x, png1x);
    console.log(`✓ Exported 1x native composite (${composite.width}x${composite.height}) to ${out1x}`);

    // 2. Export 2x nearest-neighbor PNG if scale > 1 or default
    const scale = args.scale > 1 ? args.scale : 2;
    const scaledData = scaleNearestNeighbor(composite.data, composite.width, composite.height, scale);
    const png2x = encodePng(composite.width * scale, composite.height * scale, scaledData);
    const out2x = resolve(args.outDir, `tutorial-forest-sunlit-glade-${scale}x.png`);
    writeFileSync(out2x, png2x);
    console.log(`✓ Exported ${scale}x nearest-neighbor composite (${composite.width * scale}x${composite.height * scale}) to ${out2x}`);

    // 3. Export ground-only texture
    const groundPng = encodePng(composite.runtime.ground.width, composite.runtime.ground.height, composite.runtime.ground.data);
    const groundOut = resolve(args.outDir, 'tutorial-forest-ground-fabric.png');
    writeFileSync(groundOut, groundPng);
    console.log(`✓ Exported ground fabric texture to ${groundOut}`);

    console.log(`\nQuality Score: ${composite.quality.score}/100 (Grade ${composite.quality.grade})`);
  }).catch((err) => {
    console.error('Export failed:', err);
    process.exit(1);
  });
}
