/**
 * Truthful Typed Adapter for pixelbrain.noise-mask.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, MASK).
 * Modulates mask boundary with procedural noise.
 */

export const NoiseMaskAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const mask = inputs.mask;
    if (!mask) {
      return Object.freeze({
        kind: 'EmptyMask',
        cells: [],
        noiseModulated: false,
      });
    }
    const cutoff = typeof params.cutoff === 'number' ? params.cutoff : 0.5;

    return Object.freeze({
      ...mask,
      noiseModulated: true,
      cutoffThreshold: cutoff,
      cells: Array.isArray(mask.cells) ? [...mask.cells] : [],
    });
  },
});

export default NoiseMaskAdapter;
