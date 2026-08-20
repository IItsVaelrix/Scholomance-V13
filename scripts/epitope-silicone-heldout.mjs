#!/usr/bin/env node
/**
 * PREREG + HELD-OUT: frozen epitope silicone vs matched placebo
 *
 * Written before this run. The eight signatures are frozen in
 * FROZEN_EPITOPE_SILICONE. No new epitopes. No edits after seeing results.
 *
 * Held-out: UD English-EWT TEST, tokens in (0, 20]. Disjoint from the
 * minting gate (EWT-dev stride 3).
 *
 * Arms share the same sentences:
 *   BASELINE   standing BONDS
 *   TREATMENT  BONDS + frozen eight
 *   PLACEBO    BONDS + eight type-matched preservative pairs (seed 0x53494C49)
 *
 * Falsifiers (declared):
 *   F1  treatment net parse delta ≤ placebo net parse delta
 *   F2  treatment gold-containment delta ≤ 0
 *   F3  treatment top-1 head delta ≤ 0
 *   F4  false-attachment rate ≥ 0.50 among treatment firings
 *   F5  fewer than 4/8 frozen signatures fire on held-out
 *   F6  median events_treatment / events_baseline > 2
 *
 * Prediction: F4 fires. Singletons were tailored keys. V+P and N+P may
 * fire often with many ungolded attachments.
 *
 *   node scripts/epitope-silicone-heldout.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { goldAnswer, parseConllu } from '../codex/core/constellation/treebank.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import {
  FROZEN_EPITOPE_SILICONE,
  matchedPlaceboSilicone,
  signatureOfBond,
} from '../codex/core/constellation/epitope-silicone.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-epitope-silicone-heldout.json');
const PLACEBO_SEED = 0x53494c49;
const MAX = 20;
const FROZEN = FROZEN_EPITOPE_SILICONE.bonds;
const PLACEBO = matchedPlaceboSilicone(FROZEN, PLACEBO_SEED);
const WANT = new Set(FROZEN.map(signatureOfBond));
const PLACEBO_WANT = new Set(PLACEBO.map(signatureOfBond));
const TREATMENT_BONDS = Object.freeze([...BONDS, ...FROZEN]);
const PLACEBO_BONDS = Object.freeze([...BONDS, ...PLACEBO]);

function sha256Hex(data) {
  return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data), 'utf8').digest('hex');
}

function same(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function contained(chart, gold) {
  if (!gold?.verb) return false;
  const answers = (chart.stable || []).flatMap((s) => projectAnswers(s));
  if (gold.subject) {
    return answers.some((a) => same(a.verb, gold.verb) && same(a.subject, gold.subject));
  }
  return answers.some((a) => same(a.verb, gold.verb));
}

function top1Head(chart, gold) {
  if (!gold?.verb || !(chart.ranked || []).length) return false;
  const answers = projectAnswers(chart.ranked[0].molecule);
  return answers.some((a) => same(a.verb, gold.verb));
}

function firings(chart, want) {
  const rows = [];
  for (const node of chart.molecules || []) {
    for (const d of node.derivations || []) {
      if (!d.bond) continue;
      const sig = `${d.bond[0]}|${d.bond[1]}|${d.bond[2]}`;
      if (!want.has(sig)) continue;
      rows.push({
        sig,
        from: node.from,
        to: node.to,
        leftFrom: d.left?.from,
        leftTo: d.left?.to,
        rightFrom: d.right?.from,
        rightTo: d.right?.to,
      });
    }
  }
  return rows;
}

function golded(gold, row) {
  if (!Number.isInteger(row.leftFrom) || !Number.isInteger(row.rightFrom)) return false;
  return goldLinksBetween(gold, row.leftFrom, row.leftTo, row.rightFrom, row.rightTo).length >= 1;
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const gateTexts = new Set(
  parseConllu(readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'))
    .map((r) => (r.tokens || []).map((t) => t.form).join(' ')),
);

process.stderr.write('loading EWT-test + dictionary…\n');
const posMap = loadPosMap();
const records = loadSplit('test').filter((r) => {
  const n = (r.tokens || []).length;
  return n > 0 && n <= MAX;
});

const started = Date.now();
const perSig = Object.fromEntries([...WANT].map((sig) => [sig, { sentences: 0, firings: 0, golded: 0 }]));
const placeboPerSig = Object.fromEntries([...PLACEBO_WANT].map((sig) => [sig, { sentences: 0, firings: 0, golded: 0 }]));

const tally = {
  n: 0,
  overlapGate: 0,
  threw: 0,
  baseParsed: 0,
  treatParsed: 0,
  placeboParsed: 0,
  failToParseTreat: 0,
  parseToFailTreat: 0,
  failToParsePlacebo: 0,
  parseToFailPlacebo: 0,
  baseContain: 0,
  treatContain: 0,
  placeboContain: 0,
  baseTop1: 0,
  treatTop1: 0,
  placeboTop1: 0,
  treatFirings: 0,
  treatGolded: 0,
  placeboFirings: 0,
  placeboGolded: 0,
  treatEvents: [],
  baseEvents: [],
  placeboEvents: [],
  treatMolecules: [],
  baseMolecules: [],
  treatRecPres: 0,
  baseRecPres: 0,
  placeboRecPres: 0,
  treatPres: 0,
  basePres: 0,
};

for (let i = 0; i < records.length; i += 1) {
  const rec = records[i];
  const tokens = rec.tokens.map((t) => t.form);
  if (gateTexts.has(tokens.join(' '))) {
    tally.overlapGate += 1;
    continue;
  }
  const gold = goldByIndex(rec);
  const answer = goldAnswer(rec);
  let base;
  let treat;
  let placebo;
  try {
    base = composePacked(tokens, posMap, {});
    treat = composePacked(tokens, posMap, { bonds: TREATMENT_BONDS });
    placebo = composePacked(tokens, posMap, { bonds: PLACEBO_BONDS });
  } catch {
    tally.threw += 1;
    continue;
  }
  tally.n += 1;
  const bP = (base.stable || []).length > 0;
  const tP = (treat.stable || []).length > 0;
  const pP = (placebo.stable || []).length > 0;
  if (bP) tally.baseParsed += 1;
  if (tP) tally.treatParsed += 1;
  if (pP) tally.placeboParsed += 1;
  if (!bP && tP) tally.failToParseTreat += 1;
  if (bP && !tP) tally.parseToFailTreat += 1;
  if (!bP && pP) tally.failToParsePlacebo += 1;
  if (bP && !pP) tally.parseToFailPlacebo += 1;
  if (contained(base, answer)) tally.baseContain += 1;
  if (contained(treat, answer)) tally.treatContain += 1;
  if (contained(placebo, answer)) tally.placeboContain += 1;
  if (top1Head(base, answer)) tally.baseTop1 += 1;
  if (top1Head(treat, answer)) tally.treatTop1 += 1;
  if (top1Head(placebo, answer)) tally.placeboTop1 += 1;

  tally.baseEvents.push(base.events || 0);
  tally.treatEvents.push(treat.events || 0);
  tally.placeboEvents.push(placebo.events || 0);
  tally.baseMolecules.push((base.molecules || []).length);
  tally.treatMolecules.push((treat.molecules || []).length);
  tally.baseRecPres += base.reactions?.recursivePreservative || 0;
  tally.treatRecPres += treat.reactions?.recursivePreservative || 0;
  tally.placeboRecPres += placebo.reactions?.recursivePreservative || 0;
  tally.basePres += base.reactions?.preservative || 0;
  tally.treatPres += treat.reactions?.preservative || 0;

  const tHits = firings(treat, WANT);
  const pHits = firings(placebo, PLACEBO_WANT);
  const seenT = new Set();
  for (const hit of tHits) {
    tally.treatFirings += 1;
    const g = golded(gold, hit);
    if (g) tally.treatGolded += 1;
    perSig[hit.sig].firings += 1;
    if (g) perSig[hit.sig].golded += 1;
    seenT.add(hit.sig);
  }
  for (const sig of seenT) perSig[sig].sentences += 1;
  const seenP = new Set();
  for (const hit of pHits) {
    tally.placeboFirings += 1;
    const g = golded(gold, hit);
    if (g) tally.placeboGolded += 1;
    placeboPerSig[hit.sig].firings += 1;
    if (g) placeboPerSig[hit.sig].golded += 1;
    seenP.add(hit.sig);
  }
  for (const sig of seenP) placeboPerSig[sig].sentences += 1;

  if ((i + 1) % 100 === 0 || i + 1 === records.length) {
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    process.stderr.write(`  ${i + 1}/${records.length}  n=${tally.n}  ${sec}s\n`);
  }
}

function rate(n, d) {
  return d ? Number((n / d).toFixed(4)) : 0;
}

const treatNet = tally.failToParseTreat - tally.parseToFailTreat;
const placeboNet = tally.failToParsePlacebo - tally.parseToFailPlacebo;
const eventRatio = median(tally.baseEvents) > 0
  ? median(tally.treatEvents) / median(tally.baseEvents)
  : 0;
const sigsFired = Object.values(perSig).filter((r) => r.sentences > 0).length;
const falseAttach = tally.treatFirings - tally.treatGolded;

const falsifiers = {
  F1_treatNetNotAbovePlacebo: treatNet <= placeboNet,
  F2_containmentDeltaNonPositive: (tally.treatContain - tally.baseContain) <= 0,
  F3_top1DeltaNonPositive: (tally.treatTop1 - tally.baseTop1) <= 0,
  F4_falseAttachAtLeastHalf: tally.treatFirings > 0 && (falseAttach / tally.treatFirings) >= 0.5,
  F5_fewerThanFourSignaturesSurvive: sigsFired < 4,
  F6_eventMedianMoreThanDouble: eventRatio > 2,
};

const killed = Object.values(falsifiers).filter(Boolean).length;
const verdict = killed >= 4
  ? 'TAILORED KEYS — frozen silicone does not generalize; do not promote'
  : killed > 0
    ? `MIXED — ${killed}/6 falsifiers fired. Provisional only. Still not Grimoire law.`
    : 'GENERALIZES — frozen silicone beat placebo and moved gold metrics. Still not Grimoire law.';

const report = {
  contract: 'PB-EPITOPE-SILICONE-HELDOUT-v1',
  kind: 'held-out-generalization',
  frozen: FROZEN_EPITOPE_SILICONE.contract,
  placeboSeed: PLACEBO_SEED,
  placeboBonds: PLACEBO.map(signatureOfBond),
  corpus: {
    split: 'UD English-EWT test',
    maxTokens: MAX,
    eligible: records.length,
    analyzed: tally.n,
    overlapGateSkipped: tally.overlapGate,
    threw: tally.threw,
  },
  parsed: {
    baseline: `${tally.baseParsed}/${tally.n}`,
    treatment: `${tally.treatParsed}/${tally.n}`,
    placebo: `${tally.placeboParsed}/${tally.n}`,
    failToParseTreat: tally.failToParseTreat,
    parseToFailTreat: tally.parseToFailTreat,
    treatNet,
    failToParsePlacebo: tally.failToParsePlacebo,
    parseToFailPlacebo: tally.parseToFailPlacebo,
    placeboNet,
  },
  gold: {
    containBase: tally.baseContain,
    containTreat: tally.treatContain,
    containPlacebo: tally.placeboContain,
    containDeltaTreat: tally.treatContain - tally.baseContain,
    containDeltaPlacebo: tally.placeboContain - tally.baseContain,
    top1Base: tally.baseTop1,
    top1Treat: tally.treatTop1,
    top1Placebo: tally.placeboTop1,
    top1DeltaTreat: tally.treatTop1 - tally.baseTop1,
    top1DeltaPlacebo: tally.placeboTop1 - tally.baseTop1,
  },
  pressure: {
    eventsMedianBase: median(tally.baseEvents),
    eventsMedianTreat: median(tally.treatEvents),
    eventsMedianPlacebo: median(tally.placeboEvents),
    eventRatio,
    moleculesMedianBase: median(tally.baseMolecules),
    moleculesMedianTreat: median(tally.treatMolecules),
    recPresBase: tally.baseRecPres,
    recPresTreat: tally.treatRecPres,
    recPresPlacebo: tally.placeboRecPres,
    presBase: tally.basePres,
    presTreat: tally.treatPres,
  },
  firings: {
    treat: tally.treatFirings,
    treatGolded: tally.treatGolded,
    treatFalseAttach: falseAttach,
    treatFalseAttachRate: rate(falseAttach, tally.treatFirings),
    placebo: tally.placeboFirings,
    placeboGolded: tally.placeboGolded,
    placeboFalseAttachRate: rate(tally.placeboFirings - tally.placeboGolded, tally.placeboFirings),
    signaturesFired: sigsFired,
    perSignature: perSig,
    placeboPerSignature: placeboPerSig,
  },
  falsifiers,
  verdict,
  elapsedMs: Date.now() - started,
};

report.checksum = `epitope-silicone-heldout-v1:${sha256Hex({
  frozen: FROZEN.map(signatureOfBond),
  placebo: PLACEBO.map(signatureOfBond),
  parsed: report.parsed,
  gold: report.gold,
  firings: {
    treat: tally.treatFirings,
    treatGolded: tally.treatGolded,
    perSignature: perSig,
  },
  falsifiers,
  verdict,
})}`;

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

console.log('FROZEN EPITOPE SILICONE — HELD-OUT EWT-TEST');
console.log(`  n=${tally.n}  (eligible ${records.length}, gate-overlap skipped ${tally.overlapGate}, threw ${tally.threw})`);
console.log(`  placebo: ${PLACEBO.map(signatureOfBond).join(', ')}`);
console.log('\nPARSED (stable S)');
console.log(`  baseline  ${tally.baseParsed}/${tally.n} = ${rate(tally.baseParsed, tally.n)}`);
console.log(`  treatment ${tally.treatParsed}/${tally.n} = ${rate(tally.treatParsed, tally.n)}  fail→parse ${tally.failToParseTreat}  parse→fail ${tally.parseToFailTreat}  net ${treatNet}`);
console.log(`  placebo   ${tally.placeboParsed}/${tally.n} = ${rate(tally.placeboParsed, tally.n)}  fail→parse ${tally.failToParsePlacebo}  parse→fail ${tally.parseToFailPlacebo}  net ${placeboNet}`);
console.log('\nGOLD');
console.log(`  containment  base ${tally.baseContain}  treat ${tally.treatContain} (Δ ${tally.treatContain - tally.baseContain})  placebo ${tally.placeboContain} (Δ ${tally.placeboContain - tally.baseContain})`);
console.log(`  top-1 head   base ${tally.baseTop1}  treat ${tally.treatTop1} (Δ ${tally.treatTop1 - tally.baseTop1})  placebo ${tally.placeboTop1} (Δ ${tally.placeboTop1 - tally.baseTop1})`);
console.log('\nPRESSURE');
console.log(`  events median  base ${median(tally.baseEvents)}  treat ${median(tally.treatEvents)}  placebo ${median(tally.placeboEvents)}  ratio ${eventRatio.toFixed(3)}`);
console.log(`  molecules med  base ${median(tally.baseMolecules)}  treat ${median(tally.treatMolecules)}`);
console.log(`  rec-pres       base ${tally.baseRecPres}  treat ${tally.treatRecPres}  placebo ${tally.placeboRecPres}`);
console.log(`  preservative   base ${tally.basePres}  treat ${tally.treatPres}`);
console.log('\nFIRINGS');
console.log(`  treatment ${tally.treatFirings}  golded ${tally.treatGolded}  false-attach ${falseAttach} (${rate(falseAttach, tally.treatFirings)})`);
console.log(`  placebo   ${tally.placeboFirings}  golded ${tally.placeboGolded}  false-attach ${rate(tally.placeboFirings - tally.placeboGolded, tally.placeboFirings)}`);
for (const [sig, row] of Object.entries(perSig)) {
  console.log(`  ${sig.padEnd(16)} sent=${String(row.sentences).padStart(4)}  fire=${String(row.firings).padStart(5)}  golded=${row.golded}`);
}
console.log('\nFALSIFIERS');
console.log(`  F1 treat net ≤ placebo:     ${falsifiers.F1_treatNetNotAbovePlacebo}   (${treatNet} vs ${placeboNet})`);
console.log(`  F2 containment Δ ≤ 0:       ${falsifiers.F2_containmentDeltaNonPositive}   (${tally.treatContain - tally.baseContain})`);
console.log(`  F3 top-1 Δ ≤ 0:             ${falsifiers.F3_top1DeltaNonPositive}   (${tally.treatTop1 - tally.baseTop1})`);
console.log(`  F4 false-attach ≥ 0.50:     ${falsifiers.F4_falseAttachAtLeastHalf}   (${rate(falseAttach, tally.treatFirings)})`);
console.log(`  F5 <4/8 signatures survive: ${falsifiers.F5_fewerThanFourSignaturesSurvive}   (${sigsFired}/8)`);
console.log(`  F6 event median > 2×:       ${falsifiers.F6_eventMedianMoreThanDouble}   (${eventRatio.toFixed(3)})`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`evidence: ${EVIDENCE}`);
console.log(`checksum: ${report.checksum}`);
