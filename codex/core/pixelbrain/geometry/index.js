/**
 * index.js — PixelBrain Geometry Kernel v1
 *
 * Single entry point for the geometry kernel.
 *
 * Import the whole kernel:
 *   import * as Geo from './geometry/index.js';
 *
 * Or cherry-pick:
 *   import { fillPolygon, unionCellSets } from './geometry/index.js';
 *
 * Module map:
 *
 *   cell-key.js         — cellKey / parseCellKey (canonical coordinate encoding)
 *   cell-set.js         — CellSet factory and helpers (create, add, remove, has, toArray)
 *   bounds.js           — AABB helpers (getCellBounds, containsPoint, intersectsBounds, expand, clamp)
 *   lattice-booleans.js — Set-theoretic ops (union, subtract, intersect, difference)
 *   fill.js             — SDF-to-lattice (fillFromSDF, floodFillFromSDF)
 *   raster-fill.js      — Shape fill rasterizers (polygon, ellipse, circle, thick line, rect)
 *   spatial-hash.js     — Grid-bucketed spatial index (build, query, nearest)
 *   lattice-queries.js  — Geometric queries on CellSets (border, interior, components, dilate, erode)
 */

// Cell key — primitive coordinate encoding
export { cellKey, parseCellKey } from './cell-key.js';

// Cell set — canonical lattice-region container
export {
  createCellSet,
  cellSetToArray,
  hasCell,
  addCell,
  removeCell,
} from './cell-set.js';

// Bounds — AABB helpers
export {
  getCellBounds,
  containsPoint,
  intersectsBounds,
  expandBounds,
  clampBoundsToCanvas,
} from './bounds.js';

// Lattice booleans — set-theoretic shape operations
export {
  unionCellSets,
  subtractCellSets,
  intersectCellSets,
  differenceCellSets,
} from './lattice-booleans.js';

// Fill — SDF-to-lattice rasterizer
export { fillFromSDF, floodFillFromSDF } from './fill.js';

// Raster fill — shape fill primitives
export {
  fillPolygon,
  fillEllipse,
  fillCircle,
  fillThickLine,
  fillRect,
} from './raster-fill.js';

// Spatial hash — grid-accelerated lookup
export {
  buildSpatialHash,
  querySpatialHash,
  nearestCell,
} from './spatial-hash.js';

// Lattice queries — geometric operations on CellSets
export {
  getBorderCells,
  getInteriorCells,
  getConnectedComponents,
  dilateCellSet,
  erodeCellSet,
  countBorderCells,
} from './lattice-queries.js';
