/**
 * FORMULA-TO-COORDINATES BRIDGE
 *
 * Evaluates mathematical formulas to generate coordinate systems.
 * Supports parametric curves, grid projections, edge traces, and fractals.
 */

import { clamp01, GOLDEN_RATIO, roundTo, clampNumber, pseudoRandom, applyChaikin, applyAffine, applyOffsetCurve } from './shared.js';
import {
  FORMULA_TYPES,
  GRID_TYPES,
  COLOR_FORMULA_TYPES,
} from './image-to-bytecode-formula.js';
import { getRotationAtTime } from './gear-glide-amp.js';
import { perlinNoiseGrid } from './procedural-noise.js';

const MAX_FRACTAL_ITERATIONS = 6;

/**
 * Evaluate formula and generate coordinates
 * @param {Object} formula - Bytecode formula
 * @param {Object} canvasSize - Canvas dimensions
 * @param {number} time - Time in ms for animation
 * @returns {Array} Coordinate objects
 */
export function evaluateFormula(formula, canvasSize, time = 0, options = {}) {
  if (!formula || !canvasSize) {
    return [];
  }

  const { coordinateFormula, template } = formula;

  if (!coordinateFormula) {
    return [];
  }

  const { strict = false } = options;
  // Stronger determinism contract: seed + precision from top level or formula
  const effectiveSeed = formula.seed != null ? (formula.seed >>> 0) : (options.seed != null ? options.seed : 42);
  const effectivePrecision = formula.precision != null ? formula.precision : (options.precision != null ? options.precision : 3);

  let coordinates = [];

  switch (coordinateFormula.type) {
    case FORMULA_TYPES.PARAMETRIC_CURVE:
      coordinates = evaluateParametricCurve(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.GRID_PROJECTION:
      coordinates = evaluateGridProjection(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.FIBONACCI:
      coordinates = evaluateFibonacciGrid(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.EDGE_TRACE:
      coordinates = evaluateEdgeTrace(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.FRACTAL_ITER:
      coordinates = evaluateFractalIteration(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.TEMPLATE_BASED:
      coordinates = evaluateTemplateBased(coordinateFormula, template, canvasSize, time);
      break;
    case FORMULA_TYPES.VECTORIZED_TEXT:
      coordinates = evaluateVectorizedText(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.MATHEMATICAL_STROKE:
      coordinates = evaluateMathematicalStroke(coordinateFormula, canvasSize, time);
      break;
    case FORMULA_TYPES.MATH_EXPRESSION:
      coordinates = evaluateMathExpression(coordinateFormula, canvasSize, time);
      break;
    default:
      if (strict) {
        throw new Error(`FORMULA_UNSUPPORTED_TYPE:${coordinateFormula.type}`);
      }
      coordinates = evaluateParametricCurve(createDefaultParametric(), canvasSize, time);
  }

  // Apply template constraints if available
  if (template) {
    coordinates = applyTemplateConstraints(coordinates, template, canvasSize);
  }

  return coordinates;
}

/**
 * Evaluate Fibonacci subdivision grid
 */
export function evaluateFibonacciGrid(formula, canvasSize, _time = 0) {
  const { iterations = 6, scale = 1 } = formula.parameters || formula;
  const coordinates = [];
  
  let x = 0, y = 0, w = canvasSize.width * scale, h = canvasSize.height * scale;
  let side = 0;

  for (let i = 0; i < iterations; i++) {
    const size = side % 2 === 0 ? w / GOLDEN_RATIO : h / GOLDEN_RATIO;
    
    // Add points along the subdivision lines
    const segments = 12;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      let px, py;
      
      if (side === 0) { px = x + size; py = y + t * h; }
      else if (side === 1) { px = x + t * w; py = y + size; }
      else if (side === 2) { px = x + w - size; py = y + t * h; }
      else { px = x + t * w; py = y + h - size; }
      
      coordinates.push({
        x: roundTo(px, 1),
        y: roundTo(py, 1),
        z: i,
        emphasis: clamp01(1 - i / iterations),
        source: 'fibonacci',
      });
    }

    if (side === 0) { x += size; w -= size; }
    else if (side === 1) { y += size; h -= size; }
    else if (side === 2) { w -= size; }
    else { h -= size; }
    side = (side + 1) % 4;
  }

  return coordinates;
}

/**
 * Evaluate parametric curve formula
 * x = cx + a·cos(b·t + c)
 * y = cy + a·sin(b·t + c)
 */
export function evaluateParametricCurve(formula, canvasSize, time = 0) {
  const { parameters } = formula;
  const {
    cx = canvasSize.width / 2,
    cy = canvasSize.height / 2,
    a = 50,
    b: _b = 0.1,
    c = 0,
    n = 64,
  } = parameters || {};

  const bpm = 90;
  const rotation = getRotationAtTime(time, bpm, 90);

  const coordinates = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rotation + c;
    const x = cx + a * Math.cos(t);
    const y = cy + a * Math.sin(t);

    coordinates.push({
      x: roundTo(x, 1),
      y: roundTo(y, 1),
      z: 0,
      emphasis: clamp01(0.5 + 0.5 * Math.sin(t * 3)),
      source: 'parametric',
      t: i / n,
    });
  }

  return coordinates;
}

/**
 * Evaluate grid projection formula
 */
export function evaluateGridProjection(formula, canvasSize, time = 0) {
  const {
    gridType = GRID_TYPES.RECTANGULAR,
    cellSize = 8,
    snapStrength = 0.85,
    gridWidth = canvasSize.width,
    gridHeight = canvasSize.height,
  } = formula;

  const coordinates = [];
  const safeCellSize = Math.max(4, Math.min(32, cellSize));

  const bpm = 90;
  const rotation = getRotationAtTime(time, bpm, 10);
  const wobble = Math.sin(rotation) * (1 - snapStrength) * safeCellSize * 0.5;

  switch (gridType) {
    case GRID_TYPES.RECTANGULAR:
      for (let x = 0; x < gridWidth; x += safeCellSize) {
        for (let y = 0; y < gridHeight; y += safeCellSize) {
          coordinates.push({
            x: roundTo(x + wobble, 1),
            y: roundTo(y + wobble, 1),
            z: 0,
            emphasis: clamp01(0.3 + 0.7 * Math.sin((x + y) * 0.05)),
            source: 'grid_rect',
            gridCell: { col: Math.round(x / safeCellSize), row: Math.round(y / safeCellSize) },
          });
        }
      }
      break;

    case GRID_TYPES.HEXAGONAL: {
      const hexHeight = safeCellSize * Math.sqrt(3) / 2;
      let hexRow = 0;
      for (let y = 0; y < gridHeight; y += hexHeight) {
        const xOffset = (hexRow % 2) * safeCellSize / 2;
        for (let x = xOffset; x < gridWidth; x += safeCellSize) {
          coordinates.push({
            x: roundTo(x + wobble, 1),
            y: roundTo(y + wobble, 1),
            z: 0,
            emphasis: clamp01(0.3 + 0.7 * Math.sin((x + y) * 0.05)),
            source: 'grid_hex',
            gridCell: { col: Math.round((x - xOffset) / safeCellSize), row: hexRow },
          });
        }
        hexRow++;
      }
      break;
    }

    case GRID_TYPES.ISOMETRIC: {
      const isoStep = safeCellSize / Math.sqrt(2);
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const x = (i - j) * isoStep + gridWidth / 2 + wobble;
          const y = (i + j) * isoStep * 0.5 + gridHeight / 2 + wobble;

          if (x >= 0 && x <= gridWidth && y >= 0 && y <= gridHeight) {
            coordinates.push({
              x: roundTo(x, 1),
              y: roundTo(y, 1),
              z: 0,
              emphasis: clamp01(0.3 + 0.7 * Math.sin((i + j) * 0.1)),
              source: 'grid_iso',
              gridCell: { col: i, row: j },
            });
          }
        }
      }
      break;
    }
  }

  return coordinates;
}

/**
 * Evaluate edge trace formula
 */
export function evaluateEdgeTrace(formula, canvasSize, _time = 0) {
  const sourcePath = Array.isArray(formula.unitTracePath) && formula.unitTracePath.length > 0
    ? formula.unitTracePath.map((p) => ({
        x: Number(p.x) * canvasSize.width,
        y: Number(p.y) * canvasSize.height,
      }))
    : (formula.tracePath || []);
  if (sourcePath.length === 0) return [];

  const totalPoints = sourcePath.length;
  const _speed = 0.02;

  return sourcePath.map((p, index) => ({
    x: roundTo(p.x, 1),
    y: roundTo(p.y, 1),
    z: 0,
    emphasis: clamp01(index / totalPoints),
    source: 'edge_trace',
    pathIndex: index,
  }));
}

/**
 * Evaluate fractal iteration formula
 */
export function evaluateFractalIteration(formula, canvasSize, time = 0) {
  const {
    iterations: requestedIterations = 4,
    baseShape = 'triangle',
    scale = 1,
    cx = canvasSize.width / 2,
    cy = canvasSize.height / 2,
  } = formula;

  const numericIterations = Number(requestedIterations);
  const iterations = Math.min(
    MAX_FRACTAL_ITERATIONS,
    Math.max(0, Number.isFinite(numericIterations) ? Math.floor(numericIterations) : 4)
  );
  const coordinates = [];

  function generateFractal(x, y, size, depth) {
    if (depth === 0) {
      coordinates.push({
        x: roundTo(x, 1),
        y: roundTo(y, 1),
        z: depth,
        emphasis: iterations === 0 ? 1 : clamp01(1 - depth / iterations),
        source: 'fractal',
        depth,
      });
      return;
    }

    const newSize = size / 2;
    const newDepth = depth - 1;

    if (baseShape === 'triangle') {
      generateFractal(x, y - newSize / 2, newSize, newDepth);
      generateFractal(x - newSize / 2, y + newSize / 2, newSize, newDepth);
      generateFractal(x + newSize / 2, y + newSize / 2, newSize, newDepth);
    } else if (baseShape === 'square') {
      generateFractal(x - newSize / 2, y - newSize / 2, newSize, newDepth);
      generateFractal(x + newSize / 2, y - newSize / 2, newSize, newDepth);
      generateFractal(x - newSize / 2, y + newSize / 2, newSize, newDepth);
      generateFractal(x + newSize / 2, y + newSize / 2, newSize, newDepth);
    } else if (baseShape === 'circle') {
      const angle = (time * 0.001 + depth) * Math.PI / Math.max(1, iterations);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + angle;
        generateFractal(x + Math.cos(a) * newSize / 2, y + Math.sin(a) * newSize / 2, newSize, newDepth);
      }
    }
  }

  const initialSize = Math.min(canvasSize.width, canvasSize.height) * scale;
  generateFractal(cx, cy, initialSize, iterations);

  return coordinates;
}

/**
 * Evaluate template-based formula
 */
export function evaluateTemplateBased(formula, template, canvasSize, _time = 0) {
  const { anchorPoints = [], symmetryAxes = [] } = template || {};
  const coordinates = anchorPoints.map((anchor, index) => ({
    x: roundTo(anchor.x, 1),
    y: roundTo(anchor.y, 1),
    z: 0,
    emphasis: anchor.locked ? 1 : 0.5,
    source: 'template_anchor',
    label: anchor.label,
    anchorIndex: index,
  }));

  if (symmetryAxes.includes('vertical')) {
    coordinates.push(...coordinates.map(c => ({ ...c, x: canvasSize.width - c.x, source: 'mirror_v' })));
  }
  if (symmetryAxes.includes('horizontal')) {
    coordinates.push(...coordinates.map(c => ({ ...c, y: canvasSize.height - c.y, source: 'mirror_h' })));
  }

  return coordinates;
}

/**
 * Apply template constraints
 */
export function applyTemplateConstraints(coordinates, template, canvasSize) {
  const { gridWidth, gridHeight, cellSize, anchorPoints = [], snapStrength = 0.85 } = template;
  const anchorMap = new Map();
  anchorPoints.forEach(anchor => {
    const key = `${Math.round(anchor.x / cellSize)},${Math.round(anchor.y / cellSize)}`;
    anchorMap.set(key, anchor);
  });

  return coordinates.map(coord => {
    let { x, y } = coord;
    const gridX = Math.round(x / cellSize) * cellSize;
    const gridY = Math.round(y / cellSize) * cellSize;
    x = x + (gridX - x) * snapStrength;
    y = y + (gridY - y) * snapStrength;

    const anchorKey = `${Math.round(x / cellSize)},${Math.round(y / cellSize)}`;
    const anchor = anchorMap.get(anchorKey);
    if (anchor && anchor.locked) { x = anchor.x; y = anchor.y; }

    x = clamp01(x / (gridWidth || canvasSize.width)) * (gridWidth || canvasSize.width);
    y = clamp01(y / (gridHeight || canvasSize.height)) * (gridHeight || canvasSize.height);

    return { ...coord, x: roundTo(x, 1), y: roundTo(y, 1), snappedX: Math.round(x), snappedY: Math.round(y) };
  });
}

/**
 * Utility functions for color mapping
 */
export function evaluateFormulaWithColor(formula, canvasSize, time = 0) {
  const coordinates = evaluateFormula(formula, canvasSize, time);
  const { colorFormula } = formula || {};
  if (!colorFormula) return coordinates.map(c => ({ ...c, color: '#808080' }));

  switch (colorFormula.type) {
    case COLOR_FORMULA_TYPES.PALETTE_INDEXED: return mapCoordinatesToPalette(coordinates, colorFormula);
    case COLOR_FORMULA_TYPES.GRADIENT_MAPPED: return mapCoordinatesToGradient(coordinates, colorFormula);
    case COLOR_FORMULA_TYPES.BRIGHTNESS_QUANTIZED: return mapCoordinatesToBrightness(coordinates, colorFormula);
    default: return coordinates.map(c => ({ ...c, color: '#808080' }));
  }
}

function mapCoordinatesToPalette(coordinates, colorFormula) {
  const { paletteKey, paletteSize = 4 } = colorFormula;
  const baseHue = parseInt(paletteKey?.substring(4, 6) || '80', 16) * 16;
  return coordinates.map(coord => {
    const colorIndex = Math.floor(coord.emphasis * (paletteSize - 1));
    return { ...coord, color: `hsl(${baseHue + colorIndex * 30}, 70%, ${50 + colorIndex * 10}%)`, paletteIndex: colorIndex };
  });
}

function mapCoordinatesToGradient(coordinates, colorFormula) {
  const { gradientStops = ['#000000', '#ffffff'] } = colorFormula;
  return coordinates.map(coord => {
    const t = coord.emphasis * (gradientStops.length - 1);
    const lower = Math.floor(t);
    const upper = Math.min(lower + 1, gradientStops.length - 1);
    return { ...coord, color: lerpColor(gradientStops[lower], gradientStops[upper], t - lower) };
  });
}

function mapCoordinatesToBrightness(coordinates, colorFormula) {
  const rawLevels = Number(colorFormula.brightnessLevels);
  const brightnessLevels = Math.max(1, Math.floor(Number.isFinite(rawLevels) ? rawLevels : 4));
  const maxLevel = brightnessLevels - 1;
  return coordinates.map(coord => {
    const level = Math.min(maxLevel, Math.floor(clamp01(coord.emphasis) * brightnessLevels));
    const lightness = maxLevel === 0 ? 100 : 20 + (level / maxLevel) * 80;
    return { ...coord, color: `hsl(0, 0%, ${lightness}%)`, brightnessLevel: level };
  });
}

function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.substring(1), 16), b = parseInt(hexB.substring(1), 16);
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t);
  const b2 = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t);
  return `#${((r << 16) | (g << 8) | b2).toString(16).padStart(6, '0')}`;
}

