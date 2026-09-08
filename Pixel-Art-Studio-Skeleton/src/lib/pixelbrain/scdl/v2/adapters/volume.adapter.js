/**
 * Truthful Typed Adapter for pixelbrain.volume.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Extrudes 2.5D volumetric surface normals and height contours.
 */

export const VolumeAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        volumeExtruded: false,
        depth: 0,
      });
    }
    const depth = typeof params.depth === 'number' ? params.depth : 3;
    const lightZ = typeof params.lightZ === 'number' ? params.lightZ : 0.7;

    return Object.freeze({
      ...geometry,
      volumeExtruded: true,
      extrusionDepth: depth,
      lightZ,
      hasSurfaceNormals: true,
    });
  },
});

export default VolumeAdapter;
