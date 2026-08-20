/**
 * HARMONIZED COOPERATIVE CLOSED-LOOP ASSAY
 *
 * Implements a high-performance Indexed Priority Bucket Queue / Heap
 * and harmonizes Damping + Excitation + Hierarchical Resonance.
 *
 * Run with:
 *   node scripts/harmonized-cooperative-assay.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, ROOT_DOORWAY, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import {
  emitChloroplastLocalMeasurement,
  aggregateTelemetryField,
} from '../codex/core/constellation/chloroplast-cyclotron-wire.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));

const eligible = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= 20) {
    eligible.push({ rec, tokens, gold: goldAnswer(rec) });
  }
}

function countDerivations(chart) {
  let count = 0;
  for (const m of chart.molecules || []) {
    count += (m.derivations && m.derivations.length) || 1;
  }
  return count;
}

// ── FAST PRIORITY BUCKET AGENDA IMPLEMENTATION ──────────────────────────────
class PriorityBucketAgenda {
  constructor() {
    this.buckets = new Map(); // scoreKey -> Array<Node>
    this.scores = [];         // sorted descending unique scores
    this.size = 0;
  }

  push(node, score) {
    const key = Math.round(score * 100);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
      // Insert score maintaining descending order
      let idx = 0;
      while (idx < this.scores.length && this.scores[idx] > key) idx += 1;
      this.scores.splice(idx, 0, key);
    }
    bucket.push(node);
    this.size += 1;
  }

  pop() {
    if (this.size === 0) return null;
    const topKey = this.scores[0];
    const bucket = this.buckets.get(topKey);
    const node = bucket.shift();
    if (bucket.length === 0) {
      this.buckets.delete(topKey);
      this.scores.shift();
    }
    this.size -= 1;
    return node;
  }
}

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  HARMONIZED COOPERATIVE CLOSED-LOOP ASSAY');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

// Test configurations:
// 1. Blind Baseline
// 2. FIFO Hierarchical (Width + Left-to-Right)
// 3. Harmonized Damping + Excitation + Hierarchical Priority

let statsBlind = { parsed: 0, goldContainment: 0, derivations: 0, events: 0, ms: 0 };
let statsHierarchical = { parsed: 0, goldContainment: 0, derivations: 0, events: 0, ms: 0 };
let statsHarmonized = { parsed: 0, goldContainment: 0, derivations: 0, events: 0, ms: 0 };

// 1. BLIND
const t0 = performance.now();
for (const { tokens, gold } of eligible) {
  const chart = composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL });
  if (chart.stable.length > 0) {
    statsBlind.parsed += 1;
    const ans = chart.stable.flatMap((s) => projectAnswers(s));
    if (ans.some((a) => a.verb === gold.verb)) statsBlind.goldContainment += 1;
  }
  statsBlind.derivations += countDerivations(chart);
  statsBlind.events += chart.events;
}
statsBlind.ms = performance.now() - t0;

// 2. FIFO HIERARCHICAL (Excitation/Early Convergence baseline)
const t1 = performance.now();
for (const { tokens, gold } of eligible) {
  const chart = composePacked(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
    agenda: 'telemetry',
    fieldOrientation: {
      fieldBias: new Array(tokens.length).fill(1.0),
      magneticDamping: new Array(tokens.length).fill(0.0),
      resonanceFocus: new Array(tokens.length).fill(1.0),
    },
  });
  if (chart.stable.length > 0) {
    statsHierarchical.parsed += 1;
    const ans = chart.stable.flatMap((s) => projectAnswers(s));
    if (ans.some((a) => a.verb === gold.verb)) statsHierarchical.goldContainment += 1;
  }
  statsHierarchical.derivations += countDerivations(chart);
  statsHierarchical.events += chart.events;
}
statsHierarchical.ms = performance.now() - t1;

// 3. HARMONIZED COOPERATIVE
// Combines Hierarchical Left-to-Right + Smooth Hotspot Damping without suppressing span promotion
const t2 = performance.now();
for (const { tokens, gold } of eligible) {
  const baseChart = composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL });
  const localMeasurements = [];
  for (const s of baseChart.field || []) {
    for (const a of s.atoms || []) localMeasurements.push(emitChloroplastLocalMeasurement(a));
  }
  const telemetryField = aggregateTelemetryField(localMeasurements);

  const n = tokens.length;
  const fieldBias = new Array(n).fill(1.0);
  const magneticDamping = new Array(n).fill(0.0);
  const resonanceFocus = new Array(n).fill(1.0);

  // Smooth proportional damping (doesn't zero out early spans)
  for (const h of telemetryField.hotspots) {
    const idx = h.span[0];
    if (idx >= 0 && idx < n) {
      magneticDamping[idx] = Math.min(0.20, (magneticDamping[idx] || 0) + 0.10);
      fieldBias[idx] = Math.max(0.85, fieldBias[idx] * 0.90);
    }
  }

  // Dead zone excitation
  for (const d of telemetryField.deadZones) {
    const idx = d.span[0];
    if (idx >= 0 && idx < n) {
      fieldBias[idx] = Math.min(1.20, fieldBias[idx] * 1.15);
      resonanceFocus[idx] = Math.min(1.20, resonanceFocus[idx] * 1.15);
    }
  }

  const chart = composePacked(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
    agenda: 'telemetry',
    fieldOrientation: { fieldBias, magneticDamping, resonanceFocus },
  });

  if (chart.stable.length > 0) {
    statsHarmonized.parsed += 1;
    const ans = chart.stable.flatMap((s) => projectAnswers(s));
    if (ans.some((a) => a.verb === gold.verb)) statsHarmonized.goldContainment += 1;
  }
  statsHarmonized.derivations += countDerivations(chart);
  statsHarmonized.events += chart.events;
}
statsHarmonized.ms = performance.now() - t2;

console.log('RESULTS COMPARISON:');
console.log('┌──────────────────────────────────┬──────────┬──────────┬─────────────┬────────────┬─────────────┐');
console.log('│ Mode                             │ Parsed   │ Contain. │ Derivations │ Deriv Δ    │ Events (Pop)│');
console.log('├──────────────────────────────────┼──────────┼──────────┼─────────────┼────────────┼─────────────┤');
console.log(`│ 1. Blind Baseline (LIFO)         │ ${String(statsBlind.parsed).padEnd(8)} │ ${String(statsBlind.goldContainment).padEnd(8)} │ ${String(statsBlind.derivations).padEnd(11)} │ Baseline   │ ${String(statsBlind.events).padEnd(11)} │`);
console.log(`│ 2. Hierarchical (Width/FIFO)     │ ${String(statsHierarchical.parsed).padEnd(8)} │ ${String(statsHierarchical.goldContainment).padEnd(8)} │ ${String(statsHierarchical.derivations).padEnd(11)} │ ${String(statsHierarchical.derivations - statsBlind.derivations).padEnd(10)} │ ${String(statsHierarchical.events).padEnd(11)} │`);
console.log(`│ 3. Harmonized Closed-Loop        │ ${String(statsHarmonized.parsed).padEnd(8)} │ ${String(statsHarmonized.goldContainment).padEnd(8)} │ ${String(statsHarmonized.derivations).padEnd(11)} │ ${String(statsHarmonized.derivations - statsBlind.derivations).padEnd(10)} │ ${String(statsHarmonized.events).padEnd(11)} │`);
console.log('└──────────────────────────────────┴──────────────────┴──────────┴─────────────┴────────────┴─────────────┘\n');
