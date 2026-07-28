# Perceptual Quality Trio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship evidence-only `PB-PERCEPTUAL-FEATURES-v1` + CompositionGraph/VisualWeightField + non-scalar `PB-PHENOTYPE-FIDELITY-v1` sidecar under `src/lib/photonic-retina/perceptual/`, wired into Feel/Vixel without mutating legacy verdicts.

**Architecture:** Pure evidence sidecar. SemQuant keys regions; Semantic Calculus dual-derivation shapes `{declared,measured,agreement}` claims. Dual-mode (`vixel` | `spatial`). No `finalScore`.

**Tech Stack:** Node ESM, Vitest, existing Photonic Retina / Vixel / SCDNA art-gene modules.

**Spec:** `docs/superpowers/specs/2026-07-28-perceptual-quality-trio-design.md`

## Global Constraints

- Evidence-only — never reject / never rewrite SCDNA
- Never emit `finalScore` or scalar collapse of coherence×identity
- Never mutate `spatialAwareness`, `verdict`, or Feel `feelHash` inputs
- Missing metrics → `null` + `reasons[]` (never silent `0` / `NaN`)
- Quantize numeric features to 6 decimal places; freeze outputs; deterministic hashes
- `hierarchicalIdentityRetention` is out of scope

---

### Task 1: Schema + preprocessing lattice

**Files:**
- Create: `src/lib/photonic-retina/perceptual/schema.js`
- Create: `src/lib/photonic-retina/perceptual/preprocessing.js`
- Create: `tests/photonic-retina/perceptual/preprocessing.test.js`

**Interfaces:**
- Produces: `FEATURE_SCHEMA`, `COMPOSITION_SCHEMA`, `FIDELITY_SCHEMA`, `quantize6(n)`, `contentHash(obj)`, `toLabLattice(input, options) → { width, height, mode, occupied[], L,a,b grids, bbox, reasons }`

- [ ] **Step 1:** Write failing tests for alpha occupancy (`α<0.5` excluded), clamp edges, 6-dp quantize, determinism of lattice hash inputs
- [ ] **Step 2:** Run `npx vitest run tests/photonic-retina/perceptual/preprocessing.test.js` — expect FAIL (module missing)
- [ ] **Step 3:** Implement schema constants + `toLabLattice` (sRGB→linear→Lab, SpatialField or VixelField cells)
- [ ] **Step 4:** Re-run tests — PASS
- [ ] **Step 5:** Commit only if user requested commits (otherwise skip)

---

### Task 2: `PB-PERCEPTUAL-FEATURES-v1` encoder

**Files:**
- Create: `src/lib/photonic-retina/perceptual/features-v1.js`
- Create: `tests/photonic-retina/perceptual/features-v1.test.js`

**Interfaces:**
- Consumes: `toLabLattice`, `quantize6`, `contentHash`
- Produces: `encodePerceptualFeatures(input, options) → frozen PB-PERCEPTUAL-FEATURES-v1`

- [ ] **Step 1:** Failing tests — all 12 keys present; low-res `frequencySlope===null` with reason; determinism of `featureHash`; left-heavy `massBalance.leftRight < 0`
- [ ] **Step 2:** Run vitest — FAIL
- [ ] **Step 3:** Implement 12 features per spec §5
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit if requested

---

### Task 3: RegionPartition

**Files:**
- Create: `src/lib/photonic-retina/perceptual/region-partition.js`
- Create: `tests/photonic-retina/perceptual/region-partition.test.js`

**Interfaces:**
- Produces: `partitionRegions(input, options) → { regions, partitionHash, mode, reasons }`
- Region: `{ id, partId, canonicalRole, material, semanticSource, bbox, area, centroid, cellIds, pathRefs?, confidence }`

- [ ] **Step 1:** Tests — SemQuant `(partId,role)` grouping; material fallback; geometry-fallback flagged; stable hash
- [ ] **Step 2–4:** Implement + green
- [ ] **Step 5:** Commit if requested

---

### Task 4: CompositionGraph + VisualWeightField + CompositionEvidence

