/**
 * DETERMINISM PURITY ASSAY — Test Suite
 * PB-PURITY-ASSAY-v1
 *
 * Tests all five channels, composition, grading, determinism,
 * batch mode, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  SCHEMA,
  WEIGHTS,
  GRADE_PURE,
  GRADE_TRACE,
  GRADE_CONTAMINATED,
  GRADE_TOXIC,
  assay,
  assayBatch,
  scoreImmune,
  scoreDrift,
  scoreLaw,
  scoreReplay,
  scoreStructural,
} from '../../../../codex/core/pixelbrain/determinism-purity-assay.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const CLEAN_CODE = `
export function add(a, b) {
  return a + b;
}
`;

const DIRTY_CODE = `
const x = Math.random();
eval("console.log('hello')");
const y = new Date().getTime();
`;

const DETERMINISTIC_READINGS = Array.from({ length: 10 }, () => ({
  fingerprint: {
    semanticChecksum: 'sem:abc123',
    exactChecksum: 'exact:def456',
  },
  canonicalization: {},
}));

const DRIFTING_READINGS = [
  ...Array.from({ length: 7 }, () => ({
    fingerprint: { semanticChecksum: 'sem:abc123', exactChecksum: 'exact:def456' },
    canonicalization: {},
  })),
  ...Array.from({ length: 3 }, () => ({
    fingerprint: { semanticChecksum: 'sem:DIFFERENT', exactChecksum: 'exact:xyz789' },
    canonicalization: {},
  })),
];

// ─── Channel: Immune ───────────────────────────────────────────────────────

describe('scoreImmune', () => {
  it('returns 1.0 for clean code', () => {
    const result = scoreImmune(CLEAN_CODE, 'src/clean.js');
    expect(result.score).toBe(1.0);
    expect(result.violations).toHaveLength(0);
    expect(result.notTested).toBe(false);
  });

  it('penalizes code with innate violations', () => {
    const result = scoreImmune(DIRTY_CODE, 'src/dirty.js');
    expect(result.score).toBeLessThan(1.0);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.notTested).toBe(false);
  });

  it('is deterministic (same input → same output)', () => {
    const a = scoreImmune(DIRTY_CODE, 'src/dirty.js');
    const b = scoreImmune(DIRTY_CODE, 'src/dirty.js');
    expect(a.score).toBe(b.score);
    expect(a.violations).toEqual(b.violations);
  });
});

// ─── Channel: Drift ────────────────────────────────────────────────────────

describe('scoreDrift', () => {
  it('returns 1.0 and notTested for empty readings', () => {
    const result = scoreDrift([]);
    expect(result.score).toBe(1.0);
    expect(result.notTested).toBe(true);
  });

  it('returns 1.0 and notTested for null', () => {
    const result = scoreDrift(null);
    expect(result.score).toBe(1.0);
    expect(result.notTested).toBe(true);
  });

  it('returns 1.0 for perfectly stable readings', () => {
    const result = scoreDrift(DETERMINISTIC_READINGS);
    expect(result.score).toBe(1.0);
    expect(result.status).toBe('stable');
    expect(result.notTested).toBe(false);
  });

  it('detects drift in unstable readings', () => {
    const result = scoreDrift(DRIFTING_READINGS);
    expect(result.score).toBeLessThan(1.0);
    expect(result.score).toBeCloseTo(0.7, 1);
    expect(result.driftRate).toBeGreaterThan(0);
    expect(result.notTested).toBe(false);
  });
});

// ─── Channel: Law ──────────────────────────────────────────────────────────

describe('scoreLaw', () => {
  it('returns 1.0 and notTested for null', () => {
    const result = scoreLaw(null);
    expect(result.score).toBe(1.0);
    expect(result.notTested).toBe(true);
  });

  it('returns 1.0 for PASS grade', () => {
    const result = scoreLaw({ grade: 'PASS', violations: [] });
    expect(result.score).toBe(1.0);
    expect(result.grade).toBe('PASS');
    expect(result.notTested).toBe(false);
  });

  it('returns 0.70 for WARN grade', () => {
    const result = scoreLaw({ grade: 'WARN', violations: [{ rule: 'test' }] });
    expect(result.score).toBe(0.70);
    expect(result.notTested).toBe(false);
  });

  it('returns 0.20 for FAIL grade', () => {
    const result = scoreLaw({ grade: 'FAIL', violations: [{ rule: 'test' }] });
    expect(result.score).toBe(0.20);
  });

  it('returns 0.0 for FATAL grade', () => {
    const result = scoreLaw({ grade: 'FATAL', violations: [] });
    expect(result.score).toBe(0.0);
  });
});

// ─── Channel: Replay ───────────────────────────────────────────────────────

describe('scoreReplay', () => {
  it('returns 1.0 and notTested for null', () => {
    const result = scoreReplay(null);
    expect(result.score).toBe(1.0);
    expect(result.notTested).toBe(true);
  });

  it('returns 1.0 for passed verification', () => {
    const result = scoreReplay({ passed: true, iterations: 100, mismatches: 0 });
    expect(result.score).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(result.notTested).toBe(false);
  });

  it('penalizes failed verification proportionally', () => {
    const result = scoreReplay({ passed: false, iterations: 100, mismatches: 5 });
    expect(result.score).toBeCloseTo(0.95, 2);
    expect(result.passed).toBe(false);
  });

  it('returns 0.0 for total failure', () => {
    const result = scoreReplay({ passed: false, iterations: 100, mismatches: 100 });
    expect(result.score).toBe(0.0);
  });
});

// ─── Channel: Structural ───────────────────────────────────────────────────

describe('scoreStructural', () => {
  it('returns 1.0 and notTested for null', () => {
    const result = scoreStructural(null);
    expect(result.score).toBe(1.0);
    expect(result.notTested).toBe(true);
  });

  it('returns 1.0 for zero mutations', () => {
    const result = scoreStructural({ mutations: 0, anomalies: [] });
    expect(result.score).toBe(1.0);
    expect(result.notTested).toBe(false);
  });

  it('penalizes mutations at 0.15 each', () => {
    const result = scoreStructural({ mutations: 2, anomalies: [] });
    expect(result.score).toBeCloseTo(0.70, 2);
  });

  it('penalizes anomalies at 0.05 each', () => {
    const result = scoreStructural({ mutations: 0, anomalies: [{ type: 'x' }, { type: 'y' }] });
    expect(result.score).toBeCloseTo(0.90, 2);
  });

  it('clamps at 0.0 for extreme mutations', () => {
    const result = scoreStructural({ mutations: 20, anomalies: [] });
    expect(result.score).toBe(0.0);
  });
});

// ─── Full Assay ────────────────────────────────────────────────────────────

describe('assay', () => {
  it('throws on missing content', () => {
    expect(() => assay({ filePath: 'x.js' })).toThrow('content is required');
  });

  it('throws on missing filePath', () => {
    expect(() => assay({ content: 'x' })).toThrow('filePath is required');
  });

  it('returns PURE for clean code with all channels passing', () => {
    const result = assay({
      content: CLEAN_CODE,
      filePath: 'src/clean.js',
      readings: DETERMINISTIC_READINGS,
      lawResult: { grade: 'PASS', violations: [] },
      replayResult: { passed: true, iterations: 100, mismatches: 0 },
      structuralResult: { mutations: 0, anomalies: [] },
    });
    expect(result.grade).toBe(GRADE_PURE);
    expect(result.score).toBeGreaterThanOrEqual(0.90);
    expect(result.schema).toBe(SCHEMA);
    expect(result.checksum).toMatch(/^purity1:[0-9a-f]{16}$/);
    expect(result.notTested).toHaveLength(0);
  });

  it('returns TOXIC for dirty code with all channels failing', () => {
    // All readings diverge → drift score 0.0
    const allDiverge = Array.from({ length: 5 }, (_, i) => ({
      fingerprint: { semanticChecksum: `sem:v${i}`, exactChecksum: `exact:v${i}` },
      canonicalization: {},
    }));
    const result = assay({
      content: DIRTY_CODE,
      filePath: 'src/dirty.js',
      readings: allDiverge,
      lawResult: { grade: 'FATAL', violations: [{ rule: 'determinism' }] },
      replayResult: { passed: false, iterations: 100, mismatches: 100 },
      structuralResult: { mutations: 7, anomalies: [{ type: 'a' }, { type: 'b' }] },
    });
    expect(result.grade).toBe(GRADE_TOXIC);
    expect(result.score).toBeLessThan(0.40);
    expect(result.violationCount).toBeGreaterThan(0);
  });

  it('reports notTested channels correctly', () => {
    const result = assay({
      content: CLEAN_CODE,
      filePath: 'src/clean.js',
    });
    expect(result.notTested).toContain('drift');
    expect(result.notTested).toContain('law');
    expect(result.notTested).toContain('replay');
    expect(result.notTested).toContain('structural');
    expect(result.channels.immune.notTested).toBe(false);
  });

  it('is deterministic (100 iterations)', () => {
    const opts = {
      content: DIRTY_CODE,
      filePath: 'src/dirty.js',
      readings: DRIFTING_READINGS,
      lawResult: { grade: 'WARN', violations: [] },
      replayResult: { passed: true, iterations: 100, mismatches: 0 },
      structuralResult: { mutations: 1, anomalies: [] },
    };
    const first = assay(opts);
    for (let i = 0; i < 99; i++) {
      const again = assay(opts);
      expect(again.score).toBe(first.score);
      expect(again.grade).toBe(first.grade);
      expect(again.checksum).toBe(first.checksum);
    }
  });

  it('checksum changes when score changes', () => {
    const a = assay({ content: CLEAN_CODE, filePath: 'src/a.js' });
    const b = assay({ content: DIRTY_CODE, filePath: 'src/b.js' });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('result is frozen', () => {
    const result = assay({ content: CLEAN_CODE, filePath: 'src/x.js' });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

// ─── Batch Assay ───────────────────────────────────────────────────────────

describe('assayBatch', () => {
  it('returns empty for empty input', () => {
    const { results, summary } = assayBatch([]);
    expect(results).toHaveLength(0);
    expect(summary.count).toBe(0);
    expect(summary.meanScore).toBe(1.0);
  });

  it('sorts most toxic first', () => {
    const { results } = assayBatch([
      { content: CLEAN_CODE, filePath: 'src/clean.js' },
      { content: DIRTY_CODE, filePath: 'src/dirty.js' },
    ]);
    expect(results[0].score).toBeLessThanOrEqual(results[1].score);
  });

  it('computes summary correctly', () => {
    const { summary } = assayBatch([
      {
        content: CLEAN_CODE,
        filePath: 'src/clean.js',
        lawResult: { grade: 'PASS', violations: [] },
        replayResult: { passed: true, iterations: 100, mismatches: 0 },
        structuralResult: { mutations: 0, anomalies: [] },
      },
      {
        content: DIRTY_CODE,
        filePath: 'src/dirty.js',
        lawResult: { grade: 'FATAL', violations: [] },
        replayResult: { passed: false, iterations: 100, mismatches: 90 },
        structuralResult: { mutations: 4, anomalies: [] },
      },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.pure + summary.trace + summary.contaminated + summary.toxic).toBe(2);
    expect(summary.meanScore).toBeGreaterThan(0);
    expect(summary.meanScore).toBeLessThan(1);
  });
});

// ─── Weight invariant ──────────────────────────────────────────────────────

describe('WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});
