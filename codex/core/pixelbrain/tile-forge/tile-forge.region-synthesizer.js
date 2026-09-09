/**
 * Continuous Tile Forge region realization.
 *
 * Form is compiled once, then colored with region-space fields so texture does
 * not restart at logical tile boundaries.
 *
 * Realization grammar (fidelity pass):
 * - Variation is driven by low-resolution *clustered* value-noise fields sampled
 *   nearest-neighbour, so tone changes read as deliberate pixel clusters rather
 *   than per-pixel confetti or smooth vector gradients.
 * - Scene fields (moisture near water, wear near path, canopy occlusion) modulate
 *   every material so the ground responds to its neighbourhood instead of being
 *   painted per tile.
 * - Material boundaries interdigitate: distance fields let grass encroach onto
 *   path/soil and mud/foam encroach onto water, dissolving the diamond lattice.
 * - One upper-left key light governs all materials; cliff flanks split into a lit
 *   south-west face and a shadowed south-east face.
 */

import { deriveSubStreamSeeds } from './tile-forge.spec.js';
import {
  TILE_FORGE_PALETTE_FAMILIES,
  getTileForgePaletteColors,
  hexToRgb,
} from './tile-forge.palette-engine.js';
import {
  TILE_FORGE_REGION_FORM_CONTRACT,
  buildTileForgeRegionForm,
} from './tile-forge.region-form.js';
import { TILE_FORGE_REGION_MATERIALS } from './tile-forge.region-spec.js';

export const TILE_FORGE_REGION_ASSET_CONTRACT = 'PB-TILE-FORGE-REGION-ASSET-v1';

const MATERIAL_ORDER = TILE_FORGE_REGION_MATERIALS;

const TILE_WIDTH = 80;
const TILE_HEIGHT = 40;
const HALF_WIDTH = TILE_WIDTH / 2;
const FAR = 255;

function hash32(x, y, seed) {
  let value = (seed ^ Math.imul(x, 0x1F123BB5) ^ Math.imul(y, 0x5F356495)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45D9F3B) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45D9F3B) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function unitHash(x, y, seed) {
  return hash32(x, y, seed) / 0xFFFFFFFF;
}

