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
import {
  renderBarkTrunk,
  renderClusteredFoliageLobe,
} from './tile-forge.material-grammar.js';

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
  decor_grass_tuft: 2,
  decor_grass_tuft_tall: 2,
  decor_flower_cluster: 2,
  decor_pebble_cluster: 2,
  decor_boulder_mossy: 3,
  decor_root_snake: 2,
  decor_reed_clump: 3,
  decor_fern_clump: 2,
  decor_mushroom_cluster: 2,
  decor_leaf_litter: 1,
  decor_fallen_branch: 2,
  decor_dark_shrub: 4,
  decor_canopy_frond: 6,
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

function drawContactShadow(buffer, cx, cy, rx, ry, roles) {
  fillEllipse(buffer, cx, cy, rx, ry, hexToRgb(roles.castShadow[0]), 180);
}

/** Soft cast shadow thrown south-east, away from the upper-left key light. */
function drawCastShadow(buffer, cx, cy, rx, ry, roles) {
  const rgb = hexToRgb(roles.castShadow[0]);
  for (let dy = -ry; dy <= ry; dy += 1) {
    for (let dx = -rx; dx <= rx; dx += 1) {
      const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (d > 1 || dx <= 0) continue;
      buffer.setPixel(cx + dx, cy + dy, rgb, Math.round(70 * (1 - d)));
    }
  }
}

function woodPaletteFrom(woodHex) {
  return {
    shadow: woodHex[0],
    dark: woodHex[1],
    mid: woodHex[2],
    light: woodHex[3] || woodHex[2],
    highlight: woodHex[4] || woodHex[3] || woodHex[2],
  };
}

function pineTierHash(x, y, seed) {
  let value = (seed ^ Math.imul(x, 0x1F123BB5) ^ Math.imul(y, 0x5F356495)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45D9F3B) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0xFFFFFFFF;
}

/**
 * One serrated conifer tier: jagged silhouette, lit west face, shadowed east
 * face, and a dark underside row so stacked tiers separate cleanly.
 */
function fillPineTier(buffer, cx, topY, bottomY, halfWidth, foliage, seed) {
  const height = Math.max(1, bottomY - topY);
  for (let y = topY; y <= bottomY; y += 1) {
    const t = (y - topY) / height;
    const extent = Math.floor(halfWidth * (0.12 + 0.88 * t));
    const isUnderside = y === bottomY;
    for (let x = cx - extent; x <= cx + extent; x += 1) {
      // Serrated fringe: chew only the bottom skirt so the cone is not a
      // clean triangle, without combing the whole silhouette.
      const edge = Math.abs(x - cx);
      if (t > 0.8 && edge > extent * 0.5 && (x + y) % 2 === 0) continue;
      const u = extent === 0 ? 0 : (x - cx) / extent;
      const noise = pineTierHash(x >> 1, y >> 1, seed);
      let color;
      if (isUnderside) color = foliage[1];
      else if (u < -0.3) color = noise > 0.7 ? foliage[6] : foliage[5];
      else if (u < 0.25) color = noise > 0.75 ? foliage[4] : foliage[3];
      else color = noise > 0.8 ? foliage[2] : foliage[1];
      buffer.setPixel(x, y, color);
    }
  }
}

function synthesizeCanopyPine(seed, roles) {
  const buffer = createBuffer(96, 150);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  const wood = roles.wood.map(hexToRgb);
  drawCastShadow(buffer, 48, 137, 34, 8, roles);
  drawContactShadow(buffer, 48, 137, 26, 6, roles);
  renderBarkTrunk(buffer, 48, 136, 48, 62, 4, 3, woodPaletteFrom(roles.wood), prng);
  // Three stacked tiers with per-seed width/height variance.
  const w0 = 20 + Math.floor(prng() * 5);
  const w1 = 30 + Math.floor(prng() * 6);
  const w2 = 38 + Math.floor(prng() * 7);
  fillPineTier(buffer, 48, 8, 52, w0, foliage, seed + 11);
  fillPineTier(buffer, 48, 33, 85, w1, foliage, seed + 29);
  fillPineTier(buffer, 48, 61, 120, w2, foliage, seed + 47);
  return buffer;
}

