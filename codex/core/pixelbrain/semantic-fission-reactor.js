/**
 * Semantic Fission Reactor
 *
 * A deterministic evolutionary search over sparse signed operator graphs.
 * Training truth supplies fitness; validation chooses the frozen genome. Test
 * examples are not accepted by this module and cannot influence evolution.
 */

import { sha256Hex, stableClone } from '../immunity/cleri-probe/canonical-report.js';

export const SEMANTIC_FISSION_GENOME_CONTRACT = 'PB-SEMANTIC-FISSION-GENOME-v1';
export const SEMANTIC_FISSION_REPORT_CONTRACT = 'PB-SEMANTIC-FISSION-REPORT-v1';

const DEFAULTS = Object.freeze({
  seed: 0x72656163,
  populationSize: 96,
  generations: 60,
  eliteCount: 16,
  candidatePoolSize: 32,
  mutationPermille: 180,
  minimumActiveGenes: 2,
  complexityPenalty: 0.003,
  marginReward: 0.02,
});

function fail(message) {
  throw new TypeError(`PB-SEMANTIC-FISSION-REPORT-v1: ${message}`);
}

function mix(value) {
  let x = Number(value) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function clampInteger(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || 0)));
}

function stableHash(prefix, body) {
  return `${prefix}:${sha256Hex(body).slice(0, 32)}`;
}

function normalizeConfig(options, featureCount) {
  const integer = (field, fallback, minimum, maximum) => {
    const value = options[field] ?? fallback;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      fail(`${field} must be an integer in ${minimum}..${maximum}`);
    }
    return value;
  };
  const finite = (field, fallback, minimum, maximum) => {
    const value = Number(options[field] ?? fallback);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      fail(`${field} must be finite in ${minimum}..${maximum}`);
    }
    return value;
  };
  return Object.freeze({
    seed: integer('seed', DEFAULTS.seed, 0, 0xffffffff),
    populationSize: integer('populationSize', DEFAULTS.populationSize, 16, 512),
    generations: integer('generations', DEFAULTS.generations, 1, 500),
    eliteCount: integer('eliteCount', DEFAULTS.eliteCount, 2, 128),
    candidatePoolSize: integer('candidatePoolSize', DEFAULTS.candidatePoolSize, 2, 256),
    mutationPermille: integer('mutationPermille', DEFAULTS.mutationPermille, 1, 999),
    minimumActiveGenes: integer('minimumActiveGenes', DEFAULTS.minimumActiveGenes, 1, featureCount),
    complexityPenalty: finite('complexityPenalty', DEFAULTS.complexityPenalty, 0, 0.1),
    marginReward: finite('marginReward', DEFAULTS.marginReward, 0, 0.2),
  });
}

function normalizeFeatureNames(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 64) {
    fail('featureNames must contain 2..64 entries');
  }
  const names = value.map((name) => String(name).trim());
  if (names.some((name) => !/^[a-z][a-z0-9_-]{0,63}$/.test(name))) {
    fail('featureNames must be normalized identifiers');
  }
  if (new Set(names).size !== names.length) fail('featureNames must be unique');
  return Object.freeze(names);
}

function normalizeTasks(tasks, relation, featureCount, splitName, minimumTasks = 4) {
  if (!Array.isArray(tasks) || tasks.length < minimumTasks) {
    fail(`${splitName}.${relation} requires at least ${minimumTasks} task${minimumTasks === 1 ? '' : 's'}`);
  }
  const ids = new Set();
  return Object.freeze(tasks.map((task) => {
    const taskId = String(task?.taskId ?? '');
    if (!taskId || ids.has(taskId)) fail(`${splitName}.${relation} contains an invalid or duplicate taskId`);
    ids.add(taskId);
    if (task.relation !== relation) fail(`${taskId} relation does not match island ${relation}`);
    const answer = String(task.answer ?? '');
    if (!Array.isArray(task.candidates) || task.candidates.length < 2 || task.candidates.length > 32) {
      fail(`${taskId} must contain 2..32 candidates`);
    }
    const labels = new Set();
    const candidates = task.candidates.map((candidate) => {
      const label = String(candidate?.label ?? '');
      if (!label || labels.has(label)) fail(`${taskId} contains an invalid or duplicate candidate label`);
      labels.add(label);
      if (!Array.isArray(candidate.features) || candidate.features.length !== featureCount) {
        fail(`${taskId}.${label} feature length mismatch`);
      }
      const features = candidate.features.map((feature) => {
        const number = Number(feature);
        if (!Number.isFinite(number) || number < 0 || number > 1) {
          fail(`${taskId}.${label} features must be finite in 0..1`);
        }
        return number;
      });
      return Object.freeze({ label, features: Object.freeze(features) });
    });
    if (!labels.has(answer)) fail(`${taskId} answer is not a candidate label`);
    return Object.freeze({ taskId, relation, answer, candidates: Object.freeze(candidates) });
  }));
}

