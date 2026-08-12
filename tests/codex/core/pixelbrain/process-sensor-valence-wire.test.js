import { describe, it, expect } from 'vitest';
import {
  senseValenceCompile,
  exitCodeForReading,
  PROCESS_SENSOR_VALENCE_WIRE_CONTRACT,
} from '../../../../codex/core/pixelbrain/process-sensor-valence-wire.js';
import {
  buildReceipt,
  assess,
} from '../../../../codex/core/pixelbrain/cyclotron-sensor.js';

const candidate = (atomIds, finalScore, feasibility = 0.6) => ({
  finalScore,
  molecule: {
    atomIds,
    energy: 0.7,
    novelty: 0.3,
    grounding: 0.7,
    checksum: `molecule1:${atomIds.join('')}`,
  },
  conceptChemistry: { feasibility },
  verdict: 'HYPOTHESIS',
});

const makeReport = (overrides = {}) => ({
  contract: 'PB-SEMANTIC-CYCLOTRON-REPORT-v1',
  schemaVersion: '1.0.0',
  seed: 6045712,
  requestedTrials: 2000,
  completedTrials: 2000,
  atomBankChecksum: 'atombank1:wiretest',
  groundingIndexChecksum: 'grnd1:wiretest',
  chemistryProvenance: {
    schema: 'PB-CONCEPT-CHEM-v1',
    version: 'v2',
    weights: { bond: 0.1, grounding: 0.3, coherence: 0.15, relation: 0.45 },
  },
  configuration: { maxMoleculeSize: 5, shortlistLimit: 256, shortlistFamilyCap: 2 },
  control: { bar: 0.2, percentile: 0.99, samples: 400 },
  counts: {
    candidateTrials: 1600, controlTrials: 400, nuclei: 1, hypotheses: 2,
    shortlisted: 2, uniqueMolecules: 10, refused: 0, duplicateMolecules: 0, unboundTrials: 0,
  },
  candidates: [
    candidate(['process-sensor', 'valence-compiler'], 0.7192, 0.61),
    candidate(['schema-verifier', 'test-contract'], 0.75, 0.55),
  ],
  checksum: 'cyclotron1:wireaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ...overrides,
});

describe('process-sensor + valence-compiler wire', () => {
  it('stamps the wire contract and surfaces the valence frontier', () => {
    const result = senseValenceCompile(makeReport());
    expect(result.contract).toBe(PROCESS_SENSOR_VALENCE_WIRE_CONTRACT);
    expect(result.frontierSize).toBe(2);
    expect(result.hasFeasibility).toBe(true);
    expect(result.receipt.inputClass).toMatch(/^inclass1:/);
    expect(result.seal.checksum).toMatch(/^cyclosensor1:/);
  });

  it('NO_BASELINE when no baseline approved (first wire after a compile)', () => {
    const result = senseValenceCompile(makeReport(), null);
    expect(result.reading.verdict).toBe('NO_BASELINE');
    expect(exitCodeForReading(result.reading)).toBe(0);
  });

  it('STABLE when the valence compiler reproduces the approved receipt', () => {
    const report = makeReport();
    const baseline = buildReceipt(report);
    const result = senseValenceCompile(report, baseline);
    expect(result.reading.verdict).toBe('STABLE');
    expect(exitCodeForReading(result.reading)).toBe(0);
  });

  it('DEVIATION when the frontier fingerprint moves under identical inputs', () => {
    const baseline = buildReceipt(makeReport());
    const drifted = makeReport({
      checksum: 'cyclotron1:driftedddddddddddddddddddddddddddd',
      counts: {
        candidateTrials: 1600, controlTrials: 400, nuclei: 9, hypotheses: 2,
        shortlisted: 2, uniqueMolecules: 10, refused: 0, duplicateMolecules: 0, unboundTrials: 0,
      },
    });
    const result = senseValenceCompile(drifted, baseline);
    expect(result.reading.verdict).toBe('DEVIATION');
    expect(result.reading.moved.map((m) => m.field)).toContain('count.nuclei');
    expect(exitCodeForReading(result.reading)).toBe(1);
  });

  it('ABSTAIN when seed (input class) changes — not a false DEVIATION', () => {
    const baseline = buildReceipt(makeReport());
    const result = senseValenceCompile(makeReport({ seed: 999 }), baseline);
    expect(result.reading.verdict).toBe('ABSTAIN');
    expect(result.reading.reason).toBe('INPUT_CLASS_CHANGED');
    expect(exitCodeForReading(result.reading)).toBe(0);
  });

  it('refuses incomplete provenance the same way the bare sensor does', () => {
    const report = makeReport();
    delete report.chemistryProvenance;
    expect(() => senseValenceCompile(report)).toThrow(/NO_CHEMISTRY_PROVENANCE/);
  });

  it('is deterministic — same report and baseline yield identical seals', () => {
    const report = makeReport();
    const baseline = buildReceipt(report);
    const a = senseValenceCompile(report, baseline);
    const b = senseValenceCompile(report, baseline);
    expect(a.seal.checksum).toBe(b.seal.checksum);
    expect(a.reading).toEqual(b.reading);
  });

  it('does not mutate the baseline (propose-only)', () => {
    const baseline = buildReceipt(makeReport());
    const before = JSON.stringify(baseline);
    senseValenceCompile(makeReport({ checksum: 'cyclotron1:other' }), baseline);
    expect(JSON.stringify(baseline)).toBe(before);
    // assess path remains pure
    assess(buildReceipt(makeReport()), baseline);
    expect(JSON.stringify(baseline)).toBe(before);
  });
});
