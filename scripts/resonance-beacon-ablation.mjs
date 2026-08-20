#!/usr/bin/env node
/**
 * RESONANCE BEACON — THREE-ARM ABLATION
 *
 * The efficacy run answered "does the beacon beat first-pick". It did not
 * answer "which part of the beacon", and it reported net deltas, which cannot
 * distinguish 5 wins / 0 losses from 7 wins / 2 losses.
 *
 * Arms:
 *   FIRST    chart order (the incumbent)
 *   WTA      winner-take-all per cell — `consumeArray`, what ships
 *   SUM      summed cell voltage — `panelVoltage`, the design the module
 *            comment explicitly rejects ("summed wattage is not a reading")
 *   RANDOM   uniform choice among readings, averaged over R seeds
 *
 * Every arm is scored against FIRST with DISCORDANT counts (b, c) and an
 * exact two-sided sign test, so a null result is expressible.
 *
 * SCOPE: the token arm ablates cleanly here. The sentence arm cannot —
 * `scoreAnswer` and `scoreDerivationCandidate` call `readingScores`
 * internally, so swapping the scorer needs a hook in the module. The
 * sentence arm below is therefore FIRST vs BEACON vs RANDOM only, with
 * discordant counts. See the note at the end of the output.
 *
 *   node scripts/resonance-beacon-ablation.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { BONDS } from '../codex/core/constellation/compose.js';
import {
  readingScores,
  pickResonantAnswer,
  pickResonantDerivation,
  panelVoltage,
} from '../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT = 'docs/superpowers/evidence/2026-08-14-resonance-beacon-ablation.json';
const RANDOM_SEEDS = 200;

const UPOS = new Map([
  ['NOUN', ['N', 'NC']], ['PROPN', ['PROPN', 'N', 'NC']], ['VERB', ['V']],
  ['ADJ', ['ADJ']], ['ADV', ['ADV']], ['DET', ['DET']], ['ADP', ['P']],
  ['PRON', ['PRON', 'PRONACC']], ['AUX', ['AUX', 'MODAL', 'COP']],
  ['CCONJ', ['CONJ']], ['SCONJ', ['SUB']], ['PART', ['TO', 'PRT', 'POSS']],
  ['PUNCT', ['PUNCT', 'COMMA']],
]);

const same = (a, b) => (
  String(a?.subject || '').toLowerCase() === String(b?.subject || '').toLowerCase()
  && String(a?.verb || '').toLowerCase() === String(b?.verb || '').toLowerCase()
);

/** Deterministic RNG so the random arm is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** ARM SUM — summed cell voltage per reading, the rejected design. */
function summedScores(slot) {
  const atoms = slot.atoms || [];
  const list = (slot.types || []).map((type) => {
    const atom = atoms.find((a) => a.type === type);
    return { type, score: atom ? panelVoltage(atom) : 0 };
  });
  list.sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
  return list;
}

/** Exact two-sided sign test on discordant pairs. */
function signTest(b, c) {
  const n = b + c;
  if (n === 0) return { n: 0, p: 1 };
  const k = Math.min(b, c);
  let logC = 0;
  let tail = 0;
  const logFact = (m) => { let x = 0; for (let i = 2; i <= m; i += 1) x += Math.log(i); return x; };
  const lf = logFact(n);
  for (let i = 0; i <= k; i += 1) {
    logC = lf - logFact(i) - logFact(n - i);
    tail += Math.exp(logC + n * Math.log(0.5));
  }
  return { n, p: Math.min(1, 2 * tail) };
}

const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const baseline = JSON.parse(readFileSync(path.join(FIXTURES, 'treebank-gate-baseline.json'), 'utf8'));
const maxTokens = baseline.run.maxTokens;

// paired outcome vectors, one entry per AMBIGUOUS item
const tokenArms = { FIRST: [], WTA: [], SUM: [], RANDOM: [] };
const sentArms = { FIRST: [], BEACON: [], RANDOM: [] };
let parsed = 0, containedN = 0, sentences = 0, threw = 0, skipped = 0;
let tokensScored = 0;

