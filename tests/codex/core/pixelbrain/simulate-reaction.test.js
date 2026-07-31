/**
 * SIMULATION MODULE 1 — Reaction → Immune Pre-Flight — Test Suite
 * PB-SIM-REACTION-v1
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA,
  specFromReaction,
  simulateReaction,
} from '../../../../codex/core/pixelbrain/simulate-reaction.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const CLEAN_REACTION = {
  a: 'deterministic checksum sealed packet',
  b: 'immune scan innate protocol violations',
  product: 'unified purity assay grade channels',
  groundingA: 0.85,
  groundingB: 0.90,
};

const DIRTY_REACTION = {
  a: 'random stochastic unseeded arbitrary',
  b: 'vibes nondeterministic arbitrary',
  product: 'stochastic random unseeded nondeterministic',
  groundingA: 0.10,
  groundingB: 0.10,
};

const NEUTRAL_REACTION = {
  a: 'blender python bpy mesh shader',
  b: 'animation keyframe timeline interpolation',
  product: 'blender bridge animation pipeline',
  groundingA: 0.30,
  groundingB: 0.25,
};

// ─── specFromReaction ────────────────────────────────────────────────

describe('specFromReaction', () => {
  it('generates deterministic spec from reaction', () => {
    const spec1 = specFromReaction(CLEAN_REACTION);
    const spec2 = specFromReaction(CLEAN_REACTION);
    expect(spec1).toBe(spec2);
    expect(spec1.length).toBeGreaterThan(0);
  });

  it('includes reactant and product names', () => {
    const spec = specFromReaction(CLEAN_REACTION);
    expect(spec).toContain('Reactant A:');
    expect(spec).toContain('Reactant B:');
    expect(spec).toContain('Product:');
  });

  it('generates valid JS-like structure', () => {
    const spec = specFromReaction(CLEAN_REACTION);
    expect(spec).toContain('export function');
    expect(spec).toContain('export const SCHEMA');
    expect(spec).toContain('Object.freeze');
  });

  it('sanitizes names for JS identifiers', () => {
    const spec = specFromReaction({
      a: 'hello world! @#$%',
      b: 'foo-bar/baz.qux',
      product: 'test product 123',
    });
    expect(spec).toContain('export function');
    // Should not contain raw special chars in function names
    expect(spec).not.toContain('function !');
    expect(spec).not.toContain('function @');
  });

  it('handles empty-ish inputs gracefully', () => {
    const spec = specFromReaction({ a: '', b: '', product: '' });
    expect(spec).toContain('export function');
    expect(spec.length).toBeGreaterThan(0);
  });
});

// ─── simulateReaction ────────────────────────────────────────────────

describe('simulateReaction', () => {
  it('returns frozen result with correct schema', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(result.schema).toBe(SCHEMA);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('includes reaction scores', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(result.reaction.feasibility).toBeGreaterThan(0);
    expect(result.reaction.stability).toBeDefined();
    expect(result.reaction.bond).toBeDefined();
    expect(result.reaction.bondSign).toBeDefined();
    expect(result.reaction.bondMagnitude).toBeDefined();
    expect(result.reaction.grounding).toBeDefined();
    expect(result.reaction.coherence).toBeDefined();
    expect(result.reaction.lawNote).toBeDefined();
  });

  it('includes immune scan results', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(result.immune).toBeDefined();
    expect(typeof result.immune.innateViolations).toBe('number');
    expect(typeof result.immune.protocolViolations).toBe('number');
    expect(typeof result.immune.totalViolations).toBe('number');
    expect(typeof result.immune.passed).toBe('boolean');
    expect(Array.isArray(result.immune.violations)).toBe(true);
  });

  it('includes purity assay results', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(result.purity).toBeDefined();
    expect(typeof result.purity.score).toBe('number');
    expect(result.purity.score).toBeGreaterThanOrEqual(0);
    expect(result.purity.score).toBeLessThanOrEqual(1);
    expect(['PURE', 'TRACE', 'CONTAMINATED', 'TOXIC']).toContain(result.purity.grade);
  });

  it('produces a verdict', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(['PRE_FLIGHT_PASS', 'PRE_FLIGHT_FAIL', 'REJECTED_UNSTABLE']).toContain(result.verdict);
  });

  it('produces a SIMULATED label', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(result.label.tier).toBe('SIMULATED');
    expect(['CONFIRMED', 'REFUTED', 'CONTAMINATED']).toContain(result.label.outcome);
    expect(result.label.evidence.length).toBeGreaterThan(0);
  });

  it('carries a content-addressed checksum', () => {
    const result = simulateReaction(CLEAN_REACTION);
    expect(result.checksum).toMatch(/^simrxn1:[0-9a-f]{16}$/);
  });

  it('is deterministic (100-iteration replay)', () => {
    const results = Array.from({ length: 100 }, () => simulateReaction(CLEAN_REACTION));
    const checksums = new Set(results.map((r) => r.checksum));
    expect(checksums.size).toBe(1);
  });

  it('rejects law-violating reactions as UNSTABLE', () => {
    const result = simulateReaction(DIRTY_REACTION);
    expect(result.reaction.lawNote).toContain('LAW_VIOLATION');
    expect(result.verdict).toBe('REJECTED_UNSTABLE');
    expect(result.label.outcome).toBe('REFUTED');
  });

  it('handles neutral reactions', () => {
    const result = simulateReaction(NEUTRAL_REACTION);
    expect(result.reaction.lawNote).toBe('LAW_NEUTRAL');
    expect(['PRE_FLIGHT_PASS', 'PRE_FLIGHT_FAIL', 'REJECTED_UNSTABLE']).toContain(result.verdict);
  });

  it('throws on missing required fields', () => {
    expect(() => simulateReaction({})).toThrow('a, b, and product are required');
    expect(() => simulateReaction({ a: 'x' })).toThrow('a, b, and product are required');
    expect(() => simulateReaction({ a: 'x', b: 'y' })).toThrow('a, b, and product are required');
  });

  it('different reactions produce different checksums', () => {
    const r1 = simulateReaction(CLEAN_REACTION);
    const r2 = simulateReaction(NEUTRAL_REACTION);
    expect(r1.checksum).not.toBe(r2.checksum);
  });
});
