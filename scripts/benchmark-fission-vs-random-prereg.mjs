#!/usr/bin/env node

/**
 * Train/validation/test benchmark for the Semantic Fission Reactor.
 *
 * The reactor receives external truth for training and validation only. A
 * 240-task generalization test and the previously sealed 24-task AI challenge
 * remain outside evolution and threshold calibration.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  predictSemanticFission,
  runSemanticFissionReactor,
  verifySemanticFissionReport,
} from '../codex/core/pixelbrain/semantic-fission-reactor.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import { chemistryProvenance } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  RELATIONS,
  buildChallenge,
  methodChoices,
  openDatabase,
  readExternalEdges,
  sampleTasks,
  summarizeMethod,
  taskChannels,
} from './benchmark-semantic-molecule-discovery.mjs';

const CONTRACT = 'PB-SEMANTIC-REACTOR-PREREG-v1';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-11-fission-vs-random-prereg-701.json';
const DIRECT_PROPOSAL_PATH = 'docs/superpowers/evidence/2026-08-11-direct-ai-blind-proposals.json';
const PREREG_PATH = 'docs/superpowers/evidence/2026-08-11-PREREG-fission-vs-random.md';
const TRAIN_PER_RELATION = 100;
const VALIDATION_PER_RELATION = 40;
/**
 * Preregistered per-relation generalization-test sizes. `similar` is capped by the
 * substrate: the fresh disjoint sampler can supply only 224 `similar` tasks after the
 * pilot reservation, and train+val consume 140 of them, leaving 84.
 * Measured, not estimated — see the AMENDMENT section of
 * docs/superpowers/evidence/2026-08-11-PREREG-fission-vs-random.md
 */
const TEST_PER_RELATION_BY_REL = Object.freeze({
  hypernym: 205,
  antonym: 205,
  mero_part: 205,
  similar: 84,
});
/** Reservation size held identical to the pilot so the excluded pool is unchanged. */
const PILOT_TEST_PER_RELATION = 60;
const PRIOR_BLIND_PER_RELATION = 6;
const testCountFor = (relation) => TEST_PER_RELATION_BY_REL[relation];
const FEATURE_NAMES = Object.freeze([
  'lexical',
  'vector',
  'chemistry',
  'containment',
  'polarity',
  'lexical_vector',
  'lexical_chemistry',
  'vector_chemistry',
  'containment_chemistry',
  'polarity_vector',
]);

const HUMAN_WEIGHTS = Object.freeze({
  hypernym: Object.freeze({ lexical: 0.30, vector: 0.25, chemistry: 0.25, containment: 0.20 }),
  antonym: Object.freeze({ lexical: 0.20, vector: 0.35, chemistry: 0.25, polarity: 0.20 }),
  mero_part: Object.freeze({ lexical: 0.20, vector: 0.20, chemistry: 0.15, containment: 0.45 }),
  similar: Object.freeze({ lexical: 0.35, vector: 0.35, chemistry: 0.30 }),
});

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function checksum(prefix, body) {
  return `${prefix}:${sha256Hex(body).slice(0, 32)}`;
}

function hashUint(value) {
  return Number.parseInt(sha256Hex(String(value)).slice(0, 8), 16) >>> 0;
}

function deterministicSplit(tasks) {
  const training = {};
  const validation = {};
  const test = {};
  for (const relation of Object.keys(RELATIONS)) {
    const ordered = tasks.filter((task) => task.relation === relation)
      .sort((a, b) => (
        hashUint(`reactor-split|${a.taskId}`) - hashUint(`reactor-split|${b.taskId}`)
        || a.taskId.localeCompare(b.taskId)
      ));
    training[relation] = ordered.slice(0, TRAIN_PER_RELATION);
    validation[relation] = ordered.slice(TRAIN_PER_RELATION, TRAIN_PER_RELATION + VALIDATION_PER_RELATION);
    test[relation] = ordered.slice(
      TRAIN_PER_RELATION + VALIDATION_PER_RELATION,
      TRAIN_PER_RELATION + VALIDATION_PER_RELATION + testCountFor(relation),
    );
  }
  return { training, validation, test };
}

