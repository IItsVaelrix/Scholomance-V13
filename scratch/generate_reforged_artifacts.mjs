import fs from 'fs';
import path from 'path';
import { synthesizeReforgedTile } from '../src/game/tutorial-forest/generators/SCD128ReforgedTiles.js';
import {
  synthesizeAncientMossDolmen,
  synthesizeHollowFairyStump,
  synthesizeFallenMossyLog,
  synthesizeLotusStoneBasin,
} from '../src/game/tutorial-forest/generators/SCD128ReforgedProps.js';
import {
  synthesizeTileForgeProp,
} from '../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import { generateBotanicalTree } from '../src/game/tutorial-forest/generators/SCD128TreeGenerator.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').padEnd(6, '0');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function blitCells(buffer, bufW, bufH, startX, startY, cells) {
  for (const c of cells) {
    const px = startX + c.x;
    const py = startY + c.y;
    if (px >= 0 && px < bufW && py >= 0 && py < bufH) {
      const idx = (py * bufW + px) * 4;
      const [r, g, b] = hexToRgb(c.color);
      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = c.alpha ?? 255;
    }
  }
}

function blitRgba(buffer, bufW, bufH, startX, startY, srcRgba, srcW, srcH) {
  for (let y = 0; y < srcH; y += 1) {
    for (let x = 0; x < srcW; x += 1) {
      const px = startX + x;
      const py = startY + y;
      if (px >= 0 && px < bufW && py >= 0 && py < bufH) {
        const srcIdx = (y * srcW + x) * 4;
        const dstIdx = (py * bufW + px) * 4;
        const alpha = srcRgba[srcIdx + 3];
        if (alpha > 0) {
          buffer[dstIdx] = srcRgba[srcIdx];
          buffer[dstIdx + 1] = srcRgba[srcIdx + 1];
          buffer[dstIdx + 2] = srcRgba[srcIdx + 2];
          buffer[dstIdx + 3] = alpha;
        }
      }
    }
  }
}

// 1. Reforged Tiles Montage (4 columns x 4 rows, 88x60 cell slots)
console.log('Synthesizing Reforged Tiles Montage...');
const tileVariants = [
  'grass_deep_sward', 'grass_clover_dappled', 'grass_ancient_roots', 'grass_sunlit_tufts',
  'water_deep_spring', 'water_shore_transition', 'water_reed_cluster', 'path_ancient_flagstone',
  'path_runic_way', 'path_overgrown', 'cliff_mossy_granite', 'cliff_root_curtain',
  'cliff_waterfall_basin',
];

const montageW = 4 * 90 + 20;
const montageH = 4 * 65 + 20;
const tileMontageBuf = new Uint8ClampedArray(montageW * montageH * 4);

tileVariants.forEach((v, idx) => {
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  const tile = synthesizeReforgedTile(v);
  const startX = 10 + col * 90 + Math.floor((80 - tile.width) / 2);
  const startY = 10 + row * 65 + Math.floor((56 - tile.height) / 2);
  blitCells(tileMontageBuf, montageW, montageH, startX, startY, tile.cells);
});

const tilePng = encodePng(montageW, montageH, tileMontageBuf);
fs.writeFileSync(path.join(ARTIFACT_DIR, 'reforged_tiles_montage.png'), tilePng);

// 2. Storytelling Landmarks Montage (Dolmen, Fairy Stump, Fallen Log, Lotus Basin, Crystal Tree)
console.log('Synthesizing Storytelling Landmarks Montage...');
const lmW = 380;
const lmH = 110;
const lmBuf = new Uint8ClampedArray(lmW * lmH * 4);

const dolmen = synthesizeAncientMossDolmen();
blitCells(lmBuf, lmW, lmH, 10, 20, dolmen.cells);

const stump = synthesizeHollowFairyStump();
blitCells(lmBuf, lmW, lmH, 100, 38, stump.cells);

const log = synthesizeFallenMossyLog();
blitCells(lmBuf, lmW, lmH, 175, 56, log.cells);

const basin = synthesizeLotusStoneBasin();
blitCells(lmBuf, lmW, lmH, 260, 48, basin.cells);

const tfCrystal = synthesizeTileForgeProp({ biome: 'void_forest', propType: 'crystal_tree', seed: 777 });
blitRgba(lmBuf, lmW, lmH, 320, 32, tfCrystal.data, tfCrystal.width, tfCrystal.height);

