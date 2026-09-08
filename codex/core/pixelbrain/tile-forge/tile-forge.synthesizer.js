/**
 * Tile Forge — Professional Procedural Tile Synthesizer
 *
 * Implements the Anti-Vector Invariant for Tile Forge:
 * - Discrete 1x integer pixel cells.
 * - 2:1 Dimetric projection standard (80x40 top diamond, 80x56 extruded cliff skirts).
 * - Layered materials: organic grass blades, prismatic ice facets, stratified basalt columns.
 * - 2x2 Bayer ordered dithering between color ramp stops.
 * - Upper-left directional lighting vector: L = [-0.65, -0.75, 0.5].
 * - Zero external PNG files — 100% deterministic procedural generation.
 */

import {
  TILE_FORGE_BIOME_PALETTES,
  createTileForgeWitnessRecord,
} from './tile-forge.scd128.js';

// 2x2 Bayer ordered dithering matrix
const BAYER_2X2 = [
  [0, 2],
  [3, 1],
];

function createPrng(seed) {
  let s = (typeof seed === 'number' ? seed : 4242) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function createCanvasBuffer(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    data,
    setPixel(x, y, rgb, alpha = 255) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = (y * width + x) * 4;
      data[idx] = rgb[0];
      data[idx + 1] = rgb[1];
      data[idx + 2] = rgb[2];
      data[idx + 3] = alpha;
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
 * Synthesizes a discrete 1x pixel art Tile Forge ground/cliff tile.
 *
 * @param {Object} options
 * @param {'top'|'cliff'|'rim'} options.type
 * @param {'void_forest'|'void_ice'|'verdant_glade'|'cave_chasm'} options.biome
 * @param {number} [options.seed=4242]
 * @param {number} [options.elevation=0]
 * @param {boolean} [options.hasFlowers=true]
 * @returns {Object} Buffer with pixels, dimensions, and SCD128 record
 */
export function synthesizeTileForgeTile({
  type = 'top',
  biome = 'void_forest',
  seed = 4242,
  elevation = 0,
  hasFlowers = true,
  socketN = 'socket_open',
  socketE = 'socket_open',
  socketS = 'socket_open',
  socketW = 'socket_open',
} = {}) {
  const width = 80;
  const hasCliff = type === 'cliff';
  const cliffDepth = hasCliff ? 16 : 0;
  const height = 40 + cliffDepth;

  const buf = createCanvasBuffer(width, height);
  const palette = TILE_FORGE_BIOME_PALETTES[biome] || TILE_FORGE_BIOME_PALETTES.void_forest;
  const prng = createPrng(seed);

  const cx = 40;
  const cy = 20;
  const hw = 40;
  const hh = 20;

  // Pre-parse ramp colors
  const ramp = [
    hexToRgb(palette.c0),
    hexToRgb(palette.c1),
    hexToRgb(palette.c2),
    hexToRgb(palette.c3),
    hexToRgb(palette.c4),
    hexToRgb(palette.c5),
    hexToRgb(palette.c6),
    hexToRgb(palette.c7),
  ];

  const cliffHi = hexToRgb(palette.cliff_hi);
  const cliffMid = hexToRgb(palette.cliff_mid);
  const cliffDark = hexToRgb(palette.cliff_dark);
  const glowRgb = hexToRgb(palette.crystal_glow);
  const flowerRgb = hexToRgb(palette.flower_accent);

  let activeCellCount = 0;

  // 1. Render Top Isometric Diamond (80x40)
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      const dx = Math.abs(x - cx + 0.5) / hw;
      const dy = Math.abs(y - cy + 0.5) / hh;
      const dist = dx + dy;

      if (dist <= 1.0) {
        activeCellCount += 1;
        const bayer = (BAYER_2X2[y % 2][x % 2] / 4.0) - 0.375;

        // Base lighting gradient (upper-left light)
        const u = (x - cx) / hw; // [-1, 1]
        const v = (y - cy) / hh; // [-1, 1]
        const lightProj = -0.65 * u - 0.75 * v; // [-1.4, 1.4]
        const baseShade = Math.max(0, Math.min(1, 0.5 + lightProj * 0.35 + bayer * 0.2));

        let colorRgb;

        if (biome === 'void_ice') {
          // Prismatic ice facets
          const facetAngle = Math.atan2(v, u);
          const facetStripe = Math.sin(facetAngle * 4 + (u + v) * 3) * 0.15;
          const iceShade = Math.max(0, Math.min(1, baseShade + facetStripe));
          const stop = Math.floor(iceShade * 6) + 1;
          colorRgb = ramp[Math.min(7, stop)];

          // Specular Glint near upper rim
          if (dist > 0.82 && lightProj > 0.4 && prng() > 0.6) {
            colorRgb = ramp[7]; // specular white frost
          }
        } else if (biome === 'cave_chasm') {
          // Chiseled flagstone pavers
          const isMortar = (x % 16 === 0 || y % 8 === 0) && dist < 0.95;
          if (isMortar) {
            colorRgb = ramp[1]; // dark joint mortar
          } else {
            const stoneStop = Math.floor(baseShade * 4) + 2;
            colorRgb = ramp[stoneStop];
            if (prng() > 0.92) colorRgb = glowRgb; // glowing cyan lichen
          }
        } else {
          // Organic Grass (Void Forest or Verdant Glade)
          const bladeNoise = prng() * 0.25 - 0.125;
          const shade = Math.max(0, Math.min(1, baseShade + bladeNoise));
          const stop = Math.floor(shade * 5) + 2; // stops 2..7
          colorRgb = ramp[Math.min(7, Math.max(1, stop))];

          // Edge darker soil border
          if (dist > 0.94) {
            colorRgb = ramp[1];
          }

          // Bioluminescent Flowers / Spores
          if (hasFlowers && dist < 0.88 && prng() > 0.965) {
            colorRgb = flowerRgb;
          }
        }

        // Rim glowing outline for 'rim' tiles
        if (type === 'rim' && dist >= 0.92) {
          colorRgb = glowRgb;
        }

        buf.setPixel(x, y, colorRgb, 255);
      }
    }
  }

  // 2. Render Extruded Stratified Cliff Skirt (80x56)
  if (hasCliff) {
    for (let x = 0; x < 80; x += 1) {
      // Calculate top diamond bottom perimeter y-coordinate
      let yEdge;
      let isLeftFace = false;

      if (x < 40) {
        yEdge = Math.floor(20 + (x / 2));
        isLeftFace = true;
      } else {
        yEdge = Math.floor(40 - ((x - 40) / 2));
        isLeftFace = false;
      }

      for (let y = yEdge; y < yEdge + cliffDepth; y += 1) {
        activeCellCount += 1;
        const depthRatio = (y - yEdge) / cliffDepth; // [0, 1]
        const bayer = (BAYER_2X2[y % 2][x % 2] / 4.0) - 0.375;

        let cliffPixel;
        if (isLeftFace) {
          // Left face: lighter, ambient illumination
          const strata = Math.sin(y * 0.7 + x * 0.2) * 0.15;
          const t = Math.max(0, Math.min(1, 0.5 - depthRatio * 0.35 + strata + bayer * 0.15));
          cliffPixel = lerpColor(cliffDark, cliffHi, t);
        } else {
          // Right face: deep shadow / occlusion
          const strata = Math.sin(y * 0.8 - x * 0.15) * 0.12;
          const t = Math.max(0, Math.min(1, 0.3 - depthRatio * 0.3 + strata + bayer * 0.1));
          cliffPixel = lerpColor(cliffDark, cliffMid, t);
        }

        // Stratified basalt fissure cracks
        if ((x + y * 2) % 19 === 0 && depthRatio > 0.2) {
          cliffPixel = [15, 23, 42]; // deep fracture
        }

        // Core glow fissure
        if (biome === 'void_forest' && x === 40) {
          // Center vertical prow edge highlight
          cliffPixel = glowRgb;
        } else if (biome === 'void_ice' && (x === 24 || x === 56) && depthRatio > 0.4) {
          cliffPixel = glowRgb; // cyan sub-surface refraction vein
        }

        buf.setPixel(x, y, cliffPixel, 255);
      }
    }
  }

  // 3. Build SCD128 Witness Record
  const scd128Record = createTileForgeWitnessRecord(
    {
      width,
      height,
      hasCliff,
      cliffDepth,
      elevation,
      terrainType: `${biome}_${type}`,
      isRim: type === 'rim',
      socketN,
      socketE,
      socketS,
      socketW,
    },
    {
      biome,
      seed,
      cellCount: activeCellCount,
    }
  );

  return {
    width,
    height,
    hasCliff,
    activeCellCount,
    data: buf.data,
    scd128Record,
    toCanvas: () => buf.toCanvas(),
  };
}

