/**
 * Occupancy-driven entropic search dampener.
 *
 * This module changes only a molecule's temporary search attraction. Intrinsic
 * energy, evidence, confidence, and promotion verdicts remain untouched.
 */

import { sha256Hex, stableClone } from '../immunity/cleri-probe/canonical-report.js';

export const OCCUPANCY_ENTROPY_CONTRACT = 'PB-OCCUPANCY-ENTROPY-v1';

const DEFAULTS = Object.freeze({
  decayLambda: 0.35,
  exactWeight: 4,
  familyWeight: 2,
  neighborhoodWeight: 0.5,
});

function fail(message) {
  throw new TypeError(`${OCCUPANCY_ENTROPY_CONTRACT}: ${message}`);
}

function finiteInRange(value, field, minimum, maximum, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    fail(`${field} must be finite in ${minimum}..${maximum}`);
  }
  return number;
}

function revisitCount(value, field) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0 || number > 1_000_000_000) {
    fail(`${field} must be an integer in 0..1000000000`);
  }
  return number;
}

function round12(value) {
  return Number(Number(value).toFixed(12));
}

function resultChecksum(body) {
  return `occupancy-entropy1:${sha256Hex(body).slice(0, 32)}`;
}

/** Shared numeric kernel for performance-sensitive search loops. */
export function computeOccupancyEntropyInfluence({
  intrinsicEnergy,
  exactRevisits,
  familyRevisits,
  neighborhoodRevisits,
  decayLambda,
  exactWeight,
  familyWeight,
  neighborhoodWeight,
}) {
  const occupancyHeat = (
    exactWeight * Math.log1p(exactRevisits)
    + familyWeight * Math.log1p(familyRevisits)
    + neighborhoodWeight * Math.log1p(neighborhoodRevisits)
  );
  const entropicPressure = decayLambda * occupancyHeat;
  const attractionMultiplier = Math.exp(-entropicPressure);
  return {
    occupancyHeat,
    entropicPressure,
    attractionMultiplier,
    effectiveAttraction: intrinsicEnergy * attractionMultiplier,
  };
}

/**
 * Compute a molecule's temporary attraction in the current search landscape.
 *
 * E_effective = E_intrinsic * exp(-lambda * occupancyHeat)
 * occupancyHeat = alpha*ln(1+R_exact) + beta*ln(1+R_family)
 *               + gamma*ln(1+R_neighborhood)
 */
export function applyOccupancyEntropy(input = {}) {
  const intrinsicEnergy = finiteInRange(input.intrinsicEnergy, 'intrinsicEnergy', 0, 1);
  const exactRevisits = revisitCount(input.exactRevisits, 'exactRevisits');
  const familyRevisits = revisitCount(input.familyRevisits, 'familyRevisits');
  const neighborhoodRevisits = revisitCount(input.neighborhoodRevisits, 'neighborhoodRevisits');
  const decayLambda = finiteInRange(input.decayLambda, 'decayLambda', 0, 10, DEFAULTS.decayLambda);
  const exactWeight = finiteInRange(input.exactWeight, 'exactWeight', 0, 100, DEFAULTS.exactWeight);
  const familyWeight = finiteInRange(input.familyWeight, 'familyWeight', 0, 100, DEFAULTS.familyWeight);
  const neighborhoodWeight = finiteInRange(
    input.neighborhoodWeight,
    'neighborhoodWeight',
    0,
    100,
    DEFAULTS.neighborhoodWeight,
  );
  const weightMass = exactWeight + familyWeight + neighborhoodWeight;
  if (weightMass <= 0) fail('at least one occupancy weight must be positive');
  const weights = { exact: exactWeight, family: familyWeight, neighborhood: neighborhoodWeight };
  const influence = computeOccupancyEntropyInfluence({
    intrinsicEnergy,
    exactRevisits,
    familyRevisits,
    neighborhoodRevisits,
    decayLambda,
    exactWeight: weights.exact,
    familyWeight: weights.family,
    neighborhoodWeight: weights.neighborhood,
  });
  const body = {
    contract: OCCUPANCY_ENTROPY_CONTRACT,
    intrinsicEnergy: round12(intrinsicEnergy),
    occupancy: {
      exactRevisits,
      familyRevisits,
      neighborhoodRevisits,
    },
    weights: {
      exact: round12(weights.exact),
      family: round12(weights.family),
      neighborhood: round12(weights.neighborhood),
    },
    decayLambda: round12(decayLambda),
    occupancyHeat: round12(influence.occupancyHeat),
    entropicPressure: round12(influence.entropicPressure),
    attractionMultiplier: round12(influence.attractionMultiplier),
    effectiveAttraction: round12(Math.min(intrinsicEnergy, influence.effectiveAttraction)),
    attractionSpent: round12(Math.max(0, intrinsicEnergy - influence.effectiveAttraction)),
  };
  return stableClone({ ...body, checksum: resultChecksum(body) });
}

export function verifyOccupancyEntropyResult(result) {
  if (!result || result.contract !== OCCUPANCY_ENTROPY_CONTRACT || typeof result.checksum !== 'string') {
    return false;
  }
  const { checksum, ...body } = result;
  return checksum === resultChecksum(body);
}
