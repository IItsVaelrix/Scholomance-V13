/**
 * Truthful Typed Adapter for pixelbrain.volume-processor.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable voxel volume processing grid descriptors.
 */

export const VolumeProcessorAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const subsample = typeof params.subsample === 'number' ? params.subsample : 1;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'VOLUME_PROCESSOR',
      targetId,
      subsampleRate: subsample,
    });
  },
});

export default VolumeProcessorAdapter;
