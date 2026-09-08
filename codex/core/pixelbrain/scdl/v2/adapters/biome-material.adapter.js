/**
 * Truthful Typed Adapter for pixelbrain.biome-material.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable biome-to-material binding descriptors.
 */

export const BiomeMaterialAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const biome = typeof params.biome === 'string' ? params.biome : 'forest';

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'BIOME_MATERIAL',
      targetId,
      biome,
    });
  },
});

export default BiomeMaterialAdapter;
