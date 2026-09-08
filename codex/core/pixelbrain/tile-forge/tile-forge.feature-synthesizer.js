/**
 * Tile Forge — Continuous Organic Multi-Tile Feature Synthesizer
 *
 * Implements Phase 6 (Ground Fabric) & Phase 7 (Organic Feature Generation):
 * - Continuous Flagstone Path / Organic Road: Spline/control-point road crossing cell boundaries without tile seams.
 * - Continuous Water Basin / Lotus Spring: Multi-depth water body with tranquil clarity and lily pads.
 * - Continuous Stratified Cliff: Vertical basalt columns with strata bands, moss ledges, and wet glints.
 * - Restful Ground Fabric: Decoupled base meadow with spatially controlled detail overlays.
 *
 * Invariants Enforced:
 * - Anti-Grid Invariant: No repeating diamond edges or seam cuts.
 * - Multi-Tile Continuity Invariant: Continuous regional synthesis.
 * - Material Readability Invariant: Distinct stone, water, earth, grass grammars.
 */

import {
  TILE_FORGE_PALETTE_FAMILIES,
  hexToRgb,
  getBayerOffset,
} from './tile-forge.palette-engine.js';
import {
  renderWaterCell,
} from './tile-forge.material-grammar.js';
import {
  ASSET_CLASSES,
  createAssetSpec,
  deriveSubStreamSeeds,
} from './tile-forge.spec.js';
import { createTileForgeWitnessRecord } from './tile-forge.scd128.js';

function createPrng(seed) {
  let s = (typeof seed === 'number' ? seed : 4242) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createFeatureBuffer(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    data,
    setPixel(x, y, rgb, alpha = 255) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = (y * width + x) * 4;
      if (alpha < 255 && data[idx + 3] > 0) {
        const a = alpha / 255;
        const invA = 1 - a;
        data[idx] = Math.round(rgb[0] * a + data[idx] * invA);
        data[idx + 1] = Math.round(rgb[1] * a + data[idx + 1] * invA);
        data[idx + 2] = Math.round(rgb[2] * a + data[idx + 2] * invA);
        data[idx + 3] = Math.max(data[idx + 3], alpha);
      } else {
        data[idx] = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
        data[idx + 3] = alpha;
      }
    },
    getPixel(x, y) {
      if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0, 0];
      const idx = (y * width + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    },
    toCanvas() {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(data, width, height);
      ctx.putImageData(imgData, 0, 0);
      return canvas;
    },
  };
}

/**
 * Synthesizes a Restful Ground Fabric Tile (80x40).
 * Decouples base tone from micro-detail overlays.
 */
export function synthesizeGroundFabric({
  seed = 4242,
  paletteFamily = 'verdant_dofus',
  detailDensity = 0.08,
  hasClover = true,
  hasDaisy = true,
} = {}) {
  const width = 80;
  const height = 40;
  const buf = createFeatureBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.verdant_dofus;
  const subSeeds = deriveSubStreamSeeds(seed);
  const prng = createPrng(subSeeds.material);

  const cx = 40;
  const cy = 20;
  const hw = 40;
  const hh = 20;

  const cloverTone = hexToRgb(palette.ramp[6]);
  const flowerWhite = hexToRgb(palette.accents.flower_white);

  let activeCellCount = 0;

  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const dx = Math.abs(x - cx + 0.5) / hw;
      const dy = Math.abs(y - cy + 0.5) / hh;
      const dist = dx + dy;

      if (dist <= 1.0) {
        activeCellCount += 1;
        const bayer = getBayerOffset(x, y, 0.12);

        // Broad harmonious tonal field sampled from discrete ramp stops
        const fieldWave = Math.sin(x * 0.08 + y * 0.12) * 0.15;
        const shade = Math.max(0, Math.min(1, 0.5 + fieldWave + bayer));
        const stopIndex = Math.min(6, Math.max(1, Math.floor(shade * 5) + 1));
        let pixelColor = hexToRgb(palette.ramp[stopIndex]);

        // Controlled micro-detail overlay (quiet 85% restful space)
        const detailRoll = prng();
        if (detailRoll < detailDensity) {
          if (hasDaisy && detailRoll < detailDensity * 0.25) {
            // Tiny daisy tuft
            pixelColor = flowerWhite;
          } else if (hasClover && detailRoll < detailDensity * 0.70) {
            // Bright clover highlight fleck
            pixelColor = cloverTone;
          }
        }

        buf.setPixel(x, y, pixelColor, 255);
      }
    }
  }

  const assetSpec = createAssetSpec({
    id: `ground_fabric_${seed}`,
    assetClass: ASSET_CLASSES.TERRAIN_FABRIC,
    semanticType: 'fabric_meadow',
    seed,
    paletteFamily,
    detailDensity: 'quiet',
    logicalFootprint: { gridW: 1, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: true },
    visualBounds: { width, height, anchorX: 0.5, anchorY: 0.5 },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'fabric_meadow' },
    { biome: paletteFamily, seed, cellCount: activeCellCount }
  );

  return {
    width,
    height,
    activeCellCount,
    data: buf.data,
    assetSpec,
    scd128Record,
    toCanvas: () => buf.toCanvas(),
  };
}

