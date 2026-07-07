/**
 * SCDL Expand Vector Pass
 *
 * Thin dispatcher after raster-core extraction.
 * Delegates all rasterization to shared accept-predicate rasterizers in render/raster-core.js.
 * This keeps byte-identical output for legacy flat assets (proven by invariance suite).
 */

// Wire shared raster core (unclipped + canvas-clipped via accept)
import {
  pushCell, acceptAll, makeCanvasAccept,
  rasterizeCircle, rasterizeRing, rasterizeRect, rasterizePolygon,
  rasterizePath, rasterizeSphere, rasterizeEllipse, rasterizeLine,
} from '../render/raster-core.js';
import { applyBooleanOp } from './lower-booleans.js';

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {object} new AST with vector ops replaced by cell ops
 */
export function expandVectorPass(ast, _errors) {
  const { canvas } = ast;
  const accept = makeCanvasAccept(canvas.width, canvas.height);

  const newParts = ast.parts.map(part => {
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
          applyBooleanOp(op.op, op.targets, part, canvas.width, canvas.height, newOps, _errors); break;
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

  return { ...ast, parts: newParts };
}

