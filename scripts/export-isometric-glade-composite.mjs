#!/usr/bin/env node
/**
 * Assembles an isometric glade composite preview of the Tutorial Forest
 * using pure nearest-neighbour discrete cell rendering and exports it as a PNG.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generateGrassTile } from '../src/game/tutorial-forest/generators/SCD128GrassGenerator.js';
import { generateBotanicalTree } from '../src/game/tutorial-forest/generators/SCD128TreeGenerator.js';
import {
  generateLotusWaterTile,
  generateLilypadProp,
  generateSacredLotusBloom,
} from '../src/game/tutorial-forest/generators/SCD128LotusGenerator.js';
import { generatePathTile } from '../src/game/tutorial-forest/generators/SCD128PathGenerator.js';
import { compileCharacterModel } from '../src/game/tutorial-forest/scdl/scdlCharacterCompiler.js';
import { compileSCDLV2 } from '../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { ANCIENT_WAYMARKER_SCDL_V2, MOSSY_BOULDER_SCDL_V2 } from '../src/game/tutorial-forest/scdl/forestProps.scdl.js';
import { buildTutorialForestWorld } from '../src/game/tutorial-forest/world/tutorialForestBuilder.js';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';

const ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

function hexToRgb(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const value = parseInt(raw, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

const W = 640;
const H = 480;
const rgba = new Uint8Array(W * H * 4);
const depthBuffer = new Float32Array(W * H).fill(-999999);

// Background void
for (let i = 0; i < W * H; i += 1) {
  rgba[i * 4] = 3;
  rgba[i * 4 + 1] = 5;
  rgba[i * 4 + 2] = 10;
  rgba[i * 4 + 3] = 255;
}

function blitCells(cells, ox, oy, depth, alpha = 255) {
  for (const c of cells || []) {
    const px = Math.round(ox + c.x);
    const py = Math.round(oy + c.y);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;

    const idx = py * W + px;
    if (depth >= depthBuffer[idx]) {
      const rgb = hexToRgb(c.color);
      if (!rgb) continue;
      depthBuffer[idx] = depth;
      rgba[idx * 4] = rgb.r;
      rgba[idx * 4 + 1] = rgb.g;
      rgba[idx * 4 + 2] = rgb.b;
      rgba[idx * 4 + 3] = c.alpha ?? alpha;
    }
  }
}

// 1. Build assets in memory
const grassLush = generateGrassTile({ variant: 'glade_lush', paletteKey: 'verdant_glade' });
const grassFlowers = generateGrassTile({ variant: 'flower_carpet', paletteKey: 'verdant_glade' });
const grassMoss = generateGrassTile({ variant: 'mossy_shade', paletteKey: 'mossy_grove' });
const grassCliff = generateGrassTile({ variant: 'glade_cliff', hasCliff: true, cliffHeight: 24 });
const pathTile = generatePathTile();
const waterTile = generateLotusWaterTile({ frame: 0 });
const lilypad = generateLilypadProp();
const lotusBloom = generateSacredLotusBloom({ pulsePhase: 1 });

const oak = generateBotanicalTree('ancient_moss_oak');
const cedar = generateBotanicalTree('sacred_lotus_cedar');
const sapling = generateBotanicalTree('sunlit_young_sapling');
const pine = generateBotanicalTree('sentinel_frostpine');

const charPkg = compileCharacterModel();
const waymarker = compileSCDLV2(ANCIENT_WAYMARKER_SCDL_V2);
const boulder = compileSCDLV2(MOSSY_BOULDER_SCDL_V2);

// 2. Build world layout
const world = buildTutorialForestWorld(4242);
const tileW = 80;
const tileH = 40;

// Camera offset centering on the glade/pond:
// Center on tx = 11, ty = 11
const cx = 320;
const cy = 200;
const toIso = (tx, ty, elev = 0) => {
  return {
    x: cx + (tx - ty) * (tileW / 2) - 40,
    y: cy + (tx + ty - 22) * (tileH / 2) - elev * 16 - 20,
  };
};

// Render sub-window around the glade, path, pond and sanctuary (tx in 4..20, ty in 4..20)
for (let ty = 4; ty <= 20; ty += 1) {
  for (let tx = 4; tx <= 20; tx += 1) {
    const tile = world.tileMap.get(`${tx},${ty}`);
    if (!tile) continue;

    const pt = toIso(tx, ty, tile.elevation);
    const depth = (tx + ty) * 10;

    // Tile selection
    let asset = grassLush;
    if (tile.terrain === 'water') asset = waterTile;
    else if (tile.terrain === 'path_cobble') asset = pathTile;
    else if (tile.terrain === 'grass_flowers') asset = grassFlowers;
    else if (tile.terrain === 'grass_moss') asset = grassMoss;
    else if (tile.hasCliff) asset = grassCliff;

    blitCells(asset.cells, pt.x, pt.y, depth);

    // Water props
    if (tile.terrain === 'water') {
      const wInfo = world.waterTiles.find((w) => w.tx === tx && w.ty === ty);
      if (wInfo?.hasLilypad) {
        blitCells(lilypad.cells, pt.x + 16, pt.y + 4, depth + 1);
      }
      if (wInfo?.hasLotus) {
        blitCells(lilypad.cells, pt.x + 16, pt.y + 4, depth + 1);
        blitCells(lotusBloom.cells, pt.x + 22, pt.y + 2, depth + 2);
      }
    }
  }
}

// Render props & trees & character
const objects = [];

// Trees
for (const t of world.trees) {
  if (t.tx < 4 || t.tx > 20 || t.ty < 4 || t.ty > 20) continue;
  const pt = toIso(t.tx, t.ty, 0);
  let treeAsset = oak;
  if (t.speciesKey === 'sacred_lotus_cedar') treeAsset = cedar;
  else if (t.speciesKey === 'sunlit_young_sapling') treeAsset = sapling;
  else if (t.speciesKey === 'sentinel_frostpine') treeAsset = pine;

  objects.push({
    cells: treeAsset.cells,
    x: pt.x + 40 - treeAsset.canvasWidth / 2,
    y: pt.y + 20 - treeAsset.canvasHeight + 6,
    depth: (t.tx + t.ty) * 10 + 5,
  });
}

// Props
for (const p of world.props) {
  if (p.tx < 4 || p.tx > 20 || p.ty < 4 || p.ty > 20) continue;
  const tile = world.tileMap.get(`${p.tx},${p.ty}`);
  const pt = toIso(p.tx, p.ty, tile?.elevation || 0);

  if (p.type === 'ancient_waymarker') {
    objects.push({
      cells: waymarker.packet.geometry.coordinates,
      x: pt.x + 40 - 12,
      y: pt.y + 20 - 48 + 4,
      depth: (p.tx + p.ty) * 10 + 6,
    });
  } else if (p.type === 'mossy_boulder') {
    objects.push({
      cells: boulder.packet.geometry.coordinates,
      x: pt.x + 40 - 16,
      y: pt.y + 20 - 24 + 4,
      depth: (p.tx + p.ty) * 10 + 4,
    });
  }
}

// Player character
const playerPt = toIso(world.playerSpawn.tx, world.playerSpawn.ty, 0);
objects.push({
  cells: charPkg.frames.idle_0,
  x: playerPt.x + 40 - 16,
  y: playerPt.y + 20 - 48 + 4,
  depth: (world.playerSpawn.tx + world.playerSpawn.ty) * 10 + 7,
});

// Sort objects by depth and render
objects.sort((a, b) => a.depth - b.depth);
for (const obj of objects) {
  blitCells(obj.cells, obj.x, obj.y, obj.depth);
}

// Nearest-neighbour 2x upscale for crisp presentation
const scale = 2;
const dw = W * scale;
const dh = H * scale;
const outRgba = new Uint8Array(dw * dh * 4);

for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const src = (y * W + x) * 4;
    const r = rgba[src], g = rgba[src + 1], b = rgba[src + 2], a = rgba[src + 3];
    for (let dy = 0; dy < scale; dy += 1) {
      let dst = ((y * scale + dy) * dw + x * scale) * 4;
      for (let dx = 0; dx < scale; dx += 1) {
        outRgba[dst] = r;
        outRgba[dst + 1] = g;
        outRgba[dst + 2] = b;
        outRgba[dst + 3] = a;
        dst += 4;
      }
    }
  }
}

const pngBytes = encodePng(dw, dh, outRgba);
writeFileSync(resolve(ARTIFACT_DIR, 'tutorial_forest_glade_composite.png'), pngBytes);
console.log('[Artifacts] Saved tutorial_forest_glade_composite.png (1280x960)');
