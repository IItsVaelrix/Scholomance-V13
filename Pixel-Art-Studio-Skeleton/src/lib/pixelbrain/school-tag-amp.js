import { isCellOccupied } from './voxel-volume.js';
import { VoxelAuthority, VoxelOp, applyVoxelDeltas } from './voxel-delta.js';
import { resolveBlockContext } from './block-school-bridge.js';

export function collectSchoolTagDeltas(vol, schoolWeights) {
  const { width, height, depth } = vol;
  const deltas = [];

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        if (!isCellOccupied(vol, x, y, z)) continue;
        const materialId = vol.cells[y * width * depth + z * width + x] >> 4;
        const { schoolId, blockId } = resolveBlockContext(width, height, depth, schoolWeights, materialId, x, y, z);
        deltas.push({
          x, y, z,
          op: VoxelOp.TAG,
          source: VoxelAuthority.VOLUME_AMP,
          payload: { schoolId, blockId },
        });
      }
    }
  }

  return deltas;
}

export function applySchoolTagAMP(vol, schoolWeights) {
  const deltas = collectSchoolTagDeltas(vol, schoolWeights);
  applyVoxelDeltas(vol, deltas);
  return vol;
}
