/**
 * Temporal Layer — comprehensive test suite.
 *
 * Covers:
 *   1. Schema: gene creation, validation, checksum stability
 *   2. Interpolation Engine: all 5 algorithms, state flatten/unflatten
 *   3. Governor: certification, replay verification, drift diagnosis
 *   4. Compiler: end-to-end compilation, frame replay
 *   5. Aspects: loop, ping-pong, hold, one-shot
 *   6. Energy bindings: temporal energy evaluation
 *   7. Wire format: Blender bridge output
 *   8. Determinism: 100-iteration replay on all paths
 *
 * Architecture under test:
 *   Gene (curated) → Engine (interpolates) → Governor (certifies) → Compiler (emits)
 *   BytecodeHealth governs but NEVER interpolates.
 */

import { describe, it, expect } from 'vitest';

import {
  TEMPORAL_CONTRACT,
  TEMPORAL_VERSION,
  INTERPOLATION_ALGORITHMS,
  TEMPORAL_ASPECTS,
  PROJECTION_MODES,
  validateTemporalSpec,
  computeTemporalChecksum,
  createTemporalGene,
  flattenState,
  unflattenState,
} from '../../../../../codex/core/pixelbrain/temporal/temporal-schema.js';

import {
  INTERPOLATION_ENGINE_VERSION,
  lerpScalar,
  hermiteScalar,
  bezierScalar,
  stepScalar,
  smoothstepScalar,
  interpolateFlat,
  interpolateState,
  evaluateTemporal,
  evaluateEnergyBindings,
  generateFrames,
} from '../../../../../codex/core/pixelbrain/temporal/interpolation-engine.js';

import {
  TEMPORAL_GOVERNOR_VERSION,
  TEMPORAL_HEALTH_CODES,
  computeProjectionChecksum,
  certifyGene,
  certifyInterpolation,
  verifyReplay,
  diagnoseDrift,
  certifySequence,
  createApprovalRecord,
} from '../../../../../codex/core/pixelbrain/temporal/temporal-governor.js';

import {
  TEMPORAL_COMPILED_CONTRACT,
  TEMPORAL_COMPILER_VERSION,
  compileTemporal,
  replayFrame,
  extractVRIInput,
  formatForWire,
} from '../../../../../codex/core/pixelbrain/temporal/temporal-compiler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A simple two-keyframe temporal gene: a part moves from left to right.
 */
function simpleGeneSpec() {
  return {
    contract: TEMPORAL_CONTRACT,
    id: 'test-slide',
    assetId: 'test-asset',
    algorithm: 'linear-v1',
    aspect: 'one-shot',
    projectionMode: 'derived',
    canvas: { width: 24, height: 20 },
    keyframes: [
      {
        time: 0,
        label: 'start',
        state: {
          body: {
            spine: [[2, 10], [12, 10]],
            namedPoints: { center: [7, 10] },
          },
        },
      },
      {
        time: 1,
        label: 'end',
        state: {
          body: {
            spine: [[12, 10], [22, 10]],
            namedPoints: { center: [17, 10] },
          },
        },
      },
    ],
    energyBindings: [
      {
        energyType: 'PHOTONIC',
        from: 0.2,
        to: 1.0,
        startTime: 0,
        endTime: 1,
      },
    ],
  };
}

/**
 * A three-keyframe gene with hermite interpolation.
 */
function threeKeyframeGeneSpec() {
  return {
    contract: TEMPORAL_CONTRACT,
    id: 'test-arc',
    assetId: 'test-asset',
    algorithm: 'hermite-v1',
    aspect: 'one-shot',
    projectionMode: 'derived',
    canvas: { width: 24, height: 20 },
    keyframes: [
      {
        time: 0,
        state: {
          orb: {
            spine: [[4, 16]],
            namedPoints: { center: [4, 16] },
          },
        },
      },
      {
        time: 0.5,
        state: {
          orb: {
            spine: [[12, 4]],
            namedPoints: { center: [12, 4] },
          },
        },
      },
      {
        time: 1,
        state: {
          orb: {
            spine: [[20, 16]],
            namedPoints: { center: [20, 16] },
          },
        },
      },
    ],
  };
}

