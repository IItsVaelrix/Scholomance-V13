import { describe, it, expect } from 'vitest';
import { runSemanticValenceCyclotron } from '../../../../codex/core/pixelbrain/semantic-valence-cyclotron.js';

const ATOM = (id, label, domain, offers, seeks, grounding) => ({
  id, label, domain, offers, seeks,
  traits: [], inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding,
});

const BANK = [
  ATOM('seed-a', 'deterministic sealed checksum source', 'synthesis', ['port-a'], [], 0.80),
  ATOM('mid-b', 'canonical schema verifier stage', 'governance', ['port-b'], ['port-a'], 0.85),
  ATOM('mid-c', 'concept chemistry feasibility scorer', 'immunity', ['port-c'], ['port-b'], 0.88),
  ATOM('end-d', 'evidence ledger structure sink', 'artifact', ['port-d'], ['port-c'], 0.90),
];

const RUN = (overrides = {}) => ({
  atoms: BANK,
  trialCount: 600,
  seed: 0x4f534d4f,
  maxMoleculeSize: 4,
  controlEvery: 5,
  controlPercentile: 0.99,
  shortlistLimit: 64,
  shortlistFamilyCap: 4,
  noveltyFloor: 0.04,
  finalScoreFloor: 0.30,
  nucleusScoreFloor: 0.60,
  nucleusNoveltyFloor: 0.20,
  nucleusMinDomains: 3,
  ...overrides,
});

const ENERGY_WEIGHT = 0.50 / 0.85;
const FEASIBILITY_WEIGHT = 0.35 / 0.85;

describe('finalScore excludes osmosis', () => {
  it('is exactly the renormalised energy + feasibility sum', () => {
    const report = runSemanticValenceCyclotron(RUN());
    expect(report.candidates.length).toBeGreaterThan(0);

    for (const candidate of report.candidates) {
      const energy = candidate.molecule.energy;
      const feasibility = Math.min(1, Math.max(0, candidate.conceptChemistry.feasibility));
      const expected = Math.min(1, ENERGY_WEIGHT * energy + FEASIBILITY_WEIGHT * feasibility);
      expect(candidate.finalScore).toBeCloseTo(expected, 5);
    }
  });

  it('no longer carries the old flat +0.15 osmotic term', () => {
    const report = runSemanticValenceCyclotron(RUN());
    const candidate = report.candidates[0];
    const energy = candidate.molecule.energy;
    const feasibility = Math.min(1, Math.max(0, candidate.conceptChemistry.feasibility));
    const oldFormula = Math.min(1, 0.50 * energy + 0.35 * feasibility + 0.15 * 1.0);
    expect(candidate.finalScore).not.toBeCloseTo(oldFormula, 4);
  });

  it('still reports osmosis as a diagnostic field', () => {
    const report = runSemanticValenceCyclotron(RUN());
    expect(report.candidates[0]).toHaveProperty('osmosis');
  });
});

describe('verdict predicate ignores osmosis', () => {
  it('crowns candidates even when the membrane would report no drift', () => {
    // Force the membrane silent by making drift impossible: a similarityFloor
    // of 0 and driftCeiling of 1 mean `baseline_drift` can never fire.
    const report = runSemanticValenceCyclotron(RUN({
      osmosisSimilarityFloor: 0,
      osmosisDriftCeiling: 1,
    }));
    const drifted = report.candidates.filter(
      (c) => c.osmosis?.anomalyKind === 'baseline_drift',
    );
    expect(drifted.length).toBe(0);   // precondition: the gate would have closed

    const judged = report.candidates.filter((c) => c.verdict !== 'REFUSED');
    expect(judged.length).toBeGreaterThan(0);  // fails today: gate closed => all REFUSED
  });
});

describe('membrane governs occupancy, not novelty', () => {
  it('feeds the membrane a crowding fraction, not an energy score', () => {
    const report = runSemanticValenceCyclotron(RUN({ entropy: { enabled: true } }));
    const withOsmosis = report.candidates.filter((c) => c.osmosis);
    expect(withOsmosis.length).toBeGreaterThan(0);

    for (const candidate of withOsmosis) {
      // concentration must be a crowding fraction in [0,1), and must NOT equal
      // the molecule's energy — that was the category error.
      expect(candidate.osmosis.concentration).toBeGreaterThanOrEqual(0);
      expect(candidate.osmosis.concentration).toBeLessThan(1);
    }
    const matchesEnergy = withOsmosis.filter(
      (c) => Math.abs(c.osmosis.concentration - c.molecule.energy) < 1e-6,
    );
    expect(matchesEnergy.length).toBe(0);
  });

  it('reports over-concentration on a bank small enough to saturate', () => {
    // 4 atoms and 600 trials guarantees heavy revisiting, so crowding must
    // clear a 0.5 limit somewhere.
    const report = runSemanticValenceCyclotron(RUN({
      entropy: { enabled: true },
      osmosisConcentrationLimit: 0.5,
    }));
    const concentrated = report.candidates.filter(
      (c) => c.osmosis?.anomalyKind === 'concentration',
    );
    expect(concentrated.length).toBeGreaterThan(0);
  });

  it('stays silent when the limit is above anything reachable', () => {
    // Discrimination check: a membrane that always fires is no membrane.
    const report = runSemanticValenceCyclotron(RUN({
      entropy: { enabled: true },
      osmosisConcentrationLimit: 0.999999,
    }));
    const concentrated = report.candidates.filter(
      (c) => c.osmosis?.anomalyKind === 'concentration',
    );
    expect(concentrated.length).toBe(0);
  });
});
