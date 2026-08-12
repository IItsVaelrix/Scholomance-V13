#!/usr/bin/env node

/**
 * Derive `osmosisConcentrationLimit` from measured crowding, and refuse to
 * report one that cannot be shown to discriminate on the bank it governs.
 *
 *   node scripts/calibrate-osmotic-membrane.mjs
 *
 * 2026-08-12 REPAIR. The first version of this script calibrated on a
 * synthetic four-atom chain (`seed-a -> mid-b -> mid-c -> end-d`) and produced
 * n=12 samples, where the percentile estimator degenerated to the maximum. The
 * resulting limit of 0.904402 shipped as the cyclotron default and fired on
 * 91% of the real 44-atom ritual bank — a top-decile gate admitting nine
 * tenths of what it governed.
 *
 * Two changes close that path:
 *
 *   - Calibration runs on the ritual bank, the substrate the default governs.
 *   - The limit is derived at one seed and validated at another. A limit that
 *     does not survive a change of seed is a property of the run, not of the
 *     population, and `calibrateConcentrationLimit` refuses it.
 */

import { writeFileSync } from 'node:fs';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { calibrateConcentrationLimit } from '../codex/core/pixelbrain/osmotic-equilibrium.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-12-osmotic-equilibrium.md';
const DERIVE_SEED = 0x4f534d4f;
const VALIDATE_SEED = 0x484f4c44;
const TRIALS = 20_000;
const PERCENTILE = 0.90;

/**
 * Grounding is held at a constant so the calibration does not depend on the
 * encyclopedia corpus, which is not part of the membrane's contract. Crowding
 * derives from occupancy heat — revisit counts — and is independent of
 * grounding; grounding only shifts which molecules reach the shortlist.
 */
const CONSTANT_GROUNDING = 0.5;

function crowdingSamples(seed) {
  const report = runSemanticValenceCyclotron({
    atoms: ATOM_BLUEPRINTS.map((blueprint) => ({ ...blueprint, grounding: CONSTANT_GROUNDING })),
    bridgeRules: BRIDGE_RULES,
    trialCount: TRIALS,
    seed,
    maxMoleculeSize: 5,
    controlEvery: 5,
    shortlistLimit: 256,
    entropy: { enabled: true },
  });
  return report.candidates
    .map((candidate) => candidate.osmosis?.concentration)
    .filter(Number.isFinite);
}

const derive = crowdingSamples(DERIVE_SEED);
const validate = crowdingSamples(VALIDATE_SEED);

const calibration = calibrateConcentrationLimit(derive, {
  percentile: PERCENTILE,
  governed: validate,
});

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const six = (value) => value.toFixed(6);

console.log(`derive   seed 0x${DERIVE_SEED.toString(16)}  n=${derive.length}  `
  + `min=${six(Math.min(...derive))} max=${six(Math.max(...derive))}`);
console.log(`validate seed 0x${VALIDATE_SEED.toString(16)}  n=${validate.length}  `
  + `min=${six(Math.min(...validate))} max=${six(Math.max(...validate))}`);
console.log(`limit=${calibration.limit}`);
console.log(`cleared on derive=${pct(calibration.clearedFraction)}  `
  + `on validate=${pct(calibration.governedFraction)}  target=${pct(1 - PERCENTILE)}`);
console.log(`admissible=${calibration.admissible}`);
if (!calibration.admissible) {
  console.error(`ABORT: ${calibration.reason}`);
  process.exitCode = 1;
}

writeFileSync(OUT, [
  '# Osmotic Membrane Calibration',
  '',
  '**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`',
  `**Substrate:** ritual bank, ${ATOM_BLUEPRINTS.length} atoms, ${TRIALS.toLocaleString()} trials`,
  `**Derive seed:** \`0x${DERIVE_SEED.toString(16)}\`  ·  `
    + `**Validate seed:** \`0x${VALIDATE_SEED.toString(16)}\``,
  '',
  'The limit is derived at one seed and scored against a run at another. A',
  'limit that does not survive a change of seed describes the run, not the',
  'population.',
  '',
  '| statistic | derive | validate (governed) |',
  '|---|---|---|',
  `| samples | ${derive.length} | ${validate.length} |`,
  `| min crowding | ${six(Math.min(...derive))} | ${six(Math.min(...validate))} |`,
  `| median crowding | ${six([...derive].sort((a, b) => a - b)[derive.length >> 1])} `
    + `| ${six([...validate].sort((a, b) => a - b)[validate.length >> 1])} |`,
  `| max crowding | ${six(Math.max(...derive))} | ${six(Math.max(...validate))} |`,
  `| cleared by limit | ${pct(calibration.clearedFraction)} `
    + `| ${pct(calibration.governedFraction)} |`,
  '',
  `**Derived limit (p${PERCENTILE * 100}):** \`${calibration.limit}\``,
  `**Target clearance:** ${pct(1 - PERCENTILE)} ±10 percentage points`,
  `**Admissible:** ${calibration.admissible}`,
  '',
  calibration.reason
    ? `> ABORT: ${calibration.reason}`
    : '> The limit transfers: it clears a minority of the governed run, at the '
      + 'declared target, at a seed it was not derived from.',
  '',
].join('\n'));
console.log(`Evidence: ${OUT}`);
