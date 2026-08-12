#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import {
  attest,
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';
import { sha256Hex, stableClone } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import {
  ATOM_BLUEPRINTS,
  BRIDGE_RULES,
  RITUAL_CONCENTRATION_LIMIT,
} from './semantic-valence-cyclotron.mjs';

const CONTRACT = 'PB-CYCLOTRON-OCCUPANCY-BENCHMARK-v1';
const TRIALS_PER_ARM = 100_000;
const SEED = 0x5c4010;
const OUTPUT_PATH = fileURLToPath(new URL(
  '../docs/superpowers/evidence/2026-08-11-cyclotron-occupancy-entropy.json',
  import.meta.url,
));

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function checksum(prefix, payload) {
  return `${prefix}:${sha256Hex(payload).slice(0, 32)}`;
}

function exactTwoSidedSignP(wins, losses) {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let coefficient = 1;
  let cumulative = 0;
  for (let index = 0; index <= k; index += 1) {
    if (index > 0) coefficient = (coefficient * (n - index + 1)) / index;
    cumulative += coefficient;
  }
  return round6(Math.min(1, 2 * cumulative / (2 ** n)));
}

function compareBuckets(controlBuckets, treatmentBuckets, field, higherIsBetter = true) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (let index = 0; index < controlBuckets.length; index += 1) {
    const left = treatmentBuckets[index][field];
    const right = controlBuckets[index][field];
    if (left === right) ties += 1;
    else if ((left > right) === higherIsBetter) wins += 1;
    else losses += 1;
  }
  return { field, wins, losses, ties, exactTwoSidedSignP: exactTwoSidedSignP(wins, losses) };
}

function summarize(sourceReport) {
  const observed = sourceReport.counts.uniqueMolecules + sourceReport.counts.duplicateMolecules;
  const highFinalScoreTail = sourceReport.candidates.filter((candidate) => candidate.finalScore >= 0.75).length;
  return stableClone({
    reportChecksum: sourceReport.checksum,
    trials: sourceReport.completedTrials,
    candidateTrials: sourceReport.counts.candidateTrials,
    boundCandidateTrials: observed,
    uniqueMolecules: sourceReport.counts.uniqueMolecules,
    duplicateMolecules: sourceReport.counts.duplicateMolecules,
    uniqueYield: round6(sourceReport.counts.uniqueMolecules / Math.max(observed, 1)),
    duplicateRate: round6(sourceReport.counts.duplicateMolecules / Math.max(observed, 1)),
    familyEffectiveDiversity: sourceReport.searchLandscape.entropy.family.effectiveDiversity,
    neighborhoodEffectiveDiversity: sourceReport.searchLandscape.entropy.neighborhood.effectiveDiversity,
    meanIntrinsicEnergy: sourceReport.searchLandscape.intrinsicQuality.meanEnergy,
    meanNovelty: sourceReport.searchLandscape.intrinsicQuality.meanNovelty,
    aboveControlBar: sourceReport.searchLandscape.intrinsicQuality.aboveControlBar,
    maximumIntrinsicEnergy: sourceReport.searchLandscape.intrinsicQuality.maximumEnergy,
    highFinalScoreTail,
    shortlisted: sourceReport.counts.shortlisted,
    nuclei: sourceReport.counts.nuclei,
    hypotheses: sourceReport.counts.hypotheses,
    entropyRedirects: sourceReport.searchLandscape.entropy.redirects,
  });
}

const groundingIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
const atoms = ATOM_BLUEPRINTS.map((blueprint) => ({
  ...blueprint,
  grounding: attest(groundingIndex, blueprint.label).score,
}));
const baseOptions = {
  atoms,
  bridgeRules: BRIDGE_RULES,
  groundingIndex,
  trialCount: TRIALS_PER_ARM,
  seed: SEED,
  maxMoleculeSize: 5,
  controlEvery: 5,
  controlPercentile: 0.99,
  shortlistLimit: 256,
  shortlistFamilyCap: 2,
  noveltyFloor: 0.04,
  finalScoreFloor: 0.58,
  nucleusScoreFloor: 0.765,
  nucleusNoveltyFloor: 0.32,
  nucleusMinDomains: 3,
  osmosisConcentrationLimit: RITUAL_CONCENTRATION_LIMIT,
};
const control = runSemanticValenceCyclotron({
  ...baseOptions,
  entropy: { enabled: false },
});
const treatmentOptions = {
  ...baseOptions,
  entropy: {
    enabled: true,
    decayLambda: 0.35,
    exactWeight: 4,
    familyWeight: 2,
    neighborhoodWeight: 0.5,
    escapeAttempts: 3,
  },
};
const treatment = runSemanticValenceCyclotron(treatmentOptions);
const treatmentReplay = runSemanticValenceCyclotron(treatmentOptions);
if (!verifySemanticCyclotronReport(control) || !verifySemanticCyclotronReport(treatment)) {
  throw new Error('A matched Cyclotron report failed checksum verification');
}
if (treatmentReplay.checksum !== treatment.checksum) {
  throw new Error('Occupancy treatment failed exact deterministic replay');
}

