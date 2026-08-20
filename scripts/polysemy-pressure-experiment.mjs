/**
 * POLYSEMY PRESSURE EXPERIMENT & LEXICAL MONOTONICITY AUDIT
 *
 * Investigates the 116 "Oracle-Only" sentences that parsed under Gold UPOS
 * but failed under the Real 351k SQLite Dictionary.
 *
 * TESTS:
 * 1. Lexical Recall vs. True Polysemy Collapse:
 *    Is the gold POS tag missing in SQLite (Recall Failure), or is it present
 *    with distractors (Non-Monotonic Ambiguity Collapse)?
 *
 * 2. Progressive Polysemy Pressure Survival Curve:
 *    Measures P(Root Survives | k Distractors) for k = 0, 1, 2, 4, 8, Full Dict.
 *
 * 3. Specific Competing Distractor Types:
 *    Identifies which POS conflicts (e.g. n/v, a/v, r/p) induce the collapse.
 *
 * Run with:
 *   node scripts/polysemy-pressure-experiment.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer, goldPosMap } from '../codex/core/constellation/treebank.js';
import {
  composePacked,
  ROOT_DOORWAY,
  projectAnswers,
} from '../codex/core/constellation/compose-packed.js';

const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
const DICT_PATH = path.resolve('scholomance_dict.sqlite');

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

function loadRealDictionary() {
  const db = new Database(DICT_PATH, { readonly: true });
  const posTable = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posTable.get(r.surface_lower);
    if (have) {
      if (!have.includes(tag)) have.push(tag);
    } else {
      posTable.set(r.surface_lower, [tag]);
    }
  }
  db.close();
  return posTable;
}

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  POLYSEMY PRESSURE & LEXICAL MONOTONICITY EXPERIMENT');
console.log('  Investigating the 116 Oracle-Only Sentences on UD English-EWT');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

const realDict = loadRealDictionary();
const rawRecords = parseConllu(readFileSync(TEST_PATH, 'utf8'));

const testSentences = [];
for (const rec of rawRecords) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= 20) {
    testSentences.push({
      rec,
      tokens,
      gold: goldAnswer(rec),
      oracleMap: goldPosMap(rec),
    });
  }
}

// 1. Isolate the exact 116 Oracle-Only sentences
const oracleOnlyCases = [];

for (const item of testSentences) {
  const chartReal = composePacked(item.tokens, realDict, { roots: ROOT_DOORWAY.ALL });
  const chartOracle = composePacked(item.tokens, item.oracleMap, { roots: ROOT_DOORWAY.ALL });

  const parsedReal = chartReal.stable.length > 0;
  const parsedOracle = chartOracle.stable.length > 0;

  if (!parsedReal && parsedOracle) {
    oracleOnlyCases.push(item);
  }
}

console.log(`Found exactly ${oracleOnlyCases.length} Oracle-Only sentences.\n`);

// ── STEP 1: LEXICAL RECALL VS TRUE POLYSEMY COLLAPSE ────────────────────────
let missingTagCount = 0;
let truePolysemyCount = 0;

const polysemyDetails = [];

for (const item of oracleOnlyCases) {
  let isMissingGoldTag = false;
  const wordDiagnostics = [];

  for (const token of item.rec.tokens) {
    const form = String(token.form).toLowerCase();
    const goldTags = item.oracleMap.get(form) || [];
    const dictTags = realDict.get(form) || [];

    // Check if gold tag is missing in dictionary
    const missing = goldTags.filter((t) => !dictTags.includes(t));
    const extra = dictTags.filter((t) => !goldTags.includes(t));

    if (missing.length > 0) {
      isMissingGoldTag = true;
    }

    if (extra.length > 0 || missing.length > 0) {
      wordDiagnostics.push({ form, goldTags, dictTags, missing, extra });
    }
  }

  if (isMissingGoldTag) {
    missingTagCount += 1;
  } else {
    truePolysemyCount += 1;
    polysemyDetails.push({ item, wordDiagnostics });
  }
}

console.log('1. ROOT CAUSE CLASSIFICATION:');
console.log(`  • Lexical Recall Failures (Gold POS tag absent in SQLite dict): ${missingTagCount} / ${oracleOnlyCases.length} (${((missingTagCount/oracleOnlyCases.length)*100).toFixed(1)}%)`);
console.log(`  • True Polysemy Collapse (Gold POS present, but distractors kill parse): ${truePolysemyCount} / ${oracleOnlyCases.length} (${((truePolysemyCount/oracleOnlyCases.length)*100).toFixed(1)}%)\n`);

// ── STEP 2: POLYSEMY PRESSURE SURVIVAL CURVES ────────────────────────────────
console.log('2. PROGRESSIVE POLYSEMY PRESSURE EXPERIMENT:');
console.log('   Injecting distractor senses into the 116 Oracle-Only sentences...\n');

const DISTRACTOR_STEPS = [0, 1, 2, 3, 4, 8, Infinity]; // Infinity = Full Dictionary

console.log('┌─────────────────────────────┬──────────────┬──────────────────┬──────────────┬──────────────┐');
console.log('│ Pressure Level (Extra Tags) │ Parsed Roots │ Survival Rate P  │ Gold Contain │ Mean Nodes   │');
console.log('├─────────────────────────────┼──────────────┼──────────────────┼──────────────┼──────────────┤');

for (const k of DISTRACTOR_STEPS) {
  let parsed = 0;
  let containment = 0;
  let totalNodes = 0;

  for (const item of oracleOnlyCases) {
    // Construct synthetic posMap with gold + at most k distractor tags per word
    const syntheticMap = new Map();
    for (const [word, goldTags] of item.oracleMap.entries()) {
      const dictTags = realDict.get(word) || [];
      const distractors = dictTags.filter((t) => !goldTags.includes(t));
      const injected = k === Infinity ? dictTags : [...goldTags, ...distractors.slice(0, k)];
      syntheticMap.set(word, injected);
    }

    const chart = composePacked(item.tokens, syntheticMap, { roots: ROOT_DOORWAY.ALL });
    totalNodes += chart.molecules.length;

    if (chart.stable.length > 0) {
      parsed += 1;
      const ans = chart.stable.flatMap((s) => projectAnswers(s));
      if (ans.some((a) => a.verb === item.gold.verb)) containment += 1;
    }
  }

  const label = k === Infinity ? 'Full Real Dictionary' : `Gold + ${k} Distractors`;
  const survivalRate = ((parsed / oracleOnlyCases.length) * 100).toFixed(1) + '%';
  const containRate = ((containment / oracleOnlyCases.length) * 100).toFixed(1) + '%';
  const meanNodes = (totalNodes / oracleOnlyCases.length).toFixed(1);

  console.log(`│ ${label.padEnd(27)} │ ${String(parsed).padEnd(12)} │ ${survivalRate.padEnd(16)} │ ${containRate.padEnd(12)} │ ${meanNodes.padEnd(12)} │`);
}
console.log('└─────────────────────────────┴──────────────┴──────────────────┴──────────────┴──────────────┘\n');

// ── STEP 3: SPECIFIC COMPETING DISTRACTOR TYPES ─────────────────────────────
console.log('3. SPECIFIC COMPETING DISTRACTOR FREQUENCIES IN TRUE POLYSEMY COLLAPSES:');
const conflictCounts = new Map();

for (const { wordDiagnostics } of polysemyDetails) {
  for (const d of wordDiagnostics) {
    for (const g of d.goldTags) {
      for (const e of d.extra) {
        const pair = `${g} -> ${e}`;
        conflictCounts.set(pair, (conflictCounts.get(pair) || 0) + 1);
      }
    }
  }
}

const sortedConflicts = [...conflictCounts.entries()].sort((a, b) => b[1] - a[1]);
for (const [pair, count] of sortedConflicts.slice(0, 8)) {
  console.log(`  • ${pair.padEnd(15)} : ${count} occurrences`);
}
