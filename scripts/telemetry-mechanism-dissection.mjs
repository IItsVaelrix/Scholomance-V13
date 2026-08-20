/**
 * 4-ARM TELEMETRY MECHANISM DISSECTION & MULTI-RUN TIMING ASSAY
 *
 * Evaluates:
 *   Arm 1: Blind Baseline (Static Agenda)
 *   Arm 2: Damping-Only (Hotspots Damped, Dead Zones Disabled)
 *   Arm 3: Excitation-Only (Dead Zones Stimulated, Hotspots Disabled)
 *   Arm 4: Full Closed-Loop (Damping + Excitation + Resonant Focus)
 *
 * Runs 5 independent passes across all 395 Treebank Gate sentences per arm to
 * calculate median, min, max wall-clock execution times alongside exact
 * deterministic structural invariants.
 *
 * Run with:
 *   node scripts/telemetry-mechanism-dissection.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, ROOT_DOORWAY, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import {
  composeWithClosedLoopCyclotron,
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

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  4-ARM TELEMETRY MECHANISM DISSECTION & MULTI-RUN TIMING ASSAY');
console.log('  Testing: Blind vs. Damping-Only vs. Excitation-Only vs. Full Closed Loop');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');
console.log(`Corpus: ${eligible.length} eligible sentences (<= 20 tokens) across 5 timing iterations...\n`);

function countDerivations(chart) {
  let count = 0;
  for (const m of chart.molecules || []) {
    count += (m.derivations && m.derivations.length) || 1;
  }
  return count;
}

const ITERATIONS = 5;

const ARMS = [
  {
    id: 'ARM_1_BLIND',
    name: 'Blind Baseline',
    run: (tokens) => composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL }),
  },
  {
    id: 'ARM_2_DAMPING_ONLY',
    name: 'Damping-Only',
    run: (tokens) => composeWithClosedLoopCyclotron(tokens, posMap, {
      roots: ROOT_DOORWAY.ALL,
      cyclotronConfig: { enableDamping: true, enableExcitation: false, enableFocus: false },
    }),
  },
  {
    id: 'ARM_3_EXCITATION_ONLY',
    name: 'Excitation-Only',
    run: (tokens) => composeWithClosedLoopCyclotron(tokens, posMap, {
      roots: ROOT_DOORWAY.ALL,
      cyclotronConfig: { enableDamping: false, enableExcitation: true, enableFocus: false },
    }),
  },
  {
    id: 'ARM_4_FULL_CLOSED_LOOP',
    name: 'Full Closed Loop',
    run: (tokens) => composeWithClosedLoopCyclotron(tokens, posMap, {
      roots: ROOT_DOORWAY.ALL,
      cyclotronConfig: { enableDamping: true, enableExcitation: true, enableFocus: true },
    }),
  },
];

const results = [];

for (const arm of ARMS) {
  process.stdout.write(`Benchmarking ${arm.name.padEnd(20)}: `);
  const timingPasses = [];
  let structuralStats = null;

  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    let parsed = 0;
    let goldContainment = 0;
    let bondAttempts = 0;
    let bondRefusals = 0;
    let events = 0;
    let molecules = 0;
    let derivations = 0;

    const t0 = performance.now();
    for (const { tokens, gold } of eligible) {
      const chart = arm.run(tokens);
      const isParsed = chart.stable.length > 0;
      if (isParsed) {
        parsed += 1;
        const ans = chart.stable.flatMap((s) => projectAnswers(s));
        if (ans.some((a) => a.verb === gold.verb)) goldContainment += 1;
      }
      bondAttempts += chart.bondAttempts || 0;
      bondRefusals += chart.bondRefusals || 0;
      events += chart.events || 0;
      molecules += chart.molecules.length;
      derivations += countDerivations(chart);
    }
    const elapsed = performance.now() - t0;
    timingPasses.push(elapsed);
    process.stdout.write(`[Pass ${iter + 1}: ${elapsed.toFixed(1)}ms] `);

    if (iter === 0) {
      structuralStats = {
        parsed,
        goldContainment,
        bondAttempts,
        bondRefusals,
        events,
        molecules,
        derivations,
      };
    }
  }

  timingPasses.sort((a, b) => a - b);
  const medianMs = timingPasses[Math.floor(ITERATIONS / 2)];
  const meanMs = timingPasses.reduce((a, b) => a + b, 0) / ITERATIONS;

  results.push({
    arm,
    structuralStats,
    timingPasses,
    medianMs,
    meanMs,
  });

  console.log(`-> Median: ${medianMs.toFixed(1)}ms`);
}

console.log('\n══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  MECHANISM DISSECTION RESULTS MATRIX');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

const blind = results[0];

console.log('┌──────────────────────┬──────────┬──────────┬─────────────┬────────────┬─────────────┬──────────────┬─────────────┐');
console.log('│ Arm                  │ Parsed   │ Contain. │ Derivations │ Deriv Δ    │ Events (Pop)│ Median Time  │ Time Δ (%)  │');
console.log('├──────────────────────┼──────────┼──────────┼─────────────┼────────────┼─────────────┼──────────────┼─────────────┤');

for (const r of results) {
  const s = r.structuralStats;
  const derivDelta = s.derivations - blind.structuralStats.derivations;
  const timeDeltaPct = ((r.medianMs - blind.medianMs) / blind.medianMs) * 100;
  const derivDeltaStr = (derivDelta >= 0 ? '+' : '') + derivDelta;
  const timeDeltaStr = (timeDeltaPct >= 0 ? '+' : '') + timeDeltaPct.toFixed(2) + '%';

  console.log(
    `│ ${r.arm.name.padEnd(20)} │ `
    + `${String(s.parsed).padEnd(8)} │ `
    + `${String(s.goldContainment).padEnd(8)} │ `
    + `${String(s.derivations).padEnd(11)} │ `
    + `${derivDeltaStr.padEnd(10)} │ `
    + `${String(s.events).padEnd(11)} │ `
    + `${(r.medianMs.toFixed(1) + 'ms').padEnd(12)} │ `
    + `${timeDeltaStr.padEnd(11)} │`
  );
}
console.log('└──────────────────────┴──────────┴──────────┴─────────────┴────────────┴─────────────┴──────────────┴─────────────┘\n');