function activeCount(weights) {
  return weights.reduce((count, weight) => count + Number(weight !== 0), 0);
}

function ensureMinimumActive(weights, minimum, seed) {
  const next = [...weights];
  let cursor = 0;
  while (activeCount(next) < minimum) {
    const index = mix(seed ^ Math.imul(cursor + 1, 0x9e3779b1)) % next.length;
    if (next[index] === 0) next[index] = (mix(seed ^ index ^ 0x51ed270b) % 2001) - 1000 || 1;
    cursor += 1;
  }
  return next;
}

function createGenome(relation, weights, generation, parents = []) {
  const body = {
    contract: SEMANTIC_FISSION_GENOME_CONTRACT,
    relation,
    weights: weights.map((weight) => clampInteger(weight, -1000, 1000)),
    activeGenes: activeCount(weights),
    generation,
    parents: [...parents].sort(),
  };
  return stableClone({ ...body, checksum: stableHash('fission-genome1', body) });
}

function initialGenome(relation, featureCount, config, index, seedWeights) {
  if (index === 0 && Array.isArray(seedWeights)) {
    return createGenome(
      relation,
      ensureMinimumActive(seedWeights, config.minimumActiveGenes, config.seed),
      0,
    );
  }
  const weights = Array.from({ length: featureCount }, (_, geneIndex) => {
    const value = mix(config.seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(geneIndex + 1, 0x85ebca6b));
    return value % 5 === 0 ? 0 : (value % 2001) - 1000;
  });
  return createGenome(
    relation,
    ensureMinimumActive(weights, config.minimumActiveGenes, config.seed ^ index),
    0,
  );
}

function scoreCandidates(genome, task) {
  const scored = task.candidates.map((candidate) => {
    let score = 0;
    let weightMass = 0;
    for (let index = 0; index < genome.weights.length; index += 1) {
      const weight = genome.weights[index] / 1000;
      score += weight * candidate.features[index];
      weightMass += Math.abs(weight);
    }
    return { label: candidate.label, score: weightMass ? score / weightMass : 0 };
  }).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return {
    choice: scored[0].label,
    margin: round6(scored[0].score - scored[1].score),
  };
}

function evaluateGenome(genome, tasks, config) {
  let correct = 0;
  let marginSum = 0;
  const failures = [];
  for (const task of tasks) {
    const prediction = scoreCandidates(genome, task);
    marginSum += Math.max(0, prediction.margin);
    if (prediction.choice === task.answer) correct += 1;
    else failures.push(task.taskId);
  }
  const accuracy = correct / tasks.length;
  const meanMargin = marginSum / tasks.length;
  const complexity = genome.activeGenes / genome.weights.length;
  const fitness = accuracy + config.marginReward * meanMargin - config.complexityPenalty * complexity;
  return Object.freeze({
    correct,
    total: tasks.length,
    accuracy: round6(accuracy),
    meanMargin: round6(meanMargin),
    complexity: round6(complexity),
    fitness: round6(fitness),
    failures: Object.freeze(failures),
  });
}

function rankPopulation(population, tasks, config) {
  return population.map((genome) => ({ genome, metrics: evaluateGenome(genome, tasks, config) }))
    .sort((a, b) => (
      b.metrics.fitness - a.metrics.fitness
      || b.metrics.accuracy - a.metrics.accuracy
      || a.genome.activeGenes - b.genome.activeGenes
      || a.genome.checksum.localeCompare(b.genome.checksum)
    ));
}

function archiveKey(genome) {
  const activeBucket = Math.min(7, Math.floor((genome.activeGenes - 1) / 2));
  const positive = genome.weights.reduce((count, weight) => count + Number(weight > 0), 0);
  const signBucket = positive >= genome.activeGenes / 2 ? 'positive' : 'negative';
  return `${activeBucket}|${signBucket}`;
}

