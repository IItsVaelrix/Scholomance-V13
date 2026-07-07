/**
 * Perlin fBm landscape compiler for combat-scale grass + water iso tiles.
 */

import { generatePermutationTable } from '../../../codex/core/pixelbrain/procedural-noise.js';
import { fbm2D } from './polarisForestPipeline.js';

export const ISO_TILE_METRICS = Object.freeze({
  tw: 80,
  th: 40,
  depth: 5,
  spriteWidth: 80,
  spriteHeight: 45,
});

export const GRASS_VARIANT_IDS = Object.freeze([
  'grass-plain',
  'grass-tufts',
  'grass-moss',
  'grass-clover',
  'grass-fern',
  'grass-wildflower',
  'grass-litter',
  'grass-pebble',
  'grass-mushroom',
  'grass-vines',
  'grass-dense',
]);

export const WATER_VARIANT_IDS = Object.freeze([
  'water-plain',
  'water-ripples',
  'water-shallow',
  'water-deep',
  'water-current',
  'water-foam',
  'water-lily',
  'water-reeds',
  'water-stones',
  'water-sonic',
  'water-murky',
  'water-dense',
]);

const SHORE_WATER_VARIANTS = Object.freeze([
  'water-foam',
  'water-shallow',
  'water-reeds',
  'water-lily',
]);

const DEEP_WATER_VARIANTS = Object.freeze([
  'water-deep',
  'water-murky',
  'water-dense',
]);

const OPEN_WATER_VARIANTS = Object.freeze([
  'water-plain',
  'water-ripples',
  'water-current',
  'water-stones',
]);

const SHORE_GRASS_VARIANTS = Object.freeze([
  'grass-moss',
  'grass-fern',
  'grass-vines',
  'grass-pebble',
  'grass-litter',
]);

const DAMP_GRASS_VARIANTS = Object.freeze([
  'grass-moss',
  'grass-clover',
  'grass-dense',
  'grass-tufts',
]);

const RARE_GRASS_VARIANTS = Object.freeze([
  'grass-mushroom',
  'grass-wildflower',
  'grass-fern',
]);

const COMMON_GRASS_VARIANTS = Object.freeze([
  'grass-plain',
  'grass-tufts',
  'grass-clover',
  'grass-litter',
  'grass-dense',
]);

/**
 * @param {string|number} seed
 */