// ─── Phase 1: Schema ─────────────────────────────────────────────────────────

describe('Temporal Schema', () => {
  it('creates a valid temporal gene', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    expect(gene.contract).toBe(TEMPORAL_CONTRACT);
    expect(gene.version).toBe(TEMPORAL_VERSION);
    expect(gene.id).toBe('test-slide');
    expect(gene.algorithm).toBe('linear-v1');
    expect(gene.keyframes).toHaveLength(2);
    expect(gene.checksum).toMatch(/^sha256-canonical-v1:/);
  });

  it('gene is frozen', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    expect(Object.isFrozen(gene)).toBe(true);
    expect(() => { gene.id = 'mutated'; }).toThrow();
  });

  it('checksum is stable across identical inputs', () => {
    const gene1 = createTemporalGene(simpleGeneSpec());
    const gene2 = createTemporalGene(simpleGeneSpec());
    expect(gene1.checksum).toBe(gene2.checksum);
  });

  it('checksum changes when keyframe state changes', () => {
    const spec1 = simpleGeneSpec();
    const spec2 = simpleGeneSpec();
    spec2.keyframes[1].state.body.spine[0] = [13, 10]; // different
    const gene1 = createTemporalGene(spec1);
    const gene2 = createTemporalGene(spec2);
    expect(gene1.checksum).not.toBe(gene2.checksum);
  });

  it('rejects invalid contract', () => {
    const spec = simpleGeneSpec();
    spec.contract = 'WRONG';
    expect(() => createTemporalGene(spec)).toThrow(/contract/);
  });

  it('rejects fewer than 2 keyframes', () => {
    const spec = simpleGeneSpec();
    spec.keyframes = [spec.keyframes[0]];
    expect(() => createTemporalGene(spec)).toThrow(/keyframes/);
  });

  it('rejects non-monotonic keyframe times', () => {
    const spec = simpleGeneSpec();
    spec.keyframes[1].time = 0; // same as first
    expect(() => createTemporalGene(spec)).toThrow(/time/);
  });

  it('rejects unknown algorithm', () => {
    const spec = simpleGeneSpec();
    spec.algorithm = 'quantum-v99';
    expect(() => createTemporalGene(spec)).toThrow(/algorithm/);
  });

  it('validateTemporalSpec returns issues without throwing', () => {
    const result = validateTemporalSpec({ contract: 'WRONG', id: '', keyframes: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('all 5 algorithms are in the registry', () => {
    expect(Object.keys(INTERPOLATION_ALGORITHMS)).toHaveLength(5);
    expect(INTERPOLATION_ALGORITHMS['linear-v1']).toBeDefined();
    expect(INTERPOLATION_ALGORITHMS['hermite-v1']).toBeDefined();
    expect(INTERPOLATION_ALGORITHMS['bezier-v1']).toBeDefined();
    expect(INTERPOLATION_ALGORITHMS['step-v1']).toBeDefined();
    expect(INTERPOLATION_ALGORITHMS['smoothstep-v1']).toBeDefined();
  });

  it('all 4 aspects are defined', () => {
    expect(Object.keys(TEMPORAL_ASPECTS)).toHaveLength(4);
  });

  it('all 3 projection modes are defined', () => {
    expect(Object.keys(PROJECTION_MODES)).toHaveLength(3);
  });
});

// ─── Phase 2: Interpolation Engine ──────────────────────────────────────────

describe('Interpolation Engine', () => {
  describe('scalar functions', () => {
    it('lerp: t=0 → a, t=1 → b, t=0.5 → midpoint', () => {
      expect(lerpScalar(0, 10, 0)).toBe(0);
      expect(lerpScalar(0, 10, 1)).toBe(10);
      expect(lerpScalar(0, 10, 0.5)).toBe(5);
    });

    it('hermite: t=0 → a, t=1 → b, smooth at endpoints', () => {
      expect(hermiteScalar(0, 10, 0)).toBe(0);
      expect(hermiteScalar(0, 10, 1)).toBe(10);
      // Hermite at t=0.5 should equal midpoint for symmetric case
      expect(hermiteScalar(0, 10, 0.5)).toBe(5);
    });

    it('bezier: t=0 → a, t=1 → b', () => {
      expect(bezierScalar(0, 10, 0)).toBe(0);
      expect(bezierScalar(0, 10, 1)).toBe(10);
    });

    it('step: holds a until t=1', () => {
      expect(stepScalar(0, 10, 0)).toBe(0);
      expect(stepScalar(0, 10, 0.5)).toBe(0);
      expect(stepScalar(0, 10, 0.99)).toBe(0);
      expect(stepScalar(0, 10, 1)).toBe(10);
    });

    it('smoothstep: t=0 → a, t=1 → b, eased midpoint', () => {
      expect(smoothstepScalar(0, 10, 0)).toBe(0);
      expect(smoothstepScalar(0, 10, 1)).toBe(10);
      expect(smoothstepScalar(0, 10, 0.5)).toBe(5);
    });
  });

  describe('interpolateFlat', () => {
    it('interpolates arrays element-wise', () => {
      const a = [0, 0, 10, 10];
      const b = [10, 10, 20, 20];
      const result = interpolateFlat(a, b, 'linear-v1', 0.5);
      expect(result).toEqual([5, 5, 15, 15]);
    });

    it('rejects dimension mismatch', () => {
      expect(() => interpolateFlat([1, 2], [1, 2, 3], 'linear-v1', 0.5))
        .toThrow(/dimension mismatch/i);
    });

    it('rejects unknown algorithm', () => {
      expect(() => interpolateFlat([1], [2], 'unknown-v1', 0.5))
        .toThrow(/unknown interpolation/i);
    });

    it('clamps t to [0, 1]', () => {
      const result = interpolateFlat([0], [10], 'linear-v1', 1.5);
      expect(result[0]).toBe(10);
      const result2 = interpolateFlat([0], [10], 'linear-v1', -0.5);
      expect(result2[0]).toBe(0);
    });
  });

  describe('interpolateState', () => {
    it('interpolates construction states', () => {
      const stateA = { body: { spine: [[0, 0], [10, 0]], namedPoints: { c: [5, 0] } } };
      const stateB = { body: { spine: [[10, 0], [20, 0]], namedPoints: { c: [15, 0] } } };
      const result = interpolateState(stateA, stateB, 'linear-v1', 0.5);
      expect(result.body.spine[0]).toEqual([5, 0]);
      expect(result.body.spine[1]).toEqual([15, 0]);
      expect(result.body.namedPoints.c).toEqual([10, 0]);
    });
  });

  describe('evaluateTemporal', () => {
    it('evaluates at t=0 → first keyframe state', () => {
      const gene = createTemporalGene(simpleGeneSpec());
      const { state, localT } = evaluateTemporal(gene, 0);
      expect(localT).toBe(0);
      expect(state.body.spine[0]).toEqual([2, 10]);
    });

    it('evaluates at t=1 → last keyframe state', () => {
      const gene = createTemporalGene(simpleGeneSpec());
      const { state, localT } = evaluateTemporal(gene, 1);
      expect(localT).toBe(1);
      expect(state.body.spine[0]).toEqual([12, 10]);
    });

    it('evaluates at t=0.5 → midpoint', () => {
      const gene = createTemporalGene(simpleGeneSpec());
      const { state, localT } = evaluateTemporal(gene, 0.5);
      expect(localT).toBe(0.5);
      expect(state.body.spine[0]).toEqual([7, 10]);
    });

    it('finds correct bracket for 3-keyframe gene', () => {
      const gene = createTemporalGene(threeKeyframeGeneSpec());
      const { bracket } = evaluateTemporal(gene, 0.25);
      expect(bracket.from).toBe(0);
      expect(bracket.to).toBe(0.5);
    });
  });

  describe('generateFrames', () => {
    it('generates the requested number of frames', () => {
      const gene = createTemporalGene(simpleGeneSpec());
      const frames = generateFrames(gene, 10);
      expect(frames).toHaveLength(10);
      expect(frames[0].frame).toBe(0);
      expect(frames[9].frame).toBe(9);
    });

    it('first frame matches first keyframe', () => {
      const gene = createTemporalGene(simpleGeneSpec());
      const frames = generateFrames(gene, 5);
      expect(frames[0].state.body.spine[0]).toEqual([2, 10]);
    });

    it('last frame matches last keyframe', () => {
      const gene = createTemporalGene(simpleGeneSpec());
      const frames = generateFrames(gene, 5);
      expect(frames[4].state.body.spine[0]).toEqual([12, 10]);
    });
  });
});

// ─── Phase 3: Governor ───────────────────────────────────────────────────────

describe('Temporal Governor', () => {
  it('certifies a valid gene', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const cert = certifyGene(gene);
    expect(cert.certified).toBe(true);
    expect(cert.issues).toHaveLength(0);
    expect(cert.code).toBe(TEMPORAL_HEALTH_CODES.KEYFRAME_CURATED);
    expect(cert.geneChecksum).toBe(gene.checksum);
  });

  it('rejects a gene with mismatched checksum', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const tampered = { ...gene, checksum: 'sha256-canonical-v1:DEADBEEF' };
    const cert = certifyGene(tampered);
    expect(cert.certified).toBe(false);
    expect(cert.issues.some(i => i.includes('checksum'))).toBe(true);
  });

  it('certifies an interpolation result', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const result = evaluateTemporal(gene, 0.5);
    const energy = evaluateEnergyBindings(gene, 0.5);
    const cert = certifyInterpolation(gene, 0.5, result, energy);
    expect(cert.certified).toBe(true);
    expect(cert.deterministic).toBe(true);
    expect(cert.projectionChecksum).toMatch(/^sha256-canonical-v1:/);
    expect(cert.code).toBe(TEMPORAL_HEALTH_CODES.INTERPOLATION_CERTIFIED);
  });

  it('projection checksum is stable for same inputs', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const result = evaluateTemporal(gene, 0.5);
    const energy = evaluateEnergyBindings(gene, 0.5);
    const cert1 = certifyInterpolation(gene, 0.5, result, energy);
    const cert2 = certifyInterpolation(gene, 0.5, result, energy);
    expect(cert1.projectionChecksum).toBe(cert2.projectionChecksum);
  });

  it('projection checksum changes with different time', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const r1 = evaluateTemporal(gene, 0.3);
    const r2 = evaluateTemporal(gene, 0.7);
    const c1 = certifyInterpolation(gene, 0.3, r1, {});
    const c2 = certifyInterpolation(gene, 0.7, r2, {});
    expect(c1.projectionChecksum).not.toBe(c2.projectionChecksum);
  });

  it('verifyReplay succeeds for matching checksum', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const result = evaluateTemporal(gene, 0.5);
    const energy = evaluateEnergyBindings(gene, 0.5);
    const cert = certifyInterpolation(gene, 0.5, result, energy);

    const replay = verifyReplay(gene, 0.5, cert.projectionChecksum);
    expect(replay.verified).toBe(true);
    expect(replay.code).toBe(TEMPORAL_HEALTH_CODES.REPLAY_VERIFIED);
  });

  it('verifyReplay detects drift for wrong checksum', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const replay = verifyReplay(gene, 0.5, 'sha256-canonical-v1:WRONG');
    expect(replay.verified).toBe(false);
    expect(replay.code).toBe(TEMPORAL_HEALTH_CODES.DRIFT_DETECTED);
    expect(replay.driftDiagnosis).not.toBeNull();
    expect(replay.driftDiagnosis.cause).toBe('ENGINE_DRIFT');
  });

  it('certifySequence certifies all frames', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const manifest = certifySequence(gene, 10);
    expect(manifest.certified).toBe(true);
    expect(manifest.frames).toHaveLength(10);
    expect(manifest.frames.every(f => f.certified)).toBe(true);
    expect(manifest.code).toBe(TEMPORAL_HEALTH_CODES.INTERPOLATION_CERTIFIED);
  });

  it('createApprovalRecord requires human approval', () => {
    expect(() => createApprovalRecord({
      geneChecksum: 'x',
      projectionChecksum: 'y',
      previewChecksum: 'z',
      approvedBy: 'agent',
      projectionMode: 'derived',
      algorithm: 'linear-v1',
    })).toThrow(/HUMAN_APPROVAL/);
  });

  it('createApprovalRecord succeeds with human approval', () => {
    const record = createApprovalRecord({
      geneChecksum: 'sha256-canonical-v1:abc',
      projectionChecksum: 'sha256-canonical-v1:def',
      previewChecksum: 'sha256-canonical-v1:ghi',
      approvedBy: 'human',
      projectionMode: 'derived',
      algorithm: 'linear-v1',
    });
    expect(record.approvedBy).toBe('human');
    expect(record.approvalChecksum).toMatch(/^sha256-canonical-v1:/);
    expect(Object.isFrozen(record)).toBe(true);
  });
});