function sampleFreshGloballyDisjoint(rows, perRelationFor, excludedSourceIds) {
  const allTrueTargets = new Map();
  const decoyPools = new Map();
  for (const row of rows) {
    const truthKey = `${row.relation}|${row.sourceId}`;
    if (!allTrueTargets.has(truthKey)) allTrueTargets.set(truthKey, new Set());
    allTrueTargets.get(truthKey).add(row.targetId);
    const poolKey = `${row.relation}|${row.pos}|${row.lexname}`;
    if (!decoyPools.has(poolKey)) decoyPools.set(poolKey, new Map());
    if (!decoyPools.get(poolKey).has(row.targetId)) decoyPools.get(poolKey).set(row.targetId, row);
  }
  const orderedPools = new Map([...decoyPools.entries()].map(([key, pool]) => [
    key,
    [...pool.values()].sort((a, b) => (
      hashUint(`fresh-decoy|${key}|${a.targetId}`) - hashUint(`fresh-decoy|${key}|${b.targetId}`)
      || a.targetId.localeCompare(b.targetId)
    )),
  ]));
  const usedSourceIds = new Set(excludedSourceIds);
  const selected = [];
  for (const relation of Object.keys(RELATIONS)) {
    const perRelation = perRelationFor(relation);
    const ordered = rows.filter((row) => row.relation === relation)
      .sort((a, b) => (
        hashUint(`fresh-reactor-selection|${a.sourceId}|${a.targetId}`)
          - hashUint(`fresh-reactor-selection|${b.sourceId}|${b.targetId}`)
        || `${a.sourceId}|${a.targetId}`.localeCompare(`${b.sourceId}|${b.targetId}`)
      ));
    let count = 0;
    for (const truth of ordered) {
      if (usedSourceIds.has(truth.sourceId)) continue;
      const forbidden = allTrueTargets.get(`${relation}|${truth.sourceId}`) ?? new Set();
      const pool = orderedPools.get(`${relation}|${truth.pos}|${truth.lexname}`) ?? [];
      const decoys = [];
      for (const row of pool) {
        if (row.targetId === truth.targetId || row.targetId === truth.sourceId || forbidden.has(row.targetId)) continue;
        decoys.push(row);
        if (decoys.length === 4) break;
      }
      if (decoys.length !== 4) continue;
      const candidates = [truth, ...decoys].sort((a, b) => (
        hashUint(`fresh-label|${truth.sourceId}|${a.targetId}`)
          - hashUint(`fresh-label|${truth.sourceId}|${b.targetId}`)
        || a.targetId.localeCompare(b.targetId)
      )).map((row, index) => ({
        label: String.fromCharCode(65 + index),
        synsetId: row.targetId,
        lemma: row.targetLemma,
        definition: row.targetDefinition,
      }));
      const answer = candidates.find((candidate) => candidate.synsetId === truth.targetId)?.label;
      if (!answer) throw new Error('Fresh sampler failed to bind answer label');
      usedSourceIds.add(truth.sourceId);
      selected.push({
        taskId: `oewn-reactor-${relation}-${sha256Hex(truth.sourceId).slice(0, 10)}`,
        relation,
        relationPrompt: RELATIONS[relation].prompt,
        source: {
          synsetId: truth.sourceId,
          lemma: truth.sourceLemma,
          definition: truth.sourceDefinition,
          pos: truth.pos,
          lexname: truth.lexname,
        },
        candidates,
        answer,
      });
      count += 1;
      if (count === perRelation) break;
    }
    if (count !== perRelation) throw new Error(`Unable to select ${perRelation} fresh disjoint ${relation} tasks`);
  }
  return selected;
}

function enrichedFeatures(channel) {
  const lexical = channel.lexical ?? 0;
  const vector = channel.vector ?? 0;
  const chemistry = channel.chemistry ?? 0;
  const containment = channel.containment ?? 0;
  const polarity = channel.polarity ?? 0;
  return [
    lexical,
    vector,
    chemistry,
    containment,
    polarity,
    lexical * vector,
    lexical * chemistry,
    vector * chemistry,
    containment * chemistry,
    polarity * vector,
  ].map(round6);
}

function prepareTasks(tasks, channelCache) {
  return tasks.map((task) => ({
    taskId: task.taskId,
    relation: task.relation,
    answer: task.answer,
    candidates: task.candidates.map((candidate, index) => ({
      label: candidate.label,
      features: enrichedFeatures(channelCache.get(task.taskId).get(index)),
    })),
  }));
}

function seedWeights() {
  return Object.fromEntries(Object.keys(RELATIONS).map((relation) => {
    const base = HUMAN_WEIGHTS[relation];
    return [relation, FEATURE_NAMES.map((name) => Math.round((base[name] ?? 0) * 1000))];
  }));
}

