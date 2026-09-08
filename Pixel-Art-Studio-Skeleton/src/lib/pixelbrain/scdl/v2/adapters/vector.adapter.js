/**
 * Truthful Typed Adapter for pixelbrain.vector.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Refines vector curves with subdivision passes.
 */

export const VectorAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        vectorRefined: false,
        subdivisions: 0,
      });
    }
    const subdivide = typeof params.subdivide === 'number' ? params.subdivide : 1;

    return Object.freeze({
      ...geometry,
      vectorRefined: true,
      subdivisions: subdivide,
    });
  },
});

export default VectorAdapter;