// ─── Phase 4: Compiler ───────────────────────────────────────────────────────

describe('Temporal Compiler', () => {
  it('compiles a gene into certified frames', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const compiled = compileTemporal(gene, { frameCount: 10 });
    expect(compiled.contract).toBe(TEMPORAL_COMPILED_CONTRACT);
    expect(compiled.frameCount).toBe(10);
    expect(compiled.frames).toHaveLength(10);
    expect(compiled.checksum).toMatch(/^sha256-canonical-v1:/);
    expect(compiled.geneChecksum).toBe(gene.checksum);
  });

  it('compiled packet is frozen', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const compiled = compileTemporal(gene, { frameCount: 5 });
    expect(Object.isFrozen(compiled)).toBe(true);
  });

  it('replayFrame verifies a compiled frame', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const compiled = compileTemporal(gene, { frameCount: 10 });
    const replay = replayFrame(gene, compiled.frames[5]);
    expect(replay.verified).toBe(true);
  });

  it('all frames replay successfully', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const compiled = compileTemporal(gene, { frameCount: 20 });
    for (const frame of compiled.frames) {
      const replay = replayFrame(gene, frame);
      expect(replay.verified).toBe(true);
    }
  });

  it('rejects invalid frameCount', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    expect(() => compileTemporal(gene, { frameCount: 0 })).toThrow(/frameCount/);
  });

  it('extractVRIInput returns VRI-ready data', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const compiled = compileTemporal(gene, { frameCount: 5 });
    const vriInput = extractVRIInput(compiled.frames[2]);
    expect(vriInput.state).toBeDefined();
    expect(vriInput.energy).toBeDefined();
    expect(vriInput.time).toBeDefined();
    expect(vriInput.projectionChecksum).toBeDefined();
  });

  it('formatForWire returns wire-ready data', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const compiled = compileTemporal(gene, { frameCount: 5 });
    const wire = formatForWire(compiled.frames[2]);
    expect(wire.frame).toBe(2);
    expect(wire.vertices.length).toBeGreaterThan(0);
    expect(wire.projectionChecksum).toBeDefined();
    expect(wire.energyBindings).toBeDefined();
  });
});

