#!/usr/bin/env node
/**
 * COUPLING LEDGER — dark-token report.
 *
 * `photosynthesize` used to drop every non-coupling on the floor. With
 * `options.ledger` the chart now carries them, so "which token couples to
 * nothing here" is answerable.
 *
 * The question this asks: does darkness predict parse failure? That is the
 * next tier past the atomless-token census — a token with atoms but with no
 * reading that bonds with any neighbour.
 *
 *   node scripts/coupling-ledger-report.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const read = (n) => readFileSync(path.join(FIX, n), 'utf8');
const records = parseConllu(read('treebank-gate.conllu'));
const posMap = new Map(Object.entries(JSON.parse(read('treebank-gate-lexicon.json'))));
const MAX = JSON.parse(read('treebank-gate-baseline.json')).run.maxTokens;

let analysed = 0, totalNon = 0, totalTokens = 0, darkTokens = 0;
let parsedWithDark = 0, sentWithDark = 0, parsedNoDark = 0, sentNoDark = 0;
const darkByUpos = new Map();
const darkForms = new Map();
const orderCount = new Map();
const isolation = [];      // per token: share of its partners it failed with
const examples = [];

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > MAX) continue;
  let chart;
  try { chart = composePacked(tokens, posMap, { ledger: true }); } catch { continue; }
  analysed += 1;

  for (const row of chart.couplings) {
    totalNon += 1;
    orderCount.set(row.order, (orderCount.get(row.order) || 0) + 1);
  }

  // A slot is DARK when no reading of it reacted to anything.
  const dark = [];
  for (let i = 0; i < chart.field.length; i += 1) {
    const slot = chart.field[i];
    const atoms = slot.atoms || [];
    if (atoms.length === 0) continue;
    totalTokens += 1;
    const reacted = atoms.some((a) => (a.ingested?.reactions?.length || 0) > 0);
    // failed pairings involving this slot as receiver, over its readings
    const failed = chart.couplings.filter((c) => c.receiverFrom === i).length;
    const partners = Math.max(1, (chart.field.length - 1) * atoms.length);
    isolation.push(failed / partners);
    if (!reacted) {
      dark.push(i);
      darkTokens += 1;
      const upos = rec.tokens[i]?.upos || '?';
      darkByUpos.set(upos, (darkByUpos.get(upos) || 0) + 1);
      const form = String(tokens[i]).toLowerCase();
      darkForms.set(form, (darkForms.get(form) || 0) + 1);
    }
  }

  const parsed = chart.stable.length > 0;
  if (dark.length > 0) {
    sentWithDark += 1;
    if (parsed) parsedWithDark += 1;
    if (examples.length < 6) {
      examples.push(`${parsed ? 'PARSED ' : 'FAILED '} dark=[${dark.map((i) => tokens[i]).join(', ')}]  "${rec.text.slice(0, 54)}"`);
    }
  } else {
    sentNoDark += 1;
    if (parsed) parsedNoDark += 1;
  }
}

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const pad = (s, w) => String(s).padEnd(w);

console.log('='.repeat(76));
console.log(`COUPLING LEDGER — gate corpus, ${analysed} sentences`);
console.log('='.repeat(76));
console.log(`\nnon-couplings recorded : ${totalNon}`);
for (const [k, v] of [...orderCount].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(k, 16)} ${v}`);
}
console.log(`\ntokens with atoms      : ${totalTokens}`);
console.log(`DARK tokens (no reading reacted to anything) : ${darkTokens}  (${pct(darkTokens, totalTokens)})`);

console.log('\nDOES DARKNESS PREDICT PARSE FAILURE?');
console.log(`  sentences with >=1 dark token : ${pad(sentWithDark, 5)} parsed ${pad(parsedWithDark, 5)} = ${pct(parsedWithDark, sentWithDark)}`);
console.log(`  sentences with no dark token  : ${pad(sentNoDark, 5)} parsed ${pad(parsedNoDark, 5)} = ${pct(parsedNoDark, sentNoDark)}`);

if (darkByUpos.size) {
  console.log('\nDARK TOKENS BY GOLD UPOS');
  for (const [k, v] of [...darkByUpos].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${pad(k, 10)} ${v}`);
  }
  console.log('\nMOST FREQUENT DARK FORMS');
  for (const [k, v] of [...darkForms].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(`  ${pad(k, 16)} ${v}`);
  }
  console.log('\nEXAMPLES');
  for (const e of examples) console.log(`  ${e}`);
}
