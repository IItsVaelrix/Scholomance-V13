#!/usr/bin/env node

/**
 * Blind semantic-molecule discovery benchmark.
 *
 * Phase 1 (`--emit-challenge`) exposes Open English WordNet questions without
 * answer keys. Phase 2 (`--evaluate`) accepts a sealed one-pass AI proposal and
 * compares four arms against WordNet truth that was not present in the original
 * encyclopedia grounding corpus.
 */

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mixTrialCounter } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  compareBallisticSignatures,
  createBallisticSignature,
} from '../codex/core/lexical-analysis/semanticBallistics.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const REPORT_CONTRACT = 'PB-SEMANTIC-BLIND-BENCHMARK-v1';
const CHALLENGE_CONTRACT = 'PB-SEMANTIC-BLIND-CHALLENGE-v1';
const PROPOSAL_CONTRACT = 'PB-SEMANTIC-DIRECT-PROPOSALS-v1';
const DATABASE_PATH = 'scholomance_dict.sqlite';
const PROPOSAL_PATH = 'docs/superpowers/evidence/2026-08-11-direct-ai-blind-proposals.json';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-11-semantic-molecule-blind-benchmark.json';
const CHALLENGE_PATH = '/tmp/semantic-molecule-blind-challenge.json';
const SEED = 0x6d6f6c31;
const TASKS_PER_RELATION = 6;
const CANDIDATES_PER_TASK = 5;
const GRAPH_TRIALS = 256;
const VOTE_GRAPHS = 64;

const RELATIONS = Object.freeze({
  hypernym: Object.freeze({ prompt: 'is a broader class of', channels: ['lexical', 'vector', 'chemistry', 'containment'] }),
  antonym: Object.freeze({ prompt: 'is the opposite of', channels: ['lexical', 'vector', 'chemistry', 'polarity'] }),
  mero_part: Object.freeze({ prompt: 'is a component or part of', channels: ['lexical', 'vector', 'chemistry', 'containment'] }),
  similar: Object.freeze({ prompt: 'is semantically similar to', channels: ['lexical', 'vector', 'chemistry'] }),
});

const HUMAN_REFERENCE_WEIGHTS = Object.freeze({
  hypernym: Object.freeze({ lexical: 0.30, vector: 0.25, chemistry: 0.25, containment: 0.20 }),
  antonym: Object.freeze({ lexical: 0.20, vector: 0.35, chemistry: 0.25, polarity: 0.20 }),
  mero_part: Object.freeze({ lexical: 0.20, vector: 0.20, chemistry: 0.15, containment: 0.45 }),
  similar: Object.freeze({ lexical: 0.35, vector: 0.35, chemistry: 0.30 }),
});

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'which', 'with',
]);

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function hashUint(value) {
  return Number.parseInt(sha256Hex(String(value)).slice(0, 8), 16) >>> 0;
}