const controlSummary = summarize(control);
const treatmentSummary = summarize(treatment);
const changes = {
  uniqueMolecules: treatmentSummary.uniqueMolecules - controlSummary.uniqueMolecules,
  uniqueYield: round6(treatmentSummary.uniqueYield - controlSummary.uniqueYield),
  duplicateRate: round6(treatmentSummary.duplicateRate - controlSummary.duplicateRate),
  familyEffectiveDiversity: round6(
    treatmentSummary.familyEffectiveDiversity - controlSummary.familyEffectiveDiversity,
  ),
  neighborhoodEffectiveDiversity: round6(
    treatmentSummary.neighborhoodEffectiveDiversity - controlSummary.neighborhoodEffectiveDiversity,
  ),
  meanIntrinsicEnergy: round6(treatmentSummary.meanIntrinsicEnergy - controlSummary.meanIntrinsicEnergy),
  meanNovelty: round6(treatmentSummary.meanNovelty - controlSummary.meanNovelty),
  aboveControlBar: treatmentSummary.aboveControlBar - controlSummary.aboveControlBar,
  highFinalScoreTail: treatmentSummary.highFinalScoreTail - controlSummary.highFinalScoreTail,
};
const pairedBuckets = {
  uniqueMolecules: compareBuckets(
    control.searchLandscape.buckets,
    treatment.searchLandscape.buckets,
    'uniqueMolecules',
  ),
  duplicateMolecules: compareBuckets(
    control.searchLandscape.buckets,
    treatment.searchLandscape.buckets,
    'duplicateMolecules',
    false,
  ),
  meanIntrinsicEnergy: compareBuckets(
    control.searchLandscape.buckets,
    treatment.searchLandscape.buckets,
    'meanEnergy',
  ),
  meanNovelty: compareBuckets(
    control.searchLandscape.buckets,
    treatment.searchLandscape.buckets,
    'meanNovelty',
  ),
};
const qualityPreserved = changes.meanIntrinsicEnergy >= -0.02
  && changes.meanNovelty >= -0.02
  && treatmentSummary.maximumIntrinsicEnergy >= controlSummary.maximumIntrinsicEnergy - 0.01;
const yieldImproved = changes.uniqueYield >= 0.05 && changes.duplicateRate <= -0.05;
const familyDiversityImproved = changes.familyEffectiveDiversity > 0;
const familyDiversityPreserved = treatmentSummary.familyEffectiveDiversity
  >= controlSummary.familyEffectiveDiversity * 0.98;
const neighborhoodDiversityPreserved = treatmentSummary.neighborhoodEffectiveDiversity
  >= controlSummary.neighborhoodEffectiveDiversity * 0.98;
const searchImproved = yieldImproved
  && familyDiversityPreserved
  && neighborhoodDiversityPreserved
  && qualityPreserved;
const body = {
  contract: CONTRACT,
  schemaVersion: '1.0.0',
  protocol: {
    trialsPerArm: TRIALS_PER_ARM,
    seed: SEED,
    atomBankShared: true,
    groundingIndexShared: true,
    trialScheduleShared: true,
    shuffledControlScheduleShared: true,
    treatmentReplayExact: true,
    selectionInfluenceOnly: true,
    intrinsicEnergyDecayed: false,
    evidenceConfidenceDecayed: false,
  },
  arms: { control: controlSummary, treatment: treatmentSummary },
  changes,
  pairedBuckets,
  criteria: {
    yieldImproved,
    familyDiversityImproved,
    familyDiversityPreserved,
    neighborhoodDiversityPreserved,
    qualityPreserved,
    searchImproved,
  },
  generalization: {
    accuracy: null,
    discordantWins: null,
    discordantLosses: null,
    status: 'NOT_MEASURED_NO_EXECUTABLE_MOLECULE_TO_BLIND_TASK_BINDING',
  },
  verdict: searchImproved ? 'SEARCH_PROCESS_IMPROVED_UTILITY_UNTESTED' : 'NO_DECISIVE_SEARCH_IMPROVEMENT',
};
const report = stableClone({ ...body, checksum: checksum('occupancy-benchmark1', body) });

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
