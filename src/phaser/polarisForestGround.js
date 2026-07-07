/**
 * Flat forest ground + canopy sky for Polaris.
 * Replaces the void-courtyard floating island with an endless moss floor.
 */

import { fbm2D, createForestRng } from '../game/world/polarisForestPipeline.js';
import { generatePermutationTable } from '../../codex/core/pixelbrain/procedural-noise.js';
import {
  generateIsoTileLandscape,
  ISO_TILE_METRICS,
} from '../game/world/isoTileLandscape.js';
import { hasIsoTileTextures } from './isoTileTextures.js';

const FLOOR = Object.freeze({
  mossDeep: 0x1a4a44,
  mossMid: 0x2d6b5a,
  mossLit: 0x3d8a70,
  mossBright: 0x55aa88,
  litter: 0x4a3828,
  root: 0x2a1810,
});

const CANOPY = Object.freeze({
  skyTop: 0x0a1a14,
  skyMid: 0x143828,
  haze: 0x1e5040,
  lightShaft: 0x3a8060,
});

/** @param {import('phaser').Scene} scene */
export function hideVoidSky(scene) {
  scene.galaxyBg?.setVisible(false);
  scene.galaxyBg?.setAlpha(0);
}

/** @param {import('phaser').Scene} scene */
export function destroyPolarisForestGround(scene) {
  scene.polarisForestSky?.destroy();
  scene.polarisForestSky = null;
  scene.polarisIsoTileGroup?.destroy(true);
  scene.polarisIsoTileGroup = null;
  scene.polarisForestFloor?.destroy(true);
  scene.polarisForestFloor = null;
  scene._terrainGraphics?.destroy();
  scene._terrainGraphics = null;
  scene._terrainShimmerGraphics?.destroy();
  scene._terrainShimmerGraphics = null;
}

/**
 * Filtered canopy light — replaces the galaxy void.
 *
 * @param {import('phaser').Scene} scene
 */
export function drawForestCanopySky(scene) {
  hideVoidSky(scene);
  scene.polarisForestSky?.destroy();

  const cam = scene.cameras.main;
  const gw = scene.scale.width;
  const gh = scene.scale.height;
  const zoom = cam.zoom || 1;
  const viewLeft = cam.scrollX;
  const viewTop = cam.scrollY;
  const viewW = gw / zoom;
  const viewH = gh / zoom;
  const margin = Math.max(300, Math.min(gw, gh) * 0.35);
  const left = viewLeft - margin;
  const top = viewTop - margin;
  const w = viewW + margin * 2;
  const h = viewH + margin * 2;

  const graphics = scene.add.graphics();
  graphics.setDepth(-900);

  graphics.fillStyle(CANOPY.skyTop, 1);
  graphics.fillRect(left, top, w, h * 0.45);

  graphics.fillStyle(CANOPY.skyMid, 0.85);
  graphics.fillRect(left, top + h * 0.2, w, h * 0.55);

  graphics.fillStyle(CANOPY.haze, 0.35);
  for (let i = 0; i < 12; i += 1) {
    const bandY = top + h * (0.15 + i * 0.06);
    graphics.fillRect(left, bandY, w, h * 0.04);
  }

  const rng = createForestRng('polaris-canopy-shafts');
  for (let i = 0; i < 6; i += 1) {
    const shaftX = left + rng() * w;
    const shaftW = 40 + rng() * 80;
    graphics.fillStyle(CANOPY.lightShaft, 0.04 + rng() * 0.05);
    graphics.fillTriangle(
      shaftX, top,
      shaftX + shaftW, top,
      shaftX + shaftW * 0.4, top + h * 0.7,
    );
    graphics.fillTriangle(
      shaftX, top,
      shaftX - shaftW * 0.3, top + h * 0.7,
      shaftX + shaftW * 0.4, top + h * 0.7,
    );
  }

  scene.polarisForestSky = graphics;
  return graphics;
}

