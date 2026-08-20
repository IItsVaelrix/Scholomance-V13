#!/usr/bin/env node
/**
 * RESONANCE BEACON — ELECTROMAGNETISM ABLATION, FULL DEV CORPUS
 *
 * The token ablation (WTA vs SUM) tested the solar array on the wrong
 * endpoint. `readingScores`/`consumeArray` never touch `wonCells`, `charge`
 * or `potential`. The array's real consumer is `stampCharges` -> `settle`,
 * whose exclusive one-emitter-one-owner assignment feeds `explained.size`
 * in `organizeDerivation` — a term no scalar can produce.
 *
 * So this measures the DERIVATION arm, and it changes ONE variable:
 *
 *   ORGANIZED  scoreDerivationCandidate default            (ships)
 *   FALLBACK   options.disableElectromagnetism = true      (scalar arm,
 *              the branch already written for no-verb-atom)
 *   FIRST      chart order (incumbent baseline)
 *   RANDOM     uniform over distinct answers, averaged over seeds
 *
 * Corpus is the FULL UD English-EWT dev set rather than the 500-sentence
 * gate slice, because n=26 ambiguous left BEACON-vs-FIRST at p=0.125 with
 * 6 wins and 1 loss — underpowered, not refuted. The LEXICON stays the
 * frozen gate lexicon, so corpus size is the only thing that moved.
 *
 *   node scripts/resonance-beacon-em-ablation.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { BONDS } from '../codex/core/constellation/compose.js';
import {
  pickResonantAnswer,
  pickResonantDerivation,
} from '../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const CORPUS = path.resolve('cache/ud/en_ewt-ud-dev.conllu');
const OUT = 'docs/superpowers/evidence/2026-08-14-resonance-beacon-em-ablation.json';
const RANDOM_SEEDS = 200;
const MAX_TOKENS = 20;

const same = (a, b) => (
  String(a?.subject || '').toLowerCase() === String(b?.subject || '').toLowerCase()
  && String(a?.verb || '').toLowerCase() === String(b?.verb || '').toLowerCase()
);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const logFact = (m) => { let x = 0; for (let i = 2; i <= m; i += 1) x += Math.log(i); return x; };
function signTest(b, c) {
  const n = b + c;
  if (n === 0) return { n: 0, p: 1 };
  const k = Math.min(b, c);
  const lf = logFact(n);
  let tail = 0;
  for (let i = 0; i <= k; i += 1) {
    tail += Math.exp(lf - logFact(i) - logFact(n - i) + n * Math.log(0.5));
  }
  return { n, p: Math.min(1, 2 * tail) };
}

const records = parseConllu(readFileSync(CORPUS, 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));

const arms = { FIRST: [], ORGANIZED: [], FALLBACK: [], RANDOM: [] };
let sentences = 0, parsed = 0, contained = 0, threw = 0, skipped = 0, ambiguous = 0;

for (const record of records) {
  const tokens = record.tokens.map((t) => t.form);
  if (tokens.length > MAX_TOKENS) { skipped += 1; continue; }
  sentences += 1;
  let chart;
  try { chart = composePacked(tokens, posMap); } catch { threw += 1; continue; }
  if (chart.stable.length === 0) continue;
  parsed += 1;

  const gold = goldAnswer(record);
  const allAnswers = chart.stable.map((n) => projectAnswers(n)).flat();
  if (allAnswers.length === 0) continue;
  if (allAnswers.some((a) => same(a, gold))) contained += 1;

  const uniq = [...new Map(
    allAnswers.map((a) => [`${a.subject ?? ''}|${a.verb ?? ''}`, a]),
  ).values()];
  if (uniq.length <= 1) continue;
  ambiguous += 1;

  const first = allAnswers[0];
  const byString = pickResonantAnswer(allAnswers, chart.field, BONDS) || first;

  const pick = (options) => {
    const d = chart.stable[0]
      ? pickResonantDerivation(chart.stable[0], chart.field, BONDS, options)
      : null;
    return d ? d.answer : byString;
  };

  let rWins = 0;
  for (let s = 0; s < RANDOM_SEEDS; s += 1) {
    const r = rng(0x9e37 + s * 7919 + sentences);
    if (same(uniq[Math.floor(r() * uniq.length)], gold)) rWins += 1;
  }

  arms.FIRST.push(same(first, gold) ? 1 : 0);
  arms.ORGANIZED.push(same(pick({}), gold) ? 1 : 0);
  arms.FALLBACK.push(same(pick({ disableElectromagnetism: true }), gold) ? 1 : 0);
  arms.RANDOM.push(rWins / RANDOM_SEEDS);
}

function compare(base, arm, label) {
  let b = 0, c = 0, hb = 0, ha = 0;
  for (let i = 0; i < base.length; i += 1) {
    hb += base[i]; ha += arm[i];
    if (base[i] === 1 && arm[i] === 0) b += 1;
    if (base[i] === 0 && arm[i] === 1) c += 1;
  }
  const st = signTest(b, c);
  return {
    label, n: base.length,
    baseHits: +hb.toFixed(2), armHits: +ha.toFixed(2), net: +(ha - hb).toFixed(2),
    wins: c, losses: b, discordant: st.n, p: +st.p.toFixed(5),
  };
}

const report = {
  contract: 'PB-RESONANCE-BEACON-EM-ABLATION-v1',
  corpus: 'UD English-EWT dev (full), frozen gate lexicon',
  sample: { sentences, skipped, threw, parsed, contained, ambiguous },
  comparisons: [
    compare(arms.FIRST, arms.ORGANIZED, 'ORGANIZED vs FIRST'),
    compare(arms.FIRST, arms.FALLBACK, 'FALLBACK  vs FIRST'),
    compare(arms.FIRST, arms.RANDOM, 'RANDOM    vs FIRST'),
    compare(arms.FALLBACK, arms.ORGANIZED, 'ORGANIZED vs FALLBACK'),
  ],
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const row = (r) => `  ${r.label.padEnd(22)} n=${String(r.n).padStart(4)}  ` +
  `hits ${String(r.baseHits).padStart(7)} -> ${String(r.armHits).padStart(7)}  ` +
  `net ${String(r.net).padStart(7)}  wins=${String(r.wins).padStart(3)} losses=${String(r.losses).padStart(3)}  p=${r.p}`;

console.log('='.repeat(96));
console.log('RESONANCE BEACON — ELECTROMAGNETISM ABLATION (full EWT dev, frozen gate lexicon)');
console.log(`${sentences} analysed / ${parsed} parsed / ${contained} contained / ${ambiguous} ambiguous / threw ${threw}`);
console.log('='.repeat(96));
for (const r of report.comparisons) console.log(row(r));
console.log('\n  RANDOM wins/losses are not meaningful (per-item value is a seed average); read armHits.');
console.log(`\nwrote ${OUT}`);
