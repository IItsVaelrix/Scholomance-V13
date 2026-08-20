/**
 * DIRECT BRUTAL ABLATION: TELEMETRY OFF vs TELEMETRY ON
 *
 * Same Doorway (`ROOT_DOORWAY.ALL`), Same Grammar, Same Corpus (Treebank Gate).
 *
 * MEASURES:
 * 1. Total Attempted Bonds
 * 2. Rejected Collisions / Refusals
 * 3. Total Agenda Events / Work Steps
 * 4. Chart Size (Molecules Built)
 * 5. Total Derivations
 * 6. Ambiguity Density (Derivations per Molecule)
 * 7. Root Recovery (Sentences Parsed)
 * 8. Head Accuracy (Gold Head Matches)
 * 9. Execution Latency (Wall Clock Time)
 *
 * Run with:
 *   node scripts/chloroplast-cyclotron-ablation.mjs
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

console.log('══════════════════════════════════════════════════════════════════════════════════════');
console.log('  BRUTAL DIRECT ABLATION: TELEMETRY OFF vs TELEMETRY ON');
console.log('  Testing Closed-Loop Chloroplast Telemetry & Cyclotron Field Guidance');
console.log('══════════════════════════════════════════════════════════════════════════════════════\n');

const eligible = [];
for (const rec of records) {
  const tokens = rec.tokens.map((t) => t.form);
  if (tokens.length > 0 && tokens.length <= 20) {
    eligible.push({ rec, tokens, gold: goldAnswer(rec) });
  }
}

console.log(`Auditing ${eligible.length} eligible sentences (<= 20 tokens)...\n`);

function countDerivations(chart) {
  let count = 0;
  for (const m of chart.molecules || []) {
    count += (m.derivations && m.derivations.length) || 1;
  }
  return count;
}

// ── 1. RUN CONDITION A: TELEMETRY OFF (Blind Static Agenda) ──────────────────
let statsA = {
  parsed: 0,
  goldContainment: 0,
  bondAttempts: 0,
  bondRefusals: 0,
  events: 0,
  molecules: 0,
  derivations: 0,
  durationMs: 0,
};

const startA = performance.now();
for (const { tokens, gold } of eligible) {
  const chart = composePacked(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
  });

  const parsed = chart.stable.length > 0;
  if (parsed) {
    statsA.parsed += 1;
    const ans = chart.stable.flatMap((s) => projectAnswers(s));
    if (ans.some((a) => a.verb === gold.verb)) statsA.goldContainment += 1;
  }
  statsA.bondAttempts += chart.bondAttempts || 0;
  statsA.bondRefusals += chart.bondRefusals || 0;
  statsA.events += chart.events || 0;
  statsA.molecules += chart.molecules.length;
  statsA.derivations += countDerivations(chart);
}
statsA.durationMs = performance.now() - startA;

// ── 2. RUN CONDITION B: TELEMETRY ON (Closed-Loop Field Orientation) ─────────
let statsB = {
  parsed: 0,
  goldContainment: 0,
  bondAttempts: 0,
  bondRefusals: 0,
  events: 0,
  molecules: 0,
  derivations: 0,
  durationMs: 0,
  hotspotsDamped: 0,
  deadZonesExcited: 0,
};

const startB = performance.now();
for (const { tokens, gold } of eligible) {
  const chart = composeWithClosedLoopCyclotron(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
  });

  const parsed = chart.stable.length > 0;
  if (parsed) {
    statsB.parsed += 1;
    const ans = chart.stable.flatMap((s) => projectAnswers(s));
    if (ans.some((a) => a.verb === gold.verb)) statsB.goldContainment += 1;
  }
  statsB.bondAttempts += chart.bondAttempts || 0;
  statsB.bondRefusals += chart.bondRefusals || 0;
  statsB.events += chart.events || 0;
  statsB.molecules += chart.molecules.length;
  statsB.derivations += countDerivations(chart);

  statsB.hotspotsDamped += (chart.telemetryField?.hotspots || []).length;
  statsB.deadZonesExcited += (chart.telemetryField?.deadZones || []).length;
}
statsB.durationMs = performance.now() - startB;

// ── 3. RESULTS & COMPARATIVE TELEMETRY ───────────────────────────────────────

function formatDelta(valB, valA, isPercentage = false, higherIsBetter = true) {
  const diff = valB - valA;
  const sign = diff >= 0 ? '+' : '';
  const suffix = isPercentage ? '%' : '';
  const formatted = `${sign}${diff.toFixed(2)}${suffix}`;
  return formatted.padEnd(12);
}

console.log('┌──────────────────────────────────┬──────────────────┬──────────────────┬──────────────┐');
console.log('│ Metric                           │ Telemetry OFF    │ Telemetry ON     │ Delta        │');
console.log('│                                  │ (Blind Baseline) │ (Closed-Loop)    │              │');
console.log('├──────────────────────────────────┼──────────────────┼──────────────────┼──────────────┤');
console.log(`│ Sentences Parsed (Root Recovery) │ ${String(statsA.parsed).padEnd(16)} │ ${String(statsB.parsed).padEnd(16)} │ ${formatDelta(statsB.parsed, statsA.parsed)} │`);
console.log(`│ Coverage Rate                    │ ${((statsA.parsed / eligible.length) * 100).toFixed(2)}%          │ ${((statsB.parsed / eligible.length) * 100).toFixed(2)}%          │ ${formatDelta((statsB.parsed / eligible.length) * 100, (statsA.parsed / eligible.length) * 100, true)} │`);
console.log(`│ Gold Containment                 │ ${String(statsA.goldContainment).padEnd(16)} │ ${String(statsB.goldContainment).padEnd(16)} │ ${formatDelta(statsB.goldContainment, statsA.goldContainment)} │`);
console.log(`│ Parsed Containment Rate          │ ${((statsA.goldContainment / statsA.parsed) * 100).toFixed(2)}%          │ ${((statsB.goldContainment / statsB.parsed) * 100).toFixed(2)}%          │ ${formatDelta((statsB.goldContainment / statsB.parsed) * 100, (statsA.goldContainment / statsA.parsed) * 100, true)} │`);
console.log('├──────────────────────────────────┼──────────────────┼──────────────────┼──────────────┤');
console.log(`│ Total Attempted Bonds            │ ${String(statsA.bondAttempts).padEnd(16)} │ ${String(statsB.bondAttempts).padEnd(16)} │ ${formatDelta(statsB.bondAttempts, statsA.bondAttempts)} │`);
console.log(`│ Rejected Collisions (Refusals)   │ ${String(statsA.bondRefusals).padEnd(16)} │ ${String(statsB.bondRefusals).padEnd(16)} │ ${formatDelta(statsB.bondRefusals, statsA.bondRefusals)} │`);
console.log(`│ Agenda Dequeue Events            │ ${String(statsA.events).padEnd(16)} │ ${String(statsB.events).padEnd(16)} │ ${formatDelta(statsB.events, statsA.events)} │`);
console.log(`│ Chart Size (Molecules Built)     │ ${String(statsA.molecules).padEnd(16)} │ ${String(statsB.molecules).padEnd(16)} │ ${formatDelta(statsB.molecules, statsA.molecules)} │`);
console.log(`│ Total Derivations                │ ${String(statsA.derivations).padEnd(16)} │ ${String(statsB.derivations).padEnd(16)} │ ${formatDelta(statsB.derivations, statsA.derivations)} │`);
console.log(`│ Ambiguity Density (Deriv/Molec)  │ ${(statsA.derivations / statsA.molecules).toFixed(4).padEnd(16)} │ ${(statsB.derivations / statsB.molecules).toFixed(4).padEnd(16)} │ ${formatDelta(statsB.derivations / statsB.molecules, statsA.derivations / statsA.molecules)} │`);
console.log(`│ Total Execution Time             │ ${statsA.durationMs.toFixed(1)}ms`.padEnd(17) + `│ ${statsB.durationMs.toFixed(1)}ms`.padEnd(17) + `│ ${formatDelta(statsB.durationMs, statsA.durationMs)} │`);
console.log('└──────────────────────────────────┴──────────────────┴──────────────────┴──────────────┘\n');

console.log('TELEMETRY FIELD ACTION LOG:');
console.log(`  • Collision Hotspots Damped by Cyclotron:  ${statsB.hotspotsDamped}`);
console.log(`  • Underexcited Dead Zones Stimulated:      ${statsB.deadZonesExcited}`);