export function lerpFormulas(formulaA, formulaB, t) {
  const safeT = clamp01(t);
  const paramsA = formulaA.coordinateFormula?.parameters || {};
  const paramsB = formulaB.coordinateFormula?.parameters || {};
  const lerpedParams = {};
  new Set([...Object.keys(paramsA), ...Object.keys(paramsB)]).forEach(k => {
    lerpedParams[k] = (paramsA[k] || 0) + ((paramsB[k] || 0) - (paramsA[k] || 0)) * safeT;
  });
  return { ...formulaA, coordinateFormula: { ...formulaA.coordinateFormula, parameters: lerpedParams } };
}

function createDefaultParametric() {
  return { type: FORMULA_TYPES.PARAMETRIC_CURVE, parameters: { cx: 80, cy: 72, a: 50, b: 0.1, c: 0, n: 64 } };
}

/**
 * Centered simplex character stroke font for alphanumeric characters and space
 */
const SIMPLEX_CHAR_ATLAS = {
  'A': [
    [[0, -0.5], [-0.25, 0.5]],
    [[0, -0.5], [0.25, 0.5]],
    [[-0.15, 0.1], [0.15, 0.1]]
  ],
  'B': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[-0.25, -0.5], [0.15, -0.5], [0.2, -0.25], [0.15, 0], [-0.25, 0]],
    [[-0.25, 0], [0.2, 0], [0.25, 0.25], [0.2, 0.5], [-0.25, 0.5]]
  ],
  'C': [
    [[0.25, -0.3], [0, -0.5], [-0.25, -0.2], [-0.25, 0.2], [0, 0.5], [0.25, 0.3]]
  ],
  'D': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[-0.25, -0.5], [0.1, -0.5], [0.25, -0.1], [0.25, 0.1], [0.1, 0.5], [-0.25, 0.5]]
  ],
  'E': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[-0.25, -0.5], [0.25, -0.5]],
    [[-0.25, 0], [0.15, 0]],
    [[-0.25, 0.5], [0.25, 0.5]]
  ],
  'F': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[-0.25, -0.5], [0.25, -0.5]],
    [[-0.25, 0], [0.15, 0]]
  ],
  'G': [
    [[0.25, -0.3], [0, -0.5], [-0.25, -0.2], [-0.25, 0.2], [0, 0.5], [0.25, 0.5], [0.25, 0], [0.05, 0]]
  ],
  'H': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[0.25, -0.5], [0.25, 0.5]],
    [[-0.25, 0], [0.25, 0]]
  ],
  'I': [
    [[0, -0.5], [0, 0.5]],
    [[-0.15, -0.5], [0.15, -0.5]],
    [[-0.15, 0.5], [0.15, 0.5]]
  ],
  'J': [
    [[0.15, -0.5], [0.15, 0.3], [0, 0.5], [-0.2, 0.3]]
  ],
  'K': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[0.25, -0.5], [-0.25, 0]],
    [[-0.25, 0], [0.25, 0.5]]
  ],
  'L': [
    [[-0.25, -0.5], [-0.25, 0.5]],
    [[-0.25, 0.5], [0.25, 0.5]]
  ],
  'M': [
    [[-0.25, 0.5], [-0.25, -0.5]],
    [[-0.25, -0.5], [0, 0]],
    [[0, 0], [0.25, -0.5]],
    [[0.25, -0.5], [0.25, 0.5]]
  ],
  'N': [
    [[-0.25, 0.5], [-0.25, -0.5]],
    [[-0.25, -0.5], [0.25, 0.5]],
    [[0.25, 0.5], [0.25, -0.5]]
  ],
  'O': [
    [[-0.25, -0.2], [0, -0.5], [0.25, -0.2], [0.25, 0.2], [0, 0.5], [-0.25, 0.2], [-0.25, -0.2]]
  ],
  'P': [
    [[-0.25, 0.5], [-0.25, -0.5]],
    [[-0.25, -0.5], [0.2, -0.5], [0.25, -0.25], [0.2, 0], [-0.25, 0]]
  ],
  'Q': [
    [[-0.25, -0.2], [0, -0.5], [0.25, -0.2], [0.25, 0.2], [0, 0.5], [-0.25, 0.2], [-0.25, -0.2]],
    [[0.1, 0.2], [0.3, 0.65]]
  ],
  'R': [
    [[-0.25, 0.5], [-0.25, -0.5]],
    [[-0.25, -0.5], [0.2, -0.5], [0.25, -0.25], [0.2, 0], [-0.25, 0]],
    [[-0.1, 0], [0.25, 0.5]]
  ],
  'S': [
    [[0.25, -0.25], [0, -0.5], [-0.25, -0.25], [0, 0], [0.25, 0.25], [0, 0.5], [-0.25, 0.25]]
  ],
  'T': [
    [[0, -0.5], [0, 0.5]],
    [[-0.25, -0.5], [0.25, -0.5]]
  ],
  'U': [
    [[-0.25, -0.5], [-0.25, 0.3], [0, 0.5], [0.25, 0.3], [0.25, -0.5]]
  ],
  'V': [
    [[-0.25, -0.5], [0, 0.5]],
    [[0, 0.5], [0.25, -0.5]]
  ],
  'W': [
    [[-0.25, -0.5], [-0.15, 0.5]],
    [[-0.15, 0.5], [0, 0]],
    [[0, 0], [0.15, 0.5]],
    [[0.15, 0.5], [0.25, -0.5]]
  ],
  'X': [
    [[-0.25, -0.5], [0.25, 0.5]],
    [[0.25, -0.5], [-0.25, 0.5]]
  ],
  'Y': [
    [[-0.25, -0.5], [0, 0]],
    [[0.25, -0.5], [0, 0]],
    [[0, 0], [0, 0.5]]
  ],
  'Z': [
    [[-0.25, -0.5], [0.25, -0.5]],
    [[0.25, -0.5], [-0.25, 0.5]],
    [[-0.25, 0.5], [0.25, 0.5]]
  ],
  '0': [
    [[-0.25, -0.2], [0, -0.5], [0.25, -0.2], [0.25, 0.2], [0, 0.5], [-0.25, 0.2], [-0.25, -0.2]],
    [[0.2, -0.3], [-0.2, 0.3]]
  ],
  '1': [
    [[-0.1, -0.3], [0, -0.5], [0, 0.5]],
    [[-0.2, 0.5], [0.2, 0.5]]
  ],
  '2': [
    [[-0.25, -0.3], [0, -0.5], [0.25, -0.3], [-0.25, 0.5], [0.25, 0.5]]
  ],
  '3': [
    [[-0.25, -0.3], [0, -0.5], [0.25, -0.3], [0, 0], [0.25, 0.3], [0, 0.5], [-0.25, 0.3]]
  ],
  '4': [
    [[0.15, 0.5], [0.15, -0.5]],
    [[0.15, -0.5], [-0.25, 0.2], [0.25, 0.2]]
  ],
  '5': [
    [[0.25, -0.5], [-0.25, -0.5], [-0.25, 0], [0.25, 0], [0.25, 0.5], [-0.25, 0.5]]
  ],
  '6': [
    [[0.2, -0.4], [0, -0.5], [-0.25, -0.2], [-0.25, 0.2], [0, 0.5], [0.25, 0.2], [0, 0], [-0.25, 0.2]]
  ],
  '7': [
    [[-0.25, -0.5], [0.25, -0.5]],
    [[0.25, -0.5], [-0.1, 0.5]]
  ],
  '8': [
    [[0, 0], [-0.25, -0.25], [0, -0.5], [0.25, -0.25], [0, 0], [-0.25, 0.25], [0, 0.5], [0.25, 0.25], [0, 0]]
  ],
  '9': [
    [[0.25, -0.2], [0, 0], [-0.25, -0.2], [0, -0.5], [0.25, -0.2], [0.25, 0.2], [0, 0.5], [-0.2, 0.4]]
  ],
  ' ': []
};