// ─── Phase 5: Aspects ────────────────────────────────────────────────────────

describe('Temporal Aspects', () => {
  function aspectGene(aspect) {
    const spec = simpleGeneSpec();
    spec.aspect = aspect;
    return createTemporalGene(spec);
  }

  it('one-shot clamps to [start, end]', () => {
    const gene = aspectGene('one-shot');
    const before = evaluateTemporal(gene, -1);
    const after = evaluateTemporal(gene, 5);
    expect(before.effectiveTime).toBe(0);
    expect(after.effectiveTime).toBe(1);
  });

  it('loop wraps time', () => {
    const gene = aspectGene('loop');
    const at1_5 = evaluateTemporal(gene, 1.5);
    expect(at1_5.effectiveTime).toBeCloseTo(0.5, 2);
  });

  it('ping-pong reverses direction', () => {
    const gene = aspectGene('ping-pong');
    const at1_5 = evaluateTemporal(gene, 1.5);
    expect(at1_5.effectiveTime).toBeCloseTo(0.5, 2);
  });

  it('hold clamps at end', () => {
    const gene = aspectGene('hold');
    const at5 = evaluateTemporal(gene, 5);
    expect(at5.effectiveTime).toBe(1);
  });
});

// ─── Phase 6: Energy Bindings ────────────────────────────────────────────────