function checksum(prefix, body) {
  return `${prefix}:${sha256Hex(body).slice(0, 32)}`;
}

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function jaccard(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function containsTerm(text, term) {
  const normalized = ` ${tokenize(text).join(' ')} `;
  const target = ` ${tokenize(term).join(' ')} `;
  return target.trim() ? Number(normalized.includes(target)) : 0;
}

function openDatabase() {
  return new Database(DATABASE_PATH, { readonly: true, fileMustExist: true });
}

function readExternalEdges(database) {
  const relationNames = Object.keys(RELATIONS).map((name) => `'${name}'`).join(',');
  const sql = `
    WITH canonical AS (
      SELECT synset_id, MIN(lemma_lower) AS lemma
      FROM wordnet_lemma
      GROUP BY synset_id
    )
    SELECT
      r.synset_id AS sourceId,
      source_lemma.lemma AS sourceLemma,
      source.pos AS pos,
      source.lexname AS lexname,
      source.definition AS sourceDefinition,
      r.rel AS relation,
      r.target_synset_id AS targetId,
      target_lemma.lemma AS targetLemma,
      target.definition AS targetDefinition
    FROM wordnet_rel r
    JOIN wordnet_synset source ON source.id = r.synset_id
    JOIN wordnet_synset target ON target.id = r.target_synset_id
    JOIN canonical source_lemma ON source_lemma.synset_id = source.id
    JOIN canonical target_lemma ON target_lemma.synset_id = target.id
    WHERE r.rel IN (${relationNames})
      AND source.pos = target.pos
      AND LENGTH(source.definition) BETWEEN 20 AND 480
      AND LENGTH(target.definition) BETWEEN 20 AND 480
  `;
  return database.prepare(sql).all().filter((row) => (
    /^[a-z][a-z _-]{1,40}$/.test(row.sourceLemma)
    && /^[a-z][a-z _-]{1,40}$/.test(row.targetLemma)
    && row.sourceLemma !== row.targetLemma
  ));
}

function deterministicOrder(values, salt, identity) {
  return [...values].sort((a, b) => {
    const left = hashUint(`${SEED}|${salt}|${identity(a)}`);
    const right = hashUint(`${SEED}|${salt}|${identity(b)}`);
    return left - right || identity(a).localeCompare(identity(b));
  });
}

function sampleTasks(rows, tasksPerRelation = TASKS_PER_RELATION) {
  const allTrueTargets = new Map();
  const decoyPools = new Map();
  for (const row of rows) {
    const key = `${row.relation}|${row.sourceId}`;
    if (!allTrueTargets.has(key)) allTrueTargets.set(key, new Set());
    allTrueTargets.get(key).add(row.targetId);
    const poolKey = `${row.relation}|${row.pos}|${row.lexname}`;
    if (!decoyPools.has(poolKey)) decoyPools.set(poolKey, []);
    decoyPools.get(poolKey).push(row);
  }

  const tasks = [];
  for (const relation of Object.keys(RELATIONS)) {
    const relationRows = rows.filter((row) => row.relation === relation);
    const ordered = deterministicOrder(relationRows, `edge|${relation}`, (row) => `${row.sourceId}|${row.targetId}`);
    const usedSources = new Set();
    for (const truth of ordered) {
      if (usedSources.size >= tasksPerRelation) break;
      if (usedSources.has(truth.sourceId)) continue;
      const forbidden = allTrueTargets.get(`${relation}|${truth.sourceId}`) ?? new Set();
      const decoyPool = (decoyPools.get(`${relation}|${truth.pos}|${truth.lexname}`) ?? []).filter((row) => (
        row.targetId !== truth.targetId
        && row.targetId !== truth.sourceId
        && !forbidden.has(row.targetId)
      ));
      const uniqueTargets = new Map();
      for (const row of deterministicOrder(decoyPool, `decoy|${truth.sourceId}`, (item) => item.targetId)) {
        if (!uniqueTargets.has(row.targetId)) uniqueTargets.set(row.targetId, row);
      }
      const decoys = [...uniqueTargets.values()].slice(0, CANDIDATES_PER_TASK - 1);
      if (decoys.length !== CANDIDATES_PER_TASK - 1) continue;
      const candidates = deterministicOrder([truth, ...decoys], `labels|${truth.sourceId}`, (row) => row.targetId)
        .map((row, index) => ({
          label: String.fromCharCode(65 + index),
          synsetId: row.targetId,
          lemma: row.targetLemma,
          definition: row.targetDefinition,
        }));
      const answer = candidates.find((candidate) => candidate.synsetId === truth.targetId)?.label;
      if (!answer) throw new Error('Failed to assign blinded answer label');
      usedSources.add(truth.sourceId);
      tasks.push({
        taskId: `oewn-${relation}-${sha256Hex(truth.sourceId).slice(0, 10)}`,
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
    }
  }
  if (tasks.length !== tasksPerRelation * Object.keys(RELATIONS).length) {
    throw new Error(`Expected ${tasksPerRelation * Object.keys(RELATIONS).length} tasks, sampled ${tasks.length}`);
  }
  return tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

function buildChallenge(tasks, substrateFingerprint) {
  const body = {
    contract: CHALLENGE_CONTRACT,
    schemaVersion: '1.0.0',
    seed: SEED,
    source: {
      name: 'Open English WordNet',
      release: '2024',
      substrateFingerprint,
      excludedFromCyclotronGroundingCorpus: true,
    },
    taskPolicy: {
      relationTypes: Object.keys(RELATIONS),
      tasksPerRelation: TASKS_PER_RELATION,
      candidatesPerTask: CANDIDATES_PER_TASK,
      truthVisible: false,
    },
    tasks: tasks.map((task) => ({
      taskId: task.taskId,
      relation: task.relation,
      instruction: `Choose the candidate that ${task.relationPrompt} the source concept.`,
      source: { lemma: task.source.lemma, definition: task.source.definition },
      candidates: task.candidates.map(({ label, lemma, definition }) => ({ label, lemma, definition })),
    })),
  };
  return { ...body, checksum: checksum('blind-challenge1', body) };
}

function normalizeChannels(rawByCandidate, channelNames) {
  const normalized = new Map();
  for (const channel of channelNames) {
    const values = rawByCandidate.map((entry) => entry[channel]);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    for (let index = 0; index < rawByCandidate.length; index += 1) {
      if (!normalized.has(index)) normalized.set(index, {});
      normalized.get(index)[channel] = maximum === minimum ? 0.5 : (values[index] - minimum) / (maximum - minimum);
    }
  }
  return normalized;
}

function polarityScore(source, candidate) {
  const prefixes = ['anti', 'counter', 'de', 'dis', 'il', 'im', 'in', 'ir', 'non', 'un'];
  const left = source.lemma.replaceAll('_', ' ');
  const right = candidate.lemma.replaceAll('_', ' ');
  const prefixMatch = prefixes.some((prefix) => left === `${prefix}${right}` || right === `${prefix}${left}`);
  const opposingDefinition = /\b(opposite|absence|without|not|lack|contrary)\b/i.test(`${source.definition} ${candidate.definition}`);
  return Math.min(1, jaccard(source.definition, candidate.definition) + Number(prefixMatch) * 0.7 + Number(opposingDefinition) * 0.15);
}

function taskChannels(task) {
  const sourceText = `${task.source.lemma}. ${task.source.definition}`;
  const sourceSignature = createBallisticSignature(`${sourceText} ${task.relationPrompt}`);
  const raw = task.candidates.map((candidate) => {
    const candidateText = `${candidate.lemma}. ${candidate.definition}`;
    const vector = compareBallisticSignatures(sourceSignature, createBallisticSignature(candidateText));
    const chemistry = synthesize({
      a: sourceText,
      b: task.relationPrompt,
      product: candidateText,
      groundingA: 0.5,
      groundingB: 0.5,
    });
    return {
      lexical: jaccard(sourceText, candidateText),
      vector: vector.semanticScore ?? 0,
      chemistry: chemistry.feasibility,
      containment: Math.max(
        containsTerm(task.source.definition, candidate.lemma),
        containsTerm(candidate.definition, task.source.lemma) * 0.7,
      ),
      polarity: polarityScore(task.source, candidate),
    };
  });
  return normalizeChannels(raw, RELATIONS[task.relation].channels);
}

function weightedChoice(task, normalized, weights) {
  return task.candidates.map((candidate, index) => ({
    label: candidate.label,
    score: Object.entries(weights).reduce(
      (sum, [channel, weight]) => sum + normalized.get(index)[channel] * weight,
      0,
    ),
  })).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))[0];
}

function graphFor(task, normalized, trialIndex) {
  const compatible = RELATIONS[task.relation].channels;
  const counter = mixTrialCounter(SEED ^ hashUint(task.taskId) ^ Math.imul(trialIndex + 1, 0x9e3779b1));
  let selected = compatible.filter((_, index) => ((counter >>> index) & 1) === 1);
  if (selected.length < 2) selected = compatible.slice(0, Math.min(2, compatible.length));
  const weights = {};
  for (let index = 0; index < selected.length; index += 1) {
    const mixed = mixTrialCounter(counter ^ Math.imul(index + 1, 0x85ebca6b));
    weights[selected[index]] = 0.5 + (mixed % 1001) / 1000;
  }
  const scored = task.candidates.map((candidate, candidateIndex) => ({
    label: candidate.label,
    score: selected.reduce(
      (sum, channel) => sum + normalized.get(candidateIndex)[channel] * weights[channel],
      0,
    ) / selected.reduce((sum, channel) => sum + weights[channel], 0),
  })).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const margin = scored[0].score - scored[1].score;
  const winnerChannels = selected.map((channel) => normalized.get(
    task.candidates.findIndex((candidate) => candidate.label === scored[0].label),
  )[channel]);
  const agreement = 1 - (Math.max(...winnerChannels) - Math.min(...winnerChannels));
  return {
    trialIndex,
    winner: scored[0].label,
    energy: round6(0.65 * margin + 0.35 * agreement),
    topology: selected.sort(),
  };
}

function voteChoice(graphs) {
  const votes = new Map();
  for (const graph of graphs) votes.set(graph.winner, (votes.get(graph.winner) ?? 0) + 1);
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function methodChoices(tasks, channelCache = null) {
  const cyclotron = new Map();
  const randomValence = new Map();
  const humanReference = new Map();
  const diagnostics = new Map();
  for (const task of tasks) {
    const normalized = channelCache?.get(task.taskId) ?? taskChannels(task);
    const graphs = Array.from({ length: GRAPH_TRIALS }, (_, index) => graphFor(task, normalized, index));
    const energetic = [...graphs]
      .sort((a, b) => b.energy - a.energy || a.trialIndex - b.trialIndex)
      .slice(0, VOTE_GRAPHS);
    const randomGraphOrder = deterministicOrder(graphs, `random-graphs|${task.taskId}`, (graph) => String(graph.trialIndex))
      .slice(0, VOTE_GRAPHS);
    cyclotron.set(task.taskId, voteChoice(energetic));
    randomValence.set(task.taskId, voteChoice(randomGraphOrder));
    humanReference.set(
      task.taskId,
      weightedChoice(task, normalized, HUMAN_REFERENCE_WEIGHTS[task.relation]).label,
    );
    diagnostics.set(task.taskId, {
      energeticMean: round6(energetic.reduce((sum, graph) => sum + graph.energy, 0) / energetic.length),
      randomMean: round6(randomGraphOrder.reduce((sum, graph) => sum + graph.energy, 0) / randomGraphOrder.length),
      distinctEnergeticTopologies: new Set(energetic.map((graph) => graph.topology.join('+'))).size,
    });
  }
  return { cyclotron, randomValence, humanReference, diagnostics };
}

function readAndVerifyDirectProposals(challenge) {
  const proposal = JSON.parse(readFileSync(PROPOSAL_PATH, 'utf8'));
  if (proposal.contract !== PROPOSAL_CONTRACT || proposal.challengeChecksum !== challenge.checksum) {
    throw new Error('Direct-AI proposal does not bind to this blind challenge');
  }
  const { checksum: suppliedChecksum, ...body } = proposal;
  if (suppliedChecksum !== checksum('direct-proposals1', body)) throw new Error('Direct-AI proposal checksum mismatch');
  const allowed = new Map(challenge.tasks.map((task) => [
    task.taskId,
    new Set(task.candidates.map((candidate) => candidate.label)),
  ]));
  const choices = new Map();
  for (const choice of proposal.choices) {
    if (!allowed.get(choice.taskId)?.has(choice.candidateLabel) || choices.has(choice.taskId)) {
      throw new Error(`Invalid or duplicate direct-AI choice for ${choice.taskId}`);
    }
    choices.set(choice.taskId, choice.candidateLabel);
  }
  if (choices.size !== challenge.tasks.length) throw new Error('Direct-AI proposal must answer every blind task');
  return { proposal, choices };
}

function wilsonInterval(successes, total) {
  const z = 1.959964;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const radius = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total) / denominator;
  return [round6(Math.max(0, center - radius)), round6(Math.min(1, center + radius))];
}

function summarizeMethod(name, tasks, choices) {
  const rows = tasks.map((task) => ({
    taskId: task.taskId,
    relation: task.relation,
    choice: choices.get(task.taskId),
    correct: choices.get(task.taskId) === task.answer,
  }));
  const correct = rows.filter((row) => row.correct).length;
  const byRelation = Object.fromEntries(Object.keys(RELATIONS).map((relation) => {
    const subset = rows.filter((row) => row.relation === relation);
    const successes = subset.filter((row) => row.correct).length;
    return [relation, { correct: successes, total: subset.length, accuracy: round6(successes / subset.length) }];
  }));
  return {
    name,
    correct,
    total: rows.length,
    accuracy: round6(correct / rows.length),
    wilson95: wilsonInterval(correct, rows.length),
    byRelation,
    rows,
  };
}

function combination(n, k) {
  const bounded = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= bounded; index += 1) {
    value = (value * (n - bounded + index)) / index;
  }
  return value;
}

function exactTwoSidedSignP(wins, losses) {
  const discordant = wins + losses;
  if (discordant === 0) return 1;
  const tail = Math.min(wins, losses);
  let probability = 0;
  for (let index = 0; index <= tail; index += 1) {
    probability += combination(discordant, index) * (0.5 ** discordant);
  }
  return round6(Math.min(1, probability * 2));
}

function pairedComparison(cyclotronSummary, baselineSummary) {
  const baselineByTask = new Map(baselineSummary.rows.map((row) => [row.taskId, row.correct]));
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const row of cyclotronSummary.rows) {
    const baselineCorrect = baselineByTask.get(row.taskId);
    if (row.correct && !baselineCorrect) wins += 1;
    else if (!row.correct && baselineCorrect) losses += 1;
    else ties += 1;
  }
  return {
    baseline: baselineSummary.name,
    wins,
    losses,
    ties,
    accuracyDelta: round6(cyclotronSummary.accuracy - baselineSummary.accuracy),
    exactTwoSidedSignP: exactTwoSidedSignP(wins, losses),
  };
}

