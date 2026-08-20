/**
 * FORENSIC DISSECTION OF THE 18 TRUE POLYSEMY-COLLAPSE SENTENCES
 *
 * 1. Isolates the 18 sentences where the Gold POS tag is 100% present in SQLite,
 *    yet adding dictionary distractors causes the parse to disappear.
 *
 * 2. Isolates the exact "81 -> 82 Resurrection" sentence (Lexical Non-Monotonicity).
 *
 * 3. Runs Single-Sense Lexical Interference Assay:
 *    I(g, d) = Outcome(g) - Outcome(g + d)
 *    Classifies: Single-Sense Toxic Switch vs. Multi-Body Pairwise Trap.
 *
 * 4. Normalizes distractor transitions by token events AND sentence frequencies.
 *
 * Run with:
 *   node scripts/polysemy-18-forensics.mjs
 */

import { readFileSync } from 'node:fs';
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
console.log('  FORENSIC DISSECTION OF THE 18 TRUE POLYSEMY-COLLAPSE CASES');
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

// 1. Identify the 18 True Polysemy Collapse Sentences (Gold 100% Present in SQLite)
const truePolysemyCases = [];

for (const item of testSentences) {
  const chartReal = composePacked(item.tokens, realDict, { roots: ROOT_DOORWAY.ALL });
  const chartOracle = composePacked(item.tokens, item.oracleMap, { roots: ROOT_DOORWAY.ALL });

  const parsedReal = chartReal.stable.length > 0;
  const parsedOracle = chartOracle.stable.length > 0;

  if (!parsedReal && parsedOracle) {
    // Check if gold tag is strictly present for all tokens
    let allGoldPresent = true;
    for (const token of item.rec.tokens) {
      const form = String(token.form).toLowerCase();
      const goldTags = item.oracleMap.get(form) || [];
      const dictTags = realDict.get(form) || [];
      if (goldTags.some((t) => !dictTags.includes(t))) {
        allGoldPresent = false;
        break;
      }
    }
    if (allGoldPresent) {
      truePolysemyCases.push(item);
    }
  }
}

console.log(`Isolated exactly ${truePolysemyCases.length} True Polysemy-Collapse Sentences.\n`);

// ── AUDIT 1: CONTROLLED PRESSURE SURVIVAL ON THE 18 CASES ───────────────────
console.log('1. CONTROLLED POLYSEMY PRESSURE ON THE 18 PURE COLLAPSE CASES:');

const K_VALUES = [0, 1, 2, 3, 4, 8, Infinity];
console.log('┌─────────────────────────────┬──────────────┬──────────────────┬──────────────┬──────────────┐');
console.log('│ Distractor Level            │ Parsed Roots │ Survival Rate P  │ Gold Contain │ Mean Nodes   │');
console.log('├─────────────────────────────┼──────────────┼──────────────────┼──────────────┼──────────────┤');

