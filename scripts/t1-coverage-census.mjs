#!/usr/bin/env node
/**
 * TRAIN-only T1 coverage census. Does not read TEST. Does not use gold values.
 *
 *   node scripts/t1-coverage-census.mjs
 */
import { writeFileSync } from 'node:fs';
import { atomsFor } from '../codex/core/constellation/compose.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  censusUnknownMass,
  paretoCuts,
} from '../codex/core/constellation/semantic-particles/coverage-census.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-16-t1-coverage-census.json';
const train = loadSplit('train');
const posMap = loadPosMap();
const census = censusUnknownMass(train, posMap, EXPERIMENTAL_FEATURE_PROVIDER, atomsFor);
const cuts = paretoCuts(census);
const report = {
  contract: 'PB-T1-COVERAGE-CENSUS-v1',
  split: 'train',
  testFileOpened: false,
  ambiguousTokens: census.ambiguousTokens,
  unknownTokens: census.unknownTokens,
  unknownTokenRate: census.unknownTokenRate,
  totalUnknownMass: census.totalUnknown,
  keys: census.keys.length,
  pareto: cuts,
  top250: census.keys.slice(0, 250),
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TRAIN ambiguous tokens: ${census.ambiguousTokens}`);
console.log(`UNKNOWN token rate: ${(census.unknownTokenRate * 100).toFixed(1)}%`);
console.log(`UNKNOWN mass (lemma::TYPE observations): ${census.totalUnknown}`);
for (const cut of cuts) {
  console.log(`top ${cut.n}: ${(cut.share * 100).toFixed(1)}% of UNKNOWN mass (${cut.unknownMass})`);
}
console.log(`wrote ${OUT}`);
