/**
 * Truthful Typed Adapter for pixelbrain.volume-lift.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable volume lift elevation descriptors.
 */

export const VolumeLiftAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const liftHeight = typeof params.liftHeight === 'number' ? params.liftHeight : 4;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'VOLUME_LIFT',
      targetId,
      liftHeight,
    });
  },
});

export default VolumeLiftAdapter;
