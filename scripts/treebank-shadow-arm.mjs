import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { BONDS, LIFTS, atomsFor } from '../codex/core/constellation/compose.js';

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
  const senseRows = db.prepare('SELECT lemma_lower, pos, COUNT(*) AS n FROM wordnet_lemma GROUP BY lemma_lower, pos').all();
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

// Target the 19-token hanging sentence
const target = records.find(r => r.text.includes("President Bush on Tuesday nominated"));

if (!target) {
  console.log("Sentence not found");
  process.exit(1);
}

const tokens = target.tokens.map(t => t.form);

// Create gold pos map
const goldPosMap = new Map();
for (const t of target.tokens) {
  goldPosMap.set(t.form.toLowerCase(), [t.upos === 'NOUN' ? 'n' : t.upos === 'VERB' ? 'v' : t.upos === 'ADJ' ? 'a' : t.upos === 'ADV' ? 'r' : 'x']);
}

console.log(`Parsing gold map for "${target.text}"...`);
const goldChart = composePacked(tokens, goldPosMap);
console.log(`Gold events: ${goldChart.events}`);

const goldBonds = new Set();
// For composePacked, we just extract the bonds from the generated derivations
for (const row of goldChart.cell) {
  for (const nodeMap of row) {
    for (const node of nodeMap.values()) {
      for (const d of node.derivations) {
        if (!d.lift) {
          goldBonds.add(`${d.left.type}+${d.right.type}->${node.type}`);
        } else {
          goldBonds.add(`${d.child.type}->${node.type}`);
        }
      }
    }
  }
}
console.log(`Gold bonds used:`, Array.from(goldBonds));

console.log(`\nParsing real map for "${target.text}"... (Expect explosion)`);
const chart = composePacked(tokens, posMap);
console.log(`Real events: ${chart.events}`);

const realBonds = new Map();
for (const row of chart.cell) {
  for (const nodeMap of row) {
    for (const node of nodeMap.values()) {
      for (const d of node.derivations) {
        if (!d.lift) {
          const b = `${d.left.type}+${d.right.type}->${node.type}`;
          realBonds.set(b, (realBonds.get(b) || 0) + 1);
        } else {
          const b = `${d.child.type}->${node.type}`;
          realBonds.set(b, (realBonds.get(b) || 0) + 1);
        }
      }
    }
  }
}

// Find garden paths
const gardenPaths = [];
for (const [bond, count] of realBonds) {
  if (!goldBonds.has(bond)) {
    gardenPaths.push({ bond, count });
  }
}

gardenPaths.sort((a, b) => b.count - a.count);
console.log("\nTop Toxic Garden-Path Bonds (Built in real parse, but NOT in gold derivation):");
for (const gp of gardenPaths.slice(0, 10)) {
  console.log(`${gp.count.toString().padStart(6)} times:  ${gp.bond}`);
}
