# PIR: Photonic Vixel — Pixel + Vector Superposition in the QBIT Lattice

**Date:** 2026-07-27
**Status:** Proof-of-concept validated
**Bytecode:** PB-VIXEL-v1

---

## 1. Executive Summary

Built and validated the **Vixel fusion module** — a new representational format
inside the Photonic Retina where each lattice cell carries **dual-medium
identity simultaneously**: pixel identity (color, material, emphasis) AND vector
identity (pathRef, parametricT, normal, curvature). Neither medium is
subordinate. They are in superposition within the same cell.

The proof-of-concept forged the shrine-demo brazier through the full pipeline:
SCDL compile → Wand vector paths → Vixel fusion → Photonic Feel evaluation.
The result: **two new perceptual signals** that pixel-only feel cannot provide —
texture-form coherence (does the grain follow the curve?) and silhouette
smoothness (do the pixels hug the path?).

---

## 2. Problem Statement

Before Vixels, pixel art and vector art were **two separate pipelines that met
at rasterization and lost each other**:

- The **Wand** produces smooth parametric curves. After rasterization, the
  curve is gone — what remains is a staircase approximation.
- **PixelBrain** produces rich texture (materials, grain, specular). But it's
  grid-locked — no smooth arcs, no texture that follows form.
- The **SCDL compiler** paints materials onto the flat rasterized result. The
  material doesn't *know* it's sitting on a curve.

Neither medium knew the other existed. They were parallel monologues.

---

## 3. What Was Built

### 3.1 Vixel Fusion Module (`src/lib/photonic-retina/retina-vixel.js`)

**24.7 KB, 6 exported functions, fully deterministic.**

| Function | Purpose |
|---|---|
| `fuseVixelField(packet, vectorPaths, options)` | Fuses a PixelBrain packet with Wand vector paths into a Vixel field. Each pixel cell is tagged with its nearest vector point's provenance: parametricT, tangent, normal, curvature. |
| `vixelToSpatialField(vixelField)` | Projects a Vixel field to a SpatialField for the existing Feel module (drops vector refs). |
| `evaluateTextureFormCoherence(vixelField)` | **PCA-based grain-vs-tangent alignment.** For each fused cell, computes the principal axis of same-material neighbors (2×2 covariance eigenvector) and measures its alignment with the curve's tangent. Score 1.0 = grain flows along the form. Score 0.0 = grain cuts perpendicular. |
| `evaluateSilhouetteSmoothness(vixelField)` | Measures how far fused pixels sit from the vector path. Close = smooth silhouette. Far = staircase visible. |
| `evaluateVixelFeel(vixelField, options)` | Full Vixel feel: blends spatial awareness (40%) + texture-form coherence (30%) + silhouette smoothness (30%) into a single `vixelAwareness` score. Generates actionable SCDL suggestions. |
| `diffVixelFeel(prevFeel, currFeel)` | Diffs two Vixel feel reports. Returns per-channel deltas, improved/regressed lists, and net improvement. |

### 3.2 Vixel Cell Structure

```js
{
  x, y,                          // grid position
  pixel: {                       // PIXEL IDENTITY
    color, material, emphasis,
    partId, role
  },
  vector: {                      // VECTOR IDENTITY (null for pure-pixel cells)
    pathRef,                     // which Wand path this cell belongs to
    parametricT,                 // where on the curve (0–1)
    tangent: [tx, ty],           // curve direction at this point
    normal: [nx, ny],            // surface normal (perpendicular to tangent)
    curvature,                   // how sharply the form bends
    distance                     // pixel-to-path distance
  }
}
```

### 3.3 Integration

- Exported from `src/lib/photonic-retina/index.js`
- Registered in the **photonic bridge registry** (`codex/core/pixelbrain/photonic-bridge-registry.js`)
  for LING-0F03-compliant runtime access from `codex/core`
- All outputs frozen. All scoring deterministic. All content-hashed.

### 3.4 Test Suite (`tests/photonic-retina/retina-vixel.test.js`)

**27 tests**, covering:
- Fusion correctness (cells get vector refs, pixel identity preserved)
- Determinism (identical input → identical vixelHash)
- Graceful degradation (no vector paths → pure pixel field)
- Validation errors (invalid inputs rejected)
- Object freezing (all outputs immutable)
- PCA grain direction (horizontal bar + horizontal path → high coherence)
- Differential geometry (tangent, normal, curvature correctness)
- Full feel evaluation (spatial + texture-form + silhouette)
- Feel diff (channel deltas, improved/regressed tracking)

