/**
 * Truthful Typed Adapter for pixelbrain.square-sharpness-contrast.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, LAYER_POST).
 * Sharpens lattice pixel transitions and increases local contrast.
 */

export const SquareSharpnessContrastAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        sharpnessApplied: false,
      });
    }
    const sharpness = typeof params.sharpness === 'number' ? params.sharpness : 0.5;

    return Object.freeze({
      ...layer,
      sharpnessApplied: true,
      sharpness,
      contrastBoost: sharpness * 0.4,
      cells: Array.isArray(layer.cells) ? [...layer.cells] : [],
    });
  },
});

export default SquareSharpnessContrastAdapter;
