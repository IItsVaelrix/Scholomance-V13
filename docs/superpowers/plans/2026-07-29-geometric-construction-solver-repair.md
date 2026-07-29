# Geometric Construction Solver Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair `PB-GEOMETRY-CONSTRUCTION-v1` so one canonical Wand envelope produces lawful, deterministic, deeply immutable geometry or a structured `PB-ERR-v1` refusal.

**Architecture:** A strict construction boundary validates the complete graph, clones and quantizes accepted input, hashes recursive key-sorted canonical JSON with the existing isomorphic SHA-256 implementation, and deep-freezes the packet. The solver constructs in dependency order, applies only deterministic translation constraints, verifies all constraints after transforms, validates the result, and returns a deeply frozen checksummed result. Wand integration remains explicitly default-off and leaves every non-construction formula path unchanged.

**Tech Stack:** JavaScript ES modules, Vitest, existing PixelBrain `BytecodeError`, existing pure-JS `sha256Hex`, Markdown schema/PDR/PIR contracts.

## Global Constraints

- The only Wand boundary is `{ coordinateFormula: { type: "construction_request", construction: { id, canvas?, anchors, parts, constraints, validation } } }`.
- `createConstruction()` receives a complete input with `canvas`.
- Flattened and `{ constructor, profile, behavior }` request dialects are invalid.
- Construction failures use registered `PB-ERR-v1` categories only: `VALUE`, `RANGE`, `STATE`, `FORMULA`, and `COORD`.
- Do not introduce `PB-OK-v1` or `PB-WARN-v1`.
- Construction and result identities use `sha256-canonical-v1:<64 lowercase hex>`.
- Object keys sort recursively; array order is preserved; unsupported and cyclic values are rejected.
- Construction packets and solver results are defensively cloned and recursively frozen.
- Missing anchors, parts, named points, validation references, and dependency cycles refuse before solving.
- The feature flag is `geometryConstructionEnabled`; its default is `false`.
- Non-construction formula output must be unchanged for both flag values.
- Constraint tolerance defaults to `0.01` cells and is always finite and non-negative.
- Tangency resolves the declared named points, symmetry checks reflected counterparts, containment uses polygon geometry, and ratio resolves declared dotted properties.
- All transforms are followed by complete constraint re-verification.
- The solver is pure: no environment reads, I/O, persistence, event emission, or mutable module state.

---

### Task 1: Lawful Construction Errors and Canonical Packet Identity

**Files:**
- Create: `codex/core/pixelbrain/construction/construction-error.js`
- Modify: `codex/core/pixelbrain/construction/construction-schema.js:10-162`
- Modify: `codex/core/pixelbrain/construction/index.js:6-15`
- Test: `tests/codex/core/pixelbrain/construction/construction-solver.test.js:126-205`

**Interfaces:**
- Consumes: `BytecodeError`, `ERROR_CATEGORIES`, `ERROR_SEVERITY`, `MODULE_IDS`, and `ERROR_CODES` from `codex/core/pixelbrain/bytecode-error.js`; `sha256Hex(string)` from `codex/core/pixelbrain/sha256.js`.
- Produces: `constructionError(category, reason, context)`, `canonicalConstructionStringify(value)`, `deepCloneAndFreeze(value)`, and `computeConstructionChecksum(fields)`.

- [ ] **Step 1: Write failing tests for bytecode errors, key-order identity, unsupported values, defensive cloning, and recursive freezing**

```js
it('uses canonical SHA-256 independent of recursive object key order', () => {
  const first = brazierSpec();
  const second = brazierSpec();
  second.anchors['rim.center'] = Object.assign([], first.anchors['rim.center']);
  second.parts[0].primitive = {
    radiusY: first.parts[0].primitive.radiusY,
    center: first.parts[0].primitive.center,
    kind: first.parts[0].primitive.kind,
    radiusX: first.parts[0].primitive.radiusX,
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
  expect(() => createConstruction(input)).toThrow(/^PB-ERR-v1-RANGE-/);
});

it('rejects unsupported canonical values', () => {
  const input = brazierSpec();
  input.parts[0].primitive.extra = new Map();
  expect(() => createConstruction(input)).toThrow(/^PB-ERR-v1-VALUE-/);
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail for the current FNV identity and shallow freeze**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "canonical SHA-256|defensively clones|non-finite geometry|unsupported canonical"
```

Expected: failures showing `scd64:<8hex>`, mutable nested objects, and non-bytecode validation errors.

- [ ] **Step 3: Add the construction error factory**

```js
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../bytecode-error.js';

const CODE_BY_CATEGORY = Object.freeze({
  [ERROR_CATEGORIES.VALUE]: ERROR_CODES.INVALID_VALUE,
  [ERROR_CATEGORIES.RANGE]: ERROR_CODES.OUT_OF_BOUNDS,
  [ERROR_CATEGORIES.STATE]: ERROR_CODES.INVALID_STATE,
  [ERROR_CATEGORIES.FORMULA]: ERROR_CODES.FORMULA_EVAL_FAIL,
  [ERROR_CATEGORIES.COORD]: ERROR_CODES.COORD_INVALID,
});

export function constructionError(category, reason, context = {}) {
  return new BytecodeError(
    category,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.COORD_MAP,
    CODE_BY_CATEGORY[category],
    { contract: 'PB-GEOMETRY-CONSTRUCTION-v1', reason, ...context },
  );
}
```

