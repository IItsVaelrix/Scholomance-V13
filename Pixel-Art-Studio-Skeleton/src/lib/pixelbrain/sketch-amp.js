/**
 * SKETCH AMP — Silhouette Authoring → Auto-Shaded Template + Construction Geometry
 *
 * Two related but distinct sketch responsibilities:
 * 1. Legacy silhouette path (hand-painted → distance-transform shaded template).
 * 2. Artist/reference construction geometry (SketchAMP proper): precise guides
 *    for radial/shield assets (center, rings, radials) that feed 00_Reference.
 *
 * The construction side is powered by the Construction Line Microprocessor.
 * This module now acts as the SketchAMP facade (per 2026-06-12 PDR).
 *
 *   ITEM-SPEC (with construction) ──runSketchAMP──▶ referenceCells + hints
 *        └── used by item-foundry + foundry-aseprite-bridge (00_Reference)
 *
 * Pure + deterministic.
 */

import { clampNumber, hslToHex } from './shared.js';
import { estimateNormals } from './normal-estimation.js';
import { ENERGY_TYPES } from './voxel-volume.js';

const DEFAULT_BANDS = 4;
const MIN_BANDS = 2;
const MAX_BANDS = 8;
const DIAG = Math.SQRT2;

function slotToNeutralGrey(slot, bands) {
  const ratio = bands <= 1 ? 0 : slot / (bands - 1);
  return hslToHex(0, 0, Math.round(12 + ratio * 78)); // L: 12 → 90
}

/**
 * Convert a painted sketch into an auto-shaded silhouette template.
 *
 * @param {Array<{x:number,y:number}>} occupied - painted cells (col/row also accepted)
 * @param {{ width:number, height:number }} dimensions
 * @param {{ bands?:number, symmetry?:'none'|'vertical'|'horizontal' }} [options]
 * @returns {{ coordinates: Array, bands: number, isTemplate: true, dimensions: Object }}
 */
