# Design: Perceptual Quality Trio

**Date:** 2026-07-28  
**Status:** implemented — evidence sidecar shipped 2026-07-28  
**Bytecode:** `PB-PERCEPTUAL-FEATURES-v1`, `PB-COMPOSITION-EVIDENCE-v1`, `PB-PHENOTYPE-FIDELITY-v1`  
**Builds on:** Photonic Retina Feel (`src/lib/photonic-retina/`), Vixel Lattice (`src/lib/vixel-lattice/`), SemQuant (`codex/core/pixelbrain/semantic/`), Semantic Calculus dual-derivation (`codex/core/semantic-calculus/`), SCDNA art-genes (`codex/core/pixelbrain/scdna-art-gene.js`), Wand→Vixel pipeline (`scripts/wand-vixel-pipeline.mjs`)

## 1. Problem

Photonic Retina currently measures particular coherence properties (Feel Geometry / Construction / Silhouette AMPs, plus Vixel texture–form diagnostics). That is not enough to prove:

1. **Why** a phenotype passed, failed, or ranked — there is no versioned, comparable observation vector.
2. **Whether locally correct forms compose** into one coherent scene — Feel still operates on flat cells.
3. **Whether “improvement” preserved identity** — optimization can clean an image while destroying curated gene intent.

This design covers the first quality track of the broader Retina sensory-organs roadmap: a canonical feature vector, relational composition + visual weight, and intent-preservation scoring — as **evidence only**.

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | Coupled quality trio (Features + Composition/Weight + Fidelity) |
| Enforcement | **Evidence-only** — never reject by themselves |
| Observation surface | **Dual-mode** — full on `VixelField`; degraded subset on `SpatialField` |
| Composition intent | **Extend SCDNA art-gene** (`balanceMode`, `intendedFocalCenter`, optional weight priors) |
| Region authority | **SemQuant** defines nodes; **Semantic Calculus** dual-derivation governs edges, graph tests, and fidelity claims |
| Architecture | **Evidence sidecar** — attach to Feel/Vixel reports; do not mutate `spatialAwareness` / `verdict` |
| Fidelity surface | **Non-scalar evidence manifold** — never emit a singular `finalScore` / collapsed beauty number in v1 |
| Hierarchical identity | **Shipped (H)** — `hierarchicalIdentityRetention` on fidelity manifold via VisualWeightField tiers |

### 2.1 Out of scope (later sub-projects)

- Hard gates / gene-threshold blocking
- Scalar `finalScore` / collapsed fidelity number (explicitly rejected — see §7)
- `hierarchicalIdentityRetention` (primary/secondary/tertiary/ambient authority) — post-v1 fidelity axis
- `PB-REALIZATION-EQUIVALENCE-v1` (cross-renderer/scale)
- `VisualExecutionManifest` (full lineage replay)
- Multi-dimension Retina verdict matrix + art-family calibration corpus
- BytecodeHealth → SCDNA motif promotion protocol

## 3. Placement and data flow

**Home:** `src/lib/photonic-retina/perceptual/`

Retina owns observation evidence. Vixel remains fusion-only (`fuseToVixelField`). Composition does not become an SCDL compile pass in v1 (compile-time IR cannot see post-Wand fusion).

```
VixelField | SpatialField
        ↓
  RegionPartition  ← SemQuant partId / CanonicalRole / material
        ↓
  CompositionGraph + VisualWeightField
        ↓
  PB-PERCEPTUAL-FEATURES-v1
        ↓
  PhenotypeFidelityReport  ← SCDNA art-gene intent (declared)
        ↓
  attach to PerceptualReport / VixelFeelReport  (no verdict mutation)
```

### 3.1 Dual-mode rules

| Mode | Input | Capability |
|---|---|---|
| `vixel` | `VixelField` | All 12 feature keys; Wand-aware graph edges; vector-path fidelity axis |
| `spatial` | `SpatialField` | Same 12 feature *keys*; some values may be coarser or `null` (see §5.2). Graph/fidelity vector axes may be `availability: 'degraded' \| 'unavailable'` with reasons |

“Degraded” means lower-fidelity parameters or explicit unavailability on the **same schema**, not a different feature set.

Never invent vector claims from pixels alone. Missing metrics are `null` + `reasons[]` — never `NaN`, never silent `0`.

Feature encoding does **not** depend on CompositionGraph (they may run in parallel). The sequential diagram in §3 is the attachment order into the report, not a hard compute dependency.

## 4. Module layout

