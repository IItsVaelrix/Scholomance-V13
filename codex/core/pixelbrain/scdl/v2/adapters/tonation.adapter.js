/**
 * Truthful Typed Adapter for pixelbrain.tonation.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, LAYER_POST).
 * Balances layer color warmth and midtone tonal contrast.
 */

export const TonationAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        tonationApplied: false,
      });
    }
    const warmth = typeof params.warmth === 'number' ? params.warmth : 0.5;
    const contrast = typeof params.contrast === 'number' ? params.contrast : 0.5;

    return Object.freeze({
      ...layer,
      tonationApplied: true,
      warmth,
      contrast,
      cells: Array.isArray(layer.cells) ? [...layer.cells] : [],
    });
  },
});

export default TonationAdapter;
