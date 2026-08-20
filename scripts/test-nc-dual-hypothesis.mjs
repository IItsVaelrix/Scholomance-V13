/**
 * TESTING THE NC ATOM HYPOTHESIS ON THE 18 CASES
 *
 * Verifies whether the 18 true polysemy collapses were caused by
 * `compose.js` stripping `NC` from dual n+v words:
 *
 *   if (tags.includes('n') && !closedForContent && !AUXILIARY_VERBS.has(lower)) {
 *     if (tags.includes('v')) out.push('N'); // <-- STRIPPED NC!
 *     else out.push('NC');
 *   }
 *
 * Run with:
 *   node scripts/test-nc-dual-hypothesis.mjs
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
console.log('  TESTING THE NC DUAL EMISSION HYPOTHESIS ON THE 18 CASES');
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

// Isolate the 18 True Polysemy Cases
const truePolysemyCases = [];

for (const item of testSentences) {
  const chartReal = composePacked(item.tokens, realDict, { roots: ROOT_DOORWAY.ALL });
  const chartOracle = composePacked(item.tokens, item.oracleMap, { roots: ROOT_DOORWAY.ALL });

  if (chartReal.stable.length === 0 && chartOracle.stable.length > 0) {
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
    if (allGoldPresent) truePolysemyCases.push(item);
  }
}

console.log(`Auditing ${truePolysemyCases.length} True Polysemy Cases...\n`);

// In the standard composePacked, dual n+v words don't emit NC.
// Let's test custom atoms or check the exact mechanism!
for (let idx = 0; idx < truePolysemyCases.length; idx += 1) {
  const item = truePolysemyCases[idx];
  console.log(`Case #${idx + 1}: "${item.tokens.join(' ')}"`);
  for (const t of item.rec.tokens) {
    const form = String(t.form).toLowerCase();
    const g = item.oracleMap.get(form) || [];
    const d = realDict.get(form) || [];
    if (g.includes('n') && d.includes('v')) {
      console.log(`   Token: "${t.form}" (Gold: [${g}], RealDict: [${d}]) -> Lost NC atom under RealDict!`);
    }
  }
}