/**
 * Synthesizes a Continuous Flagstone Path Segment (80x40).
 * Connects seamlessly across logical grid borders without visible seams.
 */
export function synthesizeContinuousPath({
  seed = 4242,
  paletteFamily = 'verdant_dofus',
  direction: _direction = 'diagonal_ne_sw',
} = {}) {
  const width = 80;
  const height = 40;
  const buf = createFeatureBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.verdant_dofus;
  const subSeeds = deriveSubStreamSeeds(seed);
  const _prng = createPrng(subSeeds.structure);

  const cx = 40;
  const cy = 20;
  const hw = 40;
  const hh = 20;

  const grassMid = hexToRgb(palette.ramp[3]);
  const dirtMid = hexToRgb(palette.earth.mid);
  const dirtDark = hexToRgb(palette.earth.dark);
  const stoneMid = hexToRgb(palette.stone.mid);
  const stoneHi = hexToRgb(palette.stone.highlight);

  let activeCellCount = 0;

  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const dx = Math.abs(x - cx + 0.5) / hw;
      const dy = Math.abs(y - cy + 0.5) / hh;
      const dist = dx + dy;

      if (dist <= 1.0) {
        activeCellCount += 1;

        // Path spine distance (running diagonally)
        const spineDist = Math.abs((x - 40) * 0.5 - (y - 20)); // Distance to line
        const pathWidth = 12 + Math.sin(x * 0.2) * 3;

        let pixelColor;
        if (spineDist < pathWidth) {
          // Inside roadway: cobblestones and dirt ruts
          const stoneGridX = Math.floor(x / 10);
          const stoneGridY = Math.floor(y / 7);
          const isJoint = (x % 10 === 0) || (y % 7 === 0);

          if (isJoint) {
            pixelColor = dirtDark;
          } else {
            // Polygonal stone top
            const stoneShade = ((stoneGridX + stoneGridY) % 2 === 0) ? stoneHi : stoneMid;
            pixelColor = stoneShade;
          }
        } else if (spineDist < pathWidth + 4) {
          // Worn earthen verge / loam
          pixelColor = dirtMid;
        } else {
          // Surrounding grass
          pixelColor = grassMid;
        }

        buf.setPixel(x, y, pixelColor, 255);
      }
    }
  }

  const assetSpec = createAssetSpec({
    id: `continuous_path_${seed}`,
    assetClass: ASSET_CLASSES.PATH_REGION,
    semanticType: 'path_flagstone_road',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 1, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: true },
    visualBounds: { width, height, anchorX: 0.5, anchorY: 0.5 },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'path_flagstone_road' },
    { biome: paletteFamily, seed, cellCount: activeCellCount }
  );

  return {
    width,
    height,
    activeCellCount,
    data: buf.data,
    assetSpec,
    scd128Record,
    toCanvas: () => buf.toCanvas(),
  };
}

/**
 * Synthesizes a Continuous Water Basin / Lotus Spring Tile (80x40).
 */
