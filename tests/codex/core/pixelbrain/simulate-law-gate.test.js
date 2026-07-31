/**
 * SIMULATION MODULE 2 — Intent → Law Gate — Test Suite
 * PB-SIM-LAWGATE-v1
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA,
  intentToProduct,
  gateToLawResult,
  simulateLawGate,
} from '../../../../codex/core/pixelbrain/simulate-law-gate.js';
import { lawGate } from '../../../../codex/core/pixelbrain/concept-chemistry.js';

// ─── intentToProduct ─────────────────────────────────────────────────

describe('intentToProduct', () => {
  it('strips filler words', () => {
    const product = intentToProduct('I want to create a deterministic checksum verifier');
    expect(product).not.toContain('want');
    expect(product).not.toContain('create');
    expect(product).toContain('deterministic');
    expect(product).toContain('checksum');
    expect(product).toContain('verifier');
  });

  it('handles empty input', () => {
    const product = intentToProduct('');
    expect(product).toBe('unspecified change');
  });

  it('handles null input', () => {
    const product = intentToProduct(null);
    expect(product).toBe('unspecified change');
  });

  it('normalizes to lowercase', () => {
    const product = intentToProduct('Add DETERMINISM to the Pipeline');
    expect(product).toBe(product.toLowerCase());
  });

  it('preserves law-relevant keywords', () => {
    const product = intentToProduct('add random number generation');
    expect(product).toContain('random');
  });

  it('is deterministic', () => {
    const a = intentToProduct('build a sealed packet verifier');
    const b = intentToProduct('build a sealed packet verifier');
    expect(a).toBe(b);
  });
});

// ─── gateToLawResult ─────────────────────────────────────────────────

describe('gateToLawResult', () => {
  it('maps scale 0 to FATAL', () => {
    const result = gateToLawResult({ scale: 0, note: 'LAW_VIOLATION:random' });
    expect(result.grade).toBe('FATAL');
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('maps scale 1.0 to PASS', () => {
    const result = gateToLawResult({ scale: 1.0, note: 'LAW_ALIGNED' });
    expect(result.grade).toBe('PASS');
    expect(result.violations).toHaveLength(0);
  });

  it('maps scale 0.7 to WARN', () => {
    const result = gateToLawResult({ scale: 0.7, note: 'LAW_NEUTRAL' });
    expect(result.grade).toBe('WARN');
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

// ─── simulateLawGate ─────────────────────────────────────────────────

describe('simulateLawGate', () => {
  it('returns frozen result with correct schema', () => {
    const result = simulateLawGate({ intent: 'add deterministic checksum verification' });
    expect(result.schema).toBe(SCHEMA);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('detects LAW_ALIGNED intents', () => {
    const result = simulateLawGate({ intent: 'add deterministic checksum verification' });
    expect(result.verdict).toBe('LAW_ALIGNED');
    expect(result.gate.scale).toBe(1.0);
    expect(result.lawChannel.grade).toBe('PASS');
    expect(result.lawChannel.score).toBe(1.0);
  });

  it('detects LAW_VIOLATION intents', () => {
    const result = simulateLawGate({ intent: 'add random stochastic unseeded number generation' });
    expect(result.verdict).toBe('LAW_VIOLATION');
    expect(result.gate.scale).toBe(0);
    expect(result.lawChannel.grade).toBe('FATAL');
    expect(result.lawChannel.score).toBe(0);
  });

  it('detects LAW_NEUTRAL intents', () => {
    const result = simulateLawGate({ intent: 'refactor the blender mesh pipeline' });
    expect(result.verdict).toBe('LAW_NEUTRAL');
    expect(result.gate.scale).toBe(0.7);
    expect(result.lawChannel.grade).toBe('WARN');
  });

  it('produces a SIMULATED label', () => {
    const result = simulateLawGate({ intent: 'add deterministic checksum verification' });
    expect(result.label.tier).toBe('SIMULATED');
    expect(['CONFIRMED', 'REFUTED', 'METASTABLE']).toContain(result.label.outcome);
    expect(result.label.evidence.length).toBeGreaterThan(0);
  });

  it('carries a content-addressed checksum', () => {
    const result = simulateLawGate({ intent: 'add deterministic checksum verification' });
    expect(result.checksum).toMatch(/^simlaw1:[0-9a-f]{16}$/);
  });

  it('is deterministic (100-iteration replay)', () => {
    const intent = 'add deterministic checksum verification';
    const results = Array.from({ length: 100 }, () => simulateLawGate({ intent }));
    const checksums = new Set(results.map((r) => r.checksum));
    expect(checksums.size).toBe(1);
  });

  it('throws on empty intent', () => {
    expect(() => simulateLawGate({ intent: '' })).toThrow('intent is required');
    expect(() => simulateLawGate({ intent: '   ' })).toThrow('intent is required');
    expect(() => simulateLawGate({})).toThrow('intent is required');
  });

  it('different intents produce different checksums', () => {
    const r1 = simulateLawGate({ intent: 'add deterministic checksum' });
    const r2 = simulateLawGate({ intent: 'add random stochastic generation' });
    expect(r1.checksum).not.toBe(r2.checksum);
  });

  it('includes the extracted product concept', () => {
    const result = simulateLawGate({ intent: 'I want to build a sealed packet verifier' });
    expect(result.product).toContain('sealed');
    expect(result.product).toContain('packet');
    expect(result.product).toContain('verifier');
  });
});