```
src/lib/photonic-retina/perceptual/
  preprocessing.js
  features-v1.js
  region-partition.js
  composition-graph.js
  visual-weight-field.js
  phenotype-fidelity.js
  evaluate.js
  schema.js
  index.js
```

### 4.1 Public API

```js
evaluatePerceptualEvidence(input, options) → {
  features,      // PB-PERCEPTUAL-FEATURES-v1
  partition,     // RegionPartition
  graph,         // CompositionGraph
  weightField,   // VisualWeightField
  composition,   // CompositionEvidence (PB-COMPOSITION-EVIDENCE-v1)
  fidelity,      // PB-PHENOTYPE-FIDELITY-v1
  mode,          // 'vixel' | 'spatial'
  evidenceHash
}

attachPerceptualEvidence(report, evidence) → report
// Merges evidence without mutating spatialAwareness / verdict
```

### 4.2 Call sites (v1)

1. After Feel compute in `evaluateVixelFeel` / `evaluatePerceptualFeel` path — attach evidence.
2. `scripts/wand-vixel-pipeline.mjs` — print evidence summary.
3. Art-gene compiler — optional attach when Feel evaluator is injected (remains warn-only).

## 5. `PB-PERCEPTUAL-FEATURES-v1`

Frozen object:

```
{
  schema: 'PB-PERCEPTUAL-FEATURES-v1',
  preprocessing: { ...exact contract used... },
  features: { ...12 keys... },
  reasons: string[],
  featureHash: string
}
```

Features are stable evidence explaining Retina outcomes. They do **not** determine whether art is “good.”

### 5.1 Preprocessing contract (normative)

| Rule | Value |
|---|---|
| Color space | sRGB → linear → CIELAB (L\*a\*b\*) for stats; edges on L\* only |
| Resolution | native lattice size; optional `targetSize` (integer, aspect-preserving pad with transparent) |
| Alpha | `α < 0.5` → unoccupied (excluded from mass/edges); no premultiplication into L\* |
| Occupied set | cells with `occupied !== false` and α ≥ 0.5 |
| Normalization | each feature ∈ `[0,1]` unless noted; ratios over occupied bbox |
| Precision | fixed 6 decimal places; stable sort before hash |
| Boundary | edge kernels clamp (no wrap); symmetry mirrors about bbox center (not canvas origin) |
| Determinism | pure function; identical input + preprocessing → identical `featureHash` |

### 5.2 Feature set

| Feature | Measure | `vixel` | `spatial` |
|---|---|---|---|
| `paletteDistance` | mean ΔE76 to gene palette or scene median | yes | yes |
| `luminanceHierarchy` | L\* histogram entropy + step clarity | yes | yes |
| `edgeDensity` | Sobel on L\* / occupied area | yes | yes |
| `orientationEntropy` | edge-orientation histogram entropy | yes | yes |
| `bilateralSymmetry` | L\* mirror correlation L↔R | yes | yes |
| `radialSymmetry` | polar bin correlation | yes | yes |
| `visualCenter` | `[cx, cy]` normalized COM of L\*-weighted mass | yes | yes |
| `massBalance` | `{ leftRight, upperLower }` torque each ∈ [-1, 1] (exception to [0,1] rule) | yes | yes |
| `selfSimilarity` | block-wise L\* NCC at ½ scale (`vixel`: 4×4 min block; `spatial`: 8×8 min block) | yes | yes |
| `spatialComplexity` | occupied boundary length / √area | yes | yes |
| `frequencySlope` | log-power slope of L\* FFT (radially averaged) | yes | yes if w,h ≥ 16 else `null` + reason |
| `fractalDimension` | box-count on occupied mask | yes | yes |

`visualCenter` is a 2-vector (hashed after 6-dp quantization). `massBalance` is the structured exception noted above (components in [-1, 1], 6-dp).

## 6. RegionPartition, CompositionGraph, VisualWeightField

### 6.1 RegionPartition (SemQuant-keyed)

- **Primary key:** `(partId, canonicalRole)` when SemQuant metadata is present.
- **Fallback chain:** `(material)` → connected component of occupied cells with `semanticSource: 'geometry-fallback'` (explicit flag, never silent).
- Per region: bbox, area, centroid, silhouette mask reference, cell ids, SemQuant confidence, optional Wand `pathRef`s overlapping the region (`vixel` only).
- Output is frozen + `partitionHash`.

### 6.2 CompositionGraph

