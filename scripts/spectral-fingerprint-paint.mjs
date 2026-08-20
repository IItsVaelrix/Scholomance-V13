#!/usr/bin/env node
/**
 * SPIKE (throwaway): SPECTRAL FINGERPRINT PAINT
 *
 * Hypothesis: meaning-agnostic light already carries energy. Chlorophyll
 * converts that energy into a receiver-local absorption spectrum. Those
 * spectra, composed nonlinearly when atoms bond, should cluster by
 * grammatical construction without stamping a rule name onto the photon.
 *
 * PHYSICS:          absorption spectroscopy / combination bands
 * SEMANTIC ANALOG:  atom paint = pigment absorption of the field
 *                   molecule paint = child spectra + coupling excess
 * STATE:            15-band vector (kind / polarity / range / lock / combo)
 * OPERATOR:         annotate-only paint after composePacked
 * OBSERVABLE:       within- vs between-class cosine; LOSO centroid accuracy
 * CONTROL:          shuffle, type-only, kind-only, geometry-only, no-kind
 * FALSIFIER:
 *   1. shuffled within−between gap ≥ real gap
 *   2. type-only accuracy ≥ full-spectrum accuracy
 *   3. same-span rival pigments cosine > 0.95
 *
 * CANNOT: put type on the photon; rewrite the grammar; admit a root;
 *         solve a sentence with no root. Color is not a bond.
 *
 *   node scripts/spectral-fingerprint-paint.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { BONDS, LIFTS } from '../codex/core/constellation/compose.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { BOND_REACTION, classifyBond } from '../codex/core/constellation/bond-kind.js';
import { channelResonance } from '../codex/core/constellation/resonance-beacon.js';
import { constructionByBondTuple } from '../codex/core/constellation/grimoire/index.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { parseConllu } from '../codex/core/constellation/treebank.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-spectral-fingerprint-paint.json');
const SEED = 0x5c4010;
const MIN_CLASS = 8;
const MAX_PAIRS_PER_CLASS = 50;
const BETWEEN_PAIRS = 2000;
const MAX_BONDED_PER_SENTENCE = 48;

const BANDS = Object.freeze([
  'carbon', 'silicone', 'recursive',
  'left', 'right',
  'near', 'mid', 'far',
  'lock', 'contest',
  'absorption', 'silence',
  'comboCarbon', 'comboSilicone', 'comboRecursive',
]);

const BAND_HUE = Object.freeze({
  carbon: 'blue',
  silicone: 'green',
  recursive: 'red',
  left: 'violet',
  right: 'amber',
  near: 'cyan',
  mid: 'teal',
  far: 'indigo',
  lock: 'gold',
  contest: 'magenta',
  absorption: 'white',
  silence: 'black',
  comboCarbon: 'electric-blue',
  comboSilicone: 'lime',
  comboRecursive: 'crimson',
});

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

function addInto(dest, src, scale = 1) {
  for (const b of BANDS) dest[b] = (dest[b] || 0) + scale * (src[b] || 0);
  return dest;
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

/**
 * Receiver-local paint. Photons stay {aura, from, to, energy}.
 * Color is what the pigment made of arrivals, bucketed by coupling kind,
 * polarity, range, and whether the cell was won alone.
 */
