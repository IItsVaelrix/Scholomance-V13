# PDR - Geometric Construction Solver

**Contract:** `PB-GEOMETRY-CONSTRUCTION-v1`
**Status:** Implemented and verified
**Original date:** 2026-07-25
**Contract repair:** 2026-07-29
**Owner:** Codex architecture, Gemini/backend implementation and QA
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-GEOMETRY-CONSTRUCTION-SOLVER`

## 1. Executive Summary

The geometric construction solver turns human-authored construction intent into
deterministic 2D geometry. It accepts named anchors, a closed vocabulary of
analytic primitives, explicit constraints, and validation laws. It returns
solved parts with contours, centerlines, banks, tangents, normals, curvature,
arc length, measurements, and a validation report.

The implementation is intentionally domain-specific. It does not contain a
general nonlinear optimizer and does not invent geometry. Constructors create
known primitive families, four transform-capable constraints may translate
parts, and every declared constraint is verified after all transforms.

The 2026-07-29 contract repair made the implementation and this PDR agree:

- one canonical, nested Wand request shape;
- explicit default-off feature gating;
- recursive schema validation and dependency-cycle refusal;
- complete SHA-256 identities over canonical JSON;
- recursive freezing of accepted packets and solver results;
- exact post-transform verification for all 15 constraint kinds;
- PB-ERR-v1 refusal at public construction boundaries;
- honest canvas-containment and assembly validation;
- a public raster vector-identity function;
- a canonical migrated crystal-stave Wand asset.

## 2. Problem Statement

Waypoint interpolation can preserve authored marks, but it cannot establish
closure, tangency, symmetry, containment, curvature, ratios, or relationships
between parts. The Wand therefore needs a construction boundary between
authored intent and raster coordinates.

The required layering is:

```text
SCDNA / SCDL intent
  -> PB-GEOMETRY-CONSTRUCTION-v1
  -> deterministic construction solver
  -> solved vector geometry and validation evidence
  -> raster vector identity
  -> RGBA
```

The solver derives coordinates from curated instructions. It never authors a
construction, selects an aesthetic, or treats a failed check as a successful
partial result.

## 3. Goals

- Represent construction intent in one stable contract.
- Validate the complete object graph before solving.
- Produce deterministic, checksummed, immutable outputs.
- Support analytic construction primitives used by current Wand assets.
- Enforce or verify every declared constraint with no silent no-op.
- Preserve all non-construction formula behavior when the feature flag changes.
- Return structured PB-ERR-v1 failures on public construction paths.
- Keep construction solving pure and free of persistent state or I/O.

## 4. Non-Goals

- General-purpose nonlinear constraint optimization.
- Automatic construction generation from prose or images.
- 3D geometry or animation solving.
- Replacing SCDL, the Vixel rasterizer, or visual art direction.
- Treating approximate silhouette comparison as runtime constraint authority.

A shadow or Hausdorff-distance comparison may be used as future review
evidence. It is not part of the v1 runtime acceptance path.

## 5. Canonical Construction Contract

`createConstruction(spec)` is the only packet-authoring boundary. It accepts:

```ts
interface GeometryConstructionSpec {
  id: string;
  canvas: { width: number; height: number };
  anchors: Record<string, [number, number]>;
  parts: ConstructionPart[];
  constraints: ConstructionConstraint[];
  validation: ValidationLaws;
}

interface GeometryConstructionPacket extends GeometryConstructionSpec {
  contract: "PB-GEOMETRY-CONSTRUCTION-v1";
  version: "1.0.0";
  solverVersion: "1.0.0";
  checksum: `sha256-canonical-v1:${string}`;
}
```

Canvas dimensions are integers from 1 through 256. Anchor coordinates and all
numeric primitive fields must be finite. Part IDs are unique. Every reference
must resolve, and the part dependency graph must be acyclic.

The accepted primitive vocabulary is:

```ts
type PrimitiveKind =
  | "ellipse"
  | "conic-bowl"
  | "tapered-ribbon"
  | "capsule"
  | "width-profile-ribbon"
  | "branch-graph"
  | "radial-shard-cluster"
  | "architectural-module-stack"
  | "offset-contour"
  | "rounded-polygon"
  | "bezier-chain";

interface AnchorRef {
  anchor: string;
  offset?: [number, number];
}

interface PartPointRef {
  ref: string;
  point: string;
}

