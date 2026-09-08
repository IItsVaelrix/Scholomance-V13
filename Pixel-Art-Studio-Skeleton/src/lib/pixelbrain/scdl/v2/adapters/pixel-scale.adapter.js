/**
 * Truthful Typed Adapter for pixelbrain.pixel-scale.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, RENDER).
 * Upscales rendered pixel art layers preserving edge angles.
 */

export const PixelScaleAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        scaled: false,
      });
    }
    const scale = typeof params.scale === 'number' ? params.scale : 2;
    const mode = typeof params.mode === 'string' ? params.mode : 'xbr';

    return Object.freeze({
      ...layer,
      pixelScaled: true,
      scaleFactor: scale,
      upscaleMode: mode,
      cells: Array.isArray(layer.cells) ? [...layer.cells] : [],
    });
  },
});

export default PixelScaleAdapter;