- [ ] **Step 4: Replace insertion-order FNV identity and shallow freezing**

```js
import { sha256Hex } from '../sha256.js';
import { constructionError } from './construction-error.js';

export function canonicalConstructionStringify(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw constructionError('RANGE', 'non-finite canonical number');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== 'object' || ArrayBuffer.isView(value)
      || value instanceof Map || value instanceof Set) {
    throw constructionError('VALUE', 'unsupported canonical value');
  }
  if (seen.has(value)) throw constructionError('STATE', 'cyclic construction graph');
  seen.add(value);
  const encoded = Array.isArray(value)
    ? `[${value.map(entry => canonicalConstructionStringify(entry, seen)).join(',')}]`
    : `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) throw constructionError('VALUE', 'undefined canonical value', { key });
      return `${JSON.stringify(key)}:${canonicalConstructionStringify(value[key], seen)}`;
    }).join(',')}}`;
  seen.delete(value);
  return encoded;
}

export function deepCloneAndFreeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepCloneAndFreeze));
  }
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepCloneAndFreeze(entry)]),
    ));
  }
  return value;
}

export function computeConstructionChecksum(fields) {
  const identity = {
    contract: CONSTRUCTION_CONTRACT,
    version: CONSTRUCTION_VERSION,
    solverVersion: SOLVER_VERSION,
    id: fields.id,
    canvas: fields.canvas,
    anchors: fields.anchors,
    parts: fields.parts,
    constraints: fields.constraints,
    validation: fields.validation,
  };
  return `sha256-canonical-v1:${sha256Hex(canonicalConstructionStringify(identity))}`;
}
```

- [ ] **Step 5: Run Task 1 tests and commit**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "Construction IR Schema"
```

Expected: Task 1 tests pass.

Commit:

```bash
git add codex/core/pixelbrain/construction/construction-error.js codex/core/pixelbrain/construction/construction-schema.js codex/core/pixelbrain/construction/index.js tests/codex/core/pixelbrain/construction/construction-solver.test.js
git commit -m "fix: canonicalize construction packets"
```

---

### Task 2: Complete Graph and Primitive Validation

**Files:**
- Create: `codex/core/pixelbrain/construction/construction-validation.js`
- Modify: `codex/core/pixelbrain/construction/construction-schema.js:16-133`
- Modify: `codex/core/pixelbrain/construction/solver-orchestrator.js:43-96`
- Test: `tests/codex/core/pixelbrain/construction/construction-solver.test.js:160-240,700-750`

**Interfaces:**
- Consumes: the eleven registered primitive kinds, fifteen constraint kinds, and `constructionError()`.
- Produces: `validateConstructionSpec(spec): { valid, errors }`, `assertValidConstructionSpec(spec): void`, and `computePartDependencies(parts): Map<string, Set<string>>`.

- [ ] **Step 1: Write failing table tests for ranges, references, named points, validation IDs, and cycles**

```js
it.each([
  ['zero canvas', spec => { spec.canvas.width = 0; }, 'RANGE'],
  ['duplicate part', spec => { spec.parts.push(structuredClone(spec.parts[0])); }, 'VALUE'],
  ['missing anchor', spec => { spec.parts[0].primitive.center.anchor = 'ghost'; }, 'STATE'],
  ['missing part', spec => { spec.parts[1].primitive.topRef.ref = 'ghost'; }, 'STATE'],
  ['illegal named point', spec => { spec.parts[1].primitive.topRef.point = 'ghost'; }, 'STATE'],
  ['invalid radius', spec => { spec.parts[0].primitive.radiusX = -1; }, 'RANGE'],
  ['invalid validation part', spec => { spec.validation.closedParts.push('ghost'); }, 'STATE'],
])('refuses %s before solving', (_name, mutate, category) => {
  const spec = brazierSpec();
  mutate(spec);
  expect(() => createConstruction(spec)).toThrow(new RegExp(`^PB-ERR-v1-${category}-`));
});

it('refuses dependency cycles during packet creation', () => {
  const spec = cycleSpec();
  expect(() => createConstruction(spec)).toThrow(/^PB-ERR-v1-STATE-/);
});
```

- [ ] **Step 2: Run the validation tests and confirm missing references currently pass**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "refuses .* before solving|dependency cycles"
```

Expected: failures for unresolved references, illegal named points, and cycles.

- [ ] **Step 3: Implement declarative primitive and named-point rules**

