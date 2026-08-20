#!/usr/bin/env node
/**
 * SILENT ATOM CENSUS — what a self-destruct rule would actually eat.
 *
 * "Dark token" counted slots where EVERY reading was silent (75). The rule
 * under consideration acts per ATOM, so the population is larger: any atom
 * whose `ingested.reactions` is empty, including ones with a loud sibling.
 *
 * The decisive question is not how many, but WHICH. For every slot where gold
 * UPOS names an acceptable chart type, this asks whether the GOLD-CORRECT
 * atom is among the silent — i.e. whether self-destruct would delete the
 * right answer.
 *
 *   node scripts/silent-atom-census.mjs
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

const UPOS = new Map([
  ['NOUN', ['N', 'NC']], ['PROPN', ['PROPN', 'N', 'NC']], ['VERB', ['V']],
  ['ADJ', ['ADJ']], ['ADV', ['ADV']], ['DET', ['DET']], ['ADP', ['P']],
  ['PRON', ['PRON', 'PRONACC']], ['AUX', ['AUX', 'MODAL', 'COP']],
  ['CCONJ', ['CONJ']], ['SCONJ', ['SUB']], ['PART', ['TO', 'PRT', 'POSS']],
  ['PUNCT', ['PUNCT', 'COMMA']],
]);

let atoms = 0, silent = 0, slots = 0, slotsAllSilent = 0;
let scorable = 0;                 // slots where gold names an acceptable type AND we hold it
let goldSilent = 0;               // gold-correct atom is silent -> deletion loses the answer
let goldSilentLoudRival = 0;      // and a WRONG reading is loud -> deletion picks wrong
let goldLoud = 0;
const victimsByUpos = new Map();
const examples = [];

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > MAX) continue;
  let chart;
  try { chart = composePacked(tokens, posMap, { ledger: true }); } catch { continue; }

  for (let i = 0; i < chart.field.length; i += 1) {
    const slotAtoms = chart.field[i].atoms || [];
    if (slotAtoms.length === 0) continue;
    slots += 1;
    const quiet = slotAtoms.filter((a) => (a.ingested?.reactions?.length || 0) === 0);
    atoms += slotAtoms.length;
    silent += quiet.length;
    if (quiet.length === slotAtoms.length) slotsAllSilent += 1;

    const allow = UPOS.get(rec.tokens[i]?.upos);
    if (!allow) continue;
    const goldAtoms = slotAtoms.filter((a) => allow.includes(a.type));
    if (goldAtoms.length === 0) continue;   // chart never held the right reading
    scorable += 1;

    const goldAllQuiet = goldAtoms.every((a) => (a.ingested?.reactions?.length || 0) === 0);
    if (!goldAllQuiet) { goldLoud += 1; continue; }

    goldSilent += 1;
    const rivalLoud = slotAtoms.some(
      (a) => !allow.includes(a.type) && (a.ingested?.reactions?.length || 0) > 0,
    );
    if (rivalLoud) goldSilentLoudRival += 1;
    const up = rec.tokens[i].upos;
    victimsByUpos.set(up, (victimsByUpos.get(up) || 0) + 1);
    if (examples.length < 8) {
      examples.push(
        `${String(tokens[i]).padEnd(12)} gold=${String(up).padEnd(6)}` +
        ` would delete [${goldAtoms.map((a) => a.type).join(',')}]` +
        ` keep [${slotAtoms.filter((a) => (a.ingested?.reactions?.length || 0) > 0).map((a) => a.type).join(',') || '(nothing)'}]`,
      );
    }
  }
}

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const pad = (s, w) => String(s).padEnd(w);

console.log('='.repeat(78));
console.log('SILENT ATOM CENSUS — gate corpus');
console.log('='.repeat(78));
console.log(`
atoms in the field                      : ${atoms}
SILENT atoms (zero reactions)           : ${silent}   (${pct(silent, atoms)})
slots                                   : ${slots}
slots where every reading is silent     : ${slotsAllSilent}   (${pct(slotsAllSilent, slots)})
`);

console.log('WOULD SELF-DESTRUCT DELETE THE RIGHT ANSWER?');
console.log(`  slots where gold names a type the chart holds : ${scorable}`);
console.log(`    gold reading is LOUD  (survives)            : ${goldLoud}   (${pct(goldLoud, scorable)})`);
console.log(`    gold reading is SILENT (deleted)            : ${goldSilent}   (${pct(goldSilent, scorable)})`);
console.log(`      ...and a WRONG reading is loud            : ${goldSilentLoudRival}   (${pct(goldSilentLoudRival, scorable)})`);

if (victimsByUpos.size) {
  console.log('\nGOLD READINGS THAT WOULD BE DELETED, BY UPOS');
  for (const [k, v] of [...victimsByUpos].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${pad(k, 10)} ${v}`);
  }
  console.log('\nEXAMPLES');
  for (const e of examples) console.log(`  ${e}`);
}
