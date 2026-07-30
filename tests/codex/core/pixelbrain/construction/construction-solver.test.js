/**
 * Geometric Construction Solver — comprehensive test suite.
 * PDR: 2026-07-25-geometric-construction-solver-pdr.md
 *
 * Covers all 6 phases:
 *   1. Construction IR schema + proportion laws
 *   2. Core constructors (ellipse, conic-bowl, tapered-ribbon, capsule)
 *   3. Constraint solver + validation laws
 *   4. Solver orchestrator + end-to-end brazier
 *   5. Wand integration (construction_request formula type)
 *   6. Controlled modifiers (Chaikin, offset)
 *
 * Determinism: 100-iteration replay on all solving paths.
 */

import { describe, it, expect } from 'vitest';

// Phase 1
import {
  createConstruction,
  validateConstructionSpec,
  SOLVER_VERSION,
} from '../../../../../codex/core/pixelbrain/construction/construction-schema.js';

import {
  resolveProportion,
  resolveRatioSpec,
} from '../../../../../codex/core/pixelbrain/construction/proportion-laws.js';

// Phase 2
import { solveEllipse } from '../../../../../codex/core/pixelbrain/construction/constructors/ellipse.js';
import { solveConicBowl } from '../../../../../codex/core/pixelbrain/construction/constructors/conic-bowl.js';
import { solveTaperedRibbon } from '../../../../../codex/core/pixelbrain/construction/constructors/tapered-ribbon.js';
import { solveCapsule } from '../../../../../codex/core/pixelbrain/construction/constructors/capsule.js';
import { solveWidthProfileRibbon } from '../../../../../codex/core/pixelbrain/construction/constructors/width-profile-ribbon.js';
import { solveBranchGraph } from '../../../../../codex/core/pixelbrain/construction/constructors/branch-graph.js';
import { solveRadialShardCluster } from '../../../../../codex/core/pixelbrain/construction/constructors/radial-shard-cluster.js';
import { solveArchitecturalModuleStack } from '../../../../../codex/core/pixelbrain/construction/constructors/architectural-module-stack.js';
import { solveOffsetContour } from '../../../../../codex/core/pixelbrain/construction/constructors/offset-contour.js';
import { solveRoundedPolygon } from '../../../../../codex/core/pixelbrain/construction/constructors/rounded-polygon.js';
import { solveBezierChain } from '../../../../../codex/core/pixelbrain/construction/constructors/bezier-chain.js';

// Phase 3
import { solveConstraints } from '../../../../../codex/core/pixelbrain/construction/constraint-solver.js';
import { validateConstruction } from '../../../../../codex/core/pixelbrain/construction/validation-laws.js';

// Phase 4
import { solve, trySolve } from '../../../../../codex/core/pixelbrain/construction/solver-orchestrator.js';

// Phase 6
import { applyControlledChaikin, offsetFromCenterline } from '../../../../../codex/core/pixelbrain/construction/modifiers.js';

/**
 * Assert that `fn` refuses with a PB-ERR-v1 bytecode of the expected category.
 *
 * Asserts on `.bytecode` — the canonical machine field — rather than on
 * `.message`, which leads with a human-readable reason so that a refusal printed
 * by a CLI or a stack trace can be acted on without decoding base64.
 */
function expectRefusal(fn, categoryPattern) {
  let thrown = null;
  try { fn(); } catch (e) { thrown = e; }
  expect(thrown, 'expected a refusal but none was thrown').not.toBeNull();
  expect(thrown.bytecode).toMatch(categoryPattern);
  return thrown;
}


// Geometry utils
import {
  dist, windingDirection, findSelfIntersections, signedArea, centroid,
} from '../../../../../codex/core/pixelbrain/construction/geometry-utils.js';

function geometricCenter(points) {
  const hasDuplicateClosure = points.length > 1
    && dist(points[0], points[points.length - 1]) < 0.01;
  return centroid(hasDuplicateClosure ? points.slice(0, -1) : points);
}

// ─── Fixtures ──────────────────────────────────────────────────────────

function brazierSpec() {
  return {
    id: 'scholomance-brazier',
    canvas: { width: 24, height: 20 },
    anchors: {
      'rim.center': [12, 4.2],
      'bowl.top': [12, 5.7],
      'stem.top': [12, 11.7],
      'stem.bottom': [12, 16],
      'base.center': [12, 17.5],
      'axis': [12, 10],
    },
    parts: [
      {
        id: 'rim',
        primitive: {
          kind: 'ellipse',
          center: { anchor: 'rim.center' },
          radiusX: 10,
          radiusY: 1.5,
        },
      },
      {
        id: 'bowl',
        primitive: {
          kind: 'conic-bowl',
          topRef: { ref: 'rim', point: 'bottomCenter' },
          depth: { ratio: { reference: 10, value: 0.618 } },
        },
      },
      {
        id: 'stem',
        primitive: {
          kind: 'tapered-ribbon',
          start: { ref: 'bowl', point: 'bottomCenter' },
          end: { anchor: 'stem.bottom' },
          startWidth: 2.4,
          endWidth: 1.6,
        },
      },
      {
        id: 'base',
        primitive: {
          kind: 'ellipse',
          center: { anchor: 'base.center' },
          radiusX: 5,
          radiusY: 1.2,
        },
      },
    ],
    constraints: [
      { kind: 'coaxial', parts: ['rim', 'bowl', 'stem', 'base'] },
      { kind: 'mirror-symmetry', axis: { anchor: 'axis' } },
    ],
    validation: {
      closedParts: ['rim', 'bowl', 'base'],
      forbidSelfIntersections: true,
      consistentWinding: 'counterclockwise',
      minimumCurvatureRadius: 0.1,
      requireConnectedAssembly: false,
    },
  };
}

