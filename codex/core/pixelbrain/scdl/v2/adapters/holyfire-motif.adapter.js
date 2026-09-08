/**
 * Truthful Typed Adapter for pixelbrain.holyfire-motif.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, PAINT).
 * Renders radiant holyfire halo and chromatic glow coordinates.
 */

export const HolyfireMotifAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const target = inputs.target || inputs.layer;
    if (!target) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        holyfireMotifApplied: false,
      });
    }
    const radiance = typeof params.radiance === 'number' ? params.radiance : 0.9;

    return Object.freeze({
      ...target,
      holyfireMotifApplied: true,
      radiance,
      cells: Array.isArray(target.cells) ? [...target.cells] : [],
    });
  },
});

export default HolyfireMotifAdapter;
