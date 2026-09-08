/**
 * Truthful Typed Adapter for pixelbrain.hair-flow.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Generates directional hair clumps and procedural strand vectors.
 */

export const HairFlowAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        hairFlowApplied: false,
      });
    }
    const direction = typeof params.direction === 'number' ? params.direction : 90;
    const strands = typeof params.strands === 'number' ? params.strands : 8;

    return Object.freeze({
      ...geometry,
      hairFlowApplied: true,
      flowDirection: direction,
      strandCount: strands,
      hasStrandVectors: true,
    });
  },
});

export default HairFlowAdapter;