### 3.5 Proof-of-Concept Script (`scripts/vixel-proof-of-concept.mjs`)

End-to-end demonstration: SCDL compile → Wand vector paths → Vixel fusion →
Feel evaluation → pixel-only comparison.

---

## 4. Proof-of-Concept Results

### Brazier Vixel Fusion

| Metric | Value |
|---|---|
| SCDL pixel cells | 175 |
| Wand vector points | 39 (21 rim + 18 bowl) |
| Fused cells | 148 (84.6%) |
| Pure-pixel cells | 27 (base/stem, no nearby vector path) |
| Vixel hash | `2E7E3202` |

### Feel Evaluation

| Channel | Score | Meaning |
|---|---|---|
| **Vixel awareness** | **0.7207** | Aggregate: spatial + texture-form + silhouette |
| Spatial awareness | 0.7288 | Same as pixel-only (same spatial field) |
| **Texture-form coherence** | **0.686** | Grain mostly follows the curve, but not perfectly |
| **Silhouette smoothness** | **0.7448** | Pixels hug the curve reasonably well |

### Sample Fused Cell

Cell at (2, 4) on the brazier rim:
- **pixel:** color=#332725, material=obsidian
- **vector:** path=brazier.rim, T=0.525, tangent=[0.159, -0.987], curvature=0.0627

The pixel knows it's on the rim curve, at parametric position 0.525, with a
nearly-vertical tangent (the rim curves downward at the edges). This information
is **invisible** to the pixel-only feel.

### What the Vixel Feel Tells Us That Pixel-Only Cannot

1. **Texture-form coherence (0.686):** The obsidian grain mostly follows the
   rim curve, but at the edges the grid-aligned cells diverge from the tangent.
   Suggestion: use `path` ops instead of `rect` ops for the rim so cells
   follow the form.

2. **Silhouette smoothness (0.7448):** The pixel boundary hugs the vector path
   at an average distance of ~3 pixels. The staircase is visible at the rim
   edges. Suggestion: increase canvas resolution or use `circle`/`ellipse` ops
   for curved forms.

These are the **"emotion of a painter's spatial awareness"** — the feel of
whether the medium and the form are in accord.

---

## 5. Architecture

```
Wand (formula-to-coordinates.js)
    │  evaluateParametricCurve / evaluateMathematicalStroke
    │  → vectorPaths [{ pathRef, points: [{x, y, t}] }]
    │
    ▼
SCDL Compiler (scdl.compiler.js)
    │  compileSCDL(source) → PixelBrain packet
    │  → geometry.coordinates [{x, y, color, material, partId}]
    │
    ▼
Vixel Fusion (retina-vixel.js)          ← NEW
    │  fuseVixelField(packet, vectorPaths)
    │  → VixelField { cells: [{pixel, vector}] }
    │
    ├──→ vixelToSpatialField() → existing Feel (geometry/construction/silhouette)
    │
    ├──→ evaluateTextureFormCoherence()  ← NEW AMP
    │    PCA grain direction vs curve tangent
    │
    ├──→ evaluateSilhouetteSmoothness()  ← NEW AMP
    │    pixel-to-path distance
    │
    └──→ evaluateVixelFeel()             ← NEW composer
         spatial (40%) + texture-form (30%) + silhouette (30%)
         → vixelAwareness score + SCDL suggestions
```

---

## 6. Verification

| Check | Result |
|---|---|
| Vixel tests (27) | ✅ All pass |
| Photonic-retina suite (140) | ✅ All pass |
| PolarisOS suite (318) | ✅ All pass |
| Typecheck | ✅ 0 new errors (5 pre-existing, none in Vixel files) |
| Determinism | ✅ Identical input → identical vixelHash and vixelFeelHash |
| Proof-of-concept | ✅ 84.6% fusion ratio, vixelAwareness 0.7207 |
| Bridge registry | ✅ All 5 Vixel functions registered for LING-0F03 |

---

## 7. Honest Ceiling

