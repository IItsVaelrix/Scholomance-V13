/**
 * Truthful Typed Adapter for pixelbrain.gear-glide.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, RUNTIME_DESCRIPTOR).
 * Emits validated immutable runtime motion descriptors for clock rotation.
 */

export const GearGlideAdapter = Object.freeze({
  execute(inputs, params, context = {}) {
    const bpm = typeof params.bpm === 'number' ? params.bpm : 90;
    const degreesPerBeat = typeof params.degreesPerBeat === 'number' ? params.degreesPerBeat : 90;
    const targetId = inputs.targetId ? String(inputs.targetId) : 'root';

    return Object.freeze({
      contract: 'PB-RUNTIME-DESCRIPTOR-v1',
      kind: 'GEAR_GLIDE',
      targetId,
      bpm,
      degreesPerBeat,
      rotationFormula: 'rotation(t) = (degreesPerBeat * (BPM / 60) * t)',
    });
  },
});

export default GearGlideAdapter;
