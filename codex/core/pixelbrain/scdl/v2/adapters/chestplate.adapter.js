/**
 * Truthful Typed Adapter for pixelbrain.chestplate.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Applies chestplate torso volume and rim slots without fabricating ITEM-SPEC metadata.
 */

export const ChestplateAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        chestplateApplied: false,
        tier: 1,
      });
    }
    const tier = typeof params.tier === 'number' ? params.tier : 1;
    const profile = typeof params.profile === 'string' ? params.profile : 'armor.chestplate';

    return Object.freeze({
      ...geometry,
      chestplateApplied: true,
      tier,
      profile,
      hasTorsoVolume: true,
      slots: ['body', 'trim', 'core'],
    });
  },
});

export default ChestplateAdapter;
