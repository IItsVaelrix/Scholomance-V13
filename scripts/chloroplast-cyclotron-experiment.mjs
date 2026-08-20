/**
 * EXPERIMENT: INTER-CHLOROPLAST COMMUNICATION & DIRECT CYCLOTRON TELEMETRY STREAM
 *
 * Runs across parsed and unparsed sentences in the Treebank Gate, extracts the
 * leaf atoms, computes the inter-chloroplast photonic communication mesh, and
 * streams the live telemetry packet into the Cyclotron particle reactor.
 *
 * Run with:
 *   node scripts/chloroplast-cyclotron-experiment.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseConllu } from '../codex/core/constellation/treebank.js';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { emitDescendingLight } from '../codex/core/constellation/resonance-beacon.js';
import { stampCharges } from '../codex/core/constellation/electromagnetism.js';
import {
  buildInterChloroplastMesh,
  streamChloroplastToCyclotron,
} from '../codex/core/constellation/chloroplast-cyclotron-wire.js';

const FIX = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIX, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(readFileSync(path.join(FIX, 'treebank-gate-lexicon.json'), 'utf8'))));

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  CHLOROPLAST-TO-CYCLOTRON TELEMETRY WIRE — LIVE STREAMING EXPERIMENT');
console.log('══════════════════════════════════════════════════════════════════════\n');

const testSentences = [
  'who fought the wars ?',
  'No service .. But good food ..',
  'Jeffrey Synder , Ryan Hinze , Sheetal Patel , Johnathan Anderson',
  'A lawsuit .',
  'Have fun .',
];

for (const text of testSentences) {
  const tokens = text.split(' ');
  const chart = composePacked(tokens, posMap, {});

  // Extract all leaf atoms and illuminate them via descending light & chloroplast panels
  const field = chart.field || [];
  stampCharges(field);

  const leafAtoms = [];
  for (const slot of field) {
    for (const atom of slot.atoms || []) {
      leafAtoms.push(atom);
    }
  }

  // 1. Establish inter-chloroplast communication mesh
  const mesh = buildInterChloroplastMesh(leafAtoms);

  // 2. Stream telemetry directly to the Cyclotron
  const receipt = streamChloroplastToCyclotron(mesh);

  console.log(`SENTENCE: "${text}" (${tokens.length} tokens, ${leafAtoms.length} leaf atoms)`);
  console.log(`  • Chloroplast Telemetry:`);
  console.log(`      Active Cells:         ${mesh.totalCells}`);
  console.log(`      Total Irradiance:     ${mesh.totalIrradiance}`);
  console.log(`      Total Absorbed Volt:  ${mesh.totalVoltage} V`);
  console.log(`      Inter-Mesh Links:     ${mesh.meshLinks.length}`);
  console.log(`      Inter-Chloroplast Φ:  ${mesh.interChloroplastFlux}`);
  console.log(`      Phase Coherence:      ${mesh.phaseCoherence}`);
  console.log(`  • Cyclotron Reactor Kinematics (Direct Stream):`);
  console.log(`      Resonance Frequency:  ${receipt.cyclotronKinematics.resonanceFrequency} MHz`);
  console.log(`      RF Voltage Drive:     ${receipt.cyclotronKinematics.rfGain} keV`);
  console.log(`      Total Rotational E:   ${receipt.cyclotronKinematics.totalRotationalEnergy} J`);
  console.log(`      Orbital Stability:    ${receipt.cyclotronKinematics.orbitalStability}`);
  console.log(`      Coupling Efficiency:  ${receipt.couplingEfficiency}`);
  console.log(`  • Telemetry Receipt Seal: ${receipt.checksum.slice(0, 48)}...\n`);
}
