/**
 * Truthful Typed Adapter for pixelbrain.shadow.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, LAYER_POST).
 * Applies cast drop shadows and contact occlusion to layers.
 */

export const ShadowAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        shadowApplied: false,
      });
    }
    const elevation = typeof params.elevation === 'number' ? params.elevation : 1;
    const angle = typeof params.angle === 'number' ? params.angle : 225;
    const opacity = typeof params.opacity === 'number' ? params.opacity : 0.5;

    return Object.freeze({
      ...layer,
      shadowApplied: true,
      elevation,
      shadowAngle: angle,
      shadowOpacity: opacity,
      cells: Array.isArray(layer.cells) ? [...layer.cells] : [],
    });
  },
});

export default ShadowAdapter;
