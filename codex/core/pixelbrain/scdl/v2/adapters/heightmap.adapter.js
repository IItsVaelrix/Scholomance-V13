/**
 * Truthful Typed Adapter for pixelbrain.heightmap.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable terrain heightmap elevation descriptors.
 */

export const HeightmapAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const maxElevation = typeof params.maxElevation === 'number' ? params.maxElevation : 16;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'HEIGHTMAP',
      targetId,
      maxElevation,
    });
  },
});

export default HeightmapAdapter;
