/**
 * OSMOTIC EQUILIBRIUM — PB-OSMOTIC-EQUILIBRIUM-v1
 *
 * Osmosis is transport toward even concentration. It does not rate anything.
 *
 * This module converts the entropic decay dampener's `occupancyHeat` into a
 * bounded crowding fraction suitable for a memory cell's `concentration`
 * observation, and reads the membrane's verdict. The membrane decides WHEN
 * equilibration pressure applies; the dampener decides HOW MUCH.
 *
 * Before 2026-08-12 the cyclotron fed `concentration: molecule.energy` — a
 * score — so the `concentration` branch was dead and everything fell through
 * to `baseline_drift`, which saturated at confidence 1.0 for all 256
 * shortlisted molecules in both banks measured.
 */

export const OSMOTIC_EQUILIBRIUM_CONTRACT = 'PB-OSMOTIC-EQUILIBRIUM-v1';

/**
 * Occupancy heat is unbounded above; a membrane concentration must be a unit
 * fraction. h/(1+h) is monotone, hits 0 at h=0, and approaches but never
 * reaches 1.
 *
 * @param {number} occupancyHeat
 * @returns {number} crowding in [0,1)
 */
export function crowdingFromHeat(occupancyHeat) {
  if (!Number.isFinite(occupancyHeat)) {
    throw new TypeError(
      `crowdingFromHeat: occupancyHeat must be finite, got ${occupancyHeat}`,
    );
  }
  if (occupancyHeat < 0) {
    throw new RangeError(
      `crowdingFromHeat: occupancyHeat must be >= 0, got ${occupancyHeat}`,
    );
  }
  return occupancyHeat / (1 + occupancyHeat);
}

/**
 * Equilibration applies only on over-concentration. `baseline_drift` is a
 * novelty signal and must never trigger transport.
 *
 * @param {{anomalyKind?: string}} [osmosis]
 * @returns {boolean}
 */
export function shouldEquilibrate(osmosis) {
  return osmosis?.anomalyKind === 'concentration';
}