```js
export const NAMED_POINTS_BY_KIND = Object.freeze({
  ellipse: Object.freeze(['center', 'topCenter', 'bottomCenter', 'left', 'right']),
  'conic-bowl': Object.freeze(['topCenter', 'bottomCenter', 'left', 'right', 'center']),
  'tapered-ribbon': Object.freeze(['start', 'end', 'startLeft', 'startRight', 'endLeft', 'endRight', 'center']),
  capsule: Object.freeze(['start', 'end', 'center', 'topCenter', 'bottomCenter', 'left', 'right']),
  'width-profile-ribbon': Object.freeze(['start', 'end', 'center', 'startLeft', 'startRight', 'endLeft', 'endRight']),
  'branch-graph': Object.freeze(['root', 'tip', 'center']),
  'radial-shard-cluster': Object.freeze(['center', 'topShard']),
  'architectural-module-stack': Object.freeze(['base', 'top', 'center']),
  'offset-contour': Object.freeze(['center']),
  'rounded-polygon': Object.freeze(['center']),
  'bezier-chain': Object.freeze(['start', 'end', 'center']),
});

const positive = value => Number.isFinite(value) && value > 0;
const anchorRef = value => value && typeof value.anchor === 'string';
const partRef = value => value && typeof value.ref === 'string' && typeof value.point === 'string';
```

Use the following complete validator registry; each helper appends
`{ category, reason, context }` to the supplied error array:

```js
const PRIMITIVE_VALIDATORS = Object.freeze({
  ellipse: (p, e) => {
    requireAnchorRef(p.center, 'center', e);
    requirePositive(p.radiusX, 'radiusX', e);
    requirePositive(p.radiusY, 'radiusY', e);
  },
  'conic-bowl': (p, e) => {
    requirePartPointRef(p.topRef, 'topRef', e);
    requireRatioSpec(p.depth, 'depth', e);
  },
  'tapered-ribbon': (p, e) => {
    requirePointRef(p.start, 'start', e);
    requirePointRef(p.end, 'end', e);
    requirePositive(p.startWidth, 'startWidth', e);
    requirePositive(p.endWidth, 'endWidth', e);
  },
  capsule: (p, e) => {
    requireAnchorRef(p.start, 'start', e);
    requireAnchorRef(p.end, 'end', e);
    requirePositive(p.radius, 'radius', e);
  },
  'width-profile-ribbon': (p, e) => {
    requireArray(p.spine, 'spine', 2, e);
    p.spine?.forEach((ref, index) => requireAnchorRef(ref, `spine[${index}]`, e));
    requireArray(p.profile, 'profile', 2, e);
    p.profile?.forEach((value, index) => requirePositive(value, `profile[${index}]`, e));
  },
  'branch-graph': (p, e) => {
    requireAnchorRef(p.root, 'root', e);
    validateBranches(p.branches, 0, e);
  },
  'radial-shard-cluster': (p, e) => {
    requireAnchorRef(p.center, 'center', e);
    requirePositiveInteger(p.count, 'count', e);
    requireNonNegative(p.innerRadius, 'innerRadius', e);
    requirePositive(p.outerRadius, 'outerRadius', e);
    if (p.outerRadius <= p.innerRadius) pushRange(e, 'outerRadius must exceed innerRadius');
  },
  'architectural-module-stack': (p, e) => {
    if (p.base) requireAnchorRef(p.base, 'base', e);
    requireArray(p.modules, 'modules', 1, e);
    p.modules?.forEach((module, index) => {
      requirePositive(module.width, `modules[${index}].width`, e);
      requirePositive(module.height, `modules[${index}].height`, e);
    });
  },
  'offset-contour': (p, e) => {
    requirePartPointRef(p.source, 'source', e);
    requirePositive(p.distance, 'distance', e);
    if (p.side !== 1 && p.side !== -1) pushValue(e, 'side must be 1 or -1');
  },
  'rounded-polygon': (p, e) => {
    requireArray(p.points, 'points', 3, e);
    p.points?.forEach((ref, index) => requireAnchorRef(ref, `points[${index}]`, e));
    requirePositive(p.cornerRadius, 'cornerRadius', e);
  },
  'bezier-chain': (p, e) => {
    if (p.degree !== 2 && p.degree !== 3) pushValue(e, 'degree must be 2 or 3');
    requireArray(p.controlPoints, 'controlPoints', (p.degree ?? 3) + 1, e);
    p.controlPoints?.forEach((ref, index) => requireAnchorRef(ref, `controlPoints[${index}]`, e));
  },
});

function validateBranches(branches, depth, errors) {
  requireArray(branches, 'branches', 1, errors);
  if (!Array.isArray(branches)) return;
  if (depth > 6) {
    pushRange(errors, 'branch depth exceeds 6');
    return;
  }
  branches.forEach((branch, index) => {
    requireFinite(branch.angle ?? 0, `branches[${index}].angle`, errors);
    requirePositive(branch.length, `branches[${index}].length`, errors);
    if (branch.children) validateBranches(branch.children, depth + 1, errors);
  });
}

export function computePartDependencies(parts) {
  const ids = new Set(parts.map(part => part.id));
  const dependencies = new Map(parts.map(part => [part.id, new Set()]));
  const visit = (owner, value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.ref === 'string' && ids.has(value.ref)) {
      dependencies.get(owner).add(value.ref);
    }
    Object.values(value).forEach(entry => visit(owner, entry));
  };
  parts.forEach(part => visit(part.id, part.primitive));
  return dependencies;
}
```

