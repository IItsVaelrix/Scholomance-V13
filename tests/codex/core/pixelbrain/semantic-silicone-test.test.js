/**
 * Semantic Silicone Cyclotron Tests — PB-SEMANTIC-SILICONE-CYCLOTRON-REPORT-v1
 *
 * Tests the physical and semantic mechanics of the Cyclotron:
 * 1. Cyclotron acceleration & resonance kinematics
 * 2. Slingshot collision dynamics & transmutation threshold
 * 3. Electromagnetic Coulomb attraction vs repulsion in molecular assembly
 * 4. Critical phase boundary transition curve
 * 5. DMT compact cyclic ring catalysis & ring surge
 * 6. Graph-theoretic molecular validation & Macrophage screening
 * 7. Feature-based Semantic Concept Grounding (immune to Rename Attack & Null-Payload Attack)
 * 8. Continuous Centrifugal Quench Survival Curve (physically moving, monotonically decreasing)
 * 9. Determinism, schema verification, and checksum integrity
 */

import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_SILICONE_ATOM_CONTRACT,
  SEMANTIC_SILICONE_MOLECULE_CONTRACT,
  SEMANTIC_SILICONE_CYCLOTRON_REPORT_CONTRACT,
  SEMANTIC_SILICONE_PPSP_CONTRACT,
  SEMANTIC_SILICONE_CAUSAL_ABLATION_CONTRACT,
  SEMANTIC_SILICONE_SCHEMA_VERSION,
  MOLECULAR_TOPOLOGIES,
  SILICONE_SPECIES,
  DEFAULT_SILICONE_PRECURSORS,
  calculateCyclotronKinematics,
  calculateSlingshotCollision,
  transmuteAtomsOnCollision,
  calculateElectromagneticBond,
  assembleSiliconeMolecules,
  validateMolecularGraph,
  runSemanticSiliconeCyclotron,
  sweepCriticalPhaseBoundary,
  evaluateMacrophageScreen,
  evaluateSemanticGrounding,
  evaluateQuenchSurvival,
  measurePostPerturbationPersistence,
  runTopologicalCausalAblation,
  isolateRingClosureEffect,
  openRingCounterfactual,
  exactTwoSidedSignP,
  calculateCentrifugalBreakage,
  validateMolecularGraph,
  verifySemanticSiliconeReport,
  mulberry32,
} from '../../../../codex/core/pixelbrain/semantic-silicone-reactor.js';