function synthesizeYoungSapling(seed, roles) {
  const buffer = createBuffer(64, 92);
  const prng = createPrng(seed);
  drawCastShadow(buffer, 32, 84, 18, 5, roles);
  drawContactShadow(buffer, 32, 84, 14, 4, roles);
  renderBarkTrunk(buffer, 32, 83, 30, 44, 2, 1, woodPaletteFrom(roles.wood), prng);
  renderBarkTrunk(buffer, 30, 58, 20, 46, 1, 1, woodPaletteFrom(roles.wood), prng);
  renderBarkTrunk(buffer, 30, 52, 42, 38, 1, 1, woodPaletteFrom(roles.wood), prng);
  renderClusteredFoliageLobe(buffer, 20, 40, 12, 10, roles.foliage, prng, {});
  renderClusteredFoliageLobe(buffer, 42, 34, 13, 11, roles.foliage, prng, { sunlitBoost: 0.05 });
  renderClusteredFoliageLobe(buffer, 30, 22, 15, 13, roles.foliage, prng, { sunlitBoost: 0.12 });
  return buffer;
}

function synthesizeHollowStump(seed, roles) {
  const buffer = createBuffer(80, 70);
  const prng = createPrng(seed);
  const wood = roles.wood.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  drawCastShadow(buffer, 40, 61, 32, 8, roles);
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
  drawCastShadow(buffer, 60, 53, 52, 8, roles);
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
  const buffer = createBuffer(80, 44);
  const prng = createPrng(seed);
  const pond = roles.pond.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  const flowers = roles.flower.map(hexToRgb);
  const glow = roles.magicCyan.map(hexToRgb);
  drawCastShadow(buffer, 40, 35, 34, 6, roles);
  drawContactShadow(buffer, 40, 35, 30, 5, roles);

  // Layered lily pads: dark underside, mid body, lit rim, radial notch.
  const pads = [[24, 28, 17, 8], [52, 26, 20, 9], [38, 18, 13, 6]];
  for (const [pcx, pcy, prx, pry] of pads) {
    fillEllipse(buffer, pcx, pcy + 1, prx, pry, foliage[2]);
    fillEllipse(buffer, pcx, pcy, prx, pry, foliage[4]);
    fillEllipse(
      buffer,
      pcx - Math.floor(prx * 0.3),
      pcy - Math.floor(pry * 0.4),
      Math.max(2, Math.floor(prx * 0.55)),
      Math.max(1, Math.floor(pry * 0.5)),
      foliage[6],
    );
    for (let s = 0; s <= prx; s += 1) buffer.setPixel(pcx + s, pcy, foliage[1]);
  }
  fillEllipse(buffer, 38, 20, 12, 6, pond[2]);

  // Sacred blooms: six-petal stars with a pale bioluminescent core.
  for (const [cx, cy] of [[25, 21], [53, 19], [38, 12], [62, 30]]) {
    const petal = flowers[Math.floor(prng() * flowers.length)];
    fillEllipse(buffer, cx - 4, cy, 4, 2, petal);
    fillEllipse(buffer, cx + 4, cy, 4, 2, petal);
    fillEllipse(buffer, cx, cy - 3, 2, 4, petal);
    fillEllipse(buffer, cx - 3, cy - 2, 3, 2, glow[1]);
    fillEllipse(buffer, cx + 3, cy - 2, 3, 2, glow[1]);
    buffer.setPixel(cx, cy, hexToRgb(roles.sun[1]));
    buffer.setPixel(cx, cy - 1, glow[1]);
  }
  return buffer;
}

