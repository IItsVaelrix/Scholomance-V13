/**
 * Tile Forge region input contract.
 *
 * A region spec is the deterministic, game-agnostic input for continuous
 * isometric substrate synthesis. It deliberately contains no render colors.
 */

export const TILE_FORGE_REGION_CONTRACT = 'PB-TILE-FORGE-REGION-v1';
export const TILE_FORGE_REGION_MAX_CELLS = 4096;
export const TILE_FORGE_REGION_MAX_PIXELS = 2048;

export const TILE_FORGE_REGION_MATERIALS = Object.freeze([
  'grass_quiet',
  'grass_edge',
  'path_flagstone',
  'water_pond',
  'cliff_stone',
  'soil_garden',
  'sanctuary_stone',
]);

const MATERIAL_SET = new Set(TILE_FORGE_REGION_MATERIALS);
const TILE_WIDTH = 80;
const TILE_HEIGHT = 40;

function diagnostic(code, message, path = '') {
  return Object.freeze({ code, message, path });
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function canonicalTags(tags) {
  if (!Array.isArray(tags)) return Object.freeze([]);
  return Object.freeze([...new Set(tags.filter((tag) => typeof tag === 'string'))].sort());
}

function canonicalCell(cell) {
  return Object.freeze({
    tx: cell.tx,
    ty: cell.ty,
    elevation: cell.elevation ?? 0,
    material: cell.material,
    tags: canonicalTags(cell.tags),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fnv1a32(value) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function projectedDimensions(gridWidth, gridHeight, cells) {
  const maximumElevation = cells.reduce((maximum, cell) => (
    Number.isInteger(cell?.elevation) ? Math.max(maximum, cell.elevation) : maximum
  ), 0);
  return {
    width: (gridWidth + gridHeight) * (TILE_WIDTH / 2),
    height: ((gridWidth + gridHeight - 1) * (TILE_HEIGHT / 2))
      + TILE_HEIGHT
      + maximumElevation * 16,
  };
}

/**
 * Validate without throwing so callers can surface all input defects together.
 */
export function validateTileForgeRegionSpec(input) {
  const diagnostics = [];
  const source = input && typeof input === 'object' ? input : {};
  const cells = Array.isArray(source.cells) ? source.cells : [];

  if (typeof source.id !== 'string' || source.id.trim().length === 0) {
    diagnostics.push(diagnostic('PB-TFR-001', 'id must be a non-empty string', 'id'));
  }

  if (!isPositiveInteger(source.gridWidth) || !isPositiveInteger(source.gridHeight)) {
    diagnostics.push(diagnostic('PB-TFR-002', 'grid dimensions must be positive integers', 'grid'));
  }

  if (!Number.isInteger(source.seed) || source.seed < 0 || source.seed > 0xFFFFFFFF) {
    diagnostics.push(diagnostic('PB-TFR-009', 'seed must be an unsigned 32-bit integer', 'seed'));
  }

  if (isPositiveInteger(source.gridWidth) && isPositiveInteger(source.gridHeight)) {
    const cellCapacity = source.gridWidth * source.gridHeight;
    const dimensions = projectedDimensions(source.gridWidth, source.gridHeight, cells);
    if (
      cellCapacity > TILE_FORGE_REGION_MAX_CELLS
      || dimensions.width > TILE_FORGE_REGION_MAX_PIXELS
      || dimensions.height > TILE_FORGE_REGION_MAX_PIXELS
    ) {
      diagnostics.push(diagnostic(
        'PB-TFR-003',
        `region exceeds ${TILE_FORGE_REGION_MAX_CELLS} cells or ${TILE_FORGE_REGION_MAX_PIXELS}px`,
        'grid',
      ));
    }
  }

  const coordinates = new Set();
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const path = `cells[${index}]`;
    if (
      !cell
      || !Number.isInteger(cell.tx)
      || !Number.isInteger(cell.ty)
      || !Number.isInteger(cell.elevation ?? 0)
      || (cell.elevation ?? 0) < 0
    ) {
      diagnostics.push(diagnostic('PB-TFR-006', 'cell coordinates and elevation must be non-negative integers', path));
      continue;
    }

    if (
      isPositiveInteger(source.gridWidth)
      && isPositiveInteger(source.gridHeight)
      && (cell.tx < 0 || cell.ty < 0 || cell.tx >= source.gridWidth || cell.ty >= source.gridHeight)
    ) {
      diagnostics.push(diagnostic('PB-TFR-004', 'cell coordinate is outside the region grid', path));
    }

    if (!MATERIAL_SET.has(cell.material)) {
      diagnostics.push(diagnostic('PB-TFR-005', `unknown material: ${String(cell.material)}`, `${path}.material`));
    }

    const coordinateKey = `${cell.tx},${cell.ty}`;
    if (coordinates.has(coordinateKey)) {
      diagnostics.push(diagnostic('PB-TFR-008', `duplicate cell coordinate: ${coordinateKey}`, path));
    }
    coordinates.add(coordinateKey);
  }

  if (
    isPositiveInteger(source.gridWidth)
    && isPositiveInteger(source.gridHeight)
    && cells.length !== source.gridWidth * source.gridHeight
  ) {
    diagnostics.push(diagnostic(
      'PB-TFR-007',
      `region requires ${source.gridWidth * source.gridHeight} cells, received ${cells.length}`,
      'cells',
    ));
  }

  return Object.freeze({ ok: diagnostics.length === 0, diagnostics: Object.freeze(diagnostics) });
}

/**
 * Normalize, freeze, and identify a valid region input.
 */
export function createTileForgeRegionSpec(input) {
  const validation = validateTileForgeRegionSpec(input);
  if (!validation.ok) {
    const error = new TypeError(validation.diagnostics.map(({ code }) => code).join(' '));
    error.diagnostics = validation.diagnostics;
    throw error;
  }

  const cells = Object.freeze(input.cells
    .map(canonicalCell)
    .sort((left, right) => (left.ty - right.ty) || (left.tx - right.tx)));
  const regions = deepFreeze(structuredClone(input.regions ?? {}));
  const normalized = {
    contract: TILE_FORGE_REGION_CONTRACT,
    id: input.id.trim(),
    seed: input.seed >>> 0,
    gridWidth: input.gridWidth,
    gridHeight: input.gridHeight,
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    paletteFamily: input.paletteFamily ?? 'scholomance_sunlit_glade',
    cells,
    regions,
  };
  const regionKey = `tfr-${fnv1a32(JSON.stringify(normalized))}`;

  return deepFreeze({ ...normalized, regionKey });
}
