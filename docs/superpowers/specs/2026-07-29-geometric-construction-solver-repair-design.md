# Geometric Construction Solver Contract Repair Design

**Date:** 2026-07-29
**Status:** Approved design
**Related PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-geometric-construction-solver-pdr.md`
**Collab task:** `c0ba5710-3ca1-48b6-892d-56f89a212b4d`

## 1. Goal

Make `PB-GEOMETRY-CONSTRUCTION-v1` a lawful, deterministic, immutable, and testable boundary from Wand intent to solved geometry. The repair must remove the competing request dialects, register the shared data contract, replace silent constraint degradation with explicit refusal, provide stable identity, and preserve every existing non-construction formula path.

## 2. Decisions

### 2.1 Canonical Wand envelope

The only accepted Wand boundary is:

```js
{
  coordinateFormula: {
    type: "construction_request",
    construction: {
      id,
      canvas,
      anchors,
      parts,
      constraints,
      validation
    }
  }
}
```

`canvas` may be omitted inside `construction` only at the formula boundary, where the caller-supplied `canvasSize` is injected before schema validation. Core `createConstruction()` always receives a complete construction input.

The following forms are invalid in v1:

- flattened construction fields beside `type`
- `{ constructor, profile, behavior }`
- `perspective-ribbon` or any primitive not registered by the Construction IR

There is no dual-format compatibility adapter because no released construction artifact depends on the abandoned forms.

### 2.2 Contract sovereignty

`SCHEMA_CONTRACT.md` will register:

- `GeometryConstructionInput`
- `GeometryConstruction`
- `ConstructionPart`
- every `PrimitiveSpec`
- every `ConstructionConstraint`
- `ValidationLaws`
- `SolvedPart`
- `GeometrySolverResult`
- `GeometryValidationReport`
- `GeometryConstructionHealthEvent`
- the canonical Wand envelope

The schema version will be incremented with a Schema Change Notice. The PDR will not define a parallel authoritative shape after registration; it will reference the sovereign contract.

### 2.3 Error law

Construction failures use `PB-ERR-v1` only:

- malformed structure or unknown enum: `VALUE`
- non-finite or out-of-range geometry: `RANGE`
- missing anchor/part/named-point reference: `STATE`
- unsupported or refused formula evaluation: `FORMULA`
- out-of-canvas coordinates when bounds are required: `COORD`

The implementation reuses registered categories and codes. It does not introduce `PB-OK-v1` or `PB-WARN-v1`.

Successful or refused solves may emit a structured `GeometryConstructionHealthEvent`. A failure event carries the emitted `PB-ERR-v1` string; a success event has `errorBytecode: null`. Health events are diagnostics, not a new bytecode family and not solver authority.

## 3. Architecture

```text
Wand coordinateFormula
  -> construction request boundary adapter
  -> createConstruction(input)
       validate complete graph
       defensive clone
       canonical identity
       recursive freeze
  -> solve(construction)
       topological part construction
       transform constraints
       verification constraints
       validation laws
       result identity
  -> formula coordinate projection
  -> existing SCDL/VRI consumers