**Files:**
- Create: `src/lib/photonic-retina/perceptual/composition-graph.js`
- Create: `src/lib/photonic-retina/perceptual/visual-weight-field.js`
- Create: `tests/photonic-retina/perceptual/composition.test.js`

**Interfaces:**
- Produces: `buildCompositionGraph(partition, lattice, geneIntent)`, `buildVisualWeightField(partition, lattice, geneIntent)`, `evaluateCompositionEvidence(graph, weightField, geneIntent)`
- Dual-derivation claim shape: `{ declared, measured, agreement }` or omitted with `ceremony-rejected`

- [ ] **Step 1:** Tests — deliberate-imbalance not penalized; intent-sensitive agreement; edges adjacency/alignment
- [ ] **Step 2–4:** Implement + green
- [ ] **Step 5:** Commit if requested

---

### Task 5: PhenotypeFidelity manifold (non-scalar)

**Files:**
- Create: `src/lib/photonic-retina/perceptual/phenotype-fidelity.js`
- Create: `tests/photonic-retina/perceptual/phenotype-fidelity.test.js`

**Interfaces:**
- Produces: `evaluatePhenotypeFidelity({ mode, partition, features, composition, geneIntent, declaredParts, declaredSilhouette, declaredTopology, declaredWandRoles, baseline })`
- MUST NOT include `finalScore` / `finalScoreEvidence`

- [ ] **Step 1:** Tests — no finalScore key; coherenceGain null without baseline; identity min omits unavailable; constrainedSuggestion on coherence↑ identity↓; spatial vectorPath unavailable
- [ ] **Step 2–4:** Implement + green
- [ ] **Step 5:** Commit if requested

---

### Task 6: `evaluatePerceptualEvidence` + attach + index exports

**Files:**
- Create: `src/lib/photonic-retina/perceptual/evaluate.js`
- Create: `src/lib/photonic-retina/perceptual/index.js`
- Modify: `src/lib/photonic-retina/index.js`
- Create: `tests/photonic-retina/perceptual/evaluate.test.js`

**Interfaces:**
- `evaluatePerceptualEvidence(input, options)`
- `attachPerceptualEvidence(report, evidence)` — shallow merge under `perceptualEvidence`; copy verdict fields unchanged

- [ ] **Step 1:** Sidecar isolation test — attach then mutate evidence; feelHash/spatialAwareness unchanged
- [ ] **Step 2–4:** Implement + green
- [ ] **Step 5:** Commit if requested

---

### Task 7: SCDNA art-gene intent fields + wiring

**Files:**
- Modify: `codex/core/pixelbrain/scdna-art-gene.js` — add `balanceMode`, `intendedFocalCenter`, `regionWeightPriors` validation + packet fields
- Modify: `src/lib/vixel-lattice/vixel-feel-adapter.js` — attach evidence after Feel (opt-in via `options.perceptualEvidence !== false` default true, or default true with geneIntent from options)
- Modify: `scripts/wand-vixel-pipeline.mjs` — print evidence summary
- Create/Modify art-gene tests if present
- Create: `tests/photonic-retina/perceptual/qa-fixtures.test.js` covering spec §9 items 7–12

- [ ] **Step 1:** Write QA fixture tests first (local↑/global↓, wrong protagonist, deliberate imbalance, low-res, sidecar, intent-sensitive)
- [ ] **Step 2:** Wire gene + Feel + pipeline
- [ ] **Step 3:** `npx vitest run tests/photonic-retina/perceptual tests/photonic-retina/retina-feel.test.js tests/photonic-retina/retina-vixel.test.js`
- [ ] **Step 4:** Confirm Feel goldens unchanged
- [ ] **Step 5:** Commit if requested

---

## Spec coverage checklist

| Spec section | Task |
|---|---|
| §5 Features + preprocessing | 1–2 |
| §6 Partition/Graph/Weight/Gene | 3–4, 7 |
| §7 Fidelity manifold / no scalar | 5 |
| §4 API + attach | 6 |
| §4.2 call sites | 7 |
| §9 tests 1–12 | 2–7 |
