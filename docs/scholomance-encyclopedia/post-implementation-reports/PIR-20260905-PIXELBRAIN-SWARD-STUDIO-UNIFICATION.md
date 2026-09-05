# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260905-PIXELBRAIN-SWARD-STUDIO-UNIFICATION
- **Feature / Fix Name:** PixelBrain SWARD Studio Unification
- **Author / Agent:** Codex
- **Date:** 2026-09-05
- **Related PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-sward-studio-unification-pdr.md`
- **Classification:** Architectural | Behavioral | PixelBrain | Studio migration | AMP activation
- **Priority:** Critical
- **Status:** Implementation complete; scoped release gates pass. Two repository-wide baseline gates remain red outside this change and are recorded in section 10.

---

## 2. Executive Summary

PixelBrain now opens into one native SWARD-derived Studio surface. Nine
deep-linkable workspaces provide a single home for manual lattice editing,
blueprints, generators, all catalogued AMP capabilities, isolated mutations,
materials and finish, mentorship/reference, local library/export, and
diagnostics. The classic PixelBrain page remains intact as a reversible
fallback, but `/pixelbrain` redirects to Studio by default after the parity,
visual, accessibility, and route gates passed.

The generated effect catalog and Studio manifest agree on all 54 modules. Of
those, 49 are executable capabilities with static, purpose-built adapters and
five are support capabilities with named, tested consumers. The ten mutating
capabilities cannot use the normal commit path; they run only through immutable
Mutation Lab transactions with diff, accept, reject, and stale-base refusal.
No dynamic user import, `eval`, content telemetry, cloud autosave, or hidden
background mutation was added.

The SWARD grass algorithm was ported literally from the attached Studio source,
including the height field, nine blade stamps, tuft placement, wind, scoring,
best-of-attempts selection, and all eight palettes. The public AMP seam remains
`GRASS_AMP_ID = "grass"`; the implementation contract is version 5.0.0 and the
form-first merge seam remains `grass-v3`.

---

## 3. Delivered Requirements

| PDR | Delivered result | Evidence |
|---|---|---|
| F1 | Native `/pixelbrain/studio/:studioTab` route; three-pane desktop and single-column mobile shell. | Route, shell, Playwright, and inspected snapshots. |
| F2 | Exactly nine top-level homes with URL/hash deep links and ARIA/roving keyboard behavior. | Exact feature-to-home parity test and axe pass on every tab. |
| F3 | Aseprite-style Canvas retains TemplateEditor, layers, palette, tools, selection, undo/redo, import/export, and editor state across tabs. | Aseprite/import/editor command fixtures and Canvas visual baseline. |
| F4 | One generated record and one static adapter for every one of 54 catalog entries. | Catalog/manifest checks; adapter coverage `missing=[]`, `extra=[]`. |
| F5 | Stable planning, explicit skips, conflict refusal, checksummed inputs/plans/outputs, and 100-repeat replay. | Planner and execution tests plus checksum sample in section 6. |
| F6 | Separate Mutation Lab with immutable baseline, candidate diff, accept/reject, cancellation, and stale-base refusal for all ten mutation AMPs. | Per-mutation transaction matrix and Mutation mobile baseline. |
| F7 | Blueprint, Forge Gate, palette/construction, shader/VRI, texture, and direct adapter outputs remain available in one declared home. | Parity and focused legacy fixture suites. |
| F8 | Receipt-bearing export and browser-local library/receipt state capped at 20; no implicit server write. | Local storage/UI tests and source boundary review. |
| F9 | Studio is the default PixelBrain route; the classic page and both rollback switches remain operational. | Route test covers default, partial opt-out, and full opt-in states. |
| F10 | Literal SWARD engine/palette port behind the narrow grass AMP wrapper, with visual and differential evidence. | Oracle comparison, terrain/bridge tests, SCDL checks, and 8x render. |

---

## 4. Catalog, Manifest, and Adapter Coverage

### Effect catalog

```text
54 modules
54 WIRED
0 GEN
0 TEST-ONLY
0 ORPHAN
25 documented
0 registered by catalog status
2 ids in the legacy amp-registry (not used as the denominator)
```

### Studio classification

| Kind | Count | Studio behavior |
|---|---:|---|
| `runnable` | 24 | Preview and non-mutation commit through the AMP Conveyor or flagship home. |
| `runtime-gated` | 15 | Preview and commit through a purpose-built adapter; the real asset/runtime context remains authoritative. |
| `mutation` | 10 | Mutation Lab proposal only; normal commit refuses these records. |
| `support` | 5 | Not exposed as a mutating button; inspected through named, tested consumers. |
| **Total** | **54** | **54 static adapters, zero missing, zero extra, zero blocked.** |

The adapter registry is a source-authored allow-list. Manifest values cannot
select an import path or export name. Every one of the 49 executable records was
invoked twice against the real export in the focused witness suite; every
support record was exercised through `studio-support-inspector` and its named
production consumer.

---

## 5. Studio Surface and Fidelity

The final homes are:

1. Canvas & Aseprite
2. Blueprint
3. Foundry
4. AMP Conveyor
5. Mutation Lab
6. Material & Finish
7. Mentor & Reference
8. Library & Export
9. Diagnostics

Canvas keeps the existing editor as the sovereign document surface and shows
only its layer and palette benches. Former PixelBrain panels were relocated to
their single declared homes rather than duplicated. Studio receipt state is
lifted to the page boundary, displayed in Diagnostics, included in Studio
recipe export, and never added to the classic route's legacy export schema.

The design follows SWARD's quiet, form-first hierarchy: direct output dominates,
secondary controls stay compact, pixel rendering is nearest-neighbour, and the
Foundry can switch between ground, blades, final, 1x tile, 2x repeat, and 8x
repeat. Reduced motion and high-contrast overrides are included.

### Visual evidence

- Reference: `Pixel-Art-Studio-Skeleton/artifacts/sward-grass-tiles/meadow/meadow-field.png`
- Canvas: `tests/visual/pixelbrain-studio.spec.js-snapshots/pixelbrain-studio-canvas-desktop-chromium-linux.png`
- Foundry 8x repeat: `tests/visual/pixelbrain-studio.spec.js-snapshots/pixelbrain-studio-foundry-desktop-chromium-linux.png`
- Mobile Mutation Lab: `tests/visual/pixelbrain-studio.spec.js-snapshots/pixelbrain-studio-mutation-mobile-chromium-linux.png`

All three generated baselines were inspected at original resolution. The
Foundry repeat has no visible seam; the Canvas retains a focused editor
hierarchy; the 390x844 Mutation view exposes its active tab and primary
candidate controls without a desktop-only layout.

---

## 6. Determinism and Provenance Evidence

Frozen wire contracts registered in `SCHEMA_CONTRACT.md` 1.50:

- `PB-STUDIO-AMP-MANIFEST-v1`
- `PB-STUDIO-AMP-PLAN-v1`
- `PB-STUDIO-AMP-RECEIPT-v1`
- `PB-STUDIO-MUTATION-v1`
- `PB-STUDIO-DIFF-v1`

Representative grass preview against the frozen demo snapshot:

```text
baseChecksum     studio-input1:demo
planChecksum     studio-plan1:31dc7460568825634c2479b60822ad998ec14ce94fb0107c76336f58cad79b8e
manifestChecksum 548324adabc8c6d801a8c47be78fba5e38863354d7234a89d134f9ea721d3149
outputChecksum   studio-output1:5caadad54bdcbfc51568eef14f6ba4adfd312df922e7e136a7a380655aab6f39
steps            grass
skipped          53
```

Plans sort by declared order and then AMP id, sort skip records by AMP id, and
refuse unknown ids or overlapping write claims. Receipts deliberately contain
no wall-clock value. Input cloning covers arrays, typed arrays, ArrayBuffers,
Maps, Sets, and objects before real exports are invoked.

All ten mutation adapters pass the same four-way transaction contract:
baseline bytes remain untouched during proposal, accept creates a child with
lineage, reject returns the identical baseline object, and an accept against a
changed base is refused.

---

## 7. Grass Port Evidence

`grass-engine.js`, `grass-palettes.js`, and `grass-types.js` preserve the
attached SWARD engine rather than re-deriving it from the PDR. The differential
test imports the TypeScript reference engine and compares field, ground, blade,
palette, dimensions, and diagnostics for three parameter sets, all defaults,
all eight palettes, the thin AMP wrapper, and 100 deterministic repeats.

Both real terrain consumers remain green. The `void_grove` SCDL field and blade
fixtures were regenerated in fresh temporary output directories and accepted
by `scdl.cli.js check` with zero errors and zero warnings (1,024 field
coordinates and 286 blade coordinates).

### Performance sample

Seven direct runs on the implementation host:

| Request | Generated | Median | Maximum | Budget |
|---|---:|---:|---:|---:|
| 64x64 | 64x64 | 9.79 ms | 39.87 ms | 150 ms |
| 256x256 | 128x128 | 20.80 ms | 37.27 ms | 500 ms |

The second request preserves the reference SWARD engine's lawful 128x128
maximum rather than silently extending the literal port. Studio's authored
tile choices stop at 64x64. The async Studio execution seam also exposes named
progress phases and cancellation; both have witness tests.

---

## 8. Verification Commands and Results

```text
npm run effects:gen && npm run effects:check
PASS — 54 modules; generated catalog current

