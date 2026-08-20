#!/usr/bin/env node
/**
 * SEMANTIC PARTICLE THEORY — preregistered chamber run.
 *
 * Chamber: frozen 395-sentence treebank gate. This is a regression chamber,
 * not sealed TEST. No result here may be promoted as a cross-corpus effect.
 *
 *   node scripts/semantic-particle-theory-experiment.mjs
 *
 * Writes:
 *   docs/superpowers/evidence/2026-08-16-semantic-particle-theory.json
 *   docs/superpowers/evidence/2026-08-16-semantic-particle-theory.md
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { goldAnswer, parseConllu } from '../codex/core/constellation/treebank.js';
import { pickResonantAnswer } from '../codex/core/constellation/resonance-beacon.js';
import {
  DEFAULT_FEATURE_PROVIDER,
  compatibility,
  createFeatureProvider,
  derangeFeatureValues,
  featuresFor,
} from '../codex/core/constellation/semantic-particles/feature-provider.js';
import {
  freezeSelectionalIndex,
  selectionalCharge,
} from '../codex/core/constellation/semantic-particles/selectional-index.js';
import {
  censusPrivilegeCycles,
} from '../codex/core/constellation/semantic-particles/capability-transfer.js';
import {
  collapseReport,
  descendExact,
  shuffleLitMarks,
} from '../codex/core/constellation/semantic-particles/root-reachability.js';
import {
  extractBindings,
  inferForest,
} from '../codex/core/constellation/semantic-particles/forest-inference.js';
import {
  PROBE_REGISTRY,
  applyProbe,
  responseVector,
  selectivity,
} from '../codex/core/constellation/semantic-particles/contrastive-probes.js';
import {
  censusParticles,
  selectBottleneck,
} from '../codex/core/constellation/semantic-particles/evidence-ledger.js';
import {
  backtestCatalyst,
  rankExperiments,
} from '../codex/core/constellation/semantic-particles/experimental-design.js';
import {
  dppShortlist,
  qualityScore,
} from '../codex/core/constellation/semantic-particles/diverse-shortlist.js';
import {
  forestFingerprint,
} from '../codex/core/constellation/semantic-particles/annotate.js';
import {
  particleSchemaChecksum,
  SEMANTIC_PARTICLE_SCHEMA_VERSION,
} from '../codex/core/constellation/semantic-particles/schema.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const OUT_JSON = 'docs/superpowers/evidence/2026-08-16-semantic-particle-theory.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-16-semantic-particle-theory.md';
const SHUFFLES = 100;
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

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function holm(entries) {
  const usable = entries.filter((e) => e.pValue != null);
  const sorted = usable.slice().sort((a, b) => a.pValue - b.pValue);
  const m = sorted.length;
  const adj = new Map();
  let running = 0;
  for (let k = 0; k < m; k += 1) {
    const raw = sorted[k].pValue * (m - k);
    running = Math.max(running, raw);
    adj.set(sorted[k].id, Math.min(1, running));
  }
  return entries.map((e) => ({
    ...e,
    holm: e.pValue == null ? null : adj.get(e.id) ?? null,
  }));
}

function docKey(sentId) {
  if (!sentId) return 'unknown';
  const parts = String(sentId).split('-');
  return parts.length >= 2 ? parts.slice(0, -1).join('-') : sentId;
}

function aggregateCounts(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.predicate}\t${row.role}\t${row.filler}`;
    map.set(key, (map.get(key) || 0) + row.count);
  }
  return [...map.entries()].map(([key, count]) => {
    const [predicate, role, filler] = key.split('\t');
    return { predicate, role, filler, count };
  });
}

function goldRoleRows(records) {
  const rows = [];
  for (const rec of records) {
    const byId = new Map(rec.tokens.map((t) => [t.id, t]));
    for (const tok of rec.tokens) {
      const head = byId.get(tok.head);
      if (!head) continue;
      const predicate = String(head.lemma || head.form).toLowerCase();
      const filler = String(tok.lemma || tok.form).toLowerCase();
      if (tok.deprel === 'nsubj' || tok.deprel === 'nsubj:pass') {
        rows.push({ predicate, role: 'subject-like', filler, count: 1 });
      } else if (tok.deprel === 'obj') {
        rows.push({ predicate, role: 'object-like', filler, count: 1 });
      } else if (tok.deprel === 'obl' || String(tok.deprel).startsWith('obl:')) {
        rows.push({ predicate, role: 'pp-complement', filler, count: 1 });
      } else if (tok.deprel === 'amod' || tok.deprel === 'advmod') {
        rows.push({ predicate, role: 'modifier', filler, count: 1 });
      }
    }
  }
  return aggregateCounts(rows);
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
  if (!answer?.verb) return null;
  const left = nodeStub('NP', String(answer.subject || '').toLowerCase(), 0);
  const right = nodeStub('VP', String(answer.verb).toLowerCase(), 1);
  const hit = selectionalCharge(left, right, ['NP', 'VP', 'S', 1], index, extra);
  return hit.abstain ? null : hit.score;
}

function pickBestAnswer(answers, scoreFn) {
  let best = answers[0];
  let bestScore = -Infinity;
  let any = false;
  for (const ans of answers) {
    const score = scoreFn(ans);
    if (score == null || !Number.isFinite(score)) continue;
    any = true;
    if (score > bestScore) {
      bestScore = score;
      best = ans;
    }
  }
  return { pick: any ? best : answers[0], abstained: !any };
}

function uniqueAnswers(chart) {
  const all = (chart.stable || []).flatMap((node) => projectAnswers(node));
  const byKey = new Map();
  for (const ans of all) byKey.set(`${ans.subject ?? ''}|${ans.verb ?? ''}`, ans);
  return [...byKey.values()];
}

function readingScore(lemma, type, neighbor, provider) {
  const self = featuresFor(lemma, type, provider);
  const c = compatibility(self, neighbor);
  if (c.verdict === 'unknown') return null;
  return c.agreements - c.contradictions;
}

function pickReading(atoms, lemma, neighbor, provider) {
  let best = atoms[0];
  let bestScore = -Infinity;
  let any = false;
  for (const atom of atoms) {
    const score = readingScore(lemma, atom.type, neighbor, provider);
    if (score == null) continue;
    any = true;
    if (score > bestScore) {
      bestScore = score;
      best = atom;
    }
  }
  return any ? best : atoms[0];
}

function typeHitsGold(type, upos) {
  return Boolean(UPOS_TO_ATOM[upos]?.includes(type));
}

function chartMetrics(chart, record) {
  const gold = goldAnswer(record);
  const answers = uniqueAnswers(chart);
  const goldContained = answers.some((a) => sameAnswer(a, gold));
  return {
    parsed: (chart.stable || []).length > 0,
    goldContained,
    answers,
    events: chart.events || 0,
    recPres: chart.reactions?.recursivePreservative || 0,
    molecules: (chart.molecules || []).length,
    fingerprint: forestFingerprint(chart),
  };
}

const conlluPath = path.join(FIXTURES, 'treebank-gate.conllu');
const lexiconPath = path.join(FIXTURES, 'treebank-gate-lexicon.json');
const baselinePath = path.join(FIXTURES, 'treebank-gate-baseline.json');
const records = parseConllu(readFileSync(conlluPath, 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(lexiconPath, 'utf8'))));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const maxTokens = baseline.run.maxTokens;
const derangedProvider = derangeFeatureValues(DEFAULT_FEATURE_PROVIDER, DERANGE_SEED);

const docs = [...new Set(records.map((r) => docKey(r.sentId)))].sort();
const trainDocs = new Set(docs.filter((_, i) => i % 2 === 0));
const trainRecs = records.filter((r) => trainDocs.has(docKey(r.sentId)));
const evalDocSet = new Set(docs.filter((_, i) => i % 2 === 1));

const realIndex = freezeSelectionalIndex({
  corpusHash: `gate-train:${sha256File(conlluPath).slice(0, 16)}`,
  rows: goldRoleRows(trainRecs),
});
const shuffledRoleIndex = freezeSelectionalIndex({
  corpusHash: `${realIndex.corpusHash}:role-shuffle`,
  rows: goldRoleRows(trainRecs).map((row) => ({
    ...row,
    role: row.role === 'subject-like'
      ? 'object-like'
      : row.role === 'object-like'
        ? 'subject-like'
        : row.role,
  })),
});

const fillerFreq = new Map();
for (const row of goldRoleRows(trainRecs)) {
  fillerFreq.set(row.filler, (fillerFreq.get(row.filler) || 0) + row.count);
}

const protection = {
  analysed: 0,
  skipped: 0,
  threw: 0,
  parsedOff: 0,
  parsedOn: 0,
  goldContainedOff: 0,
  goldContainedOn: 0,
  fingerprintMismatch: 0,
  eventsOff: [],
  eventsOn: [],
  recPresOff: [],
  recPresOn: [],
  hashes: [],
};
const t1 = {
  ambiguous: 0,
  firstHit: 0,
  realHit: 0,
  derangeHit: 0,
  labelHit: 0,
  abstainHit: 0,
  realVsDerangeWin: 0,
  realVsDerangeLoss: 0,
};
const t2 = {
  evalAmbiguous: 0,
  realHit: 0,
  unigramHit: 0,
  shuffleHit: 0,
  reversedHit: 0,
  firstHit: 0,
  realVsUnigramWin: 0,
  realVsUnigramLoss: 0,
};
const t3 = {
  ambiguousParsed: 0,
  firstHit: 0,
  forestHit: 0,
  syntaxHit: 0,
  beaconHit: 0,
  forestVsFirstWin: 0,
  forestVsFirstLoss: 0,
  enumAgree: 0,
  enumCompared: 0,
};
const t5 = {
  ambiguous: 0,
  collapsed: 0,
  shuffleCollapsed: Array.from({ length: SHUFFLES }, () => 0),
  shuffleAmbiguous: Array.from({ length: SHUFFLES }, () => 0),
};
const t6 = {
  targeted: [],
  control: [],
};
const t7 = {
  scored: 0,
  exactHit: 0,
  bagHit: 0,
  exactVsBagWin: 0,
  exactVsBagLoss: 0,
};
const particleRows = [];
const t10Candidates = [];

function neighborFeatures(atomsByIndex, index, provider) {
  const prev = atomsByIndex.get(index - 1);
  if (!prev || !prev[0]) {
    return featuresFor('__none__', 'X', provider);
  }
  return featuresFor(String(prev[0].token || '').toLowerCase(), prev[0].type, provider);
}

for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length === 0 || tokens.length > maxTokens) {
    protection.skipped += 1;
    continue;
  }
  protection.analysed += 1;
  let off;
  let on;
  try {
    off = composePacked(tokens, posMap, {});
    on = composePacked(tokens, posMap, { semanticParticles: true, ledger: true });
  } catch {
    protection.threw += 1;
    continue;
  }

  const offM = chartMetrics(off, rec);
  const onM = chartMetrics(on, rec);
  if (offM.parsed) protection.parsedOff += 1;
  if (onM.parsed) protection.parsedOn += 1;
  if (offM.goldContained) protection.goldContainedOff += 1;
  if (onM.goldContained) protection.goldContainedOn += 1;
  if (offM.fingerprint !== onM.fingerprint) protection.fingerprintMismatch += 1;
  protection.eventsOff.push(offM.events);
  protection.eventsOn.push(onM.events);
  protection.recPresOff.push(offM.recPres);
  protection.recPresOn.push(onM.recPres);
  if (protection.hashes.length < 2) {
    protection.hashes.push(on.semanticParticles?.reportHash || null);
  }

  const atomsByIndex = new Map();
  for (const atom of on.atoms || []) {
    const row = atomsByIndex.get(atom.from) || [];
    row.push(atom);
    atomsByIndex.set(atom.from, row);
  }

  for (const [index, group] of atomsByIndex) {
    if (group.length < 2) continue;
    const goldUpos = rec.tokens[index]?.upos;
    if (!goldUpos || !UPOS_TO_ATOM[goldUpos]) continue;
    t1.ambiguous += 1;
    const lemma = String(group[0].token || rec.tokens[index].form).toLowerCase();
    const neighbor = neighborFeatures(atomsByIndex, index, DEFAULT_FEATURE_PROVIDER);
    const first = group[0];
    const real = pickReading(group, lemma, neighbor, DEFAULT_FEATURE_PROVIDER);
    const deranged = pickReading(group, lemma, neighborFeatures(atomsByIndex, index, derangedProvider), derangedProvider);
    // Label-only / abstain cannot see a type-conditioned particle, so both
    // collapse to emission order (the first atom).
    const labelPick = group[0];
    const abstainPick = group[0];
    if (typeHitsGold(first.type, goldUpos)) t1.firstHit += 1;
    if (typeHitsGold(real.type, goldUpos)) t1.realHit += 1;
    if (typeHitsGold(deranged.type, goldUpos)) t1.derangeHit += 1;
    if (typeHitsGold(labelPick.type, goldUpos)) t1.labelHit += 1;
    if (typeHitsGold(abstainPick.type, goldUpos)) t1.abstainHit += 1;
    const realOk = typeHitsGold(real.type, goldUpos);
    const derOk = typeHitsGold(deranged.type, goldUpos);
    if (realOk && !derOk) t1.realVsDerangeWin += 1;
    if (!realOk && derOk) t1.realVsDerangeLoss += 1;
  }

  const gold = goldAnswer(rec);
  const answers = onM.answers;
  const ambiguousAnswers = answers.length >= 2;
  const isEval = evalDocSet.has(docKey(rec.sentId));

  if (isEval && ambiguousAnswers && onM.parsed) {
    t2.evalAmbiguous += 1;
    const realPick = pickBestAnswer(answers, (a) => chargeAnswer(a, realIndex, {
      featureProvider: DEFAULT_FEATURE_PROVIDER,
    }));
    const uniPick = pickBestAnswer(answers, (a) => {
      const s = fillerFreq.get(String(a.subject || '').toLowerCase()) || 0;
      const v = fillerFreq.get(String(a.verb || '').toLowerCase()) || 0;
      if (s + v === 0) return null;
      return Math.log(s + 1) + Math.log(v + 1);
    });
    const shufflePick = pickBestAnswer(answers, (a) => chargeAnswer(a, shuffledRoleIndex));
    const reversePick = pickBestAnswer(answers, (a) => {
      const s = chargeAnswer(a, realIndex);
      return s == null ? null : -s;
    });
    if (sameAnswer(answers[0], gold)) t2.firstHit += 1;
    if (sameAnswer(realPick.pick, gold)) t2.realHit += 1;
    if (sameAnswer(uniPick.pick, gold)) t2.unigramHit += 1;
    if (sameAnswer(shufflePick.pick, gold)) t2.shuffleHit += 1;
    if (sameAnswer(reversePick.pick, gold)) t2.reversedHit += 1;
    const realOk = sameAnswer(realPick.pick, gold);
    const uniOk = sameAnswer(uniPick.pick, gold);
    if (realOk && !uniOk) t2.realVsUnigramWin += 1;
    if (!realOk && uniOk) t2.realVsUnigramLoss += 1;
  }

  if (onM.parsed && ambiguousAnswers) {
    t3.ambiguousParsed += 1;
    const first = answers[0];
    const forest = inferForest(on, {
      selectionalIndex: realIndex,
      featureProvider: DEFAULT_FEATURE_PROVIDER,
    });
    const syntax = inferForest(on, {});
    const forestAns = forest.best?.derivation && forest.best.node
      ? projectAnswers({ ...forest.best.node, derivations: [forest.best.derivation] })[0]
      : first;
    const syntaxAns = syntax.best?.derivation && syntax.best.node
      ? projectAnswers({ ...syntax.best.node, derivations: [syntax.best.derivation] })[0]
      : first;
    const beacon = pickResonantAnswer(answers, on.field, BONDS) || first;
    if (sameAnswer(first, gold)) t3.firstHit += 1;
    if (sameAnswer(forestAns, gold)) t3.forestHit += 1;
    if (sameAnswer(syntaxAns, gold)) t3.syntaxHit += 1;
    if (sameAnswer(beacon, gold)) t3.beaconHit += 1;
    const forestOk = sameAnswer(forestAns, gold);
    const firstOk = sameAnswer(first, gold);
    if (forestOk && !firstOk) t3.forestVsFirstWin += 1;
    if (!forestOk && firstOk) t3.forestVsFirstLoss += 1;
    if ((on.molecules || []).length <= 24) {
      t3.enumCompared += 1;
      if (forest.best?.derivationId && syntax.best?.derivationId) t3.enumAgree += 1;
    }
  }

  if (onM.parsed) {
    const exact = descendExact(on);
    const collapse = collapseReport(on, exact);
    t5.ambiguous += collapse.ambiguousTokens;
    t5.collapsed += collapse.collapsed;
    for (let s = 0; s < SHUFFLES; s += 1) {
      const shuffled = shuffleLitMarks(on, exact.union, 0x4c495445 + s * 7919 + protection.analysed);
      const ctrl = collapseReport(on, { union: shuffled });
      t5.shuffleCollapsed[s] += ctrl.collapsed;
      t5.shuffleAmbiguous[s] += ctrl.ambiguousTokens;
    }

    if (t6.targeted.length < 80) {
      const before = {
        coverage: onM.parsed ? 1 : 0,
        roots: (on.stable || []).length,
        containment: onM.goldContained ? 1 : 0,
        rank: answers.findIndex((a) => sameAnswer(a, gold)),
        events: on.events,
        recPres: on.reactions?.recursivePreservative || 0,
      };
      if (before.rank < 0) before.rank = answers.length + 1;
      const drop = applyProbe(tokens, PROBE_REGISTRY.find((p) => p.id === 'drop-last'));
      const swap = applyProbe(tokens, PROBE_REGISTRY.find((p) => p.id === 'swap-adjacent'));
      try {
        const afterDrop = composePacked(drop, posMap, {});
        const afterSwap = composePacked(swap, posMap, {});
        const dropM = chartMetrics(afterDrop, { tokens: rec.tokens.slice(0, drop.length) });
        const swapM = chartMetrics(afterSwap, rec);
        t6.targeted.push(responseVector(before, {
          coverage: dropM.parsed ? 1 : 0,
          roots: (afterDrop.stable || []).length,
          containment: dropM.goldContained ? 1 : 0,
          rank: dropM.answers.findIndex((a) => sameAnswer(a, gold)),
          events: afterDrop.events,
          recPres: afterDrop.reactions?.recursivePreservative || 0,
        }));
        t6.control.push(responseVector(before, {
          coverage: swapM.parsed ? 1 : 0,
          roots: (afterSwap.stable || []).length,
          containment: swapM.goldContained ? 1 : 0,
          rank: swapM.answers.findIndex((a) => sameAnswer(a, gold)),
          events: afterSwap.events,
          recPres: afterSwap.reactions?.recursivePreservative || 0,
        }));
      } catch {
        /* probe created an illegal input; skip */
      }
    }

    const goldObj = rec.tokens.find((t) => t.deprel === 'obj');
    if (goldObj) {
      const objLemma = String(goldObj.lemma || goldObj.form).toLowerCase();
      const bindings = [];
      for (const node of on.molecules || []) {
        for (const d of node.derivations || []) {
          if (!d.bond) continue;
          bindings.push(...extractBindings(d));
        }
      }
      if (bindings.length > 0) {
        t7.scored += 1;
        const exactOk = bindings.some((b) => b.role === 'object' && b.filler === objLemma);
        const bagOk = bindings.some((b) => b.filler === objLemma);
        if (exactOk) t7.exactHit += 1;
        if (bagOk) t7.bagHit += 1;
        if (exactOk && !bagOk) t7.exactVsBagWin += 1;
        if (!exactOk && bagOk) t7.exactVsBagLoss += 1;
      }
    }
  }

  for (const p of on.semanticParticles?.particles || []) {
    particleRows.push({
      family: String(p.kind).split('.')[0],
      value: p.confidence == null ? 0 : 1,
      cost: 1,
      provenance: p.createdBy,
    });
  }

  if (onM.parsed) {
    for (const node of on.stable || []) {
      for (const d of node.derivations || []) {
        if (!d.bond) continue;
        const topology = `${d.bond[0]}+${d.bond[1]}->${d.bond[2]}`;
        t10Candidates.push({
          id: `${topology}@${rec.sentId || protection.analysed}`,
          q: onM.goldContained ? 0.9 : 0.55,
          family: d.bond[2],
          topology,
        });
      }
    }
  }
}

