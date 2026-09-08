/**
 * Truthful Typed Adapter for pixelbrain.material-resolver.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable material fallback resolution descriptors.
 */

export const MaterialResolverAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const fallback = typeof params.fallback === 'string' ? params.fallback : 'void';

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'MATERIAL_RESOLVER',
      targetId,
      fallbackMaterial: fallback,
    });
  },
});

export default MaterialResolverAdapter;
