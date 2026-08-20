#!/usr/bin/env node
/**
 * SPIKE (throwaway): RESONANCE SYNC
 *
 * Previous paint failed because coupling was a scalar. Everything glowed
 * gold/blue. This spike replaces the scalar with a driven oscillator:
 *
 *   color            = frequency
 *   frequency        = vibration of a pigment (ω_0 lives on chlorophyll)
 *   molecular modes  = coupled-oscillator split or phase-lock
 *   sync             = overlap of field vibration with those modes
 *
 * Photon stays {aura, from, to, energy}. Frequency is not a type stamp
 * on the ray. Type enters only as the pigment's natural frequency.
 *
 * PHYSICS:          driven + coupled oscillators; Kuramoto lock; bonding/antibonding split
 * SEMANTIC ANALOG:  pigment ω_0; bond κ; molecule = normal modes
 * STATE:            16-bin vibrational spectrum
 * OPERATOR:         annotate-only after composePacked
 * OBSERVABLE:       family / gold-deprel / NP-internal family / ranking top-1
 * CONTROL:          detune, shuffled ω table, κ=0, type-only, current rankByResonance
 * FALSIFIER:
 *   1. detuned gap ≥ on-resonance gap (gold deprel)
 *   2. shuffled ω table ≥ designed table (gold deprel)
 *   3. type-only ≥ sync on gold deprel
 *   4. κ=0 ≥ full on NP-internal family (type is constant there)
 *   5. detuned ranking ≥ synced ranking (gold verb top-1)
 *
 *   node scripts/spectral-resonance-sync.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { composePacked, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import { BOND_REACTION, classifyBond } from '../codex/core/constellation/bond-kind.js';
import { channelResonance } from '../codex/core/constellation/resonance-beacon.js';
import { constructionByBondTuple } from '../codex/core/constellation/grimoire/index.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { goldAnswer, parseConllu } from '../codex/core/constellation/treebank.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-spectral-resonance-sync.json');
const SEED = 0x5c4010;
const MIN_CLASS = 8;
const MAX_PAIRS_PER_CLASS = 50;
const BETWEEN_PAIRS = 2000;
const MAX_BONDED_PER_SENTENCE = 48;
const BINS = 16;
const FMIN = 0.15;
const FMAX = 1.85;
const GAMMA = 0.12;
const LOCK_SPAN = 0.35;
const DETUNE = 0.55;
const CENTERS = Object.freeze(Array.from({ length: BINS }, (_, i) => (
  FMIN + ((i + 0.5) * (FMAX - FMIN)) / BINS
)));

/**
 * Pigment natural frequencies. Related types sit nearby so a lock can
 * fire; distant types must split. This is a declared prior, not a measurement.
 * The shuffled-ω control asks whether the neighborhood structure matters.
 */
