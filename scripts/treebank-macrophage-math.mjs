import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
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
  db.close();
  return { posMap: posTable, senseMap: null };
}

const { posMap } = loadLexicon();
const records = parseConllu(readFileSync(CORPUS, 'utf8'));

// Target the Bush sentence
const target = records.find(r => r.text.includes("President Bush on Tuesday nominated"));
const tokens = target.tokens.map(t => t.form);

// Run with Macrophage (which is currently active in compose-packed.js)
const chartMacrophage = composePacked(tokens, posMap);
let derivationsMacrophage = 0;
for (const row of chartMacrophage.cell) {
  for (const map of row) {
    for (const node of map.values()) {
      derivationsMacrophage += node.derivations.length;
    }
  }
}

console.log("================ PATHOGEN SUPPRESSION MATH ================");
console.log(`Target: "${target.text}"`);
console.log(`Tokens: ${tokens.length}`);
console.log(`\nMACROPHAGE ARM (Active Immunity):`);
console.log(`Total Derivations (Combinatorial Pressure): ${derivationsMacrophage}`);

const chartBaseline = composePacked(tokens, posMap, { disableMacrophage: true });
let derivationsBaseline = 0;
for (const row of chartBaseline.cell) {
  for (const map of row) {
    for (const node of map.values()) {
      derivationsBaseline += node.derivations.length;
    }
  }
}

console.log(`\nCONTROL ARM (No Immunity - Historical Baseline):`);
console.log(`Total Derivations (Combinatorial Pressure): ${derivationsBaseline}`);

const reduction = derivationsBaseline - derivationsMacrophage;
const percent = ((reduction / derivationsBaseline) * 100).toFixed(1);
console.log(`\nMacrophage suppressed ${reduction} pathological combinatorial states (${percent}% reduction) on this sentence alone!`);