/**
 * Synthesizes a discrete 1x pixel art Tile Forge environmental prop (Trees, Ferns, Crystals).
 *
 * @param {Object} options
 * @param {'crystal_tree'|'void_pine'|'hologram_fern'|'void_flowers'} options.propType
 * @param {string} [options.biome='void_forest']
 * @param {number} [options.seed=4242]
 * @returns {Object} Buffer with pixels, dimensions, and SCD128 record
 */
export function synthesizeTileForgeProp({
  propType = 'crystal_tree',
  biome = 'void_forest',
  seed = 4242,
} = {}) {
  const palette = TILE_FORGE_BIOME_PALETTES[biome] || TILE_FORGE_BIOME_PALETTES.void_forest;
  const prng = createPrng(seed);

  let width = 36;
  let height = 54;

  if (propType === 'hologram_fern') {
    width = 24;
    height = 20;
  } else if (propType === 'void_flowers') {
    width = 20;
    height = 16;
  } else if (propType === 'void_pine') {
    width = 40;
    height = 64;
  }

  const buf = createCanvasBuffer(width, height);
  const glowRgb = hexToRgb(palette.crystal_glow);
  const flowerRgb = hexToRgb(palette.flower_accent);
  const hiRgb = hexToRgb(palette.c7);
  const midRgb = hexToRgb(palette.c5);
  const darkRgb = hexToRgb(palette.c3);
  const trunkDark = hexToRgb(palette.c1);

  let activeCellCount = 0;

  if (propType === 'crystal_tree') {
    const cx = Math.floor(width / 2);
    // Vertical crystalline spire trunk
    for (let y = 14; y < height; y += 1) {
      const trunkW = y > 38 ? 3 : 2;
      for (let x = cx - trunkW; x <= cx + trunkW; x += 1) {
        activeCellCount += 1;
        const isCenter = x === cx;
        buf.setPixel(x, y, isCenter ? glowRgb : trunkDark, 255);
      }
    }

    // Layered floating crystal rhombuses
    const clusters = [
      { cy: 12, r: 10 },
      { cy: 22, r: 13 },
      { cy: 32, r: 11 },
    ];

    for (const c of clusters) {
      for (let dy = -c.r; dy <= c.r; dy += 1) {
        for (let dx = -c.r; dx <= c.r; dx += 1) {
          const dist = Math.abs(dx) / c.r + Math.abs(dy) / (c.r * 0.7);
          if (dist <= 1.0) {
            const px = cx + dx;
            const py = c.cy + dy;
            activeCellCount += 1;

            let color;
            if (dx < 0 && dy < 0) color = hiRgb; // lit facet
            else if (dist < 0.3) color = glowRgb; // inner radiant core
            else if (dx >= 0) color = darkRgb; // shadow facet
            else color = midRgb;

            buf.setPixel(px, py, color, 255);
          }
        }
      }
    }
  } else if (propType === 'void_pine') {
    const cx = Math.floor(width / 2);
    // Trunk
    for (let y = height - 14; y < height; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        activeCellCount += 1;
        buf.setPixel(x, y, trunkDark, 255);
      }
    }

    // 4 Tiered Cones
    const tiers = [
      { topY: 4, botY: 18, maxR: 8 },
      { topY: 14, botY: 28, maxR: 12 },
      { topY: 24, botY: 40, maxR: 16 },
      { topY: 34, botY: 52, maxR: 18 },
    ];

    for (const tier of tiers) {
      const h = tier.botY - tier.topY;
      for (let y = tier.topY; y < tier.botY; y += 1) {
        const progress = (y - tier.topY) / h;
        const currentR = Math.floor(tier.maxR * progress);
        for (let x = cx - currentR; x <= cx + currentR; x += 1) {
          activeCellCount += 1;
          const u = (x - cx) / (currentR || 1);
          let color = midRgb;
          if (u < -0.3) color = hiRgb; // light side
          else if (u > 0.3) color = darkRgb; // dark side
          else if (y === tier.botY - 1) color = glowRgb; // bioluminescent fringe
          buf.setPixel(x, y, color, 255);
        }
      }
    }
  } else if (propType === 'hologram_fern') {
    const cx = Math.floor(width / 2);
    const cy = height - 3;
    // 5 radiating fronds
    for (let a = -2; a <= 2; a += 1) {
      const angle = (-Math.PI / 2) + a * 0.45;
      const len = 12 + Math.abs(a) * -2;
      for (let step = 0; step < len; step += 1) {
        const px = Math.round(cx + Math.cos(angle) * step);
        const py = Math.round(cy + Math.sin(angle) * step);
        activeCellCount += 1;
        buf.setPixel(px, py, step > len - 3 ? glowRgb : hiRgb, 255);
        // Frond width
        if (step > 3 && step < len - 2) {
          buf.setPixel(px + 1, py, midRgb, 230);
          buf.setPixel(px - 1, py, midRgb, 230);
        }
      }
    }
  } else {
    // void_flowers
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -5; dx <= 5; dx += 1) {
        if (Math.hypot(dx, dy) <= 4.5 && prng() > 0.2) {
          activeCellCount += 1;
          const isPetal = Math.hypot(dx, dy) > 1.5;
          buf.setPixel(cx + dx, cy + dy, isPetal ? flowerRgb : glowRgb, 255);
        }
      }
    }
  }

  const scd128Record = createTileForgeWitnessRecord(
    {
      width,
      height,
      hasCliff: false,
      terrainType: `prop_${propType}`,
    },
    {
      biome,
      seed,
      cellCount: activeCellCount,
    }
  );

  return {
    width,
    height,
    propType,
    activeCellCount,
    data: buf.data,
    scd128Record,
    toCanvas: () => buf.toCanvas(),
  };
}