export function sketchToSilhouette(occupied, dimensions, options = {}) {
  const width = Math.max(1, Math.round(Number(dimensions?.width) || 32));
  const height = Math.max(1, Math.round(Number(dimensions?.height) || 32));
  const bands = Math.round(clampNumber(options.bands ?? DEFAULT_BANDS, MIN_BANDS, MAX_BANDS));
  const symmetry = options.symmetry || 'none';

  // 1. Occupancy grid.
  const grid = new Uint8Array(width * height);
  const mark = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y * width + x] = 1;
  };
  (Array.isArray(occupied) ? occupied : []).forEach((cell) => {
    const x = Math.round(Number(cell?.x ?? cell?.col));
    const y = Math.round(Number(cell?.y ?? cell?.row));
    if (Number.isFinite(x) && Number.isFinite(y)) mark(x, y);
  });

  // 2. Symmetry mirror — author half, get the whole sprite.
  if (symmetry === 'vertical') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (grid[y * width + x]) mark(width - 1 - x, y);
      }
    }
  } else if (symmetry === 'horizontal') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (grid[y * width + x]) mark(x, height - 1 - y);
      }
    }
  }

  // 3. Distance transform — two-pass chamfer (distance to nearest background).
  const INF = 1e9;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < grid.length; i += 1) dist[i] = grid[i] ? INF : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!grid[i]) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - width] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - width - 1] + DIAG);
      if (x < width - 1 && y > 0) d = Math.min(d, dist[i - width + 1] + DIAG);
      dist[i] = d;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (!grid[i]) continue;
      let d = dist[i];
      if (x < width - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < height - 1) d = Math.min(d, dist[i + width] + 1);
      if (x < width - 1 && y < height - 1) d = Math.min(d, dist[i + width + 1] + DIAG);
      if (x > 0 && y < height - 1) d = Math.min(d, dist[i + width - 1] + DIAG);
      dist[i] = d;
    }
  }

  // 4. Quantize distance → value slot (rim dark, core light) → template coords.
  let maxDist = 0;
  for (let i = 0; i < dist.length; i += 1) {
    if (grid[i] && dist[i] > maxDist) maxDist = dist[i];
  }

  const hasLight = options.light != null;
  const lightAngle = options.light?.angle ?? (Math.PI * 1.25); // Default top-left
  const Lx = Math.cos(lightAngle);
  const Ly = Math.sin(lightAngle);
  const ambient = options.light?.ambient ?? 0.3;
  const normals = hasLight ? estimateNormals(dist, width, height) : null;

  const coordinates = [];
  const lastSlot = Math.max(1, bands - 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!grid[i]) continue;
      
      const norm = maxDist > 0 ? dist[i] / maxDist : 0; // 0 = rim, 1 = core
      let slot;
      let shadingClass = 'core';

      if (hasLight) {
        const { nx, ny } = normals[i];
        // Dot product of normal and light vector
        const dot = nx * Lx + ny * Ly;
        const illum = ambient + (1 - ambient) * Math.max(0, dot);
        
        // Slot is quantized illuminated depth
        slot = Math.min(lastSlot, Math.max(0, Math.round(illum * norm * lastSlot)));

        // Classify shading
        if (norm === 0) {
          // Rim/silhouette cell
          if (dot > 0.8) { // Tight cone for specular
            shadingClass = 'specular-edge';
            slot = lastSlot; // Pin to high anchor
          } else if (dot > 0) {
            shadingClass = 'lit';
          } else {
            shadingClass = 'shadow';
          }
        } else {
          if (dot > 0.3) {
            shadingClass = 'lit';
          } else if (dot < -0.3) {
            shadingClass = 'shadow';
          } else {
            shadingClass = 'core';
          }
        }
      } else {
        // Legacy radial shading
        slot = Math.min(lastSlot, Math.max(0, Math.round(norm * lastSlot)));
      }

      // Emit, don't hide: the chamfer field IS a normalized STRUCTURAL energy
      // field (dist / spine), the depth/mass currency VolumeLiftAMP consumes.
      // `norm` is the whole-silhouette single-part form of clamp(dist/R_part).
      coordinates.push({
        x,
        y,
        z: 0,
        snappedX: x,
        snappedY: y,
        slot,
        emphasis: slot / lastSlot,
        isRim: slot === 0,
        color: slotToNeutralGrey(slot, bands),
        source: 'sketch',
        shading: shadingClass,
        nx: hasLight ? normals[i].nx : 0,
        ny: hasLight ? normals[i].ny : 0,
        structuralEnergy: norm,
        energies: [{ type: ENERGY_TYPES.STRUCTURAL, value: norm }],
      });
    }
  }

  return {
    coordinates,
    bands,
    isTemplate: true,
    dimensions: { width, height, gridSize: 1 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SketchAMP + Construction Line facade (new in SketchAMP evolution)
// Re-exports the microprocessor API under the SketchAMP namespace for the PDR contract.
// -----------------------------------------------------------------------------

import {
  applyConstructionLines,
  renderConstructionGuides,
  extractConstructionFromReference,
  validateConstructionAgainstSpec,
  buildConstructionPayload,
  runConstructionLineProcessor,
  normalizeConstructionSpec,
  normalizeConstructionSpec as parseConstructionSpec,
  CONSTRUCTION_LINE_MICROPROCESSOR_ID,
  CONSTRUCTION_VERSION,
} from './construction-line-microprocessor.js';

/**
 * Primary SketchAMP entrypoint.
 * If the (normalized) spec contains a `construction` section (or top-level construction),
 * runs the Construction Line Microprocessor and returns reference geometry + hints.
 * Otherwise falls back gracefully (for silhouette path compatibility).
 *
 * @param {Object} spec - ITEM-SPEC-v1 or partial containing .construction
 * @param {Object} [options]
 * @returns {{ referenceCells?, constructionHints?, spec?, isConstruction: boolean, ...silhouette? }}
 */
export function runSketchAMP(spec = {}, options = {}) {
  const constructionRaw = spec?.construction || spec;
  const hasConstruction = !!(constructionRaw && (constructionRaw.rings || constructionRaw.radii || constructionRaw.center || constructionRaw.radials));

  if (hasConstruction) {
    const result = applyConstructionLines([], constructionRaw, options);
    return Object.freeze({
      ...result,
      isConstruction: true,
      amp: CONSTRUCTION_LINE_MICROPROCESSOR_ID,
      version: CONSTRUCTION_VERSION,
      harmonic: result.constructionHints?.harmonic || false,
      symmetricGuides: result.constructionHints?.symmetricGuides || false,
    });
  }

  // Legacy silhouette path (no construction) — return the silhouette result shape for compatibility
  // (caller usually already called sketchToSilhouette separately)
  return Object.freeze({
    isConstruction: false,
    isTemplate: false,
    note: 'no construction section; use sketchToSilhouette for silhouette path',
  });
}

// Re-export the microprocessor surface so callers can use either:
//   import { runSketchAMP, applyConstructionLines } from './sketch-amp.js'
export {
  applyConstructionLines,
  renderConstructionGuides,
  extractConstructionFromReference,
  validateConstructionAgainstSpec,
  buildConstructionPayload,
  runConstructionLineProcessor,
  parseConstructionSpec,
  normalizeConstructionSpec,
  CONSTRUCTION_LINE_MICROPROCESSOR_ID,
  CONSTRUCTION_VERSION,
};