interface RatioSpec {
  ratio: {
    reference: number | PartPointRef;
    value: number;
  };
}
```

Unsupported objects, typed arrays, maps, sets, functions, `undefined`,
non-finite numbers, and cyclic JavaScript graphs are refused before projection
into the packet.

## 6. Identity and Immutability

Canonical serialization recursively sorts object keys and preserves array
order. It does not silently discard unsupported values. Construction and result
identity use the full lowercase SHA-256 digest:

```text
sha256-canonical-v1:<64 lowercase hexadecimal characters>
```

The construction checksum binds:

- contract and contract version;
- solver version;
- construction ID and canvas;
- anchors and authored part order;
- constraints and validation laws.

The result checksum binds the construction ID, solver version, and complete
solved-part graph, including measurements. Accepted input is defensively cloned
before recursive freezing. The result, nested parts, point arrays, point tuples,
measurements, reports, checks, and failures are also recursively frozen.

## 7. Solver Result

```ts
interface SolvedPart {
  id: string;
  primitiveKind: PrimitiveKind;
  spine: [number, number][];
  leftBank?: [number, number][];
  rightBank?: [number, number][];
  closedContour?: [number, number][];
  surfaceNormals: [number, number][];
  tangents: [number, number][];
  curvature: number[];
  arcLength: number;
  namedPoints: Record<string, [number, number]>;
  measurements: Record<string, number>;
}

interface SolverResult {
  constructionId: string;
  solverVersion: "1.0.0";
  parts: Record<string, SolvedPart>;
  validationReport: {
    passed: boolean;
    checks: ValidationCheck[];
    failures: ValidationFailure[];
  };
  constructionChecksum: `sha256-canonical-v1:${string}`;
  resultChecksum: `sha256-canonical-v1:${string}`;
}
```

The solver uses a deterministic topological order derived from authored part
order and explicit part references. Quantized geometric output uses three
decimal places.

## 8. Constraint Semantics

The supported constraint vocabulary is:

```ts
type ConstraintKind =
  | "coaxial"
  | "tangent"
  | "coincident"
  | "connected"
  | "concentric"
  | "parallel"
  | "perpendicular"
  | "symmetric"
  | "mirror-symmetry"
  | "contained"
  | "equal-length"
  | "ratio"
  | "minimum-distance"
  | "maximum-curvature"
  | "monotonic-taper";