function paintAtom(atom, contested, emitters) {
  const bands = emptyBands();
  const cells = atom.chloroplast?.cells || [];
  const arrivals = cells.length;
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
  bands.silence = arrivals > 0 ? silent / arrivals : 1;
  return bands;
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

function paintMolecule(node, field, emitters, contestBySlot, atomPaint, memo) {
  if (!node) return emptyBands();
  if (memo.has(node)) return memo.get(node);
  memo.set(node, emptyBands());
  const d = (node.derivations && node.derivations[0]) || null;
  let bands;
  if (!d) {
    const leaf = fieldAtomFor(field, node);
    bands = leaf && atomPaint.has(leaf) ? atomPaint.get(leaf) : emptyBands();
  } else if (d.lift && d.child) {
    bands = emptyBands();
    addInto(bands, paintMolecule(d.child, field, emitters, contestBySlot, atomPaint, memo));
  } else if (d.bond && d.left && d.right) {
    const left = paintMolecule(d.left, field, emitters, contestBySlot, atomPaint, memo);
    const right = paintMolecule(d.right, field, emitters, contestBySlot, atomPaint, memo);
    bands = emptyBands();
    addInto(bands, left);
    addInto(bands, right);
    const overlap = Math.max(0, cosine(l2normalize(toVec(left)), l2normalize(toVec(right))));
    const width = 1 + Math.max(0, (d.left.to ?? d.left.from ?? 0) - (d.left.from ?? 0))
      + Math.max(0, (d.right.to ?? d.right.from ?? 0) - (d.right.from ?? 0));
    const excess = overlap / width;
    const kind = classifyBond(d.bond);
    if (kind === BOND_REACTION.CONSTRUCTIVE) bands.comboCarbon += excess;
    else if (kind === BOND_REACTION.RECURSIVE_PRESERVATIVE) bands.comboRecursive += excess;
    else bands.comboSilicone += excess;
  } else {
    bands = emptyBands();
  }
  memo.set(node, bands);
  return bands;
}

function colorName(vec) {
  const ranked = BANDS
    .map((b, i) => ({ b, v: vec[i] || 0 }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v || a.b.localeCompare(b.b));
  if (ranked.length === 0) return 'transparent';
  const top = ranked.slice(0, 2).map((r) => BAND_HUE[r.b]);
  return [...new Set(top)].join('/');
}

function sliceVec(vec, keep) {
  return BANDS.map((b, i) => (keep.has(b) ? vec[i] : 0));
}

function shuffleVec(vec, random) {
  const out = [...vec];
  shuffleInPlace(out, random);
  return out;
}

function oneHot(label, vocab) {
  return vocab.map((v) => (v === label ? 1 : 0));
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
  const bySid = groupBy(items, (it) => it.sid);
  const byLabel = groupBy(items, (it) => it.label);
  const dim = items[0]?.vec.length || 0;
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
  for (const [sid, test] of bySid) {
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
      .slice(0, 8)
      .map(([k, n]) => `${k} (${n})`),
  };
}

function remap(items, vecFn) {
  return items.map((it) => ({ ...it, vec: vecFn(it) }));
}

const eligible = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= MAX) {
    eligible.push({ rec, tokens, gold: goldByIndex(rec) });
  }
}

process.stderr.write('══════════════════════════════════════════════════════════════════════\n');
process.stderr.write('  SPECTRAL FINGERPRINT PAINT — annotate-only spike\n');
process.stderr.write('══════════════════════════════════════════════════════════════════════\n');
process.stderr.write(`corpus: treebank-gate  n=${eligible.length}  maxTokens=${MAX}  seed=${SEED}\n`);
process.stderr.write('photon stays {aura, from, to, energy}. color is pigment product.\n\n');

const atomItems = [];
const familyItems = [];
const deprelItems = [];
const rivalPairs = [];
const examples = [];
let composed = 0;
let threw = 0;
let leafAtoms = 0;
let paintedLeaves = 0;
let bondedSeen = 0;
let bondedKept = 0;
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
  const contestBySlot = field.map((slot) => contestKeys(slot));
  const atomPaint = new Map();
  const memo = new WeakMap();

  for (const slot of field) {
    const paintedHere = [];
    const contested = contestBySlot[slot.index] || contestKeys(slot);
    for (const atom of slot.atoms || []) {
      leafAtoms += 1;
      const bands = paintAtom(atom, contested, emitters);
      atomPaint.set(atom, bands);
      const vec = l2normalize(toVec(bands));
      paintedLeaves += 1;
      atomItems.push({
        sid,
        label: atom.type,
        vec,
        color: colorName(vec),
        type: atom.type,
      });
      paintedHere.push({ type: atom.type, vec });
    }
    for (let i = 0; i < paintedHere.length; i += 1) {
      for (let j = i + 1; j < paintedHere.length; j += 1) {
        rivalPairs.push({ cosine: cosine(paintedHere[i].vec, paintedHere[j].vec) });
      }
    }
  }

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

  for (const node of kept) {
    const bands = paintMolecule(node, field, emitters, contestBySlot, atomPaint, memo);
    const vec = l2normalize(toVec(bands));
    const family = familyOf(node);
    const deprel = goldDeprel(gold, node);
    if (family) {
      familyItems.push({
        sid, label: family, vec, color: colorName(vec), type: node.type,
      });
    }
    if (deprel) {
      deprelItems.push({
        sid, label: deprel, vec, color: colorName(vec), type: node.type,
      });
    }
  }

  if (examples.length < 8 && (chart.stable || []).length > 0) {
    const root = chart.stable[0];
    const bands = paintMolecule(root, field, emitters, contestBySlot, atomPaint, memo);
    const vec = l2normalize(toVec(bands));
    examples.push({
      text: tokens.join(' '),
      rootType: root.type,
      family: familyOf(root),
      color: colorName(vec),
      topBands: BANDS
        .map((b, i) => ({ b, v: Number(vec[i].toFixed(4)) }))
        .filter((r) => r.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 5),
    });
  }

  if ((sid + 1) % 25 === 0 || sid + 1 === eligible.length) {
    const sec = ((Date.now() - started) / 1000).toFixed(1);
    process.stderr.write(`  painted ${sid + 1}/${eligible.length}  composed=${composed}  family=${familyItems.length}  ${sec}s\n`);
  }
}

