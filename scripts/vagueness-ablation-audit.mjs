/**
 * VAGUENESS & OVER-GENERATION ABLATION AUDIT
 *
 * Measures:
 * 1. `overGenerated`: Sentences that parse under the 351k dictionary BUT FAIL under Gold Oracle UPOS.
 *    (Spanning only because the dictionary is polysemous/vague).
 * 2. `bothFine`: Clean core parses that parse under BOTH real dictionary and gold oracle POS.
 * 3. Exact head accuracy breakdown between Clean Core Parses vs. Vagueness-Inflated Parses.
 *
 * Run on UD English-EWT Test Set (N = 1,715 sentences <= 20 tokens).
 *
 * Run with:
 *   node scripts/vagueness-ablation-audit.mjs
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
console.log('  VAGUENESS & OVER-GENERATION ABLATION AUDIT (UD ENGLISH-EWT TEST SET)');
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

console.log(`Auditing ${testSentences.length} test sentences (<= 20 tokens)...\n`);

let totalBothParsed = 0;
let totalOverGenerated = 0;
let totalOracleOnly = 0;
let totalBothFailed = 0;

let bothParsedHeadCorrect = 0;
let overGeneratedHeadCorrect = 0;
let oracleOnlyHeadCorrect = 0;

for (const item of testSentences) {
  const chartReal = composePacked(item.tokens, realDict, { roots: ROOT_DOORWAY.ALL });
  const chartOracle = composePacked(item.tokens, item.oracleMap, { roots: ROOT_DOORWAY.ALL });

  const parsedReal = chartReal.stable.length > 0;
  const parsedOracle = chartOracle.stable.length > 0;

  const ansReal = parsedReal ? chartReal.stable.flatMap((s) => projectAnswers(s)) : [];
  const ansOracle = parsedOracle ? chartOracle.stable.flatMap((s) => projectAnswers(s)) : [];

  const realHeadCorrect = ansReal[0]?.verb === item.gold.verb;
  const oracleHeadCorrect = ansOracle[0]?.verb === item.gold.verb;

  if (parsedReal && parsedOracle) {
    totalBothParsed += 1;
    if (realHeadCorrect) bothParsedHeadCorrect += 1;
  } else if (parsedReal && !parsedOracle) {
    totalOverGenerated += 1;
    if (realHeadCorrect) overGeneratedHeadCorrect += 1;
  } else if (!parsedReal && parsedOracle) {
    totalOracleOnly += 1;
    if (oracleHeadCorrect) oracleOnlyHeadCorrect += 1;
  } else {
    totalBothFailed += 1;
  }
}

console.log('─── ABLATION BREAKDOWN ───────────────────────────────────────────────────────────────────');
console.log(`  1. Clean Core Parses (Parsed in BOTH Real & Oracle)  : ${totalBothParsed} sentences`);
console.log(`     • Top-1 Head Accuracy in Core                     : ${bothParsedHeadCorrect}/${totalBothParsed} (${((bothParsedHeadCorrect/totalBothParsed)*100).toFixed(2)}%)`);
console.log(`\n  2. Over-Generated (Parsed ONLY due to Vagueness/Noise): ${totalOverGenerated} sentences`);
console.log(`     • Top-1 Head Accuracy in Over-Generated           : ${overGeneratedHeadCorrect}/${totalOverGenerated} (${((overGeneratedHeadCorrect/totalOverGenerated)*100).toFixed(2)}%)`);
console.log(`\n  3. Oracle Only (Failed in Real Dict due to Polysemy): ${totalOracleOnly} sentences`);
console.log(`     • Top-1 Head Accuracy when Oracle isolated        : ${oracleOnlyHeadCorrect}/${totalOracleOnly} (${((oracleOnlyHeadCorrect/totalOracleOnly)*100).toFixed(2)}%)`);
console.log(`\n  4. Both Failed (Uncovered by Grammar in Either Mode) : ${totalBothFailed} sentences\n`);

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  SUMMARY TABLE');
console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('┌──────────────────────────────────────────────────┬──────────┬─────────────┬─────────────┐');
console.log('│ Category                                         │ Count    │ % of Test   │ Head Acc %  │');
console.log('├──────────────────────────────────────────────────┼──────────┼─────────────┼─────────────┤');
console.log(`│ Clean Core (Genuine Parses in Both)              │ ${String(totalBothParsed).padEnd(8)} │ ${((totalBothParsed/testSentences.length)*100).toFixed(2)}%      │ ${((bothParsedHeadCorrect/totalBothParsed)*100).toFixed(2)}%      │`);
console.log(`│ Over-Generated (Spurious Vagueness Inflation)    │ ${String(totalOverGenerated).padEnd(8)} │ ${((totalOverGenerated/testSentences.length)*100).toFixed(2)}%      │ ${((overGeneratedHeadCorrect/totalOverGenerated)*100).toFixed(2)}%      │`);
console.log(`│ Total Real Dictionary Parses                     │ ${String(totalBothParsed + totalOverGenerated).padEnd(8)} │ ${(((totalBothParsed + totalOverGenerated)/testSentences.length)*100).toFixed(2)}%      │ ${(((bothParsedHeadCorrect + overGeneratedHeadCorrect)/(totalBothParsed + totalOverGenerated))*100).toFixed(2)}%      │`);
console.log(`│ Gold Oracle Upper Bound Parses                   │ ${String(totalBothParsed + totalOracleOnly).padEnd(8)} │ ${(((totalBothParsed + totalOracleOnly)/testSentences.length)*100).toFixed(2)}%      │ ${(((bothParsedHeadCorrect + oracleOnlyHeadCorrect)/(totalBothParsed + totalOracleOnly))*100).toFixed(2)}%      │`);
console.log('└──────────────────────────────────────────────────┴──────────┴─────────────┴─────────────┘\n');