```

Core remains pure:

- no environment reads
- no I/O
- no event emission
- no mutable module state

The caller passes `geometryConstructionEnabled`. An application/bootstrap boundary may translate `GEOMETRY_CONSTRUCTION_ENABLED` into that explicit option. The default is `false`.

## 4. Construction Identity and Immutability

### 4.1 Canonical representation

Identity uses recursively key-sorted JSON with these rules:

- object keys sorted lexicographically at every depth
- array order preserved
- `undefined`, functions, symbols, non-finite numbers, typed arrays, maps, sets, and cyclic objects rejected
- numbers quantized according to the construction precision policy before hashing
- the checksum input includes contract, schema version, solver version, id, canvas, anchors, parts, constraints, and validation

The digest is a full 64-character lowercase SHA-256 hex string:

```text
sha256-canonical-v1:<64 lowercase hex>
```

The misleading `scd64:<8 hex>` FNV identity is removed from this contract.

### 4.2 Defensive immutability

`createConstruction()` first clones accepted data into plain objects and arrays. It then recursively freezes the full graph. No nested anchor, primitive reference, constraint member, validation array, or output point remains mutable.

Solver output receives the same clone-and-deep-freeze treatment. The solver never mutates the input packet.

## 5. Validation Boundary

Validation happens before construction:

- canvas dimensions are finite positive integers within the registered maximum
- anchors are finite two-number tuples
- part IDs are unique and non-empty
- every primitive has its required finite parameters and legal ranges
- radii, widths, distances, counts, and module sizes are positive
- every AnchorRef resolves
- every PartRef resolves to an existing part
- every named-point reference is legal for the referenced primitive kind
- constraint operands exist and match the constraint-specific shape
- validation law part IDs exist
- no part-dependency cycle exists

Unknown references are errors. They never produce `continue`, skipped checks, defaults, or partial success.

Canvas policy is explicit:

- constructors may calculate sub-cell coordinates
- if `validation.requireCanvasContainment` is true, every solved contour point must fall within `[0,width) × [0,height)`
- geometry is never silently clamped

## 6. Constraint Semantics

The solver does not pretend that every relation is a general-purpose nonlinear solve. Each constraint has one declared enforcement class.

### 6.1 Constructor-enforced

These must be satisfied while the dependent primitive is constructed:

- `tangent`
- `ratio`
- `monotonic-taper`
- `maximum-curvature`

The orchestrator passes the relevant resolved dependency and constraint parameters to the constructor. Post-solve verification remains mandatory.

### 6.2 Transform-enforced

These may apply a deterministic rigid translation when it cannot invalidate an already-solved harder relation:

- `coaxial`
- `concentric`
- `coincident`
- `connected`

After all transforms, the solver re-runs every constraint verification. A later transform cannot silently invalidate an earlier constraint.

### 6.3 Verification-only

These never deform arbitrary geometry:

- `parallel`
- `perpendicular`
- `symmetric`
- `mirror-symmetry`
- `contained`
- `equal-length`
- `minimum-distance`

Failure produces deterministic refusal.

### 6.4 Exact checks

- Tangency resolves each declared named point to its nearest contour sample and compares normalized tangents there.
- Symmetry reflects every contour point across the declared vertical axis and requires a counterpart within tolerance.
- Containment uses point-in-polygon plus boundary-segment intersection checks, not AABB containment.
- Ratio resolves declared dotted properties against constructor metadata and compares the measured ratio to the requested value.
- Connected means geometric contact within the declared connection tolerance; the default tolerance is `0.01`, not two cells.
- Curvature compares maximum curvature directly. Minimum-radius validation remains a separately named validation law.

All tolerances are finite non-negative values and are applied after quantization.

## 7. Raster Identity

`computeVectorIdentity(op, px, py)` becomes a named public export from `raster-core.js`. Existing rasterization calls continue using the same function. A regression test proves that the export returns the same ellipse identity used internally.

Construction tangency and curvature checks may consume shared pure geometry helpers, but raster output is not allowed to become solver authority.

## 8. Feature Gate and Rollout

`evaluateFormula()` accepts:

```js
{
  geometryConstructionEnabled: false
}
```

Behavior:

- construction request + flag false: lawful `PB-ERR-v1-FORMULA` refusal
- construction request + flag true: validate and solve
- every non-construction formula type: unchanged regardless of the flag

Shadow mode is a separate caller behavior. It evaluates old and new geometry without selecting the new output.

Migration comparison uses deterministic resampling followed by symmetric Hausdorff distance. “Within one cell” means `hausdorffDistance <= 1.0`; it does not compare unrelated array indexes.

Repeated identical deterministic runs are not rollout evidence. The shadow gate runs a fixed golden corpus spanning different canvases, primitive combinations, constraint failures, and migrated assets.

## 9. Durable Ledger

The solver performs no persistence. A separate adapter may append a ledger record only after explicit human approval.

Each ledger record includes:

- construction ID
- construction checksum
- solver version
- result checksum
- approval identity
- approval timestamp as audit metadata

Timestamp and approval metadata do not participate in construction or result identity.

## 10. Testing Strategy

Every behavioral repair follows red-green-refactor.

Required regression groups:

1. Canonical Wand envelope succeeds when enabled.
2. Flattened and lightweight request dialects are rejected.
3. Construction requests refuse when the flag is absent or false.
4. Existing formula types produce unchanged snapshots with either flag value.
5. Reordered object keys produce the same construction checksum.
6. Nested construction and result values cannot be mutated.
7. Non-finite numbers, invalid ranges, duplicate IDs, missing references, illegal named points, and dependency cycles produce `PB-ERR-v1`.
8. All fifteen constraint kinds have an explicit satisfaction and refusal test according to their enforcement class.
9. Tangency uses named join points.
10. Symmetry detects missing reflected counterparts.
11. Containment rejects a point that lies inside an outer AABB but outside the polygon.
12. Ratio checks resolved constructor metadata.
13. A later transform cannot invalidate an earlier constraint without refusal.
14. `computeVectorIdentity` is publicly callable.
15. Construction and result checksums replay identically across 100 iterations.
16. Golden-corpus shadow comparisons use symmetric Hausdorff distance.
17. The archive hygiene audit recognizes the PDR.

The complete verification gate includes the focused construction suite, existing formula tests, SCDL render tests, fusion tests, lint, typecheck, and encyclopedia hygiene. Pre-existing unrelated failures are reported separately and never represented as construction success.

## 11. Documentation State

The PDR will be revised to:

- use the canonical nested envelope
- reference the sovereign schema
- remove the lightweight request and unsupported river example
- replace “all constraints solve” with enforcement-class language
- replace raw `Error` examples with bytecode refusal
- specify canonical identity and deep immutability
- specify the explicit feature gate and Hausdorff migration metric
- change its verdict from “complete with acceptable risk” to its truthful lifecycle state

The PDR archive index will include the document. A PIR will record actual implementation and verification evidence when the repair is complete.

## 12. Non-Goals

- universal nonlinear constraint solving
- new 3D construction primitives
- prose-to-construction generation
- a construction authoring UI
- migration of every existing Wand asset in this repair
- introduction of a new success or warning bytecode family

## 13. Completion Conditions

The repair is complete only when:

- the sovereign schema and runtime implementation agree
- one Wand request dialect exists
- no construction graph mutation is possible after creation
- semantic key order does not affect identity
- every declared constraint is enforced or verified exactly as documented
- missing references cannot be silently skipped
- the feature is default-off and explicitly enabled
- the focused construction suite has zero failures
- mandatory regression commands have recorded outcomes
- the PDR, archive index, and PIR describe the actual shipped state