```

Constraint responsibility is explicit:

| Class | Constraint kinds | Runtime behavior |
|---|---|---|
| Constructor-enforced | `tangent`, `ratio`, `monotonic-taper`, `maximum-curvature` | The primitive constructor creates lawful geometry; the solver verifies the declared relationship |
| Transform-enforced | `coaxial`, `concentric`, `coincident`, `connected` | A deterministic translation may be applied, followed by verification |
| Verification-only | `parallel`, `perpendicular`, `symmetric`, `mirror-symmetry`, `contained`, `equal-length`, `minimum-distance` | Geometry is never silently altered to make the assertion true |

All constraints are re-verified after the complete transform pass. A later
translation therefore cannot silently invalidate an earlier constraint.

Specific rules:

- `coaxial` compares geometric centers without double-counting a duplicated
  closure sample.
- `tangent` resolves the declared named points and compares their nearest
  sampled tangent vectors.
- `connected` uses minimum contour distance and an authored or default
  tolerance of `0.01`.
- `symmetric` and `mirror-symmetry` require a reflected counterpart for every
  sampled point of every selected part.
- `contained` requires every inner point to lie in or on the outer polygon and
  rejects inner edges that cross a concave boundary.
- `ratio` resolves declared dotted measurements such as `bowl.depth` and
  `rim.radiusX`.
- `maximum-curvature` compares sampled curvature directly.

An unresolved metric, point, part, or axis is a failure, never a skipped check.

## 9. Validation Laws

```ts
interface ValidationLaws {
  closedParts: string[];
  forbidSelfIntersections: boolean;
  consistentWinding: "clockwise" | "counterclockwise";
  minimumCurvatureRadius: number;
  requireConnectedAssembly: boolean;
  requireCanvasContainment?: boolean;
  connectionTolerance?: number;
}
```

Validation checks closure, self-intersection, winding, minimum curvature
radius, and optional assembly connectivity. When canvas containment is enabled,
every emitted centerline, bank, contour, and named point must satisfy
`0 <= x < width` and `0 <= y < height`.

Connectivity is geometric contact within the explicit tolerance. The solver
does not use a hidden multi-cell proximity shortcut.

## 10. Wand Integration

The only accepted Wand envelope is:

```ts
interface WandConstructionFormula {
  coordinateFormula: {
    type: "construction_request";
    construction: GeometryConstructionSpec;
  };
}
```

`construction.canvas` may be omitted only at this boundary; the current Wand
canvas is then injected before packet creation. No other construction fields
may appear beside `type` and `construction`.

Construction evaluation is default-off:

```js
evaluateFormula(formula, canvas, 0, {
  geometryConstructionEnabled: true,
});
```

Absent, false, or misspelled feature flags refuse with PB-ERR-v1-FORMULA.
Enabling the flag has no effect on any non-construction formula type.

Emitted construction coordinates include the construction ID, construction
checksum, result checksum, part ID, primitive kind, tangent, normal, curvature,
arc length, and validation state.

## 11. Refusal and Error Contract

Public packet creation, solving, and Wand evaluation use only PB-ERR-v1
failures:

| Category | Use |
|---|---|
| `VALUE` | Invalid or unsupported authored value |
| `RANGE` | Numeric limits, finite-number, or canvas-size violation |
| `STATE` | Unknown references or cyclic dependencies |
| `FORMULA` | Invalid packet boundary, disabled feature, or invalid Wand envelope |
| `COORD` | Constructor failure, failed constraint, failed validation, or canvas escape |

No success or warning bytecode family is introduced. `trySolve()` returns the
same BytecodeError instance in `{ result: null, error }`.

## 12. Raster Vector Identity

`computeVectorIdentity(op, x, y)` is a public export from
`scdl/render/raster-core.js`. `pushCell()` calls that exact function when it
stamps analytic signed distance, parameter, tangent, normal, curvature, arc
length, and stroke half-width. The exported pre-raster verification path and
the raster metadata path cannot drift into separate implementations.

## 13. Implementation Inventory

Primary implementation:

- `codex/core/pixelbrain/construction/construction-schema.js`
- `codex/core/pixelbrain/construction/construction-validation.js`
- `codex/core/pixelbrain/construction/solver-orchestrator.js`
- `codex/core/pixelbrain/construction/constraint-solver.js`
- `codex/core/pixelbrain/construction/validation-laws.js`
- `codex/core/pixelbrain/construction/geometry-utils.js`
- `codex/core/pixelbrain/construction/proportion-laws.js`
- `codex/core/pixelbrain/construction/modifiers.js`
- `codex/core/pixelbrain/construction/constructors/*.js`
- `codex/core/pixelbrain/formula-to-coordinates.js`
- `codex/core/pixelbrain/scdl/render/raster-core.js`

Canonical migrated asset:

- `PolarisOS/worldpacks/shrine-demo/wand/crystal-stave-blade.wand.json`

## 14. Acceptance Evidence

The focused construction, Wand, asset, and raster suites verify:

- all 11 primitive kinds;
- satisfied and violated cases for all 15 constraint kinds;
- re-verification after later transforms;
- concave-boundary containment refusal;
- complete graph validation and cycle detection;
- SHA-256 construction and result identity;
- recursive freezing;
- canvas containment;
- default-off Wand gating and canonical nesting;
- non-construction formula parity across the flag;
- a 100-iteration deterministic replay;
- raster vector-identity export parity.

The implementation is accepted only when the focused suites, targeted ESLint,
staged immunity scan, schema audit, and repository hygiene checks have been run
and their exact results are recorded in the companion PIR.

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Solver-version semantic drift | Bind solver version into construction and result identity |
| Duplicate closed-contour sample biases centers | Exclude the final duplicated sample from geometric-center calculations |
| Later transforms invalidate earlier constraints | Re-run every verifier after all translations |
| Approximate polygon checks miss concavity | Combine point containment with segment-boundary crossing checks |
| Mutable caller input changes accepted packets | Defensive clone plus recursive freeze |
| Optional feature changes existing formulas | Default-off gate and parity regression tests |
| Unmapped collaboration ownership blocks asset locks | Explicit audited override on task assignment and lock acquisition |

## 16. Rollback

The implementation is checkpointed by concern: schema and validation,
constraints, solver result integrity, Wand integration, raster export, and
collaboration lock schema. Each checkpoint can be reverted independently.

Reverting the Wand checkpoint requires reverting the migrated Wand asset in the
same change. Reverting construction packet or checksum semantics requires a
schema-contract version change and corresponding fixture updates.

## 17. Final Decision

`PB-GEOMETRY-CONSTRUCTION-v1` is implemented as an additive, default-off,
deterministic construction boundary. The repaired contract in this document is
authoritative. Earlier draft shapes and pre-implementation status claims are
superseded.
