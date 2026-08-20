/**
 * FORENSIC INSTRUMENTATION: DAMPING VS EXCITATION INTERACTION
 *
 * Traces sentences where Excitation-Only diverges from Blind/Damping
 * to diagnose why Full-Loop collapsed back to Damping.
 *
 * Classifies:
 * - EXCITATION_EFFECT_PRESERVED
 * - EXCITATION_OVERRIDDEN_BY_DAMPING
 * - DAMPING_OVERRIDDEN_BY_EXCITATION
 * - SAME_TARGET_SAME_RESULT
 * - POLICY_COLLISION
 *
 * Run with:
 *   node scripts/telemetry-interaction-forensics.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu, goldAnswer } from '../codex/core/constellation/treebank.js';
import { composePacked, ROOT_DOORWAY, projectAnswers } from '../codex/core/constellation/compose-packed.js';
import {
  emitChloroplastLocalMeasurement,
  aggregateTelemetryField,
  cyclotronComputeFieldOrientation,
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

function countDerivations(chart) {
  let count = 0;
  for (const m of chart.molecules || []) {
    count += (m.derivations && m.derivations.length) || 1;
  }
  return count;
}

console.log('══════════════════════════════════════════════════════════════════════════════════════════');
console.log('  FORENSIC AUDIT: EXCITATION vs DAMPING PRECEDENCE & INTERACTION');
console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');

const divergentSentences = [];

for (const { tokens, gold, rec } of eligible) {
  const chartBlind = composePacked(tokens, posMap, { roots: ROOT_DOORWAY.ALL });
  const chartDamp = composeWithClosedLoopCyclotron(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
    cyclotronConfig: { enableDamping: true, enableExcitation: false, enableFocus: false },
  });
  const chartExcite = composeWithClosedLoopCyclotron(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
    cyclotronConfig: { enableDamping: false, enableExcitation: true, enableFocus: false },
  });
  const chartFull = composeWithClosedLoopCyclotron(tokens, posMap, {
    roots: ROOT_DOORWAY.ALL,
    cyclotronConfig: { enableDamping: true, enableExcitation: true, enableFocus: true },
  });

  const derivBlind = countDerivations(chartBlind);
  const derivDamp = countDerivations(chartDamp);
  const derivExcite = countDerivations(chartExcite);
  const derivFull = countDerivations(chartFull);

  if (derivExcite !== derivBlind || derivDamp !== derivBlind || derivFull !== derivBlind) {
    divergentSentences.push({
      text: tokens.join(' '),
      tokens,
      gold,
      derivBlind,
      derivDamp,
      derivExcite,
      derivFull,
      telemetryField: chartFull.telemetryField,
      orientationDamp: chartDamp.fieldOrientation,
      orientationExcite: chartExcite.fieldOrientation,
      orientationFull: chartFull.fieldOrientation,
    });
  }
}

console.log(`Found ${divergentSentences.length} sentences with telemetry-induced derivation changes.\n`);

const classificationCounts = {
  EXCITATION_EFFECT_PRESERVED: 0,
  EXCITATION_OVERRIDDEN_BY_DAMPING: 0,
  DAMPING_OVERRIDDEN_BY_EXCITATION: 0,
  SAME_TARGET_SAME_RESULT: 0,
  POLICY_COLLISION: 0,
};

for (const item of divergentSentences) {
  const { derivBlind, derivDamp, derivExcite, derivFull } = item;
  let classification = 'UNKNOWN';

  if (derivFull === derivExcite && derivExcite !== derivDamp) {
    classification = 'EXCITATION_EFFECT_PRESERVED';
  } else if (derivFull === derivDamp && derivDamp !== derivExcite) {
    classification = 'EXCITATION_OVERRIDDEN_BY_DAMPING';
  } else if (derivFull === derivExcite && derivExcite === derivDamp) {
    classification = 'SAME_TARGET_SAME_RESULT';
  } else if (derivFull < Math.min(derivDamp, derivExcite)) {
    classification = 'COOPERATIVE_SYNERGY';
  } else {
    classification = 'POLICY_COLLISION';
  }

  classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;
  item.classification = classification;
}

console.log('1. INTERACTION CLASSIFICATION TALLY:');
for (const [k, v] of Object.entries(classificationCounts)) {
  console.log(`  • ${k.padEnd(36)}: ${v} sentences`);
}

console.log('\n2. DETAILED FORENSIC SAMPLES (EXCITATION OVERRIDDEN BY DAMPING):');
const overridden = divergentSentences.filter((s) => s.classification === 'EXCITATION_OVERRIDDEN_BY_DAMPING');

for (const s of overridden.slice(0, 5)) {
  console.log(`\nSENTENCE: "${s.text}"`);
  console.log(`  Derivations: Blind=${s.derivBlind}, Damp=${s.derivDamp}, Excite=${s.derivExcite}, Full=${s.derivFull}`);
  console.log(`  Hotspots:   ${JSON.stringify(s.telemetryField.hotspots)}`);
  console.log(`  Dead Zones: ${JSON.stringify(s.telemetryField.deadZones)}`);
  console.log(`  Damping Vector:   [${s.orientationDamp.fieldBias.join(', ')}]`);
  console.log(`  Excitation Vector:[${s.orientationExcite.fieldBias.join(', ')}]`);
  console.log(`  Full-Loop Vector: [${s.orientationFull.fieldBias.join(', ')}]`);
}
