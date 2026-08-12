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
 * distribution, and refuse one that cannot be shown to discriminate on the
 * distribution it will actually govern.
 *
 * Three failures on 2026-08-12 motivate the shape of this function; each has a
 * regression test in `tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`.
 *
 *   1. `Math.ceil(p * n)` clamped to `n-1` returns the LAST index — the
 *      maximum — whenever `ceil(p*n) >= n-1`, i.e. for every `n < 2/(1-p)`.
 *      At p=0.90 that is every sample below 20, and the shipped calibration
 *      ran at n=12. `floor` is the correct nearest-rank estimator for an
 *      upper percentile and does not degenerate.
 *
 *   2. When the limit is the maximum, `clearedFraction` can never be 0 (the
 *      max clears itself under `>=`) and is 1 only under a total tie. So the
 *      0%/100% guard was unfalsifiable: `admissible` was true for any
 *      non-degenerate input. A guard against checks that cannot fail must
 *      itself be able to fail.
 *
 *   3. The limit was derived on a synthetic 4-atom chain and applied to the
 *      44- and 56-atom banks, where it fired on 84–91% of candidates. A limit
 *      derived without reference to what it governs cannot be shown to
 *      transfer — so `governed` is required, not optional, and the transfer
 *      check is structural rather than a matter of discipline.
 *
 * NOTE: a percentile of any distribution guarantees a fixed clearance fraction
 * by construction. Crowding is an absolute quantity — `h/(1+h)` for occupancy
 * heat `h` — so the stronger form of this calibration declares the limit in
 * terms of a revisit policy (`h = 4*ln(1+R)`) and uses this function only to
 * check that the policy discriminates. That change is not made here.
 *
 * @param {number[]} samples observed crowding values used to derive the limit
 * @param {object} options
 * @param {number} [options.percentile=0.90] target upper percentile
 * @param {number[]} options.governed the distribution the limit will govern
 * @param {number} [options.tolerance=0.10] allowed drift of the realized
 *   governed clearance from the target `1 - percentile`
 * @returns {{limit:number, clearedFraction:number, governedFraction:number,
 *   admissible:boolean, reason:string|null}}
 */
export function calibrateConcentrationLimit(samples, options = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('calibrateConcentrationLimit: no samples — cannot derive a limit');
  }
  const { governed } = options;
  if (!Array.isArray(governed) || governed.length === 0) {
    throw new TypeError(
      'calibrateConcentrationLimit: `governed` must be the distribution this limit '
      + 'will govern — a limit derived without one cannot be shown to transfer',
    );
  }
  const percentile = Number.isFinite(options.percentile) ? options.percentile : 0.90;
  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 0.10;
  const target = 1 - percentile;

  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(percentile * sorted.length)),
  );
  const limit = sorted[index];

  const clearedFraction = samples.filter((value) => value >= limit).length / samples.length;
  const governedFraction = governed.filter((value) => value >= limit).length / governed.length;

  // A sample of n can resolve no fraction finer than 1/n; asking it for a
  // narrower tail than it can represent yields a rank, not a percentile.
  const minimumSamples = target > 0 ? Math.ceil(1 / target) : 1;

  let reason = null;
  if (samples.length < minimumSamples) {
    reason = `${samples.length} samples cannot resolve the top ${(target * 100).toFixed(0)}% `
      + `— ${minimumSamples} required`;
  } else if (governedFraction === 0) {
    reason = `limit ${limit} is unreachable — 0% of the ${governed.length} governed values clear it`;
  } else if (governedFraction === 1) {
    reason = `limit ${limit} always fires — 100% of the ${governed.length} governed values clear it`;
  } else if (Math.abs(governedFraction - target) > tolerance) {
    reason = `limit ${limit} does not transfer — ${(governedFraction * 100).toFixed(1)}% of the `
      + `${governed.length} governed values clear it, target ${(target * 100).toFixed(0)}% `
      + `±${(tolerance * 100).toFixed(0)}`;
  }

  return { limit, clearedFraction, governedFraction, admissible: reason === null, reason };
}