Constraint validation uses an exhaustive `switch (constraint.kind)`. It checks
`parts.length >= 2` for `coaxial`; `a`/`b` part IDs for
`connected`, `concentric`, `parallel`, `perpendicular`, `equal-length`, and
`minimum-distance`; `PartPointRef` operands for `tangent` and `coincident`;
an existing axis anchor plus optional existing `parts` for symmetry kinds;
existing `inner`/`outer` for `contained`; dotted `a`/`b` strings and a positive
finite `value` for `ratio`; an existing `part` plus non-negative finite value
for `maximum-curvature`; and an existing `part` plus
`increasing | decreasing` for `monotonic-taper`. After reference validation,
Kahn traversal over `computePartDependencies()` must visit every part or append
a `STATE` cycle error. `validateConstructionSpec()` returns the rendered
diagnostics; `assertValidConstructionSpec()` throws `constructionError()` for
the first categorized error.

- [ ] **Step 4: Run Task 2 tests and commit**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "Construction IR Schema|dependency"
```

Expected: all schema and dependency tests pass.

Commit:

```bash
git add codex/core/pixelbrain/construction/construction-validation.js codex/core/pixelbrain/construction/construction-schema.js codex/core/pixelbrain/construction/solver-orchestrator.js tests/codex/core/pixelbrain/construction/construction-solver.test.js
git commit -m "fix: validate complete construction graphs"
```

---

### Task 3: Exact Constraint Semantics and Post-Transform Reverification

**Files:**
- Modify: `codex/core/pixelbrain/construction/geometry-utils.js:17-269`
- Replace: `codex/core/pixelbrain/construction/constraint-solver.js:1-378`
- Modify: `codex/core/pixelbrain/construction/validation-laws.js:1-180`
- Test: `tests/codex/core/pixelbrain/construction/construction-solver.test.js:540-660`

**Interfaces:**
- Produces: `minimumContourDistance(a, b)`, `contoursIntersect(a, b)`, `nearestContourIndex(part, point)`, `resolveMetric(parts, "part.property")`, `applyTransformConstraints(parts, constraints, anchors)`, and `verifyConstraints(parts, constraints, anchors)`.
- `solveConstraints()` remains the compatibility export and returns `{ failures }` after transforms plus full verification.

- [ ] **Step 1: Write failing regressions for named-point tangent, symmetry, containment, ratio, references, and transform invalidation**

```js
it('checks tangent vectors nearest the declared named join points', () => {
  const parts = tangentFixtureWithWrongIndexZero();
  const result = solveConstraints(parts, [{
    kind: 'tangent',
    a: { ref: 'a', point: 'join' },
    b: { ref: 'b', point: 'join' },
  }]);
  expect(result.failures).toEqual([]);
});

it('rejects an asymmetric contour without deforming it', () => {
  const parts = { shape: polygonPart([[0, 0], [2, 0], [2, 2], [0, 1], [0, 0]]) };
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
  const parts = concaveContainmentFixture();
  const result = solveConstraints(parts, [{ kind: 'contained', inner: 'inner', outer: 'outer' }]);
  expect(result.failures[0].reason).toContain('outside');
});

it('verifies dotted metric ratios', () => {
  const parts = {
    a: metricPart({ depth: 6.18 }),
    b: metricPart({ radiusX: 10 }),
  };
  expect(solveConstraints(parts, [{
    kind: 'ratio', a: 'a.depth', b: 'b.radiusX', value: 0.618,
  }]).failures).toEqual([]);
});
```

- [ ] **Step 2: Run the constraint regressions and confirm the no-op/AABB/index-zero behavior fails**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "declared named join|without deforming|AABB-only|dotted metric"
```

Expected: all four new regressions fail.

- [ ] **Step 3: Add reusable exact geometry helpers**

```js
export function pointOnSegment(point, a, b, tolerance = 0.01) {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [point[0] - a[0], point[1] - a[1]];
  return Math.abs(cross(ab, ap)) <= tolerance
    && point[0] >= Math.min(a[0], b[0]) - tolerance
    && point[0] <= Math.max(a[0], b[0]) + tolerance
    && point[1] >= Math.min(a[1], b[1]) - tolerance
    && point[1] <= Math.max(a[1], b[1]) + tolerance;
}

export function polygonContainsPoint(point, polygon, tolerance = 0.01) {
  for (let i = 0; i < polygon.length; i += 1) {
    if (pointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length], tolerance)) return true;
  }
  return pointInPolygon(point, polygon);
}
```

Add these deterministic helpers:

