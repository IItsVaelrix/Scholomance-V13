/**
 * SCDL Expand Vector Pass
 *
 * Thin dispatcher after raster-core extraction.
 * Delegates all rasterization to shared accept-predicate rasterizers in render/raster-core.js.
 * This keeps byte-identical output for legacy flat assets (proven by invariance suite).
 *
 * Runs in two phases because union/subtract/intersect address SIBLING PARTS
 * by part id (see lower-booleans.js) and so can't resolve until every part's
 * own shape has been rasterized:
 *   Phase 1 (per part): rasterize every op except union/subtract/intersect,
 *     which are carried through unresolved.
 *   Phase 2 (whole asset): resolveBooleanOpsPass looks up each boolean op's
 *     target parts against the now-complete per-part cell sets.
 */

// Wire shared raster core (unclipped + canvas-clipped via accept)
import {
  pushCell, acceptAll, makeCanvasAccept,
  rasterizeCircle, rasterizeRing, rasterizeRect, rasterizePolygon,
  rasterizePath, rasterizeSphere, rasterizeEllipse, rasterizeLine,
} from '../render/raster-core.js';
import { resolveBooleanOpsPass } from './lower-booleans.js';

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {object} new AST with vector ops replaced by cell ops
 */
export function expandVectorPass(ast, _errors) {
  const { canvas } = ast;
  const accept = makeCanvasAccept(canvas.width, canvas.height);

  // Phase 1: rasterize each part's own vector ops in isolation.
  const rasterizedParts = ast.parts.map(part => {
    const newOps = [];
    for (const op of part.ops) {
      const opWithContext = { ...op, partId: op.partId || part.id };
      switch (op.op) {
        case 'circle':   rasterizeCircle(opWithContext, accept, newOps);   break;
        case 'ring':     rasterizeRing(opWithContext, accept, newOps);     break;
        case 'rect':     rasterizeRect(opWithContext, accept, newOps);     break;
        case 'polygon':  rasterizePolygon(opWithContext, accept, newOps);  break;
        case 'path':     rasterizePath(opWithContext, accept, newOps);     break;
        case 'sphere':   rasterizeSphere(opWithContext, accept, newOps);   break;
        case 'ellipse':  rasterizeEllipse(opWithContext, accept, newOps);  break;
        case 'line':     rasterizeLine(opWithContext, accept, newOps);     break;
        case 'rotate': case 'scale': case 'translate': break; // reserved, emit nothing (unchanged)
        case 'union': case 'subtract': case 'intersect':
          newOps.push(opWithContext); break; // resolved cross-part in phase 2
        case 'reference': case 'instance':
          if (opWithContext.ref) {
            pushCell(newOps, 0, 0, '#ffffff', opWithContext.loc || {}, { ...opWithContext, role: 'reference' });
          }
          break;
        default: newOps.push(op); break;
      }
    }
    return { ...part, ops: newOps, _vectorExpanded: true };
  });

  // Phase 2: resolve boolean ops now that every part's own shape is known.
  const newParts = resolveBooleanOpsPass(rasterizedParts, _errors);

  return { ...ast, parts: newParts };
}