const random = rng(SEED);
const KIND = new Set(['carbon', 'silicone', 'recursive', 'comboCarbon', 'comboSilicone', 'comboRecursive']);
const GEOM = new Set(['left', 'right', 'near', 'mid', 'far', 'lock', 'contest', 'absorption', 'silence']);
const NOKIND = new Set(BANDS.filter((b) => !KIND.has(b)));
const typeVocab = [...new Set(familyItems.map((it) => it.type))].sort();

process.stderr.write('scoring assays…\n');

const familyFull = evaluate('family/full', familyItems, random);
const familyShuffle = evaluate('family/shuffle', remap(familyItems, (it) => shuffleVec(it.vec, random)), random);
const familyType = evaluate('family/type-only', remap(familyItems, (it) => oneHot(it.type, typeVocab)), random);
const familyKind = evaluate('family/kind-only', remap(familyItems, (it) => l2normalize(sliceVec(it.vec, KIND))), random);
const familyGeom = evaluate('family/geometry-only', remap(familyItems, (it) => l2normalize(sliceVec(it.vec, GEOM))), random);
const familyNoKind = evaluate('family/no-kind', remap(familyItems, (it) => l2normalize(sliceVec(it.vec, NOKIND))), random);

const deprelKeep = [...groupBy(deprelItems, (it) => it.label).entries()]
  .filter(([, arr]) => arr.length >= MIN_CLASS)
  .map(([k]) => k);
const deprelFiltered = deprelItems.filter((it) => deprelKeep.includes(it.label));
const deprelTypeVocab = [...new Set(deprelFiltered.map((x) => x.type))].sort();
const deprelFull = evaluate('deprel/full', deprelFiltered, random);
const deprelShuffle = evaluate('deprel/shuffle', remap(deprelFiltered, (it) => shuffleVec(it.vec, random)), random);
const deprelType = evaluate('deprel/type-only', remap(deprelFiltered, (it) => oneHot(it.type, deprelTypeVocab)), random);

const atomTypes = evaluate('atom-type/full', atomItems, random);
const rivalMean = rivalPairs.length ? mean(rivalPairs.map((r) => r.cosine)) : 0;
const rivalHigh = rivalPairs.filter((r) => r.cosine > 0.95).length;