const OMEGA = Object.freeze({
  PUNCT: 0.18, COMMA: 0.22,
  PP: 0.62, PART: 0.68, NPO: 0.74, PROPN: 0.76, N: 0.80, NP: 0.82, NC: 0.86,
  PRON: 0.90, PRONACC: 0.92, ADJ: 0.96, ADV: 1.00,
  S: 1.04, INV: 1.06, V: 1.10, VP: 1.14,
  COP: 1.18, AUX: 1.22, MODAL: 1.24, PRT: 1.26,
  SUB: 1.30, CONJ: 1.36, POSS: 1.42, TO: 1.46, P: 1.52, DET: 1.62,
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

function fallbackOmega(type) {
  let h = 2166136261;
  for (const ch of String(type)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return 0.30 + ((h >>> 0) % 1400) / 1000;
}

function omegaOf(type, table) {
  const hit = table[type];
  if (Number.isFinite(hit)) return hit;
  return fallbackOmega(type);
}

function zeros() {
  return new Array(BINS).fill(0);
}

function lorentzian(omega, omega0) {
  const d = omega - omega0;
  return (GAMMA * GAMMA) / ((d * d) + (GAMMA * GAMMA));
}

function deposit(spec, omega0, amp) {
  if (!(amp > 0) || !Number.isFinite(omega0)) return spec;
  for (let i = 0; i < BINS; i += 1) spec[i] += amp * lorentzian(CENTERS[i], omega0);
  return spec;
}

function addSpec(dest, src, scale = 1) {
  for (let i = 0; i < BINS; i += 1) dest[i] += scale * (src[i] || 0);
  return dest;
}

function energy(spec) {
  let e = 0;
  for (const x of spec) e += x;
  return e;
}

function centroid(spec) {
  let m = 0;
  let e = 0;
  for (let i = 0; i < BINS; i += 1) {
    m += CENTERS[i] * spec[i];
    e += spec[i];
  }
  return e > 0 ? m / e : 0;
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

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

function cohensD(a, b) {
  const va = variance(a);
  const vb = variance(b);
  const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / Math.max(1, a.length + b.length - 2));
  if (pooled === 0) return 0;
  return (mean(a) - mean(b)) / pooled;
}

/** Bonding / antibonding pair. κ = 0 recovers {ωa, ωb}. */
export function splitModes(wa, wb, kappa) {
  const a2 = wa * wa;
  const b2 = wb * wb;
  const g = kappa * wa * wb;
  const disc = Math.sqrt(Math.max(0, ((a2 - b2) ** 2) + (4 * g * g)));
  return {
    minus: Math.sqrt(Math.max(1e-9, (a2 + b2 - disc) / 2)),
    plus: Math.sqrt(Math.max(1e-9, (a2 + b2 + disc) / 2)),
  };
}

export function canLock(wa, wb, kappa) {
  return Math.abs(wa - wb) < (kappa * LOCK_SPAN);
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

function combineSpectra(leftSpec, rightSpec, kappa, kind) {
  const out = zeros();
  if (!(kappa > 0)) {
    addSpec(out, leftSpec);
    addSpec(out, rightSpec);
    return { spec: out, mode: 'independent' };
  }
  const wa = centroid(leftSpec);
  const wb = centroid(rightSpec);
  const ea = energy(leftSpec);
  const eb = energy(rightSpec);
  if (kind === BOND_REACTION.CONSTRUCTIVE) {
    const { minus, plus } = splitModes(wa, wb, kappa);
    const amp = (ea + eb) / 2;
    deposit(out, minus, amp);
    deposit(out, plus, amp);
    addSpec(out, leftSpec, 0.25);
    addSpec(out, rightSpec, 0.25);
    return { spec: out, mode: 'split' };
  }
  if (canLock(wa, wb, kappa)) {
    deposit(out, (wa + wb) / 2, ea + eb);
    return { spec: out, mode: 'lock' };
  }
  addSpec(out, leftSpec);
  addSpec(out, rightSpec);
  deposit(out, Math.abs(wa - wb), 0.35 * Math.min(ea, eb));
  return { spec: out, mode: 'beat' };
}

function leafSpectrum(atom, table) {
  const spec = zeros();
  const amp = Math.max(0.05, Number(atom.ingested?.energy || atom.chloroplast?.voltage || 0));
  deposit(spec, omegaOf(atom.type, table), amp);
  return spec;
}

function fieldAtomFor(field, node) {
  if (!node || !Number.isInteger(node.from) || node.from !== node.to) return null;
  const slot = field[node.from];
  if (!slot) return null;
  const aura = node.nucleus?.aura;
  if (aura) {
    const hit = (slot.atoms || []).find((a) => (a.nucleus?.aura || a.light?.aura) === aura);
    if (hit) return hit;
  }
  return (slot.atoms || []).find((a) => a.type === node.type) || null;
}

function paintMolecule(node, field, table, kappaOn, memo) {
  if (!node) return { spec: zeros(), mode: 'empty' };
  if (memo.has(node)) return memo.get(node);
  const placeholder = { spec: zeros(), mode: 'pending' };
  memo.set(node, placeholder);
  const d = (node.derivations && node.derivations[0]) || null;
  let painted;
  if (!d) {
    const leaf = fieldAtomFor(field, node);
    painted = { spec: leaf ? leafSpectrum(leaf, table) : zeros(), mode: 'leaf' };
  } else if (d.lift && d.child) {
    painted = paintMolecule(d.child, field, table, kappaOn, memo);
  } else if (d.bond && d.left && d.right) {
    const left = paintMolecule(d.left, field, table, kappaOn, memo);
    const right = paintMolecule(d.right, field, table, kappaOn, memo);
    const kappa = kappaOn ? (bestBond(d.bond[0], d.bond[1]).score || 0) : 0;
    const kind = classifyBond(d.bond);
    painted = combineSpectra(left.spec, right.spec, kappa, kind);
  } else {
    painted = { spec: zeros(), mode: 'empty' };
  }
  memo.set(node, painted);
  return painted;
}

function driveSpectrum(field, table) {
  const spec = zeros();
  for (const slot of field || []) {
    for (const atom of slot.atoms || []) {
      const amp = Number(atom.ingested?.energy || atom.chloroplast?.voltage || 0);
      if (amp > 0) deposit(spec, omegaOf(atom.type, table), amp);
    }
  }
  return spec;
}

function colorName(vec) {
  const ranked = CENTERS
    .map((w, i) => ({ w, v: vec[i] || 0 }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  if (!ranked.length) return 'silent';
  const top = ranked.slice(0, 2).map((r) => r.w.toFixed(2));
  return top.join('/');
}

function shuffleOmegaTable(random) {
  const types = Object.keys(OMEGA);
  const values = types.map((t) => OMEGA[t]);
  shuffleInPlace(values, random);
  const table = Object.create(null);
  types.forEach((t, i) => { table[t] = values[i]; });
  return table;
}

function detunedTable() {
  const table = Object.create(null);
  for (const [k, v] of Object.entries(OMEGA)) table[k] = v + DETUNE;
  return table;
}

function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    const arr = m.get(k) || [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

function pairwiseCosines(items, random) {
  const within = [];
  const between = [];
  const groups = groupBy(items, (it) => it.label);
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    const n = Math.min(MAX_PAIRS_PER_CLASS, (arr.length * (arr.length - 1)) / 2);
    for (let k = 0; k < n; k += 1) {
      const i = Math.floor(random() * arr.length);
      let j = Math.floor(random() * arr.length);
      if (j === i) j = (j + 1) % arr.length;
      within.push(cosine(arr[i].vec, arr[j].vec));
    }
  }
  let attempts = 0;
  while (between.length < BETWEEN_PAIRS && attempts < BETWEEN_PAIRS * 8) {
    attempts += 1;
    if (items.length < 2) break;
    const a = items[Math.floor(random() * items.length)];
    const b = items[Math.floor(random() * items.length)];
    if (a.label === b.label) continue;
    between.push(cosine(a.vec, b.vec));
  }
  return { within, between };
}

function addVec(acc, vec, scale) {
  for (let i = 0; i < acc.length; i += 1) acc[i] += scale * vec[i];
}

function losoAccuracy(items) {
  if (!items.length) {
    return { correct: 0, total: 0, accuracy: 0, confusion: {} };
  }
  const bySid = groupBy(items, (it) => it.sid);
  const byLabel = groupBy(items, (it) => it.label);
  const dim = items[0].vec.length;
  const sums = new Map();
  const counts = new Map();
  for (const [lab, arr] of byLabel) {
    if (arr.length < MIN_CLASS) continue;
    const acc = new Array(dim).fill(0);
    for (const it of arr) addVec(acc, it.vec, 1);
    sums.set(lab, acc);
    counts.set(lab, arr.length);
  }
  let correct = 0;
  let total = 0;
  const confusion = Object.create(null);
  for (const [, test] of bySid) {
    const cents = new Map();
    const drop = groupBy(test, (it) => it.label);
    for (const [lab, sum] of sums) {
      const n = counts.get(lab) - (drop.get(lab)?.length || 0);
      if (n < MIN_CLASS) continue;
      const acc = sum.slice();
      for (const it of drop.get(lab) || []) addVec(acc, it.vec, -1);
      for (let i = 0; i < dim; i += 1) acc[i] /= n;
      cents.set(lab, acc);
    }
    if (cents.size === 0) continue;
    for (const it of test) {
      let best = null;
      let bestSim = -Infinity;
      for (const [lab, c] of cents) {
        const s = cosine(it.vec, c);
        if (s > bestSim || (s === bestSim && best && lab < best)) {
          bestSim = s;
          best = lab;
        }
      }
      if (best == null) continue;
      total += 1;
      if (best === it.label) correct += 1;
      const key = `${it.label}→${best}`;
      confusion[key] = (confusion[key] || 0) + 1;
    }
  }
  return { correct, total, accuracy: total ? correct / total : 0, confusion };
}

function majorityChance(items) {
  const groups = groupBy(items, (it) => it.label);
  let max = 0;
  for (const arr of groups.values()) if (arr.length > max) max = arr.length;
  return items.length ? max / items.length : 0;
}

function evaluate(name, items, random) {
  const pairs = pairwiseCosines(items, random);
  const loso = losoAccuracy(items);
  const classes = [...groupBy(items, (it) => it.label).entries()]
    .map(([label, arr]) => ({ label, n: arr.length }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return {
    name,
    n: items.length,
    classes: classes.length,
    classCounts: Object.fromEntries(classes.map((c) => [c.label, c.n])),
    eligibleClasses: classes.filter((c) => c.n >= MIN_CLASS).length,
    withinN: pairs.within.length,
    betweenN: pairs.between.length,
    withinMean: Number(mean(pairs.within).toFixed(4)),
    betweenMean: Number(mean(pairs.between).toFixed(4)),
    gap: Number((mean(pairs.within) - mean(pairs.between)).toFixed(4)),
    cohensD: Number(cohensD(pairs.within, pairs.between).toFixed(4)),
    losoCorrect: loso.correct,
    losoTotal: loso.total,
    losoAccuracy: Number(loso.accuracy.toFixed(4)),
    majorityChance: Number(majorityChance(items).toFixed(4)),
    uniformChance: classes.length ? Number((1 / classes.length).toFixed(4)) : 0,
    topConfusion: Object.entries(loso.confusion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, n]) => `${k} (${n})`),
  };
}

function goldDeprel(gold, node) {
  const d = (node.derivations && node.derivations[0]) || null;
  if (!d?.bond || !d.left || !d.right) return null;
  const links = goldLinksBetween(gold, d.left.from, d.left.to, d.right.from, d.right.to);
  if (links.length === 1) return links[0].deprel.split(':')[0];
  if (links.length === 0) return 'no-gold-link';
  return null;
}

function familyOf(node) {
  const d = (node.derivations && node.derivations[0]) || null;
  if (!d?.bond) return null;
  return constructionByBondTuple(d.bond)?.family || 'unregistered';
}

function containsGoldVerb(node, verb) {
  if (!verb || !node) return false;
  return projectAnswers(node).some((a) => a.verb === verb);
}

const eligible = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= MAX) {
    eligible.push({ rec, tokens, gold: goldByIndex(rec), answer: goldAnswer(rec) });
  }
}

process.stderr.write('══════════════════════════════════════════════════════════════════════\n');
process.stderr.write('  RESONANCE SYNC — annotate-only spike\n');
process.stderr.write('══════════════════════════════════════════════════════════════════════\n');
process.stderr.write(`corpus: treebank-gate  n=${eligible.length}  maxTokens=${MAX}  seed=${SEED}\n`);
process.stderr.write('photon stays meaning-agnostic. ω_0 is pigment. molecule = lock or split.\n\n');

const random = rng(SEED);
const tables = {
  designed: OMEGA,
  detuned: detunedTable(),
  shuffled: shuffleOmegaTable(random),
};

const familyBy = { designed: [], detuned: [], shuffled: [], kappa0: [] };
const deprelBy = { designed: [], detuned: [], shuffled: [], kappa0: [] };
const npFamilyBy = { designed: [], detuned: [], shuffled: [], kappa0: [] };
const modeCounts = { split: 0, lock: 0, beat: 0, independent: 0, leaf: 0, empty: 0, pending: 0 };
const ranking = {
  parsed: 0,
  baselineTop1: 0,
  syncTop1: 0,
  detuneTop1: 0,
  kappa0Top1: 0,
};
const examples = [];
let composed = 0;
let threw = 0;
let bondedSeen = 0;
let bondedKept = 0;
const started = Date.now();

for (let sid = 0; sid < eligible.length; sid += 1) {
  const { tokens, gold, answer } = eligible[sid];
  let chart;
  try {
    chart = composePacked(tokens, posMap, {});
  } catch {
    threw += 1;
    continue;
  }
  composed += 1;
  const field = chart.field || [];
  const memos = {
    designed: new WeakMap(),
    detuned: new WeakMap(),
    shuffled: new WeakMap(),
    kappa0: new WeakMap(),
  };

  const bonded = [];
  for (const node of chart.molecules || []) {
    const d = (node.derivations && node.derivations[0]) || null;
    if (!d?.bond) continue;
    bondedSeen += 1;
    bonded.push(node);
  }
  bonded.sort((a, b) => {
    const aw = (a.to ?? 0) - (a.from ?? 0);
    const bw = (b.to ?? 0) - (b.from ?? 0);
    return bw - aw || a.from - b.from || String(a.type).localeCompare(String(b.type));
  });
  const kept = bonded.slice(0, MAX_BONDED_PER_SENTENCE);
  bondedKept += kept.length;

  const pushItem = (bucket, node, painted, label) => {
    if (!label) return;
    const vec = l2normalize(painted.spec);
    bucket.push({
      sid, label, vec, color: colorName(vec), type: node.type, mode: painted.mode,
    });
  };

  for (const node of kept) {
    const family = familyOf(node);
    const deprel = goldDeprel(gold, node);
    const designed = paintMolecule(node, field, tables.designed, true, memos.designed);
    modeCounts[designed.mode] = (modeCounts[designed.mode] || 0) + 1;
    pushItem(familyBy.designed, node, designed, family);
    pushItem(deprelBy.designed, node, designed, deprel);
    if (node.type === 'NP' || node.type === 'N') pushItem(npFamilyBy.designed, node, designed, family);

    const detuned = paintMolecule(node, field, tables.detuned, true, memos.detuned);
    pushItem(familyBy.detuned, node, detuned, family);
    pushItem(deprelBy.detuned, node, detuned, deprel);
    if (node.type === 'NP' || node.type === 'N') pushItem(npFamilyBy.detuned, node, detuned, family);

    const shuffled = paintMolecule(node, field, tables.shuffled, true, memos.shuffled);
    pushItem(familyBy.shuffled, node, shuffled, family);
    pushItem(deprelBy.shuffled, node, shuffled, deprel);
    if (node.type === 'NP' || node.type === 'N') pushItem(npFamilyBy.shuffled, node, shuffled, family);

    const k0 = paintMolecule(node, field, tables.designed, false, memos.kappa0);
    pushItem(familyBy.kappa0, node, k0, family);
    pushItem(deprelBy.kappa0, node, k0, deprel);
    if (node.type === 'NP' || node.type === 'N') pushItem(npFamilyBy.kappa0, node, k0, family);
  }

  const stable = chart.stable || [];
  if (stable.length > 0) {
    ranking.parsed += 1;
    const goldVerb = answer.verb;
    const baselineTop = (chart.ranked && chart.ranked[0] && chart.ranked[0].molecule) || stable[0];
    if (containsGoldVerb(baselineTop, goldVerb)) ranking.baselineTop1 += 1;

    const scoreRoots = (table, kappaOn, memo) => {
      const drive = l2normalize(driveSpectrum(field, table));
      let best = stable[0];
      let bestS = -Infinity;
      for (const node of stable) {
        const painted = paintMolecule(node, field, table, kappaOn, memo);
        const s = cosine(drive, l2normalize(painted.spec));
        if (s > bestS) {
          bestS = s;
          best = node;
        }
      }
      return best;
    };
    if (containsGoldVerb(scoreRoots(tables.designed, true, memos.designed), goldVerb)) ranking.syncTop1 += 1;
    if (containsGoldVerb(scoreRoots(tables.detuned, true, memos.detuned), goldVerb)) ranking.detuneTop1 += 1;
    if (containsGoldVerb(scoreRoots(tables.designed, false, memos.kappa0), goldVerb)) ranking.kappa0Top1 += 1;
  }

  if (examples.length < 8 && stable.length > 0) {
    const root = stable[0];
    const painted = paintMolecule(root, field, tables.designed, true, memos.designed);
    examples.push({
      text: tokens.join(' '),
      rootType: root.type,
      family: familyOf(root),
      mode: painted.mode,
      color: colorName(l2normalize(painted.spec)),
      centroid: Number(centroid(painted.spec).toFixed(3)),
    });
  }

  if ((sid + 1) % 25 === 0 || sid + 1 === eligible.length) {
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    process.stderr.write(`  painted ${sid + 1}/${eligible.length}  composed=${composed}  ${sec}s\n`);
  }
}

function keepMinClass(items) {
  const keep = new Set([...groupBy(items, (it) => it.label).entries()]
    .filter(([, arr]) => arr.length >= MIN_CLASS)
    .map(([k]) => k));
  return items.filter((it) => keep.has(it.label));
}

const typeVocab = [...new Set(familyBy.designed.map((it) => it.type))].sort();
const familyTypeOnly = familyBy.designed.map((it) => ({
  ...it, vec: typeVocab.map((t) => (t === it.type ? 1 : 0)),
}));
const deprelDesigned = keepMinClass(deprelBy.designed);
const deprelTypeVocab = [...new Set(deprelDesigned.map((it) => it.type))].sort();
const deprelTypeOnly = deprelDesigned.map((it) => ({
  ...it, vec: deprelTypeVocab.map((t) => (t === it.type ? 1 : 0)),
}));
const npDesigned = keepMinClass(npFamilyBy.designed);
const npTypeVocab = [...new Set(npDesigned.map((it) => it.type))].sort();
const npTypeOnly = npDesigned.map((it) => ({
  ...it, vec: npTypeVocab.map((t) => (t === it.type ? 1 : 0)),
}));

process.stderr.write('scoring assays…\n');

const assays = {
  familyDesigned: evaluate('family/designed', familyBy.designed, random),
  familyDetuned: evaluate('family/detuned', familyBy.detuned, random),
  familyShuffled: evaluate('family/shuffled-ω', familyBy.shuffled, random),
  familyKappa0: evaluate('family/κ=0', familyBy.kappa0, random),
  familyType: evaluate('family/type-only', familyTypeOnly, random),
  deprelDesigned: evaluate('deprel/designed', deprelDesigned, random),
  deprelDetuned: evaluate('deprel/detuned', keepMinClass(deprelBy.detuned), random),
  deprelShuffled: evaluate('deprel/shuffled-ω', keepMinClass(deprelBy.shuffled), random),
  deprelKappa0: evaluate('deprel/κ=0', keepMinClass(deprelBy.kappa0), random),
  deprelType: evaluate('deprel/type-only', deprelTypeOnly, random),
  npDesigned: evaluate('np-family/designed', npDesigned, random),
  npDetuned: evaluate('np-family/detuned', keepMinClass(npFamilyBy.detuned), random),
  npShuffled: evaluate('np-family/shuffled-ω', keepMinClass(npFamilyBy.shuffled), random),
  npKappa0: evaluate('np-family/κ=0', keepMinClass(npFamilyBy.kappa0), random),
  npType: evaluate('np-family/type-only', npTypeOnly, random),
};

const rankingRates = {
  parsed: ranking.parsed,
  baseline: ranking.baselineTop1,
  sync: ranking.syncTop1,
  detune: ranking.detuneTop1,
  kappa0: ranking.kappa0Top1,
  baselineRate: ranking.parsed ? Number((ranking.baselineTop1 / ranking.parsed).toFixed(4)) : 0,
  syncRate: ranking.parsed ? Number((ranking.syncTop1 / ranking.parsed).toFixed(4)) : 0,
  detuneRate: ranking.parsed ? Number((ranking.detuneTop1 / ranking.parsed).toFixed(4)) : 0,
  kappa0Rate: ranking.parsed ? Number((ranking.kappa0Top1 / ranking.parsed).toFixed(4)) : 0,
};

const falsifiers = {
  detuneDeprelGapBeatsOrTies: assays.deprelDetuned.gap >= assays.deprelDesigned.gap,
  shuffledOmegaDeprelBeatsOrTies: assays.deprelShuffled.losoAccuracy >= assays.deprelDesigned.losoAccuracy,
  typeOnlyDeprelBeatsOrTies: assays.deprelType.losoAccuracy >= assays.deprelDesigned.losoAccuracy,
  kappa0NpBeatsOrTies: assays.npKappa0.losoAccuracy >= assays.npDesigned.losoAccuracy,
  detuneRankingBeatsOrTies: ranking.detuneTop1 >= ranking.syncTop1,
};

const survived = Object.values(falsifiers).every((fired) => fired === false);
const verdict = survived
  ? 'SURVIVES — lock/split spectra carry structure that type, detune, shuffle, and κ=0 do not'
  : 'FAILS — at least one preregistered falsifier fired; do not promote sync into production ranking';

const report = {
  contract: 'PB-SPECTRAL-RESONANCE-SYNC-v1',
  kind: 'annotate-only-spike',
  throwaway: true,
  seed: SEED,
  elapsedMs: Date.now() - started,
  physics: {
    bins: BINS,
    gamma: GAMMA,
    lockSpan: LOCK_SPAN,
    detune: DETUNE,
    omega: OMEGA,
  },
  corpus: {
    fixture: 'tests/qa/fixtures/constellation/treebank-gate.conllu',
    eligible: eligible.length,
    composed,
    threw,
    maxTokens: MAX,
  },
  population: {
    bondedSeen,
    bondedKept,
    familyItems: familyBy.designed.length,
    deprelItems: deprelDesigned.length,
    npItems: npDesigned.length,
    modeCounts,
  },
  examples,
  assays,
  ranking: rankingRates,
  falsifiers,
  verdict,
};

report.checksum = `resonance-sync-v1:${sha256Hex({
  seed: SEED,
  assays,
  ranking: rankingRates,
  falsifiers,
  verdict,
})}`;

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

function line(row) {
  return [
    row.name.padEnd(24),
    `n=${String(row.n).padStart(6)}`,
    `within=${row.withinMean.toFixed(3)}`,
    `between=${row.betweenMean.toFixed(3)}`,
    `gap=${String(row.gap).padStart(7)}`,
    `d=${String(row.cohensD).padStart(7)}`,
    `LOSO ${row.losoCorrect}/${row.losoTotal}=${(row.losoAccuracy * 100).toFixed(1)}%`,
    `chance ${(row.majorityChance * 100).toFixed(1)}%`,
  ].join('  ');
}

console.log('MODES', JSON.stringify(modeCounts));
console.log('\nMOLECULE → CONSTRUCTION FAMILY');
for (const key of ['familyDesigned', 'familyDetuned', 'familyShuffled', 'familyKappa0', 'familyType']) {
  console.log(`  ${line(assays[key])}`);
}
console.log('\nMOLECULE → GOLD DEPREL');
for (const key of ['deprelDesigned', 'deprelDetuned', 'deprelShuffled', 'deprelKappa0', 'deprelType']) {
  console.log(`  ${line(assays[key])}`);
}
console.log('\nNP/N-INTERNAL FAMILY (type held nearly constant)');
for (const key of ['npDesigned', 'npDetuned', 'npShuffled', 'npKappa0', 'npType']) {
  console.log(`  ${line(assays[key])}`);
}
console.log('\nRANKING gold-verb top-1 among parsed');
console.log(`  parsed=${ranking.parsed}`);
console.log(`  rankByResonance  ${ranking.baselineTop1}/${ranking.parsed} = ${(rankingRates.baselineRate * 100).toFixed(1)}%`);
console.log(`  sync overlap     ${ranking.syncTop1}/${ranking.parsed} = ${(rankingRates.syncRate * 100).toFixed(1)}%`);
console.log(`  detuned overlap  ${ranking.detuneTop1}/${ranking.parsed} = ${(rankingRates.detuneRate * 100).toFixed(1)}%`);
console.log(`  κ=0 overlap      ${ranking.kappa0Top1}/${ranking.parsed} = ${(rankingRates.kappa0Rate * 100).toFixed(1)}%`);
console.log('\nEXAMPLES');
for (const ex of examples) {
  console.log(`  "${ex.text}"  ${ex.rootType}/${ex.family || '—'}  ${ex.mode}  ${ex.color}  ⟨ω⟩=${ex.centroid}`);
}
console.log('\nFALSIFIERS');
console.log(`  detune deprel gap ≥ real:     ${falsifiers.detuneDeprelGapBeatsOrTies}   (${assays.deprelDesigned.gap} vs ${assays.deprelDetuned.gap})`);
console.log(`  shuffled ω deprel acc ≥ real: ${falsifiers.shuffledOmegaDeprelBeatsOrTies}   (${assays.deprelDesigned.losoAccuracy} vs ${assays.deprelShuffled.losoAccuracy})`);
console.log(`  type-only deprel acc ≥ real:  ${falsifiers.typeOnlyDeprelBeatsOrTies}   (${assays.deprelDesigned.losoAccuracy} vs ${assays.deprelType.losoAccuracy})`);
console.log(`  κ=0 NP-family acc ≥ real:     ${falsifiers.kappa0NpBeatsOrTies}   (${assays.npDesigned.losoAccuracy} vs ${assays.npKappa0.losoAccuracy})`);
console.log(`  detune ranking ≥ sync:        ${falsifiers.detuneRankingBeatsOrTies}   (${ranking.syncTop1} vs ${ranking.detuneTop1})`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`evidence: ${EVIDENCE}`);
console.log(`checksum: ${report.checksum}`);
