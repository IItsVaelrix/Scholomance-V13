/**
 * TEMPLATE GRID ENGINE
 *
 * Provides Aseprite-style grid/template system for manual pixel art editing.
 * Supports multiple grid types, anchor points, symmetry, and onion skinning.
 */

import { GOLDEN_RATIO, roundTo } from './shared.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from './bytecode-error.js';
import { getMaterialDefinition } from './material-registry.js';


/**
 * Grid types
 */
export const GRID_TYPES = {
  RECTANGULAR: 'rectangular',
  ISOMETRIC: 'isometric',
  HEXAGONAL: 'hexagonal',
  CIRCULAR: 'circular',
  FIBONACCI: 'fibonacci',
};

const SQRT3 = Math.sqrt(3);

/**
 * Hexagonal lattice metrics (pointy-top, odd-r offset rows).
 *
 * Centres sit `cellSize` apart horizontally with odd rows shifted right by
 * half a cell; row pitch is cellSize·√3/2. A pointy-top hexagon of
 * circumradius cellSize/√3 tiles exactly that lattice, so snap, preview and
 * hit-testing all derive from these two numbers.
 */
function hexMetrics(cellSize) {
  return {
    rowPitch: cellSize * SQRT3 / 2,
    radius: cellSize / SQRT3,
  };
}

function hexRowOffset(row, cellSize) {
  return (((row % 2) + 2) % 2) * cellSize / 2;
}

function hexCenter(col, row, cellSize) {
  return {
    x: col * cellSize + hexRowOffset(row, cellSize),
    y: row * hexMetrics(cellSize).rowPitch,
  };
}

/**
 * Nearest hex centre to a point — the single authority every hexagonal
 * code path (snap, hit-test, fill) resolves through.
 */
function nearestHexCell(x, y, cellSize) {
  const { rowPitch } = hexMetrics(cellSize);
  const baseRow = Math.round(y / rowPitch);
  let best = null;

  for (let row = baseRow - 1; row <= baseRow + 1; row++) {
    const offset = hexRowOffset(row, cellSize);
    const col = Math.round((x - offset) / cellSize);
    const center = hexCenter(col, row, cellSize);
    const d = (x - center.x) ** 2 + (y - center.y) ** 2;
    if (!best || d < best.d) {
      best = { d, col, row, x: center.x, y: center.y };
    }
  }

  return best;
}

export const PIXELBRAIN_GRID_LIMITS = Object.freeze({
  safeWidth: 160,
  safeHeight: 144,
  warningWidth: 512,
  warningHeight: 512,
  hardMaxWidth: 1024,
  hardMaxHeight: 1024,
  maxCells: 1048576,
  maxFillCells: 262144,
  maxTraceCoordinates: 262144
});

export const ASEPRITE_IMPORT_LIMITS = Object.freeze({
  maxWidth: 512,
  maxHeight: 512,
  maxFrames: 256,
  maxLayers: 64,
  maxCells: 262144
});

/**
 * Create a new template grid
 *
 * @param {Object} options - Grid options
 * @returns {Object} Template grid object
 */
export function createTemplateGrid(options = {}) {
  const {
    width = 160,
    height = 144,
    cellSize = 8,
    gridType = GRID_TYPES.RECTANGULAR,
    snapStrength = 0.85,
  } = options;

  // Hard bounds check
  if (width > PIXELBRAIN_GRID_LIMITS.hardMaxWidth || height > PIXELBRAIN_GRID_LIMITS.hardMaxHeight) {
    throw new BytecodeError(
      ERROR_CATEGORIES.RANGE,
      ERROR_SEVERITY.FATAL,
      MODULE_IDS.TEMPLATE,
      ERROR_CODES.EXCEEDS_MAX,
      { width, height, limit: PIXELBRAIN_GRID_LIMITS.hardMaxWidth }
    );
  }

  // Calculate grid dimensions (hex rows are √3/2·cellSize apart)
  const rowPitch = gridType === GRID_TYPES.HEXAGONAL
    ? hexMetrics(cellSize).rowPitch
    : cellSize;
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / rowPitch);
  const cellCount = cols * rows;

  // Max cells check
  if (cellCount > PIXELBRAIN_GRID_LIMITS.maxCells) {
    throw new BytecodeError(
      ERROR_CATEGORIES.RANGE,
      ERROR_SEVERITY.FATAL,
      MODULE_IDS.TEMPLATE,
      ERROR_CODES.EXCEEDS_MAX,
      { cellCount, limit: PIXELBRAIN_GRID_LIMITS.maxCells }
    );
  }

  // Generate warning if over safe bounds
  const warnings = [];
  if (width > PIXELBRAIN_GRID_LIMITS.warningWidth || height > PIXELBRAIN_GRID_LIMITS.warningHeight) {
    warnings.push(`Grid dimensions exceed warning limits (${PIXELBRAIN_GRID_LIMITS.warningWidth}x${PIXELBRAIN_GRID_LIMITS.warningHeight})`);
  }

  // Generate anchor points
  const anchorPoints = generateDefaultAnchorPoints(width, height, gridType);

  // Generate symmetry axes
  const symmetryAxes = [];

  const grid = {
    width,
    height,
    cellSize,
    gridType,
    cols,
    rows,
    snapStrength,
    anchorPoints,
    symmetryAxes,
    layers: [],
    frames: [],
    currentFrame: 0,
    currentLayer: 0,
    warnings,
  };

  // Initialize with default frame and layer
  const firstFrame = createFrame();
  const firstLayer = createLayer('Base Layer');
  firstFrame.layers.push(firstLayer);
  grid.frames.push(firstFrame);
  grid.layers.push(firstLayer); // For convenience

  return grid;
}


/**
 * Generate default anchor points for a grid
 */
function generateDefaultAnchorPoints(width, height, gridType) {
  const anchors = [
    // Corners
    { x: 0, y: 0, label: 'topLeft', locked: false, visible: true },
    { x: width, y: 0, label: 'topRight', locked: false, visible: true },
    { x: 0, y: height, label: 'bottomLeft', locked: false, visible: true },
    { x: width, y: height, label: 'bottomRight', locked: false, visible: true },

    // Center
    { x: width / 2, y: height / 2, label: 'center', locked: true, visible: true },

    // Golden ratio point
    {
      x: width * (1 - 1 / GOLDEN_RATIO),
      y: height * (1 - 1 / GOLDEN_RATIO),
      label: 'goldenPoint',
      locked: true,
      visible: true,
    },
  ];

  // Add grid-type-specific anchors
  if (gridType === GRID_TYPES.ISOMETRIC) {
    anchors.push({
      x: width / 2,
      y: height * 0.3,
      label: 'isoTop',
      locked: false,
      visible: true,
    });
  }

  if (gridType === GRID_TYPES.HEXAGONAL) {
    anchors.push({
      x: width / 2,
      y: height * 0.25,
      label: 'hexTop',
      locked: false,
      visible: true,
    });
  }

  if (gridType === GRID_TYPES.FIBONACCI) {
    const fibPoints = generateFibonacciAnchors(width, height);
    anchors.push(...fibPoints);
  }

  return anchors;
}

/**
 * Generate recursive Fibonacci anchors for golden subdivision
 */
function generateFibonacciAnchors(width, height) {
  const points = [];
  let x = 0, y = 0, w = width, h = height;
  let side = 0; // 0: left, 1: bottom, 2: right, 3: top

  // Generate 7 levels of recursive subdivision
  for (let i = 0; i < 7; i++) {
    // Current subdivision square size based on golden ratio
    const size = side % 2 === 0 ? w / GOLDEN_RATIO : h / GOLDEN_RATIO;
    
    // Add anchor at the center of the current rectangle
    points.push({ 
      x: roundTo(x + w / 2, 1), 
      y: roundTo(y + h / 2, 1), 
      label: `phi_${i}`, 
      locked: false, 
      visible: true 
    });
    
    // Subdivide the rectangle
    if (side === 0) { x += size; w -= size; }
    else if (side === 1) { y += size; h -= size; }
    else if (side === 2) { w -= size; }
    else { h -= size; }
    side = (side + 1) % 4;
  }
  return points;
}

