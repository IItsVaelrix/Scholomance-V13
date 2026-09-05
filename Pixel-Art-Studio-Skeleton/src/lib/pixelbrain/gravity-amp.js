import { ENERGY_TYPES } from './voxel-volume.js';

export function applyGravityAMP(xzSeeds, volume, options = {}) {
  const {
    steps = 6,
    baseYFraction = 0.75,
    peakYFraction = 0.1,
    baseEnergy = 1.0,
    peakEnergy = 0.3,
    energyType = ENERGY_TYPES.STRUCTURAL,
  } = options;

  const baseY = Math.floor(volume.height * baseYFraction);
  const peakY = Math.floor(volume.height * peakYFraction);
  const seeds = [];

  // Input seed energy is intentionally replaced by the Obelisk taper — the taper owns the energy curve.
  for (const { vx, vz } of xzSeeds) {
    for (let step = 0; step < steps; step++) {
      const t = step / Math.max(1, steps - 1);
      const vy = Math.round(baseY + t * (peakY - baseY));
      const energy = baseEnergy + t * (peakEnergy - baseEnergy);
      seeds.push({
        vx: Math.max(0, Math.min(volume.width  - 1, vx)),
        vy: Math.max(0, Math.min(volume.height - 1, vy)),
        vz: Math.max(0, Math.min(volume.depth  - 1, vz)),
        energy,
        energyType,
      });
    }
  }

  return seeds;
}