function updateArchive(archive, ranked) {
  for (const entry of ranked) {
    const key = archiveKey(entry.genome);
    const current = archive.get(key);
    if (!current || entry.metrics.fitness > current.metrics.fitness
      || (entry.metrics.fitness === current.metrics.fitness
        && entry.genome.checksum.localeCompare(current.genome.checksum) < 0)) {
      archive.set(key, entry);
    }
  }
}

function mutateChild(relation, left, right, generation, childIndex, config) {
  const seed = mix(config.seed ^ Math.imul(generation + 1, 0x9e3779b1) ^ Math.imul(childIndex + 1, 0x85ebca6b));
  const weights = left.weights.map((leftWeight, geneIndex) => {
    const geneSeed = mix(seed ^ Math.imul(geneIndex + 1, 0xc2b2ae35));
    let weight = (geneSeed & 1) === 0 ? leftWeight : right.weights[geneIndex];
    if (geneSeed % 1000 < config.mutationPermille) {
      if ((geneSeed >>> 10) % 5 === 0) weight = 0;
      else weight += ((geneSeed >>> 8) % 801) - 400;
    }
    return clampInteger(weight, -1000, 1000);
  });
  return createGenome(
    relation,
    ensureMinimumActive(weights, config.minimumActiveGenes, seed),
    generation,
    [left.checksum, right.checksum],
  );
}

function calibrateMargin(genome, tasks) {
  const rows = tasks.map((task) => {
    const prediction = scoreCandidates(genome, task);
    return { ...prediction, correct: prediction.choice === task.answer };
  });
  const thresholds = [...new Set(rows.map((row) => row.margin))].sort((a, b) => a - b);
  let selected = { threshold: 1, precision: 1, coverage: 0, accepted: 0 };
  for (const threshold of thresholds) {
    const accepted = rows.filter((row) => row.margin >= threshold);
    if (accepted.length < Math.max(4, Math.ceil(rows.length * 0.1))) continue;
    const precision = accepted.filter((row) => row.correct).length / accepted.length;
    const coverage = accepted.length / rows.length;
    if (precision >= 0.95 && coverage > selected.coverage) {
      selected = { threshold, precision, coverage, accepted: accepted.length };
    }
  }
  return stableClone({
    threshold: round6(selected.threshold),
    precision: round6(selected.precision),
    coverage: round6(selected.coverage),
    accepted: selected.accepted,
    total: rows.length,
  });
}

function evolveIsland(relation, trainTasks, validationTasks, featureCount, config, seedWeights) {
  let population = Array.from(
    { length: config.populationSize },
    (_, index) => initialGenome(relation, featureCount, config, index, seedWeights),
  );
  const archive = new Map();
  const generationTrace = [];
  let ranked = [];

  for (let generation = 0; generation <= config.generations; generation += 1) {
    ranked = rankPopulation(population, trainTasks, config);
    updateArchive(archive, ranked);
    if (generation === 0 || generation === config.generations || generation % 10 === 0) {
      generationTrace.push(stableClone({
        generation,
        bestFitness: ranked[0].metrics.fitness,
        bestAccuracy: ranked[0].metrics.accuracy,
        bestActiveGenes: ranked[0].genome.activeGenes,
        archiveCells: archive.size,
      }));
    }
    if (generation === config.generations) break;
    const elites = ranked.slice(0, Math.min(config.eliteCount, ranked.length)).map((entry) => entry.genome);
    const archived = [...archive.values()].map((entry) => entry.genome);
    const parents = [...new Map([...elites, ...archived].map((genome) => [genome.checksum, genome])).values()];
    const next = [...elites];
    while (next.length < config.populationSize) {
      const childIndex = next.length;
      const leftIndex = mix(config.seed ^ generation ^ Math.imul(childIndex + 1, 0x9e3779b1)) % parents.length;
      const rightIndex = mix(config.seed ^ generation ^ Math.imul(childIndex + 1, 0x85ebca6b)) % parents.length;
      next.push(mutateChild(relation, parents[leftIndex], parents[rightIndex], generation + 1, childIndex, config));
    }
    population = next;
  }

  const candidates = rankPopulation(
    [...new Map([...ranked.map((entry) => entry.genome), ...[...archive.values()].map((entry) => entry.genome)]
      .map((genome) => [genome.checksum, genome])).values()],
    trainTasks,
    config,
  ).slice(0, config.candidatePoolSize);
  const validationRanked = candidates.map((entry) => ({
    ...entry,
    validation: evaluateGenome(entry.genome, validationTasks, config),
  })).sort((a, b) => (
    b.validation.accuracy - a.validation.accuracy
    || b.validation.meanMargin - a.validation.meanMargin
    || b.metrics.accuracy - a.metrics.accuracy
    || a.genome.activeGenes - b.genome.activeGenes
    || a.genome.checksum.localeCompare(b.genome.checksum)
  ));
  const selected = validationRanked[0];
  return stableClone({
    relation,
    selectedGenome: selected.genome,
    training: selected.metrics,
    validation: selected.validation,
    confidenceCalibration: calibrateMargin(selected.genome, validationTasks),
    archiveCells: archive.size,
    generationTrace,
    negativeEvidence: selected.metrics.failures.slice(0, 64),
  });
}

