/**
 * PixelBrain IR Node factory.
 * Stable shape for semantic unification layer (SemQuant).
 */

export function createIRNode({
  id,
  kind,
  payload = {},
  sourceRefs = [],
  annotations = [],
  provenance = {},
}) {
  if (!id) throw new Error('PixelBrainIRNode requires id');
  if (!kind) throw new Error('PixelBrainIRNode requires kind');

  return Object.freeze({
    id: String(id),
    kind: String(kind),
    payload: { ...payload },
    annotations: Array.isArray(annotations) ? [...annotations] : [],
    provenance: {
      sourceRefs: Array.isArray(sourceRefs) ? [...sourceRefs] : [],
      loweredFrom: Array.isArray(provenance.loweredFrom) ? [...provenance.loweredFrom] : [],
      generatedBy: provenance.generatedBy ?? null,
      loweringSteps: Array.isArray(provenance.loweringSteps) ? [...provenance.loweringSteps] : [],
    },
  });
}
