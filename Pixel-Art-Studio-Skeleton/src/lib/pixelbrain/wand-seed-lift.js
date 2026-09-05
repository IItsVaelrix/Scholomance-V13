import { ENERGY_TYPES } from './voxel-volume.js';
import { rasterizeTextToPixels, extractGlyphOutline } from './glyph-rasterizer.js';
import { applyGravityAMP } from './gravity-amp.js';

export const SEED_CONFIGS = Object.freeze({
  'fibonacci':        { lift: 'surface_scatter',   energySpread: 'radial'    },
  'fractal_iter':     { lift: 'recursive_columns',  energySpread: 'fractal'   },
  'parametric_curve': { lift: 'terrain_ridge',      energySpread: 'linear'    },
  'grid_projection':  { lift: 'floor_plane',        energySpread: 'uniform'   },
  'composite':        { lift: 'multi_region',       energySpread: 'blended'   },
  'vectorized_text':  { lift: 'glyph_monuments',    energySpread: 'inscribed' },
});

export function liftToVoxelSeeds(coords2D, volume, options = {}) {
  const {
    energyType = ENERGY_TYPES.STRUCTURAL,
    initialEnergy = 1.0,
    yProjection = 'surface',
    canvasSize = { width: 800, height: 600 },
  } = options;

  const surfaceY = Math.floor(volume.height * 0.75);
  const midY = Math.floor(volume.height / 2);
  const vy = yProjection === 'surface' ? surfaceY : midY;

  return coords2D.map(({ x, y }) => {
    const vx = Math.round((x / canvasSize.width) * (volume.width - 1));
    const vz = Math.round((y / canvasSize.height) * (volume.depth - 1));
    return {
      vx: Math.max(0, Math.min(volume.width - 1, vx)),
      vy: Math.max(0, Math.min(volume.height - 1, vy)),
      vz: Math.max(0, Math.min(volume.depth - 1, vz)),
      energy: initialEnergy,
      energyType,
    };
  });
}

// Generates Fibonacci golden-ratio spiral seed points directly —
// does not depend on formula-to-coordinates.js to avoid coupling.
export function generateFibonacciSeeds(formula, volume, options = {}) {
  const { iterations = 8, scale = 0.75 } = formula;
  const canvasSize = options.canvasSize ?? { width: 800, height: 600 };
  const { width: cw, height: ch } = canvasSize;
  const cx = cw / 2, cy = ch / 2;
  const phi = (1 + Math.sqrt(5)) / 2;
  // Number of points derived from golden ratio power — matches Fibonacci sequence count
  const n = Math.round(Math.pow(phi, iterations));
  const maxR = Math.min(cw, ch) * scale * 0.5;
  const coords2D = [];

  for (let i = 0; i < n; i++) {
    const angle = i * 2 * Math.PI * (1 - 1 / phi);
    const r = Math.sqrt(i / n) * maxR;
    coords2D.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }

  return liftToVoxelSeeds(coords2D, volume, { ...options, canvasSize });
}

export function generateVectorizedTextSeeds(text, volume, options = {}) {
  const { canvasSize, createCanvas, gravityOptions = {}, fontSize, fontFamily } = options;

  const cells = rasterizeTextToPixels(text, { fontSize, fontFamily, createCanvas, canvasSize });
  const outlineCells = extractGlyphOutline(cells);

  if (outlineCells.length === 0) return [];

  const xzSeeds = liftToVoxelSeeds(outlineCells, volume, { canvasSize });
  return applyGravityAMP(xzSeeds, volume, gravityOptions);
}

// =====================================================================
// QBIT-Voxel Level 3 (The World) — composite formula seed generation
// =====================================================================

/**
 * Determine which region of a composite formula a 2D coordinate falls into.
 * Returns the child index, or -1 if the coordinate is outside all regions.
 * Pure function: same input always returns the same output.
 *
 * @param {{x: number, y: number}} coord
 * @param {Array} children  composite formula children
 * @returns {number}  child index, or -1
 */
