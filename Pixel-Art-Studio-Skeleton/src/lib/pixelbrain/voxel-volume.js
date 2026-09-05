export const ENERGY_TYPES = Object.freeze({
  RESONANT:   0,
  PHOTONIC:   1,
  STRUCTURAL: 2,
  THERMAL:    3,
  KINETIC:    4,
  ENTROPIC:   5,
  SHIELDING:  6,
  RADIANT:    7,
});

export const SENTINEL_MATERIAL_ID = 1;

export function createVoxelVolume(width, height, depth) {
  if (!Number.isInteger(width)) {
    throw new TypeError(`width must be a positive integer, got ${width}`);
  }
  if (width <= 0) {
    throw new RangeError(`width must be positive, got ${width}`);
  }
  if (!Number.isInteger(height)) {
    throw new TypeError(`height must be a positive integer, got ${height}`);
  }
  if (height <= 0) {
    throw new RangeError(`height must be positive, got ${height}`);
  }
  if (!Number.isInteger(depth)) {
    throw new TypeError(`depth must be a positive integer, got ${depth}`);
  }
  if (depth <= 0) {
    throw new RangeError(`depth must be positive, got ${depth}`);
  }

  const totalCells = width * height * depth;

  return {
    width,
    height,
    depth,
    cells: new Uint16Array(totalCells),
    energyField: new Float32Array(totalCells),
    energyTypes: new Uint8Array(totalCells),
    tags: new Map(),
  };
}

export function cellIndex(vol, x, y, z) {
  return y * vol.width * vol.depth + z * vol.width + x;
}

export function getCellMaterialId(vol, x, y, z) {
  const i = cellIndex(vol, x, y, z);
  return vol.cells[i] >> 4;
}

export function isCellOccupied(vol, x, y, z) {
  return getCellMaterialId(vol, x, y, z) > 0;
}

export function setCellMaterial(vol, x, y, z, materialId) {
  if (materialId < 0 || materialId > 4095) {
    throw new RangeError(`materialId must be 0–4095, got ${materialId}`);
  }
  const i = cellIndex(vol, x, y, z);
  const flags = vol.cells[i] & 0xF;
  vol.cells[i] = (materialId << 4) | flags;
}

export function setCellOccupancy(vol, x, y, z, occupied) {
  const i = cellIndex(vol, x, y, z);

  if (occupied) {
    const currentMaterialId = getCellMaterialId(vol, x, y, z);
    if (currentMaterialId === 0) {
      const flags = vol.cells[i] & 0xF;
      vol.cells[i] = (SENTINEL_MATERIAL_ID << 4) | flags;
    }
  } else {
    const flags = vol.cells[i] & 0xF;
    vol.cells[i] = flags;
  }
}