/**
 * @param {number} n
 * @param {Uint16Array} permutation
 */
function floorTone(n, permutation, x, y) {
  if (n < 0.25) return FLOOR.mossDeep;
  if (n < 0.45) return FLOOR.mossMid;
  if (n < 0.62) return FLOOR.mossLit;
  if (n < 0.78) return FLOOR.mossBright;
  if (n < 0.88) return FLOOR.litter;
  return FLOOR.root;
}

/**
 * Perlin fBm landscape rendered with grass + water iso tile sprites.
 *
 * @param {import('phaser').Scene} scene
 * @param {{ gridSize: number, tw: number, th: number, plateauZ: number, toIso: (tx: number, ty: number) => { x: number, y: number }, seed?: string, pad?: number }} options
 */
export function drawIsoTileLandscapeFloor(scene, options) {
  const {
    gridSize,
    plateauZ,
    toIso,
    seed = 'polaris-landscape',
    pad = 10,
  } = options;

  scene.polarisIsoTileGroup?.destroy(true);
  scene.polarisForestFloor?.destroy(true);
  scene._terrainGraphics?.destroy();
  scene._terrainShimmerGraphics?.destroy();
  scene._terrainShimmerGraphics = null;

  if (!hasIsoTileTextures(scene)) {
    console.warn('[iso-tiles] spritesheets missing — using procedural forest floor');
    return drawFlatForestFloor(scene, options);
  }

  const landscape = generateIsoTileLandscape({
    width: gridSize,
    height: gridSize,
    seed,
    pad,
  });

  const { spriteWidth, spriteHeight } = ISO_TILE_METRICS;
  const originY = ISO_TILE_METRICS.th / 2 / spriteHeight;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const placements = landscape.cells.map((cell) => {
    const pt = toIso(cell.tx, cell.ty);
    const worldX = pt.x;
    const worldY = pt.y - plateauZ;
    const left = worldX - spriteWidth / 2;
    const right = worldX + spriteWidth / 2;
    const top = worldY - originY * spriteHeight;
    const bottom = worldY + (1 - originY) * spriteHeight;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
    return { cell, worldX, worldY };
  });

  const bakedWidth = Math.max(64, Math.ceil(maxX - minX));
  const bakedHeight = Math.max(64, Math.ceil(maxY - minY));
  const bakedCenterX = minX + bakedWidth / 2;
  const bakedTopY = minY;

  const floor = scene.add.renderTexture(bakedCenterX, bakedTopY, bakedWidth, bakedHeight);
  floor.setOrigin(0.5, 0);
  floor.setDepth(4);
  floor.clear();

  const sorted = [...placements].sort(
    (a, b) => (a.cell.tx + a.cell.ty) - (b.cell.tx + b.cell.ty),
  );

  for (const placement of sorted) {
    const localX = placement.worldX - bakedCenterX;
    const localY = placement.worldY - bakedTopY;
    floor.stamp(placement.cell.textureKey, placement.cell.frame, localX, localY, {
      originX: 0.5,
      originY,
    });
  }

  floor.render();

  scene.polarisIsoTileGroup = null;
  scene.polarisForestFloor = floor;
  scene.isoTileLandscape = landscape;
  return floor;
}

/**
 * Extended flat moss floor — procedural graphics fallback.
 *
 * @param {import('phaser').Scene} scene
 * @param {{ gridSize: number, tw: number, th: number, plateauZ: number, toIso: (tx: number, ty: number) => { x: number, y: number }, seed?: string }} options
 */