/**
 * Toggle a symmetry axis
 *
 * @param {Object} grid - Template grid
 * @param {string} axis - Axis to toggle (vertical, horizontal, diagonal)
 * @returns {Object} Updated grid
 */
export function toggleSymmetryAxis(grid, axis) {
  if (!grid.symmetryAxes) grid.symmetryAxes = [];

  const index = grid.symmetryAxes.indexOf(axis);
  if (index === -1) {
    grid.symmetryAxes.push(axis);
  } else {
    grid.symmetryAxes.splice(index, 1);
  }

  return grid;
}

/**
 * Generate recursive Fibonacci regions for golden subdivision
 *
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {Array} List of region boundaries and centroids
 */
export function getFibonacciRegions(width, height) {
  const regions = [];
  let x = 0, y = 0, w = width, h = height;
  let side = 0; // 0: left, 1: bottom, 2: right, 3: top

  // Generate 12 levels of recursive subdivision
  for (let i = 0; i < 12; i++) {
    const size = side % 2 === 0 ? w / GOLDEN_RATIO : h / GOLDEN_RATIO;
    let rx = x, ry = y, rw = w, rh = h;
    if (side === 0) { rw = size; }
    else if (side === 1) { rh = size; }
    else if (side === 2) { rx = x + w - size; rw = size; }
    else { ry = y + h - size; rh = size; }

    regions.push({
      id: `fib_cell_${i}`,
      x1: rx,
      y1: ry,
      x2: rx + rw,
      y2: ry + rh,
      cx: rx + rw / 2,
      cy: ry + rh / 2,
    });

    if (side === 0) { x += size; w -= size; }
    else if (side === 1) { y += size; h -= size; }
    else if (side === 2) { w -= size; }
    else { h -= size; }
    side = (side + 1) % 4;
  }

  // Final remaining rectangle
  regions.push({
    id: 'fib_cell_final',
    x1: x,
    y1: y,
    x2: x + w,
    y2: y + h,
    cx: x + w / 2,
    cy: y + h / 2,
  });

  return regions;
}

/**
 * Snap coordinate to grid
 *
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} grid - Template grid
 * @returns {Object} Snapped coordinates matching contract
 */
export function snapToGrid(x, y, grid) {
  const { cellSize, gridType, snapStrength } = grid;

  let snappedX, snappedY;
  let cellId = '';
  let confidence = 1.0;
  let tieBreakReason = 'nearest_centroid';

  switch (gridType) {
    case GRID_TYPES.RECTANGULAR:
      snappedX = Math.round(x / cellSize) * cellSize;
      snappedY = Math.round(y / cellSize) * cellSize;
      cellId = `rect_${Math.round(x / cellSize)}_${Math.round(y / cellSize)}`;
      break;

    case GRID_TYPES.ISOMETRIC: {
      const isoHalf = cellSize / 2;
      snappedX = Math.round(x / isoHalf) * isoHalf;
      snappedY = Math.round(y / isoHalf) * isoHalf;
      cellId = `iso_${Math.round(x / isoHalf)}_${Math.round(y / isoHalf)}`;
      break;
    }

    case GRID_TYPES.HEXAGONAL: {
      const cell = nearestHexCell(x, y, cellSize);
      snappedX = cell.x;
      snappedY = cell.y;
      cellId = `hex_${cell.col}_${cell.row}`;
      break;
    }

    case GRID_TYPES.CIRCULAR: {
      const centerX = grid.width / 2;
      const centerY = grid.height / 2;
      const ringStep = cellSize;
      const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
      const ringCount = Math.ceil(maxRadius / ringStep) + 1;
      const segmentCount = 24;
      const segmentAngle = (2 * Math.PI) / segmentCount;

      const dx = x - centerX;
      const dy = y - centerY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      const ringIndex = Math.max(0, Math.min(Math.round(radius / ringStep), ringCount - 1));
      const segmentIndex = ((Math.round(theta / segmentAngle) % segmentCount) + segmentCount) % segmentCount;

      const segmentTheta = segmentIndex * segmentAngle;
      const ringRadius = ringIndex * ringStep;

      snappedX = centerX + Math.cos(segmentTheta) * ringRadius;
      snappedY = centerY + Math.sin(segmentTheta) * ringRadius;
      cellId = `circ_${segmentIndex}_${ringIndex}`;
      break;
    }

    case GRID_TYPES.FIBONACCI: {
      const regions = getFibonacciRegions(grid.width, grid.height);
      const BUCKET_ROWS = 4;
      const BUCKET_COLS = 4;
      const bucketW = grid.width / BUCKET_COLS;
      const bucketH = grid.height / BUCKET_ROWS;

      const bx = Math.max(0, Math.min(Math.floor(x / bucketW), BUCKET_COLS - 1));
      const by = Math.max(0, Math.min(Math.floor(y / bucketH), BUCKET_ROWS - 1));

      const buckets = Array.from({ length: BUCKET_ROWS * BUCKET_COLS }, () => []);
      for (const region of regions) {
        const startCol = Math.max(0, Math.min(Math.floor(region.x1 / bucketW), BUCKET_COLS - 1));
        const endCol = Math.max(0, Math.min(Math.floor(region.x2 / bucketW), BUCKET_COLS - 1));
        const startRow = Math.max(0, Math.min(Math.floor(region.y1 / bucketH), BUCKET_ROWS - 1));
        const endRow = Math.max(0, Math.min(Math.floor(region.y2 / bucketH), BUCKET_ROWS - 1));

        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            buckets[r * BUCKET_COLS + c].push(region);
          }
        }
      }

      const candidateRegions = buckets[by * BUCKET_COLS + bx];
      const searchList = candidateRegions && candidateRegions.length > 0 ? candidateRegions : regions;

      let minD = Infinity;
      let best = null;

      for (const region of searchList) {
        const dx = region.cx - x;
        const dy = region.cy - y;
        const d = dx * dx + dy * dy;
        if (d < minD) {
          minD = d;
          best = region;
        } else if (Math.abs(d - minD) < 1e-5) {
          if (best && region.id < best.id) {
            best = region;
            tieBreakReason = 'stable_id_alphanumeric';
          }
        }
      }

      snappedX = best ? best.cx : x;
      snappedY = best ? best.cy : y;
      cellId = best ? best.id : 'fib_cell_final';
      break;
    }

    default:
      snappedX = Math.round(x / cellSize) * cellSize;
      snappedY = Math.round(y / cellSize) * cellSize;
      cellId = `rect_${Math.round(x / cellSize)}_${Math.round(y / cellSize)}`;
  }

  // Blend with original based on snapStrength
  const blendX = x + (snappedX - x) * snapStrength;
  const blendY = y + (snappedY - y) * snapStrength;

  return {
    x: roundTo(blendX, 1),
    y: roundTo(blendY, 1),
    snappedX: roundTo(snappedX, 1),
    snappedY: roundTo(snappedY, 1),
    cellId,
    dialect: gridType,
    centerX: snappedX,
    centerY: snappedY,
    distance: Math.sqrt((x - snappedX) ** 2 + (y - snappedY) ** 2),
    confidence,
    tieBreakReason,
  };
}

/**
 * Add anchor point to grid
 */
export function addAnchorPoint(grid, x, y, label = '', locked = false) {
  const anchor = {
    x: roundTo(x, 1),
    y: roundTo(y, 1),
    label: label || `anchor_${grid.anchorPoints.length}`,
    locked,
    visible: true,
  };

  grid.anchorPoints.push(anchor);
  return anchor;
}

