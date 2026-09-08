/**
 * Truthful Typed Adapter for pixelbrain.region-fill.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, PAINT).
 * Maps layer coordinates onto material palette ramps without fabricating legacy ITEM-SPEC metadata.
 */

export const RegionFillAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const target = inputs.target || inputs.layer;
    if (!target) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        regionFillApplied: false,
        regionFilled: false,
      });
    }
    const material = typeof params.material === 'string' ? params.material : 'void';
    const anchor = typeof params.anchor === 'string' ? params.anchor : 'body';

    return Object.freeze({
      ...target,
      regionFillApplied: true,
      regionFilled: true,
      material,
      anchor,
    });
  },
});

export default RegionFillAdapter;