function solvedFixture({
  id,
  points,
  tangents = points.map(() => [1, 0]),
  namedPoints = {},
  measurements = {},
  leftBank,
  rightBank,
}) {
  return {
    id,
    primitiveKind: 'fixture',
    spine: points,
    closedContour: points,
    tangents,
    surfaceNormals: points.map(() => [0, 1]),
    curvature: points.map(() => 0),
    arcLength: points.slice(1).reduce(
      (length, point, index) => length + dist(points[index], point),
      0,
    ),
    namedPoints,
    measurements,
    ...(leftBank ? { leftBank } : {}),
    ...(rightBank ? { rightBank } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1: Construction IR Schema + Proportion Laws
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 1: Construction IR Schema', () => {
  it('creates a frozen PB-GEOMETRY-CONSTRUCTION-v1 packet', () => {
    const packet = createConstruction(brazierSpec());
    expect(packet.contract).toBe('PB-GEOMETRY-CONSTRUCTION-v1');
    expect(packet.version).toBe('1.0.0');
    expect(packet.solverVersion).toBe(SOLVER_VERSION);
    expect(packet.id).toBe('scholomance-brazier');
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.parts)).toBe(true);
    expect(Object.isFrozen(packet.anchors)).toBe(true);
  });

  it('produces a stable checksum (100 iterations)', () => {
    const spec = brazierSpec();
    const first = createConstruction(spec).checksum;
    expect(first).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);

    for (let i = 0; i < 100; i++) {
      expect(createConstruction(spec).checksum).toBe(first);
    }
  });

  it('checksum changes when construction changes', () => {
    const a = createConstruction(brazierSpec()).checksum;
    const spec2 = brazierSpec();
    spec2.id = 'different-id';
    const b = createConstruction(spec2).checksum;
    expect(a).not.toBe(b);
  });

  it('uses canonical SHA-256 independent of recursive object key order', () => {
    const first = brazierSpec();
    const second = brazierSpec();
    const ellipse = second.parts[0].primitive;
    second.parts[0].primitive = {
      radiusY: ellipse.radiusY,
      center: ellipse.center,
      kind: ellipse.kind,
      radiusX: ellipse.radiusX,
    };

    expect(createConstruction(first).checksum)
      .toBe(createConstruction(second).checksum);
    expect(createConstruction(first).checksum)
      .toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
  });

  it('defensively clones and recursively freezes the packet', () => {
    const input = brazierSpec();
    const packet = createConstruction(input);

    input.parts[0].primitive.center.anchor = 'mutated';

    expect(packet.parts[0].primitive.center.anchor).toBe('rim.center');
    expect(Object.isFrozen(packet.parts[0].primitive.center)).toBe(true);
    expect(() => {
      packet.parts[0].primitive.center.anchor = 'mutated';
    }).toThrow();
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite geometry: %s', value => {
    const input = brazierSpec();
    input.parts[0].primitive.radiusX = value;

    expectRefusal(() => createConstruction(input), /^PB-ERR-v1-RANGE-/);
  });

  it('rejects unsupported canonical values', () => {
    const input = brazierSpec();
    input.parts[0].primitive.extra = new Map();

    expectRefusal(() => createConstruction(input), /^PB-ERR-v1-VALUE-/);
  });

  it('rejects malformed specs with structured errors', () => {
    const { valid, errors } = validateConstructionSpec({});
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unknown primitive kinds', () => {
    const spec = brazierSpec();
    spec.parts[0].primitive.kind = 'hyperboloid';
    const { valid, errors } = validateConstructionSpec(spec);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('hyperboloid'))).toBe(true);
  });

  it('rejects unknown constraint kinds', () => {
    const spec = brazierSpec();
    spec.constraints.push({ kind: 'telepathic' });
    const { valid, errors } = validateConstructionSpec(spec);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('telepathic'))).toBe(true);
  });

  it('rejects duplicate part ids', () => {
    const spec = brazierSpec();
    spec.parts.push({ ...spec.parts[0] });
    const { valid, errors } = validateConstructionSpec(spec);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('duplicate'))).toBe(true);
  });

  it('quantizes anchors to 3dp', () => {
    const spec = brazierSpec();
    spec.anchors['rim.center'] = [12.123456789, 4.987654321];
    const packet = createConstruction(spec);
    expect(packet.anchors['rim.center'][0]).toBe(12.123);
    expect(packet.anchors['rim.center'][1]).toBe(4.988);
  });

  it('throws on createConstruction with invalid spec', () => {
    expectRefusal(() => createConstruction({}), /^PB-ERR-v1-VALUE-/);
  });

  it.each([
    ['zero canvas', spec => { spec.canvas.width = 0; }, 'RANGE'],
    ['oversized canvas', spec => { spec.canvas.height = 257; }, 'RANGE'],
    ['missing anchor', spec => { spec.parts[0].primitive.center.anchor = 'ghost'; }, 'STATE'],
    ['missing part', spec => { spec.parts[1].primitive.topRef.ref = 'ghost'; }, 'STATE'],
    ['illegal named point', spec => { spec.parts[1].primitive.topRef.point = 'ghost'; }, 'STATE'],
    ['invalid radius', spec => { spec.parts[0].primitive.radiusX = -1; }, 'RANGE'],
    ['invalid validation part', spec => { spec.validation.closedParts.push('ghost'); }, 'STATE'],
  ])('refuses %s before solving', (_name, mutate, category) => {
    const spec = brazierSpec();
    mutate(spec);

    expectRefusal(() => createConstruction(spec), new RegExp(`^PB-ERR-v1-${category}-`));
  });

  it('refuses dependency cycles during packet creation', () => {
    const spec = brazierSpec();
    spec.parts = [
      {
        id: 'a',
        primitive: {
          kind: 'offset-contour',
          source: { ref: 'b', point: 'center' },
          distance: 1,
          side: 1,
        },
      },
      {
        id: 'b',
        primitive: {
          kind: 'offset-contour',
          source: { ref: 'a', point: 'center' },
          distance: 1,
          side: 1,
        },
      },
    ];
    spec.constraints = [];
    spec.validation.closedParts = [];

    expectRefusal(() => createConstruction(spec), /^PB-ERR-v1-STATE-/);
  });
});

describe('Phase 1: Proportion Laws', () => {
  it('resolves golden ratio conjugate', () => {
    const v = resolveProportion({ kind: 'golden' });
    expect(v).toBeCloseTo(0.6180339887498949, 10);
  });

  it('resolves root-two conjugate', () => {
    const v = resolveProportion({ kind: 'root-two' });
    expect(v).toBeCloseTo(0.7071067811865475, 10);
  });

  it('resolves explicit ratio', () => {
    expect(resolveProportion({ kind: 'ratio', value: 0.5 })).toBe(0.5);
  });

  it('resolves thirds', () => {
    expect(resolveProportion({ kind: 'thirds' })).toBeCloseTo(1 / 3, 10);
  });

  it('resolves fifths', () => {
    expect(resolveProportion({ kind: 'fifths' })).toBeCloseTo(1 / 5, 10);
  });

  it('resolves modular', () => {
    expect(resolveProportion({ kind: 'modular', module: 4 })).toBe(4);
  });

  it('throws on species-specific (deferred)', () => {
    expect(() => resolveProportion({ kind: 'species-specific', species: 'oak' }))
      .toThrow('not yet curated');
  });

  it('throws on unknown kind', () => {
    expect(() => resolveProportion({ kind: 'platonic' })).toThrow('Unknown proportion');
  });

  it('resolves RatioSpec with numeric reference', () => {
    const v = resolveRatioSpec({ ratio: { reference: 10, value: 0.618 } });
    expect(v).toBeCloseTo(6.18, 5);
  });

  it('resolves RatioSpec with part reference', () => {
    const v = resolveRatioSpec(
      { ratio: { reference: { ref: 'rim', point: 'radiusX' }, value: 0.5 } },
      { 'rim.radiusX': 10 }
    );
    expect(v).toBe(5);
  });

  it('all proportion constants are deterministic (100 iterations)', () => {
    const kinds = ['golden', 'root-two', 'thirds', 'fifths'];
    for (let i = 0; i < 100; i++) {
      for (const kind of kinds) {
        expect(resolveProportion({ kind })).toBe(resolveProportion({ kind }));
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: Core Constructors
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 2: Ellipse constructor', () => {
  const ctx = {
    anchors: { 'c': [12, 4.2] },
    canvas: { width: 24, height: 20 },
    resolvedParts: {},
  };

  it('produces ≥32 points for a closed ellipse', () => {
    const result = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'c' }, radiusX: 10, radiusY: 1.5, _partId: 'rim' },
      ctx
    );
    expect(result.closedContour.length).toBeGreaterThanOrEqual(33); // 32 + closing point
    expect(result.primitiveKind).toBe('ellipse');
  });

  it('is closed (first == last within 0.01)', () => {
    const result = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'c' }, radiusX: 10, radiusY: 1.5, _partId: 'rim' },
      ctx
    );
    const c = result.closedContour;
    expect(dist(c[0], c[c.length - 1])).toBeLessThan(0.01);
  });

  it('has named points (topCenter, bottomCenter, left, right, center)', () => {
    const result = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'c' }, radiusX: 10, radiusY: 1.5, _partId: 'rim' },
      ctx
    );
    expect(result.namedPoints.center).toEqual([12, 4.2]);
    expect(result.namedPoints.topCenter[1]).toBeCloseTo(2.7, 1);
    expect(result.namedPoints.bottomCenter[1]).toBeCloseTo(5.7, 1);
    expect(result.namedPoints.left[0]).toBeCloseTo(2, 1);
    expect(result.namedPoints.right[0]).toBeCloseTo(22, 1);
  });

  it('has tangents, normals, curvature, arcLength', () => {
    const result = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'c' }, radiusX: 10, radiusY: 1.5, _partId: 'rim' },
      ctx
    );
    expect(result.tangents.length).toBe(result.closedContour.length);
    expect(result.surfaceNormals.length).toBe(result.closedContour.length);
    expect(result.curvature.length).toBe(result.closedContour.length);
    expect(result.arcLength).toBeGreaterThan(0);
  });

  it('is deterministic (100 iterations)', () => {
    const spec = { kind: 'ellipse', center: { anchor: 'c' }, radiusX: 10, radiusY: 1.5, _partId: 'rim' };
    const first = JSON.stringify(solveEllipse(spec, ctx));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(solveEllipse(spec, ctx))).toBe(first);
    }
  });
});

