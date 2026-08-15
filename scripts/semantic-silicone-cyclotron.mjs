#!/usr/bin/env node

/**
 * CLI Runner for Semantic Silicone Cyclotron Simulation — PB-SEMANTIC-SILICONE-CYCLOTRON-REPORT-v1
 *
 * Runs the cyclotron experiment:
 * 1. Spins charged atoms inside magnetic & RF fields.
 * 2. Slingshot collisions trigger atom transmutation when rotational energy exceeds threshold.
 * 3. Transmuted atoms configure into silicone molecules via electromagnetism principles.
 *
 * Usage:
 *   node scripts/semantic-silicone-cyclotron.mjs --spin=140 --trials=100 --seed=0x5111c0 --out=/tmp/silicone-report.json
 */

import { writeFileSync } from 'node:fs';
import {
  runSemanticSiliconeCyclotron,
  verifySemanticSiliconeReport,
} from '../codex/core/pixelbrain/semantic-silicone-reactor.js';

function parseIntegerFlag(name, fallback, min, max) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer in ${min}..${max}`);
  }
  return value;
}

function parseFloatFlag(name, fallback, min, max) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a float in ${min}..${max}`);
  }
  return value;
}

function parseStringFlag(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}

function main() {
  const trialCount = parseIntegerFlag('trials', 150, 1, 100_000);
  const spin = parseFloatFlag('spin', 140.0, 0.0, 500.0);
  const bField = parseFloatFlag('b-field', 2.8, 0.1, 20.0);
  const seed = parseIntegerFlag('seed', 0x5111c0, 0, 0xffffffff);
  const outputPath = parseStringFlag('out');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       SEMANTIC SILICONE CYCLOTRON TEST ENGINE                ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Spin velocity:    ${spin.toFixed(1)} rad/s`);
  console.log(`Magnetic field:   ${bField.toFixed(2)} T`);
  console.log(`Collisions/trials: ${trialCount}`);
  console.log(`Seed:             0x${seed.toString(16)}`);
  console.log('Accelerating particles and initiating slingshot collisions...');

  const startTime = Date.now();
  const report = runSemanticSiliconeCyclotron({
    trialCount,
    angularVelocity: spin,
    magneticField: bField,
    seed,
  });
  const duration = Date.now() - startTime;

  if (!verifySemanticSiliconeReport(report)) {
    console.error('FATAL: Report failed integrity checksum verification!');
    process.exit(1);
  }

  console.log('\n─── CYCLOTRON KINEMATICS & RESONANCE ───');
  console.log(`Resonance Frequency:   ${report.cyclotronKinematics.resonanceFrequency} kHz`);
  console.log(`Tangential Velocity:   ${report.cyclotronKinematics.velocity} m/s`);
  console.log(`Rotational Energy:     ${report.cyclotronKinematics.totalRotationalEnergy} J`);
  console.log(`Centrifugal Force:     ${report.cyclotronKinematics.centrifugalForce} N`);
  console.log(`Lorentz Confinement:   ${report.cyclotronKinematics.magneticLorentzForce} N`);
  console.log(`Orbital Stability:     ${report.cyclotronKinematics.orbitalStability}`);

  console.log('\n─── SLINGSHOT TRANSMUTATION SUMMARY ───');
  console.log(`Transmutation Occurred: ${report.transmutationSummary.occurred ? 'YES' : 'NO'}`);
  console.log(`Transmutation Rate:     ${(report.transmutationSummary.transmutationRate * 100).toFixed(1)}%`);
  console.log(`Daughter Atoms Created: ${report.transmutationSummary.totalDaughterAtomsGenerated}`);

  console.log('\n─── ELECTROMAGNETIC MOLECULAR ASSEMBLY ───');
  console.log(`Regime:                 ${report.regime}`);
  console.log(`Verdict:                ${report.verdict}`);
  console.log(`Total Molecules:        ${report.molecularAssembly.totalMoleculesFormed}`);
  console.log(`  - Linear Chains:      ${report.molecularAssembly.linearChains}`);
  console.log(`  - Cyclic Siloxane:    ${report.molecularAssembly.cyclicRings}`);
  console.log(`  - 3D Networks:        ${report.molecularAssembly.networks}`);

  if (report.molecularAssembly.molecules.length > 0) {
    console.log('\nSample Synthesized Molecules:');
    for (const mol of report.molecularAssembly.molecules.slice(0, 3)) {
      console.log(`  [${mol.moleculeId}] ${mol.name}`);
      console.log(`    Topology: ${mol.topology} | Atoms: ${mol.atomCount} | MW: ${mol.molecularWeight} g/mol`);
      console.log(`    Binding Energy: ${mol.totalBindingEnergy} | Stability: ${(mol.stabilityScore * 100).toFixed(1)}%`);
    }
  }

  console.log(`\nChecksum: ${report.checksum} (${duration}ms)`);

  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report written to: ${outputPath}`);
  }
}

main();
