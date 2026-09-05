export const DEFAULT_DECAY = 0.015;
export const DEFAULT_ITERATIONS = 3;
export const PHI = (1 + Math.sqrt(5)) / 2;
export const ATTENUATION_MODELS = Object.freeze({
  GAUSSIAN: 'gaussian',          // Level 1 default: seedEnergy * exp(-dist * decay)
  INVERSE_SQUARE: 'inverse_square',  // Level 3 default: seedEnergy / (dist^2 + 1)
  PHI_ATTENUATION: 'phi_attenuation', // Level 3 alternative: seedEnergy / (dist^(2/φ) + 1)
});

export const MATERIAL_THRESHOLDS = Object.freeze([
  { materialId: 1, name: 'earth', threshold: 0.00 },
  { materialId: 2, name: 'stone', threshold: 0.25 },
  { materialId: 3, name: 'granite', threshold: 0.50 },
  { materialId: 4, name: 'crystal', threshold: 0.70 },
]);

/**
 * Assigns a material ID based on energy value.
 * Returns the materialId of the highest threshold entry where energyValue >= threshold.
 * If energyValue < 0.00, returns 0 (no material / air).
 * @param {number} energyValue - Energy value in range [0, 1]
 * @returns {number} Material ID (0-4)
 */
export function assignMaterial(energyValue) {
  if (energyValue < 0.00) {
    return 0;
  }

  // Iterate from highest threshold to lowest
  for (let i = MATERIAL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (energyValue >= MATERIAL_THRESHOLDS[i].threshold) {
      return MATERIAL_THRESHOLDS[i].materialId;
    }
  }

  return 0;
}

/**
 * Propagates energy from seed points using the selected attenuation model.
 *
 * Models:
 *   - 'gaussian'         (Level 1 default): seedEnergy * exp(-dist * decay)
 *   - 'inverse_square'   (Level 3 default): seedEnergy / (dist^2 + 1)
 *   - 'phi_attenuation'  (Level 3 alt):     seedEnergy / (dist^(2/φ) + 1)
 *
 * The 'inverse_square' and 'phi_attenuation' models share a +1 denominator
 * to avoid division by zero at the source cell. 'gaussian' is the existing
 * Level 1 model and is preserved unchanged for backward compatibility.
 *
 * @param {Array} seeds - Array of { x, y, z, energy, energyType } objects
 * @param {number} width - Volume width
 * @param {number} height - Volume height
 * @param {number} depth - Volume depth
 * @param {Object} options - { decay, iterations, attenuationModel, maxRadius }
 * @returns {Object} QBITField with energyAt(x,y,z) and gradientAt(x,y,z) methods
 */