### What Vixels give us
- **Texture-form coherence:** a deterministic, measurable signal for whether
  material grain follows the vector form. This is the "wood grain on a curved
  table edge" problem, codified.
- **Silhouette smoothness:** a deterministic signal for whether the pixel
  boundary hugs the vector path or shows staircase.
- **Dual-medium identity:** each cell knows BOTH what it looks like (pixel)
  AND what it's part of (vector). The renderer can use whichever the context
  demands.
- **Iteration tracking:** `diffVixelFeel` tells you which channels improved
  or regressed between iterations.

### What Vixels do NOT give us
- **Taste.** The coherence score tells you the grain is misaligned. It does
  not tell you whether the brazier *feels magical*. That layer is still the
  artist (human or AI) reasoning about mood, narrative, and intent.
- **Automatic correction.** The suggestions are actionable SCDL directives,
  but they still require an agent to apply them. The Vixel module diagnoses;
  it does not repair.
- **Sub-pixel rendering.** The silhouette smoothness score measures
  pixel-to-path distance, but the actual rendering is still grid-locked.
  True sub-pixel anti-aliasing would require renderer changes.

### Calibration gap
The texture-form coherence AMP uses PCA on same-material neighbor positions
as a proxy for "grain direction." This works well for regular grids (horizontal
bars, vertical columns) but may be noisy for irregular material distributions.
A future refinement could use the SCDL material registry's actual grain
parameters (if they exist) rather than inferring grain from spatial arrangement.

---

## 8. Deferred Items

| Item | Rationale |
|---|---|
| Re-forge all 7 shrine-demo assets as Vixels | Proof-of-concept validates the pipeline; full re-forge is a content task, not an architecture task |
| Vixel-aware renderer (PixiJS draws texture along tangent) | Requires renderer changes; the Vixel field is ready for consumption |
| Color harmony AMP inside the Vixel feel | The existing Feel module's palette analysis covers this at the spatial level; a Vixel-specific color harmony AMP would evaluate color-along-curve coherence |
| Temporal Vixels (animation frames with vector provenance) | SCDL v1.1 frames + Wand time parameter; the fusion module would need to track parametricT across frames |
| Human calibration of coherence thresholds | The 0.5 suggestion threshold is a guess; a human artist should validate what "good enough" looks like |
| Pixel-precise SCDL suggestion vectors | Current suggestions are textual ("use path ops"); future suggestions could emit exact SCDL diff patches |

---

## 9. Files Created / Modified

| File | Action | Size |
|---|---|---|
| `src/lib/photonic-retina/retina-vixel.js` | **Created** | 24.7 KB |
| `tests/photonic-retina/retina-vixel.test.js` | **Created** | 15.6 KB |
| `scripts/vixel-proof-of-concept.mjs` | **Created** | 9.1 KB |
| `src/lib/photonic-retina/index.js` | **Modified** | +15 lines (exports + bridge registration) |

---

## 10. The Supercedence Claim — Validated?

The original hypothesis: *"combining pixel art with vector art creates Vixels
that supercede both mediums individually."*

**Evidence for:**
- The Vixel feel produces two signals (texture-form coherence, silhouette
  smoothness) that are **structurally impossible** for pixel-only or
  vector-only evaluation to produce.
- The sample fused cell at (2, 4) carries information (parametricT=0.525,
  tangent=[0.159, -0.987], curvature=0.0627) that exists in neither the
  pixel grid nor the vector path alone — it exists only in the superposition.
- The suggestions generated ("use path ops instead of rect ops") are
  **actionable SCDL directives** that directly address the grid-vs-curve
  tension. Neither medium alone could generate this feedback.

**Evidence against:**
- The vixelAwareness score (0.7207) is slightly *lower* than the pixel-only
  spatial awareness (0.7288). This is expected: the Vixel feel adds two new
  channels that expose imperfections the pixel-only feel was blind to. The
  score went down because we can now *see* problems we couldn't see before.
  This is a feature, not a bug — but it means the supercedence is in
  **diagnostic power**, not in a higher number.

**Verdict:** The supercedence claim is validated for **diagnostic and
evaluative power**. The Vixel format gives the artist (human or AI) structured,
deterministic feedback about texture-form coherence and silhouette smoothness
that neither medium can provide alone. Whether this translates to
**visually superior art** depends on the artist acting on the feedback —
which is the next step.