describe('Energy Bindings', () => {
  it('evaluates PHOTONIC ramp at midpoint', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const energy = evaluateEnergyBindings(gene, 0.5);
    expect(energy.PHOTONIC).toBeCloseTo(0.6, 2);
  });

  it('evaluates at start → from value', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const energy = evaluateEnergyBindings(gene, 0);
    expect(energy.PHOTONIC).toBeCloseTo(0.2, 2);
  });

  it('evaluates at end → to value', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const energy = evaluateEnergyBindings(gene, 1);
    expect(energy.PHOTONIC).toBeCloseTo(1.0, 2);
  });

  it('clamps before startTime', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const energy = evaluateEnergyBindings(gene, -1);
    expect(energy.PHOTONIC).toBeCloseTo(0.2, 2);
  });
});

// ─── Phase 7: Flatten/Unflatten ──────────────────────────────────────────────

describe('State Flatten/Unflatten', () => {
  it('round-trips a state', () => {
    const state = {
      body: {
        spine: [[1, 2], [3, 4]],
        namedPoints: { center: [2, 3] },
      },
    };
    const flat = flattenState(state);
    expect(flat).toEqual([1, 2, 3, 4, 2, 3]);
    const restored = unflattenState(state, flat);
    expect(restored.body.spine).toEqual([[1, 2], [3, 4]]);
    expect(restored.body.namedPoints.center).toEqual([2, 3]);
  });

  it('handles multiple parts', () => {
    const state = {
      alpha: { spine: [[0, 0]] },
      beta: { spine: [[10, 10]] },
    };
    const flat = flattenState(state);
    expect(flat).toEqual([0, 0, 10, 10]);
  });
});