function evaluate(tasks, challenge, substrateFingerprint) {
  const generated = methodChoices(tasks);
  const direct = readAndVerifyDirectProposals(challenge);
  const methods = [
    summarizeMethod('cyclotron', tasks, generated.cyclotron),
    summarizeMethod('random_valence', tasks, generated.randomValence),
    summarizeMethod('direct_ai_one_pass', tasks, direct.choices),
    summarizeMethod('human_reference', tasks, generated.humanReference),
  ];
  const cyclotron = methods[0];
  const comparisons = methods.slice(1).map((method) => pairedComparison(cyclotron, method));
  const otherCorrect = new Map(tasks.map((task) => [task.taskId, methods.slice(1).some(
    (method) => method.rows.find((row) => row.taskId === task.taskId)?.correct,
  )]));
  const exclusiveCorrect = cyclotron.rows.filter((row) => row.correct && !otherCorrect.get(row.taskId)).length;
  const random = methods[1];
  const directAi = methods[2];
  const human = methods[3];
  const uniformChanceAccuracy = round6(1 / CANDIDATES_PER_TASK);
  const mechanismVerdict = cyclotron.wilson95[0] > uniformChanceAccuracy
    ? 'SUPPORTED_ABOVE_UNIFORM_CHANCE'
    : 'NOT_SUPPORTED';
  let theoryVerdict = 'INCONCLUSIVE';
  if (cyclotron.accuracy <= random.accuracy || exclusiveCorrect === 0) theoryVerdict = 'NOT_VALIDATED';
  else if (
    cyclotron.wilson95[0] > random.wilson95[1]
    && cyclotron.accuracy > directAi.accuracy
    && cyclotron.accuracy > human.accuracy
    && exclusiveCorrect >= 3
  ) theoryVerdict = 'STRONGLY_VALIDATED';
  else theoryVerdict = 'PARTIALLY_SUPPORTED';

  const disclosedTasks = tasks.map((task) => ({
    taskId: task.taskId,
    relation: task.relation,
    sourceSynsetId: task.source.synsetId,
    answer: task.answer,
    choices: Object.fromEntries(methods.map((method) => [
      method.name,
      method.rows.find((row) => row.taskId === task.taskId).choice,
    ])),
    cyclotronDiagnostic: generated.diagnostics.get(task.taskId),
  }));
  const body = {
    contract: REPORT_CONTRACT,
    schemaVersion: '1.0.0',
    seed: SEED,
    substrate: {
      name: 'Open English WordNet',
      release: '2024',
      sourceUrl: 'https://en-word.net/static/english-wordnet-2024.xml.gz',
      fingerprint: substrateFingerprint,
      excludedFromCyclotronGroundingCorpus: true,
    },
    protocol: {
      blindedChallengeChecksum: challenge.checksum,
      directProposalChecksum: direct.proposal.checksum,
      tasks: tasks.length,
      candidatesPerTask: CANDIDATES_PER_TASK,
      graphTrialsPerTask: GRAPH_TRIALS,
      energeticVotesPerTask: VOTE_GRAPHS,
      uniformChanceAccuracy,
      sourceSelectionScoreUsed: false,
      truthReadAfterDirectProposalSeal: true,
    },
    methods: methods.map(({ rows: _rows, ...summary }) => summary),
    comparisons,
    novelty: {
      cyclotronExclusiveCorrect: exclusiveCorrect,
      definition: 'correct Cyclotron choices missed by random-valence, direct-AI, and human-reference arms',
    },
    mechanismVerdict,
    theoryVerdict,
    disclosedTasks,
  };
  return { ...body, checksum: checksum('blind-benchmark1', body) };
}

