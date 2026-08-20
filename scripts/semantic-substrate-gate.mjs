#!/usr/bin/env node
/**
 * SEMANTIC SUBSTRATE GATE
 *
 * T1/T2 only. Exposure before accuracy. T3–T10 efficacy is not in scope.
 *
 *   node scripts/semantic-substrate-gate.mjs
 *
 * Prereg: docs/superpowers/evidence/2026-08-16-PREREG-semantic-substrate-gate.md
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { goldAnswer, parseConllu } from '../codex/core/constellation/treebank.js';
import { forestFingerprint } from '../codex/core/constellation/semantic-particles/annotate.js';
import {
  EXPERIMENTAL_FEATURE_PROVIDER,
  EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
} from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { derangeFeatureValues } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { pickScoredReading } from '../codex/core/constellation/semantic-particles/feature-score.js';
import {
  EXPOSURE_THRESHOLDS,
  efficacyVerdict,
  evaluateExposure,
} from '../codex/core/constellation/semantic-particles/exposure-gate.js';
import {
  freezeSelectionalIndex,
  selectionalCharge,
} from '../codex/core/constellation/semantic-particles/selectional-index.js';
import { loadPosMap } from './lib/constellation-corpus.mjs';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const OUT_JSON = 'docs/superpowers/evidence/2026-08-16-semantic-substrate-gate.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-16-semantic-substrate-gate.md';
const DERANGE_SEED = 0x53454d31;
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
  PUNCT: ['PUNCT', 'COMMA'],
});

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sameAnswer(a, b) {
  return String(a?.subject || '').toLowerCase() === String(b?.subject || '').toLowerCase()
    && String(a?.verb || '').toLowerCase() === String(b?.verb || '').toLowerCase();
}

function typeHitsGold(type, upos) {
  return Boolean(UPOS_TO_ATOM[upos]?.includes(type));
}

function docKey(sentId) {
  if (!sentId) return 'unknown';
  const parts = String(sentId).split('-');
  return parts.length >= 2 ? parts.slice(0, -1).join('-') : sentId;
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

function nodeStub(type, lemma, from) {
  return {
    type,
    from,
    to: from,
    token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
  };
}

function chargeAnswer(answer, index, extra = {}) {
  if (!answer?.verb) return { abstain: true, score: null };
  const left = nodeStub('NP', String(answer.subject || '').toLowerCase(), 0);
  const right = nodeStub('VP', String(answer.verb).toLowerCase(), 1);
  return selectionalCharge(left, right, ['NP', 'VP', 'S', 1], index, extra);
}

function pickByCharge(answers, index, extra = {}) {
  let best = answers[0];
  let bestScore = -Infinity;
  let any = false;
  const rows = [];
  for (const ans of answers) {
    const hit = chargeAnswer(ans, index, extra);
    rows.push({ answer: ans, ...hit });
    if (hit.abstain || hit.score == null) continue;
    any = true;
    if (hit.score > bestScore) {
      bestScore = hit.score;
      best = ans;
    }
  }
  return { pick: any ? best : answers[0], abstained: !any, rows };
}

function unigramScore(answer, freq) {
  const s = freq.get(String(answer.subject || '').toLowerCase()) || 0;
  const v = freq.get(String(answer.verb || '').toLowerCase()) || 0;
  if (s + v === 0) return null;
  return Math.log(s + 1) + Math.log(v + 1);
}

function pickByUnigram(answers, freq) {
  let best = answers[0];
  let bestScore = -Infinity;
  let any = false;
  for (const ans of answers) {
    const score = unigramScore(ans, freq);
    if (score == null) continue;
    any = true;
    if (score > bestScore) {
      bestScore = score;
      best = ans;
    }
  }
  return { pick: any ? best : answers[0], abstained: !any };
}

function loadConllu(rel) {
  const p = path.resolve(rel);
  if (!existsSync(p)) return [];
  return parseConllu(readFileSync(p, 'utf8'));
}

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

const realProvider = EXPERIMENTAL_FEATURE_PROVIDER;
const derangedProvider = derangeFeatureValues(realProvider, DERANGE_SEED);
const posMap = loadPosMap();

const gateRecords = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const gatePos = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const gateDocs = [...new Set(gateRecords.map((r) => docKey(r.sentId)))].sort();
const gateTrainDocs = new Set(gateDocs.filter((_, i) => i % 2 === 0));
const gateEvalDocs = new Set(gateDocs.filter((_, i) => i % 2 === 1));
const gateTrainIndex = freezeSelectionalIndex({
  corpusHash: `gate-train:${sha256File(path.join(FIX, 'treebank-gate.conllu')).slice(0, 16)}`,
  rows: goldRoleRows(gateRecords.filter((r) => gateTrainDocs.has(docKey(r.sentId)))),
});
const gateFreq = new Map();
for (const row of goldRoleRows(gateRecords.filter((r) => gateTrainDocs.has(docKey(r.sentId))))) {
  gateFreq.set(row.filler, (gateFreq.get(row.filler) || 0) + row.count);
}

const autopsy = [];
for (const rec of gateRecords) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > 20) continue;
  if (!gateEvalDocs.has(docKey(rec.sentId))) continue;
  let chart;
  try {
    chart = composePacked(tokens, gatePos, {});
  } catch {
    continue;
  }
  if (!chart.stable.length) continue;
  const answers = uniqueAnswers(chart);
  if (answers.length < 2) continue;
  const gold = goldAnswer(rec);
  const uni = pickByUnigram(answers, gateFreq);
  const charged = pickByCharge(answers, gateTrainIndex, {
    featureProvider: realProvider,
  });
  const uniOk = sameAnswer(uni.pick, gold);
  const chOk = sameAnswer(charged.pick, gold);
  if (uniOk && !chOk) {
    const winner = charged.rows.find((r) => sameAnswer(r.answer, charged.pick)) || {};
    const loser = charged.rows.find((r) => sameAnswer(r.answer, gold)) || {};
    autopsy.push({
      sentId: rec.sentId,
      text: rec.text,
      gold,
      unigramWinner: uni.pick,
      chargeWinner: charged.pick,
      chargeOnWinner: {
        forward: winner.forward,
        inverse: winner.inverse,
        score: winner.score,
        pairCount: winner.pairCount,
        predicateCount: winner.predicateCount,
        fillerCount: winner.fillerCount,
        backoff: winner.backoff,
        predicate: winner.predicate,
        filler: winner.filler,
        role: winner.role,
      },
      chargeOnGold: {
        forward: loser.forward,
        inverse: loser.inverse,
        score: loser.score,
        pairCount: loser.pairCount,
        predicateCount: loser.predicateCount,
        fillerCount: loser.fillerCount,
        backoff: loser.backoff,
        predicate: loser.predicate,
        filler: loser.filler,
        role: loser.role,
        abstain: loser.abstain,
      },
    });
  }
}

const sparseLosses = autopsy.filter((a) => (
  (a.chargeOnWinner.pairCount || 0) > 0 && (a.chargeOnWinner.pairCount || 0) < 3
));
const inverseDominant = autopsy.filter((a) => (
  Math.abs(a.chargeOnWinner.inverse || 0) > Math.abs(a.chargeOnWinner.forward || 0)
));
let t2Repair = { minSupport: 0, scoreCap: null, direction: 'both', reason: 'none' };
if (autopsy.length && sparseLosses.length === autopsy.length) {
  t2Repair = {
    minSupport: 3,
    scoreCap: 1.5,
    direction: 'both',
    reason: 'all-losses-sparse-count',
  };
} else if (autopsy.length && inverseDominant.length === autopsy.length) {
  t2Repair = {
    minSupport: 0,
    scoreCap: null,
    direction: 'forward',
    reason: 'all-losses-inverse-dominant',
  };
}

const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
if (existsSync(TEST_PATH)) {
  // Sealed. Do not parse.
}

const devRecords = loadConllu('cache/ud/en_ewt-ud-dev.conllu');
const trainRecords = loadConllu('cache/ud/en_ewt-ud-train.conllu');

function collectChamber(records, maxTokens, source, limit) {
  const items = [];
  let parsed = 0;
  let analysed = 0;
  let threw = 0;
  let goldContained = 0;
  const events = [];
  const recPres = [];
  for (const rec of records) {
    if (items.length >= limit) break;
    const tokens = rec.tokens.map((t) => t.form);
    if (tokens.length === 0 || tokens.length > maxTokens) continue;
    analysed += 1;
    let chart;
    try {
      chart = composePacked(tokens, posMap, {});
    } catch {
      threw += 1;
      continue;
    }
    const answers = uniqueAnswers(chart);
    const gold = goldAnswer(rec);
    const spanned = chart.stable.length > 0;
    if (spanned) parsed += 1;
    events.push(chart.events || 0);
    recPres.push(chart.reactions?.recursivePreservative || 0);
    if (answers.some((a) => sameAnswer(a, gold))) goldContained += 1;
    const distinctGoldRelevant = spanned && answers.length >= 2;
    if (!distinctGoldRelevant) continue;
    items.push({ rec, tokens, chart, answers, gold, source });
  }
  return { items, parsed, analysed, threw, goldContained, events, recPres };
}

let maxTokens = 20;
let chamber = collectChamber(devRecords, maxTokens, 'dev', 10_000);
if (chamber.items.length < 300) {
  maxTokens = 28;
  chamber = collectChamber(devRecords, maxTokens, 'dev', 10_000);
}
if (chamber.items.length < 300) {
  const extra = collectChamber(trainRecords, maxTokens, 'train', 10_000);
  chamber = {
    items: [...chamber.items, ...extra.items],
    parsed: chamber.parsed + extra.parsed,
    analysed: chamber.analysed + extra.analysed,
    threw: chamber.threw + extra.threw,
    goldContained: chamber.goldContained + extra.goldContained,
    events: [...chamber.events, ...extra.events],
    recPres: [...chamber.recPres, ...extra.recPres],
  };
}

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

for (const item of chamber.items) {
  const atomsByIndex = new Map();
  for (const atom of item.chart.atoms || []) {
    const row = atomsByIndex.get(atom.from) || [];
    row.push(atom);
    atomsByIndex.set(atom.from, row);
  }
  for (const [index, group] of atomsByIndex) {
    if (group.length < 2) continue;
    const goldUpos = item.rec.tokens[index]?.upos;
    if (!goldUpos || !UPOS_TO_ATOM[goldUpos]) continue;
    t1.ambiguous += 1;
    const neighbors = [];
    for (const side of [index - 1, index + 1]) {
      const nb = atomsByIndex.get(side);
      if (nb?.[0]?.token) neighbors.push({ lemma: String(nb[0].token).toLowerCase(), type: nb[0].type });
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
const t1Efficacy = exposure.evaluateEfficacy
  ? efficacyVerdict({
    realHits: t1.realHit,
    derangeHits: t1.derangeHit,
    nullHits: t1.firstHit,
  })
  : exposure.verdict;

const evalDocs = new Set(
  [...new Set(chamber.items.map((it) => docKey(it.rec.sentId)))]
    .sort()
    .filter((_, i) => i % 2 === 1),
);
const indexSource = [...devRecords, ...trainRecords].filter((r) => (
  !evalDocs.has(docKey(r.sentId))
));
const bigIndex = freezeSelectionalIndex({
  corpusHash: `ewt-disjoint:${indexSource.length}`,
  rows: goldRoleRows(indexSource),
});
const bigFreq = new Map();
for (const row of goldRoleRows(indexSource)) {
  bigFreq.set(row.filler, (bigFreq.get(row.filler) || 0) + row.count);
}
const shuffledIndex = freezeSelectionalIndex({
  corpusHash: `${bigIndex.corpusHash}:role-shuffle`,
  rows: goldRoleRows(indexSource).map((row) => ({
    ...row,
    role: row.role === 'subject-like'
      ? 'object-like'
      : row.role === 'object-like'
        ? 'subject-like'
        : row.role,
  })),
});

const t2 = {
  n: 0,
  first: 0,
  unigram: 0,
  forward: 0,
  inverse: 0,
  both: 0,
  shuffled: 0,
  repaired: 0,
  bothVsUniWin: 0,
  bothVsUniLoss: 0,
};

const chargeOpts = {
  featureProvider: realProvider,
  minSupport: t2Repair.minSupport,
  scoreCap: t2Repair.scoreCap,
  direction: t2Repair.direction,
};

for (const item of chamber.items) {
  if (!evalDocs.has(docKey(item.rec.sentId))) continue;
  if (item.answers.length < 2) continue;
  t2.n += 1;
  const gold = item.gold;
  const first = item.answers[0];
  const uni = pickByUnigram(item.answers, bigFreq);
  const fwd = pickByCharge(item.answers, bigIndex, { featureProvider: realProvider, direction: 'forward' });
  const inv = pickByCharge(item.answers, bigIndex, { featureProvider: realProvider, direction: 'inverse' });
  const both = pickByCharge(item.answers, bigIndex, { featureProvider: realProvider, direction: 'both' });
  const shuf = pickByCharge(item.answers, shuffledIndex, { featureProvider: realProvider, direction: 'both' });
  const repaired = pickByCharge(item.answers, bigIndex, chargeOpts);
  if (sameAnswer(first, gold)) t2.first += 1;
  if (sameAnswer(uni.pick, gold)) t2.unigram += 1;
  if (sameAnswer(fwd.pick, gold)) t2.forward += 1;
  if (sameAnswer(inv.pick, gold)) t2.inverse += 1;
  if (sameAnswer(both.pick, gold)) t2.both += 1;
  if (sameAnswer(shuf.pick, gold)) t2.shuffled += 1;
  if (sameAnswer(repaired.pick, gold)) t2.repaired += 1;
  const bothOk = sameAnswer(both.pick, gold);
  const uniOk = sameAnswer(uni.pick, gold);
  if (bothOk && !uniOk) t2.bothVsUniWin += 1;
  if (!bothOk && uniOk) t2.bothVsUniLoss += 1;
}

const fingerprints = [];
for (const item of chamber.items.slice(0, 12)) {
  const a = composePacked(item.tokens, posMap, {});
  const b = composePacked(item.tokens, posMap, {});
  fingerprints.push(forestFingerprint(a) === forestFingerprint(b));
}

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const rate = (hit, n) => (n > 0 ? hit / n : null);
const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

const report = {
  contract: 'PB-SEMANTIC-SUBSTRATE-GATE-v1',
  confirmatory: false,
  testFileOpened: false,
  prereg: 'docs/superpowers/evidence/2026-08-16-PREREG-semantic-substrate-gate.md',
  substrate: {
    commit: gitHead(),
    inventoryVersion: EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
    derangeSeed: DERANGE_SEED,
    maxTokens,
    exposureThresholds: EXPOSURE_THRESHOLDS,
    t2Repair,
  },
  autopsy: {
    n: autopsy.length,
    losses: autopsy,
    sparseLosses: sparseLosses.length,
    inverseDominant: inverseDominant.length,
  },
  chamber: {
    sentences: chamber.items.length,
    analysed: chamber.analysed,
    parsed: chamber.parsed,
    threw: chamber.threw,
    goldContained: chamber.goldContained,
    coverage: rate(chamber.parsed, chamber.analysed),
    containment: rate(chamber.goldContained, chamber.analysed),
    eventsMean: mean(chamber.events),
    recPresMean: mean(chamber.recPres),
    sources: {
      dev: chamber.items.filter((i) => i.source === 'dev').length,
      train: chamber.items.filter((i) => i.source === 'train').length,
    },
  },
  protection: {
    fingerprintPairsIdentical: fingerprints.every(Boolean),
    fingerprintPairs: fingerprints.length,
    threw: chamber.threw,
  },
  t1: {
    ...t1,
    first: rate(t1.firstHit, t1.ambiguous),
    real: rate(t1.realHit, t1.ambiguous),
    derange: rate(t1.derangeHit, t1.ambiguous),
    exposure,
    efficacy: t1Efficacy,
    paired: {
      wins: t1.realVsDerangeWin,
      losses: t1.realVsDerangeLoss,
      pValue: exactTwoSidedSignP(t1.realVsDerangeWin, t1.realVsDerangeWin + t1.realVsDerangeLoss),
    },
  },
  t2: {
    ...t2,
    firstRate: rate(t2.first, t2.n),
    unigramRate: rate(t2.unigram, t2.n),
    forwardRate: rate(t2.forward, t2.n),
    inverseRate: rate(t2.inverse, t2.n),
    bothRate: rate(t2.both, t2.n),
    shuffledRate: rate(t2.shuffled, t2.n),
    repairedRate: rate(t2.repaired, t2.n),
    paired: {
      wins: t2.bothVsUniWin,
      losses: t2.bothVsUniLoss,
      pValue: exactTwoSidedSignP(t2.bothVsUniWin, t2.bothVsUniWin + t2.bothVsUniLoss),
    },
  },
};

const md = [];
md.push('# RESULT — Semantic Substrate Gate');
md.push('');
md.push('T3–T10 efficacy was not run. TEST was not opened.');
md.push('');
md.push(`- commit: \`${report.substrate.commit}\``);
md.push(`- inventory ${EXPERIMENTAL_FEATURE_SCHEMA_VERSION}, maxTokens ${maxTokens}`);
md.push(`- chamber: ${chamber.items.length} ambiguous spanning sentences `
  + `(dev ${report.chamber.sources.dev}, train ${report.chamber.sources.train})`);
md.push(`- coverage ${pct(report.chamber.coverage)}, containment ${pct(report.chamber.containment)}, threw ${chamber.threw}`);
md.push(`- fingerprints identical on ${fingerprints.length} replay pairs: ${report.protection.fingerprintPairsIdentical}`);
md.push('');
md.push('## T2 autopsy (gate replay)');
md.push('');
md.push(`${autopsy.length} charge-induced losses vs unigram. Repair: \`${t2Repair.reason}\` `
  + `(minSupport=${t2Repair.minSupport}, cap=${t2Repair.scoreCap}, direction=${t2Repair.direction}).`);
md.push('');
for (const loss of autopsy) {
  md.push(`- \`${loss.sentId}\` gold ${JSON.stringify(loss.gold)} `
    + `unigram ${JSON.stringify(loss.unigramWinner)} charge ${JSON.stringify(loss.chargeWinner)}`);
  md.push(`  winner pairCount=${loss.chargeOnWinner.pairCount} `
    + `fwd=${loss.chargeOnWinner.forward} inv=${loss.chargeOnWinner.inverse} `
    + `goldAbstain=${loss.chargeOnGold.abstain} goldPair=${loss.chargeOnGold.pairCount}`);
}
md.push('');
md.push('## T1 exposure');
md.push('');
md.push(`ambiguous ${t1.ambiguous}, evidence ${pct(exposure.evidenceRate)}, `
  + `UNKNOWN ${pct(exposure.allUnknownRate)}, score-disagree ${pct(exposure.scoreDisagreementRate)}, `
  + `rank-disagree ${exposure.rankDisagreements}`);
md.push(`exposure verdict: **${exposure.verdict}**`);
if (exposure.failures.length) md.push(`failures: ${exposure.failures.join(', ')}`);
md.push(`T1 first ${pct(report.t1.first)} real ${pct(report.t1.real)} derange ${pct(report.t1.derange)}`);
md.push(`paired ${t1.realVsDerangeWin}/${t1.realVsDerangeLoss} p=${report.t1.paired.pValue}`);
md.push(`efficacy: **${t1Efficacy}**`);
md.push('');
md.push('## T2 tribunal');
md.push('');
md.push(`n=${t2.n} first ${pct(report.t2.firstRate)} unigram ${pct(report.t2.unigramRate)} `
  + `forward ${pct(report.t2.forwardRate)} inverse ${pct(report.t2.inverseRate)} `
  + `both ${pct(report.t2.bothRate)} shuffled ${pct(report.t2.shuffledRate)} `
  + `repaired ${pct(report.t2.repairedRate)}`);
md.push(`both vs unigram ${t2.bothVsUniWin}/${t2.bothVsUniLoss} p=${report.t2.paired.pValue}`);
md.push('');
md.push('Reproduction: `node scripts/semantic-substrate-gate.mjs`');
md.push('');

writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(md.join('\n'));
console.log(`\nwrote ${OUT_JSON}`);
console.log(`wrote ${OUT_MD}`);
