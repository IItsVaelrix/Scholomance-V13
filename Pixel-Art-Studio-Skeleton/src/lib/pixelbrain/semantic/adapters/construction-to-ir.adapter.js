/**
 * Construction → PixelBrain IR adapter (stub for SemQuant Phase 1)
 *
 * Demonstrates how a construction spec (from Construction Line Microprocessor)
 * can be turned into IR nodes targeting the same canonical shape.
 *
 * This is intentionally minimal. Real version would take a full
 * PB-CONSTRUCTION-SKELETON-v1 or referenceCells + spec.
 */

import { createIRNode } from '../pixelbrain-ir-node.js';

export function constructionSpecToIR(spec, options = {}) {
  if (!spec || !spec.center) {
    return { schemaVersion: 'PB-IR-v1', sourceKind: 'construction', nodes: [] };
  }

  const nodes = [];
  const filePath = options.filePath || null;
  const center = spec.center;

  // Create a construction guide node for the center
  nodes.push(
    createIRNode({
      id: `construction:center:${center.x},${center.y}`,
      kind: 'ConstructionGuide',
      payload: {
        type: 'center',
        x: center.x,
        y: center.y,
        role: 'constructionGuide',
      },
      sourceRefs: [
        {
          system: 'construction',
          file: filePath,
          opId: 'center',
        },
      ],
    })
  );

  // Rings become construction guides
  if (Array.isArray(spec.rings)) {
    spec.rings.forEach((ring, idx) => {
      const radius = typeof ring === 'number' ? ring : ring.radius || ring.r || 0;
      const role = ring.role || `ring-${idx}`;
      nodes.push(
        createIRNode({
          id: `construction:ring:${role}:${radius}`,
          kind: 'ConstructionGuide',
          payload: {
            type: 'ring',
            center: { x: center.x, y: center.y },
            radius,
            role: 'constructionGuide',
            ringRole: role,
          },
          sourceRefs: [
            {
              system: 'construction',
              file: filePath,
              opId: `ring:${role}`,
            },
          ],
        })
      );
    });
  }

  // Radials / spokes
  if (spec.radials && (spec.radials.count || spec.radials.num)) {
    const count = spec.radials.count || spec.radials.num;
    nodes.push(
      createIRNode({
        id: `construction:radials:${count}`,
        kind: 'ConstructionGuide',
        payload: {
          type: 'radials',
          count,
          offsetDegrees: spec.radials.offsetDegrees || 0,
          role: 'constructionGuide',
        },
        sourceRefs: [
          {
            system: 'construction',
            file: filePath,
            opId: 'radials',
          },
        ],
      })
    );
  }

  return {
    schemaVersion: 'PB-IR-v1',
    sourceKind: 'construction',
    nodes,
  };
}
