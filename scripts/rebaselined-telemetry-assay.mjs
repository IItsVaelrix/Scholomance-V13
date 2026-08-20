/**
 * RE-BASELINED TELEMETRY ABLATION ASSAY
 *
 * Search Policy Layer: Hierarchical Bottom-Up (Width-First, Left-to-Right)
 *
 * Compares:
 *   Arm A: Hierarchical Baseline (No Telemetry)
 *   Arm B: Hierarchical + Hotspot Damping
 *   Arm C: Hierarchical + Dead-Zone Excitation
 *   Arm D: Hierarchical + Full Closed-Loop Telemetry
 *
 * Runs across all 395 eligible sentences (<= 20 tokens) in the Treebank Gate.
 *
 * Run with:
 *   node scripts/rebaselined-telemetry-assay.mjs
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
console.log('  RE-BASELINED TELEMETRY ABLATION: HIERARCHICAL BASE + FIELD MODULATION');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');
console.log(`Auditing ${eligible.length} eligible sentences on the new Hierarchical Baseline...\n`);

function countDerivations(chart) {
  let count = 0;
  for (const m of chart.molecules || []) {
    count += (m.derivations && m.derivations.length) || 1;
  }
  return count;
}

const ARMS = [
  {
    id: 'ARM_A_HIERARCHICAL_BASE',
    name: 'Arm A: Hierarchical Base',
    run: (tokens) => composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL }),
  },
  {
    id: 'ARM_B_HIERARCHICAL_DAMPING',
    name: 'Arm B: Hierarchical + Damping',
    run: (tokens) => composeWithClosedLoopCyclotron(tokens, posMap, {
      roots: ROOT_DOORWAY.ALL,
      cyclotronConfig: { enableDamping: true, enableExcitation: false, enableFocus: false },
    }),
  },
  {
    id: 'ARM_C_HIERARCHICAL_EXCITATION',
    name: 'Arm C: Hierarchical + Excitation',
    run: (tokens) => composeWithClosedLoopCyclotron(tokens, posMap, {
      roots: ROOT_DOORWAY.ALL,
      cyclotronConfig: { enableDamping: false, enableExcitation: true, enableFocus: false },
    }),
  },
  {
    id: 'ARM_D_HIERARCHICAL_FULL',
    name: 'Arm D: Hierarchical + Full Telemetry',
    run: (tokens) => composeWithClosedLoopCyclotron(tokens, posMap, {
      roots: ROOT_DOORWAY.ALL,
      cyclotronConfig: { enableDamping: true, enableExcitation: true, enableFocus: true },
    }),
  },
];

const results = [];

for (const arm of ARMS) {
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
  const durationMs = performance.now() - t0;

  results.push({
    arm,
    parsed,
    goldContainment,
    bondAttempts,
    bondRefusals,
    events,
    molecules,
    derivations,
    durationMs,
  });
}

const base = results[0];

console.log('┌──────────────────────────────────────┬──────────┬──────────┬─────────────┬────────────┬─────────────┐');
console.log('│ Arm Configuration                    │ Parsed   │ Contain. │ Derivations │ Deriv Δ    │ Events (Pop)│');
console.log('├──────────────────────────────────────┼──────────┼──────────┼─────────────┼────────────┼─────────────┤');

for (const r of results) {
  const derivDelta = r.derivations - base.derivations;
  const derivDeltaStr = (derivDelta >= 0 ? '+' : '') + derivDelta;
  console.log(
    `│ ${r.arm.name.padEnd(36)} │ `
    + `${String(r.parsed).padEnd(8)} │ `
    + `${String(r.goldContainment).padEnd(8)} │ `
    + `${String(r.derivations).padEnd(11)} │ `
    + `${derivDeltaStr.padEnd(10)} │ `
    + `${String(r.events).padEnd(11)} │`
  );
}
console.log('└──────────────────────────────────────┴──────────┴──────────┴─────────────┴────────────┴─────────────┘\n');
