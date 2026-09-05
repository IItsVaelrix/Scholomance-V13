/**
 * VoxelDelta authority resolver.
 *
 * Each AMP proposes deltas; the resolver enforces authority rules and applies
 * them in priority order. No AMP mutates the voxel volume directly — all
 * mutations flow through applyVoxelDeltas so the rule table is the single
 * source of truth about what each stage is allowed to do.
 *
 * Pipeline order (lower priority number = applied first):
 *   0  TerrainGen   — establishes base occupancy
 *   1  VolumeAMP    — macro shaping (add + remove)
 *   2  ResourceGen  — places resource anchors (add only)
 *   3  HollowAMP    — interior carving (remove only, no surface)
 *   4  SymmetryAMP  — tagged structures only (no terrain)
 *   5  RuntimeMining — player edits (remove only, may hit surface)
 */

import { setCellOccupancy, setCellMaterial } from './voxel-volume.js';

export const VoxelAuthority = Object.freeze({
  TERRAIN_GEN:    'TerrainGen',
  VOLUME_AMP:     'VolumeAMP',
  HOLLOW_AMP:     'HollowAMP',
  SYMMETRY_AMP:   'SymmetryAMP',
  RUNTIME_MINING: 'RuntimeMining',
  RESOURCE_GEN:   'ResourceGen',
});

export const VoxelOp = Object.freeze({
  REMOVE_SOLID: 'REMOVE_SOLID',
  ADD_SOLID:    'ADD_SOLID',
  SET_MATERIAL: 'SET_MATERIAL',
  TAG:          'TAG',
});

const AUTHORITY_PRIORITY = {
  [VoxelAuthority.TERRAIN_GEN]:    0,
  [VoxelAuthority.VOLUME_AMP]:     1,
  [VoxelAuthority.RESOURCE_GEN]:   2,
  [VoxelAuthority.HOLLOW_AMP]:     3,
  [VoxelAuthority.SYMMETRY_AMP]:   4,
  [VoxelAuthority.RUNTIME_MINING]: 5,
};

const AMP_RULES = {
  [VoxelAuthority.TERRAIN_GEN]: {
    canRemoveSolid: false,
    canAddSolid: true,
    canRemoveSurfaceLocked: false,
  },
  [VoxelAuthority.VOLUME_AMP]: {
    canRemoveSolid: true,
    canAddSolid: true,
    canRemoveSurfaceLocked: false,
  },
  [VoxelAuthority.HOLLOW_AMP]: {
    canRemoveSolid: true,
    canAddSolid: false,
    canRemoveSurfaceLocked: false,
  },
  [VoxelAuthority.SYMMETRY_AMP]: {
    canRemoveSolid: false,
    canAddSolid: false,
    canRemoveSurfaceLocked: false,
  },
  [VoxelAuthority.RUNTIME_MINING]: {
    canRemoveSolid: true,
    canAddSolid: false,
    canRemoveSurfaceLocked: true,
  },
  [VoxelAuthority.RESOURCE_GEN]: {
    canRemoveSolid: false,
    canAddSolid: true,
    canRemoveSurfaceLocked: false,
  },
};

export function isDeltaAllowed(delta, surfaceLockedCells) {
  const rules = AMP_RULES[delta.source];
  if (!rules) return false;

  if (delta.op === VoxelOp.REMOVE_SOLID) {
    if (!rules.canRemoveSolid) return false;
    if (!rules.canRemoveSurfaceLocked) {
      if (surfaceLockedCells.has(`${delta.x},${delta.y},${delta.z}`)) return false;
    }
  }

  if (delta.op === VoxelOp.ADD_SOLID) {
    if (!rules.canAddSolid) return false;
  }

  return true;
}

/**
 * Applies a batch of proposed deltas to a VoxelVolume, enforcing authority rules.
 *
 * @param {Object} vol - VoxelVolume to mutate
 * @param {Array}  deltas - Array of { x, y, z, op, source, materialId?, reason? }
 * @param {Set}    surfaceLockedCells - Set of "x,y,z" keys that cannot be removed by non-mining AMPs
 * @returns {{ applied: number, rejected: number, rejectedByRule: Object }} stats
 */
export function applyVoxelDeltas(vol, deltas, surfaceLockedCells = new Set()) {
  const stats = { applied: 0, rejected: 0, rejectedByRule: {} };

  const sorted = deltas.slice().sort((a, b) => {
    const pa = AUTHORITY_PRIORITY[a.source] ?? 99;
    const pb = AUTHORITY_PRIORITY[b.source] ?? 99;
    return pa - pb;
  });

  for (const delta of sorted) {
    if (!isDeltaAllowed(delta, surfaceLockedCells)) {
      stats.rejected++;
      const ruleKey = `${delta.source}:${delta.op}`;
      stats.rejectedByRule[ruleKey] = (stats.rejectedByRule[ruleKey] ?? 0) + 1;
      continue;
    }

    if (delta.op === VoxelOp.REMOVE_SOLID) {
      setCellOccupancy(vol, delta.x, delta.y, delta.z, false);
    } else if (delta.op === VoxelOp.ADD_SOLID) {
      if (delta.materialId != null) {
        setCellMaterial(vol, delta.x, delta.y, delta.z, delta.materialId);
      } else {
        setCellOccupancy(vol, delta.x, delta.y, delta.z, true);
      }
    } else if (delta.op === VoxelOp.SET_MATERIAL) {
      if (delta.materialId != null) {
        setCellMaterial(vol, delta.x, delta.y, delta.z, delta.materialId);
      }
    } else if (delta.op === VoxelOp.TAG) {
      if (delta.payload != null && vol.tags != null) {
        vol.tags.set(`${delta.x},${delta.y},${delta.z}`, delta.payload);
      }
    }

    stats.applied++;
  }

  return stats;
}
