/**
 * Cohesive forest-environment actor family for Tile Forge.
 *
 * Actors remain separate from the region substrate for Phaser depth sorting,
 * but share the same authored palette and deterministic witness discipline.
 */

import {
  TILE_FORGE_PALETTE_FAMILIES,
  getTileForgePaletteColors,
  hexToRgb,
} from './tile-forge.palette-engine.js';
import {
  synthesizeAutumnMaple,
  synthesizeGrandfatherOak,
  synthesizeRuinedStructure,
  synthesizeRusticWell,
  synthesizeSunflowerPatch,
  synthesizeTimberFence,
} from './tile-forge.hero-synthesizer.js';
import { ASSET_CLASSES, createAssetSpec } from './tile-forge.spec.js';
import { createTileForgeWitnessRecord } from './tile-forge.scd128.js';

export const TILE_FORGE_FOREST_ACTOR_CONTRACT = 'PB-TILE-FORGE-FOREST-ACTOR-v1';

export const TILE_FORGE_FOREST_ACTOR_TYPES = Object.freeze([
  'canopy_oak',
  'canopy_maple',
  'canopy_pine',
  'young_sapling',
  'rustic_well',
  'sanctuary_ruin',
  'timber_fence',
  'sunflower_patch',
  'hollow_stump',
  'fallen_log',
  'lotus_cluster',
  'waymarker',
]);

const HERO_SYNTHESIZERS = Object.freeze({
  canopy_oak: synthesizeGrandfatherOak,
  canopy_maple: synthesizeAutumnMaple,
  rustic_well: synthesizeRusticWell,
  sanctuary_ruin: synthesizeRuinedStructure,
  timber_fence: synthesizeTimberFence,
  sunflower_patch: synthesizeSunflowerPatch,
});

const DEPTH_BIASES = Object.freeze({
  canopy_oak: 8,
  canopy_maple: 8,
  canopy_pine: 8,
  young_sapling: 6,
  rustic_well: 10,
  sanctuary_ruin: 9,
  timber_fence: 5,
  sunflower_patch: 4,
  hollow_stump: 7,
  fallen_log: 6,
  lotus_cluster: 3,
  waymarker: 7,
});

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createBuffer(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    data,
    setPixel(x, y, color, alpha = 255) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const offset = (Math.round(y) * width + Math.round(x)) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = alpha;
    },
  };
}

function fillEllipse(buffer, cx, cy, rx, ry, color, alpha = 255) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x - cx) / Math.max(1, rx);
      const dy = (y - cy) / Math.max(1, ry);
      if (dx * dx + dy * dy <= 1) buffer.setPixel(x, y, color, alpha);
    }
  }
}

function fillRect(buffer, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) buffer.setPixel(px, py, color);
  }
}

function drawLine(buffer, x0, y0, x1, y1, radius, color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    fillEllipse(
      buffer,
      Math.round(x0 + (x1 - x0) * t),
      Math.round(y0 + (y1 - y0) * t),
      radius,
      radius,
      color,
    );
  }
}

function fillTriangle(buffer, cx, topY, bottomY, halfWidth, colors, prng) {
  const height = Math.max(1, bottomY - topY);
  for (let y = topY; y <= bottomY; y += 1) {
    const extent = Math.floor(((y - topY) / height) * halfWidth);
    for (let x = cx - extent; x <= cx + extent; x += 1) {
      const normalized = (x - (cx - extent)) / Math.max(1, extent * 2);
      const baseIndex = normalized < 0.38 ? Math.min(colors.length - 1, 5) : normalized > 0.68 ? 1 : 3;
      const variation = prng() > 0.9 ? 1 : 0;
      buffer.setPixel(x, y, colors[Math.min(colors.length - 1, baseIndex + variation)]);
    }
  }
}

function drawContactShadow(buffer, cx, cy, rx, ry, roles) {
  fillEllipse(buffer, cx, cy, rx, ry, hexToRgb(roles.castShadow[0]), 180);
}

function synthesizeCanopyPine(seed, roles) {
  const buffer = createBuffer(96, 150);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  const wood = roles.wood.map(hexToRgb);
  drawContactShadow(buffer, 48, 137, 35, 7, roles);
  drawLine(buffer, 48, 133, 48, 45, 4, wood[1]);
  fillTriangle(buffer, 48, 9, 54, 21, foliage, prng);
  fillTriangle(buffer, 48, 34, 86, 31, foliage, prng);
  fillTriangle(buffer, 48, 62, 119, 40, foliage, prng);
  return buffer;
}

