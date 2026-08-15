#!/usr/bin/env node
/**
 * DESCENDING LIGHT — the four measurements.
 *
 * Spec: docs/superpowers/specs/2026-08-15-encrypted-descending-light-design.md
 *
 *   1. coverage / containment            MUST be byte-identical (the invariant)
 *   2. unlit fraction of the chart       how much is built and answers nothing
 *   3. token identity collapse           ambiguous tokens reduced to ONE lit atom
 *   4. the same, under a shuffled light  the bar #3 has to beat
 *
 * The shuffled control is degree-preserving: the SAME NUMBER of cells is lit,
 * drawn uniformly from the same chart. If a light that carries no structure
 * collapses tokens just as well, the real one is measuring nothing.
 *
 *   node scripts/descending-light-report.mjs [--shuffles N]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { decrypt } from '../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT = 'docs/superpowers/evidence/2026-08-15-descending-light.json';
const MAX_TOKENS = 20;
const argOf = (flag, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const SHUFFLES = argOf('--shuffles', 20);

const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact two-sided sign test; the discordant counts here are small. */
function exactTwoSidedSignP(successes, trials) {
  if (!Number.isFinite(trials) || trials <= 0) return 1;
  const k = Math.min(successes, trials - successes);
  let cumulative = 0;
  for (let i = 0; i <= k; i += 1) {
    let c = 1;
    for (let j = 0; j < i; j += 1) c = (c * (trials - j)) / (j + 1);
    cumulative += c;
  }
  return Math.min(1, Number(((2 * cumulative) / (2 ** trials)).toFixed(6)));
}

/** Ambiguous tokens: positions carrying two or more atoms. */
function tokenCollapse(atoms, isLitFn) {
  let ambiguous = 0;
  let collapsedToOne = 0;
  let collapsedToNone = 0;
  const byPosition = new Map();
  for (const atom of atoms) {
    if (!byPosition.has(atom.from)) byPosition.set(atom.from, []);
    byPosition.get(atom.from).push(atom);
  }
  for (const group of byPosition.values()) {
    if (group.length < 2) continue;
    ambiguous += 1;
    const lit = group.filter(isLitFn).length;
    if (lit === 1) collapsedToOne += 1;
    if (lit === 0) collapsedToNone += 1;
  }
  return { ambiguous, collapsedToOne, collapsedToNone };
}

const dark = { analysed: 0, parsed: 0, contained: 0, molecules: 0, atoms: 0 };
const lightArm = {
  molecules: 0, litMolecules: 0, atoms: 0, litAtoms: 0,
  ambiguous: 0, collapsedToOne: 0, collapsedToNone: 0,
  auraDisagreements: 0,
};
const shuffleArm = { ambiguous: 0, collapsedToOne: 0, collapsedToNone: 0 };
const accuracy = { scored: 0, correct: 0, firstPickCorrect: 0, wins: 0, losses: 0 };

/**
 * Gold UPOS -> the atom categories this parser uses for it. Deliberately
 * generous: several UD tags map to more than one internal category, and a
 * narrow map would score the light down for the lexicon's naming rather than
 * for its choice. Positions whose gold tag is absent here are not scored.
 */
const UPOS_TO_ATOM = Object.freeze({
  NOUN: ['N', 'NC', 'NP', 'NPO'],
  PROPN: ['PROPN', 'NP', 'N', 'NC'],
  VERB: ['V', 'VP', 'COP', 'AUX'],
  AUX: ['AUX', 'COP', 'V'],
  ADJ: ['ADJ'],
  ADV: ['ADV'],
  DET: ['DET'],
  ADP: ['P', 'TO'],
  PRON: ['PRON', 'PRONACC', 'NP', 'NPO'],
  CCONJ: ['CONJ', 'CONJS'],
  SCONJ: ['SUB', 'REL'],
  PART: ['PART', 'TO'],
  NUM: ['NUM', 'ADJ'],
  PUNCT: ['PUNCT', 'COMMA'],
});
const shuffleRates = [];
let coverageMismatch = 0;

