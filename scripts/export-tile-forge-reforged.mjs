#!/usr/bin/env node
/**
 * Export visual PNG previews of Reforged Tile Forge assets to the artifacts directory.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  synthesizeTileForgeTile,
  synthesizeTileForgeProp,
} from '../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

function scaleBufferToPng(rawRgba, width, height, scale = 4) {
  const dw = width * scale;
  const dh = height * scale;
  const out = new Uint8Array(dw * dh * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcIdx = (y * width + x) * 4;
      const r = rawRgba[srcIdx];
      const g = rawRgba[srcIdx + 1];
      const b = rawRgba[srcIdx + 2];
      const a = rawRgba[srcIdx + 3];

      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const dstIdx = ((y * scale + dy) * dw + (x * scale + dx)) * 4;
          out[dstIdx] = r;
          out[dstIdx + 1] = g;
          out[dstIdx + 2] = b;
          out[dstIdx + 3] = a;
        }
      }
    }
  }

  return encodePng(dw, dh, out);
}

const assetsToExport = [
  { name: 'tile_forge_void_forest_top.png', fn: () => synthesizeTileForgeTile({ type: 'top', biome: 'void_forest', seed: 4242 }) },
  { name: 'tile_forge_void_forest_cliff.png', fn: () => synthesizeTileForgeTile({ type: 'cliff', biome: 'void_forest', seed: 4242, elevation: 1 }) },
  { name: 'tile_forge_void_ice_top.png', fn: () => synthesizeTileForgeTile({ type: 'top', biome: 'void_ice', seed: 777 }) },
  { name: 'tile_forge_void_ice_cliff.png', fn: () => synthesizeTileForgeTile({ type: 'cliff', biome: 'void_ice', seed: 777, elevation: 1 }) },
  { name: 'tile_forge_cave_chasm_top.png', fn: () => synthesizeTileForgeTile({ type: 'top', biome: 'cave_chasm', seed: 999 }) },
  { name: 'tile_forge_cave_chasm_cliff.png', fn: () => synthesizeTileForgeTile({ type: 'cliff', biome: 'cave_chasm', seed: 999, elevation: 1 }) },
  { name: 'tile_forge_crystal_tree.png', fn: () => synthesizeTileForgeProp({ propType: 'crystal_tree', biome: 'void_forest', seed: 101 }) },
  { name: 'tile_forge_void_pine.png', fn: () => synthesizeTileForgeProp({ propType: 'void_pine', biome: 'void_forest', seed: 202 }) },
];

for (const item of assetsToExport) {
  const asset = item.fn();
  const pngBuf = scaleBufferToPng(asset.data, asset.width, asset.height, 4);
  const outPath = resolve(ARTIFACT_DIR, item.name);
  writeFileSync(outPath, pngBuf);
  console.log(`Exported ${item.name} (${asset.width * 4}x${asset.height * 4}) -> ${outPath}`);
}
console.log('All Reforged Tile Forge assets exported successfully.');
