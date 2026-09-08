/**
 * Truthful Typed Adapter for pixelbrain.perlin-field.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, RUNTIME_DESCRIPTOR).
 * Generates immutable coherent Perlin noise field descriptors.
 */

export const PerlinFieldAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'runtime_root';
    const scale = typeof params.scale === 'number' ? params.scale : 0.1;
    const octaves = typeof params.octaves === 'number' ? params.octaves : 3;

    return Object.freeze({
      contract: 'PB-RUNTIME-DESCRIPTOR-v1',
      kind: 'PERLIN_FIELD',
      targetId,
      noiseScale: scale,
      octaves,
    });
  },
});

export default PerlinFieldAdapter;
