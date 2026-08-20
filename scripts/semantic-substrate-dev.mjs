#!/usr/bin/env node
/**
 * DEV substrate tribunal. TRAIN authored the lists. TEST is not opened.
 *
 * T1 accuracy is printed only after the exposure gate passes.
 *
 *   node scripts/semantic-substrate-dev.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { atomsFor } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { goldAnswer } from '../codex/core/constellation/treebank.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { derangeFeatureValues } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { pickScoredReading } from '../codex/core/constellation/semantic-particles/feature-score.js';
import {
  evaluateExposure,
  efficacyVerdict,
} from '../codex/core/constellation/semantic-particles/exposure-gate.js';
import {
  freezeSelectionalIndex,
  selectionalCharge,
} from '../codex/core/constellation/semantic-particles/selectional-index.js';
import { exactTwoSidedSignP, formatPValue } from '../codex/core/constellation/semantic-particles/stats.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-16-semantic-substrate-dev.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-16-semantic-substrate-dev.md';
const DERANGE_SEED = 0x53454d31;
const MAX_TOKENS = 28;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
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
  PART: ['PART', 'TO', 'PRT', 'POSS'],
});

if (existsSync(TEST_PATH)) {
  // sealed
}

function gitHead() {
  try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return null; }
}

function typeHitsGold(type, upos) {
  return Boolean(UPOS_TO_ATOM[upos]?.includes(type));
}

function sameAnswer(a, b) {
  return String(a?.subject || '').toLowerCase() === String(b?.subject || '').toLowerCase()
    && String(a?.verb || '').toLowerCase() === String(b?.verb || '').toLowerCase();
}

function uniqueAnswers(chart) {
  const all = (chart.stable || []).flatMap((node) => projectAnswers(node));
  const byKey = new Map();
  for (const ans of all) byKey.set(`${ans.subject ?? ''}|${ans.verb ?? ''}`, ans);
  return [...byKey.values()];
}

function goldRoleRows(records) {
  const map = new Map();
  for (const rec of records) {
    const byId = new Map(rec.tokens.map((t) => [t.id, t]));
    for (const tok of rec.tokens) {
      const head = byId.get(tok.head);
      if (!head) continue;
      const predicate = String(head.lemma || head.form).toLowerCase();
      const filler = String(tok.lemma || tok.form).toLowerCase();
      let role = null;
      if (tok.deprel === 'nsubj' || tok.deprel === 'nsubj:pass') role = 'subject-like';
      else if (tok.deprel === 'obj') role = 'object-like';
      else if (tok.deprel === 'obl' || String(tok.deprel).startsWith('obl:')) role = 'pp-complement';
      else if (tok.deprel === 'amod' || tok.deprel === 'advmod') role = 'modifier';
      if (!role) continue;
      const key = `${predicate}\t${role}\t${filler}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map.entries()].map(([key, count]) => {
    const [predicate, role, filler] = key.split('\t');
    return { predicate, role, filler, count };
  });
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function permuteField(rows, field, seed) {
  const values = rows.map((r) => r[field]);
  const rand = lcg(seed);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
  return rows.map((r, i) => ({ ...r, [field]: values[i] }));
}

function nodeStub(type, lemma, from) {
  return {
    type, from, to: from, token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
  };
}

function chargeAnswer(answer, index, extra = {}) {
  if (!answer?.verb) return { abstain: true, score: null, forward: null, inverse: null };
  return selectionalCharge(
    nodeStub('NP', String(answer.subject || '').toLowerCase(), 0),
    nodeStub('VP', String(answer.verb).toLowerCase(), 1),
    ['NP', 'VP', 'S', 1],
    index,
    extra,
  );
}

function pickByCharge(answers, index, extra = {}) {
  let best = answers[0];
  let bestScore = -Infinity;
  let any = false;
  let fwdUsed = 0;
  let invUsed = 0;
  for (const ans of answers) {
    const hit = chargeAnswer(ans, index, extra);
    if (hit.forward) fwdUsed += 1;
    if (hit.inverse) invUsed += 1;
    if (hit.abstain || hit.score == null) continue;
    any = true;
    if (hit.score > bestScore) {
      bestScore = hit.score;
      best = ans;
    }
  }
  return {
    pick: any ? best : answers[0],
    abstained: !any,
    fallback: 'first-if-abstain',
    forwardPresent: fwdUsed > 0,
    inversePresent: invUsed > 0,
  };
}

function pickByUnigram(answers, freq) {
  let best = answers[0];
  let bestScore = -Infinity;
  let any = false;
  for (const ans of answers) {
    const s = freq.get(String(ans.subject || '').toLowerCase()) || 0;
    const v = freq.get(String(ans.verb || '').toLowerCase()) || 0;
    if (s + v === 0) continue;
    any = true;
    const score = Math.log(s + 1) + Math.log(v + 1);
    if (score > bestScore) {
      bestScore = score;
      best = ans;
    }
  }
  return { pick: any ? best : answers[0], abstained: !any, fallback: 'first-if-abstain' };
}

const posMap = loadPosMap();
const dev = loadSplit('dev');
const train = loadSplit('train');
const realProvider = EXPERIMENTAL_FEATURE_PROVIDER;
const derangedProvider = derangeFeatureValues(realProvider, DERANGE_SEED);

const t1 = {
  ambiguous: 0,
  withEvidence: 0,
  allUnknown: 0,
  scoreDisagreements: 0,
  rankDisagreements: 0,
  firstHit: 0,
  realHit: 0,
  derangeHit: 0,
  realVsDerangeWin: 0,
  realVsDerangeLoss: 0,
};

for (const rec of dev) {
  const tokens = rec.tokens || [];
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  const atomsByIndex = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    const atoms = atomsFor(tokens[i].form, i, posMap) || [];
    if (atoms.length) atomsByIndex.set(i, atoms);
  }
  for (const [index, group] of atomsByIndex) {
    if (group.length < 2) continue;
    const goldUpos = tokens[index]?.upos;
    if (!goldUpos || !UPOS_TO_ATOM[goldUpos]) continue;
    t1.ambiguous += 1;
    const neighbors = [];
    for (const [sideIndex, side] of [[index - 1, 'left'], [index + 1, 'right']]) {
      const nb = atomsByIndex.get(sideIndex);
      if (nb?.[0]?.token) {
        neighbors.push({ lemma: String(nb[0].token).toLowerCase(), type: nb[0].type, side });
      }
    }
    const real = pickScoredReading(group, neighbors, realProvider);
    const deranged = pickScoredReading(group, neighbors, derangedProvider);
    const realRow = real.rows.find((r) => r.type === real.pick.type);
    const derRow = deranged.rows.find((r) => r.type === deranged.pick.type);
    if (realRow && !realRow.allUnknown) t1.withEvidence += 1;
    if (!realRow || realRow.allUnknown) t1.allUnknown += 1;
    if ((realRow?.score ?? null) !== (derRow?.score ?? null)) t1.scoreDisagreements += 1;
    if (real.pick.type !== deranged.pick.type) t1.rankDisagreements += 1;
    if (typeHitsGold(group[0].type, goldUpos)) t1.firstHit += 1;
    if (typeHitsGold(real.pick.type, goldUpos)) t1.realHit += 1;
    if (typeHitsGold(deranged.pick.type, goldUpos)) t1.derangeHit += 1;
    const realOk = typeHitsGold(real.pick.type, goldUpos);
    const derOk = typeHitsGold(deranged.pick.type, goldUpos);
    if (realOk && !derOk) t1.realVsDerangeWin += 1;
    if (!realOk && derOk) t1.realVsDerangeLoss += 1;
  }
}

const exposure = evaluateExposure(t1);

const trainRows = goldRoleRows(train);
const realIndex = freezeSelectionalIndex({ corpusHash: 'ewt-train-roles', rows: trainRows });
const roleShuffle = freezeSelectionalIndex({
  corpusHash: 'ewt-train-roles:role',
  rows: trainRows.map((r) => ({
    ...r,
    role: r.role === 'subject-like' ? 'object-like' : r.role === 'object-like' ? 'subject-like' : r.role,
  })),
});
const predShuffle = freezeSelectionalIndex({
  corpusHash: 'ewt-train-roles:pred',
  rows: permuteField(trainRows, 'predicate', 0x50524544),
});
const fillShuffle = freezeSelectionalIndex({
  corpusHash: 'ewt-train-roles:fill',
  rows: permuteField(trainRows, 'filler', 0x46494c4c),
});
const freq = new Map();
for (const row of trainRows) freq.set(row.filler, (freq.get(row.filler) || 0) + row.count);

const t2 = {
  n: 0,
  first: 0,
  unigram: 0,
  forward: 0,
  inverse: 0,
  both: 0,
  roleShuffle: 0,
  predShuffle: 0,
  fillShuffle: 0,
  nullCharge: 0,
  bothVsFirstWin: 0,
  bothVsFirstLoss: 0,
  bothVsUniWin: 0,
  bothVsUniLoss: 0,
  bothVsRoleWin: 0,
  bothVsRoleLoss: 0,
  forwardPresent: 0,
  inversePresent: 0,
  forwardChangesFirst: 0,
  inverseChangesFirst: 0,
  bothChangesFirst: 0,
  forwardEqualsBoth: 0,
  inverseEqualsBoth: 0,
  parsed: 0,
  analysed: 0,
  threw: 0,
  goldContained: 0,
  events: [],
  recPres: [],
};
const fingerprints = [];

for (const rec of dev) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  t2.analysed += 1;
  let chart;
  try {
    chart = composePacked(tokens, posMap, {});
  } catch {
    t2.threw += 1;
    continue;
  }
  t2.events.push(chart.events || 0);
  t2.recPres.push(chart.reactions?.recursivePreservative || 0);
  if (chart.stable.length) t2.parsed += 1;
  const answers = uniqueAnswers(chart);
  const gold = goldAnswer(rec);
  if (answers.some((a) => sameAnswer(a, gold))) t2.goldContained += 1;
  if (fingerprints.length < 8) {
    const again = composePacked(tokens, posMap, {});
    fingerprints.push(forestFingerprint(chart) === forestFingerprint(again));
  }
  if (!chart.stable.length || answers.length < 2) continue;
  t2.n += 1;
  const first = answers[0];
  const uni = pickByUnigram(answers, freq);
  const fwd = pickByCharge(answers, realIndex, { direction: 'forward' });
  const inv = pickByCharge(answers, realIndex, { direction: 'inverse' });
  const both = pickByCharge(answers, realIndex, { direction: 'both' });
  const role = pickByCharge(answers, roleShuffle, { direction: 'both' });
  const pred = pickByCharge(answers, predShuffle, { direction: 'both' });
  const fill = pickByCharge(answers, fillShuffle, { direction: 'both' });
  const nil = { pick: first, abstained: true, fallback: 'first-if-abstain' };
  if (sameAnswer(first, gold)) t2.first += 1;
  if (sameAnswer(uni.pick, gold)) t2.unigram += 1;
  if (sameAnswer(fwd.pick, gold)) t2.forward += 1;
  if (sameAnswer(inv.pick, gold)) t2.inverse += 1;
  if (sameAnswer(both.pick, gold)) t2.both += 1;
  if (sameAnswer(role.pick, gold)) t2.roleShuffle += 1;
  if (sameAnswer(pred.pick, gold)) t2.predShuffle += 1;
  if (sameAnswer(fill.pick, gold)) t2.fillShuffle += 1;
  if (sameAnswer(nil.pick, gold)) t2.nullCharge += 1;
  if (fwd.forwardPresent) t2.forwardPresent += 1;
  if (inv.inversePresent) t2.inversePresent += 1;
  if (!sameAnswer(fwd.pick, first)) t2.forwardChangesFirst += 1;
  if (!sameAnswer(inv.pick, first)) t2.inverseChangesFirst += 1;
  if (!sameAnswer(both.pick, first)) t2.bothChangesFirst += 1;
  if (sameAnswer(fwd.pick, both.pick)) t2.forwardEqualsBoth += 1;
  if (sameAnswer(inv.pick, both.pick)) t2.inverseEqualsBoth += 1;
  const bothOk = sameAnswer(both.pick, gold);
  if (bothOk && !sameAnswer(first, gold)) t2.bothVsFirstWin += 1;
  if (!bothOk && sameAnswer(first, gold)) t2.bothVsFirstLoss += 1;
  if (bothOk && !sameAnswer(uni.pick, gold)) t2.bothVsUniWin += 1;
  if (!bothOk && sameAnswer(uni.pick, gold)) t2.bothVsUniLoss += 1;
  if (bothOk && !sameAnswer(role.pick, gold)) t2.bothVsRoleWin += 1;
  if (!bothOk && sameAnswer(role.pick, gold)) t2.bothVsRoleLoss += 1;
}

const rate = (h, n) => (n > 0 ? h / n : null);
const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const t1Paired = formatPValue(exactTwoSidedSignP(
  t1.realVsDerangeWin,
  t1.realVsDerangeWin + t1.realVsDerangeLoss,
));
const vsFirst = formatPValue(exactTwoSidedSignP(t2.bothVsFirstWin, t2.bothVsFirstWin + t2.bothVsFirstLoss));
const vsUni = formatPValue(exactTwoSidedSignP(t2.bothVsUniWin, t2.bothVsUniWin + t2.bothVsUniLoss));
const vsRole = formatPValue(exactTwoSidedSignP(t2.bothVsRoleWin, t2.bothVsRoleWin + t2.bothVsRoleLoss));

const t1Efficacy = exposure.evaluateEfficacy
  ? efficacyVerdict({ realHits: t1.realHit, derangeHits: t1.derangeHit, nullHits: t1.firstHit })
  : null;

const report = {
  contract: 'PB-SEMANTIC-SUBSTRATE-DEV-v1',
  testFileOpened: false,
  commit: gitHead(),
  maxTokens: MAX_TOKENS,
  t1: {
    exposure,
    ambiguous: t1.ambiguous,
    withEvidence: t1.withEvidence,
    allUnknown: t1.allUnknown,
    scoreDisagreements: t1.scoreDisagreements,
    rankDisagreements: t1.rankDisagreements,
    paired: {
      wins: t1.realVsDerangeWin,
      losses: t1.realVsDerangeLoss,
      ...t1Paired,
    },
    accuracy: exposure.evaluateEfficacy ? {
      first: rate(t1.firstHit, t1.ambiguous),
      real: rate(t1.realHit, t1.ambiguous),
      derange: rate(t1.derangeHit, t1.ambiguous),
      verdict: t1Efficacy,
    } : null,
  },
  t2: {
    n: t2.n,
    fallback: 'first-if-abstain',
    rates: {
      first: rate(t2.first, t2.n),
      unigram: rate(t2.unigram, t2.n),
      forward: rate(t2.forward, t2.n),
      inverse: rate(t2.inverse, t2.n),
      both: rate(t2.both, t2.n),
      roleShuffle: rate(t2.roleShuffle, t2.n),
      predShuffle: rate(t2.predShuffle, t2.n),
      fillShuffle: rate(t2.fillShuffle, t2.n),
      nullCharge: rate(t2.nullCharge, t2.n),
    },
    mechanism: {
      forwardPresent: t2.forwardPresent,
      inversePresent: t2.inversePresent,
      forwardChangesFirst: t2.forwardChangesFirst,
      inverseChangesFirst: t2.inverseChangesFirst,
      bothChangesFirst: t2.bothChangesFirst,
      forwardEqualsBoth: t2.forwardEqualsBoth,
      inverseEqualsBoth: t2.inverseEqualsBoth,
    },
    paired: {
      vsFirst: { wins: t2.bothVsFirstWin, losses: t2.bothVsFirstLoss, ...vsFirst },
      vsUnigram: { wins: t2.bothVsUniWin, losses: t2.bothVsUniLoss, ...vsUni },
      vsRoleShuffle: { wins: t2.bothVsRoleWin, losses: t2.bothVsRoleLoss, ...vsRole },
    },
  },
  protection: {
    analysed: t2.analysed,
    parsed: t2.parsed,
    threw: t2.threw,
    goldContained: t2.goldContained,
    coverage: rate(t2.parsed, t2.analysed),
    containment: rate(t2.goldContained, t2.analysed),
    eventsMean: mean(t2.events),
    recPresMean: mean(t2.recPres),
    fingerprintsIdentical: fingerprints.every(Boolean),
  },
};

const md = [];
md.push('# RESULT — Semantic Substrate DEV tribunal');
md.push('');
md.push('TEST was not opened. T3 was not run. T1 accuracy is omitted unless exposure passes.');
md.push('');
md.push(`- commit \`${report.commit}\``);
md.push(`- T1 exposure: **${exposure.verdict}**`);
md.push(`  ambiguous ${t1.ambiguous}, evidence ${pct(exposure.evidenceRate)}, UNKNOWN ${pct(exposure.allUnknownRate)}, score-disagree ${pct(exposure.scoreDisagreementRate)}, rank-disagree ${t1.rankDisagreements}`);
if (exposure.failures.length) md.push(`  failures: ${exposure.failures.join(', ')}`);
if (report.t1.accuracy) {
  md.push(`- T1 accuracy first ${pct(report.t1.accuracy.first)} real ${pct(report.t1.accuracy.real)} derange ${pct(report.t1.accuracy.derange)} (${t1Paired.printed})`);
  md.push(`  efficacy **${t1Efficacy}**`);
} else {
  md.push('- T1 accuracy: withheld (exposure gate)');
}
md.push(`- T2 n=${t2.n} fallback=${t2.fallback || 'first-if-abstain'}`);
md.push(`  first ${pct(report.t2.rates.first)} unigram ${pct(report.t2.rates.unigram)} forward ${pct(report.t2.rates.forward)} inverse ${pct(report.t2.rates.inverse)} both ${pct(report.t2.rates.both)}`);
md.push(`  role-shuffle ${pct(report.t2.rates.roleShuffle)} pred-shuffle ${pct(report.t2.rates.predShuffle)} filler-shuffle ${pct(report.t2.rates.fillShuffle)} null ${pct(report.t2.rates.nullCharge)}`);
md.push(`  both vs first ${t2.bothVsFirstWin}/${t2.bothVsFirstLoss} ${vsFirst.printed}; vs unigram ${t2.bothVsUniWin}/${t2.bothVsUniLoss} ${vsUni.printed}; vs role-shuffle ${t2.bothVsRoleWin}/${t2.bothVsRoleLoss} ${vsRole.printed}`);
md.push(`  forward present ${t2.forwardPresent}/${t2.n}, inverse present ${t2.inversePresent}/${t2.n}, forward=both ${t2.forwardEqualsBoth}/${t2.n}, inverse=both ${t2.inverseEqualsBoth}/${t2.n}`);
md.push(`- protection coverage ${pct(report.protection.coverage)} containment ${pct(report.protection.containment)} threw ${t2.threw} fingerprints ${report.protection.fingerprintsIdentical}`);
md.push('');
md.push('Reproduction: `node scripts/semantic-substrate-dev.mjs`');
md.push('');

writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(md.join('\n'));
console.log(`wrote ${OUT}`);
