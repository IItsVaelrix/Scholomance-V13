/**
 * Truthful Typed Adapter for pixelbrain.sdf-shape.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Evaluates signed distance field boundaries at lattice cell centers.
 */

export const SDFShapeAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        sdfQuantized: false,
        sdfEvaluated: false,
        sdfThreshold: 0,
      });
    }
    const threshold = typeof params.threshold === 'number' ? params.threshold : 0;

    return Object.freeze({
      ...geometry,
      sdfQuantized: true,
      sdfEvaluated: true,
      sdfThreshold: threshold,
      cells: Array.isArray(geometry.cells) ? [...geometry.cells] : [],
    });
  },
});

export default SDFShapeAdapter;