export function drawFlatForestFloor(scene, options) {
  const {
    gridSize,
    tw,
    th,
    plateauZ,
    toIso,
    seed = 'polaris-forest-floor',
  } = options;

  scene.polarisForestFloor?.destroy();
  scene._terrainGraphics?.destroy();
  scene._terrainShimmerGraphics?.destroy();
  scene._terrainShimmerGraphics = null;

  const graphics = scene.add.graphics();
  graphics.setDepth(4);
  scene.polarisForestFloor = graphics;
  scene._terrainGraphics = graphics;

  const permutation = generatePermutationTable(seed.split('').reduce((h, c) => h ^ c.charCodeAt(0), 0));
  const pad = 16;
  const center = Math.floor(gridSize / 2);
  const tileDepth = 3;

  const tiles = [];
  for (let tx = -pad; tx < gridSize + pad; tx += 1) {
    for (let ty = -pad; ty < gridSize + pad; ty += 1) {
      tiles.push({ tx, ty });
    }
  }
  tiles.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty));

  for (const { tx, ty } of tiles) {
    const pt = toIso(tx, ty);
    const py = pt.y - plateauZ;
    const noise = fbm2D(tx * 0.31 + 400, ty * 0.27 + 400, permutation, {
      octaves: 3,
      scale: 0.14,
      persistence: 0.5,
    });
    const tone = floorTone(noise, permutation, tx, ty);

    const p1 = { x: pt.x, y: py - th / 2 };
    const p2 = { x: pt.x + tw / 2, y: py };
    const p3 = { x: pt.x, y: py + th / 2 };
    const p4 = { x: pt.x - tw / 2, y: py };

    const leftShade = shadeColor(tone, 0.82);
    const rightShade = shadeColor(tone, 0.72);
    const topShade = shadeColor(tone, 1.05);

    graphics.fillStyle(leftShade, 1);
    graphics.beginPath();
    graphics.moveTo(p4.x, p4.y);
    graphics.lineTo(p3.x, p3.y);
    graphics.lineTo(p3.x, p3.y + tileDepth);
    graphics.lineTo(p4.x, p4.y + tileDepth);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(rightShade, 1);
    graphics.beginPath();
    graphics.moveTo(p3.x, p3.y);
    graphics.lineTo(p2.x, p2.y);
    graphics.lineTo(p2.x, p2.y + tileDepth);
    graphics.lineTo(p3.x, p3.y + tileDepth);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(topShade, 1);
    graphics.beginPath();
    graphics.moveTo(p1.x, p1.y);
    graphics.lineTo(p2.x, p2.y);
    graphics.lineTo(p3.x, p3.y);
    graphics.lineTo(p4.x, p4.y);
    graphics.closePath();
    graphics.fillPath();

    if (noise > 0.82 && ((tx + ty + center) % 5 === 0)) {
      graphics.fillStyle(FLOOR.litter, 0.45);
      graphics.fillCircle(pt.x + ((tx % 3) - 1) * 4, py - 2, 2.5);
    }
  }

  return graphics;
}

/**
 * @param {number} color
 * @param {number} factor
 */
function shadeColor(color, factor) {
  const r = Math.min(255, ((color >> 16) & 0xff) * factor) | 0;
  const g = Math.min(255, ((color >> 8) & 0xff) * factor) | 0;
  const b = Math.min(255, (color & 0xff) * factor) | 0;
  return (r << 16) | (g << 8) | b;
}

/**
 * Redraw combat grid tiles as mossy forest clearing stones (no void runes).
 *
 * @param {import('phaser').Scene} scene
 * @param {{ getLambertColor: Function }} lambert
 */
