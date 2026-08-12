#!/usr/bin/env node

/**
 * Run the Semantic Valence Cyclotron over repository-grounded capability atoms.
 *
 * Default ritual: 100,000 trials, 20% shuffled controls, deterministic output.
 * The script writes no per-trial prose and asks no model to propose bonds.
 */

import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  runSemanticValenceCyclotron,
  verifySemanticCyclotronReport,
} from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import {
  attest,
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';

const DEFAULT_OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-11-semantic-valence-cyclotron-100k.json';
const DEFAULT_TRIALS = 100_000;
const DEFAULT_SEED = 0x5c4010;

function parseIntegerFlag(name, fallback, min, max) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer in ${min}..${max}`);
  }
  return value;
}

function parseStringFlag(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

function resolveOutputPath(trialCount) {
  const out = parseStringFlag('out');
  if (out) return out;
  if (trialCount !== DEFAULT_TRIALS) {
    throw new TypeError(
      `--out is required when --trials is not ${DEFAULT_TRIALS}: refusing to overwrite `
      + `${DEFAULT_OUTPUT_PATH} with a ${trialCount}-trial run`,
    );
  }
  return DEFAULT_OUTPUT_PATH;
}

const atom = (id, label, domain, offers, seeks, evidence, traits = [], inhibits = []) => ({
  id,
  label,
  domain,
  offers,
  seeks,
  traits,
  inhibits,
  evidence: [evidence],
});

// The bank contains declared capabilities, not proposed bonds. Connections are
// derived by the engine only when an offered port satisfies a sought port.
export const ATOM_BLUEPRINTS = Object.freeze([
  atom('corpus-loader', 'encyclopedia corpus loader', 'evidence', ['corpus'], [], 'codex/core/pixelbrain/grounding-index.js'),
  atom('grounding-index', 'corpus grounding index', 'evidence', ['corpus-grounding', 'co-occurrence'], ['corpus'], 'codex/core/pixelbrain/grounding-index.js'),
  atom('canonical-tokenizer', 'canonical linguistic tokenizer', 'linguistic', ['token-stream'], ['text'], 'codex/core/tokenizer.js'),
  atom('phonetic-encoder', 'deterministic phonetic encoder', 'linguistic', ['phoneme-sequence'], ['token-stream'], 'codex/core/phonology'),
  atom('morphology-analyzer', 'morphological decomposition analyzer', 'linguistic', ['morpheme-family'], ['token-stream'], 'codex/core/lexical-analysis'),
  atom('wordnet-resolver', 'WordNet sense resolver', 'linguistic', ['semantic-primitives'], ['token-stream'], 'codex/core/semantic/wordnet-senses.js'),
  atom('phonotopography', 'phonological topographic mapper', 'vector', ['dense-vector', 'phoneme-topology'], ['phoneme-sequence'], 'codex/core/semantic/phonotopography.js'),
  atom('semantotopography', 'semantic topographic mapper', 'vector', ['dense-vector', 'semantic-topology'], ['semantic-primitives'], 'codex/core/semantic/semantotopography.js'),
  atom('lexical-graph', 'lexical relation graph', 'graph', ['semantic-relation', 'candidate-frontier'], ['token-stream'], 'codex/core/lexical-graph'),
  atom('query-expander', 'bounded query expansion', 'retrieval', ['probe-family'], ['phoneme-sequence', 'morpheme-family'], 'codex/core/pixelbrain/bridge-corpus/linguistic-retrieval-bridge.js'),
  atom('retrieval-index', 'deterministic retrieval index', 'retrieval', ['candidate-frontier'], ['probe-family'], 'codex/server/services/codebaseSearch.service.js'),
  atom('graph-traversal', 'semantic graph traversal', 'graph', ['candidate-frontier'], ['semantic-relation'], 'codex/core/ritual-prediction'),
  atom('turboquant', 'TurboQuant vector reranker', 'vector', ['ranked-frontier', 'quantized-vector'], ['dense-vector', 'candidate-frontier'], 'codex/core/quantization/turboquant.js'),
  atom('semantic-ballistics', 'semantic containment ballistics', 'retrieval', ['containment-score'], ['candidate-frontier'], 'codex/core/lexical-analysis/semanticBallistics.js'),
  atom('law-gate', 'Vaelrix law gate', 'governance', ['law-verdict'], ['proposal'], 'docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md'),
  atom('authorization-calculus', 'authorization binding calculus', 'governance', ['bind-verdict'], ['containment-score', 'law-verdict'], 'codex/core/semantic-calculus/permission.ts'),
  atom('concept-chemistry', 'Concept Chemistry feasibility scorer', 'synthesis', ['feasibility-score'], ['concept-pair', 'corpus-grounding'], 'codex/core/pixelbrain/concept-chemistry.js'),
  atom('molecule-generator', 'semantic molecule candidate generator', 'synthesis', ['concept-pair', 'proposal', 'candidate-frontier'], ['atom-inventory', 'operator-law'], 'codex/core/pixelbrain/semantic-valence-cyclotron.js'),
  atom('valence-compiler', 'typed semantic valence compiler', 'synthesis', ['candidate-frontier'], ['atom-inventory', 'trial-counter'], 'codex/core/pixelbrain/semantic-valence-cyclotron.js'),
  atom('operator-registry', 'semantic composition operator registry', 'synthesis', ['operator-law'], ['schema-verdict'], 'codex/core/semantics.registry.js'),
  atom('counter-scheduler', 'counter addressed trial scheduler', 'synthesis', ['trial-counter'], ['operator-law'], 'codex/core/pixelbrain/semantic-valence-cyclotron.js'),
  atom('cyclotron-reactor', 'semantic Cyclotron reactor', 'synthesis', ['experiment-receipt'], ['candidate-frontier', 'feasibility-score'], 'scripts/cyclotron-extrapolation-simulation.mjs'),
  atom('purity-assay', 'determinism purity assay', 'immunity', ['purity-grade'], ['experiment-receipt', 'law-verdict'], 'codex/core/pixelbrain/determinism-purity-assay.js'),
  atom('osmosis-receptor', 'Memory Cell Osmosis receptor', 'immunity', ['anomaly-signal'], ['quantized-vector'], 'codex/core/immunity/memory-cell-osmosis.js'),
  atom('clerical-raid', 'Clerical RAID risk classifier', 'immunity', ['risk-classification'], ['anomaly-signal'], 'codex/core/immunity/clerical-raid.core.js'),
  atom('build-gate', 'grounding gated build decision', 'governance', ['build-decision'], ['feasibility-score', 'purity-grade', 'risk-classification'], 'codex/core/pixelbrain/build-gate.js'),
  atom('label-store', 'append only calibration label store', 'memory', ['calibration-label'], ['experiment-receipt', 'build-decision'], 'codex/core/pixelbrain/label-store.js'),
  atom('calibration-harness', 'deterministic calibration harness', 'memory', ['weight-drift'], ['calibration-label'], 'scripts/concept-chem-determinism.mjs'),
  atom('canonical-serializer', 'canonical artifact serializer', 'artifact', ['artifact'], ['structure'], 'codex/core/pixelbrain/canonical-json.js'),
  atom('bytecode-seal', 'bytecode identity seal', 'artifact', ['checksum'], ['artifact'], 'codex/core/pixelbrain/pbrain-checksum.js'),
  atom('schema-verifier', 'schema contract verifier', 'governance', ['schema-verdict'], ['artifact'], 'docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md'),
  atom('immutable-packet', 'immutable sealed packet builder', 'artifact', ['sealed-packet'], ['artifact', 'checksum'], 'codex/core/immunity/cleri-probe/canonical-report.js'),
  atom('diagnostic-event-bus', 'diagnostic event bus', 'runtime', ['diagnostic-event'], ['sealed-packet'], 'codex/runtime/event-bus.js'),
  atom('server-authority', 'server authoritative resolver', 'governance', ['authoritative-verdict'], ['diagnostic-event', 'schema-verdict'], 'codex/server'),
  atom('human-review', 'human Grimoire review', 'governance', ['promotion-decision'], ['authoritative-verdict'], 'docs/superpowers/evidence/2026-08-09-cyclotron-extrapolation.md'),
  atom('correspondence-registry', 'semantic correspondence registry', 'memory', ['semantic-relation', 'atom-inventory'], ['promotion-decision'], 'docs/scholomance-encyclopedia/Scholomance White Papers/SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md'),
  atom('false-friend-detector', 'signed co-occurrence false friend detector', 'evidence', ['contradiction-signal'], ['co-occurrence', 'semantic-relation'], 'codex/core/pixelbrain/grounding-index.js'),
  atom('control-generator', 'shuffled negative control generator', 'validation', ['control-frontier'], ['atom-inventory'], 'codex/core/constellation/grimoire/reactor.js'),
  atom('holdout-validator', 'blind holdout validator', 'validation', ['validation-verdict'], ['candidate-frontier', 'control-frontier'], 'scripts/cyclotron-extrapolation-simulation.mjs'),
  atom('semantic-memory', 'sealed semantic memory bank', 'memory', ['atom-inventory'], ['sealed-packet'], 'codex/core/immunity/memory-cell-osmosis.js'),
  atom('novelty-detector', 'vector novelty detector', 'validation', ['novelty-signal'], ['ranked-frontier', 'atom-inventory'], 'codex/core/quantization/turboquant.js'),
  atom('hypothesis-registry', 'theoretical hypothesis registry', 'memory', ['proposal'], ['novelty-signal', 'validation-verdict'], 'docs/scholomance-encyclopedia/Scholomance White Papers/SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md'),
  atom('contradiction-gate', 'semantic contradiction gate', 'governance', ['law-verdict'], ['contradiction-signal'], 'codex/core/pixelbrain/concept-chemistry.js'),
  atom('evidence-ledger', 'content addressed evidence ledger', 'memory', ['structure'], ['experiment-receipt', 'validation-verdict'], 'docs/superpowers/evidence'),
]);

export const BRIDGE_RULES = Object.freeze([
  { from: 'phoneme-topology', to: 'dense-vector', relation: 'projects', strength: 0.92 },
  { from: 'semantic-topology', to: 'dense-vector', relation: 'projects', strength: 0.94 },
  { from: 'ranked-frontier', to: 'candidate-frontier', relation: 'narrows', strength: 0.88 },
  { from: 'bind-verdict', to: 'law-verdict', relation: 'authorizes', strength: 0.84 },
  { from: 'novelty-signal', to: 'anomaly-signal', relation: 'excites', strength: 0.82 },
  { from: 'validation-verdict', to: 'authoritative-verdict', relation: 'supports', strength: 0.86 },
  { from: 'promotion-decision', to: 'schema-verdict', relation: 'licenses', strength: 0.80 },
  { from: 'sealed-packet', to: 'artifact', relation: 'carries', strength: 0.90 },
]);

function main() {
  const trialCount = parseIntegerFlag('trials', DEFAULT_TRIALS, 1, 1_000_000);
  const seed = parseIntegerFlag('seed', DEFAULT_SEED, 0, 0xffffffff);
  const outputPath = resolveOutputPath(trialCount);

  console.log('Semantic Valence Cyclotron');
  console.log(`Loading repository grounding index for ${ATOM_BLUEPRINTS.length} atoms...`);
  const groundingIndex = prepareForSynthesize(loadEncyclopediaIndex(process.cwd()));
  const atoms = ATOM_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    grounding: attest(groundingIndex, blueprint.label).score,
  }));

  console.log(`Running ${trialCount.toLocaleString()} deterministic collisions...`);
  const started = performance.now();
  const report = runSemanticValenceCyclotron({
    atoms,
    bridgeRules: BRIDGE_RULES,
    groundingIndex,
    trialCount,
    seed,
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
  });
  const elapsedMs = performance.now() - started;

  if (!verifySemanticCyclotronReport(report)) {
    throw new Error('Semantic Cyclotron report checksum verification failed');
  }

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Completed: ${report.completedTrials.toLocaleString()} trials in ${elapsedMs.toFixed(1)} ms`);
  console.log(`Throughput: ${(report.completedTrials / (elapsedMs / 1000)).toFixed(0)} trials/sec`);
  console.log(`Unique molecules: ${report.counts.uniqueMolecules.toLocaleString()}`);
  console.log(`Duplicate molecules: ${report.counts.duplicateMolecules.toLocaleString()}`);
  console.log(`Control p${(report.control.percentile * 100).toFixed(0)} bar: ${report.control.bar.toFixed(6)}`);
  console.log(`Shortlisted: ${report.counts.shortlisted}`);
  console.log(`Nuclei: ${report.counts.nuclei}`);
  console.log(`Hypotheses: ${report.counts.hypotheses}`);
  console.log(`Refused: ${report.counts.refused}`);
  console.log(`Report checksum: ${report.checksum}`);
  console.log(`Evidence: ${outputPath}`);

  for (const candidate of report.candidates.slice(0, 12)) {
    console.log([
      candidate.verdict.padEnd(10),
      candidate.finalScore.toFixed(4),
      candidate.molecule.energy.toFixed(4),
      candidate.molecule.novelty.toFixed(4),
      candidate.conceptChemistry.stability.padEnd(10),
      candidate.molecule.atomIds.join(' + '),
    ].join('  '));
  }
}

const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === invokedUrl) main();