const determinism = (() => {
  const tokens = ['old', 'men', 'ran'];
  const a = composePacked(tokens, posMap, { semanticParticles: true });
  const b = composePacked(tokens, posMap, { semanticParticles: true });
  return {
    reportHashMatch: a.semanticParticles.reportHash === b.semanticParticles.reportHash,
    fingerprintMatch: forestFingerprint(a) === forestFingerprint(b),
  };
})();

const roundChart = composePacked(['Round'], new Map([['round', ['n', 'v', 'a', 'r']]]), {
  semanticParticles: true,
});
const t4 = {
  cycleCensus: censusPrivilegeCycles(BONDS, LIFTS),
  imperativeRootHeld: roundChart.stable.some((n) => n.type === 'S'),
  eventsIdentical: protection.eventsOff.every((e, i) => e === protection.eventsOn[i]),
  recPresIdentical: protection.recPresOff.every((e, i) => e === protection.recPresOn[i]),
};

const realCollapse = t5.ambiguous > 0 ? t5.collapsed / t5.ambiguous : 0;
const shuffleByDraw = t5.shuffleAmbiguous.map((amb, s) => (
  amb > 0 ? t5.shuffleCollapsed[s] / amb : 0
));
shuffleByDraw.sort((a, b) => a - b);
const shuffleMean = mean(shuffleByDraw);
const shuffleSd = stdev(shuffleByDraw);
const shuffleP95 = shuffleByDraw.length
  ? shuffleByDraw[Math.min(shuffleByDraw.length - 1, Math.floor(0.95 * shuffleByDraw.length))]
  : 0;
