/**
 * Geometry-only Tile Forge region pass.
 *
 * This module may classify materials, but it must never import or select color.
 */

import {
  TILE_FORGE_REGION_CONTRACT,
  TILE_FORGE_REGION_MATERIALS,
} from './tile-forge.region-spec.js';

export const TILE_FORGE_REGION_FORM_CONTRACT = 'PB-TILE-FORGE-REGION-FORM-v1';

const TILE_WIDTH = 80;
const TILE_HEIGHT = 40;
const HALF_WIDTH = TILE_WIDTH / 2;
const HALF_HEIGHT = TILE_HEIGHT / 2;
const ELEVATION_STEP = 16;

function fnv1a32(value) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Return the top-left raster anchor of one 80×40 isometric cell.
 */
export function projectRegionCell(tx, ty, elevation = 0, gridHeight = 1) {
  return Object.freeze({
    x: (tx - ty + gridHeight - 1) * HALF_WIDTH,
    y: (tx + ty) * HALF_HEIGHT - elevation * ELEVATION_STEP,
    elevation,
  });
}

function boundaryKind(left, right) {
  if (left.elevation !== right.elevation) return 'cliff_face';
  if (left.material === 'water_pond' || right.material === 'water_pond') return 'shore';
  if (left.material === 'path_flagstone' || right.material === 'path_flagstone') return 'path_verge';
  return 'material_transition';
}

function collectBoundaries(spec, cellsByCoordinate) {
  const boundaries = [];
  const directions = Object.freeze([
    Object.freeze({ dx: 1, dy: 0, side: 'east' }),
    Object.freeze({ dx: 0, dy: 1, side: 'south' }),
  ]);

  for (const cell of spec.cells) {
    for (const direction of directions) {
      const neighbor = cellsByCoordinate.get(`${cell.tx + direction.dx},${cell.ty + direction.dy}`);
      if (!neighbor) continue;
      if (cell.material === neighbor.material && cell.elevation === neighbor.elevation) continue;
      boundaries.push(Object.freeze({
        from: `${cell.tx},${cell.ty}`,
        to: `${neighbor.tx},${neighbor.ty}`,
        side: direction.side,
        kind: boundaryKind(cell, neighbor),
      }));
    }
  }

  return Object.freeze(boundaries);
}

function paintDiamond({ formWidth, anchor, alphaMask, elevationMask, materialMasks, material, elevation }) {
  for (let localY = 0; localY < TILE_HEIGHT; localY += 1) {
    const normalizedY = Math.abs(localY + 0.5 - HALF_HEIGHT) / HALF_HEIGHT;
    for (let localX = 0; localX < TILE_WIDTH; localX += 1) {
      const normalizedX = Math.abs(localX + 0.5 - HALF_WIDTH) / HALF_WIDTH;
      if (normalizedX + normalizedY > 1) continue;

      const x = anchor.x + localX;
      const y = anchor.y + localY;
      const pixelIndex = y * formWidth + x;
      alphaMask[pixelIndex] = 1;
      elevationMask[pixelIndex] = elevation;
      for (const mask of Object.values(materialMasks)) mask[pixelIndex] = 0;
      materialMasks[material][pixelIndex] = 1;
    }
  }
}

/**
 * Compile an immutable region spec into projected occupancy and topology masks.
 */
export function buildTileForgeRegionForm(spec) {
  if (!spec || spec.contract !== TILE_FORGE_REGION_CONTRACT) {
    throw new TypeError('PB-TFR-FORM-001 expected a validated PB-TILE-FORGE-REGION-v1 spec');
  }

  const provisionalAnchors = spec.cells.map((cell) => ({
    key: `${cell.tx},${cell.ty}`,
    cell,
    anchor: projectRegionCell(cell.tx, cell.ty, cell.elevation, spec.gridHeight),
  }));
  const minimumY = Math.min(...provisionalAnchors.map(({ anchor }) => anchor.y));
  const maximumY = Math.max(...provisionalAnchors.map(({ anchor }) => anchor.y + TILE_HEIGHT));
  const width = (spec.gridWidth + spec.gridHeight) * HALF_WIDTH;
  const height = maximumY - minimumY;
  const pixelCount = width * height;
  const alphaMask = new Uint8Array(pixelCount);
  const elevationMask = new Int16Array(pixelCount);
  elevationMask.fill(-1);
  const materialMasks = Object.fromEntries(TILE_FORGE_REGION_MATERIALS.map((material) => (
    [material, new Uint8Array(pixelCount)]
  )));
  const cellAnchors = {};

  for (const { key, cell, anchor } of provisionalAnchors) {
    const normalizedAnchor = Object.freeze({
      x: anchor.x,
      y: anchor.y - minimumY,
      elevation: anchor.elevation,
    });
    cellAnchors[key] = normalizedAnchor;
    paintDiamond({
      formWidth: width,
      anchor: normalizedAnchor,
      alphaMask,
      elevationMask,
      materialMasks,
      material: cell.material,
      elevation: cell.elevation,
    });
  }

  const cellsByCoordinate = new Map(spec.cells.map((cell) => [`${cell.tx},${cell.ty}`, cell]));
  const boundaries = collectBoundaries(spec, cellsByCoordinate);
  const formIdentity = {
    gridWidth: spec.gridWidth,
    gridHeight: spec.gridHeight,
    tileWidth: spec.tileWidth,
    tileHeight: spec.tileHeight,
    cells: spec.cells.map(({ tx, ty, elevation, material, tags }) => ({ tx, ty, elevation, material, tags })),
    boundaries,
  };

  return Object.freeze({
    contract: TILE_FORGE_REGION_FORM_CONTRACT,
    width,
    height,
    originX: -spec.gridHeight * HALF_WIDTH,
    originY: minimumY - HALF_HEIGHT,
    alphaMask,
    elevationMask,
    materialMasks: Object.freeze(materialMasks),
    cellAnchors: Object.freeze(cellAnchors),
    boundaries,
    formHash: `tff-${fnv1a32(JSON.stringify(formIdentity))}`,
  });
}
