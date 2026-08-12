import { describe, it, expect } from 'vitest';
import {
  CYCLOTRON_SENSOR_CONTRACT,
  buildReceipt,
  assess,
  sealReceipt,
} from '../../../../codex/core/pixelbrain/cyclotron-sensor.js';
import { sha256Hex } from '../../../../codex/core/immunity/cleri-probe/canonical-report.js';

const candidate = (atomIds, finalScore, energy, novelty, grounding, feasibility) => ({
  finalScore,
  molecule: { atomIds, energy, novelty, grounding, checksum: `molecule1:${atomIds.join('')}` },
  conceptChemistry: { feasibility },
  verdict: 'HYPOTHESIS',
});

export const makeReport = (overrides = {}) => ({
  contract: 'PB-SEMANTIC-CYCLOTRON-REPORT-v1',
  schemaVersion: '1.0.0',
  seed: 6045712,
  requestedTrials: 2000,
  completedTrials: 2000,
  atomBankChecksum: 'atombank1:fdb594f75fae202a',
  groundingIndexChecksum: 'grnd1:37c87b90a96e27a7',
  chemistryProvenance: {
    schema: 'PB-CONCEPT-CHEM-v1',
    version: 'v2',
    weights: { bond: 0.1, grounding: 0.3, coherence: 0.15, relation: 0.45 },
  },
  configuration: { maxMoleculeSize: 5, shortlistLimit: 256, shortlistFamilyCap: 2 },
  control: { bar: 0.201721, percentile: 0.99, samples: 400 },
  counts: {
    candidateTrials: 1600, controlTrials: 400, duplicateMolecules: 5, hypotheses: 3,
    nuclei: 1, refused: 2, shortlisted: 4, uniqueMolecules: 10, unboundTrials: 0,
  },
  candidates: [
    candidate(['bytecode-seal', 'canonical-serializer'], 0.7725, 0.7627, 0.3191, 0.7096, 0.6105),
    candidate(['immutable-packet', 'schema-verifier'], 0.7681, 0.7601, 0.3242, 0.7011, 0.6002),
  ],
  checksum: 'cyclotron1:aaaabbbbccccddddeeeeffff00001111',
  ...overrides,
});

describe('buildReceipt', () => {
  it('stamps the sensor contract and derives an input class', () => {
    const receipt = buildReceipt(makeReport());
    expect(receipt.contract).toBe(CYCLOTRON_SENSOR_CONTRACT);
    expect(receipt.schemaVersion).toBe('1.0.0');
    expect(receipt.inputClass).toMatch(/^inclass1:[0-9a-f]{64}$/);
  });

  it('is deterministic — the same report yields an identical receipt', () => {
    expect(buildReceipt(makeReport())).toEqual(buildReceipt(makeReport()));
  });

  it('carries provenance read from inside the report, not recomputed', () => {
    const receipt = buildReceipt(makeReport());
    expect(receipt.inputs.chemistryVersion).toBe('v2');
    expect(receipt.inputs.chemistryWeights).toEqual({
      bond: 0.1, grounding: 0.3, coherence: 0.15, relation: 0.45,
    });
  });

  it('fingerprints outputs including every count and a shortlist digest', () => {
    const receipt = buildReceipt(makeReport());
    expect(receipt.outputs.reportChecksum).toBe('cyclotron1:aaaabbbbccccddddeeeeffff00001111');
    expect(receipt.outputs.controlBar).toBe(0.201721);
    expect(receipt.outputs['count.nuclei']).toBe(1);
    expect(receipt.outputs['count.uniqueMolecules']).toBe(10);
    expect(receipt.outputs.shortlistDigest).toMatch(/^shortlist1:[0-9a-f]{64}$/);
    expect(receipt.outputs.meanFinalScore).toBe(0.7703);
  });

  it('refuses a report with no chemistry provenance', () => {
    const report = makeReport();
    delete report.chemistryProvenance;
    expect(() => buildReceipt(report)).toThrow(/NO_CHEMISTRY_PROVENANCE/);
  });

  it('refuses a report with no atom bank checksum', () => {
    expect(() => buildReceipt(makeReport({ atomBankChecksum: null })))
      .toThrow(/atomBankChecksum/);
  });

  it('orders the shortlist digest by content, not by candidate order', () => {
    const a = buildReceipt(makeReport());
    const flipped = makeReport();
    flipped.candidates = [...flipped.candidates].reverse();
    const b = buildReceipt(flipped);
    expect(b.outputs.shortlistDigest).toBe(a.outputs.shortlistDigest);
  });
});