describe('Phase 2: Conic-bowl constructor', () => {
  it('produces a closed profile tangent to the rim', () => {
    const rimCtx = {
      anchors: { 'c': [12, 4.2] },
      canvas: { width: 24, height: 20 },
      resolvedParts: {},
    };
    const rim = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'c' }, radiusX: 10, radiusY: 1.5, _partId: 'rim' },
      rimCtx
    );

    const bowlCtx = {
      anchors: { 'c': [12, 4.2] },
      canvas: { width: 24, height: 20 },
      resolvedParts: { rim },
    };

    const bowl = solveConicBowl(
      {
        kind: 'conic-bowl',
        topRef: { ref: 'rim', point: 'bottomCenter' },
        depth: { ratio: { reference: 10, value: 0.618 } },
        _partId: 'bowl',
      },
      bowlCtx
    );

    expect(bowl.closedContour.length).toBeGreaterThan(10);
    expect(bowl.namedPoints.topCenter[1]).toBeCloseTo(rim.namedPoints.bottomCenter[1], 1);
    expect(bowl.primitiveKind).toBe('conic-bowl');
  });
});

describe('Phase 2: Tapered-ribbon constructor', () => {
  it('produces monotonic width taper', () => {
    const ctx = {
      anchors: { 'top': [12, 11.7], 'bottom': [12, 16] },
      canvas: { width: 24, height: 20 },
      resolvedParts: {},
    };

    const result = solveTaperedRibbon(
      {
        kind: 'tapered-ribbon',
        start: { anchor: 'top' },
        end: { anchor: 'bottom' },
        startWidth: 2.4,
        endWidth: 1.6,
        _partId: 'stem',
      },
      ctx
    );

    expect(result.leftBank.length).toBe(result.rightBank.length);
    expect(result.spine.length).toBe(result.leftBank.length);

    // Verify monotonic decreasing width
    for (let i = 1; i < result.leftBank.length; i++) {
      const wPrev = dist(result.leftBank[i - 1], result.rightBank[i - 1]);
      const wCurr = dist(result.leftBank[i], result.rightBank[i]);
      expect(wCurr).toBeLessThanOrEqual(wPrev + 0.01);
    }
  });
});

describe('Phase 2: Capsule constructor', () => {
  it('produces a closed contour with semicircle caps', () => {
    const ctx = {
      anchors: { 'a': [5, 10], 'b': [15, 10] },
      canvas: { width: 24, height: 20 },
      resolvedParts: {},
    };

    const result = solveCapsule(
      { kind: 'capsule', start: { anchor: 'a' }, end: { anchor: 'b' }, radius: 2, _partId: 'bar' },
      ctx
    );

    expect(result.closedContour.length).toBeGreaterThan(10);
    const c = result.closedContour;
    expect(dist(c[0], c[c.length - 1])).toBeLessThan(0.01);
    expect(result.primitiveKind).toBe('capsule');
  });
});

