import { describe, it, expect } from 'vitest';
import {
  certifyAmpManifestAndAdapter,
  certifyAllRegisteredAmps,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-certify.js';
import {
  getAmpManifest,
  getAmpAdapter,
  listAmpManifests,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';
import { computeAmpAbiChecksum } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-abi.js';

describe('SCDL v2 Universal AMP Certification Harness', () => {
  const anchorIds = [
    'pixelbrain.facet',
    'pixelbrain.pixel-aa',
    'pixelbrain.image-segmentation',
    'pixelbrain.gear-glide',
    'pixelbrain.noise-fill',
  ];

  it('certifies registered AMPs across COMPILE, ANALYZE, and DESCRIPTOR classes', () => {
    const results = certifyAllRegisteredAmps();
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const res of results) {
      expect(res.certified, `AMP ${res.ampId} failed certification: ${res.errors.join('; ')}`).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.checksum).toBeDefined();
      const dormancyCheck = res.checks.find((c) => c.name === 'dormancy_invariance');
      expect(dormancyCheck?.passed).toBe(true);
      const costCheck = res.checks.find((c) => c.name === 'cost_scaling');
      expect(costCheck?.passed).toBe(true);
      const outputCheck = res.checks.find((c) => c.name === 'output_conformance');
      expect(outputCheck?.passed).toBe(true);
    }
  });

  for (const ampId of anchorIds) {
    it(`certifies ${ampId} individually`, () => {
      const manifest = getAmpManifest(ampId);
      const adapter = getAmpAdapter(ampId);
      expect(manifest).toBeDefined();
      expect(adapter).toBeDefined();

      const report = certifyAmpManifestAndAdapter(manifest, adapter);
      expect(report.certified).toBe(true);
      expect(report.errors).toHaveLength(0);
    });
  }

  it('detects and rejects manifests missing checksum', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.missing-checksum',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    };
    const adapter = { execute: (inputs) => ({ ...inputs.geometry }) };
    const report = certifyAmpManifestAndAdapter(manifest, adapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('missing required checksum field'))).toBe(true);
  });

  it('detects and rejects manifests with mismatched checksum', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.bad-checksum',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
      checksum: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const adapter = { execute: (inputs) => ({ ...inputs.geometry }) };
    const report = certifyAmpManifestAndAdapter(manifest, adapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('Manifest checksum mismatch'))).toBe(true);
  });

  it('detects and rejects non-deterministic adapters claiming PURE determinism', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.cheating-pure',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    };
    manifest.checksum = computeAmpAbiChecksum(manifest);

    let counter = 0;
    const cheatingAdapter = {
      execute() {
        counter += 1;
        return { kind: 'RANDOM', counter };
      },
    };

    const report = certifyAmpManifestAndAdapter(manifest, cheatingAdapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('Determinism violation'))).toBe(true);
  });

  it('detects and rejects adapters whose output does not conform to declared type', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.bad-output-type',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    };
    manifest.checksum = computeAmpAbiChecksum(manifest);

    const nonConformingAdapter = {
      execute() {
        return 'not a shape object';
      },
    };

    const report = certifyAmpManifestAndAdapter(manifest, nonConformingAdapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('output does not conform'))).toBe(true);
  });

  it('detects and rejects invalid cost models', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.bad-cost',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: -5, fixed: 0 },
      order: 10,
    };
    manifest.checksum = computeAmpAbiChecksum(manifest);

    const adapter = { execute: (inputs) => ({ ...inputs.geometry }) };
    const report = certifyAmpManifestAndAdapter(manifest, adapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('Cost parameters must be non-negative'))).toBe(true);
  });

  it('detects and rejects adapters that fabricate ITEM-SPEC-v1 metadata', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.lying-spec',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    };
    manifest.checksum = computeAmpAbiChecksum(manifest);

    const lyingAdapter = {
      execute() {
        return {
          kind: 'SHAPE',
          spec: {
            class: 'armor',
            archetype: 'chestplate',
          },
        };
      },
    };

    const report = certifyAmpManifestAndAdapter(manifest, lyingAdapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('Metadata honesty violation'))).toBe(true);
  });

  it('detects and rejects adapters that mutate input arguments', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.mutating-inputs',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'CONSTANT', multiplier: 1, fixed: 0 },
      order: 10,
    };
    manifest.checksum = computeAmpAbiChecksum(manifest);

    const mutatingAdapter = {
      execute(inputs) {
        inputs.geometry.mutatedProperty = true;
        return { ...inputs.geometry, isFaceted: true };
      },
    };

    const report = certifyAmpManifestAndAdapter(manifest, mutatingAdapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('Adapter mutated its input arguments'))).toBe(true);
  });

  it('detects and rejects adapters failing empirical resource scaling benchmarks', () => {
    const manifest = {
      contract: 'PB-AMP-ABI-v1',
      ampId: 'test.scale-fail',
      version: '1.0.0',
      execution: 'COMPILE',
      stage: 'SHAPE_POST',
      scope: ['SHAPE'],
      inputs: [{ name: 'geometry', type: 'SHAPE', required: true }],
      parameters: [],
      output: { type: 'SHAPE' },
      determinism: { class: 'PURE', seedRequired: false },
      cost: { model: 'LINEAR_IN_CELLS', multiplier: 1, fixed: 0 },
      order: 10,
    };
    manifest.checksum = computeAmpAbiChecksum(manifest);

    const runawayAdapter = {
      execute(inputs) {
        if (inputs.geometry?.points?.length > 100) {
          throw new Error('Resource limit exceeded on large input');
        }
        return { ...inputs.geometry, kind: 'CIRCLE' };
      },
    };

    const report = certifyAmpManifestAndAdapter(manifest, runawayAdapter);
    expect(report.certified).toBe(false);
    expect(report.errors.some((e) => e.includes('Empirical resource scaling failure'))).toBe(true);
  });
});