- **Nodes:** regions + synthetic `scene` root.
- **Edge types (deterministic):** `adjacency` (4-connected region touch), `alignment` (centroid axis delta ≤ 5% of scene max-dimension), `overlap` (bbox IoU > 0), `contrast` (ΔE / L\* between region means), `similarity` (palette + role), `depth` (from `z` / depthBand if present, else `unavailable`).
- **Graph tests → CompositionEvidence (`PB-COMPOSITION-EVIDENCE-v1`):**
  - `focalIsolation` — distance/contrast of intended focus region vs neighbors
  - `weightEquilibrium` — realized balance vs gene `balanceMode`
  - `directionalFlow` — dominant edge/orientation consensus
  - `crowding` — neighbor density within radius = 15% of scene max-dimension
  - `negativeSpace` — unoccupied fraction + distribution skew

### 6.3 VisualWeightField

Per-region weight (v1 default): equal-weight mean of min–max-normalized factors

`area`, `luminanceContrast`, `colorContrast`, `edgeDensity`, `semanticImportance`, `depthBand`, `directionalConvergence`, `isolation`

then multiply by gene `regionWeightPriors[regionKey]` when present (default multiplier 1).

- `semanticImportance`: gene prior if declared for that region key; else SemQuant role-table defaults (`focal`/`body` = 1.0, `rim` = 0.6, `constructionGuide` = 0.2, other = 0.5).
- Aggregates: `weightedVisualCenter`, distance to `intendedFocalCenter`, left/right and upper/lower torque, `dynamicBalanceVector`, `dominantLineConvergence`.

### 6.4 SCDNA art-gene extensions

Add (backward compatible):

```
balanceMode?: 'symmetric' | 'radial' | 'dynamic' | 'deliberately-imbalanced'
intendedFocalCenter?: { x: number, y: number }  // normalized [0,1] over canvas
regionWeightPriors?: Record<string, number>
```

Validation: if present, `balanceMode` must be one of the enum values; focal center components must be finite and in `[0,1]`.

Missing intent → still compute realized metrics; set `intentDeclared: false`. Comparison fields are `null`, not fake agreement.

### 6.5 Dual-derivation (Semantic Calculus)

Every graph test and weight comparison stores:

```
{ declared, measured, agreement }
```

- **Declared** comes from SCDNA gene and/or SemQuant IR.
- **Measured** comes from the realized field / partition / graph.
- If both sides would be derived from the same substrate, the claim is **omitted** with reason `ceremony-rejected` (no single-substrate ceremony checks).

Observation receipts may be emitted for BytecodeHealth context. Receipts never rewrite SCDNA.

## 7. `PB-PHENOTYPE-FIDELITY-v1`

Named for a future hard gate; **v1 never blocks**.

### 7.0 Non-scalar law (normative)

Composition and identity are not always commensurable. A deliberately grotesque phenotype may intentionally lower symmetry, increase crowding, or displace the focal center — the same philosophy that `balanceMode` protects against one universal composition law.

**v1 MUST NOT emit** `finalScore`, `finalScoreEvidence` as a scalar, or any single number that collapses coherence and identity. Future agents must not be able to optimize toward a socially authoritative total.

The fidelity surface is a **small evidence manifold**:

```
{
  schema: 'PB-PHENOTYPE-FIDELITY-v1',
  coherenceGain,       // number | null
  identityRetention,   // number | null  (min of available identity axes only)
  axes: { ... },       // per-axis declared/measured/agreement
  constrainedSuggestion, // diagnostic prose only
  reasons: string[]
}
```

`identityRetention` may summarize *identity axes that are available*, but it is never mixed with `coherenceGain` into one score. Consumers that need a decision must read the manifold (and gene intent) explicitly.

### 7.1 Two-axis contract (reported, not collapsed)

```
coherenceGain = Δ(compositionEvidence + perceptual features)
                vs optional baseline/prior snapshot if provided
                (if no baseline: coherenceGain is null + reason 'no-baseline')

identityRetention = min( available identity axes only )
  // never includes coherenceGain
  // unavailable axes are omitted from the min, not treated as 0

axes = {
  semanticIdentityRetention,  // SemQuant part/role set Jaccard vs declared
  silhouetteRetention,        // mask IoU vs SCDL/packet silhouette
  partTopologyRetention,      // part adjacency edit-distance → [0,1]
  vectorPathRetention         // Wand role set + path geometry (vixel only)
  // hierarchicalIdentityRetention — NOT in v1 (see §7.4)
}
```

### 7.2 Comparands

| Axis | Declared (A) | Measured (B) |
|---|---|---|
| Semantic identity | SCDNA traits + SemQuant IR | realized region part/role multiset |
| Silhouette | SCDL / packet silhouette | occupied mask |
| Part topology | SCDL part adjacency | RegionPartition adjacency |
| Vector paths | Wand formula roles / topology | Vixel `pathRef` coverage + geometry |