const shufflePValue = shuffleByDraw.length
  ? shuffleByDraw.filter((r) => r >= realCollapse).length / shuffleByDraw.length
  : 1;

const t6sel = selectivity(t6.targeted, t6.control);
const t8census = censusParticles(particleRows);
const t8pick = selectBottleneck(t8census, {
  protected: {
    coverage: protection.parsedOn,
    containment: protection.goldContainedOn,
    events: mean(protection.eventsOn),
  },
  equivalence: 0.01,
});

const t9 = backtestCatalyst();
const t9FrequencyHits = t9.episodes.filter((e) => e.ranked[0]?.action === 'add-lexical-reading'
  && (e.id === 'to-dual-emission' || e.id === 'compound-family-repair')).length;

const uniqT10 = [];
const seenT10 = new Set();
for (const c of t10Candidates) {
  if (seenT10.has(c.topology)) continue;
  seenT10.add(c.topology);
  uniqT10.push({ ...c, id: c.topology });
}
const t10k = Math.min(8, uniqT10.length);
const t10dpp = dppShortlist(uniqT10, t10k, { minQuality: 0.5 });
const t10topk = [...uniqT10].sort((a, b) => qualityScore(b) - qualityScore(a) || a.id.localeCompare(b.id)).slice(0, t10k);
const t10dppFamilies = new Set(t10dpp.map((c) => c.family)).size;
const t10topFamilies = new Set(t10topk.map((c) => c.family)).size;
const t10maxQ = uniqT10.reduce((m, c) => Math.max(m, qualityScore(c)), 0);
const t10dppMaxQ = t10dpp.reduce((m, c) => Math.max(m, qualityScore(c)), 0);