export function classifyCoordInRegions(coord, children) {
  for (let i = 0; i < children.length; i++) {
    const r = children[i].region;
    if (!r) continue;
    if ('width' in r && 'depth' in r) {
      // rect region
      if (coord.x >= r.x && coord.x < r.x + r.width
          && coord.y >= r.z && coord.y < r.z + r.depth) {
        return i;
      }
    } else if ('seed' in r && 'radius' in r) {
      // voronoi-style disc (approximated as a circle, no exact Voronoi yet)
      // The 2D coord uses (x, y) where y is the Z-axis world coord; the
      // region's seed uses (x, z). Map accordingly.
      const dx = coord.x - r.seed.x;
      const dz = coord.y - r.seed.z;
      if (dx * dx + dz * dz <= r.radius * r.radius) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Lift 2D coordinates to 3D QBIT seed points, tagging each with the energy
 * type of the composite region it falls into. PDR §3.1 F-5.
 *
 * The Y projection follows the existing `liftToVoxelSeeds` semantics
 * (`surface` or any non-surface value goes to mid-height). The new dimension
 * is the per-region energy type assignment.
 *
 * @param {Array<{x: number, y: number}>} coords2D
 * @param {Object} volume  VoxelVolume
 * @param {Object} options
 * @param {Array} options.children  composite formula children, each with `{region, energyType}`
 * @param {number} [options.defaultEnergyType]  fallback energy type for coords outside any region
 * @param {number} [options.initialEnergy=1.0]
 * @param {string} [options.yProjection='surface']
 * @param {{width: number, height: number}} [options.canvasSize]
 * @returns {Array<{vx, vy, vz, energy, energyType, region}>}
 */
export function liftToMultiRegionVoxelSeeds(coords2D, volume, options = {}) {
  const {
    children = [],
    defaultEnergyType,
    initialEnergy = 1.0,
    yProjection = 'surface',
    canvasSize = { width: 800, height: 600 },
  } = options;

  const surfaceY = Math.floor(volume.height * 0.75);
  const midY = Math.floor(volume.height / 2);
  const vy = yProjection === 'surface' ? surfaceY : midY;

  return coords2D.map(({ x, y }) => {
    const vx = Math.round((x / canvasSize.width) * (volume.width - 1));
    const vz = Math.round((y / canvasSize.height) * (volume.depth - 1));

    const regionIndex = classifyCoordInRegions({ x, y }, children);
    const energyType = regionIndex >= 0
      ? (children[regionIndex].energyType ?? defaultEnergyType)
      : defaultEnergyType;

    return {
      vx: Math.max(0, Math.min(volume.width - 1, vx)),
      vy: Math.max(0, Math.min(volume.height - 1, vy)),
      vz: Math.max(0, Math.min(volume.depth - 1, vz)),
      energy: initialEnergy,
      energyType,
      region: regionIndex,
    };
  });
}

/**
 * Generate a Fibonacci seed cluster for a single region of a composite
 * formula. The Fibonacci spiral is parameterized by the region's local
 * bounding box, not the world. This preserves the world-continuity property
 * because the spiral is still a pure function of (regionX, regionZ) — the
 * only difference from a global Fibonacci is the spiral's center and
 * bounding-box scale.
 *
 * @param {{x: number, z: number, width: number, depth: number}} rectRegion
 * @param {Object} formula  Fibonacci formula params (iterations, scale)
 * @param {number} energyType
 * @returns {Array<{x: number, y: number}>}  2D coords within the region
 */
export function generateFibonacciInRegion(rectRegion, formula, _energyType) {
  const { iterations = 6, scale = 0.75 } = formula;
  const phi = (1 + Math.sqrt(5)) / 2;
  const n = Math.round(Math.pow(phi, iterations));
  const cx = rectRegion.x + rectRegion.width / 2;
  const cy = rectRegion.z + rectRegion.depth / 2;
  const maxR = Math.min(rectRegion.width, rectRegion.depth) * scale * 0.5;
  const coords2D = [];

  for (let i = 0; i < n; i++) {
    const angle = i * 2 * Math.PI * (1 - 1 / phi);
    const r = Math.sqrt(i / n) * maxR;
    coords2D.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  }
  return coords2D;
}

/**
 * Generate composite seeds for a chunk window. PDR §3.1 F-5.
 *
 * For each child of the composite formula, generates seeds within the
 * child's region (clipped to the chunk window) and tags them with the
 * child's energy type. The combined output is the multi-region seed set
 * for the chunk.
 *
 * @param {Object} formula  WandFormulaComposite
 * @param {{x0: number, z0: number, x1: number, z1: number}} chunkWindow
 * @param {Object} volume  VoxelVolume (chunk-sized)
 * @param {Object} [options]
 * @param {number} [options.initialEnergy=1.0]
 * @param {string} [options.yProjection='surface']
 * @returns {Array<{vx, vy, vz, energy, energyType, region}>}
 */
export function generateCompositeSeeds(formula, chunkWindow, volume, options = {}) {
  if (!formula || formula.type !== 'composite') {
    throw new TypeError('generateCompositeSeeds requires a formula of type "composite"');
  }
  if (!Array.isArray(formula.children) || formula.children.length === 0) {
    throw new RangeError('Composite formula must have at least one child');
  }
  if (!chunkWindow
      || typeof chunkWindow.x0 !== 'number'
      || typeof chunkWindow.z0 !== 'number'
      || typeof chunkWindow.x1 !== 'number'
      || typeof chunkWindow.z1 !== 'number') {
    throw new TypeError('chunkWindow must be {x0, z0, x1, z1}');
  }

  const { initialEnergy = 1.0, yProjection = 'surface' } = options;
  const { x0, z0, x1, z1 } = chunkWindow;
  const surfaceY = Math.floor(volume.height * 0.75);
  const midY = Math.floor(volume.height / 2);
  const vy = yProjection === 'surface' ? surfaceY : midY;

  const allCoords = [];   // 2D coords with region metadata

  for (let childIdx = 0; childIdx < formula.children.length; childIdx++) {
    const child = formula.children[childIdx];
    const r = child.region;
    if (!r) continue;

    let regionCoords2D = [];
    if ('width' in r && 'depth' in r) {
      // Rect region: clip to chunk window, then generate Fibonacci in the
      // visible sub-rect.
      const visibleX0 = Math.max(x0, r.x);
      const visibleZ0 = Math.max(z0, r.z);
      const visibleX1 = Math.min(x1, r.x + r.width);
      const visibleZ1 = Math.min(z1, r.z + r.depth);
      const visibleW = visibleX1 - visibleX0;
      const visibleD = visibleZ1 - visibleZ0;
      if (visibleW <= 0 || visibleD <= 0) continue;
      const localRegion = {
        x: visibleX0,
        z: visibleZ0,
        width: visibleW,
        depth: visibleD,
      };
      if (child.type === 'fibonacci') {
        regionCoords2D = generateFibonacciInRegion(localRegion, child, child.energyType);
      } else {
        // Other formula types: place a single seed at the region center.
        // (Full implementations of fractal_iter / parametric_curve / etc. in
        // multi-region form are follow-up work; the seed-identity continuity
        // property is proven by Fibonacci in this phase.)
        regionCoords2D.push({ x: localRegion.x + localRegion.width / 2, y: localRegion.z + localRegion.depth / 2 });
      }
    } else if ('seed' in r && 'radius' in r) {
      // Voronoi-style disc: a single seed at the disc center.
      const sx = r.seed.x;
      const sz = r.seed.z;
      if (sx >= x0 && sx < x1 && sz >= z0 && sz < z1) {
        regionCoords2D.push({ x: sx, y: sz });
      }
    }

    for (const c of regionCoords2D) {
      allCoords.push({ x: c.x, y: c.y, region: childIdx, energyType: child.energyType });
    }
  }

  return liftToMultiRegionVoxelSeeds(allCoords, volume, {
    children: formula.children,
    initialEnergy,
    yProjection,
    canvasSize: { width: x1 - x0, height: z1 - z0 },
  });
}