const SUPPORTED_TEXT_RE = /^[A-Z0-9 ]*$/;

export function normalizeVectorizedText(text) {
  const normalized = String(text || '')
    .toUpperCase()
    .slice(0, 32);

  if (!SUPPORTED_TEXT_RE.test(normalized)) {
    throw new Error('FORMULA_INVALID_VECTORIZED_TEXT_CHARSET');
  }

  return normalized;
}

export function evaluateVectorizedText(formula, canvasSize, _time = 0) {
  const text = normalizeVectorizedText(formula.text);
  const fontSize = clampNumber(formula.fontSize, 10, 100, 24);
  const cx = Number.isFinite(Number(formula.cx)) ? Number(formula.cx) : canvasSize.width / 2;
  const cy = Number.isFinite(Number(formula.cy)) ? Number(formula.cy) : canvasSize.height / 2;
  const spacing = clampNumber(formula.spacing, 0.1, 5, 1);

  const glyphWidth = fontSize * 0.62;
  const glyphStep = glyphWidth * spacing;
  const startX = cx - ((text.length - 1) * glyphStep) / 2;

  const coordinates = [];

  [...text].forEach((char, charIndex) => {
    if (char === ' ') return;

    const strokes = SIMPLEX_CHAR_ATLAS[char] || [];
    const glyphX = startX + charIndex * glyphStep;

    strokes.forEach((stroke, strokeIndex) => {
      if (stroke.length === 0) return;
      if (stroke.length === 1) {
        // Single point stroke
        const px = glyphX + stroke[0][0] * fontSize;
        const py = cy + stroke[0][1] * fontSize;
        coordinates.push({
          x: roundTo(px, 1),
          y: roundTo(py, 1),
          z: 0,
          emphasis: clamp01(1 - strokeIndex * 0.08),
          source: 'vectorized_text',
          char,
          charIndex,
          pointIndex: 0,
        });
        return;
      }

      // Linear interpolation point-sampling at 3px intervals
      let pointIdx = 0;
      for (let s = 0; s < stroke.length - 1; s++) {
        const pA = stroke[s];
        const pB = stroke[s + 1];
        const ax = glyphX + pA[0] * fontSize;
        const ay = cy + pA[1] * fontSize;
        const bx = glyphX + pB[0] * fontSize;
        const by = cy + pB[1] * fontSize;

        const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
        const steps = Math.max(1, Math.floor(dist / 3));

        // For the very first segment, include start point.
        // For subsequent segments, start from step = 1 to avoid double-adding points.
        const startStep = (s === 0) ? 0 : 1;

        for (let step = startStep; step <= steps; step++) {
          const t = step / steps;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          coordinates.push({
            x: roundTo(px, 1),
            y: roundTo(py, 1),
            z: 0,
            emphasis: clamp01(1 - strokeIndex * 0.08),
            source: 'vectorized_text',
            char,
            charIndex,
            pointIndex: pointIdx++,
          });
        }
      }
    });
  });

  return coordinates;
}

/**
 * MATHEMATICAL_STROKE evaluator
 * Per user's vision: Does NOT take pixel strokes.
 * Instead, user (or Wand) defines a *mathematical formula* that simulates a brush stroke.
 * Path is parametric. Width/pressure/bleed are also math functions of t.
 * Then we rasterize a variable-thickness "stroke" using efficient offset curves.
 * This produces clean, deterministic coords that are ideal for SCDL lowering + propagation.
 */
export function evaluateMathematicalStroke(formula, canvasSize, time = 0) {
  const params = formula.parameters || formula;
  const {
    cx = canvasSize.width / 2,
    cy = canvasSize.height / 2,
    length = 180,
    angle = 0,
    baseWidth = 4,
    widthVariation = 0.6,   // 0..1 : how much the width breathes (sinusoidal pressure sim)
    frequency = 1.8,        // oscillations per stroke (simulates hand tremor / brush texture)
    density = 1.0,          // point density along path
    bleed = 0.3,            // soft edge bleed factor (for ring-like thickness)
    n = 128,
  } = params;

  const coords = [];
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const steps = Math.max(16, Math.floor(n * density));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 to 1 along the stroke

    // Core parametric path (straight for base, can be made curved by caller composing)
    const px = cx + (t - 0.5) * length * cos;
    const py = cy + (t - 0.5) * length * sin;

    // Simulate pressure / width as math function (no pixel input)
    const pressure = Math.sin(t * Math.PI) * widthVariation + (1 - widthVariation * 0.5);
    const w = Math.max(1, baseWidth * pressure);

    // Add center line
    coords.push({
      x: roundTo(px, 1),
      y: roundTo(py, 1),
      z: 0,
      emphasis: clamp01(pressure),
      source: 'mathematical_stroke',
      t,
      role: 'stroke.center',
    });

    // Variable thickness: offset perpendicular points (simulates brush width)
    const halfW = w / 2;
    const perpCos = -sin;
    const perpSin = cos;

    // Edge points (for SCDL ring/path conversion)
    coords.push({
      x: roundTo(px + halfW * perpCos, 1),
      y: roundTo(py + halfW * perpSin, 1),
      z: 0,
      emphasis: clamp01(pressure * (1 - bleed)),
      source: 'mathematical_stroke',
      t,
      role: 'stroke.edge',
    });
    coords.push({
      x: roundTo(px - halfW * perpCos, 1),
      y: roundTo(py - halfW * perpSin, 1),
      z: 0,
      emphasis: clamp01(pressure * (1 - bleed)),
      source: 'mathematical_stroke',
      t,
      role: 'stroke.edge',
    });

    // Bleed / texture samples (for soft fill propagation)
    if (bleed > 0.05 && i % 2 === 0) {
      const b = halfW * bleed * (0.6 + 0.4 * Math.sin(t * frequency * 6));
      coords.push({
        x: roundTo(px + b * perpCos * 0.7, 1),
        y: roundTo(py + b * perpSin * 0.7, 1),
        z: 0,
        emphasis: clamp01(pressure * bleed * 0.6),
        source: 'mathematical_stroke',
        t,
        role: 'stroke.bleed',
      });
    }
  }

  return coords;
}

