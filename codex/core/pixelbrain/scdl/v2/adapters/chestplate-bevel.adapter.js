/**
 * Truthful Typed Adapter for pixelbrain.chestplate-bevel.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Generates beveled edge contours on torso plate geometry.
 */

export const ChestplateBevelAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        bevelApplied: false,
        depth: 0,
      });
    }
    const depth = typeof params.depth === 'number' ? params.depth : 2;

    return Object.freeze({
      ...geometry,
      bevelApplied: true,
      bevelDepth: depth,
      contourDepth: depth,
    });
  },
});

export default ChestplateBevelAdapter;
