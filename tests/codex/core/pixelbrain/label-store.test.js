/**
 * SIMULATION MODULE 5 — Label Store — Test Suite
 * PB-SIM-LABELSTORE-v1
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA,
  createLabelStore,
  toHarnessLabels,
  scoreAccuracy,
} from '../../../../codex/core/pixelbrain/label-store.js';
import { synthesize } from '../../../../codex/core/pixelbrain/concept-chemistry.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const LABEL_A = {
  tier: 'PHYSICAL',
  reaction: {
    a: 'determinism purity measurement code chunk',
    b: 'immune scan drift detection law audit replay verification',
    product: 'unified determinism purity score grade violations channels',
  },
  outcome: 'CONFIRMED',
  evidence: '33/33 tests passed, 0 regressions',
  source: 'determinism-purity-assay.js',
};

const LABEL_B = {
  tier: 'SIMULATED',
  reaction: {
    a: 'blender python bpy mesh shader',
    b: 'sealed packet checksum deterministic',
    product: 'blender bridge deterministic render',
  },
  outcome: 'METASTABLE',
  evidence: 'RAID triage: NOVEL, immune pre-flight: 0 violations',
  source: 'simulate-reaction.js',
};

const LABEL_C = {
  tier: 'SIMULATED',
  reaction: {
    a: 'random stochastic unseeded',
    b: 'nondeterministic arbitrary vibes',
    product: 'stochastic random unseeded nondeterministic',
  },
  outcome: 'REFUTED',
  evidence: 'law gate: LAW_VIOLATION, feasibility 0.000',
  source: 'simulate-law-gate.js',
};

// ─── createLabelStore ────────────────────────────────────────────────

describe('createLabelStore', () => {
  it('creates a frozen store with correct schema', () => {
    const store = createLabelStore();
    expect(store.schema).toBe(SCHEMA);
    expect(Object.isFrozen(store)).toBe(true);
  });

  it('starts empty', () => {
    const store = createLabelStore();
    expect(store.size).toBe(0);
    expect(store.all()).toHaveLength(0);
  });
});

// ─── append ──────────────────────────────────────────────────────────

describe('store.append', () => {
  it('appends a label and returns it frozen', () => {
    const store = createLabelStore();
    const label = store.append(LABEL_A);
    expect(Object.isFrozen(label)).toBe(true);
    expect(label.id).toBe('LBL-001');
    expect(label.tier).toBe('PHYSICAL');
    expect(label.outcome).toBe('CONFIRMED');
    expect(label.seq).toBe(1);
  });

  it('assigns sequential IDs', () => {
    const store = createLabelStore();
    const l1 = store.append(LABEL_A);
    const l2 = store.append(LABEL_B);
    const l3 = store.append(LABEL_C);
    expect(l1.id).toBe('LBL-001');
    expect(l2.id).toBe('LBL-002');
    expect(l3.id).toBe('LBL-003');
  });

  it('computes a content-addressed checksum', () => {
    const store = createLabelStore();
    const label = store.append(LABEL_A);
    expect(label.checksum).toMatch(/^lbl1:[0-9a-f]{16}$/);
  });

  it('same content produces same checksum', () => {
    const store1 = createLabelStore();
    const store2 = createLabelStore();
    const l1 = store1.append(LABEL_A);
    const l2 = store2.append(LABEL_A);
    expect(l1.checksum).toBe(l2.checksum);
  });

  it('different content produces different checksums', () => {
    const store = createLabelStore();
    const l1 = store.append(LABEL_A);
    const l2 = store.append(LABEL_B);
    expect(l1.checksum).not.toBe(l2.checksum);
  });

  it('freezes the reaction object', () => {
    const store = createLabelStore();
    const label = store.append(LABEL_A);
    expect(Object.isFrozen(label.reaction)).toBe(true);
  });

  it('throws on invalid tier', () => {
    const store = createLabelStore();
    expect(() => store.append({ ...LABEL_A, tier: 'INVALID' })).toThrow('tier must be SIMULATED or PHYSICAL');
  });

  it('throws on missing reaction', () => {
    const store = createLabelStore();
    expect(() => store.append({ tier: 'PHYSICAL', outcome: 'CONFIRMED' })).toThrow('reaction must be an object');
  });

  it('throws on missing outcome', () => {
    const store = createLabelStore();
    expect(() => store.append({ tier: 'PHYSICAL', reaction: LABEL_A.reaction })).toThrow('outcome is required');
  });

  it('throws on null entry', () => {
    const store = createLabelStore();
    expect(() => store.append(null)).toThrow('entry must be an object');
  });
});

// ─── Query methods ───────────────────────────────────────────────────

describe('store queries', () => {
  it('all() returns frozen copy', () => {
    const store = createLabelStore();
    store.append(LABEL_A);
    store.append(LABEL_B);
    const all = store.all();
    expect(Object.isFrozen(all)).toBe(true);
    expect(all).toHaveLength(2);
  });

  it('byTier filters correctly', () => {
    const store = createLabelStore();
    store.append(LABEL_A); // PHYSICAL
    store.append(LABEL_B); // SIMULATED
    store.append(LABEL_C); // SIMULATED

    expect(store.byTier('PHYSICAL')).toHaveLength(1);
    expect(store.byTier('SIMULATED')).toHaveLength(2);
  });

  it('byOutcome filters correctly', () => {
    const store = createLabelStore();
    store.append(LABEL_A); // CONFIRMED
    store.append(LABEL_B); // METASTABLE
    store.append(LABEL_C); // REFUTED

    expect(store.byOutcome('CONFIRMED')).toHaveLength(1);
    expect(store.byOutcome('REFUTED')).toHaveLength(1);
    expect(store.byOutcome('METASTABLE')).toHaveLength(1);
    expect(store.byOutcome('NOVEL')).toHaveLength(0);
  });

  it('counts() returns correct breakdown', () => {
    const store = createLabelStore();
    store.append(LABEL_A); // PHYSICAL
    store.append(LABEL_B); // SIMULATED
    store.append(LABEL_C); // SIMULATED

    const counts = store.counts();
    expect(counts.physical).toBe(1);
    expect(counts.simulated).toBe(2);
    expect(counts.total).toBe(3);
  });
});

// ─── Store checksum ──────────────────────────────────────────────────

describe('store checksum', () => {
  it('returns a content-addressed checksum', () => {
    const store = createLabelStore();
    store.append(LABEL_A);
    expect(store.checksum()).toMatch(/^store1:[0-9a-f]{16}$/);
  });

  it('changes when labels are added', () => {
    const store = createLabelStore();
    store.append(LABEL_A);
    const cs1 = store.checksum();
    store.append(LABEL_B);
    const cs2 = store.checksum();
    expect(cs1).not.toBe(cs2);
  });

  it('same labels in same order produce same checksum', () => {
    const store1 = createLabelStore();
    store1.append(LABEL_A);
    store1.append(LABEL_B);

    const store2 = createLabelStore();
    store2.append(LABEL_A);
    store2.append(LABEL_B);

    expect(store1.checksum()).toBe(store2.checksum());
  });

  it('different order produces different checksum', () => {
    const store1 = createLabelStore();
    store1.append(LABEL_A);
    store1.append(LABEL_B);

    const store2 = createLabelStore();
    store2.append(LABEL_B);
    store2.append(LABEL_A);

    expect(store1.checksum()).not.toBe(store2.checksum());
  });

  it('is deterministic (100-iteration replay)', () => {
    const checksums = new Set();
    for (let i = 0; i < 100; i++) {
      const store = createLabelStore();
      store.append(LABEL_A);
      store.append(LABEL_B);
      store.append(LABEL_C);
      checksums.add(store.checksum());
    }
    expect(checksums.size).toBe(1);
  });
});

// ─── toHarnessLabels ─────────────────────────────────────────────────

describe('toHarnessLabels', () => {
  it('converts store labels to harness format', () => {
    const store = createLabelStore();
    store.append(LABEL_A);
    store.append(LABEL_B);

    const harness = toHarnessLabels(store);
    expect(harness).toHaveLength(2);
    expect(harness[0]).toHaveProperty('id');
    expect(harness[0]).toHaveProperty('a');
    expect(harness[0]).toHaveProperty('b');
    expect(harness[0]).toHaveProperty('product');
    expect(harness[0]).toHaveProperty('outcome');
    expect(harness[0]).toHaveProperty('tier');
    expect(harness[0]).toHaveProperty('checksum');
  });

  it('preserves reaction fields', () => {
    const store = createLabelStore();
    store.append(LABEL_A);

    const harness = toHarnessLabels(store);
    expect(harness[0].a).toBe(LABEL_A.reaction.a);
    expect(harness[0].b).toBe(LABEL_A.reaction.b);
    expect(harness[0].product).toBe(LABEL_A.reaction.product);
  });
});

// ─── scoreAccuracy ───────────────────────────────────────────────────

describe('scoreAccuracy', () => {
  it('scores prediction accuracy against labels', () => {
    const store = createLabelStore();
    store.append(LABEL_A); // CONFIRMED (should be STABLE)
    store.append(LABEL_C); // REFUTED (should not be STABLE)

    const accuracy = scoreAccuracy(store, synthesize);
    expect(accuracy.total).toBe(2);
    expect(typeof accuracy.correct).toBe('number');
    expect(typeof accuracy.accuracy).toBe('number');
    expect(accuracy.accuracy).toBeGreaterThanOrEqual(0);
    expect(accuracy.accuracy).toBeLessThanOrEqual(1);
    expect(Array.isArray(accuracy.mismatches)).toBe(true);
  });

  it('returns 0 accuracy for empty store', () => {
    const store = createLabelStore();
    const accuracy = scoreAccuracy(store, synthesize);
    expect(accuracy.total).toBe(0);
    expect(accuracy.accuracy).toBe(0);
  });

  it('mismatches include details', () => {
    const store = createLabelStore();
    // Add a label that might mismatch
    store.append({
      tier: 'PHYSICAL',
      reaction: {
        a: 'quantum entanglement',
        b: 'interdimensional portal',
        product: 'quantum portal network',
      },
      outcome: 'CONFIRMED',
      evidence: 'hypothetical',
      source: 'test',
    });

    const accuracy = scoreAccuracy(store, synthesize);
    if (accuracy.mismatches.length > 0) {
      expect(accuracy.mismatches[0]).toHaveProperty('id');
      expect(accuracy.mismatches[0]).toHaveProperty('outcome');
      expect(accuracy.mismatches[0]).toHaveProperty('predicted');
      expect(accuracy.mismatches[0]).toHaveProperty('feasibility');
    }
  });
});
