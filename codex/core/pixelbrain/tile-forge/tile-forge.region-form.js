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
const EMPTY_MATERIAL_INDEX = 255;
const MATERIAL_INDEX = Object.freeze(Object.fromEntries(
  TILE_FORGE_REGION_MATERIALS.map((material, index) => [material, index]),
));

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

function paintDiamond({
  formWidth,
  anchor,
  alphaMask,
  elevationMask,
  materialIndexMask,
  materialMasks,
  ownerIndexMask,
  owner,
  offsetY = 0,
  material,
  elevation,
}) {
  const materialIndex = MATERIAL_INDEX[material];
  for (let localY = 0; localY < TILE_HEIGHT; localY += 1) {
    const normalizedY = Math.abs(localY + 0.5 - HALF_HEIGHT) / HALF_HEIGHT;
    for (let localX = 0; localX < TILE_WIDTH; localX += 1) {
      const normalizedX = Math.abs(localX + 0.5 - HALF_WIDTH) / HALF_WIDTH;
      if (normalizedX + normalizedY > 1) continue;

      const x = anchor.x + localX;
      const y = anchor.y + offsetY + localY;
      const pixelIndex = y * formWidth + x;
      const previousMaterialIndex = materialIndexMask[pixelIndex];
      alphaMask[pixelIndex] = 1;
      elevationMask[pixelIndex] = elevation;
      if (previousMaterialIndex !== EMPTY_MATERIAL_INDEX && previousMaterialIndex !== materialIndex) {
        materialMasks[TILE_FORGE_REGION_MATERIALS[previousMaterialIndex]][pixelIndex] = 0;
      }
      materialIndexMask[pixelIndex] = materialIndex;
      materialMasks[material][pixelIndex] = 1;
      ownerIndexMask[pixelIndex] = owner;
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

  const provisionalAnchors = spec.cells.map((cell, index) => ({
    key: `${cell.tx},${cell.ty}`,
    cell,
    index,
    anchor: projectRegionCell(cell.tx, cell.ty, cell.elevation, spec.gridHeight),
  }));
  const minimumY = Math.min(...provisionalAnchors.map(({ anchor }) => anchor.y));
  // Elevated cells extrude a cliff skirt downward; reserve that band so the
  // projected fabric never leaves a transparent crack beneath a raised tier.
  const maximumElevation = provisionalAnchors.reduce(
    (maximum, entry) => Math.max(maximum, entry.cell.elevation),
    0,
  );
  const maximumY = Math.max(...provisionalAnchors.map(({ anchor }) => (
    anchor.y + TILE_HEIGHT + anchor.elevation * ELEVATION_STEP
  )));
  const width = (spec.gridWidth + spec.gridHeight) * HALF_WIDTH;
  const height = maximumY - minimumY;
  const pixelCount = width * height;
  const alphaMask = new Uint8Array(pixelCount);
  const elevationMask = new Int16Array(pixelCount);
  elevationMask.fill(-1);
  const materialIndexMask = new Uint8Array(pixelCount);
  materialIndexMask.fill(EMPTY_MATERIAL_INDEX);
  const ownerIndexMask = new Int32Array(pixelCount);
  ownerIndexMask.fill(-1);
  const materialMasks = Object.fromEntries(TILE_FORGE_REGION_MATERIALS.map((material) => (
    [material, new Uint8Array(pixelCount)]
  )));
  const cellAnchors = {};

  for (const { key, cell, anchor } of provisionalAnchors) {
    cellAnchors[key] = Object.freeze({
      x: anchor.x,
      y: anchor.y - minimumY,
      elevation: anchor.elevation,
    });
  }

  const paintArgs = {
    formWidth: width,
    alphaMask,
    elevationMask,
    materialIndexMask,
    materialMasks,
    ownerIndexMask,
  };

  // Pass 1 — cliff skirts: extrude every raised cell downward so its exposed
  // south-east / south-west flanks read as solid stone instead of empty sky.
  // Lower-elevation neighbours repaint over the hidden portion in pass 2.
  for (const { cell, index, anchor } of provisionalAnchors) {
    if (cell.elevation <= 0) continue;
    const skirtAnchor = Object.freeze({
      x: anchor.x,
      y: anchor.y - minimumY,
      elevation: cell.elevation,
    });
    for (let drop = cell.elevation * ELEVATION_STEP; drop >= 1; drop -= 1) {
      paintDiamond({
        ...paintArgs,
        anchor: skirtAnchor,
        offsetY: drop,
        owner: index,
        material: 'cliff_stone',
        elevation: cell.elevation,
      });
    }
  }

  // Pass 2 — top planes, painter order back-to-front so nearer cells occlude.
  for (const { key, cell, index, anchor } of provisionalAnchors) {
    paintDiamond({
      ...paintArgs,
      anchor: cellAnchors[key],
      owner: index,
      material: cell.material,
      elevation: cell.elevation,
    });
  }

  void maximumElevation;

  const cellsByCoordinate = new Map(spec.cells.map((cell) => [`${cell.tx},${cell.ty}`, cell]));
  const boundaries = collectBoundaries(spec, cellsByCoordinate);
  const rowSpans = Object.freeze(Array.from({ length: height }, (_, y) => {
    const rowOffset = y * width;
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x += 1) {
      if (alphaMask[rowOffset + x] === 0) continue;
      if (first === -1) first = x;
      last = x;
    }
    return Object.freeze({ first, last });
  }));
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
    materialIndexMask,
    ownerIndexMask,
    materialMasks: Object.freeze(materialMasks),
    materialOrder: TILE_FORGE_REGION_MATERIALS,
    rowSpans,
    cellAnchors: Object.freeze(cellAnchors),
    boundaries,
    formHash: `tff-${fnv1a32(JSON.stringify(formIdentity))}`,
  });
}
