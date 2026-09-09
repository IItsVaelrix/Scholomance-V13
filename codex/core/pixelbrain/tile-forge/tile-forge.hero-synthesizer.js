/**
 * Tile Forge — Macro-Scale Hero Asset Synthesizers
 *
 * Implements Phase 5 Hero Asset Synthesis:
 * - Grandfather Ancient Oak (160x200)
 * - Autumn Gold Maple (140x180)
 * - Rustic Stone Well (56x60)
 * - Ancient Moss Dolmen (80x72)
 * - Timber Fence with Pitchfork (80x48)
 * - Sunlit Sunflower Patch (64x48)
 *
 * Invariants Enforced:
 * - Anti-Grid Invariant: Decoupled visual bounds and logical footprint.
 * - Silhouette-First Invariant: Bold, instantly recognizable monochrome silhouette.
 * - Material Readability Invariant: Material-specific grammars for wood, stone, foliage, metal.
 * - Lighting Consistency Invariant: Coherent upper-left dimetric key light.
 * - Anti-Vector Invariant: Discrete 1x pixel cells, 2x2 Bayer dithering, zero blur.
 */

import {
  TILE_FORGE_PALETTE_FAMILIES,
  hexToRgb,
} from './tile-forge.palette-engine.js';
import {
  renderVolumetricFoliageLobe,
  renderClusteredFoliageLobe,
  renderGnarledWoodBranch,
  renderBarkTrunk,
  renderChiseledStoneBlock,
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

function createHeroBuffer(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    data,
    setPixel(x, y, rgb, alpha = 255) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = (y * width + x) * 4;
      // Alpha blending over existing buffer pixels
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
 * Grounds an actor with a contact shadow plus a soft cast shadow thrown toward
 * the south-east (away from the upper-left key light), so it sits in the scene
 * instead of floating above it.
 */
function drawGroundingShadow(buffer, cx, groundY, rx, ry, rgb, cast = 0.45) {
  for (let dy = -ry; dy <= ry; dy += 1) {
    for (let dx = -rx; dx <= rx; dx += 1) {
      const contact = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (contact <= 1) {
        buffer.setPixel(cx + dx, groundY + dy, rgb, Math.round(150 * (1 - contact)));
      }
      const castX = dx - rx * cast;
      const castDist = (castX * castX) / (rx * rx * 1.5) + (dy * dy) / (ry * ry * 1.15);
      if (castDist <= 1 && castX > 0) {
        buffer.setPixel(cx + dx, groundY + dy, rgb, Math.round(80 * (1 - castDist)));
      }
    }
  }
}

/**
 * Synthesizes the Grandfather Ancient Oak (160x200).
 */
export function synthesizeGrandfatherOak({
  seed = 4242,
  paletteFamily = 'verdant_dofus',
} = {}) {
  const width = 160;
  const height = 200;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.verdant_dofus;
  const subSeeds = deriveSubStreamSeeds(seed);
  const structPrng = createPrng(subSeeds.structure);
  const foliagePrng = createPrng(subSeeds.material);

  const cx = 80;
  const baseGroundY = 178;

  // 1. Grounding: contact shadow + south-east cast shadow.
  const shadowColor = hexToRgb(palette.ramp[0]);
  drawGroundingShadow(buf, cx, baseGroundY, 46, 12, shadowColor);

  // 2. Buttressed Roots
  const rootPrng = createPrng(subSeeds.structure + 1);
  const roots = [
    { x0: cx - 6, y0: baseGroundY - 8, x1: cx - 28, y1: baseGroundY + 6, r0: 7, r1: 2 },
    { x0: cx + 5, y0: baseGroundY - 8, x1: cx + 26, y1: baseGroundY + 5, r0: 6, r1: 2 },
    { x0: cx - 1, y0: baseGroundY - 4, x1: cx - 8, y1: baseGroundY + 9, r0: 5, r1: 2 },
    { x0: cx + 3, y0: baseGroundY - 4, x1: cx + 12, y1: baseGroundY + 8, r0: 5, r1: 2 },
  ];
  for (const r of roots) {
    renderBarkTrunk(buf, r.x0, r.y0, r.x1, r.y1, r.r0, r.r1, palette.wood, rootPrng);
  }

  // 3. Massive Gnarled Trunk
  renderBarkTrunk(buf, cx, baseGroundY, cx - 4, 118, 14, 10, palette.wood, structPrng);

  // 4. Primary Boughs
  const boughs = [
    { x0: cx - 4, y0: 122, x1: cx - 42, y1: 82, r0: 9, r1: 4 },
    { x0: cx - 4, y0: 120, x1: cx + 38, y1: 80, r0: 9, r1: 4 },
    { x0: cx - 4, y0: 116, x1: cx - 8, y1: 64, r0: 8, r1: 3 },
    { x0: cx - 24, y0: 96, x1: cx - 52, y1: 62, r0: 5, r1: 2 },
    { x0: cx + 22, y0: 94, x1: cx + 48, y1: 60, r0: 5, r1: 2 },
  ];
  for (const b of boughs) {
    renderBarkTrunk(buf, b.x0, b.y0, b.x1, b.y1, b.r0, b.r1, palette.wood, structPrng);
  }

  // 5. Deep Background Canopy Lobes (ambient occlusion)
  const bgLobes = [
    { cx: cx - 36, cy: 74, rx: 32, ry: 24 },
    { cx: cx + 34, cy: 72, rx: 32, ry: 24 },
    { cx: cx - 6, cy: 56, rx: 34, ry: 26 },
  ];
  for (const lobe of bgLobes) {
    renderClusteredFoliageLobe(buf, lobe.cx, lobe.cy, lobe.rx, lobe.ry, palette.ramp, foliagePrng, { isBackground: true });
  }

  // 6. Foreground Canopy Lobes (layered clustered leaf masses)
  const fgLobes = [
    { cx: cx - 46, cy: 82, rx: 28, ry: 22, sunlit: 0.1 },
    { cx: cx + 44, cy: 80, rx: 26, ry: 20, sunlit: -0.05 },
    { cx: cx - 22, cy: 58, rx: 30, ry: 24, sunlit: 0.15 },
    { cx: cx + 22, cy: 56, rx: 28, ry: 22, sunlit: 0.05 },
    { cx: cx - 2, cy: 40, rx: 32, ry: 25, sunlit: 0.22 },
  ];
  for (const lobe of fgLobes) {
    renderClusteredFoliageLobe(buf, lobe.cx, lobe.cy, lobe.rx, lobe.ry, palette.ramp, foliagePrng, { sunlitBoost: lobe.sunlit });
  }

  // Count active cells
  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `grandfather_oak_${seed}`,
    assetClass: ASSET_CLASSES.BOTANICAL_ACTOR,
    semanticType: 'hero_tree_oak',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 2, gridH: 2, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseGroundY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    {
      width,
      height,
      hasCliff: false,
      terrainType: 'botanical_grandfather_oak',
    },
    {
      biome: paletteFamily,
      seed,
      cellCount: activeCellCount,
    }
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
 * Synthesizes the Autumn Gold Maple (140x180).
 */
export function synthesizeAutumnMaple({
  seed = 4242,
  paletteFamily = 'autumnal_gold',
} = {}) {
  const width = 140;
  const height = 180;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.autumnal_gold;
  const subSeeds = deriveSubStreamSeeds(seed);
  const structPrng = createPrng(subSeeds.structure);
  const foliagePrng = createPrng(subSeeds.material);

  const cx = 70;
  const baseGroundY = 162;

  // 1. Grounding: contact shadow + south-east cast shadow.
  const shadowColor = hexToRgb(palette.ramp[0]);
  drawGroundingShadow(buf, cx, baseGroundY, 38, 10, shadowColor);

  // 2. Asymmetric Curved Trunk
  renderBarkTrunk(buf, cx, baseGroundY, cx - 8, 108, 11, 7, palette.wood, structPrng);
  renderBarkTrunk(buf, cx - 8, 108, cx - 18, 72, 7, 4, palette.wood, structPrng);
  renderBarkTrunk(buf, cx - 8, 108, cx + 22, 78, 6, 3, palette.wood, structPrng);

  // 3. Golden Foliage Lobes (Asymmetrical, windward slant)
  const lobes = [
    { cx: cx - 28, cy: 72, rx: 26, ry: 20, sunlit: 0.15 },
    { cx: cx + 24, cy: 76, rx: 22, ry: 18, sunlit: -0.05 },
    { cx: cx - 14, cy: 46, rx: 28, ry: 22, sunlit: 0.22 },
    { cx: cx + 18, cy: 50, rx: 24, ry: 19, sunlit: 0.08 },
    { cx: cx + 2, cy: 30, rx: 22, ry: 17, sunlit: 0.28 },
  ];

  for (const lobe of lobes) {
    renderClusteredFoliageLobe(buf, lobe.cx, lobe.cy, lobe.rx, lobe.ry, palette.ramp, foliagePrng, { sunlitBoost: lobe.sunlit });
  }

  // 4. Sparse Falling Leaves Drift
  const leafPrng = createPrng(subSeeds.detail);
  const leafColor = hexToRgb(palette.ramp[5]);
  for (let i = 0; i < 18; i += 1) {
    const lx = Math.round(cx - 30 + leafPrng() * 65);
    const ly = Math.round(baseGroundY - 70 + leafPrng() * 65);
    buf.setPixel(lx, ly, leafColor, 240);
    buf.setPixel(lx + 1, ly, hexToRgb(palette.ramp[4]), 220);
  }

  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `autumn_maple_${seed}`,
    assetClass: ASSET_CLASSES.BOTANICAL_ACTOR,
    semanticType: 'hero_tree_maple',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 2, gridH: 2, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseGroundY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'botanical_autumn_maple' },
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
 * Synthesizes the Rustic Stone Well (56x60).
 */
export function synthesizeRusticWell({
  seed = 4242,
  paletteFamily = 'verdant_dofus',
} = {}) {
  const width = 56;
  const height = 60;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.verdant_dofus;
  const subSeeds = deriveSubStreamSeeds(seed);
  const prng = createPrng(subSeeds.structure);

  const cx = 28;
  const baseY = 46;

  // 1. Ground Drop Shadow
  const shadow = hexToRgb(palette.stone.shadow);
  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -22; dx <= 22; dx += 1) {
      if ((dx * dx) / (22 * 22) + (dy * dy) / (6 * 6) <= 1.0) {
        buf.setPixel(cx + dx, baseY + dy + 4, shadow, 150);
      }
    }
  }

  // 2. Circular Stone Cylindrical Wall
  const wallH = 14;
  for (let y = baseY - wallH; y <= baseY; y += 1) {
    for (let x = cx - 18; x <= cx + 18; x += 1) {
      const u = (x - cx) / 18;
      if (Math.abs(u) <= 1.0) {
        const dot = -0.65 * u + 0.65 * Math.sqrt(1 - u * u);
        const shade = Math.max(0, Math.min(1, (dot + 1) * 0.5));
        let color = hexToRgb(palette.stone.mid);
        if (shade > 0.7) color = hexToRgb(palette.stone.highlight);
        else if (shade > 0.45) color = hexToRgb(palette.stone.light);
        else if (shade < 0.25) color = hexToRgb(palette.stone.dark);

        // Stone course seams
        if ((y - (baseY - wallH)) % 5 === 0 || (x * 3 + y * 2) % 11 === 0) {
          color = hexToRgb(palette.stone.shadow);
        }
        buf.setPixel(x, y, color, 255);
      }
    }
  }

  // 3. Top Stone Rim & Interior Well Bore with Water
  for (let dy = -5; dy <= 5; dy += 1) {
    for (let dx = -18; dx <= 18; dx += 1) {
      const dist = (dx * dx) / (18 * 18) + (dy * dy) / (5 * 5);
      if (dist <= 1.0) {
        const px = cx + dx;
        const py = baseY - wallH + dy;
        if (dist > 0.60) {
          // Rim ring
          const isSunlit = dx < 0;
          buf.setPixel(px, py, isSunlit ? hexToRgb(palette.stone.highlight) : hexToRgb(palette.stone.mid), 255);
        } else {
          // Water surface in borehole
          buf.setPixel(px, py, hexToRgb(TILE_FORGE_PALETTE_FAMILIES.sacred_water.ramp[3]), 255);
          if (dx === -3 && dy === -1) {
            buf.setPixel(px, py, hexToRgb(TILE_FORGE_PALETTE_FAMILIES.sacred_water.ramp[7]), 255); // glint
          }
        }
      }
    }
  }

  // 4. Timber Posts & Winch Crossbeam
  const postLeftX = cx - 14;
  const postRightX = cx + 14;
  const postTopY = 14;
  renderGnarledWoodBranch(buf, postLeftX, baseY - wallH, postLeftX, postTopY, 2, 2, palette.wood, prng);
  renderGnarledWoodBranch(buf, postRightX, baseY - wallH, postRightX, postTopY, 2, 2, palette.wood, prng);
  renderGnarledWoodBranch(buf, postLeftX - 2, postTopY + 2, postRightX + 2, postTopY + 2, 2, 2, palette.wood, prng);

  // 5. Rope Spool & Hanging Bucket
  const ropeColor = hexToRgb(palette.wood.highlight);
  for (let y = postTopY + 3; y <= postTopY + 12; y += 1) {
    buf.setPixel(cx, y, ropeColor, 255);
  }
  // Bucket
  renderChiseledStoneBlock(buf, cx - 3, postTopY + 13, 6, 6, palette.wood, prng);

  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `rustic_well_${seed}`,
    assetClass: ASSET_CLASSES.PROP,
    semanticType: 'hero_prop_well',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 1, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'prop_rustic_well' },
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
 * Synthesizes the Ancient Moss Dolmen (80x72).
 */
export function synthesizeAncientDolmen({
  seed = 4242,
  paletteFamily = 'weathered_granite',
} = {}) {
  const width = 80;
  const height = 72;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.weathered_granite;
  const subSeeds = deriveSubStreamSeeds(seed);
  const prng = createPrng(subSeeds.structure);

  const cx = 40;
  const baseY = 56;

  // 1. Ground Drop Shadow
  const shadow = hexToRgb(palette.stone.shadow);
  for (let dy = -8; dy <= 8; dy += 1) {
    for (let dx = -32; dx <= 32; dx += 1) {
      if ((dx * dx) / (32 * 32) + (dy * dy) / (8 * 8) <= 1.0) {
        buf.setPixel(cx + dx, baseY + dy + 2, shadow, 140);
      }
    }
  }

  // 2. Left and Right Upright Megaliths
  renderChiseledStoneBlock(buf, cx - 22, baseY - 28, 14, 30, palette.stone, prng, { mossColor: palette.accents.moss_glow });
  renderChiseledStoneBlock(buf, cx + 8, baseY - 26, 15, 28, palette.stone, prng, { mossColor: palette.accents.moss_glow });

  // 3. Massive Horizontal Capstone Slab
  renderChiseledStoneBlock(buf, cx - 32, baseY - 42, 64, 16, palette.stone, prng, { mossColor: palette.accents.moss_glow });

  // 4. Glowing Runes Carved on Capstone
  const runeGlow = hexToRgb(palette.accents.moss_glow);
  const runes = [
    { x: cx - 18, y: baseY - 35 },
    { x: cx - 4, y: baseY - 34 },
    { x: cx + 12, y: baseY - 35 },
  ];
  for (const r of runes) {
    buf.setPixel(r.x, r.y, runeGlow, 255);
    buf.setPixel(r.x + 1, r.y, runeGlow, 255);
    buf.setPixel(r.x, r.y - 1, runeGlow, 255);
  }

  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `ancient_dolmen_${seed}`,
    assetClass: ASSET_CLASSES.LANDMARK,
    semanticType: 'landmark_ancient_dolmen',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 2, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'landmark_ancient_dolmen' },
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
 * Synthesizes a Timber Fence with Leaning Pitchfork (80x48).
 */
export function synthesizeTimberFence({
  seed = 4242,
  paletteFamily = 'verdant_dofus',
} = {}) {
  const width = 80;
  const height = 48;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.verdant_dofus;
  const subSeeds = deriveSubStreamSeeds(seed);
  const prng = createPrng(subSeeds.structure);

  const cx = 40;
  const baseY = 38;

  // 1. Posts (Left and Right)
  renderGnarledWoodBranch(buf, cx - 24, baseY, cx - 24, baseY - 22, 3, 3, palette.wood, prng);
  renderGnarledWoodBranch(buf, cx + 24, baseY, cx + 24, baseY - 22, 3, 3, palette.wood, prng);

  // 2. Horizontal Split Rails
  renderGnarledWoodBranch(buf, cx - 28, baseY - 16, cx + 28, baseY - 16, 2, 2, palette.wood, prng);
  renderGnarledWoodBranch(buf, cx - 28, baseY - 7, cx + 28, baseY - 7, 2, 2, palette.wood, prng);

  // 3. Leaning Iron Pitchfork on Left Post
  const handleColor = hexToRgb(palette.wood.highlight);
  const steelColor = hexToRgb('#CBD5E1');
  const steelGlint = hexToRgb('#FFFFFF');

  // Handle leaning at angle
  for (let step = 0; step < 26; step += 1) {
    const px = Math.round(cx - 24 + step * 0.4);
    const py = Math.round(baseY - step * 0.9);
    buf.setPixel(px, py, handleColor, 255);
  }
  // Iron Tines
  const topX = Math.round(cx - 24 + 25 * 0.4);
  const topY = Math.round(baseY - 25 * 0.9);
  for (let t = -3; t <= 3; t += 2) {
    buf.setPixel(topX + t, topY - 3, steelGlint, 255);
    buf.setPixel(topX + t, topY - 2, steelColor, 255);
    buf.setPixel(topX + t, topY - 1, steelColor, 255);
  }

  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `timber_fence_${seed}`,
    assetClass: ASSET_CLASSES.PROP,
    semanticType: 'prop_timber_fence',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 2, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'prop_timber_fence' },
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
 * Synthesizes a Sunlit Sunflower Patch (64x48).
 */
export function synthesizeSunflowerPatch({
  seed = 4242,
  paletteFamily = 'verdant_dofus',
} = {}) {
  const width = 64;
  const height = 48;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.verdant_dofus;
  const subSeeds = deriveSubStreamSeeds(seed);
  const _prng = createPrng(subSeeds.detail);

  const cx = 32;
  const baseY = 40;

  // Stems & Blooms
  const flowers = [
    { x: cx - 14, y: baseY - 18, r: 6 },
    { x: cx + 2, y: baseY - 24, r: 8 },
    { x: cx + 16, y: baseY - 16, r: 6 },
  ];

  const petalColor = hexToRgb('#FBBF24');
  const petalHi = hexToRgb('#FEF08A');
  const discColor = hexToRgb('#78350F');
  const stemColor = hexToRgb(palette.ramp[2]);

  for (const f of flowers) {
    // Stem
    for (let y = f.y; y <= baseY; y += 1) {
      buf.setPixel(f.x, y, stemColor, 255);
    }
    // Petals & Disc
    for (let dy = -f.r; dy <= f.r; dy += 1) {
      for (let dx = -f.r; dx <= f.r; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d <= f.r) {
          const px = f.x + dx;
          const py = f.y + dy;
          if (d <= f.r * 0.45) {
            buf.setPixel(px, py, discColor, 255);
          } else {
            buf.setPixel(px, py, dx < 0 && dy < 0 ? petalHi : petalColor, 255);
          }
        }
      }
    }
  }

  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `sunflower_patch_${seed}`,
    assetClass: ASSET_CLASSES.TERRAIN_FEATURE,
    semanticType: 'feature_sunflowers',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 1, gridH: 1, originTx: 0, originTy: 0, elevation: 0, walkable: true },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'feature_sunflowers' },
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
 * Synthesizes a Ruined Stone Structure (96x80) with a broken archway and crumbled column.
 */