export function hashSeedString(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * @param {number} tx
 * @param {number} ty
 * @param {Uint16Array} permutation
 */
export function sampleLandscapeField(tx, ty, permutation) {
  const height = fbm2D(tx, ty, permutation, {
    octaves: 4,
    scale: 0.11,
    persistence: 0.5,
    lacunarity: 2.05,
    offsetX: 200,
    offsetY: 300,
  });
  const moisture = fbm2D(tx, ty, permutation, {
    octaves: 3,
    scale: 0.15,
    persistence: 0.55,
    lacunarity: 2.1,
    offsetX: 900,
    offsetY: 120,
  });
  const detail = fbm2D(tx, ty, permutation, {
    octaves: 2,
    scale: 0.23,
    persistence: 0.45,
    lacunarity: 2,
    offsetX: 1600,
    offsetY: 640,
  });
  return { height, moisture, detail };
}

/**
 * @param {number} height
 * @param {number} moisture
 */
export function resolveTerrainType(height, moisture) {
  if (height < 0.38) return 'water';
  if (height < 0.46 && moisture > 0.58) return 'water';
  return 'grass';
}

/**
 * @param {readonly string[]} variants
 * @param {number} noise
 */
function pickFromVariants(variants, noise) {
  const clamped = Math.max(0, Math.min(0.999, noise));
  const index = Math.floor(clamped * variants.length);
  return variants[index];
}

/**
 * @param {{ height: number, moisture: number, detail: number, nearGrass: boolean, nearWater: boolean }} ctx
 */
function pickWaterVariant(ctx) {
  const { height, moisture, detail, nearGrass } = ctx;
  if (nearGrass) {
    return pickFromVariants(SHORE_WATER_VARIANTS, detail);
  }
  if (height < 0.25 || moisture > 0.72) {
    return pickFromVariants(DEEP_WATER_VARIANTS, detail);
  }
  if (detail > 0.92) return 'water-sonic';
  return pickFromVariants(OPEN_WATER_VARIANTS, detail);
}

/**
 * @param {{ height: number, moisture: number, detail: number, nearGrass: boolean, nearWater: boolean }} ctx
 */
function pickGrassVariant(ctx) {
  const { moisture, detail, nearWater } = ctx;
  if (nearWater) {
    return pickFromVariants(SHORE_GRASS_VARIANTS, detail);
  }
  if (moisture > 0.55) {
    return pickFromVariants(DAMP_GRASS_VARIANTS, detail);
  }
  if (detail > 0.88) {
    return pickFromVariants(RARE_GRASS_VARIANTS, detail);
  }
  return pickFromVariants(COMMON_GRASS_VARIANTS, detail);
}

/**
 * @param {string} variantId
 * @param {'grass'|'water'} terrain
 */
export function variantIdToFrameIndex(variantId, terrain) {
  const catalog = terrain === 'water' ? WATER_VARIANT_IDS : GRASS_VARIANT_IDS;
  const index = catalog.indexOf(variantId);
  return index >= 0 ? index : 0;
}

/**
 * @param {{
 *   width: number,
 *   height: number,
 *   seed?: string|number,
 *   pad?: number,
 *   originTx?: number,
 *   originTy?: number,
 * }} options
 */
export function generateIsoTileLandscape(options) {
  const {
    width,
    height,
    seed = 'polaris-landscape',
    pad = 0,
    originTx = 0,
    originTy = 0,
  } = options;

  const permutation = generatePermutationTable(hashSeedString(seed));
  const minTx = originTx - pad;
  const minTy = originTy - pad;
  const maxTx = originTx + width + pad;
  const maxTy = originTy + height + pad;

  const terrainGrid = new Map();
  for (let ty = minTy; ty < maxTy; ty += 1) {
    for (let tx = minTx; tx < maxTx; tx += 1) {
      const field = sampleLandscapeField(tx, ty, permutation);
      terrainGrid.set(`${tx},${ty}`, {
        tx,
        ty,
        terrain: resolveTerrainType(field.height, field.moisture),
        field,
      });
    }
  }

  const cells = [];
  for (const entry of terrainGrid.values()) {
    const { tx, ty, terrain, field } = entry;
    const neighbors = [
      terrainGrid.get(`${tx + 1},${ty}`),
      terrainGrid.get(`${tx - 1},${ty}`),
      terrainGrid.get(`${tx},${ty + 1}`),
      terrainGrid.get(`${tx},${ty - 1}`),
    ];
    const nearGrass = terrain === 'water' && neighbors.some((neighbor) => neighbor?.terrain === 'grass');
    const nearWater = terrain === 'grass' && neighbors.some((neighbor) => neighbor?.terrain === 'water');
    const variantId = terrain === 'water'
      ? pickWaterVariant({ ...field, nearGrass, nearWater })
      : pickGrassVariant({ ...field, nearGrass, nearWater });
    const frame = variantIdToFrameIndex(variantId, terrain);

    cells.push({
      tx,
      ty,
      terrain,
      height: field.height,
      moisture: field.moisture,
      detail: field.detail,
      variantId,
      frame,
      textureKey: terrain === 'water' ? 'iso-water-sheet' : 'iso-grass-sheet',
    });
  }

  cells.sort((a, b) => (a.tx + a.ty) - (b.tx + b.ty));

  return {
    seed: String(seed),
    width,
    height,
    pad,
    originTx,
    originTy,
    metrics: ISO_TILE_METRICS,
    grassVariants: GRASS_VARIANT_IDS,
    waterVariants: WATER_VARIANT_IDS,
    cells,
  };
}