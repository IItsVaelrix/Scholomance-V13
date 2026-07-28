/**
 * VIXEL FUSION — The Composition Boundary
 *
 * This is where two mediums become one representation. The Wand produces
 * clean vectorized coordinate paths (the ART). The PixelBrain/SCDL compiler
 * produces a material-rich pixel grid (the CRAFT). Neither knows the other
 * exists. Fusion makes them concurrent within the QBIT Lattice.
 *
 * Algorithm:
 *   1. Ingest PixelBrain grid cells (from SCDL compile output)
 *   2. Ingest Wand vectorPaths (from evaluateFormula / composite)
 *   3. For each pixel cell, find nearest vector path point
 *   4. Compute parametric T, surface normal, curvature at that point
 *   5. Assign vector provenance to the pixel cell
 *   6. Compute feel state (boundary, salience, perceptual role)
 *   7. Emit a frozen, content-hashed VixelField
 *
 * The result: every pixel KNOWS it sits on a curve. Every curve KNOWS it
 * has texture. Materials can flow along form. Feel can evaluate
 * texture-form coherence. The Bridge can classify vixel operations.
 *
 * DETERMINISM: Pure math. No randomness. Identical inputs → identical
 * vixelHash. The hash covers every vixel's pixel + vector + feel state.
 *
 * @bytecode VIXEL-FUSION-v1
 */

import { VIXEL_SCHEMA_VERSION, validateVixelField } from './vixel-schema.js';

// ─── Deterministic hashing ───────────────────────────────────────────────────

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function contentHash(obj) {
  return fnv1a(stableStringify(obj));
}

// ─── Vector math helpers ─────────────────────────────────────────────────────

function dist2(ax, ay, bx, by) {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function normalize2(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/**
 * Compute the tangent at point i in a polyline (central difference).
 */
function tangentAt(points, i) {
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 1)];
  return normalize2(next.x - prev.x, next.y - prev.y);
}

/**
 * Compute curvature at point i (angle change between consecutive tangents).
 */
function curvatureAt(points, i) {
  if (points.length < 3 || i <= 0 || i >= points.length - 1) return 0;
  const t0 = tangentAt(points, i - 1);
  const t1 = tangentAt(points, i + 1);
  // Cross product magnitude = sin(angle)
  const cross = t0.x * t1.y - t0.y * t1.x;
  return Math.abs(cross);
}

// ─── Nearest-path search ─────────────────────────────────────────────────────

/**
 * Build a spatial index of all Wand vector points for fast nearest-neighbor.
 * Returns a flat array with precomputed path metadata.
 *
 * @param {Array<{role: string, points: Array<{x: number, y: number}>}>} vectorPaths
 * @returns {Array<{x, y, pathRef, pathIndex, pointIndex, t, normalX, normalY, curvature, pressure}>}
 */
function buildVectorIndex(vectorPaths) {
  const index = [];

  for (let pi = 0; pi < vectorPaths.length; pi++) {
    const path = vectorPaths[pi];
    const role = path.role || `path_${pi}`;
    const pts = path.points || [];
    if (pts.length === 0) continue;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = pts.length > 1 ? i / (pts.length - 1) : 0.5;

      // Tangent → normal (perpendicular, oriented outward relative to path centroid)
      const tan = tangentAt(pts, i);
      let normal = { x: -tan.y, y: tan.x }; // rotate 90°

      // Path centroid for outward normal orientation
      let cxSum = 0, cySum = 0;
      for (let k = 0; k < pts.length; k++) { cxSum += pts[k].x; cySum += pts[k].y; }
      const pathCx = cxSum / pts.length;
      const pathCy = cySum / pts.length;

      const toPtX = p.x - pathCx;
      const toPtY = p.y - pathCy;
      if (normal.x * toPtX + normal.y * toPtY < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }

      const curv = curvatureAt(pts, i);
      const pressure = p.pressure !== undefined ? p.pressure
        : p.emphasis !== undefined ? p.emphasis
        : 1;

      index.push({
        x: p.x,
        y: p.y,
        pathRef: role,
        pathIndex: pi,
        pointIndex: i,
        t,
        normalX: Math.round(normal.x * 1000) / 1000,
        normalY: Math.round(normal.y * 1000) / 1000,
        curvature: Math.round(curv * 1000) / 1000,
        pressure: Math.round(pressure * 1000) / 1000,
      });
    }
  }

  return index;
}

/**
 * Find the nearest vector index entry to a grid cell.
 * Brute-force for proof-of-concept (assets are small: <500 cells).
 * For production, a grid-bucket spatial hash would be O(1) amortized.
 */
function nearestVector(cx, cy, vectorIndex, maxDist2) {
  let best = null;
  let bestD2 = maxDist2;

  for (const vi of vectorIndex) {
    const d2 = dist2(cx, cy, vi.x, vi.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = vi;
    }
  }

  return best;
}

// ─── Boundary detection ──────────────────────────────────────────────────────

/**
 * Build an occupancy set from pixel cells for boundary detection.
 */
function buildOccupancySet(pixelCells) {
  const set = new Set();
  for (const c of pixelCells) {
    set.add(`${c.x},${c.y}`);
  }
  return set;
}

function isBoundaryCell(x, y, occupancy) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!occupancy.has(`${x + dx},${y + dy}`)) return true;
  }
  return false;
}

// ─── Salience computation ────────────────────────────────────────────────────

/**
 * Compute per-cell salience: how much this cell pulls the eye.
 * Factors: boundary (contour cells are salient), emphasis, isolation,
 * and vector curvature (sharp bends attract attention).
 */
function computeSalience(cell, isBoundary, vectorInfo) {
  let salience = 0.3; // base interior salience

  if (isBoundary) salience += 0.25;

  const emphasis = cell.emphasis !== undefined ? cell.emphasis : 1;
  salience += emphasis * 0.2;

  if (vectorInfo) {
    // High curvature = visual interest (sharp bends, corners)
    salience += vectorInfo.curvature * 0.15;
    // High pressure = bold strokes attract attention
    salience += vectorInfo.pressure * 0.1;
  }

  return Math.min(1, Math.round(salience * 1000) / 1000);
}

/**
 * Assign a perceptual role based on spatial + vector properties.
 */
function assignFeelRole(isBoundary, salience, vectorInfo, ny) {
  if (salience > 0.7) return 'focal';
  if (isBoundary) return 'contour';
  if (ny > 0.8) return 'ground';
  return 'interior';
}

// ─── Main fusion ─────────────────────────────────────────────────────────────

/**
 * Fuse a PixelBrain grid and Wand vectorPaths into a VixelField.
 *
 * @param {object} pixelGrid - SCDL compile output: { canvas: {width, height}, coordinates: [{x, y, color, partId, material, emphasis}] }
 * @param {Array<{role: string, points: Array<{x: number, y: number}>}>} vectorPaths - Wand output
 * @param {object} [options]
 * @param {string} [options.id] - Override field ID
 * @param {number} [options.maxSearchRadius] - Max distance² for vector matching (default: canvas diagonal²)
 * @returns {import('./vixel-schema.js').VixelField}
 */