const familyColors = [...groupBy(familyItems, (it) => it.label).entries()]
  .filter(([, arr]) => arr.length >= MIN_CLASS)
  .map(([label, arr]) => {
    const hues = groupBy(arr, (it) => it.color);
    const top = [...hues.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    return {
      family: label,
      n: arr.length,
      dominantColor: top?.[0] || 'transparent',
      dominantShare: top ? Number((top[1].length / arr.length).toFixed(3)) : 0,
      uniqueColors: hues.size,
    };
  });

const falsifiers = {
  shuffleBeatsOrTiesGap: familyShuffle.gap >= familyFull.gap,
  typeOnlyBeatsOrTiesAccuracy: familyType.losoAccuracy >= familyFull.losoAccuracy,
  rivalPigmentsCollapse: rivalMean > 0.95,
};

const verdict = (!falsifiers.shuffleBeatsOrTiesGap
  && !falsifiers.typeOnlyBeatsOrTiesAccuracy
  && !falsifiers.rivalPigmentsCollapse)
  ? 'SURVIVES — emergent spectra carry construction structure beyond type and chance'
  : 'FAILS — at least one preregistered falsifier fired; do not promote paint into production ranking';

const report = {
  contract: 'PB-SPECTRAL-FINGERPRINT-PAINT-v1',
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
    leafAtoms,
    paintedLeaves,
    bondedSeen,
    bondedKept,
    familyItems: familyItems.length,
    deprelItems: deprelFiltered.length,
    rivalPairs: rivalPairs.length,
    maxBondedPerSentence: MAX_BONDED_PER_SENTENCE,
  },
  bands: [...BANDS],
  examples,
  familyColors,
  assays: {
    familyFull,
    familyShuffle,
    familyType,
    familyKind,
    familyGeom,
    familyNoKind,
    deprelFull,
    deprelShuffle,
    deprelType,
    atomTypes,
  },
  rivals: {
    n: rivalPairs.length,
    meanCosine: Number(rivalMean.toFixed(4)),
    cosineAbove095: rivalHigh,
    shareAbove095: rivalPairs.length ? Number((rivalHigh / rivalPairs.length).toFixed(4)) : 0,
  },
  falsifiers,
  verdict,
};

report.checksum = `spectral-paint-v1:${sha256Hex({
  seed: SEED,
  assays: report.assays,
  rivals: report.rivals,
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
    `gap=${String(row.gap).padStart(6)}`,
    `d=${String(row.cohensD).padStart(6)}`,
    `LOSO ${row.losoCorrect}/${row.losoTotal}=${(row.losoAccuracy * 100).toFixed(1)}%`,
    `chance ${(row.majorityChance * 100).toFixed(1)}%`,
  ].join('  ');
}

console.log('MOLECULE → CONSTRUCTION FAMILY');
for (const row of [familyFull, familyShuffle, familyType, familyKind, familyGeom, familyNoKind]) {
  console.log(`  ${line(row)}`);
}
console.log('\nMOLECULE → GOLD DEPREL (independent label)');
for (const row of [deprelFull, deprelShuffle, deprelType]) {
  console.log(`  ${line(row)}`);
}
console.log('\nLEAF ATOM → TYPE');
console.log(`  ${line(atomTypes)}`);
console.log(`\nSAME-SPAN RIVALS  n=${rivalPairs.length}  meanCos=${rivalMean.toFixed(3)}  >0.95=${rivalHigh}/${rivalPairs.length}`);
console.log('\nFAMILY COLORS (dominant mix of top two hues)');
for (const row of familyColors) {
  console.log(`  ${row.family.padEnd(18)} n=${String(row.n).padStart(5)}  ${String(row.dominantColor).padEnd(22)} share=${row.dominantShare}  unique=${row.uniqueColors}`);
}
console.log('\nEXAMPLES');
for (const ex of examples) {
  console.log(`  "${ex.text}"  ${ex.rootType}/${ex.family || '—'}  ${ex.color}  ${ex.topBands.map((b) => `${b.b}:${b.v}`).join(' ')}`);
}
console.log('\nFALSIFIERS');
console.log(`  shuffle gap ≥ real gap:           ${falsifiers.shuffleBeatsOrTiesGap}   (real ${familyFull.gap} vs shuffle ${familyShuffle.gap})`);
console.log(`  type-only acc ≥ full acc:         ${falsifiers.typeOnlyBeatsOrTiesAccuracy}   (full ${familyFull.losoAccuracy} vs type ${familyType.losoAccuracy})`);
console.log(`  rival pigments cosine > 0.95:     ${falsifiers.rivalPigmentsCollapse}   (mean ${rivalMean.toFixed(3)})`);
console.log(`\nVERDICT: ${verdict}`);
console.log(`evidence: ${EVIDENCE}`);
console.log(`checksum: ${report.checksum}`);
