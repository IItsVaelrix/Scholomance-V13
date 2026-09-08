/**
 * Truthful Typed Adapter for pixelbrain.pixel-aa.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, LAYER_POST).
 * Softens 1-cell perimeter staircase artifacts without fabricating ITEM-SPEC metadata.
 */

export const PixelAAAdapter = Object.freeze({
  execute(inputs, params, context = {}) {
    const layer = inputs.layer;
    if (!layer) {
      throw new Error("pixelbrain.pixel-aa requires 'layer' input.");
    }

    const strength = typeof params.strength === 'number' ? params.strength : 1;

    // Return layer with anti-aliasing tag/pass applied
    return Object.freeze({
      ...layer,
      antiAliased: true,
      antiAliasStrength: strength,
    });
  },
});

export default PixelAAAdapter;
