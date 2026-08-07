#!/usr/bin/env node
/**
 * SEMANTIC CHANNEL COMPARISON — the three measures side by side
 *
 * Runs the same word pairs through semantotopography (the morphology map),
 * WordNet graph distance (structure), and corpus PPMI (company), so a claim
 * about any of them can be checked rather than asserted.
 *
 * The baselines this exists to hold to account, all measured earlier:
 *   - semantotopography: 7,161 addresses for 84,677 lemmas; cos(shadowy, radiant) = 1.0000
 *   - wordnet: nouns 100% / verbs 99.3% / adjectives 0.7% pair coverage
 *
 * Usage: node scripts/measure-semantic-channels.mjs [corpus.sqlite]
 */

import { loadWordnetGraph } from '../codex/server/adapters/wordnetGraph.sqlite.adapter.js';
import { createCorpusVectors } from '../codex/server/adapters/corpusVectors.sqlite.adapter.js';
import { wordnetSimilarity } from '../codex/core/semantic/wordnet-distance.js';
import { corpusSimilarity, combineVerdicts } from '../codex/core/semantic/corpus-distance.js';
import { semanticTopographicSimilarity } from '../codex/core/semantic/semantotopography.js';

const corpusPath = process.argv[2] || 'adjective_corpus.sqlite';
const graph = loadWordnetGraph('scholomance_dict.sqlite');
const vectors = createCorpusVectors(corpusPath);
console.log('corpus:', JSON.stringify(vectors.stats()), '\n');

const fmt = (v) => (v === null || v === undefined ? '  null' : v.toFixed(4));

/**
 * Pairs with a known answer, so the table can be read as right/wrong rather
 * than merely different. NEAR pairs should score high, FAR pairs low.
 */
const CASES = [
  ['shadowy', 'murky', 'NEAR'],
  ['shadowy', 'dusky', 'NEAR'],
  ['shadowy', 'gloomy', 'NEAR'],
  ['shadowy', 'shaded', 'NEAR'],
  ['shadowy', 'dim', 'NEAR'],
  ['shadowy', 'radiant', 'FAR'],
  ['shadowy', 'luminous', 'FAR'],
  ['shadowy', 'bright', 'FAR'],
  ['shadowy', 'granite', 'FAR'],
  ['shadowy', 'loud', 'FAR'],
  ['bright', 'radiant', 'NEAR'],
  ['bright', 'luminous', 'NEAR'],
  ['pale', 'wan', 'NEAR'],
  ['pale', 'sallow', 'NEAR'],
  ['pale', 'crimson', 'FAR'],
  ['fierce', 'savage', 'NEAR'],
  ['fierce', 'gentle', 'FAR'],
  ['ancient', 'old', 'NEAR'],
  ['ancient', 'modern', 'FAR'],
  ['silent', 'quiet', 'NEAR'],
  ['silent', 'loud', 'FAR'],
];

console.log('pair                     truth   semantotopo   wordnet   corpus   combined');
const acc = { semanto: { hit: 0, n: 0 }, wordnet: { hit: 0, n: 0 }, corpus: { hit: 0, n: 0 }, combined: { hit: 0, n: 0 } };

for (const [a, b, truth] of CASES) {
  const s = semanticTopographicSimilarity(a, b);
  const w = wordnetSimilarity(graph, a, b).similarity;
  const c = corpusSimilarity(vectors, a, b).similarity;
  const comb = combineVerdicts(wordnetSimilarity(graph, a, b), corpusSimilarity(vectors, a, b)).similarity;

  console.log(
    `${(a + ' / ' + b).padEnd(24)} ${truth.padEnd(6)} ${fmt(s).padStart(9)} ${fmt(w).padStart(11)} ${fmt(c).padStart(8)} ${fmt(comb).padStart(9)}`,
  );
  for (const [k, v] of [['semanto', s], ['wordnet', w], ['corpus', c], ['combined', comb]]) {
    if (v === null || v === undefined) continue;
    acc[k].n += 1;
  }
}

/**
 * Separation, not accuracy: does the channel put NEAR pairs above FAR pairs?
 * Reported as mean(NEAR) − mean(FAR) over the pairs each channel could answer,
 * plus how many of the 21 it answered at all. A channel that answers three
 * pairs perfectly has not beaten one that answers twenty well.
 */
function separation(fn) {
  const near = [];
  const far = [];
  for (const [a, b, truth] of CASES) {
    const v = fn(a, b);
    if (v === null || v === undefined) continue;
    (truth === 'NEAR' ? near : far).push(v);
  }
  if (!near.length || !far.length) return { sep: null, answered: near.length + far.length };
  const mean = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
  return { sep: mean(near) - mean(far), answered: near.length + far.length };
}

console.log('\nSEPARATION  = mean(NEAR) − mean(FAR).  Higher is better; 0 means blind.');
for (const [label, fn] of [
  ['semantotopography', (a, b) => semanticTopographicSimilarity(a, b)],
  ['wordnet          ', (a, b) => wordnetSimilarity(graph, a, b).similarity],
  ['corpus           ', (a, b) => corpusSimilarity(vectors, a, b).similarity],
  ['combined         ', (a, b) => combineVerdicts(wordnetSimilarity(graph, a, b), corpusSimilarity(vectors, a, b)).similarity],
]) {
  const { sep, answered } = separation(fn);
  console.log(`  ${label}  separation=${sep === null ? '  n/a' : sep.toFixed(4).padStart(7)}   answered ${answered}/${CASES.length}`);
}