describe('assess', () => {
  const baselineOf = (report = makeReport()) => buildReceipt(report);

  it('returns NO_BASELINE when nothing has been approved', () => {
    const reading = assess(baselineOf(), null);
    expect(reading.verdict).toBe('NO_BASELINE');
    expect(reading.moved).toEqual([]);
  });

  it('returns STABLE when inputs and outputs both match', () => {
    const reading = assess(baselineOf(), baselineOf());
    expect(reading.verdict).toBe('STABLE');
    expect(reading.moved).toEqual([]);
  });

  it('ABSTAINs when the sensor contract itself changed', () => {
    const baseline = { ...baselineOf(), contract: 'PB-CYCLOTRON-SENSOR-v0' };
    const reading = assess(baselineOf(), baseline);
    expect(reading.verdict).toBe('ABSTAIN');
    expect(reading.reason).toBe('SENSOR_CONTRACT_CHANGED');
  });

  it('never mutates the baseline', () => {
    const baseline = baselineOf();
    const before = JSON.stringify(baseline);
    assess(buildReceipt(makeReport({ checksum: 'cyclotron1:different' })), baseline);
    expect(JSON.stringify(baseline)).toBe(before);
  });

  // Every OUTPUT field must be able to produce a DEVIATION. A field that cannot
  // move the verdict is not evidence — it is decoration, and this test deletes it.
  const outputFields = Object.keys(buildReceipt(makeReport()).outputs);
  it.each(outputFields)('DEVIATION fires and names the moved output field: %s', (field) => {
    const baseline = baselineOf();
    const observed = baselineOf();
    observed.outputs[field] = typeof observed.outputs[field] === 'number'
      ? observed.outputs[field] + 1
      : `${observed.outputs[field]}-perturbed`;
    const reading = assess(observed, baseline);
    expect(reading.verdict).toBe('DEVIATION');
    expect(reading.moved.map((m) => m.field)).toContain(field);
  });

  // Every INPUT field must be able to produce an ABSTAIN — and must never
  // produce a DEVIATION. Changing an input is not evidence of drift.
  const inputFields = Object.keys(buildReceipt(makeReport()).inputs);
  it.each(inputFields)('ABSTAIN fires and names the changed input field: %s', (field) => {
    const baseline = baselineOf();
    const observed = baselineOf();
    observed.inputs[field] = typeof observed.inputs[field] === 'number'
      ? observed.inputs[field] + 1
      : `${JSON.stringify(observed.inputs[field])}-perturbed`;
    observed.inputClass = 'inclass1:recomputed-elsewhere';
    const reading = assess(observed, baseline);
    expect(reading.verdict).toBe('ABSTAIN');
    expect(reading.reason).toBe('INPUT_CLASS_CHANGED');
    expect(reading.differing).toContain(field);
  });
});

describe('sealReceipt', () => {
  it('seals with the prefix and a sha256 of the body', () => {
    const { artifact, checksum } = sealReceipt(buildReceipt(makeReport()));
    expect(checksum).toMatch(/^cyclosensor1:[0-9a-f]{64}$/);
    expect(typeof artifact).toBe('string');
  });

  it('is verifiable by the exact rule evidence-integrity-harness.mjs applies', () => {
    const receipt = buildReceipt(makeReport());
    const { checksum } = sealReceipt(receipt);
    // Reproduce the harness: strip `checksum`, recompute sha256Hex over the body,
    // compare against the claimed suffix.
    const stored = { ...receipt, checksum };
    const { checksum: claimed, ...body } = stored;
    expect(sha256Hex(body)).toBe(claimed.split(':').pop());
  });

  it('is idempotent — resealing an already-sealed receipt gives the same checksum', () => {
    const receipt = buildReceipt(makeReport());
    const first = sealReceipt(receipt);
    const second = sealReceipt({ ...receipt, checksum: first.checksum });
    expect(second.checksum).toBe(first.checksum);
  });
});
