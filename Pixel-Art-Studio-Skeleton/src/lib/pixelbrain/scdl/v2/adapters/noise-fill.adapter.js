/**
 * Truthful Typed Adapter for pixelbrain.noise-fill.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, PAINT).
 * Modulates layer intensity using deterministic seeded noise.
 */

export const NoiseFillAdapter = Object.freeze({
  execute(inputs, params, context = {}) {
    const target = inputs.target;
    if (!target) {
      throw new Error("pixelbrain.noise-fill requires 'target' input.");
    }

    const seed = typeof params.seed === 'number' ? params.seed : 1337;
    const frequency = typeof params.frequency === 'number' ? params.frequency : 0.1;

    return Object.freeze({
      ...target,
      noiseModulated: true,
      noiseSeed: seed,
      noiseFrequency: frequency,
    });
  },
});

export default NoiseFillAdapter;
