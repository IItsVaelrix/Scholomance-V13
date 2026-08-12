#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  applyOccupancyEntropy,
  verifyOccupancyEntropyResult,
} from '../codex/core/pixelbrain/entropic-decay-dampener.js';
import { sha256Hex, stableClone } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const CONTRACT = 'PB-OCCUPANCY-ENTROPY-EVIDENCE-v1';
const TRIALS = 100_000;
const OUTPUT_PATH = fileURLToPath(new URL(
  '../docs/superpowers/evidence/2026-08-11-entropic-decay-dampener.json',
  import.meta.url,
));

function mix(value) {
  let x = Number(value) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function round12(value) {
  return Number(Number(value).toFixed(12));
}

function checksum(prefix, payload) {
  return `${prefix}:${sha256Hex(payload).slice(0, 32)}`;
}

function recordViolation(violations, trial, property, result) {
  if (violations.length < 32) {
    violations.push({ trial, property, resultChecksum: result.checksum });
  }
}

function runSweep() {
  let effectiveAttractionSum = 0;
  let attractionSpentSum = 0;
  let checksumVerified = 0;
  const violations = [];
  const sampledChecksums = [];

  for (let trial = 0; trial < TRIALS; trial += 1) {
    const intrinsicEnergy = (mix(trial ^ 0x13579bdf) % 1001) / 1000;
    const exactRevisits = mix(trial ^ 0x2468ace0) % 5001;
    const familyRevisits = mix(trial ^ 0x51ed270b) % 5001;
    const neighborhoodRevisits = mix(trial ^ 0x9e3779b1) % 5001;
    const decayLambda = (mix(trial ^ 0x85ebca6b) % 1001) / 1000;
    const exactWeight = (mix(trial ^ 0xc2b2ae35) % 10_001) / 1000;
    const familyWeight = (mix(trial ^ 0x27d4eb2f) % 10_001) / 1000;
    let neighborhoodWeight = (mix(trial ^ 0x165667b1) % 10_001) / 1000;
    if (exactWeight + familyWeight + neighborhoodWeight === 0) neighborhoodWeight = 1;
    const input = {
      intrinsicEnergy,
      exactRevisits,
      familyRevisits,
      neighborhoodRevisits,
      decayLambda,
      exactWeight,
      familyWeight,
      neighborhoodWeight,
    };
    const result = applyOccupancyEntropy(input);
    const moreOccupied = applyOccupancyEntropy({
      ...input,
      exactRevisits: exactRevisits + 1,
      familyRevisits: familyRevisits + 1,
      neighborhoodRevisits: neighborhoodRevisits + 1,
    });
    const tolerance = 2e-12;

    if (verifyOccupancyEntropyResult(result)) checksumVerified += 1;
    else recordViolation(violations, trial, 'checksum_verifies', result);
    if (result.intrinsicEnergy !== round12(intrinsicEnergy)) {
      recordViolation(violations, trial, 'intrinsic_energy_immutable', result);
    }
    if (result.effectiveAttraction < -tolerance
      || result.effectiveAttraction > result.intrinsicEnergy + tolerance) {
      recordViolation(violations, trial, 'bounded_search_influence', result);
    }
    if (moreOccupied.effectiveAttraction > result.effectiveAttraction + tolerance) {
      recordViolation(violations, trial, 'occupancy_monotonicity', result);
    }
    if (result.occupancyHeat < -tolerance || result.entropicPressure < -tolerance) {
      recordViolation(violations, trial, 'nonnegative_pressure', result);
    }
    if (result.weights.exact !== round12(exactWeight)
      || result.weights.family !== round12(familyWeight)
      || result.weights.neighborhood !== round12(neighborhoodWeight)) {
      recordViolation(violations, trial, 'declared_weights_preserved', result);
    }

    effectiveAttractionSum += result.effectiveAttraction;
    attractionSpentSum += result.attractionSpent;
    if (trial % 1000 === 0) sampledChecksums.push(result.checksum);
  }

  return stableClone({
    trials: TRIALS,
    counts: { checksumVerified, violations: violations.length },
    measurements: {
      meanEffectiveAttraction: round12(effectiveAttractionSum / TRIALS),
      meanAttractionSpent: round12(attractionSpentSum / TRIALS),
    },
    properties: {
      intrinsicEnergyImmutable: violations.every((entry) => entry.property !== 'intrinsic_energy_immutable'),
      boundedSearchInfluence: violations.every((entry) => entry.property !== 'bounded_search_influence'),
      occupancyMonotonicity: violations.every((entry) => entry.property !== 'occupancy_monotonicity'),
      nonnegativePressure: violations.every((entry) => entry.property !== 'nonnegative_pressure'),
      declaredWeightsPreserved: violations.every(
        (entry) => entry.property !== 'declared_weights_preserved',
      ),
      checksumsVerify: violations.every((entry) => entry.property !== 'checksum_verifies'),
    },
    sampledTraceChecksum: checksum('occupancy-trace1', sampledChecksums),
    violations,
  });
}

const firstSweep = runSweep();
const replaySweep = runSweep();
const exactReplay = JSON.stringify(firstSweep) === JSON.stringify(replaySweep);
const boundaries = stableClone({
  unoccupied: applyOccupancyEntropy({ intrinsicEnergy: 0.8 }),
  exactOnly: applyOccupancyEntropy({ intrinsicEnergy: 0.8, exactRevisits: 100 }),
  familyOnly: applyOccupancyEntropy({ intrinsicEnergy: 0.8, familyRevisits: 100 }),
  neighborhoodOnly: applyOccupancyEntropy({ intrinsicEnergy: 0.8, neighborhoodRevisits: 100 }),
  zeroEnergy: applyOccupancyEntropy({ intrinsicEnergy: 0, exactRevisits: 1000 }),
  zeroLambda: applyOccupancyEntropy({ intrinsicEnergy: 0.8, exactRevisits: 1000, decayLambda: 0 }),
});
const boundaryChecks = {
  unoccupiedPreservesAttraction: boundaries.unoccupied.effectiveAttraction === 0.8,
  exactBasinDecays: boundaries.exactOnly.effectiveAttraction < 0.8,
  familyBasinDecays: boundaries.familyOnly.effectiveAttraction < 0.8,
  neighborhoodDecays: boundaries.neighborhoodOnly.effectiveAttraction < 0.8,
  zeroEnergyRemainsZero: boundaries.zeroEnergy.effectiveAttraction === 0,
  zeroLambdaDisablesDecay: boundaries.zeroLambda.effectiveAttraction === 0.8,
};
const passed = firstSweep.counts.violations === 0
  && firstSweep.counts.checksumVerified === TRIALS
  && exactReplay
  && Object.values(boundaryChecks).every(Boolean);
const body = {
  contract: CONTRACT,
  schemaVersion: '1.0.0',
  protocol: {
    trials: TRIALS,
    deterministicCounterAddressing: true,
    wallClockInputs: false,
    replayedInFull: true,
  },
  sweep: firstSweep,
  exactReplay,
  boundaries,
  boundaryChecks,
  verdict: passed ? 'PASS' : 'FAIL',
};
const report = stableClone({ ...body, checksum: checksum('occupancy-evidence1', body) });

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!passed) process.exitCode = 1;
