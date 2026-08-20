/**
 * METHODOLOGICAL AUDIT: PURE REAL DICTIONARY VS. GOLD ORACLE POS
 *
 * Disambiguates whether performance comes from the grammar/dictionary
 * or from the CoNLL-U test file's UPOS column (Oracle Leak Audit).
 *
 * EVALUATES ON UD ENGLISH-EWT HELD-OUT TEST SPLIT (N = 2,077 sentences):
 * 1. Mode A: Pure Real Dictionary (scholomance_dict.sqlite, 351k words) - ZERO ORACLE DATA
 * 2. Mode B: Gold Oracle UPOS (Idealized Upper Bound)
 *
 * Run with:
 *   node scripts/real-dict-vs-oracle-benchmark.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import Database from 'better-sqlite3';

import { parseConllu, goldAnswer, goldPosMap } from '../codex/core/constellation/treebank.js';
import {
  composePacked,
  ROOT_DOORWAY,
  projectAnswers,
  crystallizeChart,
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
console.log('  ORACLE LEAK AUDIT: PURE REAL DICTIONARY VS. GOLD UPOS ORACLE');
console.log('  Held-Out Universal Dependencies English-EWT Test Set (2,077 Sentences)');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

const realDict = loadRealDictionary();
console.log(`Loaded real SQLite dictionary: ${realDict.size.toLocaleString()} surface word forms.\n`);

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

console.log(`Auditing ${testSentences.length} test sentences (<= 20 tokens)...\n`);

function evaluateMode(modeName, getPosMap) {
  let parsedClausal = 0;
  let parsedDoorway = 0;
  let top1Heads = 0;
  let goldContainment = 0;
  let totalRawNodes = 0;
  let totalCrystalNodes = 0;

  const t0 = performance.now();
  for (const item of testSentences) {
    const posMap = getPosMap(item);

    // 1. Clausal
    const chartC = composePacked(item.tokens, posMap, { roots: ROOT_DOORWAY.CLAUSAL });
    if (chartC.stable.length > 0) parsedClausal += 1;

    // 2. Multi-Aperture Doorway
    const chartD = composePacked(item.tokens, posMap, { roots: ROOT_DOORWAY.ALL, light: true });
    if (chartD.stable.length > 0) {
      parsedDoorway += 1;
      const ans = chartD.stable.flatMap((s) => projectAnswers(s));
      if (ans.some((a) => a.verb === item.gold.verb)) goldContainment += 1;
      if (ans[0]?.verb === item.gold.verb) top1Heads += 1;

      const crystal = crystallizeChart(chartD);
      totalRawNodes += crystal.rawMolecules;
      totalCrystalNodes += crystal.crystallizedMolecules;
    }
  }
  const ms = performance.now() - t0;

  const N = testSentences.length;
  const dissolutionRate = totalRawNodes > 0 ? ((totalRawNodes - totalCrystalNodes) / totalRawNodes) * 100 : 0;

  return {
    name: modeName,
    parsedClausal,
    parsedDoorway,
    top1Heads,
    goldContainment,
    coverageClausalPct: ((parsedClausal / N) * 100).toFixed(2),
    coverageDoorwayPct: ((parsedDoorway / N) * 100).toFixed(2),
    headAccuracyPct: parsedDoorway > 0 ? ((top1Heads / parsedDoorway) * 100).toFixed(2) : '0.00',
    containmentPct: parsedDoorway > 0 ? ((goldContainment / parsedDoorway) * 100).toFixed(2) : '0.00',
    effectiveAccuracyPct: ((top1Heads / N) * 100).toFixed(2),
    dissolutionRate: dissolutionRate.toFixed(2),
    ms: ms.toFixed(1),
    throughput: (N / (ms / 1000)).toFixed(1),
  };
}

// MODE 1: PURE REAL DICTIONARY (ZERO ORACLE DATA)
console.log('1. Evaluating Mode 1: Pure Real Dictionary (scholomance_dict.sqlite)...');
const resReal = evaluateMode('1. Pure Real Dictionary (351k SQLite)', () => realDict);

// MODE 2: GOLD ORACLE POS (UPOS from CoNLL-U)
console.log('2. Evaluating Mode 2: Gold Oracle UPOS (Idealized Upper Bound)...');
const resOracle = evaluateMode('2. Gold Oracle UPOS (Upper Bound)', (item) => item.oracleMap);

console.log('\n══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  ORACLE AUDIT RESULTS MATRIX (UD ENGLISH-EWT TEST SET, N = 1,715 SENTENCES)');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

console.log('┌──────────────────────────────────────┬────────────────────────┬────────────────────────┐');
console.log('│ Metric                               │ Pure Real Dictionary   │ Gold Oracle UPOS       │');
console.log('│                                      │ (Zero Oracle Data)     │ (Idealized Bound)      │');
console.log('├──────────────────────────────────────┼────────────────────────┼────────────────────────┤');
console.log(`│ Clausal Coverage ('S' only)          │ ${resReal.parsedClausal} / 1715 (${resReal.coverageClausalPct}%)   │ ${resOracle.parsedClausal} / 1715 (${resOracle.coverageClausalPct}%)   │`);
console.log(`│ Doorway Coverage ('ALL')             │ ${resReal.parsedDoorway} / 1715 (${resReal.coverageDoorwayPct}%)   │ ${resOracle.parsedDoorway} / 1715 (${resOracle.coverageDoorwayPct}%)   │`);
console.log(`│ Doorway Absolute Gain                │ +${resReal.parsedDoorway - resReal.parsedClausal} (+${(resReal.coverageDoorwayPct - resReal.coverageClausalPct).toFixed(2)}%)            │ +${resOracle.parsedDoorway - resOracle.parsedClausal} (+${(resOracle.coverageDoorwayPct - resOracle.coverageClausalPct).toFixed(2)}%)            │`);
console.log(`│ Top-1 Gold Head Matches              │ ${resReal.top1Heads} / ${resReal.parsedDoorway} (${resReal.headAccuracyPct}%)   │ ${resOracle.top1Heads} / ${resOracle.parsedDoorway} (${resOracle.headAccuracyPct}%)   │`);
console.log(`│ Gold Answer Containment              │ ${resReal.goldContainment} / ${resReal.parsedDoorway} (${resReal.containmentPct}%)   │ ${resOracle.goldContainment} / ${resOracle.parsedDoorway} (${resOracle.containmentPct}%)   │`);
console.log(`│ Effective Full Corpus Accuracy       │ ${resReal.top1Heads} / 1715 (${resReal.effectiveAccuracyPct}%)    │ ${resOracle.top1Heads} / 1715 (${resOracle.effectiveAccuracyPct}%)    │`);
console.log(`│ Scaffold Memory Dissolution          │ ${resReal.dissolutionRate}% memory reduced     │ ${resOracle.dissolutionRate}% memory reduced     │`);
console.log(`│ Speed & Throughput                   │ ${resReal.throughput} sent/sec (${resReal.ms}ms)│ ${resOracle.throughput} sent/sec (${resOracle.ms}ms)│`);
console.log('└──────────────────────────────────────┴────────────────────────┴────────────────────────┘\n');
