import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';
import { BONDS } from '../codex/core/constellation/compose.js';

const CORPUS = path.resolve(`cache/ud/en_ewt-ud-dev.conllu`);
const DICT = path.resolve('scholomance_dict.sqlite');

const LEMMA_POS = new Map([
  ['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r'],
]);

function loadLexicon() {
  if (!existsSync(DICT)) return { posMap: new Map(), senseMap: null };
  const db = new Database(DICT, { readonly: true });

  const posTable = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posTable.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); } else posTable.set(r.surface_lower, [tag]);
  }

  const senses = new Map();
  const senseRows = db.prepare(
    'SELECT lemma_lower, pos, COUNT(*) AS n FROM wordnet_lemma GROUP BY lemma_lower, pos',
  ).all();
  for (const r of senseRows) {
    const key = r.pos === 's' ? 'a' : r.pos;
    if (!['n', 'v', 'a', 'r'].includes(key)) continue;
    const entry = senses.get(r.lemma_lower) || {};
    entry[key] = (entry[key] || 0) + r.n;
    senses.set(r.lemma_lower, entry);
  }
  db.close();
  return { posMap: posTable, senseMap: senses.size > 0 ? senses : null };
}

const { posMap, senseMap } = loadLexicon();
const records = parseConllu(readFileSync(CORPUS, 'utf8'));
const sample = records.slice(0, 100); 

// The Antigens (pathogens we discovered)
const pathogens = [
  'ADJ+S->S',
  'NP+PART->NP',
  'V+PP->PART',
  'VP+INF->VP'
];

const immuneBonds = BONDS.filter(b => {
  const sig = `${b[0]}+${b[1]}->${b[2]}`;
  return !pathogens.includes(sig);
});

console.log("================ CONTROL ARM ================");
let start = performance.now();
const baseline = runTreebank({ records: sample, posMap, senseMap, parser: 'packed', maxTokens: 40 });
let elapsed = performance.now() - start;
console.log(`Skipped (> 40 tokens): ${baseline.skippedTooLong}`);
console.log(`Dropped (Hung/Threw): ${baseline.droppedThrew}`);
console.log(`Coverage: ${(baseline.report.coverage * 100).toFixed(1)}%`);
console.log(`Events: ${baseline.report.events}`);
console.log(`Time: ${elapsed.toFixed(0)}ms`);

console.log("\n================ ACTIVE IMMUNITY ARM ================");
start = performance.now();
const active = runTreebank({ records: sample, posMap, senseMap, parser: 'packed', maxTokens: 40, options: { bonds: immuneBonds } });
elapsed = performance.now() - start;
console.log(`Skipped (> 40 tokens): ${active.skippedTooLong}`);
console.log(`Dropped (Hung/Threw): ${active.droppedThrew}`);
console.log(`Coverage: ${(active.report.coverage * 100).toFixed(1)}%`);
console.log(`Events: ${active.report.events}`);
console.log(`Time: ${elapsed.toFixed(0)}ms`);
