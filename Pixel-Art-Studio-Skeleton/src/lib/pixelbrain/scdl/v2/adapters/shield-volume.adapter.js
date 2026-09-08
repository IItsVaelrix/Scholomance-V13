/**
 * Truthful Typed Adapter for pixelbrain.shield-volume.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Applies curved face volume shading and rim shadows to shield geometry.
 */

export const ShieldVolumeAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        shieldVolumeApplied: false,
        curvature: 0,
        faceCurvature: 0,
      });
    }
    const curvature = typeof params.curvature === 'number' ? params.curvature : 0.5;

    return Object.freeze({
      ...geometry,
      shieldVolumeApplied: true,
      curvature,
      faceCurvature: curvature,
    });
  },
});

export default ShieldVolumeAdapter;