const pT1 = exactTwoSidedSignP(t1.realVsDerangeWin, t1.realVsDerangeWin + t1.realVsDerangeLoss);
const pT2 = exactTwoSidedSignP(t2.realVsUnigramWin, t2.realVsUnigramWin + t2.realVsUnigramLoss);
const pT3 = exactTwoSidedSignP(t3.forestVsFirstWin, t3.forestVsFirstWin + t3.forestVsFirstLoss);
const pT5 = shufflePValue;
const pT7 = exactTwoSidedSignP(t7.exactVsBagWin, t7.exactVsBagWin + t7.exactVsBagLoss);

const primaries = holm([
  {
    id: 'T1',
    name: 'microfeatures vs derange',
    pValue: t1.realVsDerangeWin + t1.realVsDerangeLoss > 0 ? pT1 : null,
    direction: t1.realHit > t1.derangeHit ? 'treatment' : t1.realHit < t1.derangeHit ? 'control' : 'tie',
    n: t1.ambiguous,
  },
  {
    id: 'T2',
    name: 'selectional vs unigram',
    pValue: t2.realVsUnigramWin + t2.realVsUnigramLoss > 0 ? pT2 : null,
    direction: t2.realHit > t2.unigramHit ? 'treatment' : t2.realHit < t2.unigramHit ? 'control' : 'tie',
    n: t2.evalAmbiguous,
  },
  {
    id: 'T3',
    name: 'forest vs first-answer',
    pValue: t3.forestVsFirstWin + t3.forestVsFirstLoss > 0 ? pT3 : null,
    direction: t3.forestHit > t3.firstHit ? 'treatment' : t3.forestHit < t3.firstHit ? 'control' : 'tie',
    n: t3.ambiguousParsed,
  },
  {
    id: 'T4',
    name: 'capability observer',
    pValue: null,
    direction: t4.cycleCensus.ok && t4.imperativeRootHeld && t4.eventsIdentical ? 'observer-held' : 'failed',
    n: 1,
  },
  {
    id: 'T5',
    name: 'reachability vs shuffle',
    pValue: pT5,
    direction: realCollapse > shuffleP95 ? 'treatment' : 'control',
    n: t5.ambiguous,
  },
  {
    id: 'T6',
    name: 'probe selectivity',
    pValue: null,
    direction: t6sel.separation > 0 ? 'separated' : 'flat',
    n: t6.targeted.length,
  },
  {
    id: 'T7',
    name: 'bindings vs bag',
    pValue: t7.exactVsBagWin + t7.exactVsBagLoss > 0 ? pT7 : null,
    direction: t7.exactHit > t7.bagHit ? 'treatment' : t7.exactHit < t7.bagHit ? 'control' : 'tie',
    n: t7.scored,
  },
  {
    id: 'T8',
    name: 'bottleneck subset',
    pValue: null,
    direction: t8pick.rewroteGrammar ? 'illegal' : 'observer',
    n: t8census.families.length,
  },
  {
    id: 'T9',
    name: 'catalyst vs frequency',
    pValue: null,
    direction: t9.episodes.find((e) => e.id === 'to-dual-emission')?.rankOfSuccess === 1
      ? 'historical-hit'
      : 'miss',
    n: t9.episodes.length,
  },
  {
    id: 'T10',
    name: 'DPP vs top-k families',
    pValue: null,
    direction: t10dppFamilies >= t10topFamilies ? 'not-worse' : 'worse',
    n: uniqT10.length,
  },
]);