// ─── Phase 8: Determinism (100-iteration) ────────────────────────────────────

describe('Determinism (100-iteration)', () => {
  it('gene checksum is stable across 100 creations', () => {
    const checksums = new Set();
    for (let i = 0; i < 100; i++) {
      const gene = createTemporalGene(simpleGeneSpec());
      checksums.add(gene.checksum);
    }
    expect(checksums.size).toBe(1);
  });

  it('interpolation is stable across 100 evaluations', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      const { state } = evaluateTemporal(gene, 0.37);
      results.add(JSON.stringify(state));
    }
    expect(results.size).toBe(1);
  });

  it('projection checksum is stable across 100 certifications', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const checksums = new Set();
    for (let i = 0; i < 100; i++) {
      const result = evaluateTemporal(gene, 0.5);
      const energy = evaluateEnergyBindings(gene, 0.5);
      const cert = certifyInterpolation(gene, 0.5, result, energy);
      checksums.add(cert.projectionChecksum);
    }
    expect(checksums.size).toBe(1);
  });

  it('compilation is stable across 100 runs', () => {
    const checksums = new Set();
    for (let i = 0; i < 100; i++) {
      const gene = createTemporalGene(simpleGeneSpec());
      const compiled = compileTemporal(gene, { frameCount: 10 });
      checksums.add(compiled.checksum);
    }
    expect(checksums.size).toBe(1);
  });

  it('all 5 algorithms are deterministic across 100 runs', () => {
    const algorithms = Object.keys(INTERPOLATION_ALGORITHMS);
    for (const algo of algorithms) {
      const spec = simpleGeneSpec();
      spec.algorithm = algo;
      const gene = createTemporalGene(spec);
      const results = new Set();
      for (let i = 0; i < 100; i++) {
        const { state } = evaluateTemporal(gene, 0.42);
        results.add(JSON.stringify(state));
      }
      expect(results.size).toBe(1);
    }
  });

  it('3-keyframe hermite is deterministic across 100 runs', () => {
    const gene = createTemporalGene(threeKeyframeGeneSpec());
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      const { state } = evaluateTemporal(gene, 0.37);
      results.add(JSON.stringify(state));
    }
    expect(results.size).toBe(1);
  });
});

// ─── Phase 9: Governor never interpolates ────────────────────────────────────

