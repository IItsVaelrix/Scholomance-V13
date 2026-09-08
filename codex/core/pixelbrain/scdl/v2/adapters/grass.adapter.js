/**
 * Truthful Typed Adapter for pixelbrain.grass.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable grass ground cover descriptors.
 */

export const GrassAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const bladeDensity = typeof params.bladeDensity === 'number' ? params.bladeDensity : 0.6;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'GRASS',
      targetId,
      bladeDensity,
      windAnimated: true,
    });
  },
});

export default GrassAdapter;