function rate(hit, n) {
  return n > 0 ? hit / n : null;
}

const report = {
  contract: 'PB-SEMANTIC-PARTICLE-THEORY-RUN-v1',
  confirmatory: false,
  chamber: 'treebank-gate-395',
  note: 'Regression chamber. Not sealed TEST. Not a promotion dossier.',
  substrate: {
    commit: gitHead(),
    schemaVersion: SEMANTIC_PARTICLE_SCHEMA_VERSION,
    schemaChecksum: particleSchemaChecksum(),
    conlluSha256: sha256File(conlluPath),
    lexiconSha256: sha256File(lexiconPath),
    baselineSha256: sha256File(baselinePath),
    bonds: BONDS.length,
    lifts: LIFTS.length,
    maxTokens,
    shuffles: SHUFFLES,
    derangeSeed: DERANGE_SEED,
    trainDocuments: trainDocs.size,
    evalDocuments: evalDocSet.size,
  },
  protection: {
    analysed: protection.analysed,
    skipped: protection.skipped,
    threw: protection.threw,
    parsedOff: protection.parsedOff,
    parsedOn: protection.parsedOn,
    goldContainedOff: protection.goldContainedOff,
    goldContainedOn: protection.goldContainedOn,
    coverageOff: rate(protection.parsedOff, protection.analysed),
    coverageOn: rate(protection.parsedOn, protection.analysed),
    containmentOff: rate(protection.goldContainedOff, protection.analysed),
    containmentOn: rate(protection.goldContainedOn, protection.analysed),
    fingerprintMismatch: protection.fingerprintMismatch,
    eventsMeanOff: mean(protection.eventsOff),
    eventsMeanOn: mean(protection.eventsOn),
    recPresMeanOff: mean(protection.recPresOff),
    recPresMeanOn: mean(protection.recPresOn),
    determinism,
    grammarUnchanged: protection.fingerprintMismatch === 0
      && protection.parsedOff === protection.parsedOn
      && protection.goldContainedOff === protection.goldContainedOn,
  },
  theories: {
    T1: {
      ambiguousTokens: t1.ambiguous,
      first: rate(t1.firstHit, t1.ambiguous),
      real: rate(t1.realHit, t1.ambiguous),
      derange: rate(t1.derangeHit, t1.ambiguous),
      labelOnly: rate(t1.labelHit, t1.ambiguous),
      abstain: rate(t1.abstainHit, t1.ambiguous),
      paired: {
        wins: t1.realVsDerangeWin,
        losses: t1.realVsDerangeLoss,
        pValue: pT1,
      },
    },
    T2: {
      evalAmbiguousSentences: t2.evalAmbiguous,
      first: rate(t2.firstHit, t2.evalAmbiguous),
      real: rate(t2.realHit, t2.evalAmbiguous),
      unigram: rate(t2.unigramHit, t2.evalAmbiguous),
      roleShuffle: rate(t2.shuffleHit, t2.evalAmbiguous),
      signReversal: rate(t2.reversedHit, t2.evalAmbiguous),
      paired: {
        wins: t2.realVsUnigramWin,
        losses: t2.realVsUnigramLoss,
        pValue: pT2,
      },
    },
    T3: {
      ambiguousParsedSentences: t3.ambiguousParsed,
      first: rate(t3.firstHit, t3.ambiguousParsed),
      forest: rate(t3.forestHit, t3.ambiguousParsed),
      syntaxOnly: rate(t3.syntaxHit, t3.ambiguousParsed),
      beacon: rate(t3.beaconHit, t3.ambiguousParsed),
      paired: {
        wins: t3.forestVsFirstWin,
        losses: t3.forestVsFirstLoss,
        pValue: pT3,
      },
    },
    T4: t4,
    T5: {
      ambiguousTokens: t5.ambiguous,
      collapsed: t5.collapsed,
      realRate: realCollapse,
      shuffleMean,
      shuffleSd,
      shuffleP95,
      pValue: shufflePValue,
      shuffles: SHUFFLES,
      beatsP95: realCollapse > shuffleP95,
    },
    T6: {
      n: t6.targeted.length,
      separation: t6sel.separation,
      targeted: t6sel.targeted,
      control: t6sel.control,
    },
    T7: {
      scored: t7.scored,
      exact: rate(t7.exactHit, t7.scored),
      bag: rate(t7.bagHit, t7.scored),
      paired: {
        wins: t7.exactVsBagWin,
        losses: t7.exactVsBagLoss,
        pValue: pT7,
      },
    },
    T8: {
      familiesIn: t8census.families.map((f) => f.family),
      kept: t8pick.families,
      retired: t8pick.retired,
      rewroteGrammar: t8pick.rewroteGrammar,
    },
    T9: {
      episodes: t9.episodes.map((e) => ({ id: e.id, rankOfSuccess: e.rankOfSuccess })),
      frequencyBaselineHits: t9FrequencyHits,
    },
    T10: {
      uniqueTopologies: uniqT10.length,
      k: t10k,
      dppFamilies: t10dppFamilies,
      topkFamilies: t10topFamilies,
      maxQualityAll: t10maxQ,
      maxQualityDpp: t10dppMaxQ,
    },
  },
  primaries,
};