```js
export function contoursIntersect(a, b) {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentIntersection(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

export function minimumContourDistance(a, b) {
  let minimum = Infinity;
  for (const pointA of a) {
    for (const pointB of b) minimum = Math.min(minimum, dist(pointA, pointB));
  }
  return minimum;
}

export function nearestPointIndex(points, target) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const candidate = dist(point, target);
    if (candidate < bestDistance) {
      bestDistance = candidate;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function hasReflectedCounterpart(point, contour, axisX, tolerance = 0.01) {
  const reflected = [2 * axisX - point[0], point[1]];
  return contour.some(candidate => dist(reflected, candidate) <= tolerance);
}
```

- [ ] **Step 4: Split mutation from verification and verify all fifteen kinds**

```js
export function solveConstraints(parts, constraints, anchors = {}) {
  const transformFailures = applyTransformConstraints(parts, constraints, anchors);
  const verificationFailures = verifyConstraints(parts, constraints, anchors);
  return { failures: [...transformFailures, ...verificationFailures] };
}
```

Transform only `coaxial`, `concentric`, `coincident`, and `connected`. Verify every constraint afterward. `connected` uses `c.tolerance ?? 0.01`; symmetry never mutates; containment requires every inner point inside/on the outer polygon and no prohibited boundary crossing; `maximum-curvature` compares maximum curvature directly to `c.value`; connected-assembly validation uses `laws.connectionTolerance ?? 0.01`.

- [ ] **Step 5: Run all fifteen constraint tests and commit**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "Constraint Solver|Validation Laws"
```

Expected: all constraint and validation tests pass with no silent skipped references.

Commit:

```bash
git add codex/core/pixelbrain/construction/geometry-utils.js codex/core/pixelbrain/construction/constraint-solver.js codex/core/pixelbrain/construction/validation-laws.js tests/codex/core/pixelbrain/construction/construction-solver.test.js
git commit -m "fix: verify construction constraints exactly"
```

---

### Task 4: Lawful Solver Result, Result Identity, and Canvas Policy

**Files:**
- Modify: `codex/core/pixelbrain/construction/geometry-utils.js:119-151`
- Modify: `codex/core/pixelbrain/construction/solver-orchestrator.js:99-205`
- Modify: `codex/core/pixelbrain/construction/constructors/ellipse.js:16-57`
- Modify: `codex/core/pixelbrain/construction/constructors/conic-bowl.js:20-112`
- Modify: `codex/core/pixelbrain/construction/constructors/tapered-ribbon.js:39-83`
- Test: `tests/codex/core/pixelbrain/construction/construction-solver.test.js:665-750`

**Interfaces:**
- `buildSolvedPart(id, primitiveKind, opts)` accepts `measurements = {}`.
- Solver results expose `resultChecksum`, `constructionChecksum`, deeply frozen parts, validation report, and optional pure `healthEvent`.

- [ ] **Step 1: Write failing result identity, immutability, canvas, and replay tests**

```js
it('deep-freezes solved geometry and returns canonical result identity', () => {
  const result = solve(createConstruction(brazierSpec()));
  expect(result.resultChecksum).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
  expect(Object.isFrozen(result.parts.rim.closedContour[0])).toBe(true);
  expect(() => { result.parts.rim.closedContour[0][0] = 99; }).toThrow();
});

it('refuses out-of-canvas contours when containment is required', () => {
  const spec = brazierSpec();
  spec.validation.requireCanvasContainment = true;
  spec.anchors['rim.center'] = [1, 1];
  expect(() => solve(createConstruction(spec))).toThrow(/^PB-ERR-v1-COORD-/);
});
```

- [ ] **Step 2: Run result tests and confirm shallow result freeze and FNV checksum**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "deep-freezes solved|out-of-canvas|deterministic"
```

Expected: failures for nested mutation, old `scd64` result checksum, and missing canvas enforcement.

- [ ] **Step 3: Attach constructor measurements and compute canonical result identity**

```js
const resultIdentity = {
  constructionId: construction.id,
  solverVersion: SOLVER_VERSION,
  parts: resolvedParts,
  validationReport: finalReport,
  constructionChecksum: construction.checksum,
};
const resultChecksum =
  `sha256-canonical-v1:${sha256Hex(canonicalConstructionStringify(resultIdentity))}`;
return deepCloneAndFreeze({ ...resultIdentity, resultChecksum });
```

Ellipse measurements include `radiusX` and `radiusY`; conic-bowl includes resolved `depth`; tapered-ribbon includes `startWidth` and `endWidth`. `buildSolvedPart()` copies finite measurement scalars so dotted ratio properties resolve without retaining mutable primitive input.

- [ ] **Step 4: Emit categorized refusal and enforce optional canvas containment**

Constraint or validation failures throw `constructionError('STATE', ...)`; out-of-canvas points under `requireCanvasContainment` throw `constructionError('COORD', ...)`; invalid solver packets throw `constructionError('VALUE', ...)`. `trySolve()` returns the same error object without altering it.

