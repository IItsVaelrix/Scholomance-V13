/**
 * Semantic Valence Cyclotron — PB-SEMANTIC-CYCLOTRON-REPORT-v1
 *
 * Generates semantic molecules without asking a language model to propose
 * bonds. Callers provide a sealed atom bank. Typed offer/seek ports and
 * declared bridge laws determine which atoms may bind. Integer counters
 * provide deterministic variation; shuffled controls calibrate the gate.
 *
 * Fast pass: valence assembly -> TurboQuant novelty -> control bar.
 * Slow pass: Concept Chemistry -> Memory Cell Osmosis -> bounded candidates.
 *
 * Pure core: no filesystem, network, clock, process state, or persistence.
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import { synthesize, chemistryProvenance } from './concept-chemistry.js';
import { computeOccupancyEntropyInfluence } from './entropic-decay-dampener.js';
import { generateSemantotopographicVector } from '../semantic/semantotopography.js';
import { estimateInnerProduct, quantizeVectorJS } from '../quantization/turboquant.js';
import {
  createMemoryCellPacket,
  evaluateMemoryCellOsmosis,
} from '../immunity/memory-cell-osmosis.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from './bytecode-error.js';

export const SEMANTIC_ATOM_CONTRACT = 'PB-SEMANTIC-ATOM-v1';
export const SEMANTIC_MOLECULE_CONTRACT = 'PB-SEMANTIC-MOLECULE-v1';
export const SEMANTIC_CYCLOTRON_CONTRACT = 'PB-SEMANTIC-CYCLOTRON-REPORT-v1';
export const SEMANTIC_CYCLOTRON_SCHEMA_VERSION = '1.0.0';
export const VECTOR_DIMENSIONS = 128;

// Osmosis was removed from finalScore on 2026-08-12 (PB-OSMOTIC-EQUILIBRIUM-v1).
// The original 50:35 energy:feasibility ratio is preserved, rescaled to [0,1].
const ENERGY_WEIGHT = 0.50 / 0.85;
const FEASIBILITY_WEIGHT = 0.35 / 0.85;

const DEFAULT_ENVIRONMENTS = Object.freeze([
  'retrieval',
  'synthesis',
  'immunity',
  'governance',
  'memory',
]);

const DEFAULTS = Object.freeze({
  trialCount: 100_000,
  seed: 0x5c4010,
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
  osmosisSimilarityFloor: 0.83,
  osmosisDriftCeiling: 0.17,
  entropyEnabled: false,
  entropyDecayLambda: 0.35,
  entropyExactWeight: 4,
  entropyFamilyWeight: 2,
  entropyNeighborhoodWeight: 0.5,
  entropyEscapeAttempts: 3,
  entropyActivationHeat: 5,
});

function fail(message, context = {}, category = ERROR_CATEGORIES.VALUE) {
  const error = new BytecodeError(
    category,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.ARTIFACT,
    category === ERROR_CATEGORIES.RANGE ? ERROR_CODES.OUT_OF_BOUNDS : ERROR_CODES.INVALID_VALUE,
    { subsystem: 'semantic-valence-cyclotron', message, ...context },
  );
  error.message = message;
  throw error;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round6(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function deepSortedClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(deepSortedClone));
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = deepSortedClone(value[key]);
  return Object.freeze(out);
}

function stableHash(prefix, value, length = 16) {
  const canonical = canonicalStringify(deepSortedClone(value));
  return `${prefix}:${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, length)}`;
}

function normalizeId(value, field) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized)) {
    fail(`${field} must match /^[a-z0-9][a-z0-9._-]{0,63}$/`, { field, value });
  }
  return normalized;
}

function normalizeText(value, field, max = 160) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > max) {
    fail(`${field} must contain 1..${max} characters`, { field, length: normalized.length });
  }
  return normalized;
}

function normalizeStringList(value, field, { min = 0, max = 24 } = {}) {
  if (!Array.isArray(value)) fail(`${field} must be an array`, { field });
  const list = [...new Set(value.map((item) => normalizeId(item, field)))].sort();
  if (list.length < min || list.length > max) {
    fail(`${field} must contain ${min}..${max} unique values`, { field, actual: list.length }, ERROR_CATEGORIES.RANGE);
  }
  return Object.freeze(list);
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) fail('atom.evidence must be an array', { field: 'evidence' });
  const list = [...new Set(value.map((item) => normalizeText(item, 'atom.evidence', 512)))].sort();
  if (list.length === 0 || list.length > 16) {
    fail('atom.evidence must contain 1..16 entries', { actual: list.length }, ERROR_CATEGORIES.RANGE);
  }
  return Object.freeze(list);
}

/** Normalize, checksum, and freeze a semantic atom. */
export function createSemanticAtom(input = {}) {
  const body = {
    contract: SEMANTIC_ATOM_CONTRACT,
    id: normalizeId(input.id, 'atom.id'),
    label: normalizeText(input.label, 'atom.label'),
    domain: normalizeId(input.domain, 'atom.domain'),
    offers: normalizeStringList(input.offers ?? [], 'atom.offers', { min: 1 }),
    seeks: normalizeStringList(input.seeks ?? [], 'atom.seeks'),
    traits: normalizeStringList(input.traits ?? [], 'atom.traits'),
    inhibits: normalizeStringList(input.inhibits ?? [], 'atom.inhibits'),
    grounding: round6(clamp01(input.grounding)),
    evidence: normalizeEvidence(input.evidence ?? []),
  };
  return deepSortedClone({ ...body, checksum: stableHash('atom1', body) });
}

