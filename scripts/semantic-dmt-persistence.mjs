#!/usr/bin/env node

/**
 * Semantic DMT Cyclization, Post-Perturbation Persistence & Causal Ablation Assay
 *
 * Evaluates:
 * 1. Pre-Flight Invariant Assays (Rename Test & Graph Destruction).
 * 2. Critical Phase Boundary Sweep across Spin Spectrum (N = 150 trials/spin).
 * 3. Topological Distribution at Critical Resonance (ω = 85 rad/s, N = 150 trials).
 * 4. PPSP Paired Synthesis Assay (Shared daughter pool, N = 200 trials).
 * 5. Decoupled Physical Centrifugal Stability vs End-to-End PPSP Survival Curves.
 * 6. 2x2 Factorial Causal Ablation (Isolating Topology vs Treatment κ).
 *
 * Usage:
 *   node scripts/semantic-dmt-persistence.mjs
 */

import {
  sweepCriticalPhaseBoundary,
  measurePostPerturbationPersistence,
  runTopologicalCausalAblation,
  evaluateSemanticGrounding,
  MOLECULAR_TOPOLOGIES,
} from '../codex/core/pixelbrain/semantic-silicone-reactor.js';

function renderBar(percentage, length = 16) {
  const filled = Math.max(0, Math.min(length, Math.round((percentage / 100) * length)));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function formatDelta(value) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return ' 0';
}

