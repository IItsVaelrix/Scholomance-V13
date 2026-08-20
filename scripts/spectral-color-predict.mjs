#!/usr/bin/env node
/**
 * SPIKE (throwaway): COLOR AS PREDICTION
 *
 * Identity-color is dead. Sync-as-overwrite is dead. This spike asks whether
 * the leftover field-reactive spectrum can forecast an independent future.
 *
 * Color is computed from LEAF chloroplasts only — after illumination, before
 * any molecule label is consulted. The target is the gold dependency between
 * adjacent tokens, which the paint does not contain.
 *
 * The only place color can save the concept is where the type pair is
 * already ambiguous (same types, more than one gold label). There color is
 * a tie-breaker, not a name.
 *
 * PHYSICS:          spectroscopic QSAR / solvatochromism
 *                   (spectrum forecasts reactivity, it does not baptize a compound)
 * SEMANTIC ANALOG:  adjacent leaf barcodes → gold deprel / gold-edge
 * STATE:            15-band leaf paint, concatenated to 30-D pair color
 * OPERATOR:         annotate-only; LOSO type-pair majority vs color tie-break
 * CANNOT:           rewrite the grammar; admit a root; stamp a rule on the photon
 *
 * FALSIFIER:
 *   1. type-pair majority ≥ type-pair+color on AMBIGUOUS pairs
 *   2. type-pair+shuffled-color ≥ type-pair+real-color on AMBIGUOUS pairs
 *   3. color-only ≥ type-pair majority on all pairs
 *      (not fatal; color was never supposed to beat types globally)
 *   4. type-pair+color does not raise gold-edge accuracy over type-pair
 *
 *   node scripts/spectral-color-predict.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { BOND_REACTION, classifyBond } from '../codex/core/constellation/bond-kind.js';
import { channelResonance } from '../codex/core/constellation/resonance-beacon.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { parseConllu } from '../codex/core/constellation/treebank.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-spectral-color-predict.json');
const SEED = 0x5c4010;
const MIN_AMBIG_LABEL = 2;

const BANDS = Object.freeze([
  'carbon', 'silicone', 'recursive',
  'left', 'right',
  'near', 'mid', 'far',
  'lock', 'contest',
  'absorption', 'silence',
]);

const KIND_INDEX = Object.freeze({
  [BOND_REACTION.CONSTRUCTIVE]: 'carbon',
  [BOND_REACTION.PRESERVATIVE]: 'silicone',
  [BOND_REACTION.RECURSIVE_PRESERVATIVE]: 'recursive',
});

const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const MAX = JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-baseline.json'), 'utf8')).run.maxTokens;

function sha256Hex(data) {
  return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data), 'utf8').digest('hex');
}

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

function emptyBands() {
  const o = Object.create(null);
  for (const b of BANDS) o[b] = 0;
  return o;
}

function toVec(bands) {
  return BANDS.map((b) => Number(bands[b] || 0));
}

function l2normalize(vec) {
  let n = 0;
  for (const x of vec) n += x * x;
  if (n === 0) return vec.map(() => 0);
  const d = Math.sqrt(n);
  return vec.map((x) => x / d);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let n1 = 0;
  let n2 = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    n1 += a[i] * a[i];
    n2 += b[i] * b[i];
  }
  if (n1 === 0 || n2 === 0) return 0;
  return dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

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

const BOND_BY_PAIR = new Map();
for (const bond of BONDS) BOND_BY_PAIR.set(`${bond[0]}|${bond[1]}`, bond);

const BEST_BOND = new Map();
function bestBond(leftType, rightType) {
  const key = `${leftType}|${rightType}`;
  const cached = BEST_BOND.get(key);
  if (cached) return cached;
  let best = null;
  let bestScore = 0;
  for (const left of closure(leftType)) {
    for (const right of closure(rightType)) {
      const bond = BOND_BY_PAIR.get(`${left}|${right}`);
      if (!bond) continue;
      const score = channelResonance(left, right, BONDS);
      if (score > bestScore) {
        bestScore = score;
        best = bond;
      }
    }
  }
  const row = { bond: best, score: bestScore };
  BEST_BOND.set(key, row);
  return row;
}

function contestKeys(slot) {
  const counts = new Map();
  for (const atom of slot.atoms || []) {
    for (const cell of atom.chloroplast?.cells || []) {
      if (!((cell.voltage || 0) > 0)) continue;
      const key = `${cell.from}:${cell.aura}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const contested = new Set();
  for (const [key, n] of counts) if (n > 1) contested.add(key);
  return contested;
}

function paintAtom(atom, contested, emitters) {
  const bands = emptyBands();
  const cells = atom.chloroplast?.cells || [];
  let absorbed = 0;
  let silent = 0;
  const irradiance = Number(atom.chloroplast?.irradiance || 0);
  for (const cell of cells) {
    const voltage = Number(cell.voltage || 0);
    if (!(voltage > 0)) {
      silent += 1;
      continue;
    }
    absorbed += voltage;
    const emitter = emitters.get(cell.aura);
    const leftFirst = (cell.from ?? 0) < (atom.from ?? 0);
    bands[leftFirst ? 'left' : 'right'] += voltage;
    const dist = Math.abs((atom.from ?? 0) - (cell.from ?? 0));
    if (dist <= 1) bands.near += voltage;
    else if (dist <= 3) bands.mid += voltage;
    else bands.far += voltage;
    const key = `${cell.from}:${cell.aura}`;
    if (contested.has(key)) bands.contest += voltage;
    else bands.lock += voltage;
    if (emitter?.type) {
      const ordered = leftFirst
        ? bestBond(emitter.type, atom.type)
        : bestBond(atom.type, emitter.type);
      if (ordered.bond) {
        const kind = classifyBond(ordered.bond);
        const bucket = KIND_INDEX[kind];
        if (bucket) bands[bucket] += voltage;
      }
    }
  }
  bands.absorption = irradiance > 0 ? absorbed / irradiance : 0;
  bands.silence = cells.length > 0 ? silent / cells.length : 1;
  return l2normalize(toVec(bands));
}

function preferredAtom(slot) {
  let best = null;
  let bestV = -Infinity;
  for (const atom of slot.atoms || []) {
    const v = Number(atom.ingested?.energy ?? atom.chloroplast?.voltage ?? 0);
    if (v > bestV || (v === bestV && best && String(atom.type) < String(best.type))) {
      bestV = v;
      best = atom;
    }
  }
  return best;
}

function indexEmitters(field) {
  const byAura = new Map();
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      const aura = atom.light?.aura || atom.nucleus?.aura;
      if (aura) byAura.set(aura, atom);
    }
  }
  return byAura;
}

function adjacentGold(gold, i) {
  const links = goldLinksBetween(gold, i, i, i + 1, i + 1);
  if (links.length === 1) return links[0].deprel.split(':')[0];
  if (links.length === 0) return 'none';
  return null;
}

function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    const arr = m.get(k) || [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

function majorityOf(items) {
  const counts = new Map();
  for (const it of items) counts.set(it.label, (counts.get(it.label) || 0) + 1);
  let best = null;
  let n = -1;
  for (const [lab, c] of counts) {
    if (c > n || (c === n && best && lab < best)) {
      best = lab;
      n = c;
    }
  }
  return best;
}

function meanVec(items) {
  if (!items.length) return null;
  const dim = items[0].color.length;
  const acc = new Array(dim).fill(0);
  for (const it of items) {
    for (let i = 0; i < dim; i += 1) acc[i] += it.color[i];
  }
  for (let i = 0; i < dim; i += 1) acc[i] /= items.length;
  return acc;
}

function nearestLabel(color, byLabel) {
  let best = null;
  let bestS = -Infinity;
  for (const [lab, arr] of byLabel) {
    const c = meanVec(arr);
    if (!c) continue;
    const s = cosine(color, c);
    if (s > bestS || (s === bestS && best && lab < best)) {
      bestS = s;
      best = lab;
    }
  }
  return best;
}

function losoPredict(items, predictor) {
  const bySid = groupBy(items, (it) => it.sid);
  let correct = 0;
  let total = 0;
  let corrections = 0;
  let corruptions = 0;
  const confusion = Object.create(null);
  for (const [sid, test] of bySid) {
    const train = items.filter((it) => it.sid !== sid);
    for (const it of test) {
      const pred = predictor(it, train);
      if (pred == null) continue;
      total += 1;
      if (pred === it.label) correct += 1;
      const key = `${it.label}→${pred}`;
      confusion[key] = (confusion[key] || 0) + 1;
    }
  }
  return {
    correct, total,
    accuracy: total ? correct / total : 0,
    corrections,
    corruptions,
    confusion,
  };
}

function typePairMajority(it, train) {
  const peers = train.filter((x) => x.typePair === it.typePair);
  if (!peers.length) return majorityOf(train);
  return majorityOf(peers);
}

function colorOnly(it, train) {
  return nearestLabel(it.color, groupBy(train, (x) => x.label));
}

function typePairThenColor(it, train) {
  const peers = train.filter((x) => x.typePair === it.typePair);
  if (!peers.length) return majorityOf(train);
  const labels = new Set(peers.map((x) => x.label));
  if (labels.size === 1) return peers[0].label;
  return nearestLabel(it.color, groupBy(peers, (x) => x.label));
}

function majorityChance(items) {
  const groups = groupBy(items, (it) => it.label);
  let max = 0;
  for (const arr of groups.values()) if (arr.length > max) max = arr.length;
  return items.length ? max / items.length : 0;
}

function score(name, items, predictor) {
  const loso = losoPredict(items, predictor);
  const classes = [...groupBy(items, (it) => it.label).entries()]
    .map(([label, arr]) => ({ label, n: arr.length }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return {
    name,
    n: items.length,
    classes: classes.length,
    classCounts: Object.fromEntries(classes.slice(0, 12).map((c) => [c.label, c.n])),
    majorityChance: Number(majorityChance(items).toFixed(4)),
    losoCorrect: loso.correct,
    losoTotal: loso.total,
    losoAccuracy: Number(loso.accuracy.toFixed(4)),
    topConfusion: Object.entries(loso.confusion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, n]) => `${k} (${n})`),
  };
}

function deltaVsMajority(items) {
  const bySid = groupBy(items, (it) => it.sid);
  let agree = 0;
  let colorFixes = 0;
  let colorBreaks = 0;
  let bothWrong = 0;
  let total = 0;
  for (const [sid, test] of bySid) {
    const train = items.filter((it) => it.sid !== sid);
    for (const it of test) {
      const maj = typePairMajority(it, train);
      const col = typePairThenColor(it, train);
      if (maj == null || col == null) continue;
      total += 1;
      const majOk = maj === it.label;
      const colOk = col === it.label;
      if (majOk && colOk) agree += 1;
      else if (!majOk && colOk) colorFixes += 1;
      else if (majOk && !colOk) colorBreaks += 1;
      else bothWrong += 1;
    }
  }
  return {
    total, agree, colorFixes, colorBreaks, bothWrong,
    net: colorFixes - colorBreaks,
  };
}

const eligible = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 1 && tokens.length <= MAX) {
    eligible.push({ rec, tokens, gold: goldByIndex(rec) });
  }
}

process.stderr.write('══════════════════════════════════════════════════════════════════════\n');
process.stderr.write('  COLOR AS PREDICTION — annotate-only spike\n');
process.stderr.write('══════════════════════════════════════════════════════════════════════\n');
process.stderr.write(`corpus: treebank-gate  n=${eligible.length}  maxTokens=${MAX}  seed=${SEED}\n`);
process.stderr.write('leaf color forecasts adjacent gold deprel. type-pair is the baseline.\n\n');

const pairs = [];
let composed = 0;
let threw = 0;
let adjacent = 0;
const started = Date.now();

for (let sid = 0; sid < eligible.length; sid += 1) {
  const { tokens, gold } = eligible[sid];
  let chart;
  try {
    chart = composePacked(tokens, posMap, {});
  } catch {
    threw += 1;
    continue;
  }
  composed += 1;
  const field = chart.field || [];
  const emitters = indexEmitters(field);
  const colors = [];
  for (const slot of field) {
    const contested = contestKeys(slot);
    const atom = preferredAtom(slot);
    colors.push({
      atom,
      type: atom?.type || '∅',
      color: atom ? paintAtom(atom, contested, emitters) : new Array(BANDS.length).fill(0),
    });
  }
  for (let i = 0; i + 1 < colors.length; i += 1) {
    adjacent += 1;
    const label = adjacentGold(gold, i);
    if (label == null) continue;
    const left = colors[i];
    const right = colors[i + 1];
    pairs.push({
      sid,
      i,
      label,
      edge: label === 'none' ? 0 : 1,
      typePair: `${left.type}|${right.type}`,
      color: l2normalize([...left.color, ...right.color]),
    });
  }
  if ((sid + 1) % 25 === 0 || sid + 1 === eligible.length) {
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    process.stderr.write(`  painted ${sid + 1}/${eligible.length}  pairs=${pairs.length}  ${sec}s\n`);
  }
}

const random = rng(SEED);
const shuffledPairs = pairs.map((it) => {
  const color = [...it.color];
  shuffleInPlace(color, random);
  return { ...it, color };
});

const typePairLabels = groupBy(pairs, (it) => it.typePair);
const ambiguousPairs = pairs.filter((it) => {
  const labs = new Set((typePairLabels.get(it.typePair) || []).map((x) => x.label));
  return labs.size >= MIN_AMBIG_LABEL;
});
const shuffledAmbig = shuffledPairs.filter((it) => {
  const labs = new Set((typePairLabels.get(it.typePair) || []).map((x) => x.label));
  return labs.size >= MIN_AMBIG_LABEL;
});

const ambigTypePairs = [...typePairLabels.entries()]
  .filter(([, arr]) => new Set(arr.map((x) => x.label)).size >= MIN_AMBIG_LABEL)
  .map(([pair, arr]) => {
    const labs = groupBy(arr, (x) => x.label);
    const top = [...labs.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    return {
      typePair: pair,
      n: arr.length,
      labels: Object.fromEntries([...labs.entries()].map(([k, v]) => [k, v.length])),
      majorityShare: top ? Number((top[1].length / arr.length).toFixed(3)) : 0,
    };
  })
  .sort((a, b) => b.n - a.n);

const edgeItems = pairs.map((it) => ({ ...it, label: it.edge ? 'edge' : 'none' }));
const ambigEdge = ambiguousPairs.map((it) => ({ ...it, label: it.edge ? 'edge' : 'none' }));

process.stderr.write('scoring predictors…\n');

const assays = {
  allTypePair: score('all/type-pair', pairs, typePairMajority),
  allColor: score('all/color-only', pairs, colorOnly),
  allHybrid: score('all/type-pair+color', pairs, typePairThenColor),
  allShuffled: score('all/type-pair+shuffled', shuffledPairs, typePairThenColor),
  ambigTypePair: score('ambig/type-pair', ambiguousPairs, typePairMajority),
  ambigColor: score('ambig/color-only', ambiguousPairs, colorOnly),
  ambigHybrid: score('ambig/type-pair+color', ambiguousPairs, typePairThenColor),
  ambigShuffled: score('ambig/type-pair+shuffled', shuffledAmbig, typePairThenColor),
  edgeTypePair: score('edge/type-pair', edgeItems, typePairMajority),
  edgeHybrid: score('edge/type-pair+color', edgeItems, typePairThenColor),
  ambigEdgeTypePair: score('ambig-edge/type-pair', ambigEdge, typePairMajority),
  ambigEdgeHybrid: score('ambig-edge/type-pair+color', ambigEdge, typePairThenColor),
};

const residuals = {
  all: deltaVsMajority(pairs),
  ambig: deltaVsMajority(ambiguousPairs),
};

const falsifiers = {
  typePairBeatsOrTiesHybridOnAmbig: assays.ambigTypePair.losoAccuracy >= assays.ambigHybrid.losoAccuracy,
  shuffledBeatsOrTiesRealOnAmbig: assays.ambigShuffled.losoAccuracy >= assays.ambigHybrid.losoAccuracy,
  colorOnlyBeatsOrTiesTypePair: assays.allColor.losoAccuracy >= assays.allTypePair.losoAccuracy,
  hybridDoesNotRaiseGoldEdge: assays.edgeHybrid.losoAccuracy <= assays.edgeTypePair.losoAccuracy,
};

const saved = !falsifiers.typePairBeatsOrTiesHybridOnAmbig
  && !falsifiers.shuffledBeatsOrTiesRealOnAmbig;

const verdict = saved
  ? 'SAVES — on ambiguous type pairs, field color breaks gold-deprel ties better than types and better than shuffled color'
  : 'DEAD — color does not predict residual gold structure once the type pair is known';

const report = {
  contract: 'PB-SPECTRAL-COLOR-PREDICT-v1',
  kind: 'annotate-only-spike',
  throwaway: true,
  seed: SEED,
  elapsedMs: Date.now() - started,
  corpus: {
    fixture: 'tests/qa/fixtures/constellation/treebank-gate.conllu',
    eligible: eligible.length,
    composed,
    threw,
    maxTokens: MAX,
  },
  population: {
    adjacent,
    pairs: pairs.length,
    ambiguousPairs: ambiguousPairs.length,
    ambiguousTypePairs: ambigTypePairs.length,
    goldEdges: pairs.filter((p) => p.edge === 1).length,
  },
  topAmbiguousTypePairs: ambigTypePairs.slice(0, 12),
  assays,
  residuals,
  falsifiers,
  verdict,
};

report.checksum = `color-predict-v1:${sha256Hex({
  seed: SEED,
  assays,
  residuals,
  falsifiers,
  verdict,
})}`;

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

function line(row) {
  return [
    row.name.padEnd(28),
    `n=${String(row.n).padStart(5)}`,
    `LOSO ${row.losoCorrect}/${row.losoTotal}=${(row.losoAccuracy * 100).toFixed(1)}%`,
    `chance ${(row.majorityChance * 100).toFixed(1)}%`,
  ].join('  ');
}

console.log('POPULATION');
console.log(`  pairs=${pairs.length}  ambiguous=${ambiguousPairs.length}  type-pairs-ambig=${ambigTypePairs.length}  gold-edges=${pairs.filter((p) => p.edge === 1).length}`);
console.log('\nALL ADJACENT PAIRS → gold deprel or none');
for (const key of ['allTypePair', 'allColor', 'allHybrid', 'allShuffled']) console.log(`  ${line(assays[key])}`);
console.log('\nAMBIGUOUS TYPE PAIRS ONLY (the only place color can help)');
for (const key of ['ambigTypePair', 'ambigColor', 'ambigHybrid', 'ambigShuffled']) console.log(`  ${line(assays[key])}`);
console.log('\nGOLD EDGE vs NONE');
for (const key of ['edgeTypePair', 'edgeHybrid', 'ambigEdgeTypePair', 'ambigEdgeHybrid']) console.log(`  ${line(assays[key])}`);
console.log('\nRESIDUAL vs TYPE-PAIR MAJORITY');
for (const [name, row] of Object.entries(residuals)) {
  console.log(`  ${name.padEnd(8)} n=${row.total}  agree=${row.agree}  color-fixes=${row.colorFixes}  color-breaks=${row.colorBreaks}  both-wrong=${row.bothWrong}  net=${row.net}`);
}
console.log('\nTOP AMBIGUOUS TYPE PAIRS');
for (const row of ambigTypePairs.slice(0, 8)) {
  console.log(`  ${row.typePair.padEnd(16)} n=${String(row.n).padStart(4)}  maj=${row.majorityShare}  ${JSON.stringify(row.labels)}`);
}
console.log('\nFALSIFIERS');
console.log(`  type-pair ≥ hybrid on ambig:     ${falsifiers.typePairBeatsOrTiesHybridOnAmbig}   (${assays.ambigTypePair.losoAccuracy} vs ${assays.ambigHybrid.losoAccuracy})`);
console.log(`  shuffled ≥ real color on ambig:  ${falsifiers.shuffledBeatsOrTiesRealOnAmbig}   (${assays.ambigShuffled.losoAccuracy} vs ${assays.ambigHybrid.losoAccuracy})`);
console.log(`  color-only ≥ type-pair globally: ${falsifiers.colorOnlyBeatsOrTiesTypePair}   (${assays.allColor.losoAccuracy} vs ${assays.allTypePair.losoAccuracy})`);
console.log(`  hybrid does not raise gold-edge: ${falsifiers.hybridDoesNotRaiseGoldEdge}   (${assays.edgeTypePair.losoAccuracy} vs ${assays.edgeHybrid.losoAccuracy})`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`evidence: ${EVIDENCE}`);
console.log(`checksum: ${report.checksum}`);