function synthesizeYoungSapling(seed, roles) {
  const buffer = createBuffer(64, 92);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  const wood = roles.wood.map(hexToRgb);
  drawContactShadow(buffer, 32, 84, 20, 5, roles);
  drawLine(buffer, 32, 82, 31, 37, 2, wood[2]);
  drawLine(buffer, 31, 56, 18, 43, 1, wood[1]);
  drawLine(buffer, 31, 50, 44, 35, 1, wood[1]);
  fillEllipse(buffer, 20, 39, 13, 11, foliage[3 + Math.floor(prng() * 3)]);
  fillEllipse(buffer, 43, 33, 14, 12, foliage[4 + Math.floor(prng() * 3)]);
  fillEllipse(buffer, 31, 21, 16, 14, foliage[5 + Math.floor(prng() * 3)]);
  return buffer;
}

function synthesizeHollowStump(seed, roles) {
  const buffer = createBuffer(80, 70);
  const prng = createPrng(seed);
  const wood = roles.wood.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  drawContactShadow(buffer, 40, 61, 28, 7, roles);
  fillRect(buffer, 25, 27, 30, 31, wood[1]);
  fillEllipse(buffer, 40, 28, 18, 9, wood[3]);
  fillEllipse(buffer, 40, 29, 11, 5, hexToRgb(roles.ink[0]));
  for (let y = 34; y < 57; y += 4) {
    buffer.setPixel(29 + Math.floor(prng() * 21), y, wood[2]);
  }
  fillEllipse(buffer, 25, 52, 9, 5, foliage[3]);
  fillEllipse(buffer, 54, 54, 10, 5, foliage[4]);
  return buffer;
}

function synthesizeFallenLog(seed, roles) {
  const buffer = createBuffer(120, 64);
  const prng = createPrng(seed);
  const wood = roles.wood.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  drawContactShadow(buffer, 60, 53, 48, 7, roles);
  drawLine(buffer, 22, 42, 97, 34, 10, wood[1]);
  drawLine(buffer, 22, 39, 97, 31, 6, wood[2]);
  fillEllipse(buffer, 99, 32, 10, 12, wood[3]);
  fillEllipse(buffer, 99, 32, 6, 8, wood[0]);
  for (let index = 0; index < 7; index += 1) {
    fillEllipse(buffer, 34 + index * 9, 27 - Math.floor(index / 3), 5, 3, foliage[3 + Math.floor(prng() * 3)]);
  }
  return buffer;
}

function synthesizeLotusCluster(seed, roles) {
  const buffer = createBuffer(72, 40);
  const prng = createPrng(seed);
  const pond = roles.pond.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  const flowers = roles.flower.map(hexToRgb);
  drawContactShadow(buffer, 36, 31, 29, 5, roles);
  fillEllipse(buffer, 22, 25, 15, 7, foliage[4]);
  fillEllipse(buffer, 47, 24, 18, 8, foliage[3]);
  fillEllipse(buffer, 35, 17, 12, 6, pond[2]);
  for (const [cx, cy] of [[23, 19], [48, 18], [36, 12]]) {
    const petal = flowers[Math.floor(prng() * flowers.length)];
    fillEllipse(buffer, cx - 3, cy, 4, 2, petal);
    fillEllipse(buffer, cx + 3, cy, 4, 2, petal);
    fillEllipse(buffer, cx, cy - 2, 2, 4, petal);
    buffer.setPixel(cx, cy, hexToRgb(roles.sun[1]));
  }
  return buffer;
}

function synthesizeWaymarker(seed, roles) {
  const buffer = createBuffer(56, 92);
  const prng = createPrng(seed);
  const stone = roles.path.map(hexToRgb);
  drawContactShadow(buffer, 28, 83, 19, 5, roles);
  fillRect(buffer, 20, 27, 17, 54, stone[1]);
  fillRect(buffer, 22, 21, 13, 6, stone[3]);
  fillRect(buffer, 22, 29, 3, 48, stone[3]);
  fillRect(buffer, 34, 31, 3, 46, stone[0]);
  const rune = hexToRgb(roles.magicCyan[Math.floor(prng() * roles.magicCyan.length)]);
  drawLine(buffer, 28, 39, 28, 62, 1, rune);
  drawLine(buffer, 28, 45, 23, 50, 1, rune);
  drawLine(buffer, 28, 54, 33, 49, 1, rune);
  return buffer;
}