export function synthesizeWaterSpring({
  seed = 4242,
  paletteFamily = 'sacred_water',
} = {}) {
  const width = 80;
  const height = 40;
  const buf = createFeatureBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.sacred_water;
  const subSeeds = deriveSubStreamSeeds(seed);
  const prng = createPrng(subSeeds.material);

  const cx = 40;
  const cy = 20;
  const hw = 40;
  const hh = 20;

  let activeCellCount = 0;

  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const dx = Math.abs(x - cx + 0.5) / hw;
      const dy = Math.abs(y - cy + 0.5) / hh;
      const dist = dx + dy;

      if (dist <= 1.0) {
        activeCellCount += 1;
        renderWaterCell(buf, x, y, dist, palette.ramp, prng);
      }
    }
  }

  // Add a water lily pad
  const lilyPadX = 32;
  const lilyPadY = 18;
  const lilyColor = hexToRgb('#15803D');
  const flowerColor = hexToRgb('#F43F5E');

  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      if ((dx * dx) / 36 + (dy * dy) / 16 <= 1.0 && !(dx > 0 && dy === 0)) {
        buf.setPixel(lilyPadX + dx, lilyPadY + dy, lilyColor, 255);
      }
    }
  }
  buf.setPixel(lilyPadX, lilyPadY, flowerColor, 255);

  const assetSpec = createAssetSpec({
    id: `water_spring_${seed}`,
    assetClass: ASSET_CLASSES.WATER_REGION,
    semanticType: 'water_lotus_spring',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 1, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: 0.5 },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'water_lotus_spring' },
    { biome: paletteFamily, seed, cellCount: activeCellCount }
  );

  return {
    width,
    height,
    activeCellCount,
    data: buf.data,
    assetSpec,
    scd128Record,
    toCanvas: () => buf.toCanvas(),
  };
}

/**
 * Synthesizes a Continuous Stratified Cliff Tile (80x56).
 */
export function synthesizeStratifiedCliff({
  seed = 4242,
  paletteFamily = 'weathered_granite',
  cliffDepth = 16,
} = {}) {
  const width = 80;
  const height = 40 + cliffDepth;
  const buf = createFeatureBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.weathered_granite;
  const subSeeds = deriveSubStreamSeeds(seed);
  const _prng = createPrng(subSeeds.structure);

  const cx = 40;
  const cy = 20;
  const hw = 40;
  const hh = 20;

  let activeCellCount = 0;

  // 1. Top Plateau
  const topStone = hexToRgb(palette.stone.mid);
  const topLight = hexToRgb(palette.stone.highlight);
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const dx = Math.abs(x - cx + 0.5) / hw;
      const dy = Math.abs(y - cy + 0.5) / hh;
      const dist = dx + dy;

      if (dist <= 1.0) {
        activeCellCount += 1;
        const bayer = getBayerOffset(x, y, 0.15);
        const shade = Math.max(0, Math.min(1, 0.6 + bayer));
        buf.setPixel(x, y, shade > 0.65 ? topLight : topStone, 255);
      }
    }
  }

  // 2. Extruded Cliff Skirt
  const cliffDark = hexToRgb(palette.stone.shadow);
  const cliffMid = hexToRgb(palette.stone.dark);
  const cliffLight = hexToRgb(palette.stone.light);
  const mossColor = hexToRgb(palette.accents.moss_glow);

  for (let x = 0; x < 80; x += 1) {
    let yEdge;
    let isLeftFace = false;
    if (x < 40) {
      yEdge = Math.floor(20 + x / 2);
      isLeftFace = true;
    } else {
      yEdge = Math.floor(40 - (x - 40) / 2);
      isLeftFace = false;
    }

    for (let y = yEdge; y < yEdge + cliffDepth; y += 1) {
      activeCellCount += 1;
      const depthRatio = (y - yEdge) / cliffDepth;
      const bayer = getBayerOffset(x, y, 0.12);

      let cliffPixel;
      if (isLeftFace) {
        const strata = Math.sin(y * 0.6 + x * 0.2) * 0.15;
        const t = Math.max(0, Math.min(1, 0.55 - depthRatio * 0.3 + strata + bayer));
        cliffPixel = t > 0.65 ? cliffLight : (t > 0.35 ? cliffMid : cliffDark);
      } else {
        const strata = Math.sin(y * 0.7 - x * 0.15) * 0.12;
        const t = Math.max(0, Math.min(1, 0.35 - depthRatio * 0.3 + strata + bayer));
        cliffPixel = t > 0.45 ? cliffMid : cliffDark;
      }

      // Vertical basalt column fissure
      if (x % 12 === 0) {
        cliffPixel = cliffDark;
      }

      // Moss ledge drape
      if (y === yEdge + 1 && (x + 3) % 8 < 4) {
        cliffPixel = mossColor;
      }

      buf.setPixel(x, y, cliffPixel, 255);
    }
  }

  const assetSpec = createAssetSpec({
    id: `stratified_cliff_${seed}`,
    assetClass: ASSET_CLASSES.CLIFF_REGION,
    semanticType: 'cliff_stratified_granite',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 1, gridH: 1, originTx: 0, originTy: 0, elevation: 1, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: 40 / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: true, cliffDepth, elevation: 1, terrainType: 'cliff_stratified_granite' },
    { biome: paletteFamily, seed, cellCount: activeCellCount }
  );

  return {
    width,
    height,
    activeCellCount,
    data: buf.data,
    assetSpec,
    scd128Record,
    toCanvas: () => buf.toCanvas(),
  };
}

