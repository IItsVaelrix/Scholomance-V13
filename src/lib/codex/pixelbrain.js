/**
 * Pixelbrain adapter — re-exports from codex/core/pixelbrain for UI layer.
 * UI components should import from here, not directly from codex/core.
 */

// voxel-volume
export {
  createVoxelVolume,
  cellIndex,
  getCellMaterialId,
  isCellOccupied,
  setCellMaterial,
  ENERGY_TYPES,
} from '../../../codex/core/pixelbrain/voxel-volume.js';

// wand-seed-lift
export {
  generateFibonacciSeeds,
  generateVectorizedTextSeeds,
} from '../../../codex/core/pixelbrain/wand-seed-lift.js';

// qbit-field
export { propagate, assignMaterial } from '../../../codex/core/pixelbrain/qbit-field.js';

// hollowness-amp
export { applyHollownessAMP } from '../../../codex/core/pixelbrain/hollowness-amp.js';

// biome-coherence-amp
export {
  runBiomeCoherenceAMP,
  runBiomeCoherenceAMPWorld,
} from '../../../codex/core/pixelbrain/biome-coherence-amp.js';

// iso-projector
export { collectFaces, project, makeFace } from '../../../codex/core/pixelbrain/iso-projector.js';

// voxel-svg-renderer
export { renderFacesToSVG } from '../../../codex/core/pixelbrain/voxel-svg-renderer.js';

// world-render-options
export {
  worldRenderOptions,
  seedsToLightPoints,
} from '../../../codex/core/pixelbrain/world-render-options.js';

// chunked-world-volume
export {
  createChunkedWorldVolume,
  getOrLoadChunk,
  generateWorldChunk,
  chunkKey,
  parseChunkKey,
  applyMaterialBoundaryAlignment,
  collectWorldSeeds,
} from '../../../codex/core/pixelbrain/chunked-world-volume.js';

// material-registry
export * from '../../../codex/core/pixelbrain/material-registry.js';

// qbit-world-game-loop
export * from '../../../codex/core/pixelbrain/qbit-world-game-loop.js';