export function propagate(
  seeds,
  width,
  height,
  depth,
  {
    decay = DEFAULT_DECAY,
    iterations = DEFAULT_ITERATIONS,
    attenuationModel = ATTENUATION_MODELS.GAUSSIAN,
    maxRadius = null,
  } = {}
) {
  // Guard against zero-size volumes
  if (width === 0 || height === 0 || depth === 0) {
    return {
      width,
      height,
      depth,
      energyAt() {
        return 0;
      },
      gradientAt() {
        return { gx: 0, gy: 0, gz: 0 };
      },
    };
  }

  const totalCells = width * height * depth;
  let energyBuffer = new Float32Array(totalCells);

  // Per-cell contribution from a seed. The function takes (distSq, dist, seedEnergy).
  // The `inverse_square` model uses only distSq (saves a Math.sqrt per cell).
  // `gaussian` and `phi_attenuation` need the actual distance.
  //
  // `maxRadius` is also expressed in distance units; we precompute
  // maxRadius² so the inner-loop maxRadius check can use distSq for
  // inverse_square without computing the sqrt.
  const maxRadiusSq = maxRadius === null ? null : maxRadius * maxRadius;
  const contributionFn = (() => {
    switch (attenuationModel) {
      case ATTENUATION_MODELS.INVERSE_SQUARE:
        return (_distSq, _dist, seedEnergy, distSq) => seedEnergy / (distSq + 1);
      case ATTENUATION_MODELS.PHI_ATTENUATION: {
        const exponent = 2 / PHI;
        return (_distSq, dist, seedEnergy) => seedEnergy / (Math.pow(dist, exponent) + 1);
      }
      case ATTENUATION_MODELS.GAUSSIAN:
      default:
        return (_distSq, dist, seedEnergy) => seedEnergy * Math.exp(-dist * decay);
    }
  })();

  // 1. Compute initial energy field from seed contributions.
  //
  // Phase 4 spatial pruning: for each seed, only iterate the 3D bounding
  // box within `maxRadius` of the seed, not the full volume. This is a
  // simpler form of octree pruning — we precompute the box once per seed
  // and skip the inner-loop maxRadius check (the iteration bounds ARE
  // the maxRadius). For sparse seeds (the common case for ghost seeds at
  // chunk boundaries), this is a meaningful win: the inner loop visits
  // O(R^3) cells per seed instead of O(W*H*D).
  const hasMaxRadius = maxRadiusSq !== null;
  for (const seed of seeds) {
    const { x: sx, y: sy, z: sz, energy: seedEnergy } = seed;
    // Bounding box. If no maxRadius, iterate the full volume.
    const R = hasMaxRadius ? Math.sqrt(maxRadiusSq) : 0;
    const x0 = hasMaxRadius ? Math.max(0, Math.floor(sx - R)) : 0;
    const x1 = hasMaxRadius ? Math.min(width, Math.ceil(sx + R + 1)) : width;
    const y0 = hasMaxRadius ? Math.max(0, Math.floor(sy - R)) : 0;
    const y1 = hasMaxRadius ? Math.min(height, Math.ceil(sy + R + 1)) : height;
    const z0 = hasMaxRadius ? Math.max(0, Math.floor(sz - R)) : 0;
    const z1 = hasMaxRadius ? Math.min(depth, Math.ceil(sz + R + 1)) : depth;

    for (let y = y0; y < y1; y++) {
      const dy = y - sy;
      for (let z = z0; z < z1; z++) {
        const dz = z - sz;
        for (let x = x0; x < x1; x++) {
          const dx = x - sx;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (attenuationModel === ATTENUATION_MODELS.INVERSE_SQUARE) {
            // maxRadius is implicit in the bounding box; we only need to
            // skip cells where distSq > maxRadiusSq for the rounded-up box
            // (the ceiling of sx+R can include cells just outside the sphere).
            if (maxRadiusSq !== null && distSq > maxRadiusSq) continue;
            const contribution = contributionFn(distSq, 0, seedEnergy, distSq);
            const idx = y * width * depth + z * width + x;
            energyBuffer[idx] += contribution;
          } else {
            const dist = Math.sqrt(distSq);
            if (maxRadius !== null && dist > maxRadius) continue;
            const contribution = contributionFn(distSq, dist, seedEnergy);
            const idx = y * width * depth + z * width + x;
            energyBuffer[idx] += contribution;
          }
        }
      }
    }
  }

  // 2. Clamp energy to [0, 1]
  for (let i = 0; i < totalCells; i++) {
    energyBuffer[i] = Math.max(0, Math.min(1, energyBuffer[i]));
  }

  // 3. Smoothing passes with 6-neighbor averaging
  for (let pass = 0; pass < iterations; pass++) {
    const newBuffer = new Float32Array(totalCells);

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width * depth + z * width + x;
          let sum = energyBuffer[idx];
          let count = 1;

          // 6-neighbor face-adjacent averaging
          if (x > 0) {
            sum += energyBuffer[y * width * depth + z * width + (x - 1)];
            count++;
          }
          if (x < width - 1) {
            sum += energyBuffer[y * width * depth + z * width + (x + 1)];
            count++;
          }

          if (y > 0) {
            sum += energyBuffer[(y - 1) * width * depth + z * width + x];
            count++;
          }
          if (y < height - 1) {
            sum += energyBuffer[(y + 1) * width * depth + z * width + x];
            count++;
          }

          if (z > 0) {
            sum += energyBuffer[y * width * depth + (z - 1) * width + x];
            count++;
          }
          if (z < depth - 1) {
            sum += energyBuffer[y * width * depth + (z + 1) * width + x];
            count++;
          }

          newBuffer[idx] = sum / count;
        }
      }
    }

    energyBuffer = newBuffer;
  }

  // Helper to safely read energy (clamped to bounds)
  const readEnergy = (cx, cy, cz) => {
    const clampedX = Math.max(0, Math.min(width - 1, cx));
    const clampedY = Math.max(0, Math.min(height - 1, cy));
    const clampedZ = Math.max(0, Math.min(depth - 1, cz));
    const idx = clampedY * width * depth + clampedZ * width + clampedX;
    return energyBuffer[idx];
  };

  return {
    width,
    height,
    depth,

    energyAt(x, y, z) {
      if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) {
        return 0;
      }
      const idx = y * width * depth + z * width + x;
      return energyBuffer[idx];
    },

    gradientAt(x, y, z) {
      const CENTRAL_DIFF_SPAN = 2; // step = 1 voxel, span = (x+1)-(x-1) = 2

      // Central difference gradient with edge clamping
      const gx = (readEnergy(x + 1, y, z) - readEnergy(x - 1, y, z)) / CENTRAL_DIFF_SPAN;
      const gy = (readEnergy(x, y + 1, z) - readEnergy(x, y - 1, z)) / CENTRAL_DIFF_SPAN;
      const gz = (readEnergy(x, y, z + 1) - readEnergy(x, y, z - 1)) / CENTRAL_DIFF_SPAN;

      return { gx, gy, gz };
    },
  };
}