const PROCEDURAL_SYNTHESIZERS = Object.freeze({
  canopy_pine: synthesizeCanopyPine,
  young_sapling: synthesizeYoungSapling,
  hollow_stump: synthesizeHollowStump,
  fallen_log: synthesizeFallenLog,
  lotus_cluster: synthesizeLotusCluster,
  waymarker: synthesizeWaymarker,
});

function nearestPaletteColor(r, g, b, paletteRgb) {
  let best = paletteRgb[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of paletteRgb) {
    const dr = r - candidate[0];
    const dg = g - candidate[1];
    const db = b - candidate[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function quantizeToPalette(sourceData, palette) {
  const data = new Uint8ClampedArray(sourceData);
  const paletteRgb = palette.map(hexToRgb);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const nearest = nearestPaletteColor(data[offset], data[offset + 1], data[offset + 2], paletteRgb);
    data[offset] = nearest[0];
    data[offset + 1] = nearest[1];
    data[offset + 2] = nearest[2];
  }
  return data;
}

function hashPixels(data, { alphaOnly = false, prefix = '' } = {}) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < prefix.length; index += 1) {
    hash ^= prefix.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const start = alphaOnly ? 3 : 0;
  const step = alphaOnly ? 4 : 1;
  for (let index = start; index < data.length; index += step) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function countContactPixels(data, width, height) {
  let count = 0;
  for (let y = Math.floor(height * 0.78); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) count += 1;
    }
  }
  return count;
}

function finalizeActor(base, semanticType, seed, paletteFamily, family) {
  const palette = getTileForgePaletteColors(family);
  const data = quantizeToPalette(base.data, palette);
  let activeCellCount = 0;
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] > 0) activeCellCount += 1;
  }
  const silhouetteHash = `tfa-${hashPixels(data, {
    alphaOnly: true,
    prefix: `${semanticType}:${base.width}:${base.height}`,
  })}`;
  const realizationHash = `tfa-${hashPixels(data, { prefix: `${semanticType}:${seed}` })}`;
  const assetSpec = base.assetSpec ?? createAssetSpec({
    id: `forest-${semanticType}`,
    assetClass: ASSET_CLASSES.PROP,
    semanticType,
    seed,
    paletteFamily,
    visualBounds: { width: base.width, height: base.height, anchorX: 0.5, anchorY: 0.94 },
  });
  const scd128Record = base.scd128Record ?? createTileForgeWitnessRecord(
    { width: base.width, height: base.height, terrainType: `forest_actor_${semanticType}` },
    { biome: paletteFamily, seed, cellCount: activeCellCount },
  );

  return Object.freeze({
    contract: TILE_FORGE_FOREST_ACTOR_CONTRACT,
    semanticType,
    width: base.width,
    height: base.height,
    data,
    activeCellCount,
    anchor: Object.freeze({ x: 0.5, y: 0.94 }),
    depthBias: DEPTH_BIASES[semanticType],
    contactPixelCount: countContactPixels(data, base.width, base.height),
    silhouetteHash,
    realizationHash,
    paletteFamily,
    palette,
    paletteRoles: family.roles,
    assetSpec,
    scd128Record,
  });
}

/**
 * Synthesize one supported environmental actor in the shared scene palette.
 */
export function synthesizeTileForgeForestActor({
  semanticType,
  seed = 4242,
  paletteFamily = 'scholomance_sunlit_glade',
} = {}) {
  if (!TILE_FORGE_FOREST_ACTOR_TYPES.includes(semanticType)) {
    throw new TypeError(`PB-TFA-001 unknown forest actor: ${String(semanticType)}`);
  }
  const family = TILE_FORGE_PALETTE_FAMILIES[paletteFamily];
  if (!family?.roles) {
    throw new TypeError(`PB-TFA-002 palette lacks forest roles: ${String(paletteFamily)}`);
  }

  const heroSynthesizer = HERO_SYNTHESIZERS[semanticType];
  const proceduralSynthesizer = PROCEDURAL_SYNTHESIZERS[semanticType];
  const base = heroSynthesizer
    ? heroSynthesizer({ seed, paletteFamily })
    : proceduralSynthesizer(seed, family.roles);
  return finalizeActor(base, semanticType, seed >>> 0, paletteFamily, family);
}