/** Evolve one independently validated semantic graph per relation island. */
export function runSemanticFissionReactor(options = {}) {
  const featureNames = normalizeFeatureNames(options.featureNames);
  const relations = [...new Set((options.relations ?? []).map((relation) => String(relation)))].sort();
  if (relations.length === 0 || relations.length > 32) fail('relations must contain 1..32 unique entries');
  const config = normalizeConfig(options, featureNames.length);
  if (config.eliteCount >= config.populationSize) fail('eliteCount must be smaller than populationSize');
  const trainIds = new Set();
  const validationIds = new Set();
  const normalized = relations.map((relation) => {
    const training = normalizeTasks(options.training?.[relation], relation, featureNames.length, 'training');
    const validation = normalizeTasks(options.validation?.[relation], relation, featureNames.length, 'validation');
    for (const task of training) {
      if (trainIds.has(task.taskId)) fail(`duplicate training task ${task.taskId}`);
      trainIds.add(task.taskId);
    }
    for (const task of validation) {
      if (validationIds.has(task.taskId) || trainIds.has(task.taskId)) fail(`split leakage at ${task.taskId}`);
      validationIds.add(task.taskId);
    }
    return { relation, training, validation };
  });
  const islands = normalized.map(({ relation, training, validation }) => evolveIsland(
    relation,
    training,
    validation,
    featureNames.length,
    config,
    options.seedWeights?.[relation],
  ));
  const body = {
    contract: SEMANTIC_FISSION_REPORT_CONTRACT,
    schemaVersion: '1.0.0',
    featureNames,
    relations,
    configuration: config,
    splitChecksums: {
      training: stableHash('fission-train1', normalized.map((entry) => entry.training.map((task) => task.taskId))),
      validation: stableHash('fission-validation1', normalized.map((entry) => entry.validation.map((task) => task.taskId))),
    },
    counts: {
      training: trainIds.size,
      validation: validationIds.size,
      islands: islands.length,
    },
    islands,
  };
  return stableClone({ ...body, checksum: stableHash('fission-reactor1', body) });
}

export function verifySemanticFissionReport(report) {
  if (!report || report.contract !== SEMANTIC_FISSION_REPORT_CONTRACT || typeof report.checksum !== 'string') return false;
  const { checksum, ...body } = report;
  return checksum === stableHash('fission-reactor1', body);
}

/** Predict with a frozen reactor report. The task contains features, never truth. */
export function predictSemanticFission(report, task) {
  if (!verifySemanticFissionReport(report)) fail('report checksum verification failed');
  const island = report.islands.find((entry) => entry.relation === task?.relation);
  if (!island) fail(`no frozen island for relation ${String(task?.relation)}`);
  const normalized = normalizeTasks(
    [{ ...task, answer: task.candidates?.[0]?.label }],
    task.relation,
    report.featureNames.length,
    'prediction',
    1,
  )[0];
  const prediction = scoreCandidates(island.selectedGenome, normalized);
  return stableClone({
    relation: task.relation,
    choice: prediction.choice,
    margin: prediction.margin,
    calibrated: prediction.margin >= island.confidenceCalibration.threshold,
    genomeChecksum: island.selectedGenome.checksum,
  });
}
