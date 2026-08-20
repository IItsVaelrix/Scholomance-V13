#!/usr/bin/env node
/**
 * REFUSAL LEDGER — corpus report.
 *
 * Reads what the parser refused, straight off `chart.ledger`, with no
 * mechanism-specific replay logic. The aura count here should reproduce the
 * 22 that previously took a bespoke script (parse with the barrier off, then
 * re-run `auraCollision` over every derivation).
 *
 *   node scripts/refusal-ledger-report.mjs
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

const byReason = new Map();
const byReasonSide = new Map();
const byBond = new Map();
const sentencesWith = new Map();
const examples = new Map();
let analysed = 0;
let totalRefusals = 0;

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > MAX) continue;
  let chart;
  try { chart = composePacked(tokens, posMap, { ledger: true }); } catch { continue; }
  analysed += 1;
  const seen = new Set();
  for (const row of chart.ledger) {
    totalRefusals += 1;
    byReason.set(row.reason, (byReason.get(row.reason) || 0) + 1);
    const ks = `${row.reason} [${row.side}]`;
    byReasonSide.set(ks, (byReasonSide.get(ks) || 0) + 1);
    const kb = `${row.reason}  ${row.bond}`;
    byBond.set(kb, (byBond.get(kb) || 0) + 1);
    if (!seen.has(row.reason)) {
      seen.add(row.reason);
      sentencesWith.set(row.reason, (sentencesWith.get(row.reason) || 0) + 1);
      if (!examples.has(row.reason)) examples.set(row.reason, rec.text.slice(0, 72));
    }
  }
}

const pad = (s, w) => String(s).padEnd(w);
console.log('='.repeat(78));
console.log(`REFUSAL LEDGER — gate corpus, ${analysed} sentences, ${totalRefusals} refusals`);
console.log('='.repeat(78));

console.log('\nBY REASON');
for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(reason, 38)} ${String(n).padStart(6)}   in ${sentencesWith.get(reason)} sentences`);
  console.log(`  ${pad('', 38)}          e.g. "${examples.get(reason)}"`);
}

console.log('\nBY REASON x SIDE   (asymmetry between the two admission loops)');
for (const [k, n] of [...byReasonSide].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(k, 46)} ${String(n).padStart(6)}`);
}

console.log('\nTOP REFUSED BONDS');
for (const [k, n] of [...byBond].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${pad(k, 46)} ${String(n).padStart(6)}`);
}