- [ ] **Step 5: Run solver tests and commit**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js -t "Solver Orchestrator"
```

Expected: all orchestrator tests pass and 100 replays are byte-identical.

Commit:

```bash
git add codex/core/pixelbrain/construction/geometry-utils.js codex/core/pixelbrain/construction/solver-orchestrator.js codex/core/pixelbrain/construction/constructors/ellipse.js codex/core/pixelbrain/construction/constructors/conic-bowl.js codex/core/pixelbrain/construction/constructors/tapered-ribbon.js tests/codex/core/pixelbrain/construction/construction-solver.test.js
git commit -m "fix: harden construction solver results"
```

---

### Task 5: Canonical Default-Off Wand Integration

**Files:**
- Modify: `codex/core/pixelbrain/formula-to-coordinates.js:27-85,983-1026`
- Modify: `tests/codex/core/pixelbrain/construction/construction-solver.test.js:756-815`
- Modify: `tests/pixelbrain/crystal-stave-blade-integration.test.js:1-26`

**Interfaces:**
- `evaluateFormula(formula, canvasSize, time = 0, options = {})` consumes `options.geometryConstructionEnabled`.
- `evaluateConstructionRequest(formula, canvasSize, options)` consumes only `formula.construction`.

- [ ] **Step 1: Write failing feature-gate and dialect tests**

```js
it('refuses construction when the explicit feature flag is absent', () => {
  const formula = constructionFormula(brazierSpec());
  expect(() => evaluateFormula(formula, { width: 24, height: 20 }))
    .toThrow(/^PB-ERR-v1-FORMULA-/);
});

it('solves only the nested construction envelope when enabled', () => {
  const formula = constructionFormula(brazierSpec());
  const coords = evaluateFormula(formula, { width: 24, height: 20 }, 0, {
    geometryConstructionEnabled: true,
  });
  expect(coords[0].constructionId).toBe('scholomance-brazier');
});

it.each([
  { coordinateFormula: { type: 'construction_request', ...brazierSpec() } },
  { coordinateFormula: { type: 'construction_request', constructor: 'ellipse', profile: {}, behavior: {} } },
])('rejects abandoned construction dialect %#', formula => {
  expect(() => evaluateFormula(formula, { width: 24, height: 20 }, 0, {
    geometryConstructionEnabled: true,
  })).toThrow(/^PB-ERR-v1-FORMULA-/);
});
```

Capture a parametric formula output once and assert it is identical when the flag is omitted, false, and true.

- [ ] **Step 2: Run Wand tests and confirm the current unconditional flattened dispatch fails**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js tests/pixelbrain/crystal-stave-blade-integration.test.js -t "Wand Integration|construction"
```

Expected: default-off, nested-envelope, and dialect tests fail.

- [ ] **Step 3: Implement the explicit gate and nested adapter**

```js
case FORMULA_TYPES.CONSTRUCTION_REQUEST:
  if (options.geometryConstructionEnabled !== true) {
    throw constructionError('FORMULA', 'geometry construction is disabled');
  }
  coordinates = evaluateConstructionRequest(coordinateFormula, canvasSize);
  break;
```

```js
export function evaluateConstructionRequest(formula, canvasSize) {
  if (!formula?.construction || typeof formula.construction !== 'object') {
    throw constructionError('FORMULA', 'construction_request requires nested construction');
  }
  const input = {
    ...formula.construction,
    canvas: formula.construction.canvas ?? canvasSize,
  };
  const result = solve(createConstruction(input));
  return Object.entries(result.parts).flatMap(([partId, part]) => {
    const points = part.closedContour ?? part.spine ?? [];
    return points.map((point, index) => ({
      x: roundTo(point[0], 3),
      y: roundTo(point[1], 3),
      z: 0,
      emphasis: 1,
      source: 'construction',
      constructionId: result.constructionId,
      partId,
      primitiveKind: part.primitiveKind,
      t: points.length > 1 ? index / (points.length - 1) : 0.5,
      tangent: part.tangents?.[index],
      normal: part.surfaceNormals?.[index],
      curvature: part.curvature?.[index],
      arcLength: part.arcLength,
      validationPassed: true,
    }));
  });
}
```

- [ ] **Step 4: Run integration and non-construction regression tests and commit**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js tests/pixelbrain/crystal-stave-blade-integration.test.js
```

Expected: construction integration passes only with the explicit flag; existing formulas remain identical.

Commit:

```bash
git add codex/core/pixelbrain/formula-to-coordinates.js tests/codex/core/pixelbrain/construction/construction-solver.test.js tests/pixelbrain/crystal-stave-blade-integration.test.js
git commit -m "fix: gate canonical Wand construction requests"
```

---

### Task 6: Public Raster Vector Identity

**Files:**
- Modify: `codex/core/pixelbrain/scdl/render/raster-core.js:73`
- Modify: `tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js:1-45`

**Interfaces:**
- Produces: named export `computeVectorIdentity(op, px, py)`.

- [ ] **Step 1: Add a failing export-parity test**

```js
it('exports the ellipse vector identity used by pushCell', () => {
  const op = { op: 'ellipse', cx: 12, cy: 10, rx: 5, ry: 3, color: '#fff', loc: {} };
  const direct = computeVectorIdentity(op, 12, 7);
  const cells = [];
  pushCell(cells, 12, 7, '#fff', {}, op);
  expect(cells[0]).toMatchObject(direct);
});
```

- [ ] **Step 2: Run the test and confirm the import fails**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js
```