const lmPng = encodePng(lmW, lmH, lmBuf);
fs.writeFileSync(path.join(ARTIFACT_DIR, 'reforged_landmarks_montage.png'), lmPng);

// 3. Composite Living Forest Slice (10x10 isometric diamond render)
console.log('Synthesizing Composite Living Forest Slice...');
const compW = 440;
const compH = 340;
const compBuf = new Uint8ClampedArray(compW * compH * 4);

// Fill with subtle dark atmosphere background
for (let i = 0; i < compW * compH; i += 1) {
  compBuf[i * 4] = 3;
  compBuf[i * 4 + 1] = 5;
  compBuf[i * 4 + 2] = 10;
  compBuf[i * 4 + 3] = 255;
}

const isoCenter = { x: 220, y: 70 };
const toIso = (tx, ty, z = 0) => ({
  x: isoCenter.x + (tx - ty) * 40,
  y: isoCenter.y + (tx + ty) * 20 - z * 16,
});

// Render terrain tiles from back to front
for (let sum = 0; sum <= 14; sum += 1) {
  for (let tx = 0; tx <= 7; tx += 1) {
    const ty = sum - tx;
    if (ty < 0 || ty > 7) continue;

    let terrain = 'grass_deep_sward';
    let z = 0;

    if (tx >= 5 && ty <= 2) {
      z = 1;
      terrain = (tx === 5 || ty === 2) ? 'cliff_mossy_granite' : 'path_runic_way';
    } else if (tx >= 3 && tx <= 5 && ty >= 3 && ty <= 5) {
      terrain = (tx === 4 && ty === 4) ? 'water_deep_spring' : 'water_shore_transition';
    } else if (tx === 2 || ty === 6) {
      terrain = 'path_ancient_flagstone';
    } else if ((tx + ty) % 3 === 0) {
      terrain = 'grass_clover_dappled';
    } else if ((tx + ty) % 2 === 0) {
      terrain = 'grass_ancient_roots';
    } else {
      terrain = 'grass_sunlit_tufts';
    }

    const pt = toIso(tx, ty, z);
    const tile = synthesizeReforgedTile(terrain);
    const drawX = Math.round(pt.x - tile.width / 2);
    const drawY = Math.round(pt.y - (terrain.startsWith('cliff_') ? 36 : 20));
    blitCells(compBuf, compW, compH, drawX, drawY, tile.cells);
  }
}

// Render Props & Trees
// Dolmen on plateau (tx: 5, ty: 2, z: 1)
const ptDolmen = toIso(5, 2, 1);
blitCells(compBuf, compW, compH, ptDolmen.x - 40, ptDolmen.y - 56, dolmen.cells);

// Fairy stump (tx: 1, ty: 2, z: 0)
const ptStump = toIso(1, 2, 0);
blitCells(compBuf, compW, compH, ptStump.x - 32, ptStump.y - 44, stump.cells);

// Fallen log (tx: 2, ty: 5, z: 0)
const ptLog = toIso(2, 5, 0);
blitCells(compBuf, compW, compH, ptLog.x - 38, ptLog.y - 28, log.cells);

// Lotus basin (tx: 3, ty: 3, z: 0)
const ptBasin = toIso(3, 3, 0);
blitCells(compBuf, compW, compH, ptBasin.x - 24, ptBasin.y - 34, basin.cells);

// Botanical Oak (tx: 0, ty: 4, z: 0)
const oak = generateBotanicalTree('ancient_moss_oak');
blitCells(compBuf, compW, compH, toIso(0, 4).x - 48, toIso(0, 4).y - 88, oak.cells);

// Botanical Cedar (tx: 6, ty: 5, z: 0)
const cedar = generateBotanicalTree('sacred_lotus_cedar');
blitCells(compBuf, compW, compH, toIso(6, 5).x - 40, toIso(6, 5).y - 74, cedar.cells);

// Tile Forge Crystal Tree (tx: 6, ty: 1, z: 1)
const ptCry = toIso(6, 1, 1);
blitRgba(compBuf, compW, compH, ptCry.x - 24, ptCry.y - 68, tfCrystal.data, tfCrystal.width, tfCrystal.height);

const compPng = encodePng(compW, compH, compBuf);
fs.writeFileSync(path.join(ARTIFACT_DIR, 'reforged_forest_composite.png'), compPng);

console.log('Artifact previews successfully generated in:', ARTIFACT_DIR);
