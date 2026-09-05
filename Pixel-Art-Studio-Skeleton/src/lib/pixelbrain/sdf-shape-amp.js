/**
 * SDF-SHAPE-AMP.js
 * Consumes PB-SDF-v1 (from part spec or profile) + construction skeleton.
 * Emits integer partCells by sampling SDF at cell centers and quantizing (inside <=0).
 * Follows all PDR rules: cell-center sampling, construction-guided bounds, loud failure, lattice only.
 */
import { hashString } from './shared.js';
import { evaluateSDF } from './sdf-evaluator.js';
import { applyAuthoringSemantics } from './semantic-bridge.js';
import { resolveRole, CanonicalRoles } from './semantic-registry.js';

export const SDF_SHAPE_AMP_ID = 'sdf-shape';
export const SDF_SHAPE_AMP_VERSION = '1.0.0';

function err(msg, ctx) { const e = new Error(`sdf-shape-amp: ${msg}`); e.cause = ctx; return e; }

function toFiniteNum(n, d=0) { const v=Number(n); return Number.isFinite(v)?v:d; }

export function SDFShapeAMP(context = {}, options = {}) {
  const construction = context.construction || context.skeleton || {};
  const sdfDesc = options.sdf || context.part?.sdf || context.sdf;
  const partId = options.partId || context.partId || 'part';
  const minCells = options.minCells || context.minCells || 1;

  if (!sdfDesc || sdfDesc.contract !== 'PB-SDF-v1') {
    // no SDF, return empty or passthrough? Per PDR if declared required, fail later.
    return { partCells: [], sdfDebugMask: [] };
  }

  // Bounds from construction if present, else from sdf domain or default
  let minX=0, minY=0, maxX=63, maxY=63;
  const skel = construction.skeleton || construction;
  if (skel && skel.center) {
    const c = skel.center;
    const r = Math.max(...(skel.rings || []).map(rr => toFiniteNum(rr.radius || rr, 0))) || 32;
    minX = Math.floor(toFiniteNum(c.x, 32) - r - 2);
    minY = Math.floor(toFiniteNum(c.y, 32) - r - 2);
    maxX = Math.ceil(toFiniteNum(c.x, 32) + r + 2);
    maxY = Math.ceil(toFiniteNum(c.y, 32) + r + 2);
  }
  if (sdfDesc.domain) {
    minX = Math.min(minX, Math.floor(sdfDesc.domain.min.x));
    minY = Math.min(minY, Math.floor(sdfDesc.domain.min.y));
    maxX = Math.max(maxX, Math.ceil(sdfDesc.domain.max.x));
    maxY = Math.max(maxY, Math.ceil(sdfDesc.domain.max.y));
  }
  // clamp to canvas-ish
  minX = Math.max(0, minX); minY=Math.max(0,minY);
  maxX = Math.min(255, maxX); maxY=Math.min(255, maxY); // generous

  const cells = [];
  function toFiniteNum(n, d=0) { const v=Number(n); return Number.isFinite(v)?v:d; }

  const debug = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = evaluateSDF(sdfDesc, x + 0.5, y + 0.5);
      if (d <= 0) {
        cells.push({ x, y, partId, color: options.defaultColor || '#ffffff' });
      } else if (options.feather && d < options.feather) {
        // deterministic soft: hash decide
        const p = 1 - (d / options.feather);
        const h = (hashString(`${x},${y},${sdfDesc.id || 0}`) >>> 0) % 1000;
        if (h < p * 1000) cells.push({ x, y, partId, color: options.defaultColor || '#ffffff' });
      }
      debug.push({ x, y, d });
    }
  }

  if (cells.length < minCells) {
    throw err(`SDFShapeAMP emitted ${cells.length} cells for ${partId}, required >=${minCells}`, {sdf: sdfDesc.id});
  }

  // === SemQuant connective tissue wiring ===
  // Apply authoring semantics if construction or part spec is provided
  let semantic = null;
  const authoringSource = context.sdf || context.part || context.construction || options.authoringSource;
  if (authoringSource) {
    try {
      const semResult = applyAuthoringSemantics(authoringSource);
      semantic = {
        annotations: semResult.annotations || [],
        sourceKind: semResult.sourceKind || 'sdf',
      };
    } catch (_) {
      // Authoring annotations are optional; geometry remains canonical without them.
    }
  }

  // Enrich cells with resolved semantic role / part
  const resolvedRole = resolveRole(partId) || CanonicalRoles.CORE;
  const enrichedCells = cells.map(c => ({
    ...c,
    role: c.role || resolvedRole,
    semanticRole: resolvedRole,
    partId: c.partId || partId,
  }));

  return {
    partCells: enrichedCells,
    sdfDebugMask: debug,
    semantic, // New: SemQuant annotations if available
  };
}

export const SDF_SHAPE_AMP_SEAM = Object.freeze({
  id: 'sdf-shape-v1',
  processor: SDF_SHAPE_AMP_ID,
  version: SDF_SHAPE_AMP_VERSION,
  consumes: ['construction.skeleton', 'silhouette.cells', 'silhouette.partOf', 'spec.parts'],
  emits: ['part.*.cells', 'geometry.masks'],
  mutates: ['silhouette.cells', 'silhouette.partOf'],
});

export default { SDFShapeAMP, id: SDF_SHAPE_AMP_ID, seam: SDF_SHAPE_AMP_SEAM };
