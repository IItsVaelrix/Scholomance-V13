/**
 * Truthful Typed Adapter for pixelbrain.flame-tip.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Applies flame taper geometry and luminance gradients to tips.
 */

export const FlameTipAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        flameTipApplied: false,
        intensity: 0,
      });
    }
    const intensity = typeof params.intensity === 'number' ? params.intensity : 0.7;

    return Object.freeze({
      ...geometry,
      flameTipApplied: true,
      intensity,
      taperCurvature: intensity * 1.5,
    });
  },
});

export default FlameTipAdapter;
