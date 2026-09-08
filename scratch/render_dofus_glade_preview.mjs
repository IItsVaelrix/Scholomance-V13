import fs from 'fs';
import path from 'path';
import { encodePng } from '../codex/core/pixelbrain/scdl/scdl.exporters.js';
import { synthesizeReforgedTile } from '../src/game/tutorial-forest/generators/SCD128ReforgedTiles.js';
import { generateBotanicalTree } from '../src/game/tutorial-forest/generators/SCD128TreeGenerator.js';
import {
  synthesizeAncientMossDolmen,
  synthesizeHollowFairyStump,
  synthesizeFallenMossyLog,
  synthesizeLotusStoneBasin,
  synthesizeRusticStoneWell,
  synthesizeTimberFenceWithPitchfork,
  synthesizeSunflowerPatch,
} from '../src/game/tutorial-forest/generators/SCD128ReforgedProps.js';
import { compileCharacterModel } from '../src/game/tutorial-forest/scdl/scdlCharacterCompiler.js';
import { buildTutorialForestWorld } from '../src/game/tutorial-forest/world/tutorialForestBuilder.js';

const ARTIFACT_DIR = '/home/deck/.gemini/antigravity-ide/brain/2d997ff7-470b-4154-8bf0-043db49fc909';

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').padEnd(6, '0');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function createBuffer(w, h, bg = [15, 23, 42, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = bg[3];
  }

  return {
    w, h, data,
    setPixel(x, y, hex, alpha = 255) {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const idx = (y * w + x) * 4;
      const [r, g, b] = hexToRgb(hex);
      if (alpha === 255) {
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      } else {
        const a = alpha / 255;
        data[idx] = Math.round(r * a + data[idx] * (1 - a));
        data[idx + 1] = Math.round(g * a + data[idx + 1] * (1 - a));
        data[idx + 2] = Math.round(b * a + data[idx + 2] * (1 - a));
        data[idx + 3] = 255;
      }
    },
    blitCells(cells, ox, oy, originX = 0, originY = 0) {
      for (const c of cells) {
        const px = Math.round(ox + c.x - originX);
        const py = Math.round(oy + c.y - originY);
        this.setPixel(px, py, c.color, c.alpha ?? 255);
      }
    }
  };
}

async function main() {
  console.log('Rendering Dofus/Wakfu-scale living tutorial forest composite...');
  const world = buildTutorialForestWorld(4242);

  // Cache synthesized tiles
  const tileCache = new Map();
  const getTile = (key) => {
    if (!tileCache.has(key)) {
      tileCache.set(key, synthesizeReforgedTile(key));
    }
    return tileCache.get(key);
  };

  // Cache synthesized props
  const propCache = {
    ancient_moss_dolmen: synthesizeAncientMossDolmen(),
    hollow_fairy_stump: synthesizeHollowFairyStump(),
    fallen_mossy_log: synthesizeFallenMossyLog(),
    lotus_stone_basin: synthesizeLotusStoneBasin(),
    rustic_stone_well: synthesizeRusticStoneWell(),
    timber_fence_pitchfork: synthesizeTimberFenceWithPitchfork(),
    sunflower_patch: synthesizeSunflowerPatch(),
  };

  // Cache synthesized trees
  const treeCache = new Map();
  const getTree = (species) => {
    if (!treeCache.has(species)) {
      treeCache.set(species, generateBotanicalTree(species));
    }
    return treeCache.get(species);
  };

  const charPkg = compileCharacterModel();
  const idleCharCells = charPkg.frames.idle_0;

  // Viewport setup (intimate 960x640 frame focused on the main glade and farmstead)
  const viewW = 960;
  const viewH = 640;
  const buf = createBuffer(viewW, viewH, [18, 26, 20, 255]); // Warm dark forest ambient background

  // Focus on (tx: 8, ty: 12)
  const focusTx = 8.5;
  const focusTy = 11.5;
  const tileW = 80;
  const tileH = 40;

  const toScreen = (tx, ty, elev = 0) => {
    const isoX = (tx - ty) * (tileW / 2);
    const isoY = (tx + ty) * (tileH / 2) - elev * 16;
    const centerIsoX = (focusTx - focusTy) * (tileW / 2);
    const centerIsoY = (focusTx + focusTy) * (tileH / 2);

    return {
      x: Math.round(viewW / 2 + (isoX - centerIsoX)),
      y: Math.round(viewH / 2 + (isoY - centerIsoY)),
    };
  };

  // 1. Render ground tiles sorted by isometric depth (tx + ty)
  const sortedTiles = [...world.tiles].sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty));
  for (const t of sortedTiles) {
    const pt = toScreen(t.tx, t.ty, t.elevation);
    const tileAsset = getTile(t.textureKey);
    buf.blitCells(tileAsset.cells, pt.x, pt.y, tileAsset.width / 2, tileAsset.height / 2);
  }

  // 2. Collect renderable depth items (Props, Trees, Character)
  const depthItems = [];

  // Props
  for (const p of world.props) {
    const asset = propCache[p.type];
    if (asset) {
      const pt = toScreen(p.tx, p.ty, p.elevation || 0);
      depthItems.push({
        type: 'prop',
        depth: pt.y,
        x: pt.x,
        y: pt.y + 4,
        originX: asset.width / 2,
        originY: asset.height * 0.9,
        cells: asset.cells,
      });
    }
  }

  // Trees
  for (const t of world.trees) {
    const asset = getTree(t.speciesKey);
    if (asset) {
      const pt = toScreen(t.tx, t.ty, t.elevation || 0);
      depthItems.push({
        type: 'tree',
        depth: pt.y,
        x: pt.x,
        y: pt.y + 4,
        originX: asset.canvasWidth / 2,
        originY: asset.canvasHeight * 0.95,
        cells: asset.cells,
      });
    }
  }

  // Player Character at spawn (tx: 6, ty: 17) or exploring at (tx: 8, ty: 11)
  const playerPt = toScreen(8, 11, 0);
  depthItems.push({
    type: 'player',
    depth: playerPt.y,
    x: playerPt.x,
    y: playerPt.y + 4,
    originX: charPkg.canvas.width / 2,
    originY: charPkg.canvas.height * 0.9,
    cells: idleCharCells,
  });

  // Sort by Y-depth
  depthItems.sort((a, b) => a.depth - b.depth);

  for (const item of depthItems) {
    buf.blitCells(item.cells, item.x, item.y, item.originX, item.originY);
  }

  // Save composite PNG
  const pngData = encodePng(viewW, viewH, buf.data);
  const outPath = path.join(ARTIFACT_DIR, 'dofus_living_forest_comparison.png');
  fs.writeFileSync(outPath, Buffer.from(pngData));
  console.log(`Saved composite preview to ${outPath}`);
}

main().catch(console.error);
