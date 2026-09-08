/**
 * Truthful Typed Adapter for pixelbrain.shield-rim.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Generates outer frame and rim border geometry for shield archetypes.
 */

export const ShieldRimAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        shieldRimApplied: false,
        rimThickness: 0,
      });
    }
    const thickness = typeof params.thickness === 'number' ? params.thickness : 2;

    return Object.freeze({
      ...geometry,
      shieldRimApplied: true,
      rimThickness: thickness,
    });
  },
});

export default ShieldRimAdapter;
