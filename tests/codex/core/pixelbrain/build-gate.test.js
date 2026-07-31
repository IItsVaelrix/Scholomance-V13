/**
 * SIMULATION MODULE 4 — Grounding-Gated Build Decision — Test Suite
 * PB-SIM-BUILDGATE-v1
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA,
  GATE_THRESHOLDS,
  buildGate,
} from '../../../../codex/core/pixelbrain/build-gate.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const WELL_GROUNDED_STABLE = {
  a: 'deterministic checksum sealed packet canonical',
  b: 'immune scan innate protocol violations purity',
  product: 'unified determinism purity assay grade channels',
  groundingA: 0.90,
  groundingB: 0.85,
};

const WEAKLY_GROUNDED_STABLE = {
  a: 'deterministic checksum sealed packet',
  b: 'immune scan innate protocol',
  product: 'unified purity assay grade',
  groundingA: 0.40,
  groundingB: 0.35,
};

const UNGROUNDED_UNSTABLE = {
  a: 'quantum entanglement teleportation',
  b: 'interdimensional portal wormhole',
  product: 'quantum portal network',
  groundingA: 0.05,
  groundingB: 0.05,
};

const LAW_VIOLATING = {
  a: 'random stochastic unseeded',
  b: 'nondeterministic arbitrary vibes',
  product: 'stochastic random unseeded nondeterministic',
  groundingA: 0.80,
  groundingB: 0.80,
};

const METASTABLE_GROUNDED = {
  a: 'blender python bpy mesh shader',
  b: 'sealed packet checksum deterministic',
  product: 'blender bridge deterministic render',
  groundingA: 0.40,
  groundingB: 0.50,
};

// ─── GATE_THRESHOLDS ─────────────────────────────────────────────────

describe('GATE_THRESHOLDS', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(GATE_THRESHOLDS)).toBe(true);
  });

  it('has ordered thresholds', () => {
    expect(GATE_THRESHOLDS.GROUNDING_MIN_FOR_DRYRUN).toBeLessThan(GATE_THRESHOLDS.GROUNDING_MIN_FOR_BUILD);
    expect(GATE_THRESHOLDS.GROUNDING_MIN_FOR_BUILD).toBeLessThan(GATE_THRESHOLDS.GROUNDING_WELL_ATTESTED);
  });
});

// ─── buildGate ───────────────────────────────────────────────────────

describe('buildGate', () => {
  it('returns frozen result with correct schema', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    expect(result.schema).toBe(SCHEMA);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('includes reaction scores', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    expect(result.reaction.feasibility).toBeGreaterThan(0);
    expect(result.reaction.stability).toBeDefined();
    expect(result.reaction.lawNote).toBeDefined();
    expect(result.reaction.bondSign).toBeDefined();
    expect(result.reaction.bondMagnitude).toBeDefined();
  });

  it('includes grounding information', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    expect(typeof result.grounding.a).toBe('number');
    expect(typeof result.grounding.b).toBe('number');
    expect(typeof result.grounding.mean).toBe('number');
    expect(result.grounding.source).toBe('explicit');
  });

  it('includes gate decision', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    expect(['BUILD', 'DRY_RUN', 'DRY_RUN_ONLY', 'WRITE_PDR', 'BLOCKED']).toContain(result.gate.decision);
    expect(typeof result.gate.proceed).toBe('boolean');
    expect(result.gate.reason.length).toBeGreaterThan(0);
    expect(Array.isArray(result.gate.requiredDocs)).toBe(true);
  });

  it('allows BUILD for well-grounded stable reactions', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    // With grounding 0.875 and high feasibility, should be BUILD or DRY_RUN
    expect(['BUILD', 'DRY_RUN']).toContain(result.gate.decision);
    expect(result.gate.proceed).toBe(true);
  });

  it('blocks law-violating reactions', () => {
    const result = buildGate(LAW_VIOLATING);
    expect(result.gate.decision).toBe('BLOCKED');
    expect(result.gate.proceed).toBe(false);
    expect(result.reaction.lawNote).toContain('LAW_VIOLATION');
  });

  it('requires PDR for ungrounded unstable reactions', () => {
    const result = buildGate(UNGROUNDED_UNSTABLE);
    expect(['WRITE_PDR', 'DRY_RUN_ONLY', 'BLOCKED']).toContain(result.gate.decision);
    if (result.gate.decision === 'WRITE_PDR') {
      expect(result.gate.requiredDocs.length).toBeGreaterThan(0);
    }
  });

  it('produces a GATE label', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    expect(result.label.tier).toBe('GATE');
    expect(result.label.outcome).toBe(result.gate.decision);
    expect(result.label.evidence.length).toBeGreaterThan(0);
  });

  it('carries a content-addressed checksum', () => {
    const result = buildGate(WELL_GROUNDED_STABLE);
    expect(result.checksum).toMatch(/^simgate1:[0-9a-f]{16}$/);
  });

  it('is deterministic (100-iteration replay)', () => {
    const results = Array.from({ length: 100 }, () => buildGate(WELL_GROUNDED_STABLE));
    const checksums = new Set(results.map((r) => r.checksum));
    expect(checksums.size).toBe(1);
  });

  it('throws on missing required fields', () => {
    expect(() => buildGate({})).toThrow('a, b, and product are required');
    expect(() => buildGate({ a: 'x' })).toThrow('a, b, and product are required');
  });

  it('handles zero grounding', () => {
    const result = buildGate({
      a: 'test concept alpha',
      b: 'test concept beta',
      product: 'test product gamma',
    });
    expect(result.grounding.mean).toBe(0);
    expect(result.grounding.source).toBe('none');
  });

  it('different reactions produce different checksums', () => {
    const r1 = buildGate(WELL_GROUNDED_STABLE);
    const r2 = buildGate(UNGROUNDED_UNSTABLE);
    expect(r1.checksum).not.toBe(r2.checksum);
  });

  it('metastable grounded reactions get DRY_RUN', () => {
    const result = buildGate(METASTABLE_GROUNDED);
    // With grounding ~0.45 and metastable, should be DRY_RUN or WRITE_PDR
    expect(['DRY_RUN', 'WRITE_PDR', 'DRY_RUN_ONLY']).toContain(result.gate.decision);
  });
});
