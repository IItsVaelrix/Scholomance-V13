#!/usr/bin/env node
/**
 * Concept Chemistry ledger — read the accumulated record.
 *
 *   node scripts/concept-chem-ledger.mjs            summary + refutations
 *   node scripts/concept-chem-ledger.mjs --all      every entry in full
 *   node scripts/concept-chem-ledger.mjs --score    re-score against the engine
 *
 * The refutations are the point. Read them before proposing anything that
 * sounds elegant.
 */
import {
  buildLedger,
  LEDGER_ENTRIES,
  RUN_GATE_VERDICTS,
} from '../codex/core/pixelbrain/calibration/concept-chem-ledger.js';
import { scoreAccuracy } from '../codex/core/pixelbrain/label-store.js';
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';

const SHOW_ALL = process.argv.includes('--all');
const SCORE = process.argv.includes('--score');

const store = buildLedger();
const counts = store.counts();

console.log('═══ CONCEPT CHEMISTRY LEDGER ═══\n');
console.log(`  entries    ${counts.total}  (${counts.physical} PHYSICAL, ${counts.simulated} SIMULATED)`);
console.log(`  checksum   ${store.checksum()}`);
console.log('');

for (const outcome of ['REFUTED', 'METASTABLE', 'CONFIRMED']) {
  const rows = store.byOutcome(outcome);
  console.log(`  ${outcome.padEnd(11)} ${rows.length}`);
}
console.log('');

console.log('═══ REFUTED — do not rebuild these ═══\n');
for (const l of store.byOutcome('REFUTED')) {
  console.log(`  ${l.id} [${l.tier}] ${l.checksum}`);
  console.log(`    ${l.reaction.product}`);
  if (SHOW_ALL) {
    console.log(`    evidence: ${l.evidence}`);
    console.log(`    source:   ${l.source}`);
  }
  console.log('');
}

if (SHOW_ALL) {
  for (const outcome of ['METASTABLE', 'CONFIRMED']) {
    console.log(`═══ ${outcome} ═══\n`);
    for (const l of store.byOutcome(outcome)) {
      console.log(`  ${l.id} [${l.tier}] ${l.checksum}`);
      console.log(`    ${l.reaction.product}`);
      console.log(`    evidence: ${l.evidence}`);
      console.log(`    source:   ${l.source}`);
      console.log('');
    }
  }
}

// Disagreements between the engine and physical reality are the only entries
// that can calibrate the instrument. Surface them unconditionally.
console.log('═══ ENGINE vs PHYSICAL DISAGREEMENTS ═══\n');
const disagreements = store
  .byTier('PHYSICAL')
  .filter((l) => /ENGINE WAS WRONG|BELOW the bar/.test(l.evidence));
if (disagreements.length === 0) {
  console.log('  none recorded\n');
} else {
  for (const l of disagreements) {
    console.log(`  ${l.id}  ${l.outcome}`);
    console.log(`    ${l.reaction.product}`);
    console.log(`    ${l.evidence.split('.')[0]}.`);
    console.log('');
  }
}

if (SCORE) {
  console.log('═══ scoreAccuracy() AGAINST THE ENGINE ═══\n');
  const res = scoreAccuracy(store, synthesize);
  console.log(`  ${res.correct}/${res.total} = ${(res.accuracy * 100).toFixed(1)}%`);
  console.log('');
  console.log('  CAUTION: scoreAccuracy maps outcome===CONFIRMED to stability===STABLE.');
  console.log('  STABLE_MIN is 0.55 and the highest score in this entire ledger is 0.5052,');
  console.log('  so every CONFIRMED label is counted as a miss by construction. This number');
  console.log('  measures the absolute-threshold mapping, NOT the engine\'s ordinal skill.');
  console.log('  Fix the mapping before citing it. Gate on controls, never STABLE_MIN.');
  console.log('');
  console.log('  SECOND DEFECT: scoreAccuracy passes no groundingA/groundingB and no index,');
  console.log('  so every reaction is scored ungrounded and collapses to ~0.05 (see feas');
  console.log('  below). Both misses are CONFIRMED labels — the metric cannot succeed on');
  console.log('  exactly the entries that anchor truth.');
  console.log('');
  for (const m of res.mismatches) {
    console.log(`    ${m.id.padEnd(8)} recorded=${String(m.outcome).padEnd(11)} predicted=${String(m.predicted).padEnd(11)} feas=${m.feasibility?.toFixed?.(4) ?? '?'}`);
  }
  console.log('');
}

// What the chemistry ALONE concluded, per run, under the margin law.
console.log('═══ WHAT THE CHEMISTRY ALONE CONCLUDED (per run) ═══\n');
console.log('  The ranking is not the verdict. Four of five runs cannot decide.\n');
for (const v of RUN_GATE_VERDICTS) {
  const sep = v.separation === null ? '   —  ' : `${(v.separation * 100).toFixed(1)}%`.padStart(6);
  const mark = v.kind === 'Hypothesis' ? '✔' : v.kind === 'Theory' ? '∅' : '?';
  console.log(`  ${mark} ${v.kind.padEnd(11)} ${sep}  ${v.run}`);
}
const concluded = RUN_GATE_VERDICTS.filter((v) => v.kind === 'Hypothesis').length;
console.log(`\n  ${concluded}/${RUN_GATE_VERDICTS.length} runs reached a conclusion on the score alone.`);
console.log('  The rest were settled — where they were settled — by architectural probes.');
console.log('  THE CHEMISTRY RANKED. THE PROBE DECIDED.\n');

console.log(`  ${LEDGER_ENTRIES.length} entries · run with --all for evidence, --score for calibration\n`);
