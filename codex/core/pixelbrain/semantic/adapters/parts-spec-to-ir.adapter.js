/**
 * Parts-spec → PixelBrain IR adapter for SemQuant.
 *
 * Generic adapter for authoring sources that are neither SCDL ASTs nor
 * construction specs but do declare parts: item-foundry specs, template-grid
 * layers, Aseprite motif edits, NL-compile forms. Anything shaped
 * `{ id?, parts: [{ id, role?, material?, profile?/layer? }] }` gains
 * role/part/material annotations from the semantic unifier, closing the gap
 * where only SCDL-authored packets carried semantics.
 */

import { createIRNode } from '../pixelbrain-ir-node.js';

export function partsSpecToIR(spec, options = {}) {
  const sourceKind = options.sourceKind || spec?.sourceKind || 'parts-spec';
  if (!spec || !Array.isArray(spec.parts)) {
    return { schemaVersion: 'PB-IR-v1', sourceKind, nodes: [] };
  }

  const specId = spec.id || spec.asset || null;
  const nodes = spec.parts.map((part, index) => {
    const partId = String(part?.id ?? `part-${index}`);
    return createIRNode({
      id: `spec:part:${partId}`,
      kind: 'PartGroup',
      payload: {
        id: partId,
        partId,
        role: part?.role || null,
        material: part?.material || part?.fill?.material || null,
        layerName: part?.layer || part?.layerName || part?.profile || null,
      },
      sourceRefs: [
        {
          system: sourceKind,
          file: null,
          specId,
          opId: `spec:part:${partId}`,
        },
      ],
    });
  });

  return { schemaVersion: 'PB-IR-v1', sourceKind, nodes };
}
