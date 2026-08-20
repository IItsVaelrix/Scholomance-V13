#!/usr/bin/env node
/**
 * SPIKE: UNKNOWN ↔ KNOWN HANDSHAKE
 *
 * Known  = loud atom (chlorophyll absorbed; it is already on the lattice).
 * Unknown is not "the other licensed type". Classes, not conflated:
 *   silent    typed atom, zero reactions — hears light, cannot absorb
 *   atomless  token minted no atom
 *   unnameable token the lexicon, irregulars, and guessPos all refused
 *
 * The known already broadcasts. The question is whether unknowns sit next
 * to knowns, already receive irradiance / induced potential, and sit on
 * gold edges the bond table will not take.
 *
 * Does NOT immediately bond.
 *
 *   node scripts/unknown-known-handshake-census.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { guessPos } from '../codex/core/constellation/compose.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { parseConllu } from '../codex/core/constellation/treebank.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-unknown-known-handshake.json');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const MAX = JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-baseline.json'), 'utf8')).run.maxTokens;

const CLOSED = new Set([
  'DET', 'P', 'PRON', 'PRONACC', 'AUX', 'MODAL', 'COP', 'CONJ', 'SUB',
  'REL', 'TO', 'THAN', 'POSS', 'PRT', 'PUNCT', 'COMMA',
]);

function loud(atom) {
  return (atom?.ingested?.reactions?.length || 0) > 0;
}

function slotKind(slot, token, posMap) {
  const atoms = slot?.atoms || [];
  if (atoms.length === 0) return 'atomless';
  if (atoms.some(loud)) return 'known';
  return 'silent';
}

function unnameable(token, posMap) {
  const lower = String(token || '').toLowerCase();
  const known = posMap.get(lower);
  if (known && known.length) return false;
  if (guessPos(lower).length) return false;
  if (/^[.!?…;:,]+$/.test(lower)) return false;
  if (lower === 'to' || lower === 'than' || lower === "'s") return false;
  return true;
}

function goldBetween(gold, i, j) {
  return goldLinksBetween(gold, i, i, j, j).length >= 1;
}

const tally = {
  slots: 0,
  knownSlots: 0,
  silentSlots: 0,
  atomlessSlots: 0,
  unnameableSlots: 0,
  silentAtoms: 0,
  silentWithIrradiance: 0,
  silentWithInduced: 0,
  adj: 0,
  knownKnown: 0,
  knownUnknown: 0,
  unknownUnknown: 0,
  knownUnknownGold: 0,
  knownKnownGold: 0,
  unknownUnknownGold: 0,
  knownSilent: 0,
  knownSilentGold: 0,
  knownAtomless: 0,
  knownAtomlessGold: 0,
  silentHeardKnownCall: 0,
  silentHeardKnownCallGold: 0,
};
const examples = [];
let composed = 0;
const started = Date.now();

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length < 2 || tokens.length > MAX) continue;
  let chart;
  try {
    chart = composePacked(tokens, posMap, {});
  } catch {
    continue;
  }
  composed += 1;
  const gold = goldByIndex(rec);
  const field = chart.field || [];
  const kinds = [];
  for (let i = 0; i < field.length; i += 1) {
    const slot = field[i];
    const kind = slotKind(slot, tokens[i], posMap);
    const unnamed = unnameable(tokens[i], posMap);
    kinds.push(kind);
    tally.slots += 1;
    if (kind === 'known') tally.knownSlots += 1;
    else if (kind === 'silent') tally.silentSlots += 1;
    else tally.atomlessSlots += 1;
    if (unnamed) tally.unnameableSlots += 1;
    for (const atom of slot.atoms || []) {
      if (loud(atom)) continue;
      tally.silentAtoms += 1;
      const irr = Number(atom.chloroplast?.irradiance || 0);
      const induced = Number(atom.potential || 0) - Number(atom.charge || 0);
      if (irr > 0) tally.silentWithIrradiance += 1;
      if (induced > 0 || Number(atom.potential || 0) > 0) tally.silentWithInduced += 1;
    }
  }
  for (let i = 0; i + 1 < kinds.length; i += 1) {
    tally.adj += 1;
    const a = kinds[i];
    const b = kinds[i + 1];
    const knownUnk = (a === 'known' && b !== 'known') || (b === 'known' && a !== 'known');
    const bothKnown = a === 'known' && b === 'known';
    const bothUnk = a !== 'known' && b !== 'known';
    const goldHit = goldBetween(gold, i, i + 1);
    if (bothKnown) {
      tally.knownKnown += 1;
      if (goldHit) tally.knownKnownGold += 1;
    } else if (knownUnk) {
      tally.knownUnknown += 1;
      if (goldHit) tally.knownUnknownGold += 1;
      const silentSide = a === 'silent' || b === 'silent';
      const atomlessSide = a === 'atomless' || b === 'atomless';
      if (silentSide) {
        tally.knownSilent += 1;
        if (goldHit) tally.knownSilentGold += 1;
        const silentSlot = a === 'silent' ? field[i] : field[i + 1];
        const heard = (silentSlot.atoms || []).some((atom) => (
          !loud(atom) && Number(atom.chloroplast?.irradiance || 0) > 0
        ));
        if (heard) {
          tally.silentHeardKnownCall += 1;
          if (goldHit) tally.silentHeardKnownCallGold += 1;
          if (goldHit && examples.length < 10) {
            examples.push({
              text: tokens.join(' '),
              pair: `${tokens[i]}|${tokens[i + 1]}`,
              kinds: `${a}-${b}`,
              gold: goldLinksBetween(gold, i, i, i + 1, i + 1).map((l) => l.deprel),
            });
          }
        }
      }
      if (atomlessSide) {
        tally.knownAtomless += 1;
        if (goldHit) tally.knownAtomlessGold += 1;
      }
    } else if (bothUnk) {
      tally.unknownUnknown += 1;
      if (goldHit) tally.unknownUnknownGold += 1;
    }
  }
}

function rate(n, d) {
  return d ? Number((n / d).toFixed(4)) : 0;
}

const report = {
  contract: 'PB-UNKNOWN-KNOWN-HANDSHAKE-v1',
  kind: 'annotate-only-spike',
  throwaway: true,
  elapsedMs: Date.now() - started,
  composed,
  tally,
  rates: {
    pGoldKnownKnown: rate(tally.knownKnownGold, tally.knownKnown),
    pGoldKnownUnknown: rate(tally.knownUnknownGold, tally.knownUnknown),
    pGoldUnknownUnknown: rate(tally.unknownUnknownGold, tally.unknownUnknown),
    pGoldKnownSilent: rate(tally.knownSilentGold, tally.knownSilent),
    pGoldKnownAtomless: rate(tally.knownAtomlessGold, tally.knownAtomless),
    silentHearRate: rate(tally.silentWithIrradiance, tally.silentAtoms),
    silentInducedRate: rate(tally.silentWithInduced, tally.silentAtoms),
    heardCallGold: rate(tally.silentHeardKnownCallGold, tally.silentHeardKnownCall),
  },
  examples,
  verdict: null,
};

const contact = tally.knownSilentGold + tally.knownAtomlessGold;
report.verdict = contact > 0
  ? `CONTACT — ${contact} gold edges sit on known↔unknown adjacencies. Silent atoms already hear (${report.rates.silentHearRate} irradiance). The missing operator is a match that is not the bond table.`
  : 'NO CONTACT — unknowns are not sitting on gold edges next to knowns; the call has no one to answer.';

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

console.log('UNKNOWN ↔ KNOWN HANDSHAKE');
console.log(`  slots known=${tally.knownSlots} silent=${tally.silentSlots} atomless=${tally.atomlessSlots} unnameable=${tally.unnameableSlots}`);
console.log(`  silent atoms=${tally.silentAtoms}  hear light=${tally.silentWithIrradiance}  induced=${tally.silentWithInduced}`);
console.log('\nADJACENT PAIRS');
console.log(`  known-known     ${tally.knownKnown}  gold ${tally.knownKnownGold}  P=${report.rates.pGoldKnownKnown}`);
console.log(`  known-unknown   ${tally.knownUnknown}  gold ${tally.knownUnknownGold}  P=${report.rates.pGoldKnownUnknown}`);
console.log(`    known-silent  ${tally.knownSilent}  gold ${tally.knownSilentGold}  P=${report.rates.pGoldKnownSilent}`);
console.log(`    known-atomless ${tally.knownAtomless}  gold ${tally.knownAtomlessGold}  P=${report.rates.pGoldKnownAtomless}`);
console.log(`  unknown-unknown ${tally.unknownUnknown}  gold ${tally.unknownUnknownGold}  P=${report.rates.pGoldUnknownUnknown}`);
console.log(`\n  silent heard a known call: ${tally.silentHeardKnownCall}  gold ${tally.silentHeardKnownCallGold}  P=${report.rates.heardCallGold}`);
console.log('\nEXAMPLES (known↔silent on a gold edge, silent heard the call)');
for (const ex of examples) {
  console.log(`  ${ex.pair.padEnd(20)} ${ex.kinds.padEnd(14)} ${ex.gold.join(',')}  "${ex.text}"`);
}
console.log(`\nVERDICT: ${report.verdict}`);
console.log(`evidence: ${EVIDENCE}`);