export {
  synthesizeGrandfatherOak,
  synthesizeAutumnMaple,
  synthesizeRusticWell,
  synthesizeAncientDolmen,
  synthesizeTimberFence,
  synthesizeSunflowerPatch,
  synthesizeRuinedStructure,
} from './tile-forge.hero-synthesizer.js';

export {
  synthesizeGroundFabric,
  synthesizeContinuousPath,
  synthesizeWaterSpring,
  synthesizeStratifiedCliff,
} from './tile-forge.feature-synthesizer.js';

export {
  TILE_FORGE_FOREST_ACTOR_CONTRACT,
  TILE_FORGE_FOREST_ACTOR_TYPES,
  synthesizeTileForgeForestActor,
} from './tile-forge.forest-actor-synthesizer.js';

export {
  TILE_FORGE_REGION_ASSET_CONTRACT,
  realizeTileForgeRegion,
  synthesizeTileForgeRegion,
} from './tile-forge.region-synthesizer.js';

export { scoreTileForgeRegion } from './tile-forge.region-quality-scorer.js';

import {
  synthesizeGrandfatherOak as _oak,
  synthesizeAutumnMaple as _maple,
  synthesizeRusticWell as _well,
  synthesizeAncientDolmen as _dolmen,
  synthesizeTimberFence as _fence,
  synthesizeSunflowerPatch as _sunflowers,
  synthesizeRuinedStructure as _ruin,
} from './tile-forge.hero-synthesizer.js';

