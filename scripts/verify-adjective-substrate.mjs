#!/usr/bin/env node
/**
 * SUBSTRATE VERIFICATION — through the real production path, not a harness
 *
 * The substrate's headline numbers were first measured on RAW cosines in a
 * standalone script. Production does not see raw cosines: cosineSparse clamps
 * to [0,1] and abstains below MIN_SHARED_CONTEXTS. A number measured outside
 * the code that will serve it is a number about something else.
 *
 * So this runs the labelled pairs through exactly what production calls:
 * createAdjectiveSubstrate -> corpusSimilarity -> (optional antonym veto),
 * beside loadWordnetGraph -> wordnetSimilarity, which is what is live today.
 *
 * Usage: node scripts/verify-adjective-substrate.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAdjectiveSubstrate } from '../codex/server/adapters/adjectiveSubstrate.adapter.js';
import { loadWordnetGraph } from '../codex/server/adapters/wordnetGraph.sqlite.adapter.js';
import { wordnetSimilarity } from '../codex/core/semantic/wordnet-distance.js';
import { corpusSimilarity } from '../codex/core/semantic/corpus-distance.js';

const PAIRS = JSON.parse(readFileSync(join('tests', 'fixtures', 'adjective-pairs.json'), 'utf8'));
const substrate = createAdjectiveSubstrate({ dir: join('public', 'substrate') });
if (!substrate.available) {
  console.error(`substrate unavailable: ${substrate.reason}`);
  process.exit(1);
}
console.log('substrate:', JSON.stringify(substrate.stats()));
const graph = loadWordnetGraph('scholomance_dict.sqlite');
console.log('wordnet available:', graph?.stats?.available, '\n');

const wn = (a, b) => {
  const r = wordnetSimilarity(graph, a, b);
  return typeof r === 'number' ? r : (r?.similarity ?? null);
};
const corpus = (a, b) => corpusSimilarity(substrate, a, b).similarity;

/**
 * The shipping merge. Corpus answers wherever it can — it is the wider and
 * sharper signal — and WordNet's typed antonym edge subtracts, because a
 * distributional cosine rates opposites as SIMILAR and cannot be argued out
 * of it. WordNet fills in where the corpus has no vocabulary.
 */
const ANTONYM_VETO = 0.5;
function merged(a, b) {
  const c = corpus(a, b);
  if (c === null) return wn(a, b);
  return c - ANTONYM_VETO * substrate.antonymCharge(a, b);
}

const arms = {
  'PRODUCTION (wordnet)': wn,
  'substrate only': corpus,
  'substrate + veto': merged,
};

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
function auc(pos, neg) {
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : (p === q ? 0.5 : 0);
  return +(wins / (pos.length * neg.length)).toFixed(3);
}

const rows = {};
console.log('arm                    coverage    n    SYN      UNREL    ANTO     AUC(SYN>UNREL)  AUC(SYN>ANTO)');
for (const [name, fn] of Object.entries(arms)) {
  const buckets = { SYNONYM: [], UNRELATED: [], ANTONYM: [] };
  let answered = 0;
  for (const [a, b, type] of PAIRS.pairs) {
    let v = null;
    try { v = fn(a, b); } catch { v = null; }
    if (v !== null && Number.isFinite(v)) { answered += 1; buckets[type].push(v); }
  }
  const r = {
    coverage: +(answered / PAIRS.pairs.length * 100).toFixed(1),
    answered,
    syn: mean(buckets.SYNONYM), unrel: mean(buckets.UNRELATED), anto: mean(buckets.ANTONYM),
    aucSynUnrel: auc(buckets.SYNONYM, buckets.UNRELATED),
    aucSynAnto: auc(buckets.SYNONYM, buckets.ANTONYM),
  };
  rows[name] = r;
  const f = (x) => (x === null ? 'null' : x.toFixed(4));
  console.log(
    `${name.padEnd(22)} ${String(r.coverage).padStart(6)}%  ${String(r.answered).padStart(4)}  `
    + `${f(r.syn).padStart(7)}  ${f(r.unrel).padStart(7)}  ${f(r.anto).padStart(7)}  `
    + `${String(r.aucSynUnrel).padStart(14)}  ${String(r.aucSynAnto).padStart(13)}`,
  );
}
console.log('\nAUC 0.5 = chance, 1.0 = perfect. Labels are independent of both PPMI and WordNet.');
