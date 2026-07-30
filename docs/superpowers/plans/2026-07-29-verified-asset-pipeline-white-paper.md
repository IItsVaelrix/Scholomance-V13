# Verified Asset Pipeline White Paper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an evidence-grounded white paper explaining Scholomance's verified asset pipeline from constrained geometry through deterministic RGBA rendering.

**Architecture:** Create one authoritative Markdown white paper organized as a proof chain. Separate implemented behavior from approved-but-unimplemented design, and bind each technical claim to current source, contract, or focused automated evidence.

**Tech Stack:** Markdown, JavaScript source inspection, Vitest verification, Git

## Global Constraints

- The audience combines stakeholders, technical artists, and engine contributors.
- Claim only behavior supported by current implementation, exercised contracts, focused automated tests, or binding repository law.
- Do not imply that `compileVRI()` directly invokes the geometric construction solver.
- Do not present the ontological ledger, capability retrieval, approval adapter, or Feel-warning loop as implemented runtime behavior.
- Preserve the distinction: SCDL describes what exists; VRI describes how accepted geometry looks.
- State current limitations directly and do not convert them into roadmap promises.
- Do not modify either source PDR, the VRI implementation, tests, or unrelated working-tree changes.

---

### Task 1: Draft the proof-chain white paper

**Files:**

- Create: `docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md`
- Read: `docs/superpowers/specs/2026-07-29-verified-asset-pipeline-white-paper-design.md`
- Read: `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr-revised.md`
- Read: `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-geometric-construction-solver-pdr.md`
- Read: `codex/core/pixelbrain/vixel/vri-compiler.js`
- Read: `codex/core/pixelbrain/vixel/vri-renderer.js`

**Interfaces:**

- Consumes: `PB-GEOMETRY-CONSTRUCTION-v1`, `PB-VRI-COMPILE-v2`, `PB-VRI-v1`, and `PB-VRI-RENDER-v1` behavior evidenced by the listed sources.
- Produces: a standalone Markdown white paper whose claims can be reviewed without reading the design spec.

- [ ] **Step 1: Create the document header and evidence declaration**

Write the title, date, status, audience, bytecode search anchor, executive
abstract, and a boxed scope statement that distinguishes:

```text
Verified current capability
Approved design context
Explicit non-claims
```

- [ ] **Step 2: Write the executive thesis**

Explain in plain language that the pipeline separates:

```text
intent -> geometry -> appearance -> raster
```

State the production value: deterministic rebuilds, constraint-backed
geometry, material-coherent appearance, explicit refusal, and traceable stage
boundaries.

- [ ] **Step 3: Add the compact architecture diagram**

Use this verified composition:

```text
Authored SCDL / Wand intent
  -> optional PB-GEOMETRY-CONSTRUCTION-v1 solver
  -> accepted coordinates + material/vector metadata
  -> SCDL asset packet
  -> compileVRI(packet, options)
  -> PB-VRI-v1 scene
  -> renderVRI(scene, scale)
  -> RGBA buffer
```

Show `artGenes`, shader data, lighting, atmosphere, raster patches, and
caller-supplied scene-graph lowering as inputs to `compileVRI()`, not to the
construction solver.

- [ ] **Step 4: Explain the construction boundary**

Cover the 11 primitive kinds, 15 constraint kinds, constructor/transform/
verification responsibility classes, post-transform re-verification,
validation laws, default-off Wand integration, canonical SHA-256 identities,
recursive freezing, and PB-ERR-v1 refusal categories.

- [ ] **Step 5: Explain the VRI compiler**

Describe geometry lowering, material-to-texture mapping, texture coordinate
spaces, explicit art-gene cells, supported binding effects, lights,
atmosphere, raster patches, provenance, and the FNV-1a-based displayed VRI
checksum. State that scene-graph input requires pre-lowered coordinates.

- [ ] **Step 6: Explain deterministic rendering**

Document the implemented pass order:

```text
geometry -> texture fields -> marks -> lighting -> fog/grading -> raster patches
```