function verdictOf(row) {
  if (row.id === 'T4') {
    return t4.cycleCensus.ok && t4.imperativeRootHeld && t4.eventsIdentical
      ? 'OBSERVER_HELD'
      : 'SAFETY_FAIL';
  }
  if (row.id === 'T5') return realCollapse > shuffleP95 ? 'BEATS_SHUFFLE' : 'NOT_ABOVE_SHUFFLE_P95';
  if (row.id === 'T8') {
    if (t8pick.rewroteGrammar) return 'ILLEGAL_REWRITE';
    return t8pick.families.length < t8census.families.length
      ? 'COMPRESSED_WITHOUT_GRAMMAR'
      : 'NO_COMPRESSION';
  }
  if (row.id === 'T9') {
    return t9.episodes.find((e) => e.id === 'to-dual-emission')?.rankOfSuccess === 1
      ? 'HISTORICAL_TO_RANKED_FIRST'
      : 'HISTORICAL_MISS';
  }
  if (row.id === 'T10') {
    return t10dppMaxQ + 1e-9 >= t10maxQ && t10dppFamilies >= t10topFamilies
      ? 'CEILING_PRESERVED'
      : 'CEILING_OR_COVERAGE_MOVED';
  }
  if (row.pValue == null) return 'NO_INFERENTIAL_TEST';
  if (row.holm != null && row.holm < 0.05 && row.direction === 'treatment') return 'SURVIVES_HOLM';
  if (row.direction === 'treatment') return 'DIRECTION_ONLY';
  if (row.direction === 'tie') return 'TIE';
  return 'CONTROL_WINS_OR_FLAT';
}

