/**
 * Continuous Tile Forge region realization.
 *
 * Form is compiled once, then colored with region-space fields so texture does
 * not restart at logical tile boundaries.
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

function hash32(x, y, seed) {
  let value = (seed ^ Math.imul(x, 0x1F123BB5) ^ Math.imul(y, 0x5F356495)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45D9F3B) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45D9F3B) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function unitHash(x, y, seed) {
  return hash32(x, y, seed) / 0xFFFFFFFF;
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

function selectRampIndex(length, shade) {
  return Math.max(0, Math.min(length - 1, Math.floor(shade * length)));
}

function colorForMaterial({ material, roles, x, y, width, height, seeds, edge }) {
  const macro = unitHash(x >> 5, y >> 4, seeds.structure);
  const materialNoise = unitHash(x >> 4, y >> 3, seeds.material);
  const detail = unitHash(x, y, seeds.detail);
  const northwestLight = ((1 - x / Math.max(1, width - 1)) * 0.08)
    + ((1 - y / Math.max(1, height - 1)) * 0.12);

  if (material === 'grass_quiet') {
    const quietRamp = roles.meadow.slice(2, 5);
    const shade = 0.36 + macro * 0.34 + northwestLight;
    return quietRamp[selectRampIndex(quietRamp.length, shade)];
  }

  if (material === 'grass_edge') {
    if (!edge && detail > 0.982) return roles.flower[hash32(x, y, seeds.detail) % roles.flower.length];
    const shade = 0.12 + macro * 0.56 + materialNoise * 0.16 + northwestLight;
    return roles.verge[selectRampIndex(roles.verge.length, shade)];
  }

  if (material === 'path_flagstone') {
    if (edge) return roles.path[0];
    const joint = hash32(Math.floor(x / 7), Math.floor(y / 4), seeds.material) % 17 === 0;
    if (joint) return roles.path[1];
    const shade = 0.2 + macro * 0.46 + materialNoise * 0.18 + northwestLight;
    return roles.path[selectRampIndex(roles.path.length, shade)];
  }

  if (material === 'water_pond') {
    if (edge) return roles.pond.at(-1);
    const ripple = hash32(Math.floor(x / 5), Math.floor(y / 2), seeds.material) % 13 === 0;
    const shade = 0.12 + macro * 0.42 + materialNoise * 0.22 + northwestLight;
    const index = ripple
      ? Math.min(roles.pond.length - 1, selectRampIndex(roles.pond.length, shade) + 1)
      : selectRampIndex(roles.pond.length, shade);
    return roles.pond[index];
  }

  if (material === 'cliff_stone') {
    const strata = hash32(Math.floor(x / 11), Math.floor(y / 3), seeds.material) % 9 === 0;
    if (strata) return roles.cliff[0];
    const shade = 0.08 + macro * 0.38 + northwestLight;
    return roles.cliff[selectRampIndex(roles.cliff.length, shade)];
  }

  if (material === 'soil_garden') {
    const furrow = hash32(Math.floor(x / 9), Math.floor(y / 3), seeds.material) % 11 === 0;
    if (furrow) return roles.ink[1];
    return roles.soil[selectRampIndex(roles.soil.length, 0.16 + macro * 0.62 + northwestLight)];
  }

  if (edge) return roles.path[1];
  const sanctuaryShade = 0.35 + macro * 0.35 + northwestLight;
  const sanctuaryIndex = Math.max(1, selectRampIndex(roles.path.length, sanctuaryShade));
  return roles.path[sanctuaryIndex];
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
  const data = new Uint8ClampedArray(form.width * form.height * 4);
  const rgbRoles = toRgbRoles(family.roles);

  for (let y = 0; y < form.height; y += 1) {
    const { first, last } = form.rowSpans[y];
    if (first === -1) continue;
    for (let x = first; x <= last; x += 1) {
      const pixelIndex = y * form.width + x;
      if (form.alphaMask[pixelIndex] === 0) continue;
      const materialIndex = form.materialIndexMask[pixelIndex];
      const material = MATERIAL_ORDER[materialIndex];
      const color = colorForMaterial({
        material,
        roles: rgbRoles,
        x,
        y,
        width: form.width,
        height: form.height,
        seeds,
        edge: isMaterialEdge(form, x, y, materialIndex),
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
  });

  return Object.freeze({
    contract: TILE_FORGE_REGION_ASSET_CONTRACT,
    width: form.width,
    height: form.height,
    originX: form.originX,
    originY: form.originY,
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