function normalizeBridgeRule(input = {}) {
  return deepSortedClone({
    from: normalizeId(input.from, 'bridge.from'),
    to: normalizeId(input.to, 'bridge.to'),
    relation: normalizeId(input.relation, 'bridge.relation'),
    strength: round6(clamp01(input.strength ?? 0.82)),
  });
}

function normalizeConfig(options) {
  const integer = (value, fallback, min, max, field) => {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      fail(`${field} must be an integer in ${min}..${max}`, { field, value }, ERROR_CATEGORIES.RANGE);
    }
    return parsed;
  };
  const unit = (value, fallback, field) => {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      fail(`${field} must be finite in 0..1`, { field, value }, ERROR_CATEGORIES.RANGE);
    }
    return parsed;
  };
  const finite = (value, fallback, min, max, field) => {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      fail(`${field} must be finite in ${min}..${max}`, { field, value }, ERROR_CATEGORIES.RANGE);
    }
    return parsed;
  };
  const entropyEnabled = options.entropy?.enabled ?? DEFAULTS.entropyEnabled;
  if (typeof entropyEnabled !== 'boolean') {
    fail('entropy.enabled must be boolean', { field: 'entropy.enabled', value: entropyEnabled });
  }
  const entropyExactWeight = finite(
    options.entropy?.exactWeight,
    DEFAULTS.entropyExactWeight,
    0,
    100,
    'entropy.exactWeight',
  );
  const entropyFamilyWeight = finite(
    options.entropy?.familyWeight,
    DEFAULTS.entropyFamilyWeight,
    0,
    100,
    'entropy.familyWeight',
  );
  const entropyNeighborhoodWeight = finite(
    options.entropy?.neighborhoodWeight,
    DEFAULTS.entropyNeighborhoodWeight,
    0,
    100,
    'entropy.neighborhoodWeight',
  );
  const entropyWeightMass = entropyExactWeight + entropyFamilyWeight + entropyNeighborhoodWeight;
  if (entropyWeightMass <= 0) {
    fail('at least one entropy occupancy weight must be positive', { field: 'entropy' });
  }
  const environments = normalizeStringList(
    options.environments ?? DEFAULT_ENVIRONMENTS,
    'environments',
    { min: 1, max: 32 },
  );
  return Object.freeze({
    trialCount: integer(options.trialCount, DEFAULTS.trialCount, 1, 1_000_000, 'trialCount'),
    seed: integer(options.seed, DEFAULTS.seed, 0, 0xffffffff, 'seed'),
    maxMoleculeSize: integer(options.maxMoleculeSize, DEFAULTS.maxMoleculeSize, 2, 6, 'maxMoleculeSize'),
    controlEvery: integer(options.controlEvery, DEFAULTS.controlEvery, 2, 100, 'controlEvery'),
    controlPercentile: unit(options.controlPercentile, DEFAULTS.controlPercentile, 'controlPercentile'),
    shortlistLimit: integer(options.shortlistLimit, DEFAULTS.shortlistLimit, 1, 1024, 'shortlistLimit'),
    shortlistFamilyCap: integer(options.shortlistFamilyCap, DEFAULTS.shortlistFamilyCap, 1, 16, 'shortlistFamilyCap'),
    noveltyFloor: unit(options.noveltyFloor, DEFAULTS.noveltyFloor, 'noveltyFloor'),
    finalScoreFloor: unit(options.finalScoreFloor, DEFAULTS.finalScoreFloor, 'finalScoreFloor'),
    nucleusScoreFloor: unit(options.nucleusScoreFloor, DEFAULTS.nucleusScoreFloor, 'nucleusScoreFloor'),
    nucleusNoveltyFloor: unit(options.nucleusNoveltyFloor, DEFAULTS.nucleusNoveltyFloor, 'nucleusNoveltyFloor'),
    nucleusMinDomains: integer(options.nucleusMinDomains, DEFAULTS.nucleusMinDomains, 2, 6, 'nucleusMinDomains'),
    osmosisSimilarityFloor: unit(options.osmosisSimilarityFloor, DEFAULTS.osmosisSimilarityFloor, 'osmosisSimilarityFloor'),
    osmosisDriftCeiling: unit(options.osmosisDriftCeiling, DEFAULTS.osmosisDriftCeiling, 'osmosisDriftCeiling'),
    entropyEnabled,
    entropyDecayLambda: finite(
      options.entropy?.decayLambda,
      DEFAULTS.entropyDecayLambda,
      0,
      10,
      'entropy.decayLambda',
    ),
    entropyExactWeight,
    entropyFamilyWeight,
    entropyNeighborhoodWeight,
    entropyEscapeAttempts: integer(
      options.entropy?.escapeAttempts,
      DEFAULTS.entropyEscapeAttempts,
      0,
      16,
      'entropy.escapeAttempts',
    ),
    entropyActivationHeat: finite(
      options.entropy?.activationHeat,
      DEFAULTS.entropyActivationHeat,
      0,
      1_000_000_000,
      'entropy.activationHeat',
    ),
    environments,
  });
}

