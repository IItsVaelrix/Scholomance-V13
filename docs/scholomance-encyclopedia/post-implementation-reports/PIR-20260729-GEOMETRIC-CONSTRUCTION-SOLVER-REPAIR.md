# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260729-GEOMETRIC-CONSTRUCTION-SOLVER-REPAIR
- **Feature / Fix Name:** Geometric construction solver contract repair
- **Author / Agent:** Codex Root
- **Date:** 2026-07-29
- **Branch:** `feature/semantic-calculus-lexical-predicates`
- **Related task:** `c0ba5710-3ca1-48b6-892d-56f89a212b4d`
- **Related asset task:** `a3fdb1f0-7150-4757-8e09-f3b2469acda5`
- **Classification:** Schema, deterministic geometry, Wand integration, MCP hardening
- **Priority:** High

## 2. Executive Summary

The original geometric construction implementation was promising but not safe
to ship. Its PDR described multiple incompatible request shapes, the Wand
bridge consumed a different shape than the tests authored, several constraint
kinds could pass without enforcing their declared relationship, result
identity used a short non-cryptographic digest, nested results remained
mutable, canvas containment was not enforced, and a required raster helper was
not exported.

The repaired implementation now has one registered contract, complete graph
validation, full canonical SHA-256 identities, recursive freezing, explicit
constraint responsibility, post-transform verification for all 15 constraint
kinds, PB-ERR-v1 refusal on public construction paths, a default-off canonical
Wand bridge, and a migrated crystal-stave asset.

During the asset migration, the collaboration service exposed a separate
schema-parity bug: its internal lock service accepted an ownership `override`,
but the HTTP and MCP schemas omitted that field. The schemas and regression
coverage now expose the already-supported control. A running MCP bridge must be
reconnected or restarted to advertise the updated tool schema.

## 3. Initial Findings

### Contract Drift

- Tests authored `coordinateFormula.construction`, while the Wand bridge read
  construction fields from the formula's top level.
- The PDR documented both a complete construction packet and unrelated
  lightweight constructor-shaped requests.
- The construction contract was absent from `SCHEMA_CONTRACT.md`.
- The PDR still claimed pre-implementation status after code and assets existed.

### Validation and Constraint Gaps

- Construction validation did not cover every primitive field, reference,
  range, named part, or dependency cycle.
- Symmetry, containment, ratio, and some relational checks could silently
  degrade into no-ops or bounding-box approximations.
- Later translations could invalidate an earlier constraint without a final
  re-verification pass.
- Connected assembly used an implicit two-cell shortcut rather than explicit
  authored tolerance.
- Closed contours double-counted their duplicated final point when computing
  centers, biasing coaxial transforms.

### Identity and Boundary Gaps

- Construction/result hashing did not use one recursively canonical domain.
- Result identity was a short 32-bit digest.
- Only shallow result objects were frozen.
- Optional canvas containment existed in validation input but not solver
  enforcement.
- Public solver failures used raw JavaScript errors.

### Integration Gaps

- Construction solving was not explicitly default-off.
- A flattened crystal-stave request was the only integrated asset.
- The rounded-polygon fillet used one value as both edge tangent distance and
  circle radius, breaking bilateral symmetry.
- `computeVectorIdentity` was used internally but not exported.

### Collaboration Plane

- The connected Scholomance stdio MCP remained healthy.
- The earlier apparent disconnect came from the app/OAuth wrapper requiring
  session authorization; the local stdio bridge does not use that cookie.
- Lock acquisition on an unmapped asset revealed that `override` was supported
  by `collabService.acquireLock()` but absent from `AcquireLockSchema` and the
  MCP registration.

## 4. Design Decisions

- Keep one complete `PB-GEOMETRY-CONSTRUCTION-v1` packet.
- Accept only the nested Wand construction envelope.
- Require `geometryConstructionEnabled === true`.
- Preserve non-construction formula output byte-for-byte across that flag.
- Use recursively key-sorted canonical JSON and full SHA-256.
- Defensively clone and recursively freeze packets and solver results.
- Allow deterministic translations only for coaxial, concentric, coincident,
  and connected constraints.
- Verify every constraint after the full transform pass.
- Use sampled geometric truth for symmetry, concave containment, ratios,
  distances, lengths, tangency, and curvature.
- Keep shadow/Hausdorff comparison as future review evidence, not runtime
  authority.

The approved repair design is recorded at
`docs/superpowers/specs/2026-07-29-geometric-construction-solver-repair-design.md`.
The execution plan is recorded at
`docs/superpowers/plans/2026-07-29-geometric-construction-solver-repair.md`.

## 5. Implementation Summary

### Packet and Validation

- Added a construction-local PB-ERR-v1 error factory.
- Added lossless canonicalization and recursive clone/freeze helpers.
- Bound solver version and the complete semantic packet into SHA-256 identity.
- Added exhaustive primitive, constraint, reference, validation-law, and cycle
  checks.

### Geometry and Constraints

- Added deterministic geometry helpers for segment contact, polygon
  containment, boundary crossing, contour distance, reflected counterparts,
  and named tangent lookup.
- Added transform/verify separation and final all-constraint re-verification.
- Corrected closed-contour geometric centers.
- Added measurements required by dotted ratio constraints.
- Corrected circular fillet construction and straight-angle handling for
  rounded polygons.

### Solver and Wand

- Added topological solving for all 11 primitive kinds.
- Added canvas containment, result SHA-256 identity, recursive freezing, and
  PB-ERR-v1 refusal.