// =====================================================================
// QBIT-Voxel Phase 5 — Octree-accelerated propagation
// =====================================================================

/**
 * Octree-accelerated propagation. Same return shape as `propagate()`, but
 * the per-seed inner loop uses hierarchical spatial pruning: traverse
 * the volume as an implicit octree, descending only into subtrees that
 * are within the seed's `maxRadius` of the seed.
 *
 * For a seed at a corner of a 32³ volume with `maxRadius=25`, the octree
 * prunes ~75% of the volume (the subtree behind the seed). For a seed
 * at the center, less is pruned. For dense seed clusters, the octree
 * degenerates to the per-cell scan.
 *
 * The octree is implicit — no separate data structure is built. The
 * recursion creates the tree on the fly per seed. The leaf threshold
 * (the smallest box we descend to before iterating cells) is
 * `LEAF_SIZE = 4` cells per axis. Smaller leaves trade recursion depth
 * for per-leaf iteration count; 4 was chosen empirically.
 *
 * @param {Array} seeds
 * @param {number} width
 * @param {number} height
 * @param {number} depth
 * @param {Object} options  { attenuationModel, maxRadius, decay, iterations, ... }
 * @returns {Object}  Same as `propagate()`: { width, height, depth, energyAt, gradientAt }
 */
const OCTREE_LEAF_SIZE = 4;