Expected: failure because `computeVectorIdentity` is not exported.

- [ ] **Step 3: Add the named export without changing its body**

```js
export function computeVectorIdentity(op, px, py) {
```

- [ ] **Step 4: Run raster and SCDL tests and commit**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js tests/codex/core/pixelbrain/scdl
```

Expected: all raster-core and SCDL tests pass.

Commit:

```bash
git add codex/core/pixelbrain/scdl/render/raster-core.js tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js
git commit -m "fix: export raster vector identity"
```

---

### Task 7: Sovereign Schema, PDR, Archive Index, and PIR

**Files:**
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md:10-18`
- Modify: `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-geometric-construction-solver-pdr.md`
- Modify: `docs/scholomance-encyclopedia/PDR-archive/README.md`
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260729-GEOMETRIC-CONSTRUCTION-SOLVER-REPAIR.md`

**Interfaces:**
- Produces schema contract version `1.35`, a truthful PDR lifecycle state, an exhaustive archive entry, and an evidence-backed PIR.

- [ ] **Step 1: Add schema change notice and authoritative TypeScript contract**

```ts
interface WandConstructionFormula {
  type: "construction_request";
  construction: GeometryConstructionInput;
}

interface GeometryConstructionInput {
  id: string;
  canvas?: { width: number; height: number };
  anchors: Record<string, readonly [number, number]>;
  parts: ConstructionPart[];
  constraints: ConstructionConstraint[];
  validation: ValidationLaws;
}

interface GeometryConstruction extends GeometryConstructionInput {
  contract: "PB-GEOMETRY-CONSTRUCTION-v1";
  version: "1.0.0";
  solverVersion: string;
  canvas: { width: number; height: number };
  checksum: `sha256-canonical-v1:${string}`;
}
```

Register the constraint and result types exactly:

```ts
type ConstructionConstraint =
  | { kind: "coaxial"; parts: string[]; tolerance?: number }
  | { kind: "tangent"; a: PartPointRef; b: PartPointRef; toleranceDegrees?: number }
  | { kind: "coincident"; a: PartPointRef; b: PartPointRef; tolerance?: number }
  | { kind: "connected"; a: string; b: string; tolerance?: number }
  | { kind: "concentric"; a: string; b: string; tolerance?: number }
  | { kind: "parallel"; a: string; b: string; tolerance?: number }
  | { kind: "perpendicular"; a: string; b: string; tolerance?: number }
  | { kind: "symmetric"; axis: AnchorRef; parts?: string[]; tolerance?: number }
  | { kind: "mirror-symmetry"; axis: AnchorRef; parts?: string[]; tolerance?: number }
  | { kind: "contained"; inner: string; outer: string; tolerance?: number }
  | { kind: "equal-length"; a: string; b: string; tolerance?: number }
  | { kind: "ratio"; a: string; b: string; value: number; tolerance?: number }
  | { kind: "minimum-distance"; a: string; b: string; value: number; tolerance?: number }
  | { kind: "maximum-curvature"; part: string; value: number; tolerance?: number }
  | { kind: "monotonic-taper"; part: string; direction: "increasing" | "decreasing"; tolerance?: number };

interface GeometrySolverResult {
  constructionId: string;
  solverVersion: string;
  parts: Record<string, SolvedPart>;
  validationReport: GeometryValidationReport;
  constructionChecksum: `sha256-canonical-v1:${string}`;
  resultChecksum: `sha256-canonical-v1:${string}`;
}