describe('Semantic Silicone Cyclotron (PB-SEMANTIC-SILICONE-CYCLOTRON-REPORT-v1)', () => {
  describe('Contracts & Schema Constants', () => {
    it('declares valid contract identifiers and topologies', () => {
      expect(SEMANTIC_SILICONE_ATOM_CONTRACT).toBe('PB-SEMANTIC-SILICONE-ATOM-v1');
      expect(SEMANTIC_SILICONE_MOLECULE_CONTRACT).toBe('PB-SEMANTIC-SILICONE-MOLECULE-v1');
      expect(SEMANTIC_SILICONE_CYCLOTRON_REPORT_CONTRACT).toBe('PB-SEMANTIC-SILICONE-CYCLOTRON-REPORT-v1');
      expect(SEMANTIC_SILICONE_PPSP_CONTRACT).toBe('PB-SEMANTIC-SILICONE-PPSP-v1');
      expect(SEMANTIC_SILICONE_SCHEMA_VERSION).toBe('1.0.0');
      expect(MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN).toBe('LINEAR_SILOXANE_CHAIN');
      expect(MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING).toBe('CYCLIC_SILOXANE_RING');
      expect(MOLECULAR_TOPOLOGIES.CROSSLINKED_ELASTOMER_NETWORK).toBe('CROSSLINKED_ELASTOMER_NETWORK');
    });

    it('exposes defined silicone species blueprints with balanced valences and charges', () => {
      expect(SILICONE_SPECIES.SILICON_CORE.element).toBe('Si');
      expect(SILICONE_SPECIES.SILICON_CORE.valence).toBe(4);
      expect(SILICONE_SPECIES.SILICON_CORE.charge).toBeGreaterThan(0);

      expect(SILICONE_SPECIES.OXYGEN_BRIDGE.element).toBe('O');
      expect(SILICONE_SPECIES.OXYGEN_BRIDGE.valence).toBe(2);
      expect(SILICONE_SPECIES.OXYGEN_BRIDGE.charge).toBeLessThan(0);

      expect(SILICONE_SPECIES.METHYL_LIGAND.element).toBe('CH3');
      expect(SILICONE_SPECIES.METHYL_LIGAND.valence).toBe(1);
    });
  });

  describe('Cyclotron Kinematics & Resonant Acceleration', () => {
    it('computes relativistic and rotational energy proportional to angular velocity squared', () => {
      const slow = calculateCyclotronKinematics({
        mass: 28.085,
        charge: 1.0,
        angularVelocity: 50.0,
        radius: 0.85,
      });

      const fast = calculateCyclotronKinematics({
        mass: 28.085,
        charge: 1.0,
        angularVelocity: 150.0,
        radius: 0.85,
      });

      expect(fast.velocity).toBeGreaterThan(slow.velocity);
      expect(fast.totalRotationalEnergy).toBeGreaterThan(slow.totalRotationalEnergy);
      expect(fast.orbitalEnergy).toBeCloseTo(slow.orbitalEnergy * ((150 / 50) ** 2), 0);
    });

    it('calculates cyclotron resonance frequency from magnetic field and charge-to-mass ratio', () => {
      const kin = calculateCyclotronKinematics({
        mass: 28.085,
        charge: 2.0,
        magneticField: 3.0,
      });

      expect(kin.resonanceFrequency).toBeCloseTo(213.637, 1);
    });

    it('computes Lorentz magnetic confinement force countering centrifugal force', () => {
      const kin = calculateCyclotronKinematics({
        mass: 28.085,
        charge: 1.0,
        magneticField: 2.5,
        angularVelocity: 100.0,
        radius: 0.85,
      });

      expect(kin.magneticLorentzForce).toBeGreaterThan(0);
      expect(kin.centrifugalForce).toBeGreaterThan(0);
      expect(kin.orbitalStability).toBeGreaterThan(0);
    });
  });

  describe('Slingshot Trajectory & Collision Transmutation', () => {
    const atomA = DEFAULT_SILICONE_PRECURSORS[0];
    const atomB = DEFAULT_SILICONE_PRECURSORS[2];

    it('sub-critical angular velocity fails to overcome the transmutation barrier', () => {
      const subCritical = calculateSlingshotCollision({
        atomA,
        atomB,
        angularVelocity: 20.0,
        radius: 0.85,
      });

      expect(subCritical.overcomesBarrier).toBe(false);

      const rng = mulberry32(12345);
      const transResult = transmuteAtomsOnCollision({
        atomA,
        atomB,
        collisionEnergy: subCritical.netImpactEnergy,
        rng,
      });

      expect(transResult.transmuted).toBe(false);
      expect(transResult.reason).toBe('SUB_CRITICAL_COLLISION_ENERGY');
      expect(transResult.daughterAtoms).toHaveLength(0);
    });

    it('high angular velocity with slingshot assist exceeds threshold and transmutates atoms', () => {
      const highSpin = calculateSlingshotCollision({
        atomA,
        atomB,
        angularVelocity: 140.0,
        radius: 0.85,
        slingshotFactor: 1.8,
      });

      expect(highSpin.overcomesBarrier).toBe(true);
      expect(highSpin.netImpactEnergy).toBeGreaterThan(45.0);

      const rng = mulberry32(42);
      const transResult = transmuteAtomsOnCollision({
        atomA,
        atomB,
        collisionEnergy: highSpin.netImpactEnergy,
        rng,
      });

      expect(transResult.transmuted).toBe(true);
      expect(transResult.daughterAtoms.length).toBeGreaterThanOrEqual(2);

      const species = transResult.daughterAtoms.map((d) => d.speciesId);
      expect(species).toContain('si-core');
      expect(species).toContain('o-bridge');
    });

    it('Coulomb barrier reduces collision energy for like charges and aids opposite charges', () => {
      const base = DEFAULT_SILICONE_PRECURSORS[0];
      const likeA = { ...base, id: 'donor-pos-1', charge: 1.0 };
      const likeB = { ...base, id: 'donor-pos-2', charge: 1.0 };

      const oppA = { ...base, id: 'donor-pos-3', charge: 1.0 };
      const oppB = { ...base, id: 'donor-neg-1', charge: -1.0 };

      const colLike = calculateSlingshotCollision({ atomA: likeA, atomB: likeB, angularVelocity: 100.0 });
      const colOpp = calculateSlingshotCollision({ atomA: oppA, atomB: oppB, angularVelocity: 100.0 });

      expect(colLike.coulombBarrier).toBeGreaterThan(0);
      expect(colOpp.coulombBarrier).toBeLessThan(0);
      expect(colOpp.netImpactEnergy).toBeGreaterThan(colLike.netImpactEnergy);
    });
  });

  describe('Electromagnetism Principles in Molecular Self-Assembly', () => {
    it('opposite charges (Si+2 and O-2) exhibit attractive Coulomb potential and strong bonding', () => {
      const siCore = {
        id: 'si-1',
        speciesId: 'si-core',
        mass: 28.085,
        charge: 2.0,
        offers: ['silicon-valence'],
        seeks: ['oxygen-bridge'],
      };

      const oBridge = {
        id: 'o-1',
        speciesId: 'o-bridge',
        mass: 15.999,
        charge: -2.0,
        offers: ['oxygen-bridge'],
        seeks: ['silicon-valence'],
      };

      const bond = calculateElectromagneticBond({
        atomA: siCore,
        atomB: oBridge,
        distance: 1.64,
        angularVelocity: 120.0,
      });

      expect(bond.isAttractive).toBe(true);
      expect(bond.electrostaticPotential).toBeLessThan(0);
      expect(bond.valenceMatches).toBe(2);
      expect(bond.netBindingEnergy).toBeGreaterThan(20.0);
      expect(bond.isBondStable).toBe(true);
    });

    it('like charges (Si+2 and Si+2) repel each other and resist direct bond formation', () => {
      const si1 = {
        id: 'si-1',
        speciesId: 'si-core',
        mass: 28.085,
        charge: 2.0,
        offers: ['silicon-valence'],
        seeks: ['oxygen-bridge'],
      };

      const si2 = {
        id: 'si-2',
        speciesId: 'si-core',
        mass: 28.085,
        charge: 2.0,
        offers: ['silicon-valence'],
        seeks: ['oxygen-bridge'],
      };

      const bond = calculateElectromagneticBond({
        atomA: si1,
        atomB: si2,
        distance: 1.64,
        angularVelocity: 120.0,
      });

      expect(bond.electrostaticPotential).toBeGreaterThan(0);
      expect(bond.valenceMatches).toBe(0);
      expect(bond.isBondStable).toBe(false);
    });

    it('assembles linear and cyclic silicone molecules from transmuted daughter atoms', () => {
      const rng = mulberry32(999);
      const daughterPool = [
        { id: 'si-core-1', speciesId: 'si-core', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence'], seeks: ['oxygen-bridge', 'methyl-ligand'] },
        { id: 'o-bridge-1', speciesId: 'o-bridge', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge'], seeks: ['silicon-valence'] },
        { id: 'si-core-2', speciesId: 'si-core', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence'], seeks: ['oxygen-bridge', 'methyl-ligand'] },
        { id: 'o-bridge-2', speciesId: 'o-bridge', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge'], seeks: ['silicon-valence'] },
        { id: 'si-core-3', speciesId: 'si-core', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence'], seeks: ['oxygen-bridge', 'methyl-ligand'] },
        { id: 'ch3-1', speciesId: 'ch3-ligand', mass: 15.035, valence: 1, charge: -0.5, offers: ['methyl-ligand'], seeks: ['silicon-valence'] },
        { id: 'ch3-2', speciesId: 'ch3-ligand', mass: 15.035, valence: 1, charge: -0.5, offers: ['methyl-ligand'], seeks: ['silicon-valence'] },
      ];

      const molecules = assembleSiliconeMolecules({
        transmutedAtoms: daughterPool,
        angularVelocity: 120.0,
        _radius: 0.85,
        rng,
      });

      expect(molecules.length).toBeGreaterThan(0);
      const mol = molecules[0];
      expect(mol.contract).toBe(SEMANTIC_SILICONE_MOLECULE_CONTRACT);
      expect(mol.atomCount).toBeGreaterThanOrEqual(3);
      expect(mol.bondCount).toBeGreaterThanOrEqual(2);
      expect(mol.atoms).toBeDefined();
      expect(mol.isThermallyStable).toBe(true);
    });
  });

  describe('Critical Phase Boundary Sweep', () => {
    it('demonstrates a sigmoidal phase transition curve across the spin spectrum', () => {
      const spinValues = [20, 40, 60, 80, 100, 140];
      const curve = sweepCriticalPhaseBoundary({ spinValues, trialsPerSpin: 60 });

      expect(curve).toHaveLength(spinValues.length);

      const p20 = curve.find((c) => c.spin === 20);
      expect(p20.transmutationRate).toBe(0);
      expect(p20.totalMolecules).toBe(0);

      const p140 = curve.find((c) => c.spin === 140);
      expect(p140.transmutationRate).toBeGreaterThan(0.70);
      expect(p140.totalMolecules).toBeGreaterThan(0);
    });
  });

  describe('DMT Compact Cyclization & Ring Surge', () => {
    it('catalyzes a massive surge in compact cyclic siloxane rings (D3, D4, D5)', () => {
      const controlRun = runSemanticSiliconeCyclotron({
        angularVelocity: 85.0,
        trialCount: 150,
        dmtIntensity: 0.0,
        seed: 0x4321,
      });

      const dmtRun = runSemanticSiliconeCyclotron({
        angularVelocity: 85.0,
        trialCount: 150,
        dmtIntensity: 0.75,
        seed: 0x4321,
      });

      expect(dmtRun.molecularAssembly.cyclicRings).toBeGreaterThan(
        controlRun.molecularAssembly.cyclicRings,
      );
    });
  });

  describe('Graph-Theoretic Validation & Immune Screening', () => {
    it('validates graph consistency and rejects broken or null molecules', () => {
      const nullMol = validateMolecularGraph(null);
      expect(nullMol.valid).toBe(false);

      const emptyMol = validateMolecularGraph({ atoms: [], bonds: [], molecularWeight: 0 });
      expect(emptyMol.valid).toBe(false);

      const negMass = validateMolecularGraph({
        atoms: [{ id: 'a1', mass: 10, valence: 2 }],
        bonds: [{ from: 'a1', to: 'a2' }],
        molecularWeight: -50,
      });
      expect(negMass.valid).toBe(false);
    });

    it('screens valid vs defective molecules through Macrophage immune filters', () => {
      const validAtoms = [
        { id: 'si1', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence'], seeks: ['oxygen-bridge'] },
        { id: 'o1', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge'], seeks: ['silicon-valence'] },
      ];
      const validBonds = [{ from: 'si1', to: 'o1', strength: 30.0 }];

      const validMolecule = {
        name: 'Linear Poly-Siloxane Chain',
        topology: MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN,
        molecularWeight: 44.084,
        atoms: validAtoms,
        bonds: validBonds,
      };

      const pass = evaluateMacrophageScreen(validMolecule);
      expect(pass.passed).toBe(true);

      const failScreen = evaluateMacrophageScreen({ atoms: [], bonds: [] });
      expect(failScreen.passed).toBe(false);
    });
  });

  describe('Feature-Based Semantic Grounding & Immunity to String/Rename Tampering', () => {
    const authenticAtoms = [
      { id: 'si1', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence', 'd-orbital-acceptor'], seeks: ['oxygen-bridge', 'methyl-ligand'] },
      { id: 'o1', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge', 'lone-pair-donor'], seeks: ['silicon-valence'] },
      { id: 'ch3_1', mass: 15.035, valence: 1, charge: -0.5, offers: ['methyl-ligand'], seeks: ['silicon-valence'] },
    ];
    const authenticBonds = [
      { from: 'si1', to: 'o1', strength: 35.0 },
      { from: 'si1', to: 'ch3_1', strength: 25.0 },
    ];

    it('THE RENAME TEST: holding the molecular graph identical while changing the name does not alter the grounding score by even 0.000001', () => {
      const moleculeA = {
        name: 'Cyclic Siloxane Ring D4',
        topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
        molecularWeight: 59.119,
        atoms: authenticAtoms,
        bonds: authenticBonds,
      };

      const moleculeB = {
        name: 'Linear Poly-Siloxane Chain [n=3]',
        topology: MOLECULAR_TOPOLOGIES.LINEAR_SILOXANE_CHAIN,
        molecularWeight: 59.119,
        atoms: authenticAtoms,
        bonds: authenticBonds,
      };

      const moleculeC = {
        name: 'Arbitrary Arbitrary Non-Chemical Label 12345',
        topology: 'WHATEVER_STRING',
        molecularWeight: 59.119,
        atoms: authenticAtoms,
        bonds: authenticBonds,
      };

      const groundA = evaluateSemanticGrounding(moleculeA);
      const groundB = evaluateSemanticGrounding(moleculeB);
      const groundC = evaluateSemanticGrounding(moleculeC);

      expect(groundA.targetCosine).toBe(groundB.targetCosine);
      expect(groundA.targetCosine).toBe(groundC.targetCosine);
      expect(groundA.contrastiveScore).toBe(groundB.contrastiveScore);
      expect(groundA.contrastiveScore).toBe(groundC.contrastiveScore);
      expect(groundA.grounded).toBe(true);
      expect(groundB.grounded).toBe(true);
      expect(groundC.grounded).toBe(true);
    });

    it('THE PHYSICAL DESTRUCTION TEST: a molecule with no atoms, no bonds or negative mass fails immediately regardless of name', () => {
      const ghostMolecule = {
        name: 'Cyclic Siloxane Ring D4',
        topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
        molecularWeight: -99.0,
        atoms: [],
        bonds: [],
      };

      const ground = evaluateSemanticGrounding(ghostMolecule);
      expect(ground.grounded).toBe(false);
      expect(ground.targetCosine).toBe(0.0);
      expect(ground.contrastiveScore).toBe(0.0);
    });

    it('DYNAMIC NOISE TEST: rejects unbonded non-chemical noise and arbitrary semantic bags', () => {
      const noiseAtoms = [
        { id: 'n1', mass: 10.0, valence: 2, charge: 0.0, offers: ['banana-flavor', 'fruit-peel'], seeks: ['sugar-sweet'] },
        { id: 'n2', mass: 12.0, valence: 2, charge: 0.0, offers: ['opera-tenor', 'stage-aria'], seeks: ['vocal-music'] },
      ];
      const noiseBonds = [{ from: 'n1', to: 'n2', strength: 10.0 }];

      const noiseMolecule = {
        name: 'Cyclic Siloxane Ring D4', // Adversarial attempt to spoof via name
        topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
        molecularWeight: 22.0,
        atoms: noiseAtoms,
        bonds: noiseBonds,
      };

      const ground = evaluateSemanticGrounding(noiseMolecule);
      expect(ground.grounded).toBe(false);
    });
  });

  describe('Post-Perturbation Semantic Persistence (PPSP) & Dynamic Quench Survival Curve', () => {
    it('generates a real, monotonically decreasing Centrifugal Survival Curve', () => {
      const ppspReport = measurePostPerturbationPersistence({
        synthesisSpin: 85.0,
        dmtIntensity: 0.75,
        quenchSpin: 80.0,
        trialCount: 120,
        seed: 0x5111c0,
      });

      expect(ppspReport.contract).toBe(SEMANTIC_SILICONE_PPSP_CONTRACT);
      expect(ppspReport.controlArm).toBeDefined();
      expect(ppspReport.dmtArm).toBeDefined();

      const curve = ppspReport.quenchSurvivalCurve;
      expect(curve.length).toBeGreaterThan(4);

      // Curve must show realistic decay as quench spin increases (not flat lines)
      const at0 = curve.find((c) => c.quenchSpin === 0);
      const at120 = curve.find((c) => c.quenchSpin === 120);
      const at240 = curve.find((c) => c.quenchSpin === 240);

      expect(at0.dmtSurvivalPercent).toBeGreaterThan(at240.dmtSurvivalPercent);
      expect(at120.dmtSurvivalPercent).toBeGreaterThanOrEqual(at240.dmtSurvivalPercent);
      expect(at240.dmtSurvivalPercent).toBeLessThan(10.0); // High centrifugal shear tears structures

      expect(ppspReport.checksum).toMatch(/^silicone-ppsp1:/);
    });

    it('evaluates individual molecule survival under non-zero quench spin', () => {
      const ringAtoms = [
        { id: 'si1', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence'], seeks: ['oxygen-bridge'] },
        { id: 'o1', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge'], seeks: ['silicon-valence'] },
        { id: 'si2', mass: 28.085, valence: 4, charge: 2.0, offers: ['silicon-valence'], seeks: ['oxygen-bridge'] },
        { id: 'o2', mass: 15.999, valence: 2, charge: -2.0, offers: ['oxygen-bridge'], seeks: ['silicon-valence'] },
      ];
      const ringBonds = [
        { from: 'si1', to: 'o1', strength: 35.0 },
        { from: 'o1', to: 'si2', strength: 35.0 },
        { from: 'si2', to: 'o2', strength: 35.0 },
        { from: 'o2', to: 'si1', strength: 35.0 },
      ];

      const ringMol = {
        moleculeId: 'mol-1',
        name: 'Cyclic Siloxane Ring D2',
        topology: MOLECULAR_TOPOLOGIES.CYCLIC_SILOXANE_RING,
        molecularWeight: 88.168,
        atoms: ringAtoms,
        bonds: ringBonds,
      };

      const survLow = evaluateQuenchSurvival(ringMol, 60.0);
      const survExtreme = evaluateQuenchSurvival(ringMol, 280.0);

      expect(survLow.isStableUnderQuench).toBe(true);
      expect(survExtreme.isStableUnderQuench).toBe(false);
    });
  });

  describe('Determinism & Report Integrity', () => {
    it('produces 100% bit-for-bit identical reports across repeated runs with same seed', () => {
      const options = {
        seed: 0xabcde,
        trialCount: 80,
        angularVelocity: 135.0,
        magneticField: 2.5,
      };

      const run1 = runSemanticSiliconeCyclotron(options);
      const run2 = runSemanticSiliconeCyclotron(options);

      expect(run1).toEqual(run2);
      expect(run1.checksum).toBe(run2.checksum);
      expect(verifySemanticSiliconeReport(run1)).toBe(true);
      expect(verifySemanticSiliconeReport(run2)).toBe(true);
    });

    it('detects tampering and rejects invalid checksums', () => {
      const report = runSemanticSiliconeCyclotron({
        seed: 0x42,
        trialCount: 20,
        angularVelocity: 120.0,
      });

      expect(verifySemanticSiliconeReport(report)).toBe(true);

      const tampered1 = { ...report, verdict: 'TAMPERED_VERDICT' };
      expect(verifySemanticSiliconeReport(tampered1)).toBe(false);

      const tampered2 = {
        ...report,
        molecularAssembly: {
          ...report.molecularAssembly,
          totalMoleculesFormed: 9999,
        },
      };
      expect(verifySemanticSiliconeReport(tampered2)).toBe(false);

      const tampered3 = { ...report, contract: 'INVALID-CONTRACT' };
      expect(verifySemanticSiliconeReport(tampered3)).toBe(false);
    });
  });

  describe('2x2 Factorial Causal Ablation (Topology vs κ Treatment)', () => {
    it('executes 2x2 factorial ablation and isolates topology as primary resilience driver', () => {
      const ablation = runTopologicalCausalAblation({
        synthesisSpin: 85.0,
        dmtIntensity: 0.75,
        trialCount: 120,
        seed: 0x5111c0,
      });

      expect(ablation.contract).toBe(SEMANTIC_SILICONE_CAUSAL_ABLATION_CONTRACT);
      expect(ablation.schemaVersion).toBe(SEMANTIC_SILICONE_SCHEMA_VERSION);
      expect(ablation.checksum).toMatch(/^silicone-causal1:[a-f0-9]{64}$/);

      const cells = ablation.factorialCells;
      expect(cells.controlRings.count).toBeGreaterThan(0);
      expect(cells.dmtRings.count).toBeGreaterThan(0);
      expect(cells.controlChains.count).toBeGreaterThan(0);
      expect(cells.dmtChains.count).toBeGreaterThan(0);

      const analysis = ablation.causalAnalysisAtOperatingSpin80;
      expect(analysis.operatingSpin).toBe(80.0);

      // Rings should substantially outperform chains under rotational stress
      expect(analysis.effects.avgRingSurvival).toBeGreaterThan(analysis.effects.avgChainSurvival);
      expect(analysis.effects.mainEffectTopologyDelta).toBeGreaterThan(20.0);

      // This assertion used to read TOPOLOGY_IS_PRIMARY_CAUSAL_MECHANISM. At this
      // trialCount kappa helps chains (+20.1) and harms rings (-33.3): an
      // interaction of -53.4, larger than the 37.5 topology main effect. Neither
      // main effect summarises a crossover that size, so "topology is primary" is
      // not a true statement about this data. The previous verdict could not see
      // it because it tested Math.abs(kappa) and so could not tell a crossover
      // from a clean main effect.
      expect(analysis.effects.interactionDelta).toBeLessThan(0);
      expect(Math.abs(analysis.effects.interactionDelta))
        .toBeGreaterThan(Math.abs(analysis.effects.mainEffectTopologyDelta));
      expect(analysis.causalVerdict).toMatch(/^INTERACTION_DOMINATES_MAIN_EFFECTS_NOT_SUMMARISABLE/);

      // An unsummarisable surface must not also publish a pooled number.
      expect(analysis.aggregateReportable).toBe(false);
      expect(analysis.suppressionReason).toBeTruthy();
    }, 15000);

    it('reads the SIGN of the kappa effect, never its magnitude', () => {
      // The defect this pins: a harmful treatment printing as a confirmation.
      // Same run, both trial counts - kappa's main effect is negative in each,
      // so no verdict may contain a word implying the treatment helped.
      for (const trialCount of [120, 300]) {
        const ablation = runTopologicalCausalAblation({
          synthesisSpin: 85.0,
          dmtIntensity: 0.75,
          trialCount,
          seed: 0x5111c0,
        });
        const analysis = ablation.causalAnalysisAtOperatingSpin80;
        expect(analysis.effects.mainEffectKappaDelta).toBeLessThan(0);
        expect(analysis.causalVerdict).not.toMatch(/HELPS|CONFIRMED|ADVANTAGE/);
      }
    }, 20000);

    it('suppresses the aggregate when standardising flips its sign', () => {
      // Simpson check. The arms carry different ring:chain mixes, so the pooled
      // delta can favour the treatment while both standardised deltas do not
      // agree with it. When that happens the report must refuse to publish it.
      const ablation = runTopologicalCausalAblation({
        synthesisSpin: 85.0,
        dmtIntensity: 0.75,
        trialCount: 300,
        seed: 0x5111c0,
      });
      const analysis = ablation.causalAnalysisAtOperatingSpin80;
      const s = analysis.standardisation;
      const deltas = [s.observedDelta, s.atControlMix.delta, s.atDmtMix.delta];
      const signsAgree = deltas.every((d) => d > 0) || deltas.every((d) => d < 0);

      expect(signsAgree).toBe(false);
      expect(analysis.aggregateReportable).toBe(false);
      expect(analysis.causalVerdict).toMatch(/^COMPOSITION_ARTIFACT_NOT_TREATMENT_EFFECT/);
    }, 20000);
  });

  describe('Ring closure isolation (one-variable topology test)', () => {
    it('opens a ring by removing exactly one bond, leaving the rest identical', () => {
      const report = runSemanticSiliconeCyclotron({
        angularVelocity: 85, dmtIntensity: 0.75, trialCount: 120, seed: 0x5111c0,
      });
      const ring = report.molecularAssembly.molecules
        .find((m) => validateMolecularGraph(m).hasCycle);
      expect(ring).toBeDefined();

      const opened = openRingCounterfactual(ring);
      expect(opened).not.toBeNull();
      expect(opened.bondsRemoved).toBe(1);
      expect(opened.bonds.length).toBe(ring.bonds.length - 1);
      expect(validateMolecularGraph(opened).hasCycle).toBe(false);

      // Every surviving bond keeps its exact strength - that is what makes this
      // a one-variable test rather than another arm comparison.
      const kept = new Set(opened.bonds.map((b) => `${b.from}|${b.to}|${b.strength}`));
      const survivors = ring.bonds.filter((b) => kept.has(`${b.from}|${b.to}|${b.strength}`));
      expect(survivors.length).toBe(opened.bonds.length);
    }, 20000);

    it('reports discordant counts, not net marginals', () => {
      const report = runSemanticSiliconeCyclotron({
        angularVelocity: 85, dmtIntensity: 0.75, trialCount: 120, seed: 0x5111c0,
      });
      const iso = isolateRingClosureEffect({ molecules: report.molecularAssembly.molecules });
      expect(iso.cyclicMoleculesTested).toBeGreaterThan(0);
      for (const row of iso.bySpin) {
        // Paired binary data: wins + losses IS the test. A row that reported only
        // a net difference could not tell 5W/0L from 7W/2L.
        expect(row.discordant).toBe(row.closureWins + row.closureLosses);
      }
      expect(iso.pooled.discordant).toBe(iso.pooled.closureWins + iso.pooled.closureLosses);
    }, 20000);

    it('exact sign test returns 1 when there is nothing to separate', () => {
      expect(exactTwoSidedSignP(0, 0)).toBe(1);
      expect(exactTwoSidedSignP(3, 6)).toBe(1);
      expect(exactTwoSidedSignP(6, 6)).toBeCloseTo(0.03125, 5);
      expect(exactTwoSidedSignP(7, 7)).toBeCloseTo(0.015625, 5);
    });

    it('CHARACTERISES A KNOWN CONFOUND: the two stress branches use different mass models', () => {
      // calculateCentrifugalBreakage takes the cyclic branch with reduced mass
      // hardcoded at 10.0, and the acyclic branch with reduced mass derived from
      // molecularWeight. On a 176-weight molecule that is 10.0 versus ~44, so a
      // ring-vs-chain comparison is confounded by a literal, not by geometry.
      //
      // This test PINS the defect so that making the branches consistent breaks it
      // deliberately rather than silently moving every ring result. It is not an
      // endorsement of the current model.
      const report = runSemanticSiliconeCyclotron({
        angularVelocity: 85, dmtIntensity: 0.75, trialCount: 120, seed: 0x5111c0,
      });
      const ring = report.molecularAssembly.molecules
        .find((m) => validateMolecularGraph(m).hasCycle && Number(m.molecularWeight) > 100);
      expect(ring).toBeDefined();

      const opened = openRingCounterfactual(ring);
      const closedStable = calculateCentrifugalBreakage(ring, 80).isStable;
      const openedStable = calculateCentrifugalBreakage(opened, 80).isStable;

      // The separation is total, which is the tell: real geometry does not
      // produce a clean 100%/0% split on molecules sharing every bond strength.
      expect(closedStable).toBe(true);
      expect(openedStable).toBe(false);
    }, 20000);
  });
});
