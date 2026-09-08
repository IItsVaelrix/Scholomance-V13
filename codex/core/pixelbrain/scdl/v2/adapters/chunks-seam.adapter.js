/**
 * Truthful Typed Adapter for pixelbrain.chunks-seam.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable chunk seam boundary descriptors.
 */

export const ChunksSeamAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const seamMargin = typeof params.seamMargin === 'number' ? params.seamMargin : 1;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'CHUNKS_SEAM',
      targetId,
      seamMargin,
      stitchMode: 'SEAMLESS',
    });
  },
});

export default ChunksSeamAdapter;
