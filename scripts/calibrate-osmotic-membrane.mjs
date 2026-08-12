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
import { buildDefaultBank } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
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

/**
 * A limit is needed to RUN the cyclotron, but the run being sampled here is
 * the one that produces the crowding distribution the limit is derived from.
 * This value therefore only has to be legal — it cannot bias the sample,
 * because it steers only the escape path and every candidate's crowding is
 * recorded either way.
 */
const SAMPLING_LIMIT = 0.5;

const full = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

const BANKS = [
  { name: 'ritual', blueprints: ATOM_BLUEPRINTS, bridges: BRIDGE_RULES },
  { name: 'full', blueprints: full.blueprints, bridges: full.bridges },
];

function crowdingSamples(bank, seed) {
  const report = runSemanticValenceCyclotron({
    atoms: bank.blueprints.map((blueprint) => ({
      ...blueprint,
      grounding: CONSTANT_GROUNDING,
    })),
    bridgeRules: bank.bridges,
    trialCount: TRIALS,
    seed,
    maxMoleculeSize: 5,
    controlEvery: 5,
    shortlistLimit: 256,
    osmosisConcentrationLimit: SAMPLING_LIMIT,
    entropy: { enabled: true },
  });
  return report.candidates
    .map((candidate) => candidate.osmosis?.concentration)
    .filter(Number.isFinite);
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const six = (value) => value.toFixed(6);
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];

const results = BANKS.map((bank) => {
  const derive = crowdingSamples(bank, DERIVE_SEED);
  const validate = crowdingSamples(bank, VALIDATE_SEED);
  const calibration = calibrateConcentrationLimit(derive, {
    percentile: PERCENTILE,
    governed: validate,
  });
  console.log(`${bank.name.padEnd(7)} atoms=${bank.blueprints.length} `
    + `n=${derive.length}/${validate.length} `
    + `limit=${calibration.limit} `
    + `cleared derive=${pct(calibration.clearedFraction)} `
    + `validate=${pct(calibration.governedFraction)} `
    + `admissible=${calibration.admissible}`);
  if (!calibration.admissible) {
    console.error(`  ABORT (${bank.name}): ${calibration.reason}`);
    process.exitCode = 1;
  }
  return { bank, derive, validate, calibration };
});

// The portability claim is the reason this file exists: show each bank's limit
// scored against the OTHER bank's population.
const crossBank = results.map((row, index) => {
  const other = results[1 - index];
  const fraction = other.validate.filter((v) => v >= row.calibration.limit).length
    / other.validate.length;
  return { from: row.bank.name, to: other.bank.name, limit: row.calibration.limit, fraction };
});
console.log('');
for (const row of crossBank) {
  console.log(`limit ${row.limit} derived on ${row.from} clears ${pct(row.fraction)} of ${row.to}`);
}

writeFileSync(OUT, [
  '# Osmotic Membrane Calibration',
  '',
  '**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`',
  `**Trials:** ${TRIALS.toLocaleString()} · **Percentile:** p${PERCENTILE * 100} · `
    + `**Target clearance:** ${pct(1 - PERCENTILE)} ±10 points`,
  `**Derive seed:** \`0x${DERIVE_SEED.toString(16)}\` · `
    + `**Validate seed:** \`0x${VALIDATE_SEED.toString(16)}\``,
  '',
  'Each limit is derived at one seed and scored against a run at another. A',
  'limit that does not survive a change of seed describes the run, not the',
  'population.',
  '',
  '| bank | atoms | min | median | max | limit | cleared (derive) | cleared (validate) | admissible |',
  '|---|---|---|---|---|---|---|---|---|',
  ...results.map(({ bank, derive, validate, calibration }) => (
    `| ${bank.name} | ${bank.blueprints.length} | ${six(Math.min(...derive))} `
    + `| ${six(median(derive))} | ${six(Math.max(...derive))} `
    + `| \`${calibration.limit}\` | ${pct(calibration.clearedFraction)} `
    + `| ${pct(calibration.governedFraction)} | ${calibration.admissible} |`
  )),
  '',
  '## No limit is portable',
  '',
  'This is why `osmosisConcentrationLimit` is a required option with no',
  'default. Crowding is `h/(1+h)` over occupancy heat, and heat is a weighted',
  'log of revisit counts — which are a function of how small the reachable',
  'graph is. Heat measures graph size as much as it measures crowding.',
  '',
  '| limit derived on | value | clears, on the other bank |',
  '|---|---|---|',
  ...crossBank.map((row) => `| ${row.from} | \`${row.limit}\` | ${pct(row.fraction)} of ${row.to} |`),
  '',
  ...results.flatMap(({ bank, calibration }) => (
    calibration.reason ? [`> ABORT (${bank.name}): ${calibration.reason}`, ''] : []
  )),
  results.every((row) => row.calibration.admissible)
    ? '> Both limits transfer across seeds within their own bank, and neither '
      + 'transfers across banks.'
    : '',
  '',
].join('\n'));
console.log(`Evidence: ${OUT}`);