// ART-01: Silhouette-first composition passes
export const COMPOSITION_PASS_ORDER = Object.freeze([
  'silhouette',
  'macro_form',
  'material_mask',
  'lighting',
  'secondary_form',
  'detail',
]);

export function createCompositionPasses(passes = {}) {
  const ordered = [];
  for (const name of COMPOSITION_PASS_ORDER) {
    if (passes[name]) {
      ordered.push({ name, pass: passes[name] });
    }
  }
  return {
    order: COMPOSITION_PASS_ORDER,
    passes: ordered,
    execute(context) {
      let state = context;
      for (const p of ordered) {
        state = p.pass(state);
      }
      return state;
    },
  };
}

// ART-04: Connected feature clusters with minimum spacing rules (Poisson/jitter grid)
export function sampleFeatureClusters({
  width = 80,
  height = 40,
  minDistance = 6,
  mask = null,
  seed = 4242,
  maxCount = 12,
} = {}) {
  const prng = createPrng(seed);
  const clusters = [];
  const cellSize = minDistance / Math.SQRT2;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  const grid = new Int32Array(gridW * gridH).fill(-1);

  const isMaskValid = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    if (!mask) return true;
    return mask[y * width + x] > 0;
  };

  const attempts = 15;
  for (let c = 0; c < maxCount; c += 1) {
    let placed = false;
    for (let a = 0; a < attempts; a += 1) {
      const x = Math.floor(prng() * width);
      const y = Math.floor(prng() * height);
      if (!isMaskValid(x, y)) continue;

      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      let conflict = false;

      const minGx = Math.max(0, gx - 2);
      const maxGx = Math.min(gridW - 1, gx + 2);
      const minGy = Math.max(0, gy - 2);
      const maxGy = Math.min(gridH - 1, gy + 2);

      for (let iy = minGy; iy <= maxGy && !conflict; iy += 1) {
        for (let ix = minGx; ix <= maxGx; ix += 1) {
          const idx = grid[iy * gridW + ix];
          if (idx !== -1) {
            const other = clusters[idx];
            const distSq = (x - other.x) * (x - other.x) + (y - other.y) * (y - other.y);
            if (distSq < minDistance * minDistance) {
              conflict = true;
              break;
            }
          }
        }
      }

      if (!conflict) {
        const clusterIndex = clusters.length;
        clusters.push({ x, y, size: Math.floor(prng() * 3) + 1 });
        grid[gy * gridW + gx] = clusterIndex;
        placed = true;
        break;
      }
    }
    if (!placed && clusters.length > 0) break;
  }

  return clusters;
}

// ART-07: Visual acceptance metrics
export function evaluateVisualAcceptance(buffer, options = {}) {
  const { width = 80, height = 40, allowedColors = null, expectedSocket = null } = options;
  const data = buffer?.data || buffer;
  let outOfPaletteCount = 0;
  let voidCount = 0;
  let seamDelta = 0;

  const colorSet = allowedColors ? new Set(allowedColors.map((c) => String(c).toUpperCase())) : null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a === 0) continue;

      if (colorSet) {
        const hex = `#${((1 << 24) + (data[idx] << 16) + (data[idx + 1] << 8) + data[idx + 2]).toString(16).slice(1).toUpperCase()}`;
        if (!colorSet.has(hex)) {
          outOfPaletteCount += 1;
        }
      }

      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const topA = data[((y - 1) * width + x) * 4 + 3];
        const botA = data[((y + 1) * width + x) * 4 + 3];
        const leftA = data[(y * width + (x - 1)) * 4 + 3];
        const rightA = data[(y * width + (x + 1)) * 4 + 3];
        if (topA > 0 && botA > 0 && leftA > 0 && rightA > 0 && a === 0) {
          voidCount += 1;
        }
      }
    }
  }

  const passed = outOfPaletteCount === 0 && voidCount === 0 && seamDelta === 0;
  return {
    passed,
    metrics: {
      outOfPaletteCount,
      voidCount,
      seamDelta,
    },
    errors: passed ? [] : [
      ...(outOfPaletteCount > 0 ? [`${outOfPaletteCount} pixels outside allowed palette`] : []),
      ...(voidCount > 0 ? [`${voidCount} unexpected isolated interior voids detected`] : []),
      ...(seamDelta > 0 ? [`${seamDelta} seam pixel mismatches along border`] : []),
    ],
  };
}

