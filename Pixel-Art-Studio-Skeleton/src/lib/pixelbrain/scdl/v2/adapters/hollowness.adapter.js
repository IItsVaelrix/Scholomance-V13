/**
 * Truthful Typed Adapter for pixelbrain.hollowness.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable cavity and hollowness descriptors.
 */

export const HollownessAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const innerRadius = typeof params.innerRadius === 'number' ? params.innerRadius : 3;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'HOLLOWNESS',
      targetId,
      innerRadius,
      cavityCored: true,
    });
  },
});

export default HollownessAdapter;
