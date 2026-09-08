/**
 * Truthful Typed Adapter for pixelbrain.tile-socket.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable Wang tile socket connection descriptors.
 */

export const TileSocketAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'world_root';
    const socketMask = typeof params.socketMask === 'number' ? params.socketMask : 15;

    return Object.freeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'TILE_SOCKET',
      targetId,
      socketMask,
    });
  },
});

export default TileSocketAdapter;
