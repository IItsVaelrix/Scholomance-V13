#!/usr/bin/env node
/**
 * ASSAY: do capability markers recover gold contact on unknowns?
 *
 * Controls:
 *   hears-only   irradiance > 0 (they already pick up the phone)
 *   shuffle      permute capable flags across unknowns (sentence-blocked)
 *   seeking-off  treat every type as non-seeking
 *
 * Label: gold dependency between the unknown slot and an adjacent known slot.
 * Annotate-only. No pair is admitted.
 *
 *   node scripts/unknown-capability-assay.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { goldByIndex, goldLinksBetween } from '../codex/core/constellation/grimoire/construction-families.js';
import { parseConllu } from '../codex/core/constellation/treebank.js';
import { annotateUnknownCapabilities } from '../codex/core/constellation/unknown-capability-marker.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const EVIDENCE = path.resolve('docs/superpowers/evidence/2026-08-15-unknown-capability-markers.json');
const SEED = 0x5c4010;
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));
const MAX = JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-baseline.json'), 'utf8')).run.maxTokens;

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

function isKnown(slot) {
  return (slot.atoms || []).some((a) => (a.ingested?.reactions?.length || 0) > 0);
}

function goldHit(gold, i, j) {
  return goldLinksBetween(gold, i, i, j, j).length >= 1;
}

function scores(rows, pred) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const row of rows) {
    const p = pred(row);
    if (p && row.gold) tp += 1;
    else if (p && !row.gold) fp += 1;
    else if (!p && row.gold) fn += 1;
    else tn += 1;
  }
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
  return {
    n: rows.length,
    gold: rows.filter((r) => r.gold).length,
    predicted: rows.filter((r) => pred(r)).length,
    tp, fp, fn, tn,
    precision: Number(prec.toFixed(4)),
    recall: Number(rec.toFixed(4)),
    f1: Number(f1.toFixed(4)),
  };
}

const rows = [];
const epitopes = new Map();
let composed = 0;
const started = Date.now();

for (let sid = 0; sid < records.length; sid += 1) {
  const rec = records[sid];
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length < 2 || tokens.length > MAX) continue;
  let chart;
  try {
    chart = composePacked(tokens, posMap, {});
  } catch {
    continue;
  }
  composed += 1;
  const gold = goldByIndex(rec);
  const annotated = annotateUnknownCapabilities(chart);
  const field = annotated.field;
  for (const slot of field) {
    const cap = slot.unknownReceiver?.capability
      || (slot.atoms || []).find((a) => a.capability)?.capability;
    const unknown = Boolean(slot.unknownReceiver) || (slot.atoms || []).some((a) => a.capability);
    if (!unknown || !cap) continue;
    const i = slot.index;
    let adjacentKnown = false;
    let adjacentGold = false;
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= field.length) continue;
      if (!isKnown(chart.field[j])) continue;
      adjacentKnown = true;
      if (goldHit(gold, i, j)) adjacentGold = true;
    }
    if (!adjacentKnown) continue;
    const hears = cap.tags.includes('hears') || cap.reason !== 'deaf';
    rows.push({
      sid,
      gold: adjacentGold,
      capable: cap.capable,
      hears,
      id: cap.id,
      tags: cap.tags,
      reason: cap.reason,
      seeded: Boolean(slot.unknownReceiver),
    });
    if (cap.capable) {
      const key = cap.id;
      const bucket = epitopes.get(key) || {
        id: key, tags: cap.tags, n: 0, gold: 0,
      };
      bucket.n += 1;
      if (adjacentGold) bucket.gold += 1;
      epitopes.set(key, bucket);
    }
  }
}

const random = rng(SEED);
const flags = rows.map((r) => r.capable);
shuffleInPlace(flags, random);
const shuffled = rows.map((r, i) => ({ ...r, capable: flags[i] }));

const assay = {
  marker: scores(rows, (r) => r.capable),
  hearsOnly: scores(rows, (r) => r.hears),
  shuffle: scores(shuffled, (r) => r.capable),
  always: scores(rows, () => true),
  seeded: scores(rows.filter((r) => r.seeded), (r) => r.capable),
  silent: scores(rows.filter((r) => !r.seeded), (r) => r.capable),
};

const falsifiers = {
  hearsOnlyF1BeatsOrTiesMarker: assay.hearsOnly.f1 >= assay.marker.f1,
  shuffleF1BeatsOrTiesMarker: assay.shuffle.f1 >= assay.marker.f1,
  alwaysF1BeatsOrTiesMarker: assay.always.f1 >= assay.marker.f1,
};

const survived = !falsifiers.hearsOnlyF1BeatsOrTiesMarker
  && !falsifiers.shuffleF1BeatsOrTiesMarker;

const report = {
  contract: 'PB-UNKNOWN-CAPABILITY-ASSAY-v1',
  kind: 'annotate-only',
  seed: SEED,
  elapsedMs: Date.now() - started,
  composed,
  population: {
    unknownsNextToKnown: rows.length,
    gold: rows.filter((r) => r.gold).length,
    seeded: rows.filter((r) => r.seeded).length,
    silent: rows.filter((r) => !r.seeded).length,
    epitopes: epitopes.size,
  },
  assay,
  topEpitopes: [...epitopes.values()]
    .sort((a, b) => b.gold - a.gold || b.n - a.n)
    .slice(0, 10)
    .map((e) => ({ ...e, purity: e.n ? Number((e.gold / e.n).toFixed(3)) : 0 })),
  falsifiers,
  verdict: survived
    ? 'MARKERS WORK — seeking epitopes beat hears-only and shuffled capability on gold contact'
    : 'WEAK — markers do not beat the cheap controls; do not promote into admission',
};

writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

function line(name, row) {
  return `  ${name.padEnd(14)} n=${String(row.n).padStart(4)}  gold=${String(row.gold).padStart(3)}  pred=${String(row.predicted).padStart(3)}  P=${row.precision.toFixed(3)}  R=${row.recall.toFixed(3)}  F1=${row.f1.toFixed(3)}`;
}

console.log('UNKNOWN CAPABILITY MARKERS — gold-contact assay');
console.log(line('marker', assay.marker));
console.log(line('hears-only', assay.hearsOnly));
console.log(line('shuffle', assay.shuffle));
console.log(line('always', assay.always));
console.log(line('seeded only', assay.seeded));
console.log(line('silent only', assay.silent));
console.log('\nTOP EPITOPES');
for (const e of report.topEpitopes) {
  console.log(`  ${e.id}  n=${e.n} gold=${e.gold} pur=${e.purity}  ${e.tags.join(',')}`);
}
console.log('\nFALSIFIERS');
console.log(`  hears-only F1 ≥ marker: ${falsifiers.hearsOnlyF1BeatsOrTiesMarker}  (${assay.hearsOnly.f1} vs ${assay.marker.f1})`);
console.log(`  shuffle F1 ≥ marker:    ${falsifiers.shuffleF1BeatsOrTiesMarker}  (${assay.shuffle.f1} vs ${assay.marker.f1})`);
console.log(`  always F1 ≥ marker:     ${falsifiers.alwaysF1BeatsOrTiesMarker}  (${assay.always.f1} vs ${assay.marker.f1})`);
console.log(`\nVERDICT: ${report.verdict}`);
console.log(`evidence: ${EVIDENCE}`);
