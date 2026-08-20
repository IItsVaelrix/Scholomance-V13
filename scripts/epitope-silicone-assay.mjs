#!/usr/bin/env node
/**
 * ASSAY: can capability epitopes author silicone?
 *
 * For every unknown that a seeking known called, propose chemistry from
 * the epitope (projection physics, approximation status). Then:
 *
 *   1. classify shape (preservative = silicone-shaped, constructive = carbon-shaped)
 *   2. measure gold-deprel purity per signature
 *   3. sandbox-fire novel silicone-shaped bonds (options.bonds overfeed)
 *
 * Does not edit the Grimoire. A marker is not a bond. A sandbox firing is
 * not a promotion.
 *
 * Falsifiers:
 *   F1  no gold-supported silicone-shaped proposals
 *   F2  silicone gold-purity ≤ shuffled deprels
 *   F3  novel silicone overfeed fires 0 of those signatures
 *   F4  carbon-shaped gold mass ≥ silicone-shaped gold mass
 *       (epitopes want axioms, not process chemistry)
 *
 *   node scripts/epitope-silicone-assay.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { parseConllu } from '../codex/core/constellation/treebank.js';
import { annotateUnknownCapabilities } from '../codex/core/constellation/unknown-capability-marker.js';
import {
  hypothesizeComplement,
  proposeFromCall,
} from '../codex/core/constellation/epitope-silicone.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-epitope-silicone.json');
const SEED = 0x53494c49;
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const MAX = JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-baseline.json'), 'utf8')).run.maxTokens;
const LICENSED = new Set(BONDS.map((b) => `${b[0]}|${b[1]}|${b[2]}`));

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffleInPlace(arr, random) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isLoud(atom) {
  return (atom?.ingested?.reactions?.length || 0) > 0;
}

function goldRel(gold, i, j) {
  const links = goldLinksBetween(gold, i, i, j, j);
  if (links.length === 1) return links[0].deprel.split(':')[0];
  return null;
}

function loudNeighbor(sourceField, i) {
  for (const j of [i - 1, i + 1]) {
    const slot = sourceField[j];
    if (!slot) continue;
    const loud = (slot.atoms || []).filter(isLoud);
    if (!loud.length) continue;
    loud.sort((a, b) => (b.charge || 0) - (a.charge || 0) || String(a.type).localeCompare(String(b.type)));
    return { atom: loud[0], index: j };
  }
  return null;
}

const rows = [];
let composed = 0;
const started = Date.now();
const sentencePack = [];

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
  const annotated = annotateUnknownCapabilities(chart);
  const local = [];
  for (const slot of annotated.field) {
    const seed = slot.unknownReceiver;
    const silent = (slot.atoms || []).find((a) => a.capability);
    const cap = seed?.capability || silent?.capability;
    if (!cap?.capable) continue;
    const nbr = loudNeighbor(chart.field, slot.index);
    if (!nbr) continue;
    const unknownType = seed ? null : silent.type;
    const proposal = proposeFromCall({
      callerType: nbr.atom.type,
      callerFrom: nbr.index,
      unknownType,
      unknownFrom: slot.index,
    });
    if (!proposal) continue;
    const rel = goldRel(gold, slot.index, nbr.index);
    const novel = !LICENSED.has(proposal.signature);
    const row = {
      token: slot.token,
      unknownType: unknownType || (hypothesizeComplement(nbr.atom.type)?.type ?? 'UNK'),
      callerType: nbr.atom.type,
      signature: proposal.signature,
      shape: proposal.shape,
      reaction: proposal.reaction,
      phase: proposal.phase,
      operation: proposal.operation,
      novel,
      gold: Boolean(rel),
      deprel: rel,
      seeded: Boolean(seed),
      pos: hypothesizeComplement(nbr.atom.type)?.pos || null,
    };
    rows.push(row);
    local.push(row);
  }
  if (local.length) sentencePack.push({ tokens, local, baselineStable: (chart.stable || []).length });
}

function bucket(list) {
  const by = new Map();
  for (const row of list) {
    const cur = by.get(row.signature) || {
      signature: row.signature,
      shape: row.shape,
      reaction: row.reaction,
      novel: row.novel,
      n: 0,
      gold: 0,
      deprels: Object.create(null),
    };
    cur.n += 1;
    if (row.gold) {
      cur.gold += 1;
      cur.deprels[row.deprel] = (cur.deprels[row.deprel] || 0) + 1;
    }
    by.set(row.signature, cur);
  }
  return [...by.values()].map((b) => {
    const top = Object.entries(b.deprels).sort((a, c) => c[1] - a[1])[0];
    return {
      ...b,
      modal: top ? top[0] : null,
      purity: b.gold ? Number((top[1] / b.gold).toFixed(3)) : 0,
    };
  }).sort((a, b) => b.gold - a.gold || b.n - a.n);
}

const signatures = bucket(rows);
const siliconeRows = rows.filter((r) => r.shape === 'silicone-shaped');
const carbonRows = rows.filter((r) => r.shape === 'carbon-shaped');
const siliconeGold = siliconeRows.filter((r) => r.gold);
const carbonGold = carbonRows.filter((r) => r.gold);
const novelSilicone = signatures.filter((s) => s.shape === 'silicone-shaped' && s.novel && s.gold > 0);

const random = rng(SEED);
const goldRels = rows.filter((r) => r.gold).map((r) => r.deprel);
const shuffledRels = shuffleInPlace([...goldRels], random);
let shuffleIdx = 0;
const shuffled = rows.map((r) => {
  if (!r.gold) return r;
  return { ...r, deprel: shuffledRels[shuffleIdx++] };
});
const shuffledSilicone = bucket(shuffled.filter((r) => r.shape === 'silicone-shaped' && r.gold));
const realSiliconeGoldSigs = bucket(siliconeGold);
const meanPurity = (list) => (list.length ? list.reduce((s, r) => s + r.purity, 0) / list.length : 0);

function withPos(base, token, pos) {
  const next = new Map(base);
  const key = String(token).toLowerCase();
  const prev = next.get(key) || [];
  if (pos && !prev.includes(pos)) next.set(key, [...prev, pos]);
  return next;
}

const extraBonds = [];
const seenExtra = new Set();
for (const sig of novelSilicone) {
  const [left, right, result] = sig.signature.split('|');
  const sample = siliconeRows.find((r) => r.signature === sig.signature);
  const head = sample && sample.callerType === right ? 1 : 0;
  const key = sig.signature;
  if (seenExtra.has(key)) continue;
  seenExtra.add(key);
  extraBonds.push([left, right, result, head === 1 ? 1 : 0]);
}

const sandboxBonds = Object.freeze([...BONDS, ...extraBonds]);
let sandboxSentences = 0;
let sandboxFired = 0;
let sandboxNewSignatures = 0;
let baselineParsed = 0;
let sandboxParsed = 0;
const fired = Object.create(null);

for (const pack of sentencePack) {
  if (!pack.local.some((r) => r.shape === 'silicone-shaped' && r.novel && r.gold)) continue;
  sandboxSentences += 1;
  if (pack.baselineStable > 0) baselineParsed += 1;
  let lex = posMap;
  for (const row of pack.local) {
    if (row.seeded && row.pos) lex = withPos(lex, row.token, row.pos);
  }
  let trial;
  try {
    trial = composePacked(pack.tokens, lex, { bonds: sandboxBonds });
  } catch {
    continue;
  }
  if ((trial.stable || []).length > 0) sandboxParsed += 1;
  const census = trial.reactions || { bySignature: {} };
  let hit = false;
  for (const extra of extraBonds) {
    const key = `${extra[0]}+${extra[1]}->${extra[2]}`;
    const n = census.bySignature[key]?.n || 0;
    if (n > 0) {
      hit = true;
      fired[key] = (fired[key] || 0) + n;
    }
  }
  if (hit) {
    sandboxFired += 1;
    sandboxNewSignatures += 1;
  }
}

const falsifiers = {
  noGoldSilicone: siliconeGold.length === 0,
  siliconePurityNotAboveShuffle: meanPurity(realSiliconeGoldSigs) <= meanPurity(shuffledSilicone),
  novelSiliconeDidNotFire: extraBonds.length > 0 && sandboxFired === 0,
  carbonGoldDominates: carbonGold.length >= siliconeGold.length,
};

const created = extraBonds.length > 0 && sandboxFired > 0 && !falsifiers.siliconePurityNotAboveShuffle;

const report = {
  contract: 'PB-EPITOPE-SILICONE-ASSAY-v1',
  kind: 'sandbox-overfeed',
  throwaway: true,
  seed: SEED,
  elapsedMs: Date.now() - started,
  composed,
  population: {
    proposals: rows.length,
    siliconeShaped: siliconeRows.length,
    carbonShaped: carbonRows.length,
    siliconeGold: siliconeGold.length,
    carbonGold: carbonGold.length,
    novelSiliconeSignatures: novelSilicone.length,
    alreadyLicensed: rows.filter((r) => !r.novel).length,
  },
  purity: {
    siliconeMean: Number(meanPurity(realSiliconeGoldSigs).toFixed(4)),
    shuffledMean: Number(meanPurity(shuffledSilicone).toFixed(4)),
    promotionBar: 0.901,
  },
  signatures: signatures.slice(0, 16),
  novelSilicone,
  sandbox: {
    extraBonds: extraBonds.map((b) => `${b[0]}|${b[1]}|${b[2]}`),
    sentences: sandboxSentences,
    baselineParsed,
    sandboxParsed,
    sentencesThatFired: sandboxFired,
    firings: fired,
  },
  falsifiers,
  verdict: created
    ? 'SILICONE FORMED — novel preservative proposals fired in the sandbox and beat shuffled purity. Still not Grimoire law.'
    : 'NO SILICONE — epitopes did not author usable preservative chemistry. Do not promote.',
};

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

console.log('EPITOPE → SILICONE');
console.log(`  proposals=${rows.length}  silicone-shaped=${siliconeRows.length} (gold ${siliconeGold.length})  carbon-shaped=${carbonRows.length} (gold ${carbonGold.length})`);
console.log(`  already licensed=${report.population.alreadyLicensed}  novel silicone sigs=${novelSilicone.length}`);
console.log(`  silicone purity ${report.purity.siliconeMean} vs shuffle ${report.purity.shuffledMean} (bar ${report.purity.promotionBar})`);
console.log('\nSIGNATURES');
for (const s of signatures.slice(0, 12)) {
  console.log(`  ${s.signature.padEnd(16)} ${s.shape.padEnd(16)} n=${String(s.n).padStart(3)} gold=${String(s.gold).padStart(3)} pur=${s.purity} ${s.novel ? 'novel' : 'licensed'}  ${s.modal || '—'}`);
}
console.log('\nSANDBOX');
console.log(`  extra bonds: ${report.sandbox.extraBonds.join(', ') || '(none)'}`);
console.log(`  sentences=${sandboxSentences}  fired=${sandboxFired}  parsed ${baselineParsed}→${sandboxParsed}`);
console.log(`  firings: ${JSON.stringify(fired)}`);
console.log('\nFALSIFIERS');
console.log(`  F1 no gold silicone:              ${falsifiers.noGoldSilicone}`);
console.log(`  F2 silicone purity ≤ shuffle:     ${falsifiers.siliconePurityNotAboveShuffle}`);
console.log(`  F3 novel silicone did not fire:   ${falsifiers.novelSiliconeDidNotFire}`);
console.log(`  F4 carbon gold ≥ silicone gold:   ${falsifiers.carbonGoldDominates}  (${carbonGold.length} vs ${siliconeGold.length})`);
console.log(`\nVERDICT: ${report.verdict}`);
console.log(`evidence: ${EVIDENCE}`);