import {
  synthesizeGroundFabric as _fabric,
  synthesizeContinuousPath as _path,
  synthesizeWaterSpring as _water,
  synthesizeStratifiedCliff as _cliff,
} from './tile-forge.feature-synthesizer.js';

import {
  TILE_FORGE_FOREST_ACTOR_TYPES,
  synthesizeTileForgeForestActor as _forestActor,
} from './tile-forge.forest-actor-synthesizer.js';

/**
 * Unified entry point for polymorphic Tile Forge asset synthesis.
 *
 * @param {Object} spec Normalized AssetSpec or semantic description
 * @returns {Object} Synthesized asset buffer and SCD128 record
 */
export function synthesizeTileForgeAsset(spec = {}) {
  const semantic = spec.semanticType || spec.assetClass;
  const seed = spec.seed || 4242;
  const paletteFamily = spec.paletteFamily || spec.biome || 'verdant_dofus';

  if (TILE_FORGE_FOREST_ACTOR_TYPES.includes(semantic)) {
    return _forestActor({ semanticType: semantic, seed, paletteFamily });
  }

  switch (semantic) {
    case 'hero_tree_oak':
    case 'grandfather_oak':
      return _oak({ seed, paletteFamily });
    case 'hero_tree_maple':
    case 'autumn_maple':
      return _maple({ seed, paletteFamily });
    case 'hero_prop_well':
    case 'stone_well':
      return _well({ seed, paletteFamily });
    case 'landmark_ancient_dolmen':
    case 'ancient_dolmen':
      return _dolmen({ seed, paletteFamily });
    case 'prop_timber_fence':
    case 'timber_fence':
      return _fence({ seed, paletteFamily });
    case 'feature_sunflowers':
    case 'sunflower_patch':
      return _sunflowers({ seed, paletteFamily });
    case 'landmark_ruined_arch':
    case 'ruined_structure':
      return _ruin({ seed, paletteFamily });
    case 'fabric_meadow':
    case 'quiet_meadow':
      return _fabric({ seed, paletteFamily, detailDensity: 0.06 });
    case 'path_flagstone_road':
    case 'organic_road':
      return _path({ seed, paletteFamily });
    case 'water_lotus_spring':
    case 'lotus_spring':
      return _water({ seed, paletteFamily: 'sacred_water' });
    case 'cliff_stratified_granite':
    case 'mossy_cliff':
      return _cliff({ seed, paletteFamily: 'weathered_granite' });
    default:
      if (spec.assetClass === 'Prop') {
        return synthesizeTileForgeProp({ propType: spec.semanticType || 'crystal_tree', biome: paletteFamily, seed });
      }
      return synthesizeTileForgeTile({ type: spec.semanticType || 'top', biome: paletteFamily, seed });
  }
}