/**
 * MATH_EXPRESSION evaluator - implements the "Standard Procedural-to-Vector Pipeline"
 * State-free AST of mathematical expressions.
 * Supports: trig, arithmetic, mod, fract, noise (wired from procedural-noise), variables x/y/t/seed.
 * Domain: normalized unit space. Geometry: samples expression to produce point list (value drives emphasis/offset).
 * Deterministic via seed + fixed roundTo.
 */
export function evaluateMathExpression(formula, canvasSize, time = 0) {
  const expr = formula.expression;
  const seed = formula.seed != null ? (formula.seed >>> 0) : 42;
  const precision = formula.precision != null ? Math.max(1, Math.min(6, formula.precision)) : 3;

  const width = canvasSize.width || 100;
  const height = canvasSize.height || 100;

  // Evaluate the AST to a scalar at (ux, uy) in unit domain [0,1]
  function evalNode(node, ux, uy, ut) {
    if (!node || typeof node !== 'object') return 0;

    if (node.op === 'x') return ux;
    if (node.op === 'y') return uy;
    if (node.op === 't') return ut;
    if (node.op === 'seed') return seed / 0xffffffff || 0;

    if (node.value !== undefined) return Number(node.value);

    if (node.op === 'sin') return Math.sin(evalNode(node.arg, ux, uy, ut) * Math.PI * 2);
    if (node.op === 'cos') return Math.cos(evalNode(node.arg, ux, uy, ut) * Math.PI * 2);
    if (node.op === 'abs') return Math.abs(evalNode(node.arg, ux, uy, ut));
    if (node.op === 'fract') return evalNode(node.arg, ux, uy, ut) % 1;
    if (node.op === 'floor') return Math.floor(evalNode(node.arg, ux, uy, ut));
    if (node.op === 'neg') return -evalNode(node.arg, ux, uy, ut);

    if (node.op === 'noise') {
      const val = evalNode(node.arg, ux, uy, ut);
      // Use seeded perlin-like from procedural-noise, scaled by arg
      const freq = Math.max(0.1, Math.abs(val) * 4 + 1);
      const grid = perlinNoiseGrid(2, 2, freq, { seed: (seed + Math.floor(ut * 100)) >>> 0 });
      const n = grid && grid.length ? grid[0] : (pseudoRandom(seed + ux * 1000 + uy * 100) - 0.5) * 2;
      return n;
    }

    if (node.op === 'add') return evalNode(node.left, ux, uy, ut) + evalNode(node.right, ux, uy, ut);
    if (node.op === 'sub') return evalNode(node.left, ux, uy, ut) - evalNode(node.right, ux, uy, ut);
    if (node.op === 'mul') return evalNode(node.left, ux, uy, ut) * evalNode(node.right, ux, uy, ut);
    if (node.op === 'div') {
      const r = evalNode(node.right, ux, uy, ut) || 1e-9;
      return evalNode(node.left, ux, uy, ut) / r;
    }
    if (node.op === 'mod') {
      const l = evalNode(node.left, ux, uy, ut);
      const r = evalNode(node.right, ux, uy, ut) || 1;
      return ((l % r) + r) % r;
    }
    if (node.op === 'pow') return Math.pow(evalNode(node.left, ux, uy, ut), evalNode(node.right, ux, uy, ut));
    if (node.op === 'min') return Math.min(evalNode(node.left, ux, uy, ut), evalNode(node.right, ux, uy, ut));
    if (node.op === 'max') return Math.max(evalNode(node.left, ux, uy, ut), evalNode(node.right, ux, uy, ut));

    return 0;
  }

  // Geometry Generation: sample unit domain on a grid, emit vector points where value drives position/emphasis
  // This maps evaluated math directly to vector primitives (points + emphasis)
  const points = [];
  const samples = 32; // bounded
  const ut = (time % 10000) / 10000; // normalized time

  for (let i = 0; i <= samples; i++) {
    for (let j = 0; j <= samples; j++) {
      const ux = i / samples;
      const uy = j / samples;
      let v = evalNode(expr, ux, uy, ut);

      // Threshold / map to geometry (thresholded values -> points for vector path)
      if (Math.abs(v) > 0.1) {  // simple threshold for interesting loci
        const x = ux * width;
        const y = uy * height;
        points.push({
          x: roundTo(x, precision),
          y: roundTo(y, precision),
          z: 0,
          emphasis: clamp01((v + 1) / 2),
          source: 'math_expression',
          t: ux,
          value: roundTo(v, 4),
        });
      }
    }
  }

  // Also emit a parametric line driven by expression for curve-like output
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    const ux = t;
    const uy = 0.5 + evalNode(expr, t, 0.5, ut) * 0.4;
    const x = ux * width;
    const y = uy * height;
    points.push({
      x: roundTo(x, precision),
      y: roundTo(y, precision),
      z: 0,
      emphasis: clamp01(0.5 + 0.5 * Math.sin(t * 6)),
      source: 'math_expression',
      t,
    });
  }

  // Apply pure modifiers if declared on the formula (immutable composition)
  let finalPoints = points;
  if (Array.isArray(formula.modifiers)) {
    for (const mod of formula.modifiers) {
      if (mod.type === 'chaikin') finalPoints = applyChaikin(finalPoints, mod.iterations || 1);
      else if (mod.type === 'affine') finalPoints = applyAffine(finalPoints, mod.matrix);
      else if (mod.type === 'offset') finalPoints = applyOffsetCurve(finalPoints, mod.distance || 1, mod.side || 1);
    }
  }

  // Enforce global round + seed contract
  return finalPoints.map(p => ({
    ...p,
    x: roundTo(p.x, precision),
    y: roundTo(p.y, precision),
  }));
}
