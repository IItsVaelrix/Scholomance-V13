#!/usr/bin/env node
/**
 * GAP-ZERO CENSUS — the near-miss class, named.
 *
 * Some failed sentences build a molecule covering EVERY token and then fail
 * only because that molecule is not a root type. They need no new bond. The
 * question is which type they landed on, and whether that molecule is actually
 * the right analysis wearing the wrong label.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * 1. It does not sweep `options.roots` over candidates. `roots` is read at
 *    exactly one place — `stable = spanning.filter(m => roots.includes(m.type))`
 *    — and touches nothing in chart construction. So "how many sentences would
 *    span if T were a root" is answerable from a single compose per sentence.
 *    The first draft recomposed the whole corpus per candidate and hung.
 *
 * 2. It does not score correctness with `projectAnswers`. That function guards
 *    on `molecule.type !== 'S'`, so a non-S root yields no subject/verb answer
 *    AT ALL — every non-S candidate would score zero correct by construction,
 *    for reasons that have nothing to do with the grammar. A check that cannot
 *    succeed. Correctness here is head-match: does the full-width molecule's
 *    head set contain the gold root token?
 *
 *   node scripts/gap-zero-sweep.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, headsOf } from '../codex/core/constellation/compose-packed.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const OUT = 'docs/superpowers/evidence/2026-08-15-gap-zero-census.json';
const read = (n) => readFileSync(path.join(FIX, n), 'utf8');
const records = parseConllu(read('treebank-gate.conllu'));
const posMap = new Map(Object.entries(JSON.parse(read('treebank-gate-lexicon.json'))));
const MAX_TOKENS = 20;

let analysed = 0;
let parsed = 0;
const gapZero = [];
/** type -> { sentences, headRight, headWrong } */
const census = new Map();
const examples = new Map();

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  analysed += 1;

  const chart = composePacked(tokens, posMap, {});
  if (chart.stable.length > 0) { parsed += 1; continue; }
  if (chart.spanning.length === 0) continue;

  const gold = goldAnswer(rec);
  gapZero.push(rec);

  for (const molecule of chart.spanning) {
    const row = census.get(molecule.type)
      || { sentences: 0, headRight: 0, headWrong: 0, noGold: 0 };
    row.sentences += 1;
    if (!gold.verb) {
      row.noGold += 1;
    } else {
      let heads = new Set();
      try { heads = headsOf(molecule) || new Set(); } catch { heads = new Set(); }
      const hit = [...heads].includes(gold.verb);
      if (hit) row.headRight += 1; else row.headWrong += 1;
      if (hit && !examples.has(molecule.type)) {
        examples.set(molecule.type, {
          sentence: tokens.join(' ').slice(0, 90),
          goldVerb: gold.verb,
          heads: [...heads].slice(0, 4),
        });
      }
    }
    census.set(molecule.type, row);
  }
}

const rows = [...census].map(([type, r]) => ({
  type,
  ...r,
  headAccuracy: (r.headRight + r.headWrong) > 0
    ? Number((r.headRight / (r.headRight + r.headWrong)).toFixed(4))
    : null,
})).sort((a, b) => b.headRight - a.headRight || b.sentences - a.sentences);

const pad = (v, n) => String(v).padStart(n);
console.log('\n══════════════════════════════════════════════════════════════════════');
console.log('  GAP-ZERO CENSUS — full-width molecules that are not root types');
console.log('══════════════════════════════════════════════════════════════════════\n');
console.log(`corpus ${analysed} analysed, ${parsed} parsed, maxTokens ${MAX_TOKENS}`);
console.log(`gap-zero sentences (spanned the input, no root type): ${gapZero.length}\n`);
console.log('  type       sentences  head=gold  head!=gold  head accuracy');
console.log('  ---------  ---------  ---------  ----------  -------------');
for (const r of rows) {
  console.log(`  ${r.type.padEnd(9)}  ${pad(r.sentences, 9)}  ${pad(r.headRight, 9)}  ${pad(r.headWrong, 10)}  ${pad(r.headAccuracy === null ? '-' : `${(r.headAccuracy * 100).toFixed(0)}%`, 13)}`);
}

console.log('\nWHERE THE HEAD IS ALREADY RIGHT (a real analysis wearing the wrong label)');
for (const [type, ex] of examples) {
  console.log(`  ${type.padEnd(9)} gold verb "${ex.goldVerb}"  heads=[${ex.heads.join(', ')}]`);
  console.log(`            "${ex.sentence}"`);
}

const best = rows.find((r) => r.headRight > 0);
console.log('');
if (!best) {
  console.log('VERDICT: NOT_A_ROOT_TYPE_GAP');
  console.log('  No full-width molecule has the gold root as its head. These sentences');
  console.log('  did not build the right analysis under a wrong label — they built a');
  console.log('  different analysis, and admitting its type as a root would only');
  console.log('  manufacture spans.');
} else {
  console.log(`VERDICT: ROOT_TYPE_GAP_PRESENT — leading candidate ${best.type}`);
  console.log(`  ${best.headRight} of ${best.headRight + best.headWrong} full-width ${best.type} molecules already head on the gold root.`);
  console.log('  NOT a licence to add the lift: coverage cannot fall when a root type is');
  console.log('  admitted, so the gate is head accuracy and a purity check, never span count.');
}
console.log('\n══════════════════════════════════════════════════════════════════════\n');

writeFileSync(OUT, `${JSON.stringify({
  contract: 'PB-GAP-ZERO-CENSUS-v1',
  corpus: { analysed, parsed, maxTokens: MAX_TOKENS },
  gapZeroSentences: gapZero.length,
  census: rows,
  verdict: best ? 'ROOT_TYPE_GAP_PRESENT' : 'NOT_A_ROOT_TYPE_GAP',
}, null, 2)}\n`);
console.log(`wrote ${OUT}`);