describe('Architectural boundary: governor never interpolates', () => {
  it('certifyGene does not produce state data', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const cert = certifyGene(gene);
    expect(cert.state).toBeUndefined();
    expect(cert.frames).toBeUndefined();
  });

  it('certifyInterpolation receives result, does not compute it', () => {
    const gene = createTemporalGene(simpleGeneSpec());
    const result = evaluateTemporal(gene, 0.5);
    // Governor receives the result — it doesn't call evaluateTemporal internally
    // for the primary certification (only for determinism verification)
    const cert = certifyInterpolation(gene, 0.5, result, {});
    expect(cert.certified).toBe(true);
    // The cert has checksums but no raw state
    expect(cert.projectionChecksum).toBeDefined();
  });

  it('governor version is independent of engine version', () => {
    expect(TEMPORAL_GOVERNOR_VERSION).toBeDefined();
    expect(INTERPOLATION_ENGINE_VERSION).toBeDefined();
    // They are separate versioned components
    expect(typeof TEMPORAL_GOVERNOR_VERSION).toBe('string');
    expect(typeof INTERPOLATION_ENGINE_VERSION).toBe('string');
  });
});

// ─── Phase 10: Algorithm options survive certification ───────────────────────
//
// The governor re-evaluates the gene to verify determinism. If it re-evaluates
// with different arguments than the caller used, the replay diverges from a
// perfectly deterministic interpolation and the gene is refused for a fault it
// does not have. bezier-v1 is the only algorithm that reads options, so it is
// the only one where the omission is observable.

describe('Algorithm options are forwarded to certification', () => {
  function bezierGeneSpec() {
    return {
      contract: TEMPORAL_CONTRACT,
      id: 'bezier-options',
      assetId: 'test-asset',
      algorithm: 'bezier-v1',
      aspect: 'one-shot',
      projectionMode: 'derived',
      canvas: { width: 24, height: 20 },
      keyframes: [
        {
          time: 0,
          label: 'start',
          state: { body: { spine: [[2, 10], [12, 10]], namedPoints: { center: [7, 10] } } },
        },
        {
          time: 1,
          label: 'end',
          state: { body: { spine: [[8, 10], [18, 10]], namedPoints: { center: [13, 10] } } },
        },
      ],
    };
  }

  const CONTROL_POINTS = { controlPoints: [[0.25, 0.75]] };

  it('compiles a bezier gene with control points', () => {
    const gene = createTemporalGene(bezierGeneSpec());
    const compiled = compileTemporal(gene, {
      frameCount: 5,
      algorithmOptions: CONTROL_POINTS,
    });
    expect(compiled.frameCount).toBe(5);
    expect(compiled.frames).toHaveLength(5);
  });

  it('certifies a bezier interpolation evaluated with control points', () => {
    const gene = createTemporalGene(bezierGeneSpec());
    const result = evaluateTemporal(gene, 0.5, CONTROL_POINTS);
    const energy = evaluateEnergyBindings(gene, 0.5);
    const cert = certifyInterpolation(gene, 0.5, result, energy, CONTROL_POINTS);
    expect(cert.certified).toBe(true);
    expect(cert.deterministic).toBe(true);
  });

  it('verifies replay of a bezier frame evaluated with control points', () => {
    const gene = createTemporalGene(bezierGeneSpec());
    const result = evaluateTemporal(gene, 0.5, CONTROL_POINTS);
    const energy = evaluateEnergyBindings(gene, 0.5);
    const cert = certifyInterpolation(gene, 0.5, result, energy, CONTROL_POINTS);

    const replay = verifyReplay(gene, 0.5, cert.projectionChecksum, CONTROL_POINTS);
    expect(replay.verified).toBe(true);
  });

  it('still refuses a certification whose result was evaluated with different options', () => {
    // The forwarding must not become a rubber stamp: a result produced under
    // one set of control points must NOT certify under another.
    const gene = createTemporalGene(bezierGeneSpec());
    const result = evaluateTemporal(gene, 0.5, CONTROL_POINTS);
    const energy = evaluateEnergyBindings(gene, 0.5);
    // NOTE: at t=0.5 a cubic bezier weights both control points equally
    // (0.375·c1 + 0.375·c2), so any pair with the same SUM is indistinguishable
    // there — [0.25,0.75] and [0.9,0.1] both sum to 1.0 and are genuinely
    // identical. The contrasting pair must differ in sum, or this assertion
    // passes for a reason that has nothing to do with option forwarding.
    const cert = certifyInterpolation(gene, 0.5, result, energy, {
      controlPoints: [[0.9, 0.9]],
    });
    expect(cert.certified).toBe(false);
  });
});
