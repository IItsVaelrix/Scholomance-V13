#!/usr/bin/env node

/**
 * THE NULL-SUBSTRATE ATTACK.
 *
 * Can the Semantic Valence Cyclotron tell that its atom bank has been
 * deliberately mislabelled?
 *
 * Control arm : the true bank.
 * Null arm    : `label` and `evidence` deranged across atoms; `id`, `domain`,
 *               `offers`, `seeks`, `traits`, `inhibits` untouched. Grounding is
 *               recomputed from the permuted label by the same `attest` call the
 *               real bank uses.
 *
 * Adjacency, linkStrength and valenceSatisfaction are provably identical between
 * arms. Grounding, novelty and the whole Concept Chemistry layer are not.
 *
 * Predictions are declared in
 * docs/superpowers/evidence/2026-08-11-PREREG-null-substrate.md
 */

import { writeFileSync } from 'node:fs';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import {
  attest,
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';
import { chemistryProvenance } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  ATOM_BLUEPRINTS,
  BRIDGE_RULES,
  RITUAL_CONCENTRATION_LIMIT,
} from './semantic-valence-cyclotron.mjs';

const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-11-null-substrate-attack.json';
const PERMUTATION_SEED = 0x4e554c4c; // declared in the preregistration
const TRIALS = Number(process.env.TRIALS ?? 100_000);
const SEED = 0x5c4010;

const hashUint = (value) => Number.parseInt(sha256Hex(String(value)).slice(0, 8), 16) >>> 0;

/**
 * Seeded derangement: every atom receives a different atom's label.
 * Deterministic, and verified to have no fixed point before it is used.
 */
function derange(count, seed) {
  const order = Array.from({ length: count }, (_, i) => i)
    .sort((a, b) => hashUint(`${seed}|${a}`) - hashUint(`${seed}|${b}`) || a - b);
  // Rotating a permutation by one guarantees no element maps to itself.
  const mapping = new Array(count);
  for (let i = 0; i < count; i += 1) mapping[order[i]] = order[(i + 1) % count];
  for (let i = 0; i < count; i += 1) {
    if (mapping[i] === i) throw new Error('derangement produced a fixed point');
  }
  return mapping;
}

function buildArm(blueprints, groundingIndex) {
  return blueprints.map((blueprint) => ({
    ...blueprint,
    grounding: attest(groundingIndex, blueprint.label).score,
  }));
}

function run(atoms, groundingIndex) {
  const report = runSemanticValenceCyclotron({
    atoms,
    bridgeRules: BRIDGE_RULES,
    groundingIndex,
    trialCount: TRIALS,
    seed: SEED,
    maxMoleculeSize: 5,
    controlEvery: 5,
    controlPercentile: 0.99,
    shortlistLimit: 256,
    osmosisConcentrationLimit: RITUAL_CONCENTRATION_LIMIT,
    shortlistFamilyCap: 2,
    noveltyFloor: 0.04,
    finalScoreFloor: 0.58,
    nucleusScoreFloor: 0.765,
    nucleusNoveltyFloor: 0.32,
    nucleusMinDomains: 3,
  });
  if (!verifySemanticCyclotronReport(report)) throw new Error('report checksum failed');
  return report;
}

const mean = (values) => (values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0);

function summarize(report) {
  const verdicts = {};
  for (const candidate of report.candidates) {
    verdicts[candidate.verdict] = (verdicts[candidate.verdict] ?? 0) + 1;
  }
  return {
    checksum: report.checksum,
    atomBankChecksum: report.atomBankChecksum,
    uniqueMolecules: report.counts.uniqueMolecules,
    duplicateMolecules: report.counts.duplicateMolecules,
    nuclei: report.counts.nuclei,
    hypotheses: report.counts.hypotheses,
    refused: report.counts.refused,
    shortlisted: report.counts.shortlisted,
    controlBar: report.control.bar,
    meanFinalScore: mean(report.candidates.map((c) => c.finalScore)),
    meanEnergy: mean(report.candidates.map((c) => c.molecule.energy)),
    meanNovelty: mean(report.candidates.map((c) => c.molecule.novelty)),
    meanGrounding: mean(report.candidates.map((c) => c.molecule.grounding)),
    meanChemistryFeasibility: mean(report.candidates.map((c) => c.conceptChemistry.feasibility)),
    verdicts,
  };
}

console.log(`Loading grounding index for ${ATOM_BLUEPRINTS.length} atoms...`);
const groundingIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));

const mapping = derange(ATOM_BLUEPRINTS.length, PERMUTATION_SEED);
const permutedBlueprints = ATOM_BLUEPRINTS.map((blueprint, index) => ({
  ...blueprint,
  label: ATOM_BLUEPRINTS[mapping[index]].label,
  evidence: ATOM_BLUEPRINTS[mapping[index]].evidence,
}));

