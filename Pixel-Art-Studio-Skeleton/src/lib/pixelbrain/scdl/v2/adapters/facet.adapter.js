/**
 * Truthful Typed Adapter for pixelbrain.facet.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Operates purely on typed SCDL shape geometry without fabricating legacy ITEM-SPEC metadata.
 */

export const FacetAdapter = Object.freeze({
  execute(inputs, params, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      throw new Error("pixelbrain.facet requires 'geometry' input.");
    }

    const facetCount = typeof params.facetCount === 'number' ? params.facetCount : 8;

    // If geometry is a symbolic shape, annotate or subdivide it with facet metadata
    const facetedShape = {
      ...geometry,
      kind: geometry.kind || 'FACETED_SHAPE',
      isFaceted: true,
      facetCount,
      facetPlanes: Array.from({ length: facetCount }, (_, i) => {
        const angle = (i * 2 * Math.PI) / facetCount;
        return {
          index: i,
          normal: [Math.cos(angle), Math.sin(angle)],
          angle,
        };
      }),
    };

    return Object.freeze(facetedShape);
  },
});

export default FacetAdapter;
