#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA as ENGINE_SCHEMA,
  STABLE_MIN,
  synthesize,
} from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  SCHEMA as GROUNDING_SCHEMA,
  loadEncyclopediaIndex,
  prepareForSynthesize,
} from '../codex/core/pixelbrain/grounding-index.js';
import {
  EXPERIMENT_ID,
  ROUNDS,
  evaluateExperiment,
  scoreRounds,
} from './lib/concept-chem-apm-hourly-experiment.mjs';

const EVIDENCE_SCHEMA = 'PB-CONCEPT-CHEM-APM-HOURLY-EVIDENCE-v1';
const DESIGN_SPEC_PATH = 'docs/superpowers/specs/2026-08-03-concept-chemistry-apm-hourly-reporter-design.md';
const DEFAULT_OUTPUT_PATH = 'docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json';
const ENGINE_FILES = Object.freeze([
  'codex/core/pixelbrain/calibration/control-gate.js',
  'codex/core/pixelbrain/concept-chemistry.js',
  'codex/core/pixelbrain/grounding-index.js',
]);

function canonicalValue(value, location = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonical JSON requires a finite number at ${location}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalValue(entry, `${location}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) {
        throw new TypeError(`canonical JSON does not allow undefined at ${location}.${key}`);
      }
      return [key, canonicalValue(value[key], `${location}.${key}`)];
    }));
  }
  throw new TypeError(`canonical JSON does not support ${typeof value} at ${location}`);
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function checksumFiles(repoRoot, relativePaths) {
  const hash = createHash('sha256');
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(relativePath, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(readFileSync(resolve(repoRoot, relativePath)));
    hash.update('\0', 'utf8');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function writeEvidenceOnce(outputPath, evidence) {
  canonicalJson(evidence);

  const absolutePath = resolve(outputPath);
  const outputDirectory = dirname(absolutePath);
  const temporaryPath = resolve(
    outputDirectory,
    `.${basename(absolutePath)}.tmp-${process.pid}`,
  );
  mkdirSync(outputDirectory, { recursive: true });

  let fileDescriptor = null;
  let directoryDescriptor = null;
  try {
    fileDescriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(fileDescriptor, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = null;

    try {
      linkSync(temporaryPath, absolutePath);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw new Error(`evidence already exists: ${absolutePath}`);
      }
      throw error;
    }

    directoryDescriptor = openSync(outputDirectory, 'r');
    fsyncSync(directoryDescriptor);
    closeSync(directoryDescriptor);
    directoryDescriptor = null;
  } finally {
    if (fileDescriptor !== null) closeSync(fileDescriptor);
    if (directoryDescriptor !== null) closeSync(directoryDescriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function runGit(repoRoot, args) {
  const result = spawnSync(
    'git',
    ['-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false', ...args],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function readGitProvenance(repoRoot) {
  const commit = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const porcelainText = runGit(repoRoot, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ]);
  const porcelain = porcelainText
    ? porcelainText.split('\n').filter(Boolean).sort()
    : [];
  return { commit, dirty: porcelain.length > 0, porcelain };
}

export function buildEvidence({ repoRoot, now = () => new Date() }) {
  const rawIndex = loadEncyclopediaIndex(repoRoot);
  const index = prepareForSynthesize(rawIndex);
  const scoredRounds = scoreRounds({
    rounds: ROUNDS,
    scoreReaction: ({ a, b, product }) => synthesize({ a, b, product, index }),
  });
  const decision = evaluateExperiment({ scoredRounds, stableMin: STABLE_MIN });
  const designSpecBytes = readFileSync(resolve(repoRoot, DESIGN_SPEC_PATH));
  const payload = {
    schema: EVIDENCE_SCHEMA,
    experimentId: EXPERIMENT_ID,
    recordedAt: now().toISOString(),
    inputs: {
      reactionMatrixChecksum: sha256(canonicalJson(ROUNDS)),
      designSpec: {
        path: DESIGN_SPEC_PATH,
        checksum: sha256(designSpecBytes),
      },
      engine: {
        schema: ENGINE_SCHEMA,
        stableMin: STABLE_MIN,
        files: [...ENGINE_FILES],
        checksum: checksumFiles(repoRoot, ENGINE_FILES),
      },
      corpus: {
        schema: GROUNDING_SCHEMA,
        checksum: rawIndex.checksum,
        documentCount: rawIndex.docCount,
        tokenCount: rawIndex.tokenCount,
      },
      git: readGitProvenance(repoRoot),
    },
    scoredRounds,
    decision,
  };

  return {
    ...payload,
    evidenceChecksum: sha256(canonicalJson(payload)),
  };
}

export function run({
  repoRoot,
  outputPath,
  now,
  build = buildEvidence,
}) {
  const evidence = build({ repoRoot, now });
  writeEvidenceOnce(outputPath, evidence);
  return {
    exitCode: evidence.decision.passed ? 0 : 2,
    evidence,
  };
}

function formatSummary(evidence, outputPath) {
  const lines = [
    `Experiment: ${evidence.experimentId}`,
    ...evidence.decision.rounds.map((round) => (
      `Round ${round.round}: winner=${round.winner ?? 'none'} bar=${round.barControlId} `
      + `clear=${round.winnerBeatsBar} law=${round.lawControlsCaught}`
    )),
    'Candidate medians:',
    ...Object.entries(evidence.decision.candidateMedians)
      .map(([architecture, score]) => `  ${architecture}: ${score}`),
    'Gates:',
    ...Object.entries(evidence.decision.gates)
      .map(([name, gate]) => `  ${gate.passed ? 'PASS' : 'FAIL'} ${name}: ${gate.detail}`),
    `Selected architecture: ${evidence.decision.selectedArchitecture ?? 'none'}`,
    `Evidence: ${outputPath}`,
  ];
  return lines.join('\n');
}

const isDirectInvocation = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const repoRoot = process.cwd();
  const outputPath = resolve(repoRoot, DEFAULT_OUTPUT_PATH);
  try {
    const result = run({ repoRoot, outputPath });
    process.stdout.write(`${formatSummary(result.evidence, outputPath)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`Concept Chemistry APM hourly scoring failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