describe('Phase 2: Remaining constructors', () => {
  const baseCtx = {
    anchors: {
      'a': [5, 5], 'b': [15, 5], 'c': [15, 15], 'd': [5, 15],
      'root': [12, 18], 'center': [12, 10],
    },
    canvas: { width: 24, height: 20 },
    resolvedParts: {},
  };

  it('width-profile-ribbon produces banks', () => {
    const result = solveWidthProfileRibbon(
      {
        kind: 'width-profile-ribbon',
        spine: [{ anchor: 'a' }, { anchor: 'b' }, { anchor: 'c' }],
        profile: [4, 6, 3],
        _partId: 'wpr',
      },
      baseCtx
    );
    expect(result.leftBank.length).toBe(3);
    expect(result.rightBank.length).toBe(3);
  });

  it('branch-graph produces branch segments', () => {
    const result = solveBranchGraph(
      {
        kind: 'branch-graph',
        root: { anchor: 'root' },
        branches: [
          { angle: 0, length: 5, children: [{ angle: 0.3, length: 3 }] },
          { angle: -0.5, length: 4 },
        ],
        _partId: 'tree',
      },
      baseCtx
    );
    expect(result.branchSegments.length).toBe(3);
    expect(result.spine.length).toBeGreaterThanOrEqual(2);
  });

  it('radial-shard-cluster produces shards', () => {
    const result = solveRadialShardCluster(
      {
        kind: 'radial-shard-cluster',
        center: { anchor: 'center' },
        count: 6,
        innerRadius: 2,
        outerRadius: 5,
        _partId: 'burst',
      },
      baseCtx
    );
    expect(result.shards.length).toBe(6);
  });

  it('architectural-module-stack stacks modules', () => {
    const result = solveArchitecturalModuleStack(
      {
        kind: 'architectural-module-stack',
        base: { anchor: 'center' },
        modules: [
          { width: 8, height: 3, label: 'foundation' },
          { width: 6, height: 4, label: 'tower' },
          { width: 4, height: 2, label: 'cap' },
        ],
        _partId: 'building',
      },
      baseCtx
    );
    expect(result.modules.length).toBe(3);
    expect(result.modules[0].label).toBe('foundation');
  });

  it('rounded-polygon produces arc-filleted corners', () => {
    const result = solveRoundedPolygon(
      {
        kind: 'rounded-polygon',
        points: [{ anchor: 'a' }, { anchor: 'b' }, { anchor: 'c' }, { anchor: 'd' }],
        cornerRadius: 1.5,
        _partId: 'panel',
      },
      baseCtx
    );
    expect(result.closedContour.length).toBeGreaterThan(4);
    const c = result.closedContour;
    expect(dist(c[0], c[c.length - 1])).toBeLessThan(0.01);
  });

  it('rounded-polygon preserves authored bilateral symmetry', () => {
    const result = solveRoundedPolygon(
      {
        kind: 'rounded-polygon',
        points: [
          { anchor: 'tip' },
          { anchor: 'right' },
          { anchor: 'base' },
          { anchor: 'left' },
        ],
        cornerRadius: 0.5,
        _partId: 'symmetric-panel',
      },
      {
        ...baseCtx,
        anchors: {
          ...baseCtx.anchors,
          tip: [5, 0],
          right: [8, 5],
          base: [5, 8],
          left: [2, 5],
        },
      },
    );

    for (const point of result.closedContour) {
      const reflected = [10 - point[0], point[1]];
      expect(result.closedContour.some(candidate => dist(candidate, reflected) < 0.01))
        .toBe(true);
    }
  });

  it('bezier-chain produces a smooth curve', () => {
    const result = solveBezierChain(
      {
        kind: 'bezier-chain',
        controlPoints: [
          { anchor: 'a' }, { anchor: 'b' }, { anchor: 'c' }, { anchor: 'd' },
        ],
        degree: 3,
        _partId: 'curve',
      },
      baseCtx
    );
    expect(result.spine.length).toBeGreaterThan(4);
    expect(result.namedPoints.start).toEqual(baseCtx.anchors['a']);
  });

  it('offset-contour offsets a source part', () => {
    // First solve an ellipse to use as source
    const ellipse = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'center' }, radiusX: 5, radiusY: 3, _partId: 'src' },
      baseCtx
    );
    const ctxWithSource = { ...baseCtx, resolvedParts: { src: ellipse } };

    const result = solveOffsetContour(
      {
        kind: 'offset-contour',
        source: { ref: 'src', point: 'center' },
        distance: 1,
        side: 1,
        _partId: 'offset',
      },
      ctxWithSource
    );
    expect(result.closedContour.length).toBe(ellipse.closedContour.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: Constraint Solver + Validation Laws
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 3: Constraint Solver', () => {
  it('coaxial constraint aligns parts within 0.01 cells', () => {
    const ctx = {
      anchors: { 'a': [10, 5], 'b': [14, 10] },
      canvas: { width: 24, height: 20 },
      resolvedParts: {},
    };
    const e1 = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'a' }, radiusX: 5, radiusY: 2, _partId: 'p1' }, ctx
    );
    const e2 = solveEllipse(
      { kind: 'ellipse', center: { anchor: 'b' }, radiusX: 3, radiusY: 1, _partId: 'p2' }, ctx
    );

    const parts = { p1: e1, p2: e2 };
    solveConstraints(parts, [{ kind: 'coaxial', parts: ['p1', 'p2'] }]);

    const c1 = geometricCenter(e1.closedContour);
    const c2 = geometricCenter(e2.closedContour);
    expect(Math.abs(c1[0] - c2[0])).toBeLessThan(0.01);
  });

  it('monotonic-taper detects violations', () => {
    const parts = {
      ribbon: {
        id: 'ribbon',
        primitiveKind: 'tapered-ribbon',
        spine: [[0, 0], [0, 5]],
        leftBank: [[-1, 0], [-2, 5]], // width increases: 2 → 4
        rightBank: [[1, 0], [2, 5]],
        closedContour: null,
        tangents: [], surfaceNormals: [], curvature: [], arcLength: 5,
        namedPoints: {},
      },
    };

    const { failures } = solveConstraints(parts, [
      { kind: 'monotonic-taper', part: 'ribbon', direction: 'decreasing' },
    ]);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('checks tangent vectors nearest the declared named join points', () => {
    const parts = {
      a: solvedFixture({
        id: 'a',
        points: [[0, 0], [1, 0], [2, 0]],
        tangents: [[1, 0], [1, 0], [1, 0]],
        namedPoints: { join: [1, 0] },
      }),
      b: solvedFixture({
        id: 'b',
        points: [[0, 1], [1, 1], [2, 1]],
        tangents: [[0, 1], [-1, 0], [-1, 0]],
        namedPoints: { join: [1, 1] },
      }),
    };

    const result = solveConstraints(parts, [{
      kind: 'tangent',
      a: { ref: 'a', point: 'join' },
      b: { ref: 'b', point: 'join' },
    }]);

    expect(result.failures).toEqual([]);
  });

  it('rejects an asymmetric contour without deforming it', () => {
    const parts = {
      shape: solvedFixture({
        id: 'shape',
        points: [[0, 0], [2, 0], [2, 2], [0, 1], [0, 0]],
      }),
    };
    const before = structuredClone(parts);

    const result = solveConstraints(parts, [{
      kind: 'mirror-symmetry',
      axis: { anchor: 'axis' },
      parts: ['shape'],
    }], { axis: [1, 0] });

    expect(result.failures[0].reason).toContain('reflected counterpart');
    expect(parts).toEqual(before);
  });

  it('rejects AABB-only false-positive containment', () => {
    const parts = {
      outer: solvedFixture({
        id: 'outer',
        points: [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]],
      }),
      inner: solvedFixture({
        id: 'inner',
        points: [[2.5, 2.5], [3.5, 2.5], [3.5, 3.5], [2.5, 3.5], [2.5, 2.5]],
      }),
    };

    const result = solveConstraints(parts, [{
      kind: 'contained',
      inner: 'inner',
      outer: 'outer',
    }]);

    expect(result.failures[0].reason).toContain('outside');
  });

  it('rejects an inner edge that crosses a concave outer boundary', () => {
    const parts = {
      outer: solvedFixture({
        id: 'outer',
        points: [
          [0, 0], [4, 0], [4, 4], [3, 4], [3, 1],
          [1, 1], [1, 4], [0, 4], [0, 0],
        ],
      }),
      inner: solvedFixture({
        id: 'inner',
        points: [[0.5, 3], [3.5, 3], [2, 0.5], [0.5, 3]],
      }),
    };

    const result = solveConstraints(parts, [{
      kind: 'contained',
      inner: 'inner',
      outer: 'outer',
    }]);

    expect(result.failures[0].reason).toContain('crosses');
  });

  it('rejects a violated dotted metric ratio', () => {
    const parts = {
      bowl: solvedFixture({
        id: 'bowl',
        points: [[0, 0], [0, 5]],
        measurements: { depth: 5 },
      }),
      rim: solvedFixture({
        id: 'rim',
        points: [[0, 0], [10, 0]],
        measurements: { radiusX: 10 },
      }),
    };

    const result = solveConstraints(parts, [{
      kind: 'ratio',
      a: 'bowl.depth',
      b: 'rim.radiusX',
      value: 0.618,
    }]);

    expect(result.failures[0].reason).toContain('ratio');
  });

  it('re-verifies earlier constraints after later transforms', () => {
    const parts = {
      a: solvedFixture({ id: 'a', points: [[0, 0], [0, 1]] }),
      b: solvedFixture({ id: 'b', points: [[5, 0], [5, 1]] }),
      c: solvedFixture({ id: 'c', points: [[10, 0], [10, 1]] }),
    };

    const result = solveConstraints(parts, [
      { kind: 'coaxial', parts: ['a', 'b'] },
      { kind: 'connected', a: 'c', b: 'b' },
    ]);

    expect(result.failures.some(failure => failure.constraint.kind === 'coaxial'))
      .toBe(true);
  });

  const constraintCases = [
    {
      kind: 'coaxial',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [0, 1]] }),
          b: solvedFixture({ id: 'b', points: [[2, 0], [2, 1]] }),
        },
        constraint: { kind: 'coaxial', parts: ['a', 'b'] },
      }),
      violated: () => ({
        parts: { a: solvedFixture({ id: 'a', points: [[0, 0], [0, 1]] }) },
        constraint: { kind: 'coaxial', parts: ['a', 'ghost'] },
      }),
    },
    {
      kind: 'tangent',
      satisfied: () => ({
        parts: {
          a: solvedFixture({
            id: 'a', points: [[0, 0], [1, 0]], namedPoints: { join: [1, 0] },
          }),
          b: solvedFixture({
            id: 'b', points: [[1, 0], [2, 0]], namedPoints: { join: [1, 0] },
          }),
        },
        constraint: {
          kind: 'tangent',
          a: { ref: 'a', point: 'join' },
          b: { ref: 'b', point: 'join' },
        },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({
            id: 'a',
            points: [[0, 0], [1, 0]],
            tangents: [[1, 0], [1, 0]],
            namedPoints: { join: [1, 0] },
          }),
          b: solvedFixture({
            id: 'b',
            points: [[1, 0], [1, 1]],
            tangents: [[0, 1], [0, 1]],
            namedPoints: { join: [1, 0] },
          }),
        },
        constraint: {
          kind: 'tangent',
          a: { ref: 'a', point: 'join' },
          b: { ref: 'b', point: 'join' },
        },
      }),
    },
    {
      kind: 'coincident',
      satisfied: () => ({
        parts: {
          a: solvedFixture({
            id: 'a', points: [[0, 0], [1, 0]], namedPoints: { join: [0, 0] },
          }),
          b: solvedFixture({
            id: 'b', points: [[5, 0], [6, 0]], namedPoints: { join: [5, 0] },
          }),
        },
        constraint: {
          kind: 'coincident',
          a: { ref: 'a', point: 'join' },
          b: { ref: 'b', point: 'join' },
        },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({
            id: 'a', points: [[0, 0], [1, 0]], namedPoints: { join: [0, 0] },
          }),
          b: solvedFixture({ id: 'b', points: [[5, 0], [6, 0]] }),
        },
        constraint: {
          kind: 'coincident',
          a: { ref: 'a', point: 'join' },
          b: { ref: 'b', point: 'ghost' },
        },
      }),
    },
    {
      kind: 'connected',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({ id: 'b', points: [[5, 0], [6, 0]] }),
        },
        constraint: { kind: 'connected', a: 'a', b: 'b' },
      }),
      violated: () => ({
        parts: { a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }) },
        constraint: { kind: 'connected', a: 'a', b: 'ghost' },
      }),
    },
    {
      kind: 'concentric',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [0, 2]] }),
          b: solvedFixture({ id: 'b', points: [[5, 0], [5, 2]] }),
        },
        constraint: { kind: 'concentric', a: 'a', b: 'b' },
      }),
      violated: () => ({
        parts: { a: solvedFixture({ id: 'a', points: [[0, 0], [0, 2]] }) },
        constraint: { kind: 'concentric', a: 'a', b: 'ghost' },
      }),
    },
    {
      kind: 'parallel',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({ id: 'b', points: [[0, 1], [1, 1]] }),
        },
        constraint: { kind: 'parallel', a: 'a', b: 'b' },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({
            id: 'b',
            points: [[0, 0], [0, 1]],
            tangents: [[0, 1], [0, 1]],
          }),
        },
        constraint: { kind: 'parallel', a: 'a', b: 'b' },
      }),
    },
    {
      kind: 'perpendicular',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({
            id: 'b',
            points: [[0, 0], [0, 1]],
            tangents: [[0, 1], [0, 1]],
          }),
        },
        constraint: { kind: 'perpendicular', a: 'a', b: 'b' },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({ id: 'b', points: [[0, 1], [1, 1]] }),
        },
        constraint: { kind: 'perpendicular', a: 'a', b: 'b' },
      }),
    },
    ...['symmetric', 'mirror-symmetry'].map(kind => ({
      kind,
      satisfied: () => ({
        parts: {
          shape: solvedFixture({
            id: 'shape',
            points: [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]],
          }),
        },
        constraint: { kind, axis: { anchor: 'axis' }, parts: ['shape'] },
        anchors: { axis: [1, 0] },
      }),
      violated: () => ({
        parts: {
          shape: solvedFixture({
            id: 'shape',
            points: [[0, 0], [2, 0], [2, 2], [0, 1], [0, 0]],
          }),
        },
        constraint: { kind, axis: { anchor: 'axis' }, parts: ['shape'] },
        anchors: { axis: [1, 0] },
      }),
    })),
    {
      kind: 'contained',
      satisfied: () => ({
        parts: {
          outer: solvedFixture({
            id: 'outer', points: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
          }),
          inner: solvedFixture({
            id: 'inner', points: [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
          }),
        },
        constraint: { kind: 'contained', inner: 'inner', outer: 'outer' },
      }),
      violated: () => ({
        parts: {
          outer: solvedFixture({
            id: 'outer', points: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
          }),
          inner: solvedFixture({
            id: 'inner', points: [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]],
          }),
        },
        constraint: { kind: 'contained', inner: 'inner', outer: 'outer' },
      }),
    },
    {
      kind: 'equal-length',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({ id: 'b', points: [[0, 1], [1, 1]] }),
        },
        constraint: { kind: 'equal-length', a: 'a', b: 'b' },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] }),
          b: solvedFixture({ id: 'b', points: [[0, 1], [2, 1]] }),
        },
        constraint: { kind: 'equal-length', a: 'a', b: 'b' },
      }),
    },
    {
      kind: 'ratio',
      satisfied: () => ({
        parts: {
          a: solvedFixture({
            id: 'a', points: [[0, 0], [1, 0]], measurements: { value: 6.18 },
          }),
          b: solvedFixture({
            id: 'b', points: [[0, 1], [1, 1]], measurements: { value: 10 },
          }),
        },
        constraint: { kind: 'ratio', a: 'a.value', b: 'b.value', value: 0.618 },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({
            id: 'a', points: [[0, 0], [1, 0]], measurements: { value: 5 },
          }),
          b: solvedFixture({
            id: 'b', points: [[0, 1], [1, 1]], measurements: { value: 10 },
          }),
        },
        constraint: { kind: 'ratio', a: 'a.value', b: 'b.value', value: 0.618 },
      }),
    },
    {
      kind: 'minimum-distance',
      satisfied: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [0, 1]] }),
          b: solvedFixture({ id: 'b', points: [[2, 0], [2, 1]] }),
        },
        constraint: { kind: 'minimum-distance', a: 'a', b: 'b', value: 1 },
      }),
      violated: () => ({
        parts: {
          a: solvedFixture({ id: 'a', points: [[0, 0], [0, 1]] }),
          b: solvedFixture({ id: 'b', points: [[0.5, 0], [0.5, 1]] }),
        },
        constraint: { kind: 'minimum-distance', a: 'a', b: 'b', value: 1 },
      }),
    },
    {
      kind: 'maximum-curvature',
      satisfied: () => {
        const part = solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] });
        part.curvature = [0.1, 0.2];
        return {
          parts: { a: part },
          constraint: { kind: 'maximum-curvature', part: 'a', value: 0.2 },
        };
      },
      violated: () => {
        const part = solvedFixture({ id: 'a', points: [[0, 0], [1, 0]] });
        part.curvature = [0.1, 0.4];
        return {
          parts: { a: part },
          constraint: { kind: 'maximum-curvature', part: 'a', value: 0.2 },
        };
      },
    },
    {
      kind: 'monotonic-taper',
      satisfied: () => ({
        parts: {
          ribbon: solvedFixture({
            id: 'ribbon',
            points: [[0, 0], [0, 1]],
            leftBank: [[-2, 0], [-1, 1]],
            rightBank: [[2, 0], [1, 1]],
          }),
        },
        constraint: {
          kind: 'monotonic-taper', part: 'ribbon', direction: 'decreasing',
        },
      }),
      violated: () => ({
        parts: {
          ribbon: solvedFixture({
            id: 'ribbon',
            points: [[0, 0], [0, 1]],
            leftBank: [[-1, 0], [-2, 1]],
            rightBank: [[1, 0], [2, 1]],
          }),
        },
        constraint: {
          kind: 'monotonic-taper', part: 'ribbon', direction: 'decreasing',
        },
      }),
    },
  ];

  it.each(constraintCases)('$kind has an explicit satisfaction case', ({ satisfied }) => {
    const { parts, constraint, anchors = {} } = satisfied();
    expect(solveConstraints(parts, [constraint], anchors).failures).toEqual([]);
  });

  it.each(constraintCases)('$kind has an explicit refusal case', ({ violated, kind }) => {
    const { parts, constraint, anchors = {} } = violated();
    expect(solveConstraints(parts, [constraint], anchors).failures)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ constraint: expect.objectContaining({ kind }) }),
      ]));
  });
});