function main() {
  console.log('══════════════════════════════════════════════════════════════════════════════════════');
  console.log('         SEMANTIC SILICONE CYCLOTRON — PHASE BOUNDARY & DMT CYCLIZATION               ');
  console.log('══════════════════════════════════════════════════════════════════════════════════════\n');

  // 1. Rename Test & Graph Destruction Invariant Checks
  console.log('─── 1. PRE-FLIGHT INVARIANT ASSAYS (RENAME & PHYSICAL DESTRUCTION) ───');
  const authenticAtoms = [
    { id: 'si1', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence', 'd-orbital-acceptor'], seeks: ['oxygen-bridge', 'methyl-ligand'] },
    { id: 'o1', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge', 'lone-pair-donor'], seeks: ['silicon-valence'] },
    { id: 'ch3_1', mass: 15.035, valence: 1, charge: -0.5, offers: ['methyl-ligand'], seeks: ['silicon-valence'] },
  ];
  const authenticBonds = [
    { from: 'si1', to: 'o1', strength: 35.0 },
    { from: 'si1', to: 'ch3_1', strength: 25.0 },
  ];

  const ringNameMol = {
    name: 'Cyclic Siloxane Ring D4',
    topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
    molecularWeight: 59.119,
    atoms: authenticAtoms,
    bonds: authenticBonds,
  };

  const chainNameMol = {
    name: 'Linear Poly-Siloxane Chain [n=3]',
    topology: MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN,
    molecularWeight: 59.119,
    atoms: authenticAtoms,
    bonds: authenticBonds,
  };

  const ghostMol = {
    name: 'Cyclic Siloxane Ring D4',
    topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
    molecularWeight: -99.0,
    atoms: [],
    bonds: [],
  };

  const gRing = evaluateSemanticGrounding(ringNameMol);
  const gChain = evaluateSemanticGrounding(chainNameMol);
  const gGhost = evaluateSemanticGrounding(ghostMol);

  console.log(`  [RENAME TEST] Cyclic Label Cosine:  ${gRing.targetCosine.toFixed(4)} | Grounded=${gRing.grounded ? 'YES' : 'NO'}`);
  console.log(`  [RENAME TEST] Chain Label Cosine:   ${gChain.targetCosine.toFixed(4)} | Grounded=${gChain.grounded ? 'YES' : 'NO'} (Score Delta = 0.0000)`);
  console.log(`  [PHYSICAL DESTRUCTION] Ghost Graph: ${gGhost.targetCosine.toFixed(4)} | Grounded=${gGhost.grounded ? 'YES' : 'NO'}`);

  if (gRing.targetCosine !== gChain.targetCosine || gGhost.grounded) {
    console.error('FATAL: Invariant assay failed! Grounding is leaking name strings or accepting empty graphs.');
    process.exit(1);
  }
  console.log('  [PASS] Grounding is strictly feature-based and immune to string manipulation.\n');

  // 2. Critical Phase Boundary Sweep
  const spinValues = [20, 40, 55, 65, 75, 85, 95, 110, 130, 150];
  console.log('─── 2. CRITICAL PHASE BOUNDARY SWEEP (N = 150 trials/spin) ───\n');
  console.log('Spin (rad/s) | Control Rate  | +DMT (κ=0.75) | Phase Transition Curve');
  console.log('-------------+---------------+---------------+--------------------------------');

  const controlCurve = sweepCriticalPhaseBoundary({ spinValues, trialsPerSpin: 150, dmtIntensity: 0.0 });
  const dmtCurve = sweepCriticalPhaseBoundary({ spinValues, trialsPerSpin: 150, dmtIntensity: 0.75 });

  for (let i = 0; i < spinValues.length; i += 1) {
    const c = controlCurve[i];
    const d = dmtCurve[i];
    const spinStr = String(c.spin).padStart(12);
    const cRateStr = `${c.transmutationPercent.toFixed(1)}%`.padStart(13);
    const dRateStr = `${d.transmutationPercent.toFixed(1)}%`.padStart(13);
    const bar = renderBar(c.transmutationPercent, 14);
    console.log(`${spinStr} | ${cRateStr} | ${dRateStr} | [${bar}]`);
  }

  // 3. Topological Distribution at Critical Resonance (N = 150 trials at ω = 85 rad/s)
  console.log('\n─── 3. TOPOLOGICAL DISTRIBUTION AT CRITICAL RESONANCE (ω = 85 rad/s, N = 150 trials) ───\n');
  const criticalControl = controlCurve.find((row) => row.spin === 85);
  const criticalDMT = dmtCurve.find((row) => row.spin === 85);

  const deltaLinear = criticalDMT.linearChains - criticalControl.linearChains;
  const deltaCyclic = criticalDMT.cyclicRings - criticalControl.cyclicRings;
  const deltaNetworks = criticalDMT.networks - criticalControl.networks;
  const deltaTotal = criticalDMT.totalMolecules - criticalControl.totalMolecules;

  console.log('Topology Type             | CONTROL (κ=0.0) | +DMT (κ=0.75) | Δ Change');
  console.log('--------------------------+-----------------+---------------+----------');
  console.log(`Linear Siloxane Chains    | ${String(criticalControl.linearChains).padStart(15)} | ${String(criticalDMT.linearChains).padStart(13)} | ${formatDelta(deltaLinear).padStart(8)}`);
  console.log(`Cyclic Siloxane Rings     | ${String(criticalControl.cyclicRings).padStart(15)} | ${String(criticalDMT.cyclicRings).padStart(13)} | ${formatDelta(deltaCyclic).padStart(8)} (Compact Rings)`);
  console.log(`3D Crosslinked Networks   | ${String(criticalControl.networks).padStart(15)} | ${String(criticalDMT.networks).padStart(13)} | ${formatDelta(deltaNetworks).padStart(8)}`);
  console.log('--------------------------+-----------------+---------------+----------');
  console.log(`Total Formed Molecules    | ${String(criticalControl.totalMolecules).padStart(15)} | ${String(criticalDMT.totalMolecules).padStart(13)} | ${formatDelta(deltaTotal).padStart(8)}`);

  // 4. Paired Synthesis PPSP Assay (N = 200 cyclotron collision trials)
  console.log('\n─── 4. PPSP PAIRED SYNTHESIS ASSAY (Shared Daughter Atom Pool, N = 200 trials) ───\n');
  const ppspReport = measurePostPerturbationPersistence({
    synthesisSpin: 85.0,
    dmtIntensity: 0.75,
    quenchSpin: 80.0,
    trialCount: 200,
  });

  const cArm = ppspReport.controlArm;
  const dArm = ppspReport.dmtArm;

  console.log(`Shared Canonical Transmuted Atoms: ${ppspReport.configuration.canonicalDaughterAtomsCount} daughter atoms`);
  console.log(`\nCONTROL ARM (κ = 0.0, Baseline Physics):`);
  console.log(`  Discovered Molecules:      ${cArm.discoveredMolecules}`);
  console.log(`  Physically Stable (ω=80):  ${cArm.quenchStableCount} (${cArm.physicalStabilityPercent}%)`);
  console.log(`  Passed Macrophage Screen:  ${cArm.macrophagePassedCount} (${((cArm.macrophagePassedCount / cArm.discoveredMolecules) * 100).toFixed(1)}%)`);
  console.log(`  Passed Semantic Grounding: ${cArm.groundedCount} (${((cArm.groundedCount / cArm.discoveredMolecules) * 100).toFixed(1)}%)`);
  console.log(`  Persistent Survivors:      ${cArm.persistentCount} (${cArm.ppspPercent}%)`);

  console.log(`\n+DMT ARM (κ = 0.75, Compact Cyclization):`);
  console.log(`  Discovered Molecules:      ${dArm.discoveredMolecules}`);
  console.log(`  Physically Stable (ω=80):  ${dArm.quenchStableCount} (${dArm.physicalStabilityPercent}%)`);
  console.log(`  Passed Macrophage Screen:  ${dArm.macrophagePassedCount} (${((dArm.macrophagePassedCount / dArm.discoveredMolecules) * 100).toFixed(1)}%)`);
  console.log(`  Passed Semantic Grounding: ${dArm.groundedCount} (${((dArm.groundedCount / dArm.discoveredMolecules) * 100).toFixed(1)}%)`);
  console.log(`  Persistent Survivors:      ${dArm.persistentCount} (${dArm.ppspPercent}%)`);

  // 5. Decoupled Physical vs End-to-End Survival Curves
  console.log('\n─── 5. DECOUPLED CENTRIFUGAL SURVIVAL SWEEP ───\n');
  console.log('Quench Spin | Pure Physical Stability (Control vs DMT) | End-to-End PPSP (Control vs DMT)');
  console.log(' (rad/s)    |   Control (%)   |    +DMT (%)   |   Δ Phys   |  Control (%) |   +DMT (%)   |   Δ PPSP');
  console.log('------------+-----------------+---------------+------------+--------------+--------------+---------');

  for (const row of ppspReport.quenchSurvivalCurve) {
    const qSpin = String(row.quenchSpin).padStart(11);
    const cPhys = `${row.controlPhysicalStabilityPercent.toFixed(1)}%`.padStart(15);
    const dPhys = `${row.dmtPhysicalStabilityPercent.toFixed(1)}%`.padStart(13);
    const deltaPhys = formatDelta(Number((row.dmtPhysicalStabilityPercent - row.controlPhysicalStabilityPercent).toFixed(1))).padStart(10);

    const cPPSP = `${row.controlSurvivalPercent.toFixed(1)}%`.padStart(12);
    const dPPSP = `${row.dmtSurvivalPercent.toFixed(1)}%`.padStart(12);
    const deltaPPSP = formatDelta(Number((row.dmtSurvivalPercent - row.controlSurvivalPercent).toFixed(1))).padStart(8);

    console.log(`${qSpin} | ${cPhys} | ${dPhys} | ${deltaPhys} | ${cPPSP} | ${dPPSP} | ${deltaPPSP}`);
  }

  // 6. 2x2 Factorial Causal Ablation Assay
  console.log('\n─── 6. 2x2 FACTORIAL CAUSAL ABLATION (ISOLATING TOPOLOGY vs κ) ───\n');
  const causalReport = runTopologicalCausalAblation({
    synthesisSpin: 85.0,
    dmtIntensity: 0.75,
    trialCount: 300,
  });

  const cells = causalReport.factorialCells;
  const analysis = causalReport.causalAnalysisAtOperatingSpin80;

  console.log('2x2 FACTORIAL MATRIX (Quench Spin ω = 80 rad/s):');
  console.log('───────────────────────────────────────────────────────────────────────────────────────');
  console.log(`  1. Control-Generated Rings  (N=${String(cells.controlRings.count).padStart(2)}): Physical Stability = ${cells.controlRings.survivalBySpin.find((s) => s.spin === 80).physStabilityPercent.toFixed(1)}% (Mean Atoms: ${cells.controlRings.meanAtomCount})`);
  console.log(`  2. DMT-Generated Rings      (N=${String(cells.dmtRings.count).padStart(2)}): Physical Stability = ${cells.dmtRings.survivalBySpin.find((s) => s.spin === 80).physStabilityPercent.toFixed(1)}% (Mean Atoms: ${cells.dmtRings.meanAtomCount})`);
  console.log(`  3. Control-Generated Chains (N=${String(cells.controlChains.count).padStart(2)}): Physical Stability = ${cells.controlChains.survivalBySpin.find((s) => s.spin === 80).physStabilityPercent.toFixed(1)}% (Mean Atoms: ${cells.controlChains.meanAtomCount})`);
  console.log(`  4. DMT-Generated Chains     (N=${String(cells.dmtChains.count).padStart(2)}): Physical Stability = ${cells.dmtChains.survivalBySpin.find((s) => s.spin === 80).physStabilityPercent.toFixed(1)}% (Mean Atoms: ${cells.dmtChains.meanAtomCount})`);
  console.log('───────────────────────────────────────────────────────────────────────────────────────');

  console.log('\nCAUSAL EFFECT DECOMPOSITION:');
  console.log(`  • Average Ring Stability:      ${analysis.effects.avgRingSurvival.toFixed(1)}%`);
  console.log(`  • Average Chain Stability:     ${analysis.effects.avgChainSurvival.toFixed(1)}%`);
  console.log(`  ► MAIN EFFECT OF TOPOLOGY:     ${formatDelta(analysis.effects.mainEffectTopologyDelta)}% (Rings vs Chains)`);
  console.log(`  • κ Effect within Rings:       ${formatDelta(analysis.effects.kappaEffectWithinRingsDelta)}% (DMT Rings vs Control Rings)`);
  console.log(`  • κ Effect within Chains:      ${formatDelta(analysis.effects.kappaEffectWithinChainsDelta)}% (DMT Chains vs Control Chains)`);
  console.log(`  ► CAUSAL VERDICT:              ${analysis.causalVerdict}`);

  console.log('\n══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`PPSP VERDICT: ${ppspReport.verdict} | ABLATION VERDICT: ${analysis.causalVerdict}`);
  console.log('══════════════════════════════════════════════════════════════════════════════════════');
}

main();
