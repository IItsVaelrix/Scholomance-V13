#!/usr/bin/env node
/**
 * SILENT ATOM SEEDER — do silent atoms point at missing GRAMMAR or missing LEXICON?
 *
 * A silent atom had no licensed bond with any neighbouring atom. Two rival
 * explanations, and they call for opposite repairs:
 *
 *   LEXICAL   the neighbour has no usable atom, so there was nothing to bond
 *             with. The grammar is fine. Repair = add a reading (US -> PROPN,
 *             to -> P u TO).
 *   GRAMMAR   the neighbour is well typed, the pair is real in gold, and no
 *             construction licenses it. Repair = a new bond, screened on the
 *             shuffled-control purity bar before promotion.
 *
 * PREDICTION (declared before the run): mostly LEXICAL. The gold-correct
 * silent readings were DET on `a`, AUX on `are`/`can`, P on `in`, SUB on `as`,
 * TO on `to` — and DET+NC->NP, MODAL+VP->VP, P+NP->PP all already exist.
 *
 *   node scripts/silent-atom-seeder.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const read = (n) => readFileSync(path.join(FIX, n), 'utf8');
const records = parseConllu(read('treebank-gate.conllu'));
const posMap = new Map(Object.entries(JSON.parse(read('treebank-gate-lexicon.json'))));
const MAX = JSON.parse(read('treebank-gate-baseline.json')).run.maxTokens;

/** Lift closure, matching how coupling decides licensing. */
function closure(type) {
  const out = new Set([type]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [src, dst] of LIFTS) {
      if (out.has(src) && !out.has(dst)) { out.add(dst); grew = true; }
    }
  }
  return out;
}
const licensed = (l, r) => {
  for (const a of closure(l)) for (const b of closure(r)) {
    if (BONDS.some((x) => x[0] === a && x[1] === b)) return true;
  }
  return false;
};

let silentTotal = 0;
let neighbourAtomless = 0, neighbourTyped = 0, atEdge = 0;
const candidates = new Map();      // "L+R" -> {n, gold, deprels:Map, examples:[]}
const lexicalVictims = new Map();  // token -> count  (silent, neighbour atomless)

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > MAX) continue;
  let chart;
  try { chart = composePacked(tokens, posMap, { ledger: true }); } catch { continue; }

  const slotTypes = chart.field.map((s) => (s.atoms || []).map((a) => a.type));

  for (let i = 0; i < chart.field.length; i += 1) {
    for (const atom of chart.field[i].atoms || []) {
      if ((atom.ingested?.reactions?.length || 0) > 0) continue;
      silentTotal += 1;

      const sides = [];
      if (i - 1 >= 0) sides.push(['left', i - 1]);
      if (i + 1 < chart.field.length) sides.push(['right', i + 1]);
      if (sides.length === 0) { atEdge += 1; continue; }

      let sawTyped = false;
      for (const [side, j] of sides) {
        const nbrTypes = slotTypes[j] || [];
        if (nbrTypes.length === 0) continue;
        sawTyped = true;
        for (const nbr of nbrTypes) {
          const [L, R] = side === 'left' ? [nbr, atom.type] : [atom.type, nbr];
          if (licensed(L, R)) continue;           // already licensed; not a gap
          const key = `${L}+${R}`;
          const row = candidates.get(key)
            || { n: 0, gold: 0, deprels: new Map(), examples: [] };
          row.n += 1;
          // gold support: is there a head-dependent edge between these tokens?
          const a = rec.tokens[side === 'left' ? j : i];
          const b = rec.tokens[side === 'left' ? i : j];
          let rel = null;
          if (a && b) {
            if (a.head === b.id) rel = a.deprel;
            else if (b.head === a.id) rel = b.deprel;
          }
          if (rel) {
            row.gold += 1;
            row.deprels.set(rel, (row.deprels.get(rel) || 0) + 1);
            if (row.examples.length < 3) {
              row.examples.push(`${tokens[side === 'left' ? j : i]} ${tokens[side === 'left' ? i : j]}  (${rel})`);
            }
          }
          candidates.set(key, row);
        }
      }
      if (sawTyped) neighbourTyped += 1;
      else {
        neighbourAtomless += 1;
        const t = String(tokens[i]).toLowerCase();
        lexicalVictims.set(t, (lexicalVictims.get(t) || 0) + 1);
      }
    }
  }
}

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const pad = (s, w) => String(s).padEnd(w);

console.log('='.repeat(80));
console.log('SILENT ATOM SEEDER — gate corpus');
console.log('='.repeat(80));
console.log(`
silent atoms                                  : ${silentTotal}
  every neighbour ATOMLESS  -> LEXICAL gap    : ${neighbourAtomless}  (${pct(neighbourAtomless, silentTotal)})
  at least one neighbour typed -> GRAMMAR?    : ${neighbourTyped}  (${pct(neighbourTyped, silentTotal)})
  no neighbour (1-token sentence)             : ${atEdge}
`);

const rows = [...candidates].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.gold - a.gold || b.n - a.n);
const withGold = rows.filter((r) => r.gold > 0);

console.log(`UNLICENSED TYPE PAIRS FROM SILENT ATOMS : ${rows.length} distinct`);
console.log(`  of those with ANY gold head-dependent support : ${withGold.length}\n`);

if (withGold.length) {
  console.log(`${pad('pair', 18)}${pad('seen', 7)}${pad('gold', 7)}${pad('purity', 9)}modal deprel / examples`);
  for (const r of withGold.slice(0, 14)) {
    const top = [...r.deprels].sort((a, b) => b[1] - a[1])[0];
    const purity = top ? (top[1] / r.gold) : 0;
    console.log(
      pad(r.k, 18) + pad(r.n, 7) + pad(r.gold, 7) + pad(purity.toFixed(3), 9) +
      `${top ? top[0] : '—'}   e.g. ${r.examples[0] || ''}`,
    );
  }
  console.log('\n  purity here = modal deprel share of gold-supported firings.');
  console.log('  The cyclotron promotion bar was p95 = 0.901 against shuffled controls.');
}

if (lexicalVictims.size) {
  console.log('\nLEXICAL VICTIMS (silent, every neighbour atomless)');
  for (const [t, n] of [...lexicalVictims].sort((a, b) => b[1] - a[1]).slice(0, 16)) {
    console.log(`  ${pad(t, 16)} ${n}`);
  }
}