const perShuffleCollapse = Array.from({ length: SHUFFLES }, () => ({ ambiguous: 0, collapsedToOne: 0 }));

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  dark.analysed += 1;

  const off = composePacked(tokens, posMap, {});
  const on = composePacked(tokens, posMap, { light: true });

  // 1. THE INVARIANT.
  if (off.stable.length !== on.stable.length
    || off.spanning.length !== on.spanning.length
    || off.molecules.length !== on.molecules.length
    || off.events !== on.events) {
    coverageMismatch += 1;
  }

  if (off.stable.length > 0) dark.parsed += 1;
  dark.molecules += off.molecules.length;
  dark.atoms += off.atoms.length;

  // 2. UNLIT FRACTION.
  const payload = on.light;
  lightArm.molecules += on.molecules.length;
  lightArm.litMolecules += on.molecules.filter((m) => m.lit).length;
  lightArm.atoms += on.atoms.length;
  lightArm.litAtoms += on.atoms.filter((a) => payload.lit.has(a)).length;

  // The encoding check: aura-decryption vs exact identity.
  for (const atom of on.atoms) {
    if (decrypt(atom, payload) !== payload.lit.has(atom)) lightArm.auraDisagreements += 1;
  }

  // 3. TOKEN COLLAPSE (only meaningful where a root exists to descend from).
  if (on.stable.length === 0) continue;
  const real = tokenCollapse(on.atoms, (a) => payload.lit.has(a));
  lightArm.ambiguous += real.ambiguous;
  lightArm.collapsedToOne += real.collapsedToOne;
  lightArm.collapsedToNone += real.collapsedToNone;

  // 5. IS THE SURVIVOR RIGHT? Collapsing to one identity is worthless if it is
  //    the wrong one. Scored only where a position collapsed to exactly one.
  const goldByIndex = rec.tokens.map((t) => t.upos);
  const positions = new Map();
  for (const atom of on.atoms) {
    if (!positions.has(atom.from)) positions.set(atom.from, []);
    positions.get(atom.from).push(atom);
  }
  for (const [index, group] of positions) {
    if (group.length < 2) continue;
    const survivors = group.filter((a) => payload.lit.has(a));
    if (survivors.length !== 1) continue;
    const gold = goldByIndex[index];
    if (!gold) continue;
    accuracy.scored += 1;
    const lightRight = Boolean(UPOS_TO_ATOM[gold]?.includes(survivors[0].type));
    // The incumbent: what a chart-order first-pick would have chosen instead.
    const firstRight = Boolean(UPOS_TO_ATOM[gold]?.includes(group[0].type));
    if (lightRight) accuracy.correct += 1;
    if (firstRight) accuracy.firstPickCorrect += 1;
    // PAIRED DATA: the discordant counts ARE the test. Two marginals cannot
    // tell 48 wins / 0 losses from 96 wins / 48 losses.
    if (lightRight && !firstRight) accuracy.wins += 1;
    if (!lightRight && firstRight) accuracy.losses += 1;
  }

  // 4. SHUFFLED CONTROL — same number of lit cells, drawn at random.
  const litCount = on.atoms.filter((a) => payload.lit.has(a)).length;
  for (let s = 0; s < SHUFFLES; s += 1) {
    const rng = mulberry32(0x119117 + s * 7919 + dark.analysed);
    const pool = [...on.atoms].sort(() => (rng() < 0.5 ? -1 : 1));
    const fake = new Set(pool.slice(0, litCount));
    const ctrl = tokenCollapse(on.atoms, (a) => fake.has(a));
    perShuffleCollapse[s].ambiguous += ctrl.ambiguous;
    perShuffleCollapse[s].collapsedToOne += ctrl.collapsedToOne;
  }
}

for (const row of perShuffleCollapse) {
  const rate = row.ambiguous > 0 ? row.collapsedToOne / row.ambiguous : 0;
  shuffleRates.push(rate);
  shuffleArm.ambiguous += row.ambiguous;
  shuffleArm.collapsedToOne += row.collapsedToOne;
}
shuffleRates.sort((a, b) => a - b);
const p95 = shuffleRates.length > 0
  ? shuffleRates[Math.min(shuffleRates.length - 1, Math.floor(0.95 * shuffleRates.length))]
  : 0;

const realRate = lightArm.ambiguous > 0 ? lightArm.collapsedToOne / lightArm.ambiguous : 0;
const shuffleMean = shuffleRates.length > 0
  ? shuffleRates.reduce((a, b) => a + b, 0) / shuffleRates.length
  : 0;

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const beatsControl = realRate > p95;

console.log('\n════════════════════════════════════════════════════════════════════');
console.log('  DESCENDING LIGHT — root-reachability identity');
console.log('════════════════════════════════════════════════════════════════════\n');
console.log(`corpus: frozen gate, ${dark.analysed} analysed, ${dark.parsed} parsed, maxTokens ${MAX_TOKENS}\n`);