export function fuseToVixelField(pixelGrid, vectorPaths, options = {}) {
  if (!pixelGrid || !pixelGrid.canvas || !Array.isArray(pixelGrid.coordinates)) {
    throw new Error('fuseToVixelField: pixelGrid must have canvas and coordinates');
  }
  if (!Array.isArray(vectorPaths)) {
    throw new Error('fuseToVixelField: vectorPaths must be an array');
  }

  const { width, height } = pixelGrid.canvas;
  const maxSearchRadius = options.maxSearchRadius ?? (width * width + height * height);

  // Build indices
  const vectorIndex = buildVectorIndex(vectorPaths);
  const occupancy = buildOccupancySet(pixelGrid.coordinates);

  // Fuse each pixel cell with its nearest vector provenance
  const vixels = [];

  for (const cell of pixelGrid.coordinates) {
    const { x, y } = cell;
    const ny = height > 1 ? y / (height - 1) : 0.5;

    // Find nearest vector point
    const vectorInfo = nearestVector(x, y, vectorIndex, maxSearchRadius);

    // Boundary detection
    const boundary = isBoundaryCell(x, y, occupancy);

    // Build pixel state
    const pixelState = Object.freeze({
      color: cell.color || '#000000',
      material: cell.material || 'source',
      partId: cell.partId || 'unknown',
      emphasis: cell.emphasis !== undefined ? cell.emphasis : 1,
      depthBand: cell.z !== undefined ? cell.z : 0,
    });

    // Build vector state
    const vectorState = Object.freeze({
      pathRef: vectorInfo ? vectorInfo.pathRef : 'unmatched',
      parametricT: vectorInfo ? vectorInfo.t : 0,
      normalX: vectorInfo ? vectorInfo.normalX : 0,
      normalY: vectorInfo ? vectorInfo.normalY : 0,
      curvature: vectorInfo ? vectorInfo.curvature : 0,
      pressure: vectorInfo ? vectorInfo.pressure : 0,
    });

    // Build feel state
    const salience = computeSalience(cell, boundary, vectorInfo);
    const feelState = Object.freeze({
      role: assignFeelRole(boundary, salience, vectorInfo, ny),
      salience,
      isBoundary: boundary,
    });

    vixels.push(Object.freeze({
      x,
      y,
      pixel: pixelState,
      vector: vectorState,
      feel: feelState,
    }));
  }

  // Sort for deterministic ordering (row-major)
  vixels.sort((a, b) => a.y - b.y || a.x - b.x);

  const fieldId = options.id || `vixel_${contentHash({ w: width, h: height, n: vixels.length })}`;

  const provenance = Object.freeze({
    pixelSource: pixelGrid.id || pixelGrid.source?.id || 'scdl-compiled',
    vectorSource: vectorPaths.map(p => p.role).join('+') || 'wand-composite',
    fusionVersion: 'VIXEL-FUSION-v1',
    vectorPathCount: vectorPaths.length,
    vectorPointCount: vectorIndex.length,
    matchedCells: vixels.filter(v => v.vector.pathRef !== 'unmatched').length,
    totalCells: vixels.length,
    matchRatio: vixels.length > 0
      ? Math.round((vixels.filter(v => v.vector.pathRef !== 'unmatched').length / vixels.length) * 1000) / 1000
      : 0,
  });

  const field = Object.freeze({
    schemaVersion: VIXEL_SCHEMA_VERSION,
    id: fieldId,
    width,
    height,
    vixels: Object.freeze(vixels),
    provenance,
    vixelHash: '', // computed below
  });

  // Content hash covers all vixel states
  const hashPayload = vixels.map(v => ({
    x: v.x, y: v.y,
    c: v.pixel.color, m: v.pixel.material,
    p: v.vector.pathRef, t: v.vector.parametricT,
    nx: v.vector.normalX, ny: v.vector.normalY,
    cv: v.vector.curvature,
    r: v.feel.role, s: v.feel.salience,
  }));

  const vixelHash = contentHash({ id: fieldId, w: width, h: height, v: hashPayload });

  // Return with hash (re-freeze)
  const finalField = Object.freeze({
    ...field,
    vixelHash,
  });

  // Validate before returning
  const errors = validateVixelField(finalField);
  if (errors.length > 0) {
    throw new Error(`fuseToVixelField: validation failed: ${errors.join('; ')}`);
  }

  return finalField;
}

/**
 * Compute a diff between two VixelFields (for iteration tracking).
 * Returns which channels changed and by how much.
 *
 * @param {import('./vixel-schema.js').VixelField} prev
 * @param {import('./vixel-schema.js').VixelField} curr
 * @returns {object} VixelDiff
 */
export function diffVixelFields(prev, curr) {
  if (!prev || !curr) {
    throw new Error('diffVixelFields: both fields required');
  }

  const prevMap = new Map(prev.vixels.map(v => [`${v.x},${v.y}`, v]));
  const currMap = new Map(curr.vixels.map(v => [`${v.x},${v.y}`, v]));

  let added = 0, removed = 0, colorChanged = 0, vectorChanged = 0, feelChanged = 0;
  const changedCells = [];

  for (const [key, cv] of currMap) {
    const pv = prevMap.get(key);
    if (!pv) {
      added++;
      continue;
    }
    if (pv.pixel.color !== cv.pixel.color) colorChanged++;
    if (pv.vector.pathRef !== cv.vector.pathRef ||
        Math.abs(pv.vector.parametricT - cv.vector.parametricT) > 0.01 ||
        Math.abs(pv.vector.curvature - cv.vector.curvature) > 0.01) {
      vectorChanged++;
    }
    if (pv.feel.role !== cv.feel.role ||
        Math.abs(pv.feel.salience - cv.feel.salience) > 0.01) {
      feelChanged++;
      changedCells.push({ x: cv.x, y: cv.y, prevRole: pv.feel.role, currRole: cv.feel.role });
    }
  }

  for (const key of prevMap.keys()) {
    if (!currMap.has(key)) removed++;
  }

  return Object.freeze({
    prevHash: prev.vixelHash,
    currHash: curr.vixelHash,
    identical: prev.vixelHash === curr.vixelHash,
    added,
    removed,
    colorChanged,
    vectorChanged,
    feelChanged,
    changedCells: Object.freeze(changedCells.slice(0, 50)), // cap for readability
    summary: prev.vixelHash === curr.vixelHash
      ? 'Fields are identical'
      : `Δ cells: +${added}/-${removed}, color: ${colorChanged}, vector: ${vectorChanged}, feel: ${feelChanged}`,
  });
}