npm run studio:manifest:gen && npm run studio:manifest:check
PASS — 54 capabilities; generated manifest current

npx vitest run <22 focused Studio, AMP, Aseprite, import, and editor files>
PASS — 22 files, 151 tests

npx playwright test tests/visual/pixelbrain-studio.spec.js tests/visual/pixelbrain-studio-a11y.spec.js --update-snapshots
PASS — 12 tests

npx playwright test tests/visual/pixelbrain-studio.spec.js tests/visual/pixelbrain-studio-a11y.spec.js
PASS — 12 tests; visual threshold 0.002; all nine tabs axe-clean at serious/critical level

npm run typecheck
PASS — all three TypeScript/check-JS projects

npm run build:app
PASS — production build, 3,416 modules transformed

npx eslint <implementation-owned sources and tests>
PASS — zero errors (new Studio/core sources also have zero warnings)

node codex/core/pixelbrain/scdl/scdl.cli.js check <generated field fixture>
PASS — 0 errors, 0 warnings

node codex/core/pixelbrain/scdl/scdl.cli.js check <generated blade fixture>
PASS — 0 errors, 0 warnings
```

The focused Vitest set includes static adapter coverage, all real executions,
support consumers, planning, mutation isolation, performance/cancellation,
browser-safe selector boundaries, terrain/microprocessor bridges, Studio facade,
routes/shell/parity, Aseprite binary/import/export/emulation, and bounded editor
history.

---

## 9. Migration and Rollback

Both runtime switches default on after final parity:

```text
VITE_PIXELBRAIN_STUDIO_V1=true
VITE_PIXELBRAIN_STUDIO_LEGACY_REDIRECT=true
```

`/pixelbrain` therefore redirects to `/pixelbrain/studio/canvas`. Set
`VITE_PIXELBRAIN_STUDIO_LEGACY_REDIRECT=false` to restore the classic entry
while keeping direct Studio canary routes available, or set
`VITE_PIXELBRAIN_STUDIO_V1=false` to disable Studio and fall back from direct
Studio routes as well. No server data or artwork was migrated, so rollback is
immediate and does not require data repair.

---

## 10. Exceptions and Repository Baseline

### Repository-wide QA

`npm run test:qa` completed with 217 passing files and seven failing files;
2,449 of 2,463 tests passed. Its 14 failures are outside PixelBrain Studio:

- three existing determinism scan failures in semantic/Constellation/runtime files;
- two Truesight colour resolver failures;
- two Vaelrix architecture-gauntlet failures over existing immunity/runtime code;
- one Constellation channel-registry mismatch;
- one packed-compose mismatch;
- one classic compose mismatch;
- four compound-identity/frozen-corpus mismatches.

None of the failure paths imports the Studio manifest, planner, execution,
mutation, grass, route, or UI modules. They were not changed or suppressed.

### Repository-wide lint

`npm run lint` remains red with 103 pre-existing errors outside the
implementation boundary, including the attached skeleton/reference project,
Scholomance OS, Career, generated WASM, and unrelated semantic files. Scoped
implementation lint reports zero errors. Existing warnings in legacy
PixelBrain components were not expanded into a cosmetic refactor.

### Development proxy noise

Playwright's Vite server logged refused proxy requests for unavailable local
auth/semantic/lexicon services. The Studio is client-local and all browser
assertions still passed; no test was skipped or weakened because of those
messages.

### Deferred AMP records

None. Runtime-gated records are implemented adapters whose final applicability
depends on real runtime context; they are not blocked or decorative entries.

---

## 11. Final Verdict

The PDR's implementation scope is complete. PixelBrain has one default Studio
surface, all catalogued AMP capabilities are wired through explicit execution
contracts, mutations have a separate safe vehicle, the high-fidelity editor and
export seams remain covered, and the SWARD grass quality is present in the real
AMP rather than only in the attached prototype. The only red gates are the
enumerated pre-existing repository baselines; the PDR correctly leaves its
omnibus QA/lint Definition-of-Done checkbox open rather than claiming they pass.
