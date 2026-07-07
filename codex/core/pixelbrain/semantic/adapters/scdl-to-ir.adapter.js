/**
 * SCDL → PixelBrain IR adapter for SemQuant.
 *
 * Thin bridge: converts parsed SCDL AST into IR nodes with source provenance
 * so the semantic unifier can attach annotations.
 *
 * This adapter is intentionally minimal for Phase 1.
 */

import { createIRNode } from '../pixelbrain-ir-node.js';

export function scdlAstToIR(ast, options = {}) {
  if (!ast) return { schemaVersion: 'PB-IR-v1', sourceKind: 'scdl', nodes: [] };

  const nodes = [];
  const filePath = options.filePath || ast.filePath || null;

  // Process parts and their ops
  const parts = Array.isArray(ast.parts) ? ast.parts : [];

  for (const part of parts) {
    const partId = part.id || 'unnamed';
    const partLoc = part.loc || part.sourceSpan || { line: 1, col: 1 };

    // Create a node for the part itself (carries material + role intent)
    const partNodeId = `scdl:part:${partId}`;
    nodes.push(
      createIRNode({
        id: partNodeId,
        kind: 'PartGroup',
        payload: {
          partId,
          material: part.material || 'source',
          role: part.role || null, // future explicit support
        },
        sourceRefs: [
          {
            system: 'scdl',
            file: filePath,
            line: partLoc.line ?? partLoc.line,
            col: partLoc.col ?? 1,
            opId: partNodeId,
          },
        ],
      })
    );

    const ops = Array.isArray(part.ops) ? part.ops : [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const opId = op.id || `scdl:${partId}:${i}:${op.op || 'op'}`;

      const loc = op.loc || op.sourceSpan || partLoc;

      nodes.push(
        createIRNode({
          id: opId,
          kind: inferKindFromScdlOp(op),
          payload: {
            ...op,
            op: op.op,
            partId,
            material: op.material || part.material || 'source',
            role: op.role || null,
          },
          sourceRefs: [
            {
              system: 'scdl',
              file: filePath,
              line: loc?.line ?? 1,
              col: loc?.col ?? 1,
              opId,
            },
          ],
        })
      );
    }
  }

  return {
    schemaVersion: 'PB-IR-v1',
    sourceKind: 'scdl',
    nodes,
  };
}

function inferKindFromScdlOp(op) {
  const verb = (op.op || '').toLowerCase();

  if (['circle', 'ring', 'rect', 'polygon', 'path', 'sphere', 'cell'].includes(verb)) {
    return 'GeometryOp';
  }
  if (['glow', 'trace'].includes(verb)) {
    return 'EffectIntent';
  }
  if (verb === 'fill') {
    return 'MaterialBinding';
  }
  if (verb === 'symmetry') {
    return 'ConstructionGuide'; // symmetry often implies construction intent
  }
  return 'GeometryOp';
}