describe('Phase 3: Validation Laws', () => {
  it('checks closure on closed parts', () => {
    const parts = {
      ring: {
        id: 'ring',
        closedContour: [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]],
        spine: [], tangents: [], surfaceNormals: [], curvature: [],
        arcLength: 20, namedPoints: {},
      },
    };
    const report = validateConstruction(parts, {
      closedParts: ['ring'],
      forbidSelfIntersections: false,
      consistentWinding: 'counterclockwise',
      minimumCurvatureRadius: 0,
      requireConnectedAssembly: false,
    });
    expect(report.passed).toBe(true);
    expect(report.checks.some(c => c.law === 'closure' && c.passed)).toBe(true);
  });

  it('detects unclosed parts', () => {
    const parts = {
      ring: {
        id: 'ring',
        closedContour: [[0, 0], [5, 0], [5, 5], [0, 5], [0.5, 0.5]], // gap
        spine: [], tangents: [], surfaceNormals: [], curvature: [],
        arcLength: 20, namedPoints: {},
      },
    };
    const report = validateConstruction(parts, {
      closedParts: ['ring'],
      forbidSelfIntersections: false,
      consistentWinding: 'counterclockwise',
      minimumCurvatureRadius: 0,
      requireConnectedAssembly: false,
    });
    expect(report.passed).toBe(false);
  });

  it('checks winding direction', () => {
    // CCW square
    const ccw = [[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]];
    expect(windingDirection(ccw)).toBe('counterclockwise');

    // CW square
    const cw = [[0, 0], [0, 5], [5, 5], [5, 0], [0, 0]];
    expect(windingDirection(cw)).toBe('clockwise');
  });

  it('checks connected assembly', () => {
    const parts = {
      a: {
        id: 'a', closedContour: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
        spine: [], tangents: [], surfaceNormals: [], curvature: [],
        arcLength: 4, namedPoints: {},
      },
      b: {
        id: 'b', closedContour: [[100, 100], [101, 100], [101, 101], [100, 101], [100, 100]],
        spine: [], tangents: [], surfaceNormals: [], curvature: [],
        arcLength: 4, namedPoints: {},
      },
    };
    const report = validateConstruction(parts, {
      closedParts: [],
      forbidSelfIntersections: false,
      consistentWinding: 'counterclockwise',
      minimumCurvatureRadius: 0,
      requireConnectedAssembly: true,
    });
    expect(report.passed).toBe(false);
    expect(report.failures.some(f => f.reason.includes('Disconnected'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 4: Solver Orchestrator — End-to-End Brazier
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 4: Solver Orchestrator', () => {
  it('solves the full brazier construction end-to-end', () => {
    const construction = createConstruction(brazierSpec());
    const result = solve(construction);

    expect(result.constructionId).toBe('scholomance-brazier');
    expect(result.solverVersion).toBe(SOLVER_VERSION);
    expect(Object.keys(result.parts)).toEqual(['rim', 'bowl', 'stem', 'base']);
    expect(result.validationReport.passed).toBe(true);
    expect(result.resultChecksum).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
    expect(result.parts.rim.measurements).toEqual({
      radiusX: 10,
      radiusY: 1.5,
      width: 20,
      height: 3,
    });
    expect(result.parts.bowl.measurements.depth).toBe(6.18);
  });

  it('all closed parts are actually closed', () => {
    const result = solve(createConstruction(brazierSpec()));
    for (const partId of ['rim', 'bowl', 'base']) {
      const c = result.parts[partId].closedContour;
      expect(dist(c[0], c[c.length - 1])).toBeLessThan(0.01);
    }
  });

  it('coaxial constraint is satisfied', () => {
    const result = solve(createConstruction(brazierSpec()));
    const xs = Object.values(result.parts)
      .map(p => geometricCenter(p.closedContour || p.spine)[0]);
    const maxDiff = Math.max(...xs) - Math.min(...xs);
    expect(maxDiff).toBeLessThan(0.01);
  });

  it('is deterministic (100 iterations)', () => {
    const construction = createConstruction(brazierSpec());
    const first = JSON.stringify(solve(construction));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(solve(construction))).toBe(first);
    }
  });

  it('trySolve returns error instead of throwing', () => {
    const { result, error } = trySolve(null);
    expect(result).toBeNull();
    expect(error).toMatchObject({
      name: 'BytecodeError',
      bytecode: expect.stringMatching(/^PB-ERR-v1-FORMULA-/),
    });
  });

  it('deep-freezes the complete solver result graph', () => {
    const result = solve(createConstruction(brazierSpec()));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.parts)).toBe(true);
    expect(Object.isFrozen(result.parts.rim)).toBe(true);
    expect(Object.isFrozen(result.parts.rim.closedContour)).toBe(true);
    expect(Object.isFrozen(result.parts.rim.closedContour[0])).toBe(true);
    expect(Object.isFrozen(result.parts.rim.measurements)).toBe(true);
    expect(Object.isFrozen(result.validationReport)).toBe(true);
    expect(Object.isFrozen(result.validationReport.checks)).toBe(true);
    expect(Object.isFrozen(result.validationReport.failures)).toBe(true);
  });

  it('refuses solved geometry outside the canvas when containment is required', () => {
    const spec = brazierSpec();
    spec.parts[0].primitive.radiusX = 20;
    spec.validation.requireCanvasContainment = true;

    expectRefusal(() => solve(createConstruction(spec)), /^PB-ERR-v1-COORD-/);
  });

  it('refuses circular dependencies', () => {
    const spec = brazierSpec();
    spec.parts = [
      {
        id: 'a',
        primitive: {
          kind: 'offset-contour',
          source: { ref: 'b', point: 'center' },
          distance: 1,
          side: 1,
        },
      },
      {
        id: 'b',
        primitive: {
          kind: 'offset-contour',
          source: { ref: 'a', point: 'center' },
          distance: 1,
          side: 1,
        },
      },
    ];
    spec.constraints = [];
    spec.validation.closedParts = [];
    expectRefusal(() => createConstruction(spec), /^PB-ERR-v1-STATE-/);
  });

  it('solves within 100ms for ≤20 parts on 64×64', () => {
    const spec = brazierSpec();
    spec.canvas = { width: 64, height: 64 };
    const construction = createConstruction(spec);

    const start = performance.now();
    solve(construction);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 5: Wand Integration
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 5: Wand Integration', () => {
  it('FORMULA_TYPES includes CONSTRUCTION_REQUEST', async () => {
    const { FORMULA_TYPES } = await import('../../../../../codex/core/pixelbrain/image-to-bytecode-formula.js');
    expect(FORMULA_TYPES.CONSTRUCTION_REQUEST).toBe('construction_request');
  });

  it('evaluateFormula handles construction_request', async () => {
    const { evaluateFormula } = await import('../../../../../codex/core/pixelbrain/formula-to-coordinates.js');
    const formula = {
      coordinateFormula: {
        type: 'construction_request',
        construction: brazierSpec(),
      },
    };
    const coords = evaluateFormula(
      formula,
      { width: 24, height: 20 },
      0,
      { geometryConstructionEnabled: true },
    );
    expect(coords.length).toBeGreaterThan(0);
    expect(coords[0].source).toBe('construction');
    expect(coords[0].constructionId).toBe('scholomance-brazier');
  });

  it('construction coordinates carry geometric metadata', async () => {
    const { evaluateFormula } = await import('../../../../../codex/core/pixelbrain/formula-to-coordinates.js');
    const formula = {
      coordinateFormula: {
        type: 'construction_request',
        construction: brazierSpec(),
      },
    };
    const coords = evaluateFormula(
      formula,
      { width: 24, height: 20 },
      0,
      { geometryConstructionEnabled: true },
    );
    const withTangent = coords.filter(c => c.tangent);
    expect(withTangent.length).toBeGreaterThan(0);
  });

  it('keeps construction solving disabled unless explicitly enabled', async () => {
    const { evaluateFormula } = await import('../../../../../codex/core/pixelbrain/formula-to-coordinates.js');
    const formula = {
      coordinateFormula: {
        type: 'construction_request',
        construction: brazierSpec(),
      },
    };

    expectRefusal(() => evaluateFormula(formula, { width: 24, height: 20 }), /^PB-ERR-v1-FORMULA-/);
    expectRefusal(() => evaluateFormula(
      formula,
      { width: 24, height: 20 },
      0,
      { geometryConstructionEnabled: false },
    ), /^PB-ERR-v1-FORMULA-/);
  });

  it('rejects the legacy flattened construction dialect', async () => {
    const { evaluateFormula } = await import('../../../../../codex/core/pixelbrain/formula-to-coordinates.js');
    const { id: constructionId, canvas: _canvas, ...legacy } = brazierSpec();
    const formula = {
      coordinateFormula: {
        type: 'construction_request',
        constructionId,
        ...legacy,
      },
    };

    expectRefusal(() => evaluateFormula(
      formula,
      { width: 24, height: 20 },
      0,
      { geometryConstructionEnabled: true },
    ), /^PB-ERR-v1-FORMULA-/);
  });

  it('existing formula types still work (backward compat)', async () => {
    const { evaluateFormula } = await import('../../../../../codex/core/pixelbrain/formula-to-coordinates.js');
    const formula = {
      coordinateFormula: {
        type: 'parametric_curve',
        parameters: {
          xFormula: 't * 10',
          yFormula: 'sin(t) * 5',
          tMin: 0,
          tMax: 6.28,
          steps: 20,
        },
      },
    };
    const withoutFlag = evaluateFormula(formula, { width: 24, height: 20 });
    const withFlag = evaluateFormula(
      formula,
      { width: 24, height: 20 },
      0,
      { geometryConstructionEnabled: true },
    );
    expect(withoutFlag.length).toBeGreaterThan(0);
    expect(withFlag).toEqual(withoutFlag);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 6: Controlled Modifiers
// ═══════════════════════════════════════════════════════════════════════

describe('Phase 6: Controlled Chaikin', () => {
  it('smooths a polyline', () => {
    const pts = [[0, 0], [5, 0], [5, 5], [0, 5]];
    const smoothed = applyControlledChaikin(pts, { iterations: 2 });
    expect(smoothed.length).toBeGreaterThan(pts.length);
  });

  it('preserves endpoints for open curves', () => {
    const pts = [[0, 0], [5, 0], [10, 5]];
    const smoothed = applyControlledChaikin(pts, { iterations: 1 });
    expect(smoothed[0]).toEqual([0, 0]);
    expect(smoothed[smoothed.length - 1]).toEqual([10, 5]);
  });

  it('respects maximumDeviation', () => {
    const pts = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const smoothed = applyControlledChaikin(pts, {
      iterations: 3,
      maximumDeviation: 0.5,
    });
    // All smoothed points should be within 0.5 of some original point
    for (const sp of smoothed) {
      const minD = Math.min(...pts.map(op => dist(sp, op)));
      expect(minD).toBeLessThanOrEqual(0.5 + 0.01);
    }
  });

  it('is deterministic (100 iterations)', () => {
    const pts = [[0, 0], [5, 2], [10, 0], [15, 3]];
    const first = JSON.stringify(applyControlledChaikin(pts, { iterations: 2 }));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(applyControlledChaikin(pts, { iterations: 2 }))).toBe(first);
    }
  });
});

describe('Phase 6: Offset from Centerline', () => {
  it('derives left and right banks from a spine', () => {
    const spine = [[0, 0], [5, 0], [10, 0]];
    const left = offsetFromCenterline(spine, 2, 1);
    const right = offsetFromCenterline(spine, 2, -1);

    expect(left.length).toBe(3);
    expect(right.length).toBe(3);

    // perp([1,0]) = [0,1], so left bank (side=1) is at y=+2, right (side=-1) at y=-2
    expect(left[1][1]).toBeCloseTo(2, 1);
    expect(right[1][1]).toBeCloseTo(-2, 1);
  });

  it('handles closed spines', () => {
    const spine = [[0, 0], [5, 0], [5, 5], [0, 5]];
    const offset = offsetFromCenterline(spine, 1, 1, { closed: true });
    expect(offset.length).toBe(4);
  });

  it('is deterministic (100 iterations)', () => {
    const spine = [[0, 0], [3, 1], [6, 0], [9, 2]];
    const first = JSON.stringify(offsetFromCenterline(spine, 1.5, 1));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(offsetFromCenterline(spine, 1.5, 1))).toBe(first);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CROSS-CUTTING: Geometry Utils
// ═══════════════════════════════════════════════════════════════════════

describe('Geometry Utils', () => {
  it('findSelfIntersections detects crossings', () => {
    // Figure-8: self-intersecting
    const fig8 = [[0, 0], [5, 5], [5, 0], [0, 5]];
    const hits = findSelfIntersections(fig8, false);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('findSelfIntersections returns empty for simple polygon', () => {
    const square = [[0, 0], [5, 0], [5, 5], [0, 5]];
    const hits = findSelfIntersections(square, true);
    expect(hits.length).toBe(0);
  });

  it('signedArea is positive for CCW, negative for CW', () => {
    const ccw = [[0, 0], [5, 0], [5, 5], [0, 5]];
    expect(signedArea(ccw)).toBeGreaterThan(0);

    const cw = [[0, 0], [0, 5], [5, 5], [5, 0]];
    expect(signedArea(cw)).toBeLessThan(0);
  });

  it('centroid computes correctly', () => {
    const pts = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const c = centroid(pts);
    expect(c[0]).toBeCloseTo(2, 5);
    expect(c[1]).toBeCloseTo(2, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CROSS-CUTTING: raster-core export
// ═══════════════════════════════════════════════════════════════════════

describe('raster-core: computeVectorIdentity export', () => {
  it('is exported and callable', async () => {
    const { computeVectorIdentity } = await import('../../../../../codex/core/pixelbrain/scdl/render/raster-core.js');
    expect(typeof computeVectorIdentity).toBe('function');

    const vi = computeVectorIdentity(
      { op: 'ellipse', cx: 12, cy: 10, rx: 5, ry: 3 },
      12, 7
    );
    expect(vi).not.toBeNull();
    expect(vi.signedDistance).toBeDefined();
    expect(vi.tangent).toBeDefined();
    expect(vi.normal).toBeDefined();
  });
});

// ─── Authoring ergonomics ────────────────────────────────────────────────────

describe('validation laws are opt-in', () => {
  const bell = (overrides = {}) => ({
    id: 'bell-minimal',
    canvas: { width: 24, height: 24 },
    anchors: { domeCenter: [11.5, 13], clapperCenter: [11.5, 23] },
    parts: [
      { id: 'dome', primitive: { kind: 'ellipse', center: { anchor: 'domeCenter' }, radiusX: 7, radiusY: 7 } },
      { id: 'mouth', primitive: { kind: 'conic-bowl', topRef: { ref: 'dome', point: 'bottomCenter' }, depth: { ratio: { reference: 14, value: 0.5 } } } },
      { id: 'clapper', primitive: { kind: 'ellipse', center: { anchor: 'clapperCenter' }, radiusX: 1.5, radiusY: 1.5 } },
    ],
    constraints: [
      { kind: 'coaxial', parts: ['dome', 'mouth'] },
      { kind: 'contained', inner: 'clapper', outer: 'mouth' },
    ],
    ...overrides,
  });

  it('accepts a spec with no validation block at all', () => {
    // `validation` used to be mandatory, so a first attempt always refused.
    expect(() => createConstruction(bell())).not.toThrow();
  });

  it('accepts a partial validation block without demanding the other laws', () => {
    // Supplying one law used to cascade into "must be" errors for the other four.
    expect(() => createConstruction(bell({ validation: { forbidSelfIntersections: true } }))).not.toThrow();
  });

  it('records an omitted law as explicitly inert rather than leaving it undefined', () => {
    const packet = createConstruction(bell());
    expect(packet.validation).toEqual({
      closedParts: [],
      forbidSelfIntersections: false,
      minimumCurvatureRadius: 0,
      requireConnectedAssembly: false,
    });
  });

  it('never turns an omitted law into a refusal', () => {
    const solved = trySolve(createConstruction(bell()));
    expect(solved.error).toBeNull();
  });

  it('still verifies the constraints the author did write', () => {
    // A clapper too big and too high genuinely escapes the bowl.
    const escaping = bell({
      anchors: { domeCenter: [11.5, 13], clapperCenter: [11.5, 21] },
    });
    escaping.parts = escaping.parts.map(p => (p.id === 'clapper'
      ? { ...p, primitive: { ...p.primitive, radiusX: 2, radiusY: 2 } }
      : p));
    const solved = trySolve(createConstruction(escaping));
    expect(solved.error).not.toBeNull();
  });

  it('rejects a validation block that is not an object', () => {
    expect(() => createConstruction(bell({ validation: [] }))).toThrow();
    expect(() => createConstruction(bell({ validation: 'strict' }))).toThrow();
  });

  it('still type-checks the laws that are supplied', () => {
    expect(() => createConstruction(bell({ validation: { forbidSelfIntersections: 'yes' } }))).toThrow();
    expect(() => createConstruction(bell({ validation: { consistentWinding: 'sideways' } }))).toThrow();
    expect(() => createConstruction(bell({ validation: { minimumCurvatureRadius: -1 } }))).toThrow();
  });
});

describe('refusals are legible without decoding the payload', () => {
  it('puts the failing constraint and its witness point in the message', () => {
    const spec = {
      // The bowl's apex sits at the dome's bottomCenter and widens downward, so a
      // radius-2 ball centred 8 cells below the dome centre pokes out near the apex.
      id: 'escape', canvas: { width: 24, height: 24 },
      anchors: { a: [11.5, 13], b: [11.5, 21] },
      parts: [
        { id: 'dome', primitive: { kind: 'ellipse', center: { anchor: 'a' }, radiusX: 7, radiusY: 7 } },
        { id: 'mouth', primitive: { kind: 'conic-bowl', topRef: { ref: 'dome', point: 'bottomCenter' }, depth: { ratio: { reference: 14, value: 0.5 } } } },
        { id: 'ball', primitive: { kind: 'ellipse', center: { anchor: 'b' }, radiusX: 2, radiusY: 2 } },
      ],
      constraints: [{ kind: 'contained', inner: 'ball', outer: 'mouth' }],
    };
    const solved = trySolve(createConstruction(spec));
    expect(solved.error).not.toBeNull();
    const msg = solved.error.message;
    expect(msg).toContain('PB-GEOMETRY-CONSTRUCTION-v1');
    expect(msg).toContain('contained');
    expect(msg).toMatch(/lies outside/);
    // the machine-readable form is kept, not replaced
    expect(msg).toContain('PB-ERR-v1-');
    expect(solved.error.bytecode).toMatch(/^PB-ERR-v1-/);
  });

  it('lists every schema problem at once instead of one per attempt', () => {
    let thrown = null;
    try {
      createConstruction({
        id: 'broken', canvas: { width: 16, height: 16 },
        anchors: { a: [8, 8] },
        parts: [{ id: 'bowl', primitive: { kind: 'conic-bowl', topRef: { part: 'x', point: 'y' }, depth: { ratio: 0.5 } } }],
        constraints: [],
      });
    } catch (e) { thrown = e; }
    expect(thrown).not.toBeNull();
    expect(thrown.message).toContain('topRef must be a PartPointRef');
    expect(thrown.message).toContain('depth must be a RatioSpec');
  });

  it('names the fields a PartPointRef needs', () => {
    let thrown = null;
    try {
      createConstruction({
        id: 'broken', canvas: { width: 16, height: 16 },
        anchors: { a: [8, 8] },
        parts: [{ id: 'bowl', primitive: { kind: 'conic-bowl', topRef: { part: 'x', point: 'y' }, depth: { ratio: { reference: 8, value: 0.5 } } } }],
        constraints: [],
      });
    } catch (e) { thrown = e; }
    // "must be a PartPointRef" alone gave no way to tell it wanted `ref`, not `part`.
    expect(thrown.message).toContain('ref:');
    expect(thrown.message).toContain('point:');
  });
});