- Added the explicit default-off Wand gate and canonical nested envelope.
- Migrated the crystal-stave asset to the registered schema.

### Raster and Collaboration

- Exported the exact `computeVectorIdentity` function used by raster cell
  stamping.
- Added `override` to both the HTTP lock schema and MCP lock tool schema.
- Removed pre-existing non-ASCII syntax-prion characters from the changed MCP
  bridge file as required by the immunity gate.

## 6. Behavior Changes

- Construction requests now refuse unless explicitly enabled.
- Pre-contract construction request shapes now refuse rather than being
  projected into defaults.
- Unknown or violated constraints cannot silently pass.
- Assembly connectivity defaults to `0.01` unless an explicit tolerance is
  authored.
- Result objects are immutable at every nested level.
- Result identities use 64 hexadecimal SHA-256 characters.
- Crystal-stave validation no longer claims disconnected parts form one
  connected assembly.
- Unmapped file locks can use an explicit audited override after the MCP bridge
  reloads the repaired schema.

## 7. Test-Driven Evidence

Red tests were observed before each repair:

- six canonicalization/immutability failures;
- eight complete-graph validation failures;
- five silent-constraint-degradation failures;
- a concave containment boundary-crossing failure;
- four solver identity/freezing/canvas/PB-error failures;
- five Wand/asset gate and shape failures;
- a rounded-polygon symmetry failure;
- two raster export/parity failures;
- an MCP lock-override schema failure.

Green checkpoint evidence:

- construction + canonical asset focus: 3 files, 123 tests passed;
- construction + Wand + raster focus: 3 files, 125 tests passed;
- collaboration bridge/service focus: 2 files, 15 tests passed;
- remaining construction modules: targeted ESLint passed with zero warnings;
- staged immunity scan passed before every completed checkpoint commit.

Final broad verification results are recorded in section 10 after the final
repository pass.

## 8. Commits

- `63617be5` - design the geometric construction solver repair
- `cb86bc05` - plan the geometric construction solver repair
- `c3ff4085` - canonicalize construction packets
- `4022d10f` - validate complete construction graphs
- `1f57e5ea` - verify construction constraints exactly
- `a1c38dba` - secure construction solver results
- `e969c606` - gate canonical construction requests
- `799f16df` - export raster vector identity
- `90223d2c` - expose lock ownership overrides
- `db311cba` - complete construction primitive library
- `d77d79de` - ratify the geometric construction solver documentation
- `e6189401` - clean the construction verification scope

## 9. Risk and Rollback

The largest compatibility change is intentional: construction requests are
default-off and accept only one nested shape. Existing non-construction formula
types are covered by parity tests. The migrated asset and bridge must be
reverted together if the Wand checkpoint is rolled back.

Constraint and identity checkpoints are separable. Reverting schema or hashing
semantics requires a schema version bump and fixture migration. Reverting the
MCP schema repair restores the inability to request an audited ownership
override through the advertised surfaces.

## 10. Final Verification

The repaired scope is green:

- focused Vitest: 6 files passed, 143 tests passed;
- targeted ESLint across construction, Wand, raster, MCP schema/bridge, and
  their focused tests: zero errors and zero warnings;
- staged immunity scan: passed;
- repository-wide immunity scan: passed;
- semantic drift grep for legacy success/warning bytecode prefixes, removed
  primitive aliases, and the retired short-digest label in the repaired
  construction/PDR/PIR scope: no matches;
- `git diff --check`: passed;
- all relevant implementation, test, asset, PDR, schema, index, and PIR paths
  were clean after their checkpoint commits.

The repository-wide gates are not green for reasons outside this repair:

- `npm run typecheck` reports five existing errors in
  `src/core/compose/kits/polaris-console.ts`,
  `src/core/compose/migrated/ConstellationSky.ts`,
  `src/pages/Listen/ComposeSignalChamberAdapter.tsx` (two errors), and
  `src/pages/Listen/ListenPage.tsx`;
- the full Vitest run traversed the repository and emitted unrelated failure
  markers in UI, performance, security-fixture, visualiser, library shelf,
  subtlety-route, audio-clock, and voxel-pipeline areas, then remained alive
  without output or a terminal summary for more than ten minutes and was
  interrupted;
- the encyclopedia hygiene audit remains at 160 errors and 22 warnings, all
  outside this PDR/PIR. Before their index entries were added the audit reported
  161 errors and 22 warnings, so this repair reduced the existing error count
  by one and introduced no unindexed construction document.

These global failures prevent a repository-wide green claim, but none intersects
the repaired construction, Wand, raster identity, or MCP lock-schema paths.

## 11. Known Gaps and Follow-Up

- A future review tool may compare solved and approved silhouettes using
  Hausdorff distance, but it must remain evidence rather than hidden runtime
  mutation.
- General nonlinear solving, 3D construction, animation solving, and automatic
  construction authorship remain out of scope.
- Existing repository-wide typecheck, full-suite, and encyclopedia hygiene
  findings remain separate cleanup work.

## 12. Final Sign-Off

- [x] Registered contract and canonical Wand envelope
- [x] Complete graph validation
- [x] Exact constraint enforcement and verification
- [x] Canonical SHA-256 identity and recursive freezing
- [x] PB-ERR-v1 public refusal
- [x] Raster identity export parity
- [x] MCP lock-override schema parity
- [x] Final broad verification recorded
