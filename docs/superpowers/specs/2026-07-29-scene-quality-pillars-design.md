# Design Specification: Scene Quality Pillars

**Date:** 2026-07-29  
**Status:** Approved  
**Target Subsystems:** `@polaris/scene-compiler`, `@polaris/renderer-pixi`

---

## 1. Overview

This specification establishes five fundamental architectural and artistic pillars for scene generation and visual rendering in PolarisOS. The goal is to eliminate accidental mid-fi vector blobs and replace them with strict pixel craft, global lighting physics, authored texture art-genes, and atmospheric compositional priors.

---

## 2. Goals & Non-Goals

### Goals
- **Bounded Fusion**: Enforce semantic role masks and spatial distance thresholds when merging vector or visual elements, preventing sky/foliage bleeding.
- **Scene Lighting Field**: Re-evaluate terrain, path, and foliage palette steps using a global light intensity falloff matrix $I(x, y, z)$ rather than applying flat tinted overlays or standalone icon graphics.
- **Authored Bark Craft**: Replace synthetic sine-grain noise with cylindrical cross-section value-stepping ($f_{\text{ramp}}(\cos\theta)$) and vertical fiber crevice art-genes.
- **Scene Feel Priors**: Organize scenes around explicit 3-tier depth bands, leading path gestures, and focal distance attenuation.
- **Strict Quality Mode Lock**: Enforce a binary rendering rule: scenes must either be high-density pixel craft adhering to lighting laws or clean sparse iconic silhouettes.

### Non-Goals
- Breaking node-side pure projection testability or FNV-1a contract hashing.
- Adding WebGL post-processing filter pipelines (blur, bloom) that compromise browser performance.

---

## 3. Detailed Architecture & Design Pillars

### Pillar 1: Bounded Fusion (Role & Distance Masking)

* **Location**: `PolarisOS/packages/scene-compiler/src/SceneCompiler.ts` and `scenePlan.ts`
* **Mechanism**:
  * Introduce `SemanticRole` enum: `SKY = 0x01`, `CANOPY = 0x02`, `TRUNK = 0x04`, `GROUND = 0x08`, `PROP = 0x10`.
  * Define an attachment compatibility matrix:
    $$\text{CanAttach}(\text{Role}_A, \text{Role}_B) = (\text{Role}_A \mathbin{\&} \text{AllowedMask}(\text{Role}_B)) \neq 0$$
  * Sky (`0x01`) is restricted from attaching to foliage or tree contours. Fusion is bounded by a spatial cutoff radius $r_{\text{max}} = 16\text{px}$.

---

### Pillar 2: Scene Lighting Field (Global Light Revaluation)

* **Location**: `PolarisOS/packages/renderer-pixi/src/atmospherePlan.ts` and `AtmosphereRenderer.ts`
* **Mechanism**:
  * Instead of applying a full-screen semi-transparent rectangle tint, compute a light intensity field:
    $$I(x, y, z) = I_{\text{base}} + \frac{I_{\text{source}} \cdot (\hat{N} \cdot \hat{L})}{\max(1, d^2 / r_0^2)} \cdot e^{-\gamma z}$$
  * For each sprite or surface element, the lighting field shifts palette indexes:
    - Path & Stair treads: Raise value steps toward light source specular highlights.
    - Foliage: Catch directional light on facing normals; deepen ambient shadows on opposite faces.

---

### Pillar 3: Authored Bark Craft (Art-Genes & Value Steps)

* **Location**: `PolarisOS/packages/renderer-pixi/src/scenePlan.ts` (procedural trunk glyphs)
* **Mechanism**:
  * Eliminate sine-wave horizontal banding patterns.
  * Implement cylindrical lighting ramps across trunk width $u \in [-1, 1]$:
    $$\text{ShadingStep}(u) = \text{Quantize}\left( \sqrt{1 - u^2} \cdot (\hat{N} \cdot \hat{L}), \text{steps}=4 \right)$$
  * Inject vertical crevice art-genes (discrete dark accent lines following trunk contour) and node knot displacements.

---

### Pillar 4: Scene Feel Priors (Depth Bands & Focal Gestures)

* **Location**: `PolarisOS/packages/renderer-pixi/src/scenePlan.ts`
* **Mechanism**:
  * **Depth Bands**:
    - **Background ($Z < 5$)**: Desaturated tones, reduced value contrast, atmospheric haze.
    - **Mid-Ground Focal ($5 \le Z \le 20$)**: Sharp contrast, full palette range, detailed cluster placement.
    - **Foreground ($Z > 20$)**: Silhouetted frame elements leading into the scene.
  * **Path Gesture**: Construct path geometry using continuous S-curve and diagonal gestures leading toward the primary focal hotspot.

---

### Pillar 5: Strict Quality Mode Lock

* **Location**: `PolarisOS/packages/renderer-pixi/src/PixiSceneRenderer.ts`
* **Mechanism**:
  * Validate output scenes against quality metrics.
  * Disallow unclustered mid-density fill (accidental mid-fi blobs).
  * Require scenes to declare either:
    - `MODE_DENSE_PIXEL_CRAFT`: Strictly aligned clusters, high-density palette ramps, lighting field calculations.
    - `MODE_SPARSE_ICONIC`: Clean minimalist vector silhouettes with strong negative space.

---

## 4. Determinism & Testability

- All calculations (lighting field intensity, bark crevice placement, depth band sorting) are pure functions of room state and deterministic FNV-1a seeds.
- Zero non-deterministic random calls (`Math.random`).
- Fully testable in plain Node.js environments (`npm test`).

---

## 5. Verification Plan

1. **Unit Tests**:
   - `scenePlan.test.ts`: Verify bounded fusion masks reject invalid attachments.
   - `atmospherePlan.test.ts`: Verify lighting field intensity calculation and palette re-indexing.
2. **Visual Diagnostics**:
   - Run `art-verify.mjs` via Playwright to generate screenshot comparisons (`01-forest`, `02-after-east`, `03-after-light`).
