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

/**
 * Derive a membrane permeability threshold from an observed crowding
 * distribution. A limit nothing reaches, or one everything exceeds, is a check
 * that cannot fail — so this refuses rather than returning it.
 *
 * @param {number[]} samples observed crowding values
 * @param {{percentile?: number}} [options]
 */
export function calibrateConcentrationLimit(samples, options = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('calibrateConcentrationLimit: no samples — cannot derive a limit');
  }
  const percentile = Number.isFinite(options.percentile) ? options.percentile : 0.90;
  const sorted = [...samples].sort((a, b) => a - b);
  // Nearest-rank percentile: the limit is the smallest value whose clearance
  // fraction is ≤ 1−p, i.e. the boundary of the top (1−p) fraction. For
  // p=0.90 over 100 samples that is index 90 (the top decile clears it).
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentile * sorted.length)),
  );
  const limit = sorted[index];
  const clearedBy = samples.filter((value) => value >= limit).length;
  const clearedFraction = clearedBy / samples.length;

  let reason = null;
  if (clearedFraction === 0) {
    reason = `limit ${limit} is unreachable — 0% of ${samples.length} samples clear it`;
  } else if (clearedFraction === 1) {
    reason = `limit ${limit} always fires — 100% of ${samples.length} samples clear it`;
  }

  return { limit, clearedFraction, admissible: reason === null, reason };
}
