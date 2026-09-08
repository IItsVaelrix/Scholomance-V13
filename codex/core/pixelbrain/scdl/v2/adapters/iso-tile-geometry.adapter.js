/**
 * Truthful Typed Adapter for pixelbrain.iso-tile-geometry.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable isometric tile geometry descriptors.
 */

export const IsoTileGeometryAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const tileWidth = typeof params.tileWidth === 'number' ? params.tileWidth : 32;
    const tileHeight = typeof params.tileHeight === 'number' ? params.tileHeight : 16;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'ISO_TILE_GEOMETRY',
      targetId,
      tileWidth,
      tileHeight,
      aspectRatio: tileWidth / tileHeight,
    });
  },
});

export default IsoTileGeometryAdapter;
