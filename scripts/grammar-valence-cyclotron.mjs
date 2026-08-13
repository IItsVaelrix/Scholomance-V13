#!/usr/bin/env node

/**
 * Emit PB-CONSTELLATION-GRAMMAR-GAP-v1 from the frozen Constellation treebank.
 *
 * The JSON report goes to stdout so callers decide whether and where it is
 * persisted. No sentence text is present in the artifact.
 *
 * Usage:
 *   node scripts/grammar-valence-cyclotron.mjs
 *   node scripts/grammar-valence-cyclotron.mjs --split=test --limit=500 --min-count=2
 */

import { runGrammarValenceCyclotron } from '../codex/core/pixelbrain/grammar-valence-cyclotron.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const ALLOWED_SPLITS = new Set(['dev', 'test']);

function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TypeError(`${flag} requires a positive integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const parsedOptions = { split: 'dev' };
  for (const arg of argv) {
    if (arg.startsWith('--split=')) {
      const split = arg.slice('--split='.length);
      if (!ALLOWED_SPLITS.has(split)) throw new TypeError('--split must be dev or test');
      parsedOptions.split = split;
    } else if (arg.startsWith('--limit=')) {
      parsedOptions.limit = positiveInteger(arg.slice('--limit='.length), '--limit');
    } else if (arg.startsWith('--min-count=')) {
      parsedOptions.minCount = positiveInteger(arg.slice('--min-count='.length), '--min-count');
    } else if (arg.startsWith('--top-pairs=')) {
      parsedOptions.topPairs = positiveInteger(arg.slice('--top-pairs='.length), '--top-pairs');
    } else if (arg.startsWith('--candidate-limit=')) {
      parsedOptions.candidateLimit = positiveInteger(
        arg.slice('--candidate-limit='.length),
        '--candidate-limit',
      );
    } else if (arg.startsWith('--cleri-report=')) {
      const ref = arg.slice('--cleri-report='.length).trim();
      if (!ref || ref.length > 256) throw new TypeError('--cleri-report requires a bounded report id');
      if (!parsedOptions.cleriEvidenceRefs) parsedOptions.cleriEvidenceRefs = [];
      parsedOptions.cleriEvidenceRefs.push(ref);
    } else {
      throw new TypeError(`Unknown argument: ${arg}`);
    }
  }
  return parsedOptions;
}

const options = parseArgs(process.argv.slice(2));
const records = loadSplit(options.split);
const posMap = loadPosMap();
const report = runGrammarValenceCyclotron(records, posMap, options);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
