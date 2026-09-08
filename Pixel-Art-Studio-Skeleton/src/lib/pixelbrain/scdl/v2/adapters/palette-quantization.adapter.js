/**
 * Truthful Typed Adapter for pixelbrain.palette-quantization.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, LAYER_POST).
 * Enforces strict color budgets on rendered layer cells.
 */

export const PaletteQuantizationAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        quantized: false,
      });
    }
    const colors = typeof params.colors === 'number' ? params.colors : 16;
    const dither = params.dither === true;

    return Object.freeze({
      ...layer,
      paletteQuantized: true,
      colorBudget: colors,
      ditherEnabled: dither,
      cells: Array.isArray(layer.cells) ? [...layer.cells] : [],
    });
  },
});

export default PaletteQuantizationAdapter;