function synthesizeWaymarker(seed, roles) {
  const buffer = createBuffer(56, 92);
  const prng = createPrng(seed);
  const stone = roles.path.map(hexToRgb);
  drawCastShadow(buffer, 28, 83, 22, 6, roles);
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

// ── Decor vocabulary ─────────────────────────────────────────────────────────
// Small ground-hugging actors used to break the tile lattice, layer the
// foreground, and carry quiet environmental storytelling. Each is palette-locked
// and deterministic so placements compose like hand-laid Tiled objects.

export const TILE_FORGE_DECOR_TYPES = Object.freeze([
  'decor_grass_tuft',
  'decor_grass_tuft_tall',
  'decor_flower_cluster',
  'decor_pebble_cluster',
  'decor_boulder_mossy',
  'decor_root_snake',
  'decor_reed_clump',
  'decor_fern_clump',
  'decor_mushroom_cluster',
  'decor_leaf_litter',
  'decor_fallen_branch',
  'decor_dark_shrub',
  'decor_canopy_frond',
]);

function drawBlade(buffer, x, baseY, height, lean, color, tipColor) {
  for (let i = 0; i <= height; i += 1) {
    const px = Math.round(x + (i / height) * (i / height) * lean);
    buffer.setPixel(px, baseY - i, i > height - 2 ? tipColor : color);
  }
}

function synthesizeGrassTuft(seed, roles, tall = false) {
  const width = tall ? 26 : 22;
  const height = tall ? 22 : 16;
  const buffer = createBuffer(width, height);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  const baseY = height - 2;
  drawContactShadow(buffer, width / 2, baseY + 1, width * 0.35, 2, roles);
  const blades = tall ? 10 : 7;
  for (let i = 0; i < blades; i += 1) {
    const x = 3 + Math.floor(prng() * (width - 6));
    const bladeHeight = Math.floor((tall ? 12 : 7) + prng() * (tall ? 8 : 6));
    const lean = Math.floor((prng() - 0.5) * 9);
    const body = foliage[3 + Math.floor(prng() * 4)];
    drawBlade(buffer, x, baseY, bladeHeight, lean, body, foliage[8]);
    buffer.setPixel(x, baseY, foliage[1]); // dark rooted base
  }
  return buffer;
}

function synthesizeFlowerCluster(seed, roles) {
  const buffer = createBuffer(22, 16);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  const flowers = roles.flower.map(hexToRgb);
  const sun = roles.sun.map(hexToRgb);
  drawContactShadow(buffer, 11, 14, 8, 2, roles);
  const blooms = 2 + Math.floor(prng() * 3);
  for (let b = 0; b < blooms; b += 1) {
    const bx = 4 + Math.floor(prng() * 14);
    const by = 5 + Math.floor(prng() * 5);
    for (let y = by; y <= 13; y += 1) buffer.setPixel(bx, y, foliage[3]);
    const petal = flowers[Math.floor(prng() * flowers.length)];
    buffer.setPixel(bx - 1, by, petal);
    buffer.setPixel(bx + 1, by, petal);
    buffer.setPixel(bx, by - 1, petal);
    buffer.setPixel(bx, by + 1, petal);
    buffer.setPixel(bx, by, sun[1]);
  }
  return buffer;
}

function synthesizePebbleCluster(seed, roles) {
  const buffer = createBuffer(20, 12);
  const prng = createPrng(seed);
  const path = roles.path.map(hexToRgb);
  drawContactShadow(buffer, 10, 10, 8, 2, roles);
  const stones = 2 + Math.floor(prng() * 2);
  for (let s = 0; s < stones; s += 1) {
    const sx = 4 + Math.floor(prng() * 12);
    const sy = 6 + Math.floor(prng() * 3);
    const r = 2 + Math.floor(prng() * 2);
    fillEllipse(buffer, sx, sy, r, Math.max(1, r - 1), path[2]);
    fillEllipse(buffer, sx - 1, sy - 1, Math.max(1, r - 1), Math.max(1, r - 2), path[4]);
    buffer.setPixel(sx + 1, sy + 1, path[1]);
  }
  return buffer;
}

function synthesizeBoulderMossy(seed, roles) {
  const buffer = createBuffer(34, 26);
  const prng = createPrng(seed);
  const path = roles.path.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  drawCastShadow(buffer, 17, 22, 15, 4, roles);
  drawContactShadow(buffer, 17, 22, 13, 3, roles);
  fillEllipse(buffer, 17, 14, 13, 9, path[2]);
  fillEllipse(buffer, 13, 10, 8, 5, path[4]);
  fillEllipse(buffer, 22, 18, 8, 5, path[1]);
  for (let i = 0; i < 6; i += 1) buffer.setPixel(15 + i, 12 + Math.floor(i / 2), path[1]);
  for (let i = 0; i < 10; i += 1) {
    buffer.setPixel(8 + Math.floor(prng() * 18), 6 + Math.floor(prng() * 4), foliage[3]);
  }
  return buffer;
}

function synthesizeRootSnake(seed, roles) {
  const buffer = createBuffer(40, 14);
  const prng = createPrng(seed);
  const wood = roles.wood.map(hexToRgb);
  drawContactShadow(buffer, 20, 11, 17, 2, roles);
  let y = 8;
  for (let x = 2; x < 38; x += 1) {
    if (x % 6 === 0) y += prng() > 0.5 ? 1 : -1;
    y = Math.max(5, Math.min(10, y));
    buffer.setPixel(x, y - 1, wood[3]);
    buffer.setPixel(x, y, wood[2]);
    buffer.setPixel(x, y + 1, wood[1]);
    if (x % 9 === 0) buffer.setPixel(x, y + 2, wood[1]);
  }
  return buffer;
}

function synthesizeReedClump(seed, roles) {
  const buffer = createBuffer(24, 36);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  const wood = roles.wood.map(hexToRgb);
  drawContactShadow(buffer, 12, 34, 9, 2, roles);
  for (let i = 0; i < 7; i += 1) {
    const x = 4 + Math.floor(prng() * 16);
    const height = 18 + Math.floor(prng() * 13);
    const lean = Math.floor((prng() - 0.5) * 7);
    for (let s = 0; s <= height; s += 1) {
      const px = Math.round(x + (s / height) * (s / height) * lean);
      buffer.setPixel(px, 34 - s, foliage[5]);
      if (s < height * 0.6) buffer.setPixel(px - 1, 34 - s, foliage[3]);
    }
    const tipX = Math.round(x + lean);
    buffer.setPixel(tipX, 34 - height - 1, wood[3]);
    buffer.setPixel(tipX, 34 - height - 2, wood[3]);
    buffer.setPixel(tipX, 34 - height - 3, wood[2]);
  }
  return buffer;
}

function synthesizeFernClump(seed, roles) {
  const buffer = createBuffer(26, 18);
  const prng = createPrng(seed);
  const foliage = roles.foliage.map(hexToRgb);
  drawContactShadow(buffer, 13, 16, 10, 2, roles);
  for (let f = 0; f < 5; f += 1) {
    const angle = -Math.PI * 0.85 + f * ((Math.PI * 0.7) / 4);
    const len = 8 + Math.floor(prng() * 5);
    for (let s = 1; s <= len; s += 1) {
      const px = Math.round(13 + Math.cos(angle) * s);
      const py = Math.round(15 + Math.sin(angle) * s);
      buffer.setPixel(px, py, foliage[4]);
      if (s > 2 && s < len - 1 && s % 2 === 0) {
        buffer.setPixel(px - 1, py - 1, foliage[5]);
        buffer.setPixel(px + 1, py - 1, foliage[5]);
      }
    }
  }
  return buffer;
}

function synthesizeMushroomCluster(seed, roles) {
  const buffer = createBuffer(16, 14);
  const prng = createPrng(seed);
  const path = roles.path.map(hexToRgb);
  const glow = roles.magicCyan.map(hexToRgb);
  drawContactShadow(buffer, 8, 12, 6, 2, roles);
  for (let i = 0; i < 3; i += 1) {
    const mx = 3 + Math.floor(prng() * 10);
    const my = 6 + Math.floor(prng() * 4);
    buffer.setPixel(mx, my + 1, path[3]);
    buffer.setPixel(mx, my + 2, path[3]);
    buffer.setPixel(mx - 1, my, glow[0]);
    buffer.setPixel(mx, my, glow[1]);
    buffer.setPixel(mx + 1, my, glow[0]);
  }
  return buffer;
}

function synthesizeLeafLitter(seed, roles) {
  const buffer = createBuffer(26, 12);
  const prng = createPrng(seed);
  const leaves = roles.flower.map(hexToRgb);
  const wood = roles.wood.map(hexToRgb);
  for (let i = 0; i < 9; i += 1) {
    const lx = 2 + Math.floor(prng() * 22);
    const ly = 3 + Math.floor(prng() * 7);
    const color = prng() > 0.4 ? leaves[Math.floor(prng() * leaves.length)] : wood[2];
    buffer.setPixel(lx, ly, color);
    buffer.setPixel(lx + 1, ly, color);
  }
  return buffer;
}

function synthesizeFallenBranch(seed, roles) {
  const buffer = createBuffer(34, 10);
  const wood = roles.wood.map(hexToRgb);
  const foliage = roles.foliage.map(hexToRgb);
  drawContactShadow(buffer, 17, 8, 14, 2, roles);
  drawLine(buffer, 3, 6, 30, 5, 1, wood[2]);
  drawLine(buffer, 12, 6, 16, 3, 1, wood[1]);
  drawLine(buffer, 22, 5, 26, 8, 1, wood[1]);
  buffer.setPixel(16, 2, foliage[3]);
  buffer.setPixel(26, 8, foliage[2]);
  return buffer;
}

function synthesizeDarkShrub(seed, roles) {
  const buffer = createBuffer(52, 38);
  const prng = createPrng(seed);
  drawCastShadow(buffer, 26, 34, 22, 5, roles);
  drawContactShadow(buffer, 26, 34, 18, 4, roles);
  // Shadowed under-mass behind, then mid and sunlit crowns so the shrub reads
  // as layered foliage rather than a silhouette rock.
  renderClusteredFoliageLobe(buffer, 26, 22, 18, 13, roles.foliage, prng, { isBackground: true });
  renderClusteredFoliageLobe(buffer, 16, 24, 14, 11, roles.foliage, prng, {});
  renderClusteredFoliageLobe(buffer, 36, 22, 14, 11, roles.foliage, prng, {});
  renderClusteredFoliageLobe(buffer, 26, 14, 15, 11, roles.foliage, prng, { sunlitBoost: 0.12 });
  return buffer;
}

function synthesizeCanopyFrond(seed, roles) {
  const buffer = createBuffer(56, 28);
  const prng = createPrng(seed);
  const wood = roles.wood.map(hexToRgb);
  for (let s = 0; s <= 20; s += 1) {
    const px = Math.round(2 + s * 2.2);
    const py = Math.round(2 + s * 0.7 + Math.sin(s * 0.4) * 2);
    buffer.setPixel(px, py, wood[1]);
    buffer.setPixel(px, py + 1, wood[2]);
  }
  renderClusteredFoliageLobe(buffer, 20, 8, 13, 9, roles.foliage, prng, { isBackground: true });
  renderClusteredFoliageLobe(buffer, 16, 12, 13, 9, roles.foliage, prng, {});
  renderClusteredFoliageLobe(buffer, 34, 15, 14, 10, roles.foliage, prng, {});
  renderClusteredFoliageLobe(buffer, 48, 19, 10, 8, roles.foliage, prng, { sunlitBoost: 0.1 });
  // Hangs from above: anchor near the top-left so placement reads as overhang.
  buffer.anchor = { x: 0.15, y: 0.1 };
  return buffer;
}

const DECOR_SYNTHESIZERS = Object.freeze({
  decor_grass_tuft: (seed, roles) => synthesizeGrassTuft(seed, roles, false),
  decor_grass_tuft_tall: (seed, roles) => synthesizeGrassTuft(seed, roles, true),
  decor_flower_cluster: synthesizeFlowerCluster,
  decor_pebble_cluster: synthesizePebbleCluster,
  decor_boulder_mossy: synthesizeBoulderMossy,
  decor_root_snake: synthesizeRootSnake,
  decor_reed_clump: synthesizeReedClump,
  decor_fern_clump: synthesizeFernClump,
  decor_mushroom_cluster: synthesizeMushroomCluster,
  decor_leaf_litter: synthesizeLeafLitter,
  decor_fallen_branch: synthesizeFallenBranch,
  decor_dark_shrub: synthesizeDarkShrub,
  decor_canopy_frond: synthesizeCanopyFrond,
});

/**
 * Synthesize one deterministic ground-decor actor in the shared scene palette.
 */
export function synthesizeTileForgeDecor({
  decorType,
  seed = 4242,
  paletteFamily = 'scholomance_sunlit_glade',
} = {}) {
  if (!TILE_FORGE_DECOR_TYPES.includes(decorType)) {
    throw new TypeError(`PB-TFD-001 unknown decor type: ${String(decorType)}`);
  }
  const family = TILE_FORGE_PALETTE_FAMILIES[paletteFamily];
  if (!family?.roles) {
    throw new TypeError(`PB-TFD-002 palette lacks decor roles: ${String(paletteFamily)}`);
  }
  return memoizedSynth(`decor:${decorType}:${seed >>> 0}:${paletteFamily}`, () => {
    const base = DECOR_SYNTHESIZERS[decorType](seed >>> 0, family.roles);
    return finalizeActor(base, decorType, seed >>> 0, paletteFamily, family);
  });
}

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
    anchor: Object.freeze(base.anchor ?? { x: 0.5, y: 0.94 }),
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

// Actors and decor are pure functions of (type, seed, palette). A bounded memo
// keeps repeated scene builds (reseed, inspect, studio preview) cheap without
// changing any output identity.
const SYNTH_MEMO = new Map();
const SYNTH_MEMO_CAP = 96;

function memoizedSynth(key, produce) {
  if (SYNTH_MEMO.has(key)) return SYNTH_MEMO.get(key);
  const value = produce();
  if (SYNTH_MEMO.size >= SYNTH_MEMO_CAP) {
    SYNTH_MEMO.delete(SYNTH_MEMO.keys().next().value);
  }
  SYNTH_MEMO.set(key, value);
  return value;
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

  return memoizedSynth(`actor:${semanticType}:${seed >>> 0}:${paletteFamily}`, () => {
    const heroSynthesizer = HERO_SYNTHESIZERS[semanticType];
    const proceduralSynthesizer = PROCEDURAL_SYNTHESIZERS[semanticType];
    const base = heroSynthesizer
      ? heroSynthesizer({ seed, paletteFamily })
      : proceduralSynthesizer(seed, family.roles);
    return finalizeActor(base, semanticType, seed >>> 0, paletteFamily, family);
  });
}