export function reskinCombatGridForForest(scene, lambert) {
  scene._gridGraphics?.destroy();
  const metrics = scene.combatGridMetrics;
  if (!metrics) return;

  const { gridSize, tw, th, plateauZ, toIso } = metrics;
  const graphics = scene.add.graphics();
  graphics.setDepth(10);
  scene._gridGraphics = graphics;

  const FOREST_TILE = {
    clearing: { shine: 0x66ccaa, lit: 0x44aa88, core: 0x2d7a66, rim: 0x1a5044, shadow: 0x0f3028 },
    moss: { shine: 0x55bb99, lit: 0x338866, core: 0x226655, rim: 0x143d33, shadow: 0x0a221c },
    path: { shine: 0x88aa77, lit: 0x668855, core: 0x4a6640, rim: 0x2d4030, shadow: 0x1a2818 },
  };

  const tiles = [];
  for (let tx = 0; tx < gridSize; tx += 1) {
    for (let ty = 0; ty < gridSize; ty += 1) {
      tiles.push({ tx, ty });
    }
  }
  tiles.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty));

  for (const { tx, ty } of tiles) {
    const pt = toIso(tx, ty);
    const py = pt.y - plateauZ;
    const isPath = (tx + ty) % 2 === 0;
    const isClearing = Math.hypot(tx - 4, ty - 6) < 2.2;
    const palette = isClearing
      ? FOREST_TILE.clearing
      : (isPath ? FOREST_TILE.path : FOREST_TILE.moss);

    const topColor = lambert.getLambertColor(0, 0, 1, palette);
    const leftColor = lambert.getLambertColor(-1, 1, 0, palette);
    const rightColor = lambert.getLambertColor(1, 1, 0, palette);
    const depth = 5;
    const p1 = { x: pt.x, y: py - th / 2 };
    const p2 = { x: pt.x + tw / 2, y: py };
    const p3 = { x: pt.x, y: py + th / 2 };
    const p4 = { x: pt.x - tw / 2, y: py };

    graphics.fillStyle(leftColor, 1);
    graphics.beginPath();
    graphics.moveTo(p4.x, p4.y);
    graphics.lineTo(p3.x, p3.y);
    graphics.lineTo(p3.x, p3.y + depth);
    graphics.lineTo(p4.x, p4.y + depth);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(rightColor, 1);
    graphics.beginPath();
    graphics.moveTo(p3.x, p3.y);
    graphics.lineTo(p2.x, p2.y);
    graphics.lineTo(p2.x, p2.y + depth);
    graphics.lineTo(p3.x, p3.y + depth);
    graphics.closePath();
    graphics.fillPath();

    graphics.fillStyle(topColor, 1);
    graphics.beginPath();
    graphics.moveTo(p1.x, p1.y);
    graphics.lineTo(p2.x, p2.y);
    graphics.lineTo(p3.x, p3.y);
    graphics.lineTo(p4.x, p4.y);
    graphics.closePath();
    graphics.fillPath();

    graphics.lineStyle(1, palette.lit, 0.35);
    graphics.strokePath();
  }
}

/**
 * Ground-hugging forest mist replacing void ice smoke.
 *
 * @param {import('phaser').Scene} scene
 */
export function spawnForestMist(scene) {
  scene.iceSmokeEmitter?.destroy();
  scene.iceSmokeEmitter = null;

  const metrics = scene.combatGridMetrics;
  if (!metrics || !scene.textures?.exists('ice-smoke')) return;

  const { toIso, plateauZ, gridSize } = metrics;
  const center = toIso(Math.floor(gridSize / 2), Math.floor(gridSize / 2));
  const zone = {
    getRandomPoint: (point) => {
      point.x = center.x + (Math.random() * 560 - 280);
      point.y = center.y - plateauZ + (Math.random() * 140 - 60);
      return point;
    },
  };

  const mist = scene.add.particles(0, 0, 'ice-smoke', {
    speed: { min: 2, max: 6 },
    angle: { min: 260, max: 280 },
    scale: { start: 0.2, end: 0.9 },
    alpha: { values: [0, 0.12, 0.08, 0], ease: 'Sine.easeInOut' },
    tint: 0x88ccaa,
    lifespan: { min: 5000, max: 9000 },
    frequency: 1200,
    quantity: 1,
    blendMode: 'NORMAL',
    emitZone: { type: 'random', source: zone },
  });
  mist.setDepth(18);
  scene.iceSmokeEmitter = mist;
}