#!/usr/bin/env node
/**
 * SPIKE (throwaway): TELEMETRY HANDSHAKE CENSUS
 *
 * Claim under test: atoms call over telemetry; a matching receiver activates
 * electromagnetism and should immediately bond.
 *
 * This script does not immediately bond. Admission stays on admitBond.
 * It only asks whether a handshake match is anything other than a licensed
 * type pair that CKY would have tried anyway.
 *
 *   call     = photon / chloroplast cell (aura, span, energy)
 *   match    = receiver voltage > 0 on that aura
 *   em       = coulomb(left, right) after stampCharges
 *   licensed = some BONDS row on the preferred types (with lifts)
 *   gold     = a gold dependency between the two tokens
 *
 *   node scripts/telemetry-handshake-census.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { channelResonance } from '../codex/core/constellation/resonance-beacon.js';
import { coulomb } from '../codex/core/constellation/electromagnetism.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { parseConllu } from '../codex/core/constellation/treebank.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-telemetry-handshake.json');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const MAX = JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-baseline.json'), 'utf8')).run.maxTokens;

const CLOSURE = new Map();
function closure(type) {
  let hit = CLOSURE.get(type);
  if (hit) return hit;
  const out = new Set([type]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [src, dst] of LIFTS) {
      if (out.has(src) && !out.has(dst)) {
        out.add(dst);
        grew = true;
      }
    }
  }
  hit = [...out];
  CLOSURE.set(type, hit);
  return hit;
}

function licensed(leftType, rightType) {
  for (const L of closure(leftType)) {
    for (const R of closure(rightType)) {
      if (channelResonance(L, R, BONDS) > 0) return true;
    }
  }
  return false;
}

function preferred(slot) {
  let best = null;
  for (const atom of slot.atoms || []) {
    const v = Number(atom.charge ?? atom.ingested?.energy ?? 0);
    if (!best || v > (best.charge ?? best.ingested?.energy ?? 0)) best = atom;
  }
  return best;
}

function matched(receiver, caller) {
  const aura = caller?.light?.aura || caller?.nucleus?.aura;
  if (!aura || !receiver) return false;
  return (receiver.chloroplast?.cells || []).some(
    (cell) => cell.aura === aura && (cell.voltage || 0) > 0,
  );
}

function goldEdge(gold, i) {
  return goldLinksBetween(gold, i, i, i + 1, i + 1).length === 1;
}

const tally = {
  pairs: 0,
  match: 0,
  licensed: 0,
  gold: 0,
  attract: 0,
  matchAndLicensed: 0,
  matchNotLicensed: 0,
  licensedNotMatch: 0,
  matchAndGold: 0,
  matchNotGold: 0,
  goldNotMatch: 0,
  attractAndGold: 0,
  attractNotGold: 0,
  goldNotAttract: 0,
  matchAndAttract: 0,
};
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
  for (let i = 0; i + 1 < field.length; i += 1) {
    const left = preferred(field[i]);
    const right = preferred(field[i + 1]);
    if (!left || !right) continue;
    tally.pairs += 1;
    const isMatch = matched(right, left) || matched(left, right);
    const isLicensed = licensed(left.type, right.type);
    const isGold = goldEdge(gold, i);
    const force = coulomb(left, right);
    const isAttract = force > 0;
    if (isMatch) tally.match += 1;
    if (isLicensed) tally.licensed += 1;
    if (isGold) tally.gold += 1;
    if (isAttract) tally.attract += 1;
    if (isMatch && isLicensed) tally.matchAndLicensed += 1;
    if (isMatch && !isLicensed) tally.matchNotLicensed += 1;
    if (!isMatch && isLicensed) tally.licensedNotMatch += 1;
    if (isMatch && isGold) tally.matchAndGold += 1;
    if (isMatch && !isGold) tally.matchNotGold += 1;
    if (!isMatch && isGold) tally.goldNotMatch += 1;
    if (isAttract && isGold) tally.attractAndGold += 1;
    if (isAttract && !isGold) tally.attractNotGold += 1;
    if (!isAttract && isGold) tally.goldNotAttract += 1;
    if (isMatch && isAttract) tally.matchAndAttract += 1;
  }
}

function rate(num, den) {
  return den ? Number((num / den).toFixed(4)) : 0;
}

const report = {
  contract: 'PB-TELEMETRY-HANDSHAKE-CENSUS-v1',
  kind: 'annotate-only-spike',
  throwaway: true,
  elapsedMs: Date.now() - started,
  composed,
  tally,
  identity: {
    matchGivenLicensed: rate(tally.matchAndLicensed, tally.licensed),
    licensedGivenMatch: rate(tally.matchAndLicensed, tally.match),
    matchWithoutLicense: tally.matchNotLicensed,
  },
  gold: {
    precisionMatch: rate(tally.matchAndGold, tally.match),
    recallMatch: rate(tally.matchAndGold, tally.gold),
    precisionAttract: rate(tally.attractAndGold, tally.attract),
    recallAttract: rate(tally.attractAndGold, tally.gold),
    precisionLicensed: rate(tally.matchAndGold, tally.licensed) ? rate(
      // licensed∩gold is not tallied separately; use match∩gold only if match≡licensed
      tally.matchAndGold,
      tally.licensed,
    ) : 0,
    baseRate: rate(tally.gold, tally.pairs),
  },
  law: {
    immediatelyBond: 'refused — fields may attract; admitBond remains the only bond',
    agendaIndependent: 'reordering matching pairs cannot change admission',
  },
};

const restatement = report.identity.licensedGivenMatch >= 0.95
  && tally.matchNotLicensed === 0;

report.verdict = restatement
  ? 'RESTATEMENT — handshake match is the licensed type pair. Immediate bond would replay CKY. EM attraction is not a second grammar.'
  : 'OPEN — some matches are not licensed type pairs; inspect matchNotLicensed before any promotion';

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

console.log('TELEMETRY HANDSHAKE CENSUS');
console.log(`  pairs=${tally.pairs}  match=${tally.match}  licensed=${tally.licensed}  gold=${tally.gold}  attract=${tally.attract}`);
console.log(`  licensed|match=${report.identity.licensedGivenMatch}  match|licensed=${report.identity.matchGivenLicensed}  match¬licensed=${tally.matchNotLicensed}`);
console.log(`  P(gold|match)=${report.gold.precisionMatch}  R(gold|match)=${report.gold.recallMatch}`);
console.log(`  P(gold|attract)=${report.gold.precisionAttract}  R(gold|attract)=${report.gold.recallAttract}`);
console.log(`  P(gold)=${report.gold.baseRate}`);
console.log(`  match∧attract=${tally.matchAndAttract}`);
console.log(`\nVERDICT: ${report.verdict}`);
console.log(`evidence: ${EVIDENCE}`);