function latticeUnit(ix, iy, seed) {
  let value = (seed ^ Math.imul(ix, 0x27D4EB2D) ^ Math.imul(iy, 0x165667B1)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x85EBCA6B) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xC2B2AE35) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0xFFFFFFFF;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, freq, seed) {
  const fx = x * freq;
  const fy = y * freq;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smoothstep(fx - ix);
  const ty = smoothstep(fy - iy);
  const n00 = latticeUnit(ix, iy, seed);
  const n10 = latticeUnit(ix + 1, iy, seed);
  const n01 = latticeUnit(ix, iy + 1, seed);
  const n11 = latticeUnit(ix + 1, iy + 1, seed);
  const top = n00 + (n10 - n00) * tx;
  const bottom = n01 + (n11 - n01) * tx;
  return top + (bottom - top) * ty;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Build a low-resolution coherent field and sample it nearest-neighbour so the
 * resulting tone regions are blocky pixel clusters, not smoothed gradients.
 */
function buildClusterField(width, height, cellSize, freq, seed, octaves) {
  const cols = Math.max(2, Math.ceil(width / cellSize) + 2);
  const rows = Math.max(2, Math.ceil(height / cellSize) + 2);
  const grid = new Float32Array(cols * rows);
  for (let ry = 0; ry < rows; ry += 1) {
    for (let rx = 0; rx < cols; rx += 1) {
      const wx = rx * cellSize;
      const wy = ry * cellSize;
      let sum = 0;
      let amp = 1;
      let total = 0;
      for (let octave = 0; octave < octaves; octave += 1) {
        sum += valueNoise(wx, wy, freq * (2 ** octave), seed + octave * 7919) * amp;
        total += amp;
        amp *= 0.5;
      }
      grid[ry * cols + rx] = sum / total;
    }
  }
  return {
    cols,
    rows,
    cellSize,
    grid,
    at(x, y) {
      const rx = Math.max(0, Math.min(cols - 1, Math.round(x / cellSize)));
      const ry = Math.max(0, Math.min(rows - 1, Math.round(y / cellSize)));
      return grid[ry * cols + rx];
    },
  };
}

function maskBounds(width, height, mask) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!mask[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function clampBounds(width, height, bounds, margin) {
  return {
    minX: Math.max(0, bounds.minX - margin),
    minY: Math.max(0, bounds.minY - margin),
    maxX: Math.min(width - 1, bounds.maxX + margin),
    maxY: Math.min(height - 1, bounds.maxY + margin),
  };
}

/**
 * Two-pass chamfer distance restricted to a bounding box and capped at `cap`.
 * Distances beyond the cap (or outside the box) saturate at cap+1, which keeps
 * shoreline/wear fields cheap on full-size regions.
 */
function chamferBounded(width, height, isSeed, box, cap) {
  const limit = cap + 1;
  const dist = new Uint8Array(width * height);
  dist.fill(limit);
  for (let y = box.minY; y <= box.maxY; y += 1) {
    const row = y * width;
    for (let x = box.minX; x <= box.maxX; x += 1) {
      if (isSeed(row + x)) dist[row + x] = 0;
    }
  }
  for (let y = box.minY; y <= box.maxY; y += 1) {
    const row = y * width;
    for (let x = box.minX; x <= box.maxX; x += 1) {
      const i = row + x;
      let d = dist[i];
      if (x > box.minX && dist[i - 1] + 1 < d) d = dist[i - 1] + 1;
      if (y > box.minY && dist[i - width] + 1 < d) d = dist[i - width] + 1;
      if (x > box.minX && y > box.minY && dist[i - width - 1] + 1 < d) d = dist[i - width - 1] + 1;
      if (x < box.maxX && y > box.minY && dist[i - width + 1] + 1 < d) d = dist[i - width + 1] + 1;
      dist[i] = d > limit ? limit : d;
    }
  }
  for (let y = box.maxY; y >= box.minY; y -= 1) {
    const row = y * width;
    for (let x = box.maxX; x >= box.minX; x -= 1) {
      const i = row + x;
      let d = dist[i];
      if (x < box.maxX && dist[i + 1] + 1 < d) d = dist[i + 1] + 1;
      if (y < box.maxY && dist[i + width] + 1 < d) d = dist[i + width] + 1;
      if (x < box.maxX && y < box.maxY && dist[i + width + 1] + 1 < d) d = dist[i + width + 1] + 1;
      if (x > box.minX && y < box.maxY && dist[i + width - 1] + 1 < d) d = dist[i + width - 1] + 1;
      dist[i] = d > limit ? limit : d;
    }
  }
  return dist;
}

function constantField(width, height, value) {
  const dist = new Uint8Array(width * height);
  dist.fill(value);
  return dist;
}

/**
 * Stamp soft canopy-occlusion ellipses (cast toward the south-east, away from
 * the upper-left key light) so trees visually sit on the ground fabric.
 */
function buildCanopyShadeField(width, height, shadows) {
  const field = new Uint8Array(width * height);
  for (const shadow of shadows || []) {
    const rx = Math.max(4, shadow.rx || 40);
    const ry = Math.max(2, shadow.ry || 16);
    const strength = shadow.strength ?? 0.75;
    const x0 = Math.max(0, Math.floor(shadow.x - rx));
    const x1 = Math.min(width - 1, Math.ceil(shadow.x + rx));
    const y0 = Math.max(0, Math.floor(shadow.y - ry));
    const y1 = Math.min(height - 1, Math.ceil(shadow.y + ry));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - shadow.x) / rx;
        const dy = (y - shadow.y) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const value = Math.round(255 * (1 - d) * strength);
        const i = y * width + x;
        if (value > field[i]) field[i] = value;
      }
    }
  }
  return field;
}

function rampIndex(ramp, t) {
  return Math.max(0, Math.min(ramp.length - 1, Math.floor(clamp01(t) * ramp.length)));
}

