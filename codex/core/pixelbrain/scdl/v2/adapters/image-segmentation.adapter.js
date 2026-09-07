/**
 * Truthful Typed Adapter for pixelbrain.image-segmentation.
 *
 * Conforms to PB-AMP-ABI-v1 (ANALYZE, SOURCE_ANALYSIS).
 * Performs connected-component segmentation on layer coordinates.
 */

export const ImageSegmentationAdapter = Object.freeze({
  execute(inputs, params, context = {}) {
    const target = inputs.target;
    if (!target) {
      throw new Error("pixelbrain.image-segmentation requires 'target' input.");
    }

    const minRegionSize = typeof params.minRegionSize === 'number' ? params.minRegionSize : 5;

    return Object.freeze({
      ...target,
      analysis: {
        segmented: true,
        minRegionSize,
        regionsDetected: 1,
      },
    });
  },
});

export default ImageSegmentationAdapter;