function flattenByRelation(value) {
  return Object.keys(RELATIONS).flatMap((relation) => value[relation]);
}

function assertSplitIsolation(namedSplits) {
  const seenTaskIds = new Set();
  const seenSourceIds = new Set();
  for (const [name, tasks] of Object.entries(namedSplits)) {
    for (const task of tasks) {
      if (seenTaskIds.has(task.taskId) || seenSourceIds.has(task.source.synsetId)) {
        throw new Error(`Split leakage detected in ${name}: ${task.taskId}`);
      }
      seenTaskIds.add(task.taskId);
      seenSourceIds.add(task.source.synsetId);
    }
  }
}

function reactorChoices(reactorReport, tasks, preparedById) {
  const choices = new Map();
  const predictions = new Map();
  for (const task of tasks) {
    const prediction = predictSemanticFission(reactorReport, preparedById.get(task.taskId));
    choices.set(task.taskId, prediction.choice);
    predictions.set(task.taskId, prediction);
  }
  return { choices, predictions };
}

function combination(n, k) {
  const bounded = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= bounded; index += 1) value = (value * (n - bounded + index)) / index;
  return value;
}

function exactSignP(wins, losses) {
  const discordant = wins + losses;
  if (!discordant) return 1;
  const tail = Math.min(wins, losses);
  let probability = 0;
  for (let index = 0; index <= tail; index += 1) probability += combination(discordant, index) * (0.5 ** discordant);
  return round6(Math.min(1, probability * 2));
}

function compare(left, right) {
  const rightRows = new Map(right.rows.map((row) => [row.taskId, row.correct]));
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const row of left.rows) {
    const other = rightRows.get(row.taskId);
    if (row.correct && !other) wins += 1;
    else if (!row.correct && other) losses += 1;
    else ties += 1;
  }
  return {
    left: left.name,
    right: right.name,
    wins,
    losses,
    ties,
    accuracyDelta: round6(left.accuracy - right.accuracy),
    exactTwoSidedSignP: exactSignP(wins, losses),
  };
}

function verifyDirectProposal(challenge) {
  const proposal = JSON.parse(readFileSync(DIRECT_PROPOSAL_PATH, 'utf8'));
  const { checksum: supplied, ...body } = proposal;
  if (proposal.challengeChecksum !== challenge.checksum) throw new Error('Direct proposal challenge binding mismatch');
  if (supplied !== checksum('direct-proposals1', body)) throw new Error('Direct proposal checksum mismatch');
  return {
    checksum: supplied,
    choices: new Map(proposal.choices.map((choice) => [choice.taskId, choice.candidateLabel])),
  };
}

function summarizeWithoutRows(summary) {
  const { rows: _rows, ...body } = summary;
  return body;
}

function buildSubstrateFingerprint(database, rows) {
  const metadata = database.prepare("SELECT key, value FROM meta WHERE key IN ('oewn_antonym_release', 'oewn_antonym_source_sha256') ORDER BY key").all();
  return checksum('oewn-substrate1', {
    metadata,
    edgeIdentity: rows.map((row) => `${row.sourceId}|${row.relation}|${row.targetId}`).sort(),
  });
}