interface GeometryConstructionHealthEvent {
  contract: "PB-GEOMETRY-CONSTRUCTION-HEALTH-v1";
  constructionId: string;
  constructionChecksum?: `sha256-canonical-v1:${string}`;
  resultChecksum?: `sha256-canonical-v1:${string}`;
  passed: boolean;
  errorBytecode: string | null;
}
```

The same notice registers the eleven `PrimitiveSpec` variants already
implemented by the constructor registry, `AnchorRef`, `PartPointRef`,
`ValidationLaws`, `SolvedPart`, and `GeometryValidationReport`. The notice
states that the caller must pass `geometryConstructionEnabled: true` and maps
malformed/unknown values to `VALUE`, numeric bounds to `RANGE`, references and
invariants to `STATE`, feature/refusal evaluation to `FORMULA`, and required
canvas containment to `COORD`.

- [ ] **Step 2: Reconcile the PDR with shipped behavior**

Apply this PDR reconciliation checklist as literal edits:

````md
**Status:** Implemented — repaired 2026-07-29

The only Wand request is:

```js
{
  coordinateFormula: {
    type: "construction_request",
    construction: { id, canvas, anchors, parts, constraints, validation }
  }
}
```

Construction identity is
`sha256-canonical-v1:<64 lowercase hex>` over recursively key-sorted,
quantized semantic content. Accepted packets and results are defensively cloned
and recursively frozen.

Constructor-enforced: tangent, ratio, monotonic-taper, maximum-curvature.
Transform-enforced: coaxial, concentric, coincident, connected.
Verification-only: parallel, perpendicular, symmetric, mirror-symmetry,
contained, equal-length, minimum-distance.

The feature is disabled unless the caller passes
`geometryConstructionEnabled: true`. Shadow comparison uses deterministic
resampling and symmetric Hausdorff distance with an acceptance threshold of
`<= 1.0` cell.
````

Delete the unsupported river example containing `perspective-ribbon`, the
lightweight `{ constructor, profile, behavior }` interface, all flattened
formula examples, the raw-`Error` refusal example, and every `PB-OK-v1` or
`PB-WARN-v1` claim. Replace the final verdict with the verified status above
only after Task 8 focused tests pass; until then use `Repair in progress`.

- [ ] **Step 3: Add the archive entry and implementation report**

Add:

```md
| [`2026-07-25-geometric-construction-solver-pdr.md`](./2026-07-25-geometric-construction-solver-pdr.md) | Implemented — repaired 2026-07-29 | Architectural + PixelBrain + Geometry + Wand | Critical |
```

Create the PIR with these required sections:

```md
# PIR: Geometric Construction Solver Contract Repair

## Change Identity
- Report ID: PIR-20260729-GEOMETRIC-CONSTRUCTION-SOLVER-REPAIR
- Contract: PB-GEOMETRY-CONSTRUCTION-v1
- Schema: 1.34 -> 1.35

## Implemented Contract
- Canonical nested Wand envelope
- Default-off explicit feature gate
- PB-ERR-v1-only refusal
- Recursive canonical SHA-256 identity
- Defensive deep clone and recursive freeze
- Complete graph validation and exact constraint verification

## Changed Files
List every changed production, test, schema, PDR, and archive file.

## Verification Evidence
Record each command, exit code, passing test count, and any failure text.

## Immunity Evidence
Record the scan status for every changed file.

## Residual Findings
Separate unrelated pre-existing failures from construction failures.

## Rollback
Revert the repair commits together; the feature remains default-off.

## Ledger
No durable ledger write was performed by this repair.
```

- [ ] **Step 4: Run documentation hygiene and commit**

Run:

```bash
node docs/scholomance-encyclopedia/tools/audit-hygiene.mjs
```

Expected: no missing archive entry for the geometric-construction PDR. Any unrelated pre-existing hygiene findings are copied verbatim into the PIR.

Commit:

```bash
git add "docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md" docs/scholomance-encyclopedia/PDR-archive/2026-07-25-geometric-construction-solver-pdr.md docs/scholomance-encyclopedia/PDR-archive/README.md docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260729-GEOMETRIC-CONSTRUCTION-SOLVER-REPAIR.md
git commit -m "docs: register geometric construction contract"
```

---

### Task 8: Immune Scan and Full Regression Gate

**Files:**
- Verify all files changed in Tasks 1-7.
- Update: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260729-GEOMETRIC-CONSTRUCTION-SOLVER-REPAIR.md`

**Interfaces:**
- Produces final evidence for the focused solver, formula compatibility, SCDL, type, lint, schema, and encyclopedia gates.

- [ ] **Step 1: Run focused construction and integration suites**

```bash
npx vitest run tests/codex/core/pixelbrain/construction/construction-solver.test.js codex/core/pixelbrain/construction/__tests__/crystal-stave-blade.test.js tests/pixelbrain/crystal-stave-blade-integration.test.js
```

Expected: zero failures.

- [ ] **Step 2: Run raster, SCDL, fusion, and formula regressions**

```bash
npx vitest run tests/codex/core/pixelbrain/scdl tests/pixelbrain tests/qa/pixelbrain tests/qa/modulation/wand-core.test.js
```

Expected: no regression attributable to the construction repair.

- [ ] **Step 3: Run static and documentation gates**

```bash
npm run lint
npm run typecheck
node docs/scholomance-encyclopedia/tools/audit-hygiene.mjs
```

Expected: construction-changed files introduce no lint or type errors; the PDR is indexed. Pre-existing unrelated failures remain explicitly separated.

- [ ] **Step 4: Run an immunity scan over every changed file**

Run the Scholomance MCP immunity scan on each changed file before the final commit. Expected: no blocking pathogen or protocol violation.

- [ ] **Step 5: Record exact evidence in the PIR and commit**

```bash
git add docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260729-GEOMETRIC-CONSTRUCTION-SOLVER-REPAIR.md
git commit -m "docs: record geometric construction verification"
```

## Execution Selection

Inline execution is selected because the user approved proceeding in this session and the active collaboration contract does not authorize unsolicited subagent delegation. Use `superpowers:executing-plans`, retain reviewer checkpoints between tasks, and apply `superpowers:test-driven-development` to every behavior change.