function main() {
  const database = openDatabase();
  const rows = readExternalEdges(database);
  const metadata = database.prepare("SELECT key, value FROM meta WHERE key IN ('oewn_antonym_release', 'oewn_antonym_source_sha256') ORDER BY key").all();
  const substrateFingerprint = checksum('oewn-substrate1', {
    metadata,
    edgeIdentity: rows.map((row) => `${row.sourceId}|${row.relation}|${row.targetId}`).sort(),
  });
  const tasks = sampleTasks(rows);
  const challenge = buildChallenge(tasks, substrateFingerprint);
  database.close();

  if (process.argv.includes('--emit-challenge')) {
    writeFileSync(CHALLENGE_PATH, `${JSON.stringify(challenge, null, 2)}\n`, 'utf8');
    console.log(CHALLENGE_PATH);
    console.log(challenge.checksum);
    return;
  }
  if (!process.argv.includes('--evaluate')) {
    throw new Error('Use --emit-challenge or --evaluate');
  }
  const report = evaluate(tasks, challenge, substrateFingerprint);
  const replay = evaluate(tasks, challenge, substrateFingerprint);
  if (report.checksum !== replay.checksum) throw new Error('Blind benchmark replay diverged');
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Verdict: ${report.theoryVerdict}`);
  console.log(`Checksum: ${report.checksum}`);
  for (const method of report.methods) {
    console.log(`${method.name}: ${method.correct}/${method.total} (${method.accuracy})`);
  }
  console.log(`Cyclotron-exclusive correct: ${report.novelty.cyclotronExclusiveCorrect}`);
}

export {
  CANDIDATES_PER_TASK,
  RELATIONS,
  SEED,
  buildChallenge,
  methodChoices,
  openDatabase,
  readExternalEdges,
  sampleTasks,
  summarizeMethod,
  taskChannels,
  wilsonInterval,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