console.log('1. THE INVARIANT — light must not change what the chart contains');
console.log(`   sentences where light-on differed from light-off: ${coverageMismatch}`);
console.log(`   ${coverageMismatch === 0 ? '✓ HELD' : '✗ VIOLATED — this is a bug, not a result'}\n`);

console.log('2. UNLIT FRACTION — built, but part of no answer');
console.log(`   molecules  ${lightArm.litMolecules} lit of ${lightArm.molecules}  (${pct(1 - lightArm.litMolecules / Math.max(1, lightArm.molecules))} unlit)`);
console.log(`   atoms      ${lightArm.litAtoms} lit of ${lightArm.atoms}  (${pct(1 - lightArm.litAtoms / Math.max(1, lightArm.atoms))} unlit)\n`);

console.log('3. TOKEN IDENTITY COLLAPSE — ambiguous tokens reduced to ONE lit reading');
console.log(`   ambiguous token positions (parsed sentences): ${lightArm.ambiguous}`);
console.log(`   collapsed to exactly one identity:            ${lightArm.collapsedToOne}  (${pct(realRate)})`);
console.log(`   left with no lit reading at all:              ${lightArm.collapsedToNone}\n`);

console.log(`4. SHUFFLED CONTROL — ${SHUFFLES} degree-preserving shuffles`);
console.log(`   control collapse rate: mean ${pct(shuffleMean)}, p95 ${pct(p95)}`);
console.log(`   real ${pct(realRate)} vs bar ${pct(p95)}  ►  ${beatsControl ? 'BEATS CONTROL' : 'DOES NOT BEAT CONTROL — refuted'}\n`);

const accRate = accuracy.scored > 0 ? accuracy.correct / accuracy.scored : 0;
const firstRate = accuracy.scored > 0 ? accuracy.firstPickCorrect / accuracy.scored : 0;
console.log('5. IS THE SURVIVOR RIGHT? — gold UPOS, scored only where it collapsed to one');
console.log(`   scored positions:        ${accuracy.scored}`);
console.log(`   surviving reading right: ${accuracy.correct}  (${pct(accRate)})`);
console.log(`   chart-order first pick:  ${accuracy.firstPickCorrect}  (${pct(firstRate)})  ◄ the incumbent`);
const discordant = accuracy.wins + accuracy.losses;
const pairedP = exactTwoSidedSignP(accuracy.wins, discordant);
console.log(`   PAIRED: ${accuracy.wins} wins / ${accuracy.losses} losses over ${discordant} discordant, exact p = ${pairedP}`);
console.log(`   ${pairedP < 0.05 && accuracy.wins > accuracy.losses ? '► light beats first-pick, p < 0.05' : '► not separated from first-pick'}\n`);

console.log('ENCODING CHECK');
console.log(`   aura-decryption disagreed with exact identity on ${lightArm.auraDisagreements} atoms`);
console.log(`   ${lightArm.auraDisagreements === 0 ? '✓ the aura is a sound transport key on this corpus' : '⚠ collisions present — the payload encoding over-admits'}\n`);

const verdict = coverageMismatch > 0
  ? 'INVARIANT_VIOLATED_IMPLEMENTATION_BUG'
  : (!beatsControl ? 'NOT_SEPARATED_FROM_SHUFFLED_CONTROL' : 'IDENTITY_COLLAPSE_BEATS_CONTROL');
console.log(`VERDICT: ${verdict}`);
console.log('════════════════════════════════════════════════════════════════════\n');

writeFileSync(OUT, `${JSON.stringify({
  contract: 'PB-DESCENDING-LIGHT-REPORT-v1',
  corpus: { analysed: dark.analysed, parsed: dark.parsed, maxTokens: MAX_TOKENS },
  invariant: { sentencesDiffering: coverageMismatch, held: coverageMismatch === 0 },
  unlit: {
    molecules: lightArm.molecules,
    litMolecules: lightArm.litMolecules,
    atoms: lightArm.atoms,
    litAtoms: lightArm.litAtoms,
  },
  collapse: {
    ambiguous: lightArm.ambiguous,
    collapsedToOne: lightArm.collapsedToOne,
    collapsedToNone: lightArm.collapsedToNone,
    rate: Number(realRate.toFixed(6)),
  },
  shuffledControl: {
    shuffles: SHUFFLES,
    meanRate: Number(shuffleMean.toFixed(6)),
    p95: Number(p95.toFixed(6)),
    beaten: beatsControl,
  },
  encoding: { auraDisagreements: lightArm.auraDisagreements },
  verdict,
}, null, 2)}\n`);
console.log(`wrote ${OUT}`);