Explain SDF coverage, multi-octave texture evaluation, object/world/surface/
screen coordinate spaces, blend modes, light kinds, integer scale expansion,
and the pure `(scene, scale) -> { width, height, data }` output contract.

- [ ] **Step 7: Explain human authority and current limits**

Preserve the ontological PDR's verified architectural principle that curated
intent is input rather than machine-authored taste. Clearly label the durable
ledger, approval adapter, capability retrieval, and Feel-warning loop as
approved design context rather than verified VRI runtime.

Include these implementation limitations:

- VRI checksum uses an eight-character FNV-1a digest, not construction SHA-256.
- VRI freezing is not claimed to be recursively immutable.
- bloom, general masks, and general composite-layer execution are not claimed.
- unknown art-gene binding channels are ignored.
- VRI explicit failures use ordinary JavaScript errors.
- VRI does not call the construction solver directly.

- [ ] **Step 8: Add operator guidance and the source appendix**

Give technical artists and contributors a short decision guide:

```text
Use construction requests for relational geometry.
Use SCDL coordinates/materials for structural asset semantics.
Use VRI inputs for texture, lighting, atmosphere, marks, and authored patches.
Use focused suites to prove deterministic behavior.
```

List the four user-supplied primary sources, supporting VRI schema/index/tests,
and exact verification commands.

- [ ] **Step 9: Check Markdown integrity**

Run:

```bash
git diff --check -- "docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md"
rg -n "T[B]D|T[O]DO|FIXM[E]|PLACEHOLDE[R]" "docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md"
```

Expected: `git diff --check` exits 0 with no output; placeholder scan exits 1
with no matches.

### Task 2: Verify claims and finalize the artifact

**Files:**

- Modify: `docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md`
- Test: `tests/codex/core/pixelbrain/vixel/vri.test.js`
- Test: `tests/codex/core/pixelbrain/construction/construction-solver.test.js`
- Test: `tests/codex/core/pixelbrain/construction/crystal-stave-blade.test.js`

**Interfaces:**

- Consumes: the Task 1 white-paper draft.
- Produces: a reviewed, reproducible white paper and a commit containing only that document.

- [ ] **Step 1: Run the focused verification suites**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/vixel/vri.test.js
npx vitest run \
  tests/codex/core/pixelbrain/construction/construction-solver.test.js \
  tests/codex/core/pixelbrain/construction/crystal-stave-blade.test.js
```

Expected:

```text
VRI: 1 test file passed, 64 tests passed
Construction: 2 test files passed, 122 tests passed
```

- [ ] **Step 2: Audit implementation claims against source**

Run:

```bash
rg -n "export function compileVRI|PB-VRI-COMPILE-v2|canonicalSceneJSON|fnv1aHex|loweredCoordinates" codex/core/pixelbrain/vixel/vri-compiler.js
rg -n "export function renderVRI|Pass [1-6]|atmo\\.fog|atmo\\.grading|RASTER_PATCH" codex/core/pixelbrain/vixel/vri-renderer.js
rg -n "PB-GEOMETRY-CONSTRUCTION-v1|Constraint responsibility|PB-ERR-v1|default-off|SHA-256" docs/scholomance-encyclopedia/PDR-archive/2026-07-25-geometric-construction-solver-pdr.md
```

Expected: every white-paper implementation claim has a corresponding source
match; remove or narrow any claim that does not.

- [ ] **Step 3: Perform the document self-review**

Check the finished paper for:

- unsupported implementation claims;
- confusion between solver and VRI boundaries;
- contradictions between the executive and technical sections;
- unexplained project-specific terminology;
- placeholder language;
- accidental roadmap commitments;
- missing limitations from the approved design.

Edit the paper inline until every item passes.

- [ ] **Step 4: Verify only the intended artifact changed**

Run:

```bash
git status --short -- "docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md"
git diff --check -- "docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md"
```

Expected: the paper is the only path in this task's final change set and the
diff check exits 0.

- [ ] **Step 5: Commit the white paper**

Run:

```bash
git add -- "docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md"
git commit -m "docs: publish verified asset pipeline white paper"
```

Expected: one commit containing only the new white-paper artifact.