report.verdicts = Object.fromEntries(primaries.map((row) => [row.id, verdictOf(row)]));
report.chamberVerdict = protection.fingerprintMismatch === 0 && determinism.reportHashMatch
  ? 'CHAMBER_SAFE_NO_PROMOTION'
  : 'CHAMBER_UNSAFE';

const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const md = [];
md.push('# RESULT — Semantic Particle Theory (gate chamber)');
md.push('');
md.push('**This is not a promotion dossier.** Chamber = frozen 395-sentence treebank gate.');
md.push('Sealed TEST was not opened. Holm-surviving effects here remain hypotheses.');
md.push('');
md.push(`- commit: \`${report.substrate.commit}\``);
md.push(`- schema: ${report.substrate.schemaVersion} \`${report.substrate.schemaChecksum.slice(0, 16)}…\``);
md.push(`- analysed ${protection.analysed}, skipped ${protection.skipped}, threw ${protection.threw}`);
md.push(`- coverage off/on ${pct(report.protection.coverageOff)} / ${pct(report.protection.coverageOn)}`);
md.push(`- gold containment off/on ${pct(report.protection.containmentOff)} / ${pct(report.protection.containmentOn)}`);
md.push(`- forest fingerprint mismatches: ${protection.fingerprintMismatch}`);
md.push(`- determinism: report ${determinism.reportHashMatch} / forest ${determinism.fingerprintMatch}`);
md.push(`- chamber verdict: **${report.chamberVerdict}**`);
md.push('');
md.push('| Theory | n | Treatment | Control | p | Holm | Verdict |');
md.push('|---|---:|---:|---:|---:|---:|---|');
function pCell(p, tested) {
  return tested ? String(p) : '—';
}
md.push(`| T1 microfeatures | ${t1.ambiguous} | ${pct(report.theories.T1.real)} | derange ${pct(report.theories.T1.derange)} | ${pCell(pT1, t1.realVsDerangeWin + t1.realVsDerangeLoss > 0)} | ${primaries[0].holm ?? '—'} | ${report.verdicts.T1} |`);
md.push(`| T2 selectional | ${t2.evalAmbiguous} | ${pct(report.theories.T2.real)} | unigram ${pct(report.theories.T2.unigram)} | ${pCell(pT2, t2.realVsUnigramWin + t2.realVsUnigramLoss > 0)} | ${primaries[1].holm ?? '—'} | ${report.verdicts.T2} |`);
md.push(`| T3 forest | ${t3.ambiguousParsed} | ${pct(report.theories.T3.forest)} | first ${pct(report.theories.T3.first)} | ${pCell(pT3, t3.forestVsFirstWin + t3.forestVsFirstLoss > 0)} | ${primaries[2].holm ?? '—'} | ${report.verdicts.T3} |`);
md.push(`| T4 capability | 1 | observer | standing law | — | — | ${report.verdicts.T4} |`);
md.push(`| T5 reachability | ${t5.ambiguous} | ${pct(realCollapse)} | shuffle p95 ${pct(shuffleP95)} | ${shufflePValue} | ${primaries[4].holm ?? '—'} | ${report.verdicts.T5} |`);
md.push(`| T6 probes | ${t6.targeted.length} | sep ${t6sel.separation} | matched swap | — | — | ${report.verdicts.T6} |`);
md.push(`| T7 bindings | ${t7.scored} | exact ${pct(report.theories.T7.exact)} | bag ${pct(report.theories.T7.bag)} | ${pCell(pT7, t7.exactVsBagWin + t7.exactVsBagLoss > 0)} | ${primaries[6].holm ?? '—'} | ${report.verdicts.T7} |`);
md.push(`| T8 bottleneck | ${t8census.families.length} | kept ${t8pick.families.length} | full inventory | — | — | ${report.verdicts.T8} |`);
md.push(`| T9 catalyst | ${t9.episodes.length} | TO rank ${t9.episodes.find((e) => e.id === 'to-dual-emission')?.rankOfSuccess} | frequency | — | — | ${report.verdicts.T9} |`);
md.push(`| T10 DPP | ${uniqT10.length} | families ${t10dppFamilies} | top-k ${t10topFamilies} | — | — | ${report.verdicts.T10} |`);
md.push('');
md.push('T5 shuffle spread: '
  + `mean ${pct(shuffleMean)}, sd ${pct(shuffleSd)}, p95 ${pct(shuffleP95)}, `
  + `permutation p = ${shufflePValue} over ${SHUFFLES} draws.`);
md.push('');
md.push('T4 `Round!` still spans as S: '
  + `${t4.imperativeRootHeld}. Cycle census ok: ${t4.cycleCensus.ok}. `
  + `Events identical: ${t4.eventsIdentical}. Rec-pres identical: ${t4.recPresIdentical}.`);
md.push('');
md.push('Reproduction: `node scripts/semantic-particle-theory-experiment.mjs`');
md.push('');

writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(OUT_MD, `${md.join('\n')}\n`);

console.log(md.join('\n'));
console.log(`\nwrote ${OUT_JSON}`);
console.log(`wrote ${OUT_MD}`);
