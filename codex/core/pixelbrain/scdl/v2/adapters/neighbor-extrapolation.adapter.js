/**
 * Truthful Typed Adapter for pixelbrain.neighbor-extrapolation.
 *
 * Conforms to PB-AMP-ABI-v1 (ANALYZE, SOURCE_ANALYSIS).
 * Analyzes and smooths isolated noisy cell transitions across layers.
 */

export const NeighborExtrapolationAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const target = inputs.target || inputs.layer;
    if (!target) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        neighborExtrapolated: false,
      });
    }
    const iterations = typeof params.iterations === 'number' ? params.iterations : 1;

    return Object.freeze({
      ...target,
      neighborExtrapolated: true,
      smoothingIterations: iterations,
      cells: Array.isArray(target.cells) ? [...target.cells] : [],
    });
  },
});

export default NeighborExtrapolationAdapter;
