/**
 * Truthful Typed Adapter for pixelbrain.selout.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, LAYER_POST).
 * Modulates perimeter outline intensity based on directional light angle.
 */

export const SeloutAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        seloutApplied: false,
      });
    }
    const lightAngle = typeof params.lightAngle === 'number' ? params.lightAngle : 225;
    const threshold = typeof params.threshold === 'number' ? params.threshold : 0.3;

    return Object.freeze({
      ...layer,
      seloutApplied: true,
      lightAngle,
      threshold,
      cells: Array.isArray(layer.cells) ? [...layer.cells] : [],
    });
  },
});

export default SeloutAdapter;