function runBenchmark() {
  const database = openDatabase();
  const rows = readExternalEdges(database);
  const substrateFingerprint = buildSubstrateFingerprint(database, rows);
  database.close();

  const priorBlindTasks = sampleTasks(rows, PRIOR_BLIND_PER_RELATION);
  const pilotReservation = sampleTasks(
    rows,
    PRIOR_BLIND_PER_RELATION + TRAIN_PER_RELATION + VALIDATION_PER_RELATION + PILOT_TEST_PER_RELATION,
  );
  const reservedSourceIds = new Set(pilotReservation.map((task) => task.source.synsetId));
  const sampled = sampleFreshGloballyDisjoint(
    rows,
    (relation) => TRAIN_PER_RELATION + VALIDATION_PER_RELATION + testCountFor(relation),
    reservedSourceIds,
  );
  const splits = deterministicSplit(sampled);
  const flatTraining = flattenByRelation(splits.training);
  const flatValidation = flattenByRelation(splits.validation);
  const flatTest = flattenByRelation(splits.test);
  assertSplitIsolation({
    training: flatTraining,
    validation: flatValidation,
    generalizationTest: flatTest,
    sealedAiTest: priorBlindTasks,
  });
  const allGeneralTasks = [
    ...flatTraining,
    ...flatValidation,
    ...flatTest,
  ];
  const allTasks = [...allGeneralTasks, ...priorBlindTasks];
  const channelCache = new Map(allTasks.map((task) => [task.taskId, taskChannels(task)]));
  const prepared = prepareTasks(allTasks, channelCache);
  const preparedById = new Map(prepared.map((task) => [task.taskId, task]));
  const training = Object.fromEntries(Object.keys(RELATIONS).map((relation) => [
    relation,
    prepareTasks(splits.training[relation], channelCache),
  ]));
  const validation = Object.fromEntries(Object.keys(RELATIONS).map((relation) => [
    relation,
    prepareTasks(splits.validation[relation], channelCache),
  ]));

  const reactorOptions = {
    featureNames: FEATURE_NAMES,
    relations: Object.keys(RELATIONS),
    training,
    validation,
    seedWeights: seedWeights(),
    seed: 0x72656163,
    populationSize: 96,
    generations: 60,
    eliteCount: 16,
    candidatePoolSize: 32,
    mutationPermille: 180,
    minimumActiveGenes: 2,
    complexityPenalty: 0.003,
    marginReward: 0.02,
  };
  const reactor = runSemanticFissionReactor(reactorOptions);
  const reactorReplay = runSemanticFissionReactor(reactorOptions);
  if (!verifySemanticFissionReport(reactor) || reactor.checksum !== reactorReplay.checksum) {
    throw new Error('Semantic Fission Reactor replay verification failed');
  }

  const testTasks = flatTest;
  const oldMethods = methodChoices(testTasks, channelCache);
  const reactorTest = reactorChoices(reactor, testTasks, preparedById);
  const generalSummaries = [
    summarizeMethod('fission_reactor', testTasks, reactorTest.choices),
    summarizeMethod('current_cyclotron', testTasks, oldMethods.cyclotron),
    summarizeMethod('random_valence', testTasks, oldMethods.randomValence),
    summarizeMethod('human_reference', testTasks, oldMethods.humanReference),
  ];
  const reactorSummary = generalSummaries[0];
  const generalComparisons = generalSummaries.slice(1).map((summary) => compare(reactorSummary, summary));
  const baselineCorrect = new Map(testTasks.map((task) => [task.taskId, generalSummaries.slice(1).some(
    (summary) => summary.rows.find((row) => row.taskId === task.taskId)?.correct,
  )]));
  const exclusiveCorrect = reactorSummary.rows.filter((row) => row.correct && !baselineCorrect.get(row.taskId)).length;

  const priorChallenge = buildChallenge(priorBlindTasks, substrateFingerprint);
  const direct = verifyDirectProposal(priorChallenge);
  const priorReactor = reactorChoices(reactor, priorBlindTasks, preparedById);
  const combinedChoices = new Map(priorBlindTasks.map((task) => {
    const prediction = priorReactor.predictions.get(task.taskId);
    return [task.taskId, prediction.calibrated ? prediction.choice : direct.choices.get(task.taskId)];
  }));
  const aiSummaries = [
    summarizeMethod('ai_plus_reactor', priorBlindTasks, combinedChoices),
    summarizeMethod('direct_ai_one_pass', priorBlindTasks, direct.choices),
    summarizeMethod('fission_reactor', priorBlindTasks, priorReactor.choices),
  ];
  const aiComparison = compare(aiSummaries[0], aiSummaries[1]);
  const reactorVsCurrent = generalComparisons.find((entry) => entry.right === 'current_cyclotron');
  const reactorImproved = reactorVsCurrent.accuracyDelta > 0
    && reactorVsCurrent.wins > reactorVsCurrent.losses
    && reactorVsCurrent.exactTwoSidedSignP < 0.05;
  const aiImproved = aiComparison.accuracyDelta > 0
    && aiComparison.wins > aiComparison.losses
    && aiComparison.exactTwoSidedSignP < 0.05;
  const verdict = reactorImproved && aiImproved
    ? 'DECISIVE_AI_AUGMENTATION'
    : reactorImproved
      ? 'REACTOR_IMPROVED_NOT_AI'
      : 'NO_DECISIVE_IMPROVEMENT';

  // ── PREREGISTERED PRIMARY ENDPOINT — the only decisive test in this report ──
  const primary = generalComparisons.find((entry) => entry.right === 'random_valence');
  if (!primary) throw new Error('Preregistered primary comparison (random_valence) missing');
  const primaryEndpoint = {
    declaredIn: PREREG_PATH,
    preregChecksum: checksum('prereg1', readFileSync(PREREG_PATH, 'utf8')),
    comparison: 'fission_reactor vs random_valence',
    statistic: 'exact two-sided sign test over discordant pairs',
    alpha: 0.05,
    population: 'all generalization-test tasks, pooled across all four relations',
    plannedTasks: Object.values(TEST_PER_RELATION_BY_REL).reduce((a, b) => a + b, 0),
    achievedTasks: testTasks.length,
    allocation: TEST_PER_RELATION_BY_REL,
    similarCapForcedBySubstrate: true,
    wins: primary.wins,
    losses: primary.losses,
    ties: primary.ties,
    accuracyDelta: primary.accuracyDelta,
    exactTwoSidedSignP: primary.exactTwoSidedSignP,
    supported: primary.exactTwoSidedSignP < 0.05 && primary.accuracyDelta > 0,
  };

  const body = {
    contract: CONTRACT,
    schemaVersion: '1.0.0',
    primaryEndpoint,
    substrate: {
      name: 'Open English WordNet',
      release: '2024',
      fingerprint: substrateFingerprint,
      excludedFromOriginalGroundingCorpus: true,
    },
    protocol: {
      trainingTasks: flatTraining.length,
      validationTasks: flatValidation.length,
      generalizationTestTasks: testTasks.length,
      sealedAiTestTasks: priorBlindTasks.length,
      candidatesPerTask: 5,
      // Provenance: the `chemistry` channel depends on concept-chemistry.js.
      // Without this stamp a scoring change is indistinguishable from a
      // substrate change when this benchmark is re-run later.
      chemistry: chemistryProvenance(),
      trainValidationTestSourceDisjoint: true,
      priorBlindTasksExcludedFromEvolution: true,
      testTruthAcceptedByReactor: false,
      contaminatedPilotDiscarded: true,
      pilotInvalidationReason: 'cross-split source synset reuse across relation types',
      pilotReservationChecksum: checksum(
        'reactor-pilot-reservation1',
        [...reservedSourceIds].sort(),
      ),
      directProposalChecksum: direct.checksum,
      priorChallengeChecksum: priorChallenge.checksum,
      splitChecksums: {
        training: checksum('reactor-split1', flatTraining.map((task) => task.taskId).sort()),
        validation: checksum('reactor-split1', flatValidation.map((task) => task.taskId).sort()),
        generalizationTest: checksum('reactor-split1', flatTest.map((task) => task.taskId).sort()),
        sealedAiTest: checksum('reactor-split1', priorBlindTasks.map((task) => task.taskId).sort()),
      },
    },
    reactor,
    generalization: {
      methods: generalSummaries.map(summarizeWithoutRows),
      comparisons: generalComparisons,
      reactorExclusiveCorrect: exclusiveCorrect,
    },
    aiAugmentation: {
      methods: aiSummaries.map(summarizeWithoutRows),
      comparison: aiComparison,
      calibratedOverrides: priorBlindTasks.filter((task) => priorReactor.predictions.get(task.taskId).calibrated).length,
    },
    verdict,
  };
  return { ...body, checksum: checksum('fission-benchmark1', body) };
}

const report = runBenchmark();
writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const pe = report.primaryEndpoint;
console.log('=== PREREGISTERED PRIMARY ENDPOINT ===');
console.log(`  ${pe.comparison}`);
console.log(`  n = ${pe.achievedTasks} (planned ${pe.plannedTasks})`);
console.log(`  wins ${pe.wins} / losses ${pe.losses} / ties ${pe.ties}`);
console.log(`  accuracyDelta ${pe.accuracyDelta}   p = ${pe.exactTwoSidedSignP}`);
console.log(`  H1 SUPPORTED: ${pe.supported}`);
console.log();
console.log(`Verdict: ${report.verdict}`);
console.log(`Checksum: ${report.checksum}`);
console.log('Generalization:');
for (const method of report.generalization.methods) console.log(`  ${method.name}: ${method.correct}/${method.total} (${method.accuracy})`);
console.log('AI augmentation:');
for (const method of report.aiAugmentation.methods) console.log(`  ${method.name}: ${method.correct}/${method.total} (${method.accuracy})`);
