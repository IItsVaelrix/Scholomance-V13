import { describe, it, expect } from 'vitest';
import {
  AMP_ABI_CONTRACT,
  AMP_EXECUTION_CLASSES,
  AMP_STAGES,
  AMP_SCOPES,
  AMP_DETERMINISM_CLASSES,
  AMP_COST_MODELS,
  validateAmpAbiManifest,
  canonicalAmpAbiJSON,
  computeAmpAbiChecksum,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-abi.js';

describe('SCDL v2 PB-AMP-ABI-v1 Manifest Contract', () => {
  const validManifest = Object.freeze({
    contract: 'PB-AMP-ABI-v1',
    ampId: 'test.facet',
    version: '1.0.0',
    execution: 'COMPILE',
    stage: 'SHAPE_POST',
    scope: ['SHAPE', 'LAYER'],
    inputs: [
      { name: 'geometry', type: 'SHAPE', required: true, description: 'Base shape' },
    ],
    parameters: [
      { name: 'facetCount', type: 'I32', min: 3, max: 32, default: 8 },
    ],
    output: { type: 'SHAPE', description: 'Faceted geometry' },
    determinism: { class: 'PURE', seedRequired: false },
    cost: { model: 'LINEAR_IN_CELLS', multiplier: 4, fixed: 0 },
    order: 40,
    relevance: {
      pipelines: ['item'],
      conditions: [{ field: 'materials', op: 'includes', value: 'gem' }],
    },
  });

  it('validates a conformant PB-AMP-ABI-v1 manifest', () => {
    const res = validateAmpAbiManifest(validManifest);
    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects invalid contracts', () => {
    const bad = { ...validManifest, contract: 'WRONG-CONTRACT' };
    const res = validateAmpAbiManifest(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('contract: must be exactly'))).toBe(true);
  });

  it('rejects invalid or missing ampId and semver version', () => {
    const badId = { ...validManifest, ampId: '' };
    expect(validateAmpAbiManifest(badId).ok).toBe(false);

    const badVer = { ...validManifest, version: 'not-semver' };
    expect(validateAmpAbiManifest(badVer).ok).toBe(false);
  });

  it('enforces execution classes and valid stages', () => {
    expect(AMP_EXECUTION_CLASSES).toEqual(['COMPILE', 'ANALYZE', 'DESCRIPTOR']);
    expect(AMP_STAGES).toHaveLength(12);

    const badExec = { ...validManifest, execution: 'UNKNOWN' };
    expect(validateAmpAbiManifest(badExec).ok).toBe(false);

    const badStage = { ...validManifest, stage: 'NOT_A_STAGE' };
    expect(validateAmpAbiManifest(badStage).ok).toBe(false);
  });

  it('enforces execution-to-stage compatibility laws', () => {
    // COMPILE cannot target RUNTIME_DESCRIPTOR
    const badCompile = { ...validManifest, execution: 'COMPILE', stage: 'RUNTIME_DESCRIPTOR' };
    const res1 = validateAmpAbiManifest(badCompile);
    expect(res1.ok).toBe(false);
    expect(res1.errors.some((e) => e.includes('execution COMPILE is incompatible'))).toBe(true);

    // DESCRIPTOR can only target RUNTIME_DESCRIPTOR or WORLD_DESCRIPTOR
    const badDesc = { ...validManifest, execution: 'DESCRIPTOR', stage: 'SHAPE_POST' };
    const res2 = validateAmpAbiManifest(badDesc);
    expect(res2.ok).toBe(false);
    expect(res2.errors.some((e) => e.includes('execution DESCRIPTOR is only permitted in RUNTIME_DESCRIPTOR or WORLD_DESCRIPTOR'))).toBe(true);
  });

  it('validates scopes, inputs, and parameters', () => {
    const badScope = { ...validManifest, scope: ['INVALID_SCOPE'] };
    expect(validateAmpAbiManifest(badScope).ok).toBe(false);

    const badInput = { ...validManifest, inputs: [{ name: '', type: 'SHAPE' }] };
    expect(validateAmpAbiManifest(badInput).ok).toBe(false);

    const badInputType = { ...validManifest, inputs: [{ name: 'in', type: 'NON_EXISTENT_TYPE' }] };
    expect(validateAmpAbiManifest(badInputType).ok).toBe(false);

    const badParam = { ...validManifest, parameters: [{ name: 'p', type: 'I32', min: 10, max: 2 }] };
    expect(validateAmpAbiManifest(badParam).ok).toBe(false);
  });

  it('validates cost models and determinism', () => {
    const badCost = { ...validManifest, cost: { model: 'EXPONENTIAL' } };
    expect(validateAmpAbiManifest(badCost).ok).toBe(false);

    const badDet = { ...validManifest, determinism: { class: 'CHAOTIC' } };
    expect(validateAmpAbiManifest(badDet).ok).toBe(false);
  });

  it('produces deterministic canonical JSON and 64-char hex checksum', () => {
    const json1 = canonicalAmpAbiJSON(validManifest);
    const sum1 = computeAmpAbiChecksum(validManifest);

    expect(typeof sum1).toBe('string');
    expect(sum1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(sum1)).toBe(true);

    // Extra non-ABI property should not affect canonical JSON or checksum
    const withExtra = { ...validManifest, extraNonAbiField: 'ignored_value' };
    const json2 = canonicalAmpAbiJSON(withExtra);
    const sum2 = computeAmpAbiChecksum(withExtra);

    expect(json1).toBe(json2);
    expect(sum1).toBe(sum2);

    // Semantic change must alter checksum
    const altered = { ...validManifest, order: 41 };
    const sum3 = computeAmpAbiChecksum(altered);
    expect(sum3).not.toBe(sum1);
  });
});