for (const record of records) {
  const tokens = record.tokens.map((t) => t.form);
  if (tokens.length > maxTokens) { skipped += 1; continue; }
  sentences += 1;
  let chart;
  try { chart = composePacked(tokens, posMap); } catch { threw += 1; continue; }
  if (chart.stable.length > 0) parsed += 1;

  const gold = goldAnswer(record);
  const allAnswers = chart.stable.map((n) => projectAnswers(n)).flat();
  const uniq = [...new Map(allAnswers.map((a) => [`${a.subject ?? ''}|${a.verb ?? ''}`, a])).values()];
  if (allAnswers.some((a) => same(a, gold))) containedN += 1;

  // ---- SENTENCE ARM (ambiguous only) ----
  if (uniq.length > 1) {
    const first = allAnswers[0];
    const byString = pickResonantAnswer(allAnswers, chart.field, BONDS) || first;
    const byPath = chart.stable[0]
      ? pickResonantDerivation(chart.stable[0], chart.field, BONDS)
      : null;
    const beacon = byPath ? byPath.answer : byString;
    let rWins = 0;
    for (let s = 0; s < RANDOM_SEEDS; s += 1) {
      const r = rng(0x9e37 + s * 7919 + sentences);
      if (same(uniq[Math.floor(r() * uniq.length)], gold)) rWins += 1;
    }
    sentArms.FIRST.push(same(first, gold) ? 1 : 0);
    sentArms.BEACON.push(same(beacon, gold) ? 1 : 0);
    sentArms.RANDOM.push(rWins / RANDOM_SEEDS);
  }

  // ---- TOKEN ARM (ambiguous only) ----
  const wta = readingScores(chart.field, BONDS);
  for (let i = 0; i < record.tokens.length; i += 1) {
    const allow = UPOS.get(record.tokens[i].upos);
    const slot = chart.field[i];
    if (!allow || !slot || !slot.types || slot.types.length === 0) continue;
    tokensScored += 1;
    if (slot.types.length <= 1) continue;

    const hit = (t) => (t && allow.includes(t) ? 1 : 0);
    tokenArms.FIRST.push(hit(slot.types[0]));
    tokenArms.WTA.push(hit((wta[i] || [])[0]?.type));
    tokenArms.SUM.push(hit(summedScores(slot)[0]?.type));

    let rw = 0;
    for (let s = 0; s < RANDOM_SEEDS; s += 1) {
      const r = rng(0x51ed + s * 6271 + i * 131 + sentences);
      rw += hit(slot.types[Math.floor(r() * slot.types.length)]);
    }
    tokenArms.RANDOM.push(rw / RANDOM_SEEDS);
  }
}

function compare(base, arm, label) {
  let b = 0, c = 0, hitsBase = 0, hitsArm = 0;
  for (let i = 0; i < base.length; i += 1) {
    hitsBase += base[i]; hitsArm += arm[i];
    // discordance only defined for the deterministic arms (0/1)
    if (base[i] === 1 && arm[i] === 0) b += 1;
    if (base[i] === 0 && arm[i] === 1) c += 1;
  }
  const st = signTest(b, c);
  return {
    label, n: base.length,
    baseHits: +hitsBase.toFixed(2), armHits: +hitsArm.toFixed(2),
    net: +(hitsArm - hitsBase).toFixed(2),
    wins: c, losses: b, discordant: st.n, p: +st.p.toFixed(5),
  };
}

const report = {
  contract: 'PB-RESONANCE-BEACON-ABLATION-v1',
  sample: { sentences, skipped, threw, parsed, contained: containedN, tokensScored },
  sentence: {
    ambiguous: sentArms.FIRST.length,
    vsFirst: [
      compare(sentArms.FIRST, sentArms.BEACON, 'BEACON vs FIRST'),
      compare(sentArms.FIRST, sentArms.RANDOM, 'RANDOM vs FIRST'),
    ],
  },
  token: {
    ambiguous: tokenArms.FIRST.length,
    vsFirst: [
      compare(tokenArms.FIRST, tokenArms.WTA, 'WTA vs FIRST'),
      compare(tokenArms.FIRST, tokenArms.SUM, 'SUM vs FIRST'),
      compare(tokenArms.FIRST, tokenArms.RANDOM, 'RANDOM vs FIRST'),
    ],
    wtaVsSum: compare(tokenArms.SUM, tokenArms.WTA, 'WTA vs SUM'),
  },
};

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const row = (r) => `  ${r.label.padEnd(18)} n=${String(r.n).padStart(5)}  ` +
  `hits ${String(r.baseHits).padStart(7)} -> ${String(r.armHits).padStart(7)}  ` +
  `net ${String(r.net).padStart(7)}  wins=${String(r.wins).padStart(4)} losses=${String(r.losses).padStart(4)} ` +
  ` p=${r.p}`;

console.log('='.repeat(94));
console.log('RESONANCE BEACON — THREE-ARM ABLATION');
console.log(`sample: ${sentences} sentences, ${parsed} parsed, contained ${containedN}, ${tokensScored} tokens scored`);
console.log('='.repeat(94));
console.log(`\nSENTENCE (ambiguous n=${report.sentence.ambiguous})`);
for (const r of report.sentence.vsFirst) console.log(row(r));
console.log(`\nTOKEN (ambiguous n=${report.token.ambiguous})`);
for (const r of report.token.vsFirst) console.log(row(r));
console.log('\n  -- the ablation that matters --');
console.log(row(report.token.wtaVsSum));
console.log(`\nwrote ${OUT}`);
console.log('\nNOTE: wins/losses/p for the RANDOM arm are not meaningful — its per-item');
console.log('value is an average over seeds, not a 0/1 outcome. Read its `armHits` only.');
console.log('NOTE: the sentence arm is not ablated. scoreAnswer/scoreDerivationCandidate');
console.log('call readingScores internally; ablating them needs a scorer hook in the module.');