function fnv1aBytes(data, prefix = '') {
  let hash = 0x811C9DC5;
  for (let index = 0; index < prefix.length; index += 1) {
    hash ^= prefix.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function isMaterialEdge(form, x, y, materialIndex) {
  if (x === 0 || y === 0 || x === form.width - 1 || y === form.height - 1) return true;
  const index = y * form.width + x;
  return form.materialIndexMask[index - 1] !== materialIndex
    || form.materialIndexMask[index + 1] !== materialIndex
    || form.materialIndexMask[index - form.width] !== materialIndex
    || form.materialIndexMask[index + form.width] !== materialIndex;
}

function writeRgb(data, pixelIndex, rgb) {
  const offset = pixelIndex * 4;
  data[offset] = rgb[0];
  data[offset + 1] = rgb[1];
  data[offset + 2] = rgb[2];
  data[offset + 3] = 255;
}

function toRgbRoles(roles) {
  return Object.fromEntries(Object.entries(roles).map(([role, colors]) => (
    [role, colors.map(hexToRgb)]
  )));
}

/**
 * Per-material coloring grammars. Every grammar reads the shared scene fields so
 * moisture, wear, and canopy occlusion stay coherent across material boundaries.
 */
function grassQuietColor(ctx) {
  const { roles, macro, meso, micro, distWater, distPath } = ctx;
  const meadow = roles.meadow;
  const wet = distWater <= 4 ? 1 - distWater / 5 : 0;
  const wear = distPath <= 3 ? 1 - distPath / 4 : 0;
  // Wobble the canopy field with meso noise so cast shadows never read as
  // clean ellipses stamped on the ground.
  const canopy = ctx.canopy * (0.55 + 0.45 * meso);

  // Quiet meadow body must stay inside the middle meadow band; scene fields only
  // slide the tone within that band so dominance is preserved.
  const tone = clamp01(
    0.5 + (macro - 0.5) * 0.75 + (meso - 0.5) * 0.6 - canopy * 0.6 - wet * 0.4 + wear * 0.3,
  );
  let color = meadow[2 + Math.round(tone * 2)];
  const crest = meso > 0.68 && macro > 0.46 && canopy < 0.4;

  if (crest) {
    // Sunlit tuft crest clusters: readable grass clumps, not confetti.
    color = micro > 0.4 ? meadow[5] : meadow[4];
    if (micro > 0.88 && macro > 0.62) color = meadow[6];
  } else if (canopy > 0.5 && meso < 0.34) {
    // Deep occlusion pockets beneath canopy.
    color = meadow[1];
  } else if (distWater <= 1 && meso > 0.6) {
    // Patchy wet mud fringe hugging the shoreline.
    color = micro > 0.5 ? roles.soil[1] : roles.soil[2];
  } else if (macro > 0.72 && meso > 0.9 && canopy < 0.2 && micro > 0.88) {
    // Sparse clover / wildflower accents only on open sunlit ground.
    color = roles.flower[hash32(ctx.x, ctx.y, ctx.seeds.detail) % roles.flower.length];
  } else {
    // Blade-level grain inside the middle band: texture without accent cost.
    const blade = hash32(ctx.x, ctx.y, ctx.seeds.microdetail);
    if (blade % 17 === 0) color = meadow[4];
    else if (blade % 23 === 0) color = meadow[2];
  }
  return color;
}

function grassEdgeColor(ctx) {
  const { roles, macro, meso, micro, canopy } = ctx;
  const verge = roles.verge;
  const shade = clamp01(0.3 + macro * 0.45 + meso * 0.25 - canopy * 0.5);
  let color = verge[rampIndex(verge, shade)];

  if (meso > 0.82 && micro > 0.5) {
    color = roles.wood[1]; // fallen leaf litter clusters
  } else if (meso < 0.16 && macro < 0.42) {
    color = roles.foliage[1]; // mossy dark patches
  } else if (canopy > 0.6 && meso < 0.25 && micro > 0.7) {
    color = roles.ink[0]; // root-shadow pockets
  } else if (macro > 0.8 && meso > 0.9) {
    color = roles.flower[hash32(ctx.x, ctx.y, ctx.seeds.detail) % roles.flower.length];
  }
  return color;
}

function pathColor(ctx) {
  const { roles, macro, meso, micro, distNonPath } = ctx;
  const path = roles.path;
  const edge = distNonPath <= 1;

  if (edge && meso > 0.55) {
    // Grass blades encroaching across the worn verge.
    return roles.meadow[2 + Math.round(macro * 2)];
  }

  const jx = ctx.x + Math.floor((meso - 0.5) * 6);
  const jy = ctx.y + Math.floor((macro - 0.5) * 4);
  const cellX = Math.floor(jx / 13);
  const cellY = Math.floor(jy / 7);
  // Mortar lines along flagstone cell borders, offset per stone so the coursing
  // never reads as a regular lattice.
  const offsetX = latticeUnit(cellX, cellY, ctx.seeds.structure) * 4;
  const offsetY = latticeUnit(cellY, cellX, ctx.seeds.structure) * 3;
  const lx = (jx + offsetX) % 13;
  const ly = (jy + offsetY) % 7;
  if (lx < 1 || ly < 1) return path[1];

  const wear = clamp01(1 - distNonPath / 9);
  const shade = clamp01(0.52 + macro * 0.32 + wear * 0.28);
  let color = path[2 + Math.round(shade * 2)];
  const fleck = latticeUnit(cellX * 3 + 1, cellY * 5 + 2, ctx.seeds.detail);
  if (fleck < 0.03 && micro > 0.6) {
    color = path[4]; // sunlit embedded pebble
  } else if (fleck > 0.985) {
    color = path[0]; // worn pit
  }
  return color;
}

function waterColor(ctx) {
  const { roles, meso, micro, distNonWater } = ctx;
  const pond = roles.pond;
  const depth = clamp01(distNonWater / 34);
  // Quantized depth bands, dithered at their borders so the pond reads as
  // stepped pixel water rather than a topographic contour diagram. The ripple
  // term keeps the surface continuous across logical tile boundaries.
  const ripple = valueNoise(ctx.x, ctx.y, 1 / 11, ctx.seeds.material);
  const banded = depth * 5 + (meso - 0.5) * 1.2 + (ripple - 0.5) * 0.7;
  const idx = Math.max(0, Math.min(3, 3 - Math.floor(clamp01(banded / 5) * 4)));
  let color = pond[idx];

  const glint = roles.magicCyan;
  // Thin horizontal ripple dashes (vertical coordinate compressed).
  const streak = valueNoise(ctx.x, ctx.y * 3, 1 / 15, ctx.seeds.detail);
  if (depth > 0.3 && streak > 0.88 && micro > 0.4) {
    color = glint[0];
  } else if (distNonWater <= 1 && meso > 0.45 && hash32(ctx.x, ctx.y, ctx.seeds.structure) % 4 === 0) {
    color = glint[1]; // broken foam crest
  } else if (depth < 0.18 && meso < 0.22 && micro > 0.75) {
    color = pond[0]; // submerged stone shadow
  }
  return color;
}

function cliffColor(ctx) {
  const { roles, macro, meso, micro } = ctx;
  const cliff = roles.cliff;
  const localY = ctx.localY;

  if (localY >= TILE_HEIGHT) {
    // Extruded flank: south-west face catches the key light, south-east falls away.
    const litFace = ctx.localX < HALF_WIDTH;
    const vertical = clamp01((localY - TILE_HEIGHT) / 16);
    // Horizontal sediment strata lines, not random speckle.
    if ((ctx.y + (litFace ? 0 : 2)) % 6 === 0) return cliff[1];
    const shade = clamp01((litFace ? 0.72 : 0.32) - vertical * 0.3 + (macro - 0.5) * 0.15);
    let color = cliff[2 + Math.round(shade * (cliff.length - 3))];
    if (localY <= TILE_HEIGHT + 2 && meso > 0.5 && hash32(ctx.x, ctx.y, ctx.seeds.detail) % 3 === 0) {
      color = roles.foliage[2]; // moss creeping over the lip
    }
    return color;
  }

  if ((ctx.y % 7) === 0) return cliff[1];
  if (meso > 0.8 && micro > 0.6) return roles.foliage[3];
  const shade = clamp01(0.4 + macro * 0.3 + ctx.northwestLight);
  return cliff[2 + Math.round(shade * (cliff.length - 3))];
}

function sanctuaryColor(ctx) {
  const { roles, macro, meso, micro, distNonSanctuary } = ctx;
  const path = roles.path;
  if (distNonSanctuary <= 2 && meso > 0.55) return roles.verge[2 + Math.round(macro * 2)];
  const cellX = Math.floor((ctx.x + (meso - 0.5) * 4) / 16);
  const cellY = Math.floor((ctx.y + (macro - 0.5) * 3) / 8);
  if (latticeUnit(cellX, cellY, ctx.seeds.material) < 0.1) return path[1];
  if (meso > 0.85 && micro > 0.7) return roles.foliage[2];
  const shade = clamp01(0.45 + macro * 0.3 + meso * 0.2);
  return path[2 + Math.round(shade * 2)];
}

function soilColor(ctx) {
  const { roles, macro, meso, micro, distNonSoil } = ctx;
  const soil = roles.soil;
  if (distNonSoil <= 1 || (distNonSoil <= 3 && meso > 0.4)) {
    return roles.meadow[2 + Math.round(macro * 2)];
  }
  if ((ctx.y % 5) === 0) return soil[1]; // planted furrow rows
  const shade = clamp01(0.25 + macro * 0.45 + meso * 0.2);
  let color = soil[rampIndex(soil, shade)];
  if (micro > 0.92 && meso > 0.6) color = roles.path[2]; // turned stone fleck
  return color;
}

const MATERIAL_GRAMMAR = Object.freeze({
  grass_quiet: grassQuietColor,
  grass_edge: grassEdgeColor,
  path_flagstone: pathColor,
  water_pond: waterColor,
  cliff_stone: cliffColor,
  soil_garden: soilColor,
  sanctuary_stone: sanctuaryColor,
});

/**
 * Apply palette, light, and material detail to a previously compiled form.
 */
export function realizeTileForgeRegion(form, regionSpec) {
  if (!form || form.contract !== TILE_FORGE_REGION_FORM_CONTRACT) {
    throw new TypeError('PB-TFR-REALIZE-001 expected a PB-TILE-FORGE-REGION-FORM-v1 form');
  }

  const family = TILE_FORGE_PALETTE_FAMILIES[regionSpec.paletteFamily];
  if (!family?.roles) {
    throw new TypeError(`PB-TFR-REALIZE-002 palette lacks region roles: ${String(regionSpec.paletteFamily)}`);
  }

  const seeds = deriveSubStreamSeeds(regionSpec.seed);
  const { width, height } = form;
  const data = new Uint8ClampedArray(width * height * 4);
  const roles = toRgbRoles(family.roles);

  const worldX = regionSpec.worldX ?? 0;
  const worldY = regionSpec.worldY ?? 0;
  const baseX = worldX * TILE_WIDTH;
  const baseY = worldY * TILE_HEIGHT;

  // Scene-scale clustered fields (sampled nearest-neighbour for pixel clusters).
  const macroField = buildClusterField(width, height, 6, 1 / 96, seeds.structure, 2);
  const mesoField = buildClusterField(width, height, 3, 1 / 26, seeds.material, 2);

  // Neighbourhood distance fields for moisture, wear, and shoreline blending.
  const waterMask = form.materialMasks.water_pond;
  const pathMask = form.materialMasks.path_flagstone;
  const soilMask = form.materialMasks.soil_garden;
  const sanctuaryMask = form.materialMasks.sanctuary_stone;

  const waterBounds = maskBounds(width, height, waterMask);
  const pathBounds = maskBounds(width, height, pathMask);
  const soilBounds = maskBounds(width, height, soilMask);
  const sanctuaryBounds = maskBounds(width, height, sanctuaryMask);

  const distWater = waterBounds
    ? chamferBounded(width, height, (i) => waterMask[i] === 1, clampBounds(width, height, waterBounds, 8), 7)
    : constantField(width, height, FAR);
  const distNonWater = waterBounds
    ? chamferBounded(width, height, (i) => waterMask[i] === 0, clampBounds(width, height, waterBounds, 2), 55)
    : constantField(width, height, FAR);
  const distPath = pathBounds
    ? chamferBounded(width, height, (i) => pathMask[i] === 1, clampBounds(width, height, pathBounds, 6), 5)
    : constantField(width, height, FAR);
  const distNonPath = pathBounds
    ? chamferBounded(width, height, (i) => pathMask[i] === 0, clampBounds(width, height, pathBounds, 2), 12)
    : constantField(width, height, FAR);
  const distNonSoil = soilBounds
    ? chamferBounded(width, height, (i) => soilMask[i] === 0, clampBounds(width, height, soilBounds, 5), 4)
    : constantField(width, height, FAR);
  const distNonSanctuary = sanctuaryBounds
    ? chamferBounded(width, height, (i) => sanctuaryMask[i] === 0, clampBounds(width, height, sanctuaryBounds, 3), 3)
    : constantField(width, height, FAR);

  const canopyShadows = (regionSpec.regions?.canopyShadows || [])
    .map((shadow) => {
      const anchor = form.cellAnchors[`${shadow.tx},${shadow.ty}`];
      if (!anchor) return null;
      return {
        x: anchor.x + HALF_WIDTH + (shadow.ox ?? 0),
        y: anchor.y + TILE_HEIGHT / 2 + (shadow.oy ?? 0) - anchor.elevation * 0,
        rx: shadow.rx,
        ry: shadow.ry,
        strength: shadow.strength,
      };
    })
    .filter(Boolean);
  const canopyShade = buildCanopyShadeField(width, height, canopyShadows);

  // Owner cell anchors let cliff flanks know which face they belong to.
  const cells = regionSpec.cells;
  const anchorX = new Float64Array(cells.length);
  const anchorY = new Float64Array(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const anchor = form.cellAnchors[`${cells[index].tx},${cells[index].ty}`];
    anchorX[index] = anchor ? anchor.x : 0;
    anchorY[index] = anchor ? anchor.y : 0;
  }

  for (let y = 0; y < height; y += 1) {
    const { first, last } = form.rowSpans[y];
    if (first === -1) continue;
    const rowOffset = y * width;
    for (let x = first; x <= last; x += 1) {
      const pixelIndex = rowOffset + x;
      if (form.alphaMask[pixelIndex] === 0) continue;
      const materialIndex = form.materialIndexMask[pixelIndex];
      const material = MATERIAL_ORDER[materialIndex];
      const grammar = MATERIAL_GRAMMAR[material];
      const owner = form.ownerIndexMask[pixelIndex];
      const ox = owner >= 0 ? anchorX[owner] : 0;
      const oy = owner >= 0 ? anchorY[owner] : 0;

      const color = grammar({
        roles,
        seeds,
        x: baseX + x,
        y: baseY + y,
        localX: x - ox,
        localY: y - oy,
        macro: macroField.at(x, y),
        meso: mesoField.at(x, y),
        micro: unitHash(x, y, seeds.detail),
        canopy: canopyShade[pixelIndex] / 255,
        distWater: distWater[pixelIndex],
        distNonWater: distNonWater[pixelIndex],
        distPath: distPath[pixelIndex],
        distNonPath: distNonPath[pixelIndex],
        distNonSoil: distNonSoil[pixelIndex],
        distNonSanctuary: distNonSanctuary[pixelIndex],
        edge: isMaterialEdge(form, x, y, materialIndex),
        northwestLight: ((1 - x / Math.max(1, width - 1)) * 0.06)
          + ((1 - y / Math.max(1, height - 1)) * 0.08),
      });

      writeRgb(data, pixelIndex, color);
    }
  }

  const realizationHash = `tfr-${fnv1aBytes(data, `${form.formHash}:${regionSpec.seed}`)}`;
  const palette = getTileForgePaletteColors(family);
  const textureKey = `tileforge-region-${regionSpec.regionKey}-${regionSpec.seed}`;
  const witness = Object.freeze({
    contract: TILE_FORGE_REGION_ASSET_CONTRACT,
    regionKey: regionSpec.regionKey,
    seed: regionSpec.seed,
    formHash: form.formHash,
    realizationHash,
    paletteFamily: regionSpec.paletteFamily,
    paletteColorCount: palette.length,
    worldX,
    worldY,
  });

  return Object.freeze({
    contract: TILE_FORGE_REGION_ASSET_CONTRACT,
    width,
    height,
    originX: form.originX,
    originY: form.originY,
    worldX,
    worldY,
    data,
    form,
    formHash: form.formHash,
    realizationHash,
    paletteFamily: regionSpec.paletteFamily,
    palette,
    paletteRoles: family.roles,
    textureKey,
    witness,
  });
}

/**
 * Compile form and realization in one deterministic public operation.
 */
export function synthesizeTileForgeRegion(regionSpec) {
  return realizeTileForgeRegion(buildTileForgeRegionForm(regionSpec), regionSpec);
}

/**
 * Computes deterministic world sorting and exposed flank occlusion (TIL-10).
 * South flanks are hidden when the adjacent south neighbor is at equal or higher elevation.
 *
 * @param {Array<Object>} tiles
 * @returns {Array<Object>}
 */
export function computeWorldOcclusionAndSorting(tiles = []) {
  const elevationMap = new Map();
  for (const t of tiles) {
    const wx = t.worldX ?? 0;
    const wy = t.worldY ?? 0;
    elevationMap.set(`${wx},${wy}`, t.elevation ?? t.elevationUnits ?? 0);
  }

  return tiles.map((t) => {
    const wx = t.worldX ?? 0;
    const wy = t.worldY ?? 0;
    const elev = t.elevation ?? t.elevationUnits ?? 0;
    const southElev = elevationMap.get(`${wx},${wy + 1}`);
    const southFlankOccluded = southElev !== undefined && southElev >= elev;
    const sortOrder = (wy * 1000 + wx) * 100 + elev;

    return {
      ...t,
      southFlankOccluded,
      sortOrder,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}