/**
 * Remove anchor point from grid
 */
export function removeAnchorPoint(grid, index) {
  if (index >= 0 && index < grid.anchorPoints.length) {
    grid.anchorPoints.splice(index, 1);
  }
}

/**
 * Apply symmetry to coordinates
 */
export function applySymmetry(coordinates, grid) {
  if (!grid.symmetryAxes || grid.symmetryAxes.length === 0) {
    return coordinates;
  }

  let result = [...coordinates];

  grid.symmetryAxes.forEach(axis => {
    const mirrored = [];

    result.forEach(coord => {
      let mirroredCoord = { ...coord };

      if (axis === 'vertical') {
        mirroredCoord.x = (grid.width - 1) - coord.x;  // correct 0-based mirror
        mirroredCoord.source = 'mirror_v';
      } else if (axis === 'horizontal') {
        mirroredCoord.y = (grid.height - 1) - coord.y;
        mirroredCoord.source = 'mirror_h';
      } else if (axis === 'diagonal') {
        // Anti-diagonal mirror, scale-normalized so non-square grids map
        // onto themselves (reduces to height−y / width−x when square)
        const temp = mirroredCoord.x;
        mirroredCoord.x = (1 - coord.y / grid.height) * grid.width;
        mirroredCoord.y = (1 - temp / grid.width) * grid.height;
        mirroredCoord.source = 'mirror_d';
      }

      mirrored.push(mirroredCoord);
    });

    result = [...result, ...mirrored];
  });

  // Remove duplicates
  const seen = new Set();
  return result.filter(coord => {
    const key = `${coord.x},${coord.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Create new layer
 */
export function createLayer(name = '') {
  return {
    name: name || `Layer ${Date.now()}`, // EXEMPT
    visible: true,
    locked: false,
    opacity: 1,
    cells: new Map(), // Map<"x,y", {color, emphasis}>
  };
}

/**
 * Set cell in layer
 */
export function setCell(layer, x, y, color, emphasis = 1) {
  const key = `${x},${y}`;
  layer.cells.set(key, { x, y, color, emphasis });
}

/**
 * Get cell from layer
 */
export function getCell(layer, x, y) {
  const key = `${x},${y}`;
  return layer.cells.get(key);
}

/**
 * Clear cell in layer
 */
export function clearCell(layer, x, y) {
  const key = `${x},${y}`;
  layer.cells.delete(key);
}

/**
 * Create new frame (for animation)
 */
export function createFrame() {
  return {
    duration: 100, // ms
    layers: [],
  };
}

/**
 * Onion skinning - get adjacent frames for preview
 */
export function getOnionSkins(frames, currentIndex, beforeCount = 1, afterCount = 1) {
  const skins = {
    before: [],
    after: [],
  };

  // Get frames before current
  for (let i = 1; i <= beforeCount; i++) {
    const index = currentIndex - i;
    if (index >= 0 && index < frames.length) {
      skins.before.push({
        frame: frames[index],
        index,
        opacity: 0.3 * (1 - i / (beforeCount + 1)),
      });
    }
  }

  // Get frames after current
  for (let i = 1; i <= afterCount; i++) {
    const index = currentIndex + i;
    if (index >= 0 && index < frames.length) {
      skins.after.push({
        frame: frames[index],
        index,
        opacity: 0.3 * (1 - i / (afterCount + 1)),
      });
    }
  }

  return skins;
}

/**
 * Export grid to Aseprite-compatible JSON
 */
export function exportToAseprite(grid) {
  const frames = [];

  grid.frames.forEach((frame, frameIndex) => {
    const frameData = {
      frame: frameIndex,
      duration: frame.duration,
      layers: [],
    };

    frame.layers.forEach((layer, _layerIndex) => {
      const layerData = {
        name: layer.name,
        cells: [],
      };

      layer.cells.forEach(cell => {
        layerData.cells.push({
          x: cell.x,
          y: cell.y,
          color: cell.color,
          emphasis: cell.emphasis,
        });
      });

      frameData.layers.push(layerData);
    });

    frames.push(frameData);
  });

  return {
    width: grid.width,
    height: grid.height,
    cellSize: grid.cellSize,
    gridType: grid.gridType,
    snapStrength: grid.snapStrength,
    frames,
    anchorPoints: grid.anchorPoints,
    symmetryAxes: grid.symmetryAxes,
  };
}

function normalizeNativeAsepriteCell(cell, grid) {
  const x = Math.round(Number(cell?.x) || 0);
  const y = Math.round(Number(cell?.y) || 0);
  const color = typeof cell?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(cell.color)
    ? cell.color.toUpperCase()
    : '#FFFFFF';
  const emphasis = Number.isFinite(Number(cell?.emphasis)) ? Number(cell.emphasis) : 1;
  const scale = grid.gridType === GRID_TYPES.RECTANGULAR
    ? Math.max(1, Math.round(Number(grid.cellSize) || 1))
    : 1;

  return { x, y, color, emphasis, scale };
}

/**
 * Export the visible editor state as native Aseprite-compatible JSON where
 * every emitted cell is one output pixel. Rectangular template cells expand to
 * their rendered cell size; imported 1x PixelBrain assets therefore remain a
 * strict 1:1 pixel replica.
 */
export function exportToPixelPerfectAseprite(grid, options = {}) {
  if (!grid || typeof grid !== 'object') {
    throw new BytecodeError(
      ERROR_CATEGORIES.TYPE,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.TEMPLATE,
      ERROR_CODES.NULL_INPUT,
      { parameterName: 'grid', functionName: 'exportToPixelPerfectAseprite' }
    );
  }

  const width = Math.max(1, Math.round(Number(options.width ?? grid.width) || 1));
  const height = Math.max(1, Math.round(Number(options.height ?? grid.height) || 1));
  const pixelMap = new Map();
  const sourceLayers = Array.isArray(grid.layers) ? grid.layers : [];

  sourceLayers.forEach((layer) => {
    if (layer?.visible === false || Number(layer?.opacity ?? 1) <= 0) return;
    if (!layer.cells || typeof layer.cells.forEach !== 'function') return;

    layer.cells.forEach((cell) => {
      const normalized = normalizeNativeAsepriteCell(cell, grid);
      for (let dy = 0; dy < normalized.scale; dy += 1) {
        for (let dx = 0; dx < normalized.scale; dx += 1) {
          const x = normalized.x + dx;
          const y = normalized.y + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          pixelMap.set(`${x},${y}`, {
            x,
            y,
            color: normalized.color,
            emphasis: normalized.emphasis,
          });
        }
      }
    });
  });

  const cells = Array.from(pixelMap.values()).sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.color.localeCompare(b.color);
  });

  const paletteColors = Array.from(new Set(cells.map((cell) => cell.color))).sort();
  const id = options.id || grid.sourcePacket?.id || 'pixelbrain-pixel-perfect';

  return {
    version: 'pixelbrain-aseprite-pixel-perfect/1.0.0',
    width,
    height,
    cellSize: 1,
    gridType: GRID_TYPES.RECTANGULAR,
    snapStrength: 1,
    colorMode: 'rgba',
    frames: [{
      frame: 0,
      duration: Number(options.duration) || 100,
      layers: [{
        name: options.layerName || 'Pixel Perfect Replica',
        visible: true,
        editable: true,
        locked: false,
        opacity: 255,
        cells,
      }],
    }],
    anchorPoints: [],
    symmetryAxes: [],
    palette: {
      source: 'pixelbrain-editor',
      mode: 'rgba',
      locked: false,
      transparentIndex: 0,
      colors: paletteColors,
    },
    meta: {
      bridge: 'pixelbrain-aseprite',
      id,
      editable: true,
      pixelPerfect: true,
      oneToOne: true,
      sourceGrid: {
        width: grid.width,
        height: grid.height,
        cellSize: grid.cellSize,
        gridType: grid.gridType,
      },
    },
  };
}

/**
 * Validate Aseprite-compatible JSON payload
 *
 * @param {Object} payload - Aseprite-compatible JSON payload
 * @param {Object} options - Validation options
 * @returns {Object} Validation result { ok, normalizedPayload, warnings, error, details }
 */
export function validateAsepriteImportPayload(payload, options = {}) {
  const warnings = [];
  const details = [];

  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: ['Payload must be an object'],
    };
  }

  // Check unknown critical vs optional fields
  const knownFields = new Set([
    'width',
    'height',
    'cellSize',
    'gridType',
    'snapStrength',
    'frames',
    'anchorPoints',
    'symmetryAxes',
    'version',
    'meta',
    'palette',
    'colorMode',
  ]);

  for (const key of Object.keys(payload)) {
    if (!knownFields.has(key)) {
      if (key.toLowerCase().includes('critical')) {
        return {
          ok: false,
          error: 'INVALID_SCHEMA',
          details: [`Unknown critical field: ${key}`],
        };
      } else {
        warnings.push(`Unknown optional field: ${key}`);
      }
    }
  }

  // Schema version check (basic existence check)
  if (payload.version !== undefined && typeof payload.version !== 'string' && typeof payload.version !== 'number') {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: ['Invalid schema version format'],
    };
  }

  // Basic check for required fields
  const required = ['width', 'height', 'cellSize', 'gridType', 'frames'];
  for (const req of required) {
    if (!(req in payload)) {
      return {
        ok: false,
        error: 'INVALID_SCHEMA',
        details: [`Missing required field: ${req}`],
      };
    }
  }

  // Type checks
  if (typeof payload.width !== 'number' || typeof payload.height !== 'number' || typeof payload.cellSize !== 'number') {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: ['width, height, and cellSize must be numbers'],
    };
  }

  // GridType checks
  if (typeof payload.gridType !== 'string' || !Object.values(GRID_TYPES).includes(payload.gridType)) {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: [`Invalid gridType: ${payload.gridType}`],
    };
  }

  // Canvas size bounds
  if (
    payload.width <= 0 ||
    payload.height <= 0 ||
    payload.width > ASEPRITE_IMPORT_LIMITS.maxWidth ||
    payload.height > ASEPRITE_IMPORT_LIMITS.maxHeight
  ) {
    return {
      ok: false,
      error: 'DIMENSIONS_OUT_OF_BOUNDS',
      details: [
        `Dimensions must be between 1x1 and ${ASEPRITE_IMPORT_LIMITS.maxWidth}x${ASEPRITE_IMPORT_LIMITS.maxHeight}`,
      ],
    };
  }

  // Frames check
  if (!Array.isArray(payload.frames)) {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: ['frames must be an array'],
    };
  }

  if (payload.frames.length === 0 || payload.frames.length > ASEPRITE_IMPORT_LIMITS.maxFrames) {
    return {
      ok: false,
      error: 'TOO_MANY_FRAMES',
      details: [`Frame count must be between 1 and ${ASEPRITE_IMPORT_LIMITS.maxFrames}`],
    };
  }

  // Metadata check
  if (payload.meta !== undefined && (payload.meta === null || typeof payload.meta !== 'object')) {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: ['meta must be an object'],
    };
  }

  // Palette check
  if (payload.palette !== undefined && (payload.palette === null || typeof payload.palette !== 'object')) {
    return {
      ok: false,
      error: 'INVALID_SCHEMA',
      details: ['palette must be an object or array'],
    };
  }

  let totalCellCount = 0;
  for (let f = 0; f < payload.frames.length; f++) {
    const frame = payload.frames[f];
    if (!frame || typeof frame !== 'object') {
      return {
        ok: false,
        error: 'INVALID_SCHEMA',
        details: [`Frame at index ${f} must be an object`],
      };
    }

    if (frame.duration !== undefined && (typeof frame.duration !== 'number' || frame.duration <= 0)) {
      return {
        ok: false,
        error: 'INVALID_SCHEMA',
        details: [`Frame duration at index ${f} must be a positive number`],
      };
    }

    if (!Array.isArray(frame.layers)) {
      return {
        ok: false,
        error: 'INVALID_SCHEMA',
        details: [`Frame layers at index ${f} must be an array`],
      };
    }

    if (frame.layers.length > ASEPRITE_IMPORT_LIMITS.maxLayers) {
      return {
        ok: false,
        error: 'INVALID_SCHEMA',
        details: [`Layer count in frame ${f} exceeds ${ASEPRITE_IMPORT_LIMITS.maxLayers}`],
      };
    }

    for (let l = 0; l < frame.layers.length; l++) {
      const layer = frame.layers[l];
      if (!layer || typeof layer !== 'object') {
        return {
          ok: false,
          error: 'INVALID_SCHEMA',
          details: [`Layer at index ${l} in frame ${f} must be an object`],
        };
      }

      if (layer.name !== undefined && typeof layer.name !== 'string') {
        return {
          ok: false,
          error: 'INVALID_SCHEMA',
          details: [`Layer name at index ${l} in frame ${f} must be a string`],
        };
      }

      if (!Array.isArray(layer.cells)) {
        return {
          ok: false,
          error: 'INVALID_SCHEMA',
          details: [`Layer cells at index ${l} in frame ${f} must be an array`],
        };
      }

      totalCellCount += layer.cells.length;
      if (totalCellCount > ASEPRITE_IMPORT_LIMITS.maxCells) {
        return {
          ok: false,
          error: 'INVALID_SCHEMA',
          details: [`Total cell count exceeds limit of ${ASEPRITE_IMPORT_LIMITS.maxCells}`],
        };
      }

      for (let c = 0; c < layer.cells.length; c++) {
        const cell = layer.cells[c];
        if (!cell || typeof cell !== 'object') {
          return {
            ok: false,
            error: 'INVALID_SCHEMA',
            details: [`Cell at index ${c} in layer ${l} in frame ${f} must be an object`],
          };
        }

        if (typeof cell.x !== 'number' || typeof cell.y !== 'number') {
          return {
            ok: false,
            error: 'INVALID_SCHEMA',
            details: [
              `Cell coordinates at index ${c} in layer ${l} in frame ${f} must be numbers`,
            ],
          };
        }

        // Validate cell coordinate bounds
        if (cell.x < 0 || cell.x > payload.width || cell.y < 0 || cell.y > payload.height) {
          return {
            ok: false,
            error: 'CELL_OUT_OF_BOUNDS',
            details: [
              `Cell coordinates (${cell.x}, ${cell.y}) exceed canvas dimensions ${payload.width}x${payload.height}`,
            ],
          };
        }
      }
    }
  }

  return {
    ok: true,
    normalizedPayload: payload,
    warnings,
  };
}

/**
 * Import grid from Aseprite-compatible JSON
 */
export function importFromAseprite(data, options = {}) {
  const val = validateAsepriteImportPayload(data, options);
  if (!val.ok) {
    return {
      ok: false,
      error: val.error,
      details: val.details,
      coordinates: [],
    };
  }

  const grid = createTemplateGrid({
    width: data.width,
    height: data.height,
    cellSize: data.cellSize,
    gridType: data.gridType,
    snapStrength: data.snapStrength,
  });

  grid.anchorPoints = data.anchorPoints || [];
  grid.symmetryAxes = data.symmetryAxes || [];

  // The imported document replaces the seed frame entirely
  grid.frames = [];

  (data.frames || []).forEach((frameData) => {
    const frame = createFrame();
    frame.duration = frameData.duration;

    frameData.layers.forEach((layerData) => {
      const layer = createLayer(layerData.name);

      layerData.cells.forEach((cell) => {
        setCell(layer, cell.x, cell.y, cell.color, cell.emphasis);
      });

      frame.layers.push(layer);
    });

    grid.frames.push(frame);
  });

  if (grid.frames.length === 0) {
    const frame = createFrame();
    frame.layers.push(createLayer('Base Layer'));
    grid.frames.push(frame);
  }

  grid.layers = grid.frames[0].layers;

  // Decorate grid with new contract properties
  grid.ok = true;
  grid.template = grid;
  grid.warnings = val.warnings;

  return grid;
}

function normalizeAssetCoordinate(coord = {}) {
  const x = Math.round(Number(coord.snappedX ?? coord.x) || 0);
  const y = Math.round(Number(coord.snappedY ?? coord.y) || 0);
  return {
    ...coord,
    x,
    y,
    snappedX: x,
    snappedY: y,
    color: String(coord.color || '#FFFFFF').toUpperCase(),
    emphasis: Number.isFinite(Number(coord.emphasis)) ? Number(coord.emphasis) : 1,
  };
}

function assetCoordinates(packet) {
  if (Array.isArray(packet?.geometry?.coordinates)) return packet.geometry.coordinates;
  if (Array.isArray(packet?.coordinates)) return packet.coordinates;
  return [];
}

function assetCanvas(packet, coordinates) {
  const canvas = packet?.canvas || {};
  if (Number(canvas.width) > 0 && Number(canvas.height) > 0) {
    return {
      width: Math.round(Number(canvas.width)),
      height: Math.round(Number(canvas.height)),
      cellSize: Math.max(1, Math.round(Number(canvas.cellSize ?? canvas.gridSize ?? 1))),
    };
  }
  const xs = coordinates.map((coord) => coord.x);
  const ys = coordinates.map((coord) => coord.y);
  return {
    width: Math.max(1, Math.max(...xs, 0) + 1),
    height: Math.max(1, Math.max(...ys, 0) + 1),
    cellSize: 1,
  };
}

function assetLayerName(coord, options = {}) {
  if (typeof options.layerBy === 'function') return options.layerBy(coord);
  if (options.layerBy === 'single') return options.layerName || 'PixelBrain Asset';
  if (options.layerBy === 'z') return `Layer ${Number(coord.z) || 0}`;
  return coord.layer || coord.partId || coord.part || `Layer ${Number(coord.z) || 0}`;
}

function collectAssetPalette(packet, coordinates) {
  const paletteSources = [
    packet?.metadata?.editorPalette?.colors,
    packet?.palette?.materialPalette,
    packet?.palette?.semanticPalette,
    packet?.palette?.sourcePalette?.flatMap?.((entry) => entry?.colors || []),
    packet?.palettes?.flatMap?.((entry) => entry?.colors || entry || []),
  ];
  const colors = [];
  for (const source of paletteSources) {
    if (Array.isArray(source)) colors.push(...source);
  }
  colors.push(...coordinates.map((coord) => coord.color));
  return Array.from(new Set(
    colors
      .filter((color) => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
      .map((color) => color.toUpperCase()),
  )).sort();
}

/**
 * Import a PixelBrainAssetPacket into the editor grid without passing through
 * Aseprite's one-pixel-per-layer bitmap constraints. Overdraw is resolved
 * deterministically per layer coordinate by taking the last coordinate in the
 * packet order, while the original coordinate metadata is retained on the cell.
 */
export function importFromPixelBrainAssetPacket(packet, options = {}) {
  const coordinates = assetCoordinates(packet).map(normalizeAssetCoordinate);
  const canvas = assetCanvas(packet, coordinates);
  const grid = createTemplateGrid({
    width: canvas.width,
    height: canvas.height,
    cellSize: options.cellSize || canvas.cellSize || 1,
    gridType: GRID_TYPES.RECTANGULAR,
    snapStrength: 1,
  });

  grid.frames = [];
  grid.layers = [];
  grid.currentFrame = 0;
  grid.currentLayer = 0;
  grid.palette = collectAssetPalette(packet, coordinates);
  grid.sourcePacket = {
    id: packet?.id || packet?.source?.id || null,
    kind: packet?.kind || null,
    source: packet?.source || null,
    metadata: packet?.metadata || null,
  };

  const layerMap = new Map();
  const rawSurfaces = Array.isArray(packet?.layerSurfaces)
    ? packet.layerSurfaces
    : Array.isArray(packet?.geometry?.layerSurfaces)
      ? packet.geometry.layerSurfaces
      : null;

  const hasLayerSurfaces = Array.isArray(rawSurfaces) && rawSurfaces.length > 0;

  if (hasLayerSurfaces) {
    for (const surface of rawSurfaces) {
      const name = String(surface.id || 'Layer');
      const layer = createLayer(name);
      layer.source = 'pixelbrain-asset-packet';
      layer.visible = surface.visible !== false;
      layer.opacity = Number.isFinite(Number(surface.opacity)) ? Number(surface.opacity) : 1;
      layer.blendMode = surface.blend || 'OVER';
      layer.order = Number.isFinite(Number(surface.order)) ? Number(surface.order) : 0;
      layer.sourceIndex = Number.isFinite(Number(surface.sourceIndex)) ? Number(surface.sourceIndex) : 0;
      layer.semanticRole = surface.semanticRole || surface.role || null;

      const surfaceCoords = surface.coordinates || surface.cells || [];
      for (const rawCoord of surfaceCoords) {
        const coord = normalizeAssetCoordinate(rawCoord);
        const key = `${coord.x},${coord.y}`;
        layer.cells.set(key, {
          x: coord.x,
          y: coord.y,
          color: coord.color,
          emphasis: coord.emphasis,
          metadata: {
            partId: coord.partId || surface.id || null,
            layer: surface.id,
            z: coord.z ?? surface.order ?? null,
            isRim: Boolean(coord.isRim),
            isMotif: Boolean(coord.isMotif),
            motifRole: coord.motifRole || null,
            materialId: coord.materialId || coord.material || coord.squareAmpMaterial || null,
            source: coord.source || 'pixelbrain-asset-packet',
          },
        });
      }
      layerMap.set(name, layer);
    }
  } else {
    for (const coord of coordinates) {
      const name = String(assetLayerName(coord, options) || 'PixelBrain Asset');
      if (!layerMap.has(name)) {
        const layer = createLayer(name);
        layer.source = 'pixelbrain-asset-packet';
        layerMap.set(name, layer);
      }
      const layer = layerMap.get(name);
      const key = `${coord.x},${coord.y}`;
      layer.cells.set(key, {
        x: coord.x,
        y: coord.y,
        color: coord.color,
        emphasis: coord.emphasis,
        metadata: {
          partId: coord.partId || null,
          layer: coord.layer || null,
          z: coord.z ?? null,
          isRim: Boolean(coord.isRim),
          isMotif: Boolean(coord.isMotif),
          motifRole: coord.motifRole || null,
          materialId: coord.materialId || coord.squareAmpMaterial || null,
          source: coord.source || 'pixelbrain-asset-packet',
        },
      });
    }
  }

  // Enrich each layer with dominant material + SDF descriptor for phosphorylation gate
  const sdfDescriptor = packet.sdfDescriptors?.length === 1 ? packet.sdfDescriptors[0] : null;
  for (const layer of layerMap.values()) {
    const counts = new Map();
    for (const cell of layer.cells.values()) {
      const mid = cell.metadata?.materialId;
      if (mid) counts.set(mid, (counts.get(mid) || 0) + 1);
    }
    if (counts.size > 0) {
      const dominantId = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      const mat = getMaterialDefinition(dominantId);
      if (mat && Object.keys(mat.anchors || {}).length > 0) {
        layer.material = mat;
        if (sdfDescriptor) layer.sdfDescriptor = sdfDescriptor;
      }
    }
  }

  const frame = createFrame();
  frame.layers = hasLayerSurfaces
    ? Array.from(layerMap.values()).sort((a, b) => (a.order - b.order) || (a.sourceIndex - b.sourceIndex))
    : Array.from(layerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (frame.layers.length === 0) frame.layers.push(createLayer('Base Layer'));
  grid.frames.push(frame);
  grid.layers = frame.layers;
  grid.ok = true;
  grid.template = grid;
  grid.warnings = [];
  return grid;
}


/**
 * Generate grid preview coordinates (for rendering)
 */
export function generateGridPreview(grid) {
  const { width, height, cellSize, gridType } = grid;
  const lines = [];

  switch (gridType) {
    case GRID_TYPES.RECTANGULAR:
      // Vertical lines
      for (let x = 0; x <= width; x += cellSize) {
        lines.push({
          x1: x,
          y1: 0,
          x2: x,
          y2: height,
          type: 'vertical',
        });
      }
      // Horizontal lines
      for (let y = 0; y <= height; y += cellSize) {
        lines.push({
          x1: 0,
          y1: y,
          x2: width,
          y2: y,
          type: 'horizontal',
        });
      }
      break;

    case GRID_TYPES.ISOMETRIC: {
      // Diagonal lines (45° and 135°)
      const step = cellSize / Math.sqrt(2);
      for (let i = -width; i <= width * 2; i += step) {
        lines.push({
          x1: i,
          y1: 0,
          x2: i - height,
          y2: height,
          type: 'diag1',
        });
        lines.push({
          x1: i,
          y1: 0,
          x2: i + height,
          y2: height,
          type: 'diag2',
        });
      }
      break;
    }

    case GRID_TYPES.HEXAGONAL: {
      // Pointy-top hexagons of circumradius cellSize/√3 tile the snap
      // lattice exactly; shared edges are emitted once.
      const { rowPitch, radius } = hexMetrics(cellSize);
      const seenEdges = new Set();
      for (let row = 0; row * rowPitch <= height; row++) {
        const cy = row * rowPitch;
        for (let cx = hexRowOffset(row, cellSize); cx <= width; cx += cellSize) {
          for (let i = 0; i < 6; i++) {
            // Vertices every 60°, starting at 30° (pointy-top orientation)
            const a1 = Math.PI / 6 + (i / 6) * Math.PI * 2;
            const a2 = Math.PI / 6 + ((i + 1) / 6) * Math.PI * 2;
            const x1 = cx + Math.cos(a1) * radius;
            const y1 = cy + Math.sin(a1) * radius;
            const x2 = cx + Math.cos(a2) * radius;
            const y2 = cy + Math.sin(a2) * radius;
            const key = [
              `${x1.toFixed(2)},${y1.toFixed(2)}`,
              `${x2.toFixed(2)},${y2.toFixed(2)}`,
            ].sort().join('|');
            if (seenEdges.has(key)) continue;
            seenEdges.add(key);
            lines.push({ x1, y1, x2, y2, type: 'hex' });
          }
        }
      }
      break;
    }

    case GRID_TYPES.CIRCULAR: {
      const centerX = width / 2;
      const centerY = height / 2;
      const ringStep = cellSize;
      const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
      const ringCount = Math.ceil(maxRadius / ringStep) + 1;
      const segmentCount = 24;
      const segmentAngle = (2 * Math.PI) / segmentCount;

      // Draw rings (circles approximated by segments)
      for (let r = 1; r < ringCount; r++) {
        const radius = r * ringStep;
        for (let s = 0; s < segmentCount; s++) {
          const a1 = s * segmentAngle;
          const a2 = (s + 1) * segmentAngle;
          lines.push({
            x1: centerX + Math.cos(a1) * radius,
            y1: centerY + Math.sin(a1) * radius,
            x2: centerX + Math.cos(a2) * radius,
            y2: centerY + Math.sin(a2) * radius,
            type: 'circular-ring',
          });
        }
      }

      // Draw radial lines (spokes)
      for (let s = 0; s < segmentCount; s++) {
        const theta = s * segmentAngle;
        const outerRadius = (ringCount - 1) * ringStep;
        lines.push({
          x1: centerX,
          y1: centerY,
          x2: centerX + Math.cos(theta) * outerRadius,
          y2: centerY + Math.sin(theta) * outerRadius,
          type: 'circular-spoke',
        });
      }
      break;
    }

    case GRID_TYPES.FIBONACCI: {
      // Recursive golden subdivision lines
      let fx = 0, fy = 0, fw = width, fh = height;
      let fside = 0;
      for (let i = 0; i < 8; i++) {
        const size = fside % 2 === 0 ? fw / GOLDEN_RATIO : fh / GOLDEN_RATIO;
        
        if (fside === 0) {
          lines.push({ x1: fx + size, y1: fy, x2: fx + size, y2: fy + fh, type: 'fib' });
          fx += size; fw -= size;
        } else if (fside === 1) {
          lines.push({ x1: fx, y1: fy + size, x2: fx + fw, y2: fy + size, type: 'fib' });
          fy += size; fh -= size;
        } else if (fside === 2) {
          lines.push({ x1: fx + fw - size, y1: fy, x2: fx + fw - size, y2: fy + fh, type: 'fib' });
          fw -= size;
        } else {
          lines.push({ x1: fx, y1: fy + fh - size, x2: fx + fw, y2: fy + fh - size, type: 'fib' });
          fh -= size;
        }
        fside = (fside + 1) % 4;
      }
      break;
    }
  }

  return lines;
}

/**
 * Get cell at screen position
 */
export function getCellAtPosition(grid, screenX, screenY) {
  const { cellSize, gridType } = grid;

  switch (gridType) {
    case GRID_TYPES.RECTANGULAR:
      return {
        col: Math.floor(screenX / cellSize),
        row: Math.floor(screenY / cellSize),
        x: Math.floor(screenX / cellSize) * cellSize,
        y: Math.floor(screenY / cellSize) * cellSize,
      };

    case GRID_TYPES.ISOMETRIC: {
      const isoHalf = cellSize / 2;
      return {
        col: Math.floor(screenX / isoHalf),
        row: Math.floor(screenY / isoHalf),
        x: Math.floor(screenX / isoHalf) * isoHalf,
        y: Math.floor(screenY / isoHalf) * isoHalf,
      };
    }

    case GRID_TYPES.HEXAGONAL: {
      // Hex cells are addressed by centre, not top-left corner
      const cell = nearestHexCell(screenX, screenY, cellSize);
      return { col: cell.col, row: cell.row, x: cell.x, y: cell.y };
    }

    case GRID_TYPES.CIRCULAR: {
      const centerX = grid.width / 2;
      const centerY = grid.height / 2;
      const ringStep = cellSize;
      const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
      const ringCount = Math.ceil(maxRadius / ringStep) + 1;
      const segmentCount = 24;
      const segmentAngle = (2 * Math.PI) / segmentCount;

      const dx = screenX - centerX;
      const dy = screenY - centerY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);

      const ringIndex = Math.max(0, Math.min(Math.round(radius / ringStep), ringCount - 1));
      const segmentIndex = ((Math.round(theta / segmentAngle) % segmentCount) + segmentCount) % segmentCount;

      const segmentTheta = segmentIndex * segmentAngle;
      const ringRadius = ringIndex * ringStep;

      return {
        col: segmentIndex,
        row: ringIndex,
        x: centerX + Math.cos(segmentTheta) * ringRadius,
        y: centerY + Math.sin(segmentTheta) * ringRadius,
      };
    }

    case GRID_TYPES.FIBONACCI: {
      const regions = getFibonacciRegions(grid.width, grid.height);
      const BUCKET_ROWS = 4;
      const BUCKET_COLS = 4;
      const bucketW = grid.width / BUCKET_COLS;
      const bucketH = grid.height / BUCKET_ROWS;

      const bx = Math.max(0, Math.min(Math.floor(screenX / bucketW), BUCKET_COLS - 1));
      const by = Math.max(0, Math.min(Math.floor(screenY / bucketH), BUCKET_ROWS - 1));

      const buckets = Array.from({ length: BUCKET_ROWS * BUCKET_COLS }, () => []);
      for (const region of regions) {
        const startCol = Math.max(0, Math.min(Math.floor(region.x1 / bucketW), BUCKET_COLS - 1));
        const endCol = Math.max(0, Math.min(Math.floor(region.x2 / bucketW), BUCKET_COLS - 1));
        const startRow = Math.max(0, Math.min(Math.floor(region.y1 / bucketH), BUCKET_ROWS - 1));
        const endRow = Math.max(0, Math.min(Math.floor(region.y2 / bucketH), BUCKET_ROWS - 1));

        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            buckets[r * BUCKET_COLS + c].push(region);
          }
        }
      }

      const candidateRegions = buckets[by * BUCKET_COLS + bx];
      const searchList = candidateRegions && candidateRegions.length > 0 ? candidateRegions : regions;

      let minD = Infinity;
      let best = null;

      for (const region of searchList) {
        const dx = region.cx - screenX;
        const dy = region.cy - screenY;
        const d = dx * dx + dy * dy;
        if (d < minD) {
          minD = d;
          best = region;
        } else if (Math.abs(d - minD) < 1e-5) {
          if (best && region.id < best.id) {
            best = region;
          }
        }
      }

      const snappedX = best ? best.cx : screenX;
      const snappedY = best ? best.cy : screenY;
      const cellId = best ? best.id : 'fib_cell_final';

      return {
        col: best ? regions.indexOf(best) : regions.length - 1,
        row: 0,
        x: snappedX,
        y: snappedY,
        cellId
      };
    }

    default:
      return {
        col: Math.floor(screenX / cellSize),
        row: Math.floor(screenY / cellSize),
        x: Math.floor(screenX / cellSize) * cellSize,
        y: Math.floor(screenY / cellSize) * cellSize,
      };
  }
}

/**
 * Resolve a cell address back to its canvas anchor point — the inverse of
 * getCellAtPosition. Rectangular/isometric cells anchor at their top-left
 * corner; hexagonal cells are addressed by centre.
 */
export function getCellOrigin(grid, col, row) {
  const { cellSize, gridType } = grid;

  switch (gridType) {
    case GRID_TYPES.HEXAGONAL:
      return hexCenter(col, row, cellSize);

    case GRID_TYPES.ISOMETRIC: {
      const isoHalf = cellSize / 2;
      return { x: col * isoHalf, y: row * isoHalf };
    }

    case GRID_TYPES.CIRCULAR: {
      const centerX = grid.width / 2;
      const centerY = grid.height / 2;
      const ringStep = cellSize;
      const segmentCount = 24;
      const segmentAngle = (2 * Math.PI) / segmentCount;

      const segmentTheta = col * segmentAngle;
      const ringRadius = row * ringStep;

      return {
        x: centerX + Math.cos(segmentTheta) * ringRadius,
        y: centerY + Math.sin(segmentTheta) * ringRadius,
      };
    }

    case GRID_TYPES.FIBONACCI: {
      const regions = getFibonacciRegions(grid.width, grid.height);
      const region = regions[col] || regions[regions.length - 1];
      return {
        x: region.cx,
        y: region.cy,
      };
    }

    default:
      return { x: col * cellSize, y: row * cellSize };
  }
}

/**
 * Renderer-facing lattice metrics, so UI surfaces never re-derive the
 * geometry the engine owns. hexRadius is null for non-hex grids.
 */
export function getGridMetrics(grid) {
  const { cellSize, gridType } = grid;

  if (gridType === GRID_TYPES.HEXAGONAL) {
    const { rowPitch, radius } = hexMetrics(cellSize);
    return { cellSize, rowPitch, hexRadius: radius };
  }

  return { cellSize, rowPitch: cellSize, hexRadius: null };
}

/**
 * Flood fill cells (for bucket tool)
 */
export function floodFill(grid, layer, startX, startY, color) {
  const { cellSize, gridType } = grid;
  if (!Number.isFinite(cellSize) || cellSize <= 0) return;

  const isHex = gridType === GRID_TYPES.HEXAGONAL;
  const rowPitch = isHex ? hexMetrics(cellSize).rowPitch : cellSize;

  const maxCols = Math.ceil((grid.cols ?? grid.width / cellSize) || 0);
  const maxRows = Math.ceil((grid.rows ?? grid.height / rowPitch) || 0);

  const cellPoint = (col, row) =>
    isHex ? hexCenter(col, row, cellSize) : { x: col * cellSize, y: row * cellSize };

  const start = isHex
    ? nearestHexCell(startX, startY, cellSize)
    : { col: Math.floor(startX / cellSize), row: Math.floor(startY / cellSize) };

  const isInBounds = (col, row) =>
    col >= 0 && row >= 0 && col < maxCols && row < maxRows;

  if (!isInBounds(start.col, start.row)) return;

  // Get target color (null = empty cell)
  const startPoint = cellPoint(start.col, start.row);
  const targetCell = getCell(layer, startPoint.x, startPoint.y);
  const targetColor = targetCell ? targetCell.color : null;

  if (targetColor === color) return; // Same color, nothing to do

  const neighborsOf = (col, row) => {
    if (!isHex) {
      return [
        { col: col + 1, row }, { col: col - 1, row },
        { col, row: row + 1 }, { col, row: row - 1 },
      ];
    }
    // odd-r offset layout: 6 neighbours; diagonal columns depend on row parity
    const shift = hexRowOffset(row, cellSize) === 0 ? -1 : 0;
    return [
      { col: col + 1, row }, { col: col - 1, row },
      { col: col + shift, row: row - 1 }, { col: col + shift + 1, row: row - 1 },
      { col: col + shift, row: row + 1 }, { col: col + shift + 1, row: row + 1 },
    ];
  };

  // BFS flood fill
  const queue = [{ col: start.col, row: start.row }];
  const visited = new Set();

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { col, row } = queue[cursor];
    const key = `${col},${row}`;

    if (!isInBounds(col, row) || visited.has(key)) continue;
    visited.add(key);

    const point = cellPoint(col, row);
    const cell = getCell(layer, point.x, point.y);
    const cellColor = cell ? cell.color : null;

    // Fill only cells that exactly match the start cell's colour —
    // an empty cell matches only an empty start
    if (cellColor === targetColor) {
      setCell(layer, point.x, point.y, color);
      queue.push(...neighborsOf(col, row));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EDITOR SYSTEMS EXTENSIONS (for Aseprite-rival editor per PDR)
// These build on the existing primitives to deliver the 8 systems.
// All are deterministic. UI must go through adapter.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Layer management (System 2)
 */
export function setLayerOpacity(grid, layerIndex, opacity) {
  if (!grid.layers || !grid.layers[layerIndex]) return grid;
  const layer = grid.layers[layerIndex];
  layer.opacity = Math.max(0, Math.min(1, Number(opacity) || 1));
  return grid;
}

export function setLayerVisible(grid, layerIndex, visible) {
  if (!grid.layers || !grid.layers[layerIndex]) return grid;
  grid.layers[layerIndex].visible = !!visible;
  return grid;
}

export function setLayerLocked(grid, layerIndex, locked) {
  if (!grid.layers || !grid.layers[layerIndex]) return grid;
  grid.layers[layerIndex].locked = !!locked;
  return grid;
}

export function reorderLayers(grid, fromIndex, toIndex) {
  if (!grid.layers) return grid;
  const layers = grid.layers;
  if (fromIndex < 0 || fromIndex >= layers.length || toIndex < 0 || toIndex >= layers.length) return grid;
  const [moved] = layers.splice(fromIndex, 1);
  layers.splice(toIndex, 0, moved);
  // Update currentLayer if needed
  if (grid.currentLayer === fromIndex) grid.currentLayer = toIndex;
  return grid;
}

/**
 * Non-destructive flatten (preview only, does not mutate source layers)
 */
export function getFlattenedPreviewCells(grid, targetWidth = null, targetHeight = null) {
  const w = targetWidth || grid.width;
  const h = targetHeight || grid.height;
  const flat = new Map();

  if (!grid.layers) return flat;

  // Composite from bottom to top, respecting visibility and opacity (simple alpha blend for preview)
  for (let li = 0; li < grid.layers.length; li++) {
    const layer = grid.layers[li];
    if (!layer.visible || layer.opacity <= 0) continue;

    layer.cells.forEach((cell, key) => {
      if (cell.x < 0 || cell.x >= w || cell.y < 0 || cell.y >= h) return;
      const alpha = layer.opacity;
      const existing = flat.get(key);
      if (existing) {
        // Simple over blend (for preview; real render may use emphasis)
        flat.set(key, {
          ...cell,
          color: blendColors(existing.color, cell.color, alpha), // naive; in practice use emphasis or material
          emphasis: Math.max(existing.emphasis || 1, cell.emphasis || 1)
        });
      } else {
        flat.set(key, { ...cell, emphasis: (cell.emphasis || 1) * alpha });
      }
    });
  }
  return flat;
}

function blendColors(c1, c2, alpha) {
  // Very naive hex blend for preview purposes. Real path uses render packets.
  if (!c1 || alpha >= 1) return c2;
  if (!c2) return c1;
  // For demo, just return c2 (top wins). Production would parse RGB and lerp.
  return c2;
}

/**
 * Reference Layer + Annotations (System 8)
 * Uses data from image-to-* pipelines.
 */
export function createReferenceLayer(name = 'Reference', sourceAnalysis = null, quantizedCells = []) {
  const layer = createLayer(name);
  layer.type = 'reference';
  layer.locked = true;
  layer.opacity = 0.35; // low opacity default
  layer.visible = true;
  layer.annotations = new Map(); // per cell key -> {text, sourceImageRegion?, semanticTags?}

  quantizedCells.forEach(cell => {
    const key = `${cell.x},${cell.y}`;
    setCell(layer, cell.x, cell.y, cell.color || '#808080', cell.emphasis || 0.5);
    if (sourceAnalysis) {
      layer.annotations.set(key, {
        text: `Ref: ${sourceAnalysis.dominantColors?.[0] || 'image'} region`,
        source: 'image-import',
        confidence: sourceAnalysis.confidence || 0.8
      });
    }
  });

  return layer;
}

export function attachAnnotation(layer, x, y, annotation) {
  if (!layer.annotations) layer.annotations = new Map();
  const key = `${x},${y}`;
  layer.annotations.set(key, { ...(layer.annotations.get(key) || {}), ...annotation });
}

export function getCellAnnotations(layer, x, y) {
  if (!layer || !layer.annotations) return null;
  return layer.annotations.get(`${x},${y}`) || null;
}

/**
 * Selection + Transform (System 6)
 * Basic rectangular selection. Transforms operate on cell sets.
 */
export function selectRect(grid, x1, y1, x2, y2, layerIndex = null) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const selection = {
    type: 'rect',
    bounds: { minX, minY, maxX, maxY },
    cells: [],
    layerIndex: layerIndex !== null ? layerIndex : (grid.currentLayer || 0)
  };

  const layer = grid.layers ? grid.layers[selection.layerIndex] : null;
  if (layer && layer.cells) {
    layer.cells.forEach((cell, key) => {
      if (cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY) {
        selection.cells.push({ ...cell });
      }
    });
  }
  grid.currentSelection = selection;
  return selection;
}

export function clearSelection(grid) {
  grid.currentSelection = null;
}

export function getSelectionCells(grid) {
  return grid.currentSelection ? grid.currentSelection.cells : [];
}

/**
 * Basic transforms on a set of cells (layer-local or global)
 */
export function transformCells(cells, transformType, params = {}) {
  // transformType: 'nudge', 'flipH', 'flipV', 'rotate90'
  if (!Array.isArray(cells) || cells.length === 0) return cells;

  const { dx = 0, dy = 0, cx = 0, cy = 0 } = params;

  return cells.map(cell => {
    let { x, y, color, emphasis = 1 } = cell;
    switch (transformType) {
      case 'nudge':
        x += dx; y += dy; break;
      case 'flipH':
        x = 2 * cx - x; break;
      case 'flipV':
        y = 2 * cy - y; break;
      case 'rotate90CW':
        // Rotate 90 CW around (cx,cy)
      {
        const rx = x - cx;
        const ry = y - cy;
        x = cx + ry;
        y = cy - rx;
        break;
      }
      case 'rotate90CCW':
      {
        const rx2 = x - cx;
        const ry2 = y - cy;
        x = cx - ry2;
        y = cy + rx2;
        break;
      }
    }
    return { x: Math.round(x), y: Math.round(y), color, emphasis };
  });
}

/**
 * AMP-Aware Editing (System 5) - core hook
 * Takes current cells (from layer or selection), runs an AMP function, returns processed cells + provenance.
 * AMP fn signature: (cells, options) => processedCells
 * Examples: squareSharpnessContrastAMP, chromaticTransmute, etc. (passed from adapter)
 */
export function applyAMPToCells(cells, ampFn, ampOptions = {}, provenanceMeta = {}) {
  if (typeof ampFn !== 'function') throw new Error('ampFn must be a function');
  if (!Array.isArray(cells)) return cells;

  const processed = ampFn(cells, ampOptions); // AMPs are expected to accept array of {x,y,color,emphasis}

  // Attach editor provenance
  const withProvenance = (processed || cells).map(c => ({
    ...c,
    _editorProvenance: {
      appliedAMP: ampOptions.ampName || 'unknown',
      options: ampOptions,
      timestamp: Date.now(), // EXEMPT — provenance metadata, not gameplay logic
      ...provenanceMeta
    }
  }));

  return withProvenance;
}

/**
 * Convenience: apply AMP to a specific layer (creates new layer or mutates based on flag)
 */
export function applyAMPToLayer(grid, layerIndex, ampFn, ampOptions = {}, createNewLayer = true) {
  const layer = grid.layers && grid.layers[layerIndex] ? grid.layers[layerIndex] : null;
  if (!layer) return null;

  const cellsArr = Array.from(layer.cells.values ? layer.cells.values() : []);
  const processed = applyAMPToCells(cellsArr, ampFn, ampOptions, { sourceLayer: layer.name || layerIndex });

  if (createNewLayer) {
    const newLayer = createLayer(`${layer.name || 'Layer'}-AMP-${ampOptions.ampName || 'fx'}`);
    processed.forEach(c => setCell(newLayer, c.x, c.y, c.color, c.emphasis));
    newLayer._editorProvenance = processed[0]?._editorProvenance;
    grid.layers.push(newLayer);
    return { newLayerIndex: grid.layers.length - 1, newLayer };
  } else {
    // mutate in place (destructive, use with caution / command wrapper)
    layer.cells.clear();
    processed.forEach(c => setCell(layer, c.x, c.y, c.color, c.emphasis));
    layer._editorProvenance = processed[0]?._editorProvenance;
    return { mutatedLayerIndex: layerIndex };
  }
}

/**
 * Selection transform convenience
 */
export function transformSelection(grid, transformType, params = {}) {
  if (!grid.currentSelection || !grid.currentSelection.cells.length) return null;
  const transformed = transformCells(grid.currentSelection.cells, transformType, params);
  grid.currentSelection.cells = transformed;
  // Note: caller (UI) should apply back to the layer using commands
  return transformed;
}

// End of editor extensions