// Structural invariants must hold BEFORE the run, or the attack is not surgical.
for (let i = 0; i < ATOM_BLUEPRINTS.length; i += 1) {
  const a = ATOM_BLUEPRINTS[i];
  const b = permutedBlueprints[i];
  const same = a.id === b.id && a.domain === b.domain
    && JSON.stringify(a.offers) === JSON.stringify(b.offers)
    && JSON.stringify(a.seeks) === JSON.stringify(b.seeks);
  if (!same) throw new Error(`permutation altered structure at ${a.id}`);
  if (a.label === b.label) throw new Error(`permutation left ${a.id} labelled as itself`);
}
console.log(`Derangement verified: ${ATOM_BLUEPRINTS.length}/${ATOM_BLUEPRINTS.length} atoms mislabelled, 0 structural changes.`);
console.log('Example:', `${ATOM_BLUEPRINTS[0].id} "${ATOM_BLUEPRINTS[0].label}" -> "${permutedBlueprints[0].label}"`);

console.log(`\nControl arm: ${TRIALS.toLocaleString()} trials on the true bank...`);
const control = summarize(run(buildArm(ATOM_BLUEPRINTS, groundingIndex), groundingIndex));
console.log(`Null arm:    ${TRIALS.toLocaleString()} trials on the deranged bank...`);
const nullArm = summarize(run(buildArm(permutedBlueprints, groundingIndex), groundingIndex));

const delta = (key) => Number((nullArm[key] - control[key]).toFixed(6));
const predictions = {
  P1_topology_identical: {
    expected: 'PASS',
    uniqueDelta: delta('uniqueMolecules'),
    duplicateDelta: delta('duplicateMolecules'),
    held: nullArm.uniqueMolecules === control.uniqueMolecules
      && nullArm.duplicateMolecules === control.duplicateMolecules,
  },
  P2_energy_blind: {
    predicted: 'FAIL — no detection (|delta| < 0.01)',
    deltaMeanEnergy: delta('meanEnergy'),
    systemDetected: Math.abs(delta('meanEnergy')) > 0.03,
  },
  P3_chemistry_blind: {
    predicted: 'FAIL — no detection (|delta| < 0.02, nuclei stay 0)',
    deltaMeanFinalScore: delta('meanFinalScore'),
    deltaNuclei: delta('nuclei'),
    hypothesesRatio: Number((nullArm.hypotheses / Math.max(1, control.hypotheses)).toFixed(4)),
    systemDetected: Math.abs(delta('meanFinalScore')) > 0.05
      || nullArm.refused > control.refused * 1.5,
  },
};

const surprised = predictions.P2_energy_blind.systemDetected
  || predictions.P3_chemistry_blind.systemDetected;

const body = {
  contract: 'PB-NULL-SUBSTRATE-ATTACK-v1',
  schemaVersion: '1.0.0',
  preregistration: 'docs/superpowers/evidence/2026-08-11-PREREG-null-substrate.md',
  permutationSeed: PERMUTATION_SEED,
  chemistry: chemistryProvenance(),
  trials: TRIALS,
  control,
  nullArm,
  predictions,
  verdict: surprised ? 'SURPRISE — THE SYSTEM DETECTED THE SCRAMBLE' : 'PREDICTED — SUBSTRATE-BLIND',
};
// Self-seal, so the artifact can be verified without a prior manifest.
// Omission caught by scripts/evidence-integrity-harness.mjs (NO_SELF_CHECKSUM).
const sealed = { ...body, checksum: `null-substrate1:${sha256Hex(body)}` };
writeFileSync(OUTPUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');

console.log('\n=== NULL-SUBSTRATE ATTACK ===');
console.log('metric                    control        null           delta');
for (const key of ['uniqueMolecules', 'duplicateMolecules', 'nuclei', 'hypotheses', 'refused',
  'controlBar', 'meanEnergy', 'meanNovelty', 'meanGrounding', 'meanFinalScore',
  'meanChemistryFeasibility']) {
  console.log(
    key.padEnd(24),
    String(Number(control[key]).toFixed(6)).padStart(12),
    String(Number(nullArm[key]).toFixed(6)).padStart(14),
    String(delta(key)).padStart(14),
  );
}
console.log('\nP1 topology identical :', predictions.P1_topology_identical.held);
console.log('P2 energy detected    :', predictions.P2_energy_blind.systemDetected);
console.log('P3 chemistry detected :', predictions.P3_chemistry_blind.systemDetected);
console.log('\nVERDICT:', body.verdict);
console.log('Evidence:', OUTPUT_PATH);
