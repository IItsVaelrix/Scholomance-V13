/**
 * Truthful Typed Adapter for pixelbrain.crystal-core.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Adds crystal core resonance and facet highlights.
 */

export const CrystalCoreAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        crystalCoreApplied: false,
        resonance: 0,
      });
    }
    const resonance = typeof params.resonance === 'number' ? params.resonance : 0.8;

    return Object.freeze({
      ...geometry,
      crystalCoreApplied: true,
      resonance,
      hasFacetHighlights: true,
    });
  },
});

export default CrystalCoreAdapter;
