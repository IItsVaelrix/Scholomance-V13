#!/usr/bin/env node
/**
 * PREREG: incomplete grammar vs incomplete typing
 *
 * Claim: silicone could not purify because the *bonds* lack the right
 * mechanisms — the Grimoire is woefully incomplete.
 *
 * Alternative: the right mechanisms already exist (P+NP→PP, V+NP→VP,
 * DET+N→NP, COP+ADJ→VP, …). Unknowns never become the types those
 * bonds consume. Collapse then had only host-preserving junk to weigh.
 *
 * Conceptualized missing chemistry (declared before the cyclotron run),
 * taken from gold the frozen silicone inverted:
 *
 *   case/obl   P+NP, V+PP, V+PRT, NP+PP, N+PP
 *   obj        V+NP
 *   det        DET+N
 *   cop        COP+ADJ
 *   advmod     ADV+VP
 *   mark/inf   TO+VP, SUB+S
 *
 * Test:
 *   1. How many of those pairs are already licensed?
 *   2. Grammar Valence Cyclotron on treebank-gate (not full EWT-test).
 *   3. Sandbox overfeed on the first 200 held-out EWT-test sentences ≤20.
 *
 * Falsifiers:
 *   F1  every conceptualized pair is already licensed
 *       (grammar is not missing those mechanisms)
 *   F2  cyclotron names 0 fireable novel bonds
 *   F3  cyclotron overfeed containment ≤ baseline
 *   F4  cyclotron overfeed does not beat frozen silicone on containment
 *
 * If F1 and F2 both fire, the claim fails toward typing/seeding.
 * If F3/F4 fail to fire, named gaps are real missing grammar.
 *
 * Does not edit the Grimoire.
 *
 *   node scripts/incomplete-grammar-cyclotron.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { goldAnswer, parseConllu } from '../codex/core/constellation/treebank.js';
import { FROZEN_EPITOPE_SILICONE } from '../codex/core/constellation/epitope-silicone.js';
import { runGrammarValenceCyclotron } from '../codex/core/pixelbrain/grammar-valence-cyclotron.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-16-incomplete-grammar-cyclotron.json');
const MAX = 20;

const HYPOTHESIZED = Object.freeze([
  Object.freeze({ left: 'P', right: 'NP', why: 'case wrap for silent as/of/after', deprel: 'case' }),
  Object.freeze({ left: 'V', right: 'PP', why: 'obl/advmod instead of V+P→V', deprel: 'obl' }),
  Object.freeze({ left: 'V', right: 'PRT', why: 'particle instead of V+P→V', deprel: 'compound' }),
  Object.freeze({ left: 'NP', right: 'PP', why: 'nmod instead of N+P→N', deprel: 'nmod' }),
  Object.freeze({ left: 'N', right: 'PP', why: 'nmod on bare N', deprel: 'nmod' }),
  Object.freeze({ left: 'V', right: 'NP', why: 'obj instead of V+DET→V', deprel: 'obj' }),
  Object.freeze({ left: 'DET', right: 'N', why: 'det instead of DET+V→DET', deprel: 'det' }),
  Object.freeze({ left: 'COP', right: 'ADJ', why: 'cop instead of AUX+ADJ→ADJ', deprel: 'cop' }),
  Object.freeze({ left: 'ADV', right: 'VP', why: 'advmod instead of ADV+MODAL→ADV', deprel: 'advmod' }),
  Object.freeze({ left: 'TO', right: 'VP', why: 'infinitive instead of TO+DET→TO', deprel: 'mark' }),
  Object.freeze({ left: 'SUB', right: 'S', why: 'mark instead of SUB+N→N', deprel: 'mark' }),
]);

function sha256Hex(data) {
  return createHash('sha256').update(JSON.stringify(data), 'utf8').digest('hex');
}

function licensedPair(left, right) {
  return BONDS.filter((b) => b[0] === left && b[1] === right)
    .map((b) => `${b[0]}|${b[1]}|${b[2]}`);
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

const hypothesized = HYPOTHESIZED.map((row) => {
  const hits = licensedPair(row.left, row.right);
  return { ...row, licensed: hits.length > 0, signatures: hits };
});
const alreadyLicensed = hypothesized.filter((r) => r.licensed);
const actuallyMissing = hypothesized.filter((r) => !r.licensed);

process.stderr.write(
  `hypothesized ${hypothesized.length}: licensed ${alreadyLicensed.length}, missing ${actuallyMissing.length}\n`,
);
const posMap = loadPosMap();
const gateRecords = parseConllu(
  readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'),
);
const testAll = loadSplit('test');
const SANDBOX_N = 200;

process.stderr.write(`cyclotron on treebank-gate n=${gateRecords.length} (not full EWT-test)…\n`);
const cyclotron = runGrammarValenceCyclotron(gateRecords, posMap, {
  minCount: 2,
  topPairs: 40,
  candidateLimit: 64,
});

const cyclotronCandidates = [];
for (const gap of cyclotron.gaps || []) {
  for (const cand of gap.candidates || []) {
    const bond = cand.bonds?.[0];
    if (!bond) continue;
    cyclotronCandidates.push({
      pair: gap.pair,
      occurrences: gap.occurrences,
      signature: cand.signature,
      left: bond.left,
      right: bond.right,
      result: bond.result,
      head: bond.head,
      verdict: cand.verdict,
      fireable: Boolean(cand.fireability?.fireable),
      reason: cand.reason,
      deprels: cand.evidence?.deprels || [],
    });
  }
}

const licensedSig = new Set(BONDS.map((b) => `${b[0]}|${b[1]}|${b[2]}`));
const novelFireable = [];
const seen = new Set();
for (const row of cyclotronCandidates) {
  if (row.verdict !== 'CANDIDATE_ONLY' || !row.fireable) continue;
  if (licensedSig.has(row.signature)) continue;
  if (seen.has(row.signature)) continue;
  seen.add(row.signature);
  novelFireable.push(row);
}

const cyclotronBonds = novelFireable
  .slice(0, 16)
  .map((row) => Object.freeze([row.left, row.right, row.result, row.head]));

const gateTexts = new Set(
  parseConllu(readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'))
    .map((r) => (r.tokens || []).map((t) => t.form).join(' ')),
);
const heldout = testAll.filter((r) => {
  const n = (r.tokens || []).length;
  if (n < 1 || n > MAX) return false;
  return !gateTexts.has(r.tokens.map((t) => t.form).join(' '));
}).slice(0, SANDBOX_N);

const SILICONE = Object.freeze([...BONDS, ...FROZEN_EPITOPE_SILICONE.bonds]);
const CYCLO = Object.freeze([...BONDS, ...cyclotronBonds]);

process.stderr.write(`sandbox baseline / silicone / cyclotron on ${heldout.length} sentences…\n`);
const started = Date.now();
const tally = {
  n: 0,
  threw: 0,
  baseParsed: 0,
  siParsed: 0,
  cyParsed: 0,
  baseContain: 0,
  siContain: 0,
  cyContain: 0,
};

for (let i = 0; i < heldout.length; i += 1) {
  const rec = heldout[i];
  const tokens = rec.tokens.map((t) => t.form);
  const gold = goldAnswer(rec);
  let base;
  let si;
  let cy;
  try {
    base = composePacked(tokens, posMap, {});
    si = composePacked(tokens, posMap, { bonds: SILICONE });
    cy = composePacked(tokens, posMap, { bonds: CYCLO });
  } catch {
    tally.threw += 1;
    continue;
  }
  tally.n += 1;
  if ((base.stable || []).length) tally.baseParsed += 1;
  if ((si.stable || []).length) tally.siParsed += 1;
  if ((cy.stable || []).length) tally.cyParsed += 1;
  if (contained(base, gold)) tally.baseContain += 1;
  if (contained(si, gold)) tally.siContain += 1;
  if (contained(cy, gold)) tally.cyContain += 1;
  if ((i + 1) % 150 === 0 || i + 1 === heldout.length) {
    process.stderr.write(`  ${i + 1}/${heldout.length}  n=${tally.n}\n`);
  }
}

const falsifiers = {
  F1_allHypothesizedAlreadyLicensed: actuallyMissing.length === 0,
  F2_cyclotronNamedNoFireableNovel: novelFireable.length === 0,
  F3_cyclotronContainmentNotAboveBaseline: tally.cyContain <= tally.baseContain,
  F4_cyclotronDoesNotBeatSiliconeContainment: tally.cyContain <= tally.siContain,
};

const grammarIncomplete = !falsifiers.F1_allHypothesizedAlreadyLicensed
  || !falsifiers.F2_cyclotronNamedNoFireableNovel;
const namedGapsHelp = !falsifiers.F3_cyclotronContainmentNotAboveBaseline;
const typingStory = falsifiers.F1_allHypothesizedAlreadyLicensed
  && (falsifiers.F2_cyclotronNamedNoFireableNovel || falsifiers.F3_cyclotronContainmentNotAboveBaseline);

let verdict;
if (typingStory) {
  verdict = 'TYPING — conceptualized mechanisms already exist; cyclotron did not name fireable missing grammar that beats baseline. Unknowns never become the types the Grimoire already consumes.';
} else if (grammarIncomplete && namedGapsHelp && !falsifiers.F4_cyclotronDoesNotBeatSiliconeContainment) {
  verdict = 'INCOMPLETE GRAMMAR — cyclotron-named bonds beat both baseline and frozen silicone. Still not Grimoire law.';
} else if (grammarIncomplete && namedGapsHelp) {
  verdict = 'MIXED — cyclotron named fireable gaps that beat baseline but not silicone. Some grammar is missing; silicone still covers more gold.';
} else {
  verdict = 'UNRESOLVED — hypothesized holes exist or cyclotron named pairs, but overfeed did not raise containment. Do not promote.';
}

const report = {
  contract: 'PB-INCOMPLETE-GRAMMAR-CYCLOTRON-v1',
  kind: 'cyclotron-plus-sandbox',
  elapsedMs: Date.now() - started,
  hypothesized,
  alreadyLicensed: alreadyLicensed.length,
  actuallyMissing: actuallyMissing.map((r) => `${r.left}+${r.right}`),
  cyclotron: {
    contract: cyclotron.contract,
    verdict: cyclotron.verdict,
    checksum: cyclotron.checksum,
    recordsInput: cyclotron.counts?.recordsInput,
    gapTypes: cyclotron.counts?.observedGapTypes,
    occurrences: cyclotron.counts?.occurrences,
    candidates: cyclotron.counts?.candidates,
    rejectedPairs: cyclotron.counts?.rejectedPairs,
    topGaps: (cyclotron.gaps || []).slice(0, 12).map((g) => ({
      pair: g.pair,
      n: g.occurrences,
      verdict: g.verdict,
      deprels: (g.dependencyEvidence || []).map((d) => d.deprel),
    })),
    novelFireable: novelFireable.slice(0, 16),
    overfed: cyclotronBonds.map((b) => `${b[0]}|${b[1]}|${b[2]}`),
  },
  sandbox: {
    n: tally.n,
    threw: tally.threw,
    parsed: { baseline: tally.baseParsed, silicone: tally.siParsed, cyclotron: tally.cyParsed },
    contain: { baseline: tally.baseContain, silicone: tally.siContain, cyclotron: tally.cyContain },
    containDeltaSi: tally.siContain - tally.baseContain,
    containDeltaCy: tally.cyContain - tally.baseContain,
  },
  falsifiers,
  verdict,
};

report.checksum = `incomplete-grammar-v1:${sha256Hex({
  hypothesized: hypothesized.map((r) => [r.left, r.right, r.licensed]),
  missing: report.actuallyMissing,
  cyclotron: {
    verdict: cyclotron.verdict,
    gaps: cyclotron.counts?.observedGapTypes,
    novel: novelFireable.map((r) => r.signature),
  },
  sandbox: report.sandbox,
  falsifiers,
  verdict,
})}`;

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

function rate(n, d) {
  return d ? `${n}/${d}=${(n / d).toFixed(3)}` : '0';
}

console.log('INCOMPLETE GRAMMAR? — conceptualized holes + cyclotron');
console.log('\nHYPOTHESIZED (from gold the silicone inverted)');
for (const row of hypothesized) {
  console.log(`  ${`${row.left}+${row.right}`.padEnd(12)} ${row.licensed ? 'LICENSED' : 'MISSING '}  ${row.signatures.join(',') || '—'}  ${row.why}`);
}
console.log(`  already licensed ${alreadyLicensed.length}/${hypothesized.length}  actually missing ${actuallyMissing.length}`);
console.log('\nCYCLOTRON');
console.log(`  ${cyclotron.verdict}  gaps=${cyclotron.counts?.observedGapTypes}  occ=${cyclotron.counts?.occurrences}  candidates=${cyclotron.counts?.candidates}`);
console.log(`  novel fireable ${novelFireable.length}: ${report.cyclotron.overfed.join(', ') || '(none)'}`);
for (const g of report.cyclotron.topGaps.slice(0, 8)) {
  console.log(`  gap ${String(g.n).padStart(4)}  ${g.pair.padEnd(14)} ${g.verdict}  ${(g.deprels || []).join(',')}`);
}
console.log('\nSANDBOX EWT-test ≤20');
console.log(`  parsed   base ${tally.baseParsed}  silicone ${tally.siParsed}  cyclotron ${tally.cyParsed}`);
console.log(`  contain  base ${tally.baseContain}  silicone ${tally.siContain} (Δ${tally.siContain - tally.baseContain})  cyclotron ${tally.cyContain} (Δ${tally.cyContain - tally.baseContain})`);
console.log('\nFALSIFIERS');
console.log(`  F1 all hypothesized licensed:     ${falsifiers.F1_allHypothesizedAlreadyLicensed}`);
console.log(`  F2 cyclotron no fireable novel:   ${falsifiers.F2_cyclotronNamedNoFireableNovel}`);
console.log(`  F3 cyclotron contain ≤ baseline:  ${falsifiers.F3_cyclotronContainmentNotAboveBaseline}`);
console.log(`  F4 cyclotron contain ≤ silicone:  ${falsifiers.F4_cyclotronDoesNotBeatSiliconeContainment}`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`evidence: ${EVIDENCE}`);
console.log(`checksum: ${report.checksum}`);