for (const k of K_VALUES) {
  let parsed = 0;
  let containment = 0;
  let totalNodes = 0;

  for (const item of truePolysemyCases) {
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

  const label = k === Infinity ? 'Full Real Tagset (All Senses)' : `Gold + ${k} Distractors`;
  const survivalRate = ((parsed / truePolysemyCases.length) * 100).toFixed(1) + '%';
  const containRate = ((containment / truePolysemyCases.length) * 100).toFixed(1) + '%';
  const meanNodes = (totalNodes / truePolysemyCases.length).toFixed(1);

  console.log(`│ ${label.padEnd(27)} │ ${String(parsed).padEnd(12)} │ ${survivalRate.padEnd(16)} │ ${containRate.padEnd(12)} │ ${meanNodes.padEnd(12)} │`);
}
console.log('└─────────────────────────────┴──────────────┴──────────────────┴──────────────┴──────────────┘\n');

// ── AUDIT 2: SINGLE-SENSE INTERFERENCE ASSAY: I(g, d) ────────────────────────
console.log('2. SINGLE-SENSE LEXICAL INTERFERENCE ASSAY (THE 18 SWITCHES):');

const toxicDistractors = [];
const sentenceLevelInterference = [];

const distractorSentenceHits = new Map();
const distractorTokenHits = new Map();

for (let idx = 0; idx < truePolysemyCases.length; idx += 1) {
  const item = truePolysemyCases[idx];
  const goldChart = composePacked(item.tokens, item.oracleMap, { roots: ROOT_DOORWAY.ALL });

  // List all possible individual (word, distractorTag) injections
  const candidateSwitches = [];
  for (const [word, goldTags] of item.oracleMap.entries()) {
    const dictTags = realDict.get(word) || [];
    const distractors = dictTags.filter((t) => !goldTags.includes(t));
    for (const d of distractors) {
      candidateSwitches.push({ word, goldTags, distractor: d });
    }
  }

  // Test each distractor tag individually: I(g, d)
  const singleToxic = [];
  for (const sw of candidateSwitches) {
    const testMap = new Map();
    for (const [w, g] of item.oracleMap.entries()) {
      if (w === sw.word) {
        testMap.set(w, [...g, sw.distractor]);
      } else {
        testMap.set(w, [...g]);
      }
    }
    const testChart = composePacked(item.tokens, testMap, { roots: ROOT_DOORWAY.ALL });
    if (testChart.stable.length === 0) {
      singleToxic.push(sw);
      const pair = `${sw.goldTags.join('/')} -> ${sw.distractor}`;
      distractorTokenHits.set(pair, (distractorTokenHits.get(pair) || 0) + 1);
    }
  }

  // Record sentence-level hits
  const seenPairsInSent = new Set(singleToxic.map((s) => `${s.goldTags.join('/')} -> ${s.distractor}`));
  for (const pair of seenPairsInSent) {
    distractorSentenceHits.set(pair, (distractorSentenceHits.get(pair) || 0) + 1);
  }

  sentenceLevelInterference.push({
    id: idx + 1,
    text: item.tokens.join(' '),
    candidateSwitchesCount: candidateSwitches.length,
    singleToxic,
    isSingleToxic: singleToxic.length > 0,
  });
}

console.log(`\nCLASSIFICATION OF THE 18 POLYSEMY COLLAPSES:`);
const singleToxicCount = sentenceLevelInterference.filter((s) => s.isSingleToxic).length;
const multiBodyCount = sentenceLevelInterference.length - singleToxicCount;
console.log(`  • Single-Sense Toxic Switch (1 extra tag kills root alone) : ${singleToxicCount} / 18 (${((singleToxicCount/18)*100).toFixed(1)}%)`);
console.log(`  • Multi-Body / Pairwise Trap (Requires 2+ distractors)     : ${multiBodyCount} / 18 (${((multiBodyCount/18)*100).toFixed(1)}%)\n`);

console.log('DISTRACTOR TOXICITY SUMMARY (NORMALIZED BY SENTENCE & TOKEN):');
console.log('┌──────────────────────┬──────────────────────┬──────────────────────┐');
console.log('│ Distractor Shift     │ Sentences Affected   │ Token Event Hits     │');
console.log('├──────────────────────┼──────────────────────┼──────────────────────┤');
for (const [pair, sentCount] of [...distractorSentenceHits.entries()].sort((a, b) => b[1] - a[1])) {
  const tokenCount = distractorTokenHits.get(pair) || 0;
  console.log(`│ ${pair.padEnd(20)} │ ${String(sentCount).padEnd(20)} │ ${String(tokenCount).padEnd(20)} │`);
}
console.log('└──────────────────────┴──────────────────────┴──────────────────────┘\n');

// ── AUDIT 3: ISOLATING THE 81 -> 82 RESURRECTION SENTENCE ───────────────────
console.log('3. ISOLATING THE LEXICAL RESURRECTION / NON-MONOTONICITY CASE:');

for (const item of testSentences) {
  const map0 = item.oracleMap;

  // k = 1
  const map1 = new Map();
  for (const [w, g] of item.oracleMap.entries()) {
    const dt = realDict.get(w) || [];
    const extra = dt.filter((t) => !g.includes(t));
    map1.set(w, [...g, ...extra.slice(0, 1)]);
  }

  // k = 2
  const map2 = new Map();
  for (const [w, g] of item.oracleMap.entries()) {
    const dt = realDict.get(w) || [];
    const extra = dt.filter((t) => !g.includes(t));
    map2.set(w, [...g, ...extra.slice(0, 2)]);
  }

  const c0 = composePacked(item.tokens, map0, { roots: ROOT_DOORWAY.ALL });
  const c1 = composePacked(item.tokens, map1, { roots: ROOT_DOORWAY.ALL });
  const c2 = composePacked(item.tokens, map2, { roots: ROOT_DOORWAY.ALL });

  if (c0.stable.length > 0 && c1.stable.length === 0 && c2.stable.length > 0) {
    console.log(`\nFOUND RESURRECTION CASE:`);
    console.log(`  Sentence: "${item.tokens.join(' ')}"`);
    console.log(`  k=0 (Gold only)      : PARSED (${c0.stable.length} roots, ${c0.molecules.length} nodes)`);
    console.log(`  k=1 (+1 Distractor)  : FAILED (0 roots, ${c1.molecules.length} nodes)`);
    console.log(`  k=2 (+2 Distractors) : RESURRECTED (${c2.stable.length} roots, ${c2.molecules.length} nodes)`);

    console.log('\n  Lexical Maps:');
    for (const token of item.rec.tokens) {
      const form = String(token.form).toLowerCase();
      console.log(`    Token "${token.form}": Gold=[${map0.get(form)}], k=1=[${map1.get(form)}], k=2=[${map2.get(form)}]`);
    }
  }
}
