import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { runTreebank } from '../codex/core/constellation/treebank-run.js';
import { BONDS, LIFTS, atomsFor } from '../codex/core/constellation/compose.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';

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
const records = parseConllu(readFileSync(CORPUS, 'utf8')).slice(0, 100); 

// The Receptor for ADJ+S -> S
// A healthy fronted adjective must be at the very start of the sentence (left.from === 0)
function checkReceptor(l, r, result, left, right) {
  if (l === 'ADJ' && r === 'S' && result === 'S') {
    // Only allow if it's the beginning of the sentence
    if (left.from !== 0) {
      return false; // REJECT
    }
  }
  if (l === 'VP' && r === 'INF' && result === 'VP') {
     // A lot of VP+INF->VP are false attachments across the sentence
     // We will leave this one alone for now, or add another rule
  }
  return true; // ACCEPT
}

// We need to inject this receptor into composePacked
function composePackedWithReceptors(tokens, pm, options = {}) {
  // A patched version of composePacked that uses the Receptor
  const n = tokens.length;
  const cell = Array.from({ length: n }, () => Array.from({ length: n }, () => new Map()));
  const atoms = [];
  let events = 0;
  const roots = options.roots || ['S', 'NP', 'VP', 'PP'];
  const bonds = options.bonds || BONDS;

  function closeUnderLifts(nodeMap, from, to) {
    let changed = true;
    while (changed) {
      changed = false;
      const snapshot = [...nodeMap.values()];
      for (const m of snapshot) {
        for (const [source, result] of LIFTS) {
          if (m.type !== source) continue;
          events += 1;
          let liftNode = nodeMap.get(result);
          if (!liftNode) {
            liftNode = { type: result, from, to, derivations: [] };
            nodeMap.set(result, liftNode);
            changed = true;
          }
          if (!liftNode.derivations.some((d) => d.lift && d.child === m)) {
            liftNode.derivations.push({ lift: true, child: m });
            changed = true;
          }
        }
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    for (const a of atomsFor(tokens[i], i, pm, options)) {
      events += 1;
      const atomNode = { type: a, from: i, to: i, derivations: [], token: tokens[i] };
      atoms.push(atomNode);
      cell[i][i].set(a, atomNode);
    }
    closeUnderLifts(cell[i][i], i, i);
  }

  for (let width = 2; width <= n; width += 1) {
    for (let from = 0; from + width - 1 < n; from += 1) {
      const to = from + width - 1;
      for (let split = from; split < to; split += 1) {
        for (const left of cell[from][split].values()) {
          for (const right of cell[split + 1][to].values()) {
            for (const bond of bonds) {
              const [l, r, result] = bond;
              if (left.type !== l || right.type !== r) continue;
              
              events += 1;
              
              // ==========================================
              // ANTIGEN RECEPTOR MEMBRANE INJECTION
              // ==========================================
              if (!checkReceptor(l, r, result, left, right)) {
                continue; // MACROPHAGE PHAGOCYTOSIS (REJECT BOND)
              }

              let parentNode = cell[from][to].get(result);
              if (!parentNode) {
                parentNode = { type: result, from, to, derivations: [] };
                cell[from][to].set(result, parentNode);
              }
              parentNode.derivations.push({ lift: false, left, right, bond });
            }
          }
        }
      }
      closeUnderLifts(cell[from][to], from, to);
    }
  }

  const molecules = Array.from(
    new Set(cell.flatMap((row) => row.flatMap((map) => [...map.values()])))
  );
  const spanning = [...cell[0][n - 1].values()];
  const stable = spanning.filter((m) => roots.includes(m.type));

  return { atoms, molecules, spanning, stable, events, cell };
}

console.log("================ ACTIVE IMMUNITY (MACROPHAGE) ARM ================");
let start = performance.now();

let totalCoverage = 0;
let events = 0;
for (const r of records) {
  const chart = composePackedWithReceptors(r.tokens.map(t=>t.form), posMap, { maxTokens: 40 });
  events += chart.events;
  // Checking coverage
  const goldChart = composePacked(r.tokens.map(t=>t.form), new Map(r.tokens.map(t=>[t.form.toLowerCase(), [t.upos === 'NOUN' ? 'n' : t.upos === 'VERB' ? 'v' : t.upos === 'ADJ' ? 'a' : t.upos === 'ADV' ? 'r' : 'x']])));
  // We can just rely on the existing runTreebank for coverage by monkey-patching composePacked?
}
let elapsed = performance.now() - start;
console.log(`Receptor Parsed in: ${elapsed.toFixed(0)}ms, Events: ${events}`);

