#!/usr/bin/env node

/**
 * Derive `osmosisConcentrationLimit` from measured crowding, and refuse to
 * report one that cannot discriminate.
 *
 *   node scripts/calibrate-osmotic-membrane.mjs
 */

import { writeFileSync } from 'node:fs';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { calibrateConcentrationLimit } from '../codex/core/pixelbrain/osmotic-equilibrium.js';

const OUT = 'docs/superpowers/evidence/2026-08-12-osmotic-equilibrium.md';
const SEED = 0x4f534d4f;

function bank() {
  const A = (id, label, domain, offers, seeks, grounding) => ({
    id, label, domain, offers, seeks, traits: [], inhibits: [],
    evidence: ['codex/core/pixelbrain/canonical-json.js'], grounding,
  });
  return [
    A('seed-a', 'deterministic sealed checksum source', 'synthesis', ['port-a'], [], 0.80),
    A('mid-b', 'canonical schema verifier stage', 'governance', ['port-b'], ['port-a'], 0.85),
    A('mid-c', 'concept chemistry feasibility scorer', 'immunity', ['port-c'], ['port-b'], 0.88),
    A('end-d', 'evidence ledger structure sink', 'artifact', ['port-d'], ['port-c'], 0.90),
  ];
}

const report = runSemanticValenceCyclotron({
  atoms: bank(),
  trialCount: 8000,
  seed: SEED,
  maxMoleculeSize: 4,
  controlEvery: 5,
  shortlistLimit: 256,
  entropy: { enabled: true },
  osmosisConcentrationLimit: 0.5,
});

const samples = report.candidates
  .map((c) => c.osmosis?.concentration)
  .filter(Number.isFinite);

const calibration = calibrateConcentrationLimit(samples, { percentile: 0.90 });

console.log(`samples: ${samples.length}`);
console.log(`min=${Math.min(...samples).toFixed(6)} max=${Math.max(...samples).toFixed(6)}`);
console.log(`limit=${calibration.limit} cleared=${(calibration.clearedFraction * 100).toFixed(1)}%`);
console.log(`admissible=${calibration.admissible}`);
if (!calibration.admissible) {
  console.error(`ABORT: ${calibration.reason}`);
  process.exitCode = 1;
}

writeFileSync(OUT, [
  '# Osmotic Membrane Calibration',
  '',
  '**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`',
  `**Seed:** \`0x${SEED.toString(16)}\``,
  '',
  '| statistic | value |',
  '|---|---|',
  `| samples | ${samples.length} |`,
  `| min crowding | ${Math.min(...samples).toFixed(6)} |`,
  `| max crowding | ${Math.max(...samples).toFixed(6)} |`,
  `| derived limit (p90) | ${calibration.limit} |`,
  `| cleared by | ${(calibration.clearedFraction * 100).toFixed(1)}% |`,
  `| admissible | ${calibration.admissible} |`,
  '',
  calibration.reason ? `> ABORT: ${calibration.reason}` : '> Limit discriminates: neither 0% nor 100%.',
  '',
].join('\n'));
console.log(`Evidence: ${OUT}`);