export function synthesizeRuinedStructure({
  seed = 4242,
  paletteFamily = 'weathered_granite',
} = {}) {
  const width = 96;
  const height = 80;
  const buf = createHeroBuffer(width, height);
  const palette = TILE_FORGE_PALETTE_FAMILIES[paletteFamily] || TILE_FORGE_PALETTE_FAMILIES.weathered_granite;
  const subSeeds = deriveSubStreamSeeds(seed);
  const prng = createPrng(subSeeds.structure);

  const cx = 48;
  const baseY = 64;

  // 1. Ground Drop Shadow
  const shadow = hexToRgb(palette.stone.shadow);
  for (let dy = -8; dy <= 8; dy += 1) {
    for (let dx = -40; dx <= 40; dx += 1) {
      if ((dx * dx) / (40 * 40) + (dy * dy) / (8 * 8) <= 1.0) {
        buf.setPixel(cx + dx, baseY + dy + 2, shadow, 140);
      }
    }
  }

  // 2. Foundation Plinth
  renderChiseledStoneBlock(buf, cx - 36, baseY - 6, 72, 8, palette.stone, prng, { mossColor: palette.accents.moss_glow });

  // 3. Intact Left Pillar (with decorative base and capital)
  renderChiseledStoneBlock(buf, cx - 28, baseY - 48, 14, 42, palette.stone, prng, { mossColor: palette.accents.moss_glow });

  // 4. Broken Right Column (crumbled top half with fallen rubble blocks)
  renderChiseledStoneBlock(buf, cx + 14, baseY - 26, 14, 20, palette.stone, prng, { mossColor: palette.accents.moss_glow });
  // Rubble on ground
  renderChiseledStoneBlock(buf, cx + 26, baseY - 8, 10, 8, palette.stone, prng, { mossColor: palette.accents.moss_glow });
  renderChiseledStoneBlock(buf, cx + 8, baseY - 4, 8, 6, palette.stone, prng, { mossColor: palette.accents.moss_glow });

  // 5. Archway Springing Stone
  renderChiseledStoneBlock(buf, cx - 24, baseY - 56, 22, 10, palette.stone, prng, { mossColor: palette.accents.moss_glow });

  let activeCellCount = 0;
  for (let i = 3; i < buf.data.length; i += 4) {
    if (buf.data[i] > 0) activeCellCount += 1;
  }

  const assetSpec = createAssetSpec({
    id: `ruined_structure_${seed}`,
    assetClass: ASSET_CLASSES.LANDMARK,
    semanticType: 'landmark_ruined_arch',
    seed,
    paletteFamily,
    logicalFootprint: { gridW: 2, gridH: 2, originTx: 0, originTy: 0, elevation: 0, walkable: false },
    visualBounds: { width, height, anchorX: 0.5, anchorY: baseY / height },
  });

  const scd128Record = createTileForgeWitnessRecord(
    { width, height, hasCliff: false, terrainType: 'landmark_ruined_arch' },
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