/** Integer avalanche mixer. It varies canonical counters without hidden state. */
export function mixTrialCounter(value) {
  let x = Number(value) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function seedFor(config, trialIndex, channel) {
  return mixTrialCounter(config.seed ^ Math.imul(trialIndex + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b));
}

function turboSimilarity(a, b) {
  if (!a.data.length || !b.data.length || a.data.length !== b.data.length) return 0;
  return clamp01(estimateInnerProduct(a.data, b.data, 1, 1));
}

function addScaled(target, source, scale) {
  // MUTATION: target is a per-molecule scratch vector in the performance-critical trial loop.
  for (let i = 0; i < target.length; i += 1) target[i] += source[i] * scale;
}

function meanVector(vectors) {
  const out = new Float32Array(VECTOR_DIMENSIONS);
  for (const vector of vectors) addScaled(out, vector, 1 / Math.max(vectors.length, 1));
  return out;
}

function connectionKey(connection) {
  return [
    connection.fromAtomId,
    connection.toAtomId,
    connection.offer,
    connection.seek,
    connection.relation,
  ].join('|');
}

function connectionBetween(from, to, bridgeMap) {
  const out = [];
  for (const offer of from.offers) {
    for (const seek of to.seeks) {
      const exact = offer === seek;
      const bridge = bridgeMap.get(`${offer}|${seek}`);
      if (!exact && !bridge) continue;
      if (from.inhibits.includes(to.domain) || to.inhibits.includes(from.domain)) continue;
      out.push(deepSortedClone({
        fromAtomId: from.id,
        toAtomId: to.id,
        offer,
        seek,
        relation: exact ? 'satisfies' : bridge.relation,
        strength: exact ? 1 : bridge.strength,
        licensed: true,
      }));
    }
  }
  return out;
}

function prepareAtomBank(rawAtoms, rawBridgeRules, config) {
  if (!Array.isArray(rawAtoms) || rawAtoms.length < 2 || rawAtoms.length > 256) {
    fail('atoms must contain 2..256 entries', { actual: rawAtoms?.length }, ERROR_CATEGORIES.RANGE);
  }
  const atoms = rawAtoms.map(createSemanticAtom).sort((a, b) => a.id.localeCompare(b.id));
  const idSet = new Set(atoms.map((atom) => atom.id));
  if (idSet.size !== atoms.length) fail('atom ids must be unique');
  const bridgeRules = (rawBridgeRules ?? []).map(normalizeBridgeRule)
    .sort((a, b) => `${a.from}|${a.to}|${a.relation}`.localeCompare(`${b.from}|${b.to}|${b.relation}`));
  const bridgeMap = new Map(bridgeRules.map((rule) => [`${rule.from}|${rule.to}`, rule]));
  const atomVectors = atoms.map((atom) => generateSemantotopographicVector(
    `${atom.label} ${atom.domain} ${atom.offers.join(' ')} ${atom.seeks.join(' ')}`,
    VECTOR_DIMENSIONS,
  ));
  const atomQuantized = atomVectors.map((vector) => quantizeVectorJS(vector, 42));
  const atomIndexById = new Map(atoms.map((atom, index) => [atom.id, index]));
  const environmentVectors = new Map(config.environments.map((environment) => [
    environment,
    generateSemantotopographicVector(`${environment} semantic environment`, VECTOR_DIMENSIONS),
  ]));
  const relationVectors = new Map();
  const adjacency = atoms.map(() => []);

  for (let left = 0; left < atoms.length; left += 1) {
    for (let right = left + 1; right < atoms.length; right += 1) {
      const connections = [
        ...connectionBetween(atoms[left], atoms[right], bridgeMap),
        ...connectionBetween(atoms[right], atoms[left], bridgeMap),
      ];
      for (const connection of connections) {
        const vectorKey = `${connection.offer}|${connection.relation}|${connection.seek}`;
        if (!relationVectors.has(vectorKey)) {
          relationVectors.set(vectorKey, generateSemantotopographicVector(
            `${connection.offer} ${connection.relation} ${connection.seek}`,
            VECTOR_DIMENSIONS,
          ));
        }
        const edge = Object.freeze({ left, right, connection, vectorKey });
        adjacency[left].push(Object.freeze({ target: right, edge }));
        adjacency[right].push(Object.freeze({ target: left, edge }));
      }
    }
  }
  for (const edges of adjacency) {
    edges.sort((a, b) => {
      const targetDelta = a.target - b.target;
      return targetDelta || connectionKey(a.edge.connection).localeCompare(connectionKey(b.edge.connection));
    });
    Object.freeze(edges);
  }

  const baselineVector = meanVector(atomVectors);
  const atomBankBody = { atoms, bridgeRules };
  const atomBankChecksum = stableHash('atombank1', atomBankBody);
  const baselineCell = createMemoryCellPacket({
    id: `semantic.valence.${atomBankChecksum.slice(-16)}`,
    family: 'immunity',
    mode: 'baseline',
    vector: baselineVector,
    membrane: {
      similarityFloor: config.osmosisSimilarityFloor,
      driftCeiling: config.osmosisDriftCeiling,
      concentrationLimit: 1,
    },
    stableContext: {
      detector: 'semantic-valence-cyclotron',
      atomBankChecksum,
    },
    seed: 42,
  });
  const controlRelationVector = generateSemantotopographicVector(
    'unlicensed shuffled control adjacency',
    VECTOR_DIMENSIONS,
  );

  return Object.freeze({
    atoms,
    bridgeRules,
    atomVectors,
    atomQuantized,
    atomIndexById,
    environmentVectors,
    relationVectors,
    controlRelationVector,
    adjacency,
    baselineCell,
    atomBankChecksum,
  });
}

function chooseSize(config, trialIndex) {
  return 2 + (seedFor(config, trialIndex, 0) % (config.maxMoleculeSize - 1));
}

function familyKey(connection) {
  const ids = [connection.fromAtomId, connection.toAtomId].sort();
  return `${ids[0]}|${ids[1]}`;
}

function neighborhoodKey(prepared, connection) {
  const left = prepared.atoms[prepared.atomIndexById.get(connection.fromAtomId)].domain;
  const right = prepared.atoms[prepared.atomIndexById.get(connection.toAtomId)].domain;
  const domains = [left, right].sort();
  return `${domains[0]}|${domains[1]}|${connection.relation}`;
}

function moleculeSearchKey(environment, atomIds, bonds) {
  return [
    environment,
    [...atomIds].sort().join(','),
    [...bonds].map(connectionKey).sort().join(','),
  ].join('||');
}

function meanOccupancy(counts, keys) {
  if (keys.length === 0) return 0;
  return keys.reduce((sum, key) => sum + (counts.get(key) ?? 0), 0) / keys.length;
}

function moleculeOccupancy(prepared, occupancy, molecule) {
  const familyKeys = molecule.bonds.map((link) => familyKey(link));
  const neighborhoodKeys = molecule.bonds.map((link) => neighborhoodKey(prepared, link));
  return {
    exactRevisits: occupancy.exact.get(moleculeSearchKey(
      molecule.environment,
      molecule.atomIds,
      molecule.bonds,
    )) ?? 0,
    familyRevisits: meanOccupancy(occupancy.family, familyKeys),
    neighborhoodRevisits: meanOccupancy(occupancy.neighborhood, neighborhoodKeys),
  };
}

function effectiveSearchAttraction(config, revisits, intrinsicEnergy) {
  const influence = computeOccupancyEntropyInfluence({
    intrinsicEnergy,
    ...revisits,
    decayLambda: config.entropyDecayLambda,
    exactWeight: config.entropyExactWeight,
    familyWeight: config.entropyFamilyWeight,
    neighborhoodWeight: config.entropyNeighborhoodWeight,
  });
  return { occupancyHeat: influence.occupancyHeat, attraction: influence.effectiveAttraction };
}

function buildLicensedTrial(prepared, config, trialIndex, environment) {
  const size = chooseSize(config, trialIndex);
  const start = seedFor(config, trialIndex, 1) % prepared.atoms.length;
  const atomIndexes = [start];
  const used = new Set(atomIndexes);
  const links = [];

  for (let step = 1; step < size; step += 1) {
    const options = [];
    for (const atomIndex of atomIndexes) {
      for (const adjacent of prepared.adjacency[atomIndex]) {
        if (!used.has(adjacent.target)) options.push(adjacent);
      }
    }
    if (options.length === 0) return null;
    const selected = options[seedFor(config, trialIndex, step + 1) % options.length];
    atomIndexes.push(selected.target);
    used.add(selected.target);
    links.push(selected.edge.connection);
  }
  return { atomIndexes, links, environment, control: false };
}

function incrementOccupancy(counts, key) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function recordMoleculeOccupancy(prepared, occupancy, molecule) {
  incrementOccupancy(
    occupancy.exact,
    moleculeSearchKey(molecule.environment, molecule.atomIds, molecule.bonds),
  );
  for (const key of new Set(molecule.bonds.map((bond) => familyKey(bond)))) {
    incrementOccupancy(occupancy.family, key);
  }
  for (const key of new Set(molecule.bonds.map((bond) => neighborhoodKey(prepared, bond)))) {
    incrementOccupancy(occupancy.neighborhood, key);
  }
  occupancy.observations += 1;
}

function buildControlTrial(prepared, config, trialIndex, environment) {
  const size = chooseSize(config, trialIndex);
  const atomIndexes = [];
  const used = new Set();
  for (let step = 0; step < size; step += 1) {
    let index = seedFor(config, trialIndex, step + 11) % prepared.atoms.length;
    let guard = 0;
    while (used.has(index) && guard < prepared.atoms.length) {
      index = (index + 1) % prepared.atoms.length;
      guard += 1;
    }
    if (used.has(index)) return null;
    atomIndexes.push(index);
    used.add(index);
  }
  const links = [];
  for (let i = 1; i < atomIndexes.length; i += 1) {
    const from = prepared.atoms[atomIndexes[i - 1]];
    const to = prepared.atoms[atomIndexes[i]];
    links.push(deepSortedClone({
      fromAtomId: from.id,
      toAtomId: to.id,
      offer: from.offers[seedFor(config, trialIndex, i + 20) % from.offers.length],
      seek: to.seeks.length ? to.seeks[seedFor(config, trialIndex, i + 30) % to.seeks.length] : 'closed-port',
      relation: 'shuffled-control',
      strength: 0,
      licensed: false,
    }));
  }
  return { atomIndexes, links, environment, control: true };
}

function moleculeIdentity(prepared, trial) {
  const atomIds = trial.atomIndexes.map((index) => prepared.atoms[index].id).sort();
  const bonds = [...trial.links].sort((a, b) => connectionKey(a).localeCompare(connectionKey(b)));
  return { atomIds, bonds };
}

function composeVector(prepared, trial) {
  const out = new Float32Array(VECTOR_DIMENSIONS);
  const atomScale = 0.72 / trial.atomIndexes.length;
  const canonicalAtomIndexes = [...trial.atomIndexes].sort((a, b) => a - b);
  for (const atomIndex of canonicalAtomIndexes) addScaled(out, prepared.atomVectors[atomIndex], atomScale);
  const relationScale = 1.15 / Math.max(trial.links.length, 1);
  const canonicalLinks = [...trial.links].sort((a, b) => connectionKey(a).localeCompare(connectionKey(b)));
  for (const link of canonicalLinks) {
    if (link.licensed) {
      const key = `${link.offer}|${link.relation}|${link.seek}`;
      addScaled(out, prepared.relationVectors.get(key), relationScale);
    } else {
      addScaled(out, prepared.controlRelationVector, relationScale);
    }
  }
  addScaled(out, prepared.environmentVectors.get(trial.environment), 0.28);
  return out;
}

function scoreTrial(prepared, trial) {
  const identity = moleculeIdentity(prepared, trial);
  const canonicalAtomIndexes = identity.atomIds.map((id) => prepared.atomIndexById.get(id));
  const atoms = canonicalAtomIndexes.map((index) => prepared.atoms[index]);
  const vector = composeVector(prepared, trial);
  const quantized = quantizeVectorJS(vector, 42);
  let closestConstituent = 0;
  for (const atomIndex of canonicalAtomIndexes) {
    closestConstituent = Math.max(
      closestConstituent,
      turboSimilarity(quantized, prepared.atomQuantized[atomIndex]),
    );
  }
  const novelty = clamp01(1 - closestConstituent);
  const grounding = atoms.reduce((sum, atom) => sum + atom.grounding, 0) / atoms.length;
  const licensed = trial.links.filter((link) => link.licensed);
  const linkStrength = licensed.length
    ? licensed.reduce((sum, link) => sum + link.strength, 0) / licensed.length
    : 0;
  const connectedAtomIds = new Set();
  for (const link of licensed) {
    connectedAtomIds.add(link.fromAtomId);
    connectedAtomIds.add(link.toAtomId);
  }
  const valenceSatisfaction = connectedAtomIds.size / atoms.length;
  const energy = clamp01(
    0.40 * linkStrength
    + 0.25 * valenceSatisfaction
    + 0.20 * grounding
    + 0.15 * novelty,
  );
  const label = [
    'sealed',
    ...atoms.map((atom) => atom.label),
    ...identity.bonds.map((link) => link.relation),
    'semantic molecule',
  ].join(' ');
  const moleculeBody = {
    contract: SEMANTIC_MOLECULE_CONTRACT,
    environment: trial.environment,
    atomIds: identity.atomIds,
    bonds: identity.bonds,
    label,
    energy: round6(energy),
    novelty: round6(novelty),
    grounding: round6(grounding),
    valenceSatisfaction: round6(valenceSatisfaction),
  };
  const molecule = deepSortedClone({
    ...moleculeBody,
    checksum: stableHash('molecule1', moleculeBody),
  });
  return { molecule, vector, atomIndexes: canonicalAtomIndexes, control: trial.control };
}

function selectLicensedTrial(prepared, config, trialIndex, environment, occupancy) {
  const baselineTrial = buildLicensedTrial(prepared, config, trialIndex, environment);
  if (!baselineTrial) return null;
  const baselineRow = scoreTrial(prepared, baselineTrial);
  if (!config.entropyEnabled || config.entropyEscapeAttempts === 0) return baselineRow;
  const baselineRevisits = moleculeOccupancy(prepared, occupancy, baselineRow.molecule);
  const baselineInfluence = effectiveSearchAttraction(
    config,
    baselineRevisits,
    baselineRow.molecule.energy,
  );
  if (baselineInfluence.occupancyHeat < config.entropyActivationHeat) return baselineRow;

  let selected = baselineRow;
  let selectedInfluence = baselineInfluence;
  let selectedAttempt = 0;
  occupancy.pressureApplications += 1;
  for (let attempt = 1; attempt <= config.entropyEscapeAttempts; attempt += 1) {
    const alternateAddress = mixTrialCounter(
      trialIndex ^ Math.imul(attempt, 0x27d4eb2f) ^ config.seed,
    );
    const alternateTrial = buildLicensedTrial(prepared, config, alternateAddress, environment);
    if (!alternateTrial) continue;
    const alternate = scoreTrial(prepared, alternateTrial);
    const revisits = moleculeOccupancy(prepared, occupancy, alternate.molecule);
    const influence = effectiveSearchAttraction(config, revisits, alternate.molecule.energy);
    occupancy.pressureApplications += 1;
    if (influence.attraction > selectedInfluence.attraction
      || (influence.attraction === selectedInfluence.attraction
        && alternate.molecule.checksum.localeCompare(selected.molecule.checksum) < 0)) {
      selected = alternate;
      selectedInfluence = influence;
      selectedAttempt = attempt;
    }
  }
  occupancy.selectedHeatSum += selectedInfluence.occupancyHeat;
  occupancy.selectedAttractionSum += selectedInfluence.attraction;
  occupancy.selections += 1;
  if (selectedAttempt !== 0) occupancy.redirects += 1;
  return selected;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function trimTop(rows, limit) {
  rows.sort((a, b) => (
    b.molecule.energy - a.molecule.energy
    || b.molecule.novelty - a.molecule.novelty
    || a.molecule.checksum.localeCompare(b.molecule.checksum)
  ));
  if (rows.length > limit) rows.length = limit;
}

function reactionFor(row, prepared, groundingIndex) {
  const atoms = row.molecule.atomIds.map((id) => prepared.atoms[prepared.atomIndexById.get(id)]);
  const args = {
    a: atoms[0].label,
    b: atoms.slice(1).map((atom) => atom.label).join(' + '),
    product: row.molecule.label,
  };
  if (groundingIndex) args.index = groundingIndex;
  else {
    args.groundingA = atoms[0].grounding;
    args.groundingB = atoms.slice(1).reduce((sum, atom) => sum + atom.grounding, 0)
      / Math.max(atoms.length - 1, 1);
  }
  return synthesize(args);
}

function finalizeCandidate(row, prepared, config, groundingIndex) {
  const atoms = row.atomIndexes.map((index) => prepared.atoms[index]);
  const conceptChemistry = reactionFor(row, prepared, groundingIndex);
  const osmosis = evaluateMemoryCellOsmosis(prepared.baselineCell, {
    vector: row.vector,
    concentration: row.molecule.energy,
    seed: 42,
  });
  const repelled = conceptChemistry.corpusPMI?.signal === 'REPULSION';
  const domainCount = new Set(atoms.map((atom) => atom.domain)).size;
  const finalScore = clamp01(
    ENERGY_WEIGHT * row.molecule.energy
    + FEASIBILITY_WEIGHT * clamp01(conceptChemistry.feasibility),
  );
  let verdict = 'REFUSED';
  if (
    osmosis.anomalyKind === 'baseline_drift'
    && conceptChemistry.stability !== 'UNSTABLE'
    && !repelled
    && atoms.length >= config.nucleusMinDomains
    && domainCount >= config.nucleusMinDomains
    && row.molecule.novelty >= config.nucleusNoveltyFloor
    && finalScore >= config.nucleusScoreFloor
  ) {
    verdict = 'NUCLEUS';
  } else if (
    osmosis.anomalyKind === 'baseline_drift'
    && !repelled
    && finalScore >= config.finalScoreFloor
  ) {
    verdict = 'HYPOTHESIS';
  }
  return deepSortedClone({
    molecule: row.molecule,
    conceptChemistry,
    osmosis,
    finalScore: round6(finalScore),
    verdict,
  });
}

function occupancySummary(counts) {
  const values = [...counts.values()];
  const total = values.reduce((sum, value) => sum + value, 0);
  let entropy = 0;
  if (total > 0) {
    for (const value of values) {
      const probability = value / total;
      entropy -= probability * Math.log(probability);
    }
  }
  return {
    occupiedBasins: values.length,
    observations: total,
    maximumOccupancy: values.length ? Math.max(...values) : 0,
    effectiveDiversity: round6(Math.exp(entropy)),
  };
}

/**
 * Execute the deterministic semantic molecule simulation.
 *
 * @param {object} options
 * @param {object[]} options.atoms sealed atom descriptors
 * @param {object[]} [options.bridgeRules] explicit offer -> seek adaptations
 * @param {object} [options.groundingIndex] prepared GroundingIndex
 * @returns {object} frozen PB-SEMANTIC-CYCLOTRON-REPORT-v1 report
 */
export function runSemanticValenceCyclotron(options = {}) {
  const config = normalizeConfig(options);
  const prepared = prepareAtomBank(options.atoms, options.bridgeRules, config);
  const seenMolecules = new Set();
  const controlScores = [];
  const topRows = [];
  const uniqueScores = [];
  const landscapeBuckets = Array.from({ length: 20 }, (_, index) => ({
    index,
    candidateTrials: 0,
    boundTrials: 0,
    uniqueMolecules: 0,
    duplicateMolecules: 0,
  }));
  const occupancy = {
    exact: new Map(),
    family: new Map(),
    neighborhood: new Map(),
    observations: 0,
    pressureApplications: 0,
    redirects: 0,
    selections: 0,
    selectedHeatSum: 0,
    selectedAttractionSum: 0,
  };
  const topBufferLimit = Math.max(config.shortlistLimit * 8, 512);
  const counts = {
    candidateTrials: 0,
    controlTrials: 0,
    unboundTrials: 0,
    duplicateMolecules: 0,
    uniqueMolecules: 0,
    shortlisted: 0,
    nuclei: 0,
    hypotheses: 0,
    refused: 0,
  };

  for (let trialIndex = 0; trialIndex < config.trialCount; trialIndex += 1) {
    const landscapeBucket = landscapeBuckets[Math.min(
      landscapeBuckets.length - 1,
      Math.floor((trialIndex * landscapeBuckets.length) / config.trialCount),
    )];
    const environment = config.environments[
      seedFor(config, trialIndex, 40) % config.environments.length
    ];
    const isControl = (trialIndex + 1) % config.controlEvery === 0;
    if (isControl) counts.controlTrials += 1;
    else {
      counts.candidateTrials += 1;
      landscapeBucket.candidateTrials += 1;
    }
    const row = isControl
      ? (() => {
        const trial = buildControlTrial(prepared, config, trialIndex, environment);
        return trial ? scoreTrial(prepared, trial) : null;
      })()
      : selectLicensedTrial(prepared, config, trialIndex, environment, occupancy);
    if (!row) {
      counts.unboundTrials += 1;
      continue;
    }
    if (isControl) {
      controlScores.push(row.molecule.energy);
      continue;
    }
    landscapeBucket.boundTrials += 1;
    recordMoleculeOccupancy(prepared, occupancy, row.molecule);
    if (seenMolecules.has(row.molecule.checksum)) {
      counts.duplicateMolecules += 1;
      landscapeBucket.duplicateMolecules += 1;
      continue;
    }
    seenMolecules.add(row.molecule.checksum);
    counts.uniqueMolecules += 1;
    landscapeBucket.uniqueMolecules += 1;
    uniqueScores.push({
      energy: row.molecule.energy,
      novelty: row.molecule.novelty,
      bucket: landscapeBucket.index,
    });
    topRows.push(row);
    if (topRows.length > topBufferLimit * 2) trimTop(topRows, topBufferLimit);
  }

  const controlBar = percentile(controlScores, config.controlPercentile);
  trimTop(topRows, topBufferLimit);
  const eligible = topRows.filter((row) => (
      row.molecule.energy > controlBar
      && row.molecule.novelty >= config.noveltyFloor
      && row.molecule.valenceSatisfaction === 1
    ));
  const familyCounts = new Map();
  const shortlisted = [];
  for (const row of eligible) {
    const family = stableHash('molfamily1', {
      atomIds: row.molecule.atomIds,
      bonds: row.molecule.bonds,
    });
    const count = familyCounts.get(family) ?? 0;
    if (count >= config.shortlistFamilyCap) continue;
    familyCounts.set(family, count + 1);
    shortlisted.push(row);
    if (shortlisted.length >= config.shortlistLimit) break;
  }
  counts.shortlisted = shortlisted.length;
  const candidates = shortlisted.map((row) => finalizeCandidate(
    row,
    prepared,
    config,
    options.groundingIndex,
  ));
  for (const candidate of candidates) {
    if (candidate.verdict === 'NUCLEUS') counts.nuclei += 1;
    else if (candidate.verdict === 'HYPOTHESIS') counts.hypotheses += 1;
    else counts.refused += 1;
  }
  candidates.sort((a, b) => (
    (a.verdict === 'NUCLEUS' ? 0 : a.verdict === 'HYPOTHESIS' ? 1 : 2)
    - (b.verdict === 'NUCLEUS' ? 0 : b.verdict === 'HYPOTHESIS' ? 1 : 2)
    || b.finalScore - a.finalScore
    || a.molecule.checksum.localeCompare(b.molecule.checksum)
  ));

  const body = {
    contract: SEMANTIC_CYCLOTRON_CONTRACT,
    schemaVersion: SEMANTIC_CYCLOTRON_SCHEMA_VERSION,
    seed: config.seed,
    requestedTrials: config.trialCount,
    completedTrials: config.trialCount,
    atomBankChecksum: prepared.atomBankChecksum,
    groundingIndexChecksum: options.groundingIndex?.checksum ?? null,
    // Scoring provenance sits alongside substrate provenance. Without it, a change
    // to the chemistry weights is indistinguishable from a change to the atom bank
    // when this report is re-run later. Inside the body, so it is checksummed.
    chemistryProvenance: chemistryProvenance(),
    configuration: {
      maxMoleculeSize: config.maxMoleculeSize,
      controlEvery: config.controlEvery,
      controlPercentile: config.controlPercentile,
      shortlistLimit: config.shortlistLimit,
      shortlistFamilyCap: config.shortlistFamilyCap,
      noveltyFloor: config.noveltyFloor,
      finalScoreFloor: config.finalScoreFloor,
      nucleusScoreFloor: config.nucleusScoreFloor,
      nucleusNoveltyFloor: config.nucleusNoveltyFloor,
      nucleusMinDomains: config.nucleusMinDomains,
      osmosisSimilarityFloor: config.osmosisSimilarityFloor,
      osmosisDriftCeiling: config.osmosisDriftCeiling,
      environments: config.environments,
      entropy: {
        enabled: config.entropyEnabled,
        decayLambda: round6(config.entropyDecayLambda),
        exactWeight: round6(config.entropyExactWeight),
        familyWeight: round6(config.entropyFamilyWeight),
        neighborhoodWeight: round6(config.entropyNeighborhoodWeight),
        escapeAttempts: config.entropyEscapeAttempts,
        activationHeat: round6(config.entropyActivationHeat),
      },
    },
    counts,
    control: {
      percentile: config.controlPercentile,
      bar: round6(controlBar),
      samples: controlScores.length,
    },
    searchLandscape: {
      intrinsicQuality: {
        meanEnergy: round6(uniqueScores.reduce((sum, row) => sum + row.energy, 0)
          / Math.max(uniqueScores.length, 1)),
        meanNovelty: round6(uniqueScores.reduce((sum, row) => sum + row.novelty, 0)
          / Math.max(uniqueScores.length, 1)),
        aboveControlBar: uniqueScores.filter((row) => row.energy > controlBar).length,
        maximumEnergy: round6(Math.max(0, ...uniqueScores.map((row) => row.energy))),
      },
      buckets: landscapeBuckets.map((bucket) => {
        const rows = uniqueScores.filter((row) => row.bucket === bucket.index);
        return {
          ...bucket,
          meanEnergy: round6(rows.reduce((sum, row) => sum + row.energy, 0)
            / Math.max(rows.length, 1)),
          meanNovelty: round6(rows.reduce((sum, row) => sum + row.novelty, 0)
            / Math.max(rows.length, 1)),
          aboveControlBar: rows.filter((row) => row.energy > controlBar).length,
        };
      }),
      entropy: {
        enabled: config.entropyEnabled,
        candidateObservations: occupancy.observations,
        redirects: occupancy.redirects,
        selections: occupancy.selections,
        pressureApplications: occupancy.pressureApplications,
        meanSelectedHeat: round6(occupancy.selectedHeatSum / Math.max(occupancy.selections, 1)),
        meanSelectedAttraction: round6(
          occupancy.selectedAttractionSum / Math.max(occupancy.selections, 1),
        ),
        exact: occupancySummary(occupancy.exact),
        family: occupancySummary(occupancy.family),
        neighborhood: occupancySummary(occupancy.neighborhood),
      },
    },
    candidates,
  };
  return deepSortedClone({ ...body, checksum: stableHash('cyclotron1', body, 32) });
}

/** Verify report identity without re-running the simulation. */
export function verifySemanticCyclotronReport(report) {
  if (!report || report.contract !== SEMANTIC_CYCLOTRON_CONTRACT) return false;
  const body = { ...report };
  delete body.checksum;
  return report.checksum === stableHash('cyclotron1', body, 32);
}