`spatial` mode: `vectorPathRetention` is `unavailable`. Identity uses whatever SemQuant metadata survived on the SpatialField.

### 7.3 Failure mode closed

Closes “technically improved but no longer the same organism”: evidence can show `coherenceGain↑` with `identityRetention↓` without auto-accepting the change — and without a scalar that would hide which side moved.

### 7.4 Deferred: hierarchical identity

**Later axis (not v1):** `hierarchicalIdentityRetention` — whether relative perceptual hierarchy survived:

- primary focal region
- secondary support regions
- tertiary texture
- ambient emission

Failure mode: nouns/parts survive while narrative authority migrates (e.g. a moon-like orb becomes protagonist; sacred destination / sword logic demoted).

**Placement:** post-v1 **fidelity** expansion (sibling of §7 axes), **not** `PB-REALIZATION-EQUIVALENCE-v1`. Realization-equivalence proves vessel sameness; hierarchy proves *authority* among regions. `VisualWeightField` already exposes weighted centers, isolation, and semantic importance — enough machinery to implement later without redesigning the sidecar.

v1 schema does **not** reserve a null stub key (avoids implying a measured axis). Docs and roadmap only.

## 8. Errors and health

| Condition | Behavior |
|---|---|
| Invalid input shape | throw typed `PERCEPTUAL_EVIDENCE_*` |
| Partial / missing metadata | soft: `null` + `reasons[]` |
| Dual-derivation ceremony | omit claim + `ceremony-rejected` |
| Existing Feel goldens | must not change (`spatialAwareness` / `verdict` untouched) |

Optional BytecodeHealth signals may record fidelity/composition snapshots as observation evidence only.

## 9. Testing

1. Golden `featureHash` on fixture grids; run twice for determinism.
2. Partition stability on SemQuant-labeled packets.
3. Graph / weight: symmetric gene vs `deliberately-imbalanced` gene produce distinct `weightEquilibrium` evidence.
4. Fidelity fixture: coherence up / identity down → `constrainedSuggestion` names the conflict; assert **no** `finalScore` / scalar collapse field exists on the payload.
5. Dual-mode: same phenotype as Spatial vs Vixel → degraded/unavailable flags correct; no invented vector axes.
6. Regression: existing Feel / Vixel Feel tests unchanged for verdict fields.
7. **Local↑ / global↓:** every individual region’s local metrics improve, but global `directionalFlow` collapses.
8. **Wrong protagonist:** silhouette + topology preserved while focal weight migrates to the wrong region (agreement evidence fails on weight/focal axes; identity part Jaccard may still look fine).
9. **Deliberate imbalance:** gene with `balanceMode: 'deliberately-imbalanced'` must **not** be penalized for asymmetric torque (`weightEquilibrium` agreement reflects intent, not a universal symmetry prior).
10. **Low-res SpatialField:** `frequencySlope` and vector-path metrics remain explicitly `null` / `unavailable` with reasons — never coerced to 0.
11. **Sidecar isolation:** mutating only attached perceptual evidence cannot alter any legacy Feel `spatialAwareness` / `verdict` / feelHash golden.
12. **Intent-sensitive agreement:** two visually similar scenes with different declared gene intent produce different `{ declared, measured, agreement }` evidence.

## 10. Success criteria

- A Retina/Vixel report can explain pass/rank with a versioned 12-feature vector under an exact preprocessing contract.
- A scene can be inspected as SemQuant regions + typed relations, not only per-cell quality.
- Gene-declared balance intent can be compared to realized VisualWeightField without imposing one universal composition rule.
- Identity retention is visible beside coherence gain — as a manifold, never a collapsed score.
- None of the above silently mutates ontology or blocks commits in v1.
- No `finalScore` (or equivalent scalar) exists on `PB-PHENOTYPE-FIDELITY-v1` payloads.

## 11. Program context

This trio is sub-projects **A–C** of the Retina sensory-organs roadmap. Remaining:

| Later | Purpose |
|---|---|
| D. Realization equivalence | Cross-renderer/scale proof |
| E. VisualExecutionManifest | Full execution lineage |
| F. Multi-dim Retina + calibration | Named verdict axes by art family |
| G. Motif promotion | BytecodeHealth nominates; human curates into SCDNA |
| H. Hierarchical identity | `hierarchicalIdentityRetention` on fidelity manifold (uses VisualWeightField) |