export function propagateWithOctree(
  seeds,
  width,
  height,
  depth,
  {
    decay = DEFAULT_DECAY,
    iterations = DEFAULT_ITERATIONS,
    attenuationModel = ATTENUATION_MODELS.GAUSSIAN,
    maxRadius = null,
  } = {}
) {
  if (width === 0 || height === 0 || depth === 0) {
    return {
      width, height, depth,
      energyAt: () => 0,
      gradientAt: () => ({ gx: 0, gy: 0, gz: 0 }),
    };
  }

  const totalCells = width * height * depth;
  let energyBuffer = new Float32Array(totalCells);

  const maxRadiusSq = maxRadius === null ? null : maxRadius * maxRadius;
  const contributionFn = (() => {
    switch (attenuationModel) {
      case ATTENUATION_MODELS.INVERSE_SQUARE:
        return (_distSq, _dist, seedEnergy, distSq) => seedEnergy / (distSq + 1);
      case ATTENUATION_MODELS.PHI_ATTENUATION: {
        const exponent = 2 / PHI;
        return (_distSq, dist, seedEnergy) => seedEnergy / (Math.pow(dist, exponent) + 1);
      }
      case ATTENUATION_MODELS.GAUSSIAN:
      default:
        return (_distSq, dist, seedEnergy) => seedEnergy * Math.exp(-dist * decay);
    }
  })();

  // Helper: distance² from a point to a box, clipped to be 0 if inside.
  // Used to compute the minimum distance from the seed to any cell in the box.
  function distSqPointToBox(px, py, pz, x0, x1, y0, y1, z0, z1) {
    const dx = Math.max(x0 - px, 0, px - (x1 - 1));
    const dy = Math.max(y0 - py, 0, py - (y1 - 1));
    const dz = Math.max(z0 - pz, 0, pz - (z1 - 1));
    return dx * dx + dy * dy + dz * dz;
  }

  // Recursive octree descent. Visits only the cells that are within
  // `maxRadius` of the seed (when maxRadius is set). When maxRadius is
  // null, visits all cells.
  function descend(sx, sy, sz, seedEnergy, x0, y0, z0, sizeX, sizeY, sizeZ) {
    // If this subtree is entirely outside maxRadius, prune it.
    if (maxRadiusSq !== null) {
      const minDistSq = distSqPointToBox(sx, sy, sz, x0, x0 + sizeX, y0, y0 + sizeY, z0, z0 + sizeZ);
      if (minDistSq > maxRadiusSq) return;
    }
    // Leaf: iterate cells
    if (sizeX <= OCTREE_LEAF_SIZE && sizeY <= OCTREE_LEAF_SIZE && sizeZ <= OCTREE_LEAF_SIZE) {
      const x1 = x0 + sizeX, y1 = y0 + sizeY, z1 = z0 + sizeZ;
      for (let y = y0; y < y1; y++) {
        const dy = y - sy;
        for (let z = z0; z < z1; z++) {
          const dz = z - sz;
          for (let x = x0; x < x1; x++) {
            const dx = x - sx;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (attenuationModel === ATTENUATION_MODELS.INVERSE_SQUARE) {
              if (maxRadiusSq !== null && distSq > maxRadiusSq) continue;
              const contribution = contributionFn(distSq, 0, seedEnergy, distSq);
              energyBuffer[y * width * depth + z * width + x] += contribution;
            } else {
              const dist = Math.sqrt(distSq);
              if (maxRadius !== null && dist > maxRadius) continue;
              const contribution = contributionFn(distSq, dist, seedEnergy);
              energyBuffer[y * width * depth + z * width + x] += contribution;
            }
          }
        }
      }
      return;
    }
    // Internal: subdivide along the longest axis and descend.
    if (sizeX >= sizeY && sizeX >= sizeZ) {
      const hx = sizeX >> 1;
      descend(sx, sy, sz, seedEnergy, x0, y0, z0, hx, sizeY, sizeZ);
      descend(sx, sy, sz, seedEnergy, x0 + hx, y0, z0, sizeX - hx, sizeY, sizeZ);
    } else if (sizeY >= sizeZ) {
      const hy = sizeY >> 1;
      descend(sx, sy, sz, seedEnergy, x0, y0, z0, sizeX, hy, sizeZ);
      descend(sx, sy, sz, seedEnergy, x0, y0 + hy, z0, sizeX, sizeY - hy, sizeZ);
    } else {
      const hz = sizeZ >> 1;
      descend(sx, sy, sz, seedEnergy, x0, y0, z0, sizeX, sizeY, hz);
      descend(sx, sy, sz, seedEnergy, x0, y0, z0 + hz, sizeX, sizeY, sizeZ - hz);
    }
  }

  for (const seed of seeds) {
    const { x: sx, y: sy, z: sz, energy: seedEnergy } = seed;
    descend(sx, sy, sz, seedEnergy, 0, 0, 0, width, height, depth);
  }

  // 2. Clamp energy to [0, 1]
  for (let i = 0; i < totalCells; i++) {
    energyBuffer[i] = Math.max(0, Math.min(1, energyBuffer[i]));
  }

  // 3. Smoothing passes with 6-neighbor averaging (same as `propagate`)
  for (let pass = 0; pass < iterations; pass++) {
    const newBuffer = new Float32Array(totalCells);

    for (let y = 0; y < height; y++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width * depth + z * width + x;
          let sum = energyBuffer[idx];
          let count = 1;

          if (x > 0) { sum += energyBuffer[y * width * depth + z * width + (x - 1)]; count++; }
          if (x < width - 1) { sum += energyBuffer[y * width * depth + z * width + (x + 1)]; count++; }
          if (y > 0) { sum += energyBuffer[(y - 1) * width * depth + z * width + x]; count++; }
          if (y < height - 1) { sum += energyBuffer[(y + 1) * width * depth + z * width + x]; count++; }
          if (z > 0) { sum += energyBuffer[y * width * depth + (z - 1) * width + x]; count++; }
          if (z < depth - 1) { sum += energyBuffer[y * width * depth + (z + 1) * width + x]; count++; }

          newBuffer[idx] = sum / count;
        }
      }
    }

    energyBuffer = newBuffer;
  }

  const readEnergy = (cx, cy, cz) => {
    const clampedX = Math.max(0, Math.min(width - 1, cx));
    const clampedY = Math.max(0, Math.min(height - 1, cy));
    const clampedZ = Math.max(0, Math.min(depth - 1, cz));
    const idx = clampedY * width * depth + clampedZ * width + clampedX;
    return energyBuffer[idx];
  };

  return {
    width, height, depth,
    energyAt(x, y, z) {
      if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) {
        return 0;
      }
      const idx = y * width * depth + z * width + x;
      return energyBuffer[idx];
    },
    gradientAt(x, y, z) {
      const CENTRAL_DIFF_SPAN = 2;
      const gx = (readEnergy(x + 1, y, z) - readEnergy(x - 1, y, z)) / CENTRAL_DIFF_SPAN;
      const gy = (readEnergy(x, y + 1, z) - readEnergy(x, y - 1, z)) / CENTRAL_DIFF_SPAN;
      const gz = (readEnergy(x, y, z + 1) - readEnergy(x, y, z - 1)) / CENTRAL_DIFF_SPAN;
      return { gx, gy, gz };
    },
  };
}
