# Post-Implementation Report: Scholomium Ink — SCD128 Dual-Witness Art Intelligence & Seven-Tree Laboratory Pilot

## 1. Change Identity

- **Report ID:** `PIR-20260907-SCHOLOMIUM-INK-SCD128-PILOT`
- **Feature / Subsystem Name:** Scholomium Ink — SCD128 Dual-Witness Architecture & Seven-Tree Botanical Laboratory
- **Author / Agent:** Gemini (Backend Coder & Debug Inquisitor), with Codex (Schema Architecture) and Angel (Project Artist & Arbiter)
- **Date:** 2026-09-07
- **Related PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-07-scholomium-ink-scd128-tree-lab-pdr.md`
- **Classification:** Architectural | PixelBrain | SCDL v2 | Art Intelligence | Forensic Inquisitor | Promotion Verdict
- **Priority:** Critical
- **Status:** Complete — Recommended for Promotion (Awaiting Angel's Sovereign Verdict)
- **Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PIR-SCHOLOMIUM-INK-SCD128-2026-09-07`

---

## 2. Executive Summary

This Post-Implementation Report records the delivery, empirical validation, forensic debugging, and promotion verdict of **Scholomium Ink** and the **SCD128 Dual-Witness Art Intelligence** pilot.

Scholomium Ink was built to solve a foundational fragility in procedural art: when visual decoration (color, texture, finish) and structural form (silhouette, proportion, topology, negative space) share a single mutable representation, passes silently deform each other, and generation degrades into generic or broken assets.

The laboratory introduced **SCD128**, an art-specific 128-hex sibling of SCD64 consisting of two strictly isolated 64-character witnesses:
```text
SCD128 = FORM64 (blocks 01–08) || REALIZATION64 (blocks 09–16)
```
Form and Realization are disjoint. They are heard solely by a pure deterministic **SCD128 Lawyer**, which issues either a canonical compatibility receipt or a non-heritable laboratory quarantine receipt.

Across a pilot corpus of seven canonical tree species (**Oak, Hickory, Redwood, Cedar, Pine, Evergreen, Maple**), the system has successfully:
1. Admitted all **7 Canonical Masters** with complete, content-addressed evidence bundles and receipts.
2. Synthesized **14 Natural Variants** (2 per family) with distinct morphological habit without copying coordinates.
3. Generated **3 Original Scholomance Hybrids** (`scholo_ironbark_redcedar`, `scholo_weeping_voidmaple`, `scholo_frostpine_evergreen`) citing explicit parental ancestry and declared mutations.
4. Resolved a major rendering defect: the **"Vectorized SVG / Matte Fingerpaint" pollution**, proving that pixel-art pipelines must reject continuous sub-pixel math (`smoothstep` AA, float-based Lambertian lighting) in favor of discrete 1x cell logic and integer nearest-neighbour magnification.
5. Achieved **100% test pass rate** (26/26 tests green) across all 8 test suites in `tests/codex/core/pixelbrain/scholomium-ink/`.

---

## 3. Physical Contract and Bank Isolation

### 3.1 The SCD128 Wire Layout
SCD128 contains exactly 128 uppercase hexadecimal characters formatted into sixteen 8-character blocks:
- **`FORM64` (Blocks 01–08)**: Geometry, topology, proportion, mass distribution, negative space, branch scaffolding, root anchoring.
- **`REALIZATION64` (Blocks 09–16)**: Cluster density, edge treatment, value ramps, material bindings, local lighting, surface detail, specular flecks.
- **Checksum Invariant**: `checksum128 === form.checksum64 + realization.checksum64`.
- **SCD64 Parity**: Existing SCD64 contracts, diagnostic channels, and memory systems remain 100% byte-identical and untouched.

### 3.2 Mechanically Enforced Bank Isolation
- The dependency graphs for `FORM64` and `REALIZATION64` schemas, analyzers, and validators are strictly disjoint.
- Neither bank imports, reads, infers, or conditions itself on the other.
- Mutating palette entries leaves `FORM64` byte-identical.
- Mutating silhouette and skeleton geometry leaves `REALIZATION64` byte-identical.

### 3.3 The Lawyer Boundary and Quarantine Non-Heritability
- The **SCD128 Lawyer** (`codex/core/pixelbrain/scholomium-ink/scd128/counsel/counsel.lawyer.js`) is the sole production module permitted to hear both witnesses.
- The Lawyer never mutates witness packets and never renders pixels.
- If conflicts occur, it issues a **quarantined laboratory receipt**.
- **Quarantine Non-Heritability**: Diagnostic previews can teach a human artist, but they are programmatically barred from entering a corpus, deriving an AMP, becoming ancestry, or being exported as canonical assets.

---

## 4. Emitted Asset Gallery & Tree Laboratory Deliverables

All deliverables have been emitted to [`Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/`](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/):

### 4.1 Seven Canonical Masters (`masters/`)
| Master Tree | Family | Canvas | Silhouette Habit | Artifacts |
|---|---|---|---|---|
| **Oak Master** | `oak` | 48x64 | `broad_rounded` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/oak_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/oak_master-png.png) · [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/oak_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/oak_master-json.json) |
| **Hickory Master** | `hickory` | 32x52 | `oval_columnar` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/hickory_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/hickory_master-png.png) · [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/hickory_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/hickory_master-json.json) |
| **Redwood Master** | `redwood` | 48x112 | `tapered_spire` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/redwood_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/redwood_master-png.png) · [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/redwood_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/redwood_master-json.json) |
| **Cedar Master** | `cedar` | 48x64 | `horizontal_terraced` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/cedar_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/cedar_master-png.png) · [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/cedar_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/cedar_master-json.json) |
| **Pine Master** | `pine` | 32x64 | `radial_tiered` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/pine_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/pine_master-png.png) · [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/pine_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/pine_master-json.json) |
| **Evergreen Master** | `evergreen` | 32x52 | `dense_conical` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/evergreen_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/evergreen_master-png.png) · [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/evergreen_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/evergreen_master-json.json) |
| **Maple Master** | `maple` | 48x64 | `lobed_spreading` | [Preview 8x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/maple_master-preview-8x.png) · [Native 1x](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/maple_master-png.png) | [SCDL](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/maple_master.scdl) · [JSON](file:///home/deck/Downloads/Scholomance-V12-main/Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/masters/maple_master-json.json) |

### 4.2 Fourteen Natural Variants (`variants/`)
Two distinct morphological descendants per family:
- **Oak**: `oak_ancient` (58x70), `oak_young` (38x54)
- **Hickory**: `hickory_slender` (36x67), `hickory_mature` (48x74)
- **Redwood**: `redwood_monarch` (62x80), `redwood_spire` (38x70)
- **Cedar**: `cedar_windswept` (55x58), `cedar_terraced` (48x67)
- **Pine**: `pine_open` (43x61), `pine_high_canopy` (41x74)
- **Evergreen**: `evergreen_dense` (53x61), `evergreen_frostbound` (48x64)
- **Maple**: `maple_autumn` (53x64), `maple_spreading` (62x61)

### 4.3 Three Scholomance Fantasy Hybrids (`hybrids/`)
- **`scholo_ironbark_redcedar`** (`redwood + cedar`): Emerald cedar terraces supported by a fibrous cinnamon ironbark trunk.
- **`scholo_weeping_voidmaple`** (`maple + oak`): Radiant scarlet autumn crown with weeping void tendrils trailing downwards from leaf lobe skirts into an ashen trunk.
- **`scholo_frostpine_evergreen`** (`pine + evergreen`): Glacial indigo/cyan conifer whorls tipped with crystalline ice highlights (`#BAE6FD`).

---

## 5. Forensic Inquisitor Audit: The Vector/SVG Pollution Anomaly

### 5.1 The Anomaly ("Matte Fingerpaint / Vectorized SVG Coloring")
During initial generation testing, the artist observed that tree previews looked "like a matte fingerpaint finish" and that "color still has a fingerpaint type of look. It removes the pixel and replaces it with vectorized SVG coloring."

### 5.2 Forensic Diagnosis & Root Cause
A code-level forensic audit of the preview pipeline revealed three vector graphics contaminants operating inside what was supposed to be a pixel-art engine:

1. **Sub-Pixel Continuous Anti-Aliasing (`smoothstep`)**:
   In `codex/core/pixelbrain/vixel/vri-renderer.js` (Pass 1), geometry coverage was calculated per sub-pixel via:
   ```javascript
   const edge = 0.5 / scale;
   coverage = smoothstep(-edge, edge, -localSD);
   ```
   This is the exact mathematical formulation used in 2D vector renderers (SVG engines, Cairo, Skia) to smooth vector outlines. At scale 8, instead of magnifying a discrete 1x pixel block, it calculated 64 sub-pixel coverage values, blurring away discrete cell borders and "removing the pixel."

2. **Continuous Sub-Pixel Lighting as Linear Vector Gradients**:
   In `vri-renderer.js` (Pass 4), illumination was evaluated over continuous floating-point coordinates `(worldX, worldY)`:
   ```javascript
   const worldX = cx + (sx + 0.5) / scale;
   const worldY = cy + (sy + 0.5) / scale;
   const contribution = _lightContribution(light, cell, worldX, worldY);
   ```
   When applied to smooth mathematical circles (`circle cx cy r`), this produced continuous linear gradient bands sweeping diagonally across the canopy, creating the visual appearance of an Illustrator/Inkscape gradient fill or fingerpaint stroke.

3. **Continuous Harmonic Sine Waves**:
   The texture engine (`evaluateTexture`) calculated continuous sine waves (`Math.sin(...)`) matching SVG filter primitives (`<feTurbulence>`) rather than discrete, stepped pixel dither.

### 5.3 The Solution (Botanical Pixel-Art Synthesis)
In `scripts/generate-trees-for-studio.mjs`, we introduced `synthesizeBotanicalTreeArt`:
- **Discrete 1-Cell Organic Habits**: Replaced geometric mathematical circles with organic leaf clump lobes, notched perimeters, negative space scaffold breaks, and tiered conifer boughs.
- **Local Spherical Normals**: Each leaf clump evaluates its own spherical normal $\vec{N}$ against upper-left directional light `[-0.65, -0.75]`, creating bulbous volumetric form rather than flat diagonal sheets.
- **Hue-Shifted Discrete Palettes**: 8-tone canopy ramps (`c0`–`c7`) and 5-tone wood ramps (`t0`–`t4`) shifting naturally between warm highlights and cool shadows.
- **2x2 Bayer Dithering**: Subtle ordered checkerboard stippling at tone transitions.
- **Integer Nearest-Neighbour Magnification**: Native 1x PNG rendered to exact cell coordinates; 8x preview upscaled strictly through nearest-neighbour integer block copying (0 sub-pixel blur).

---

## 6. Verification and Empirical Evidence

### 6.1 Automated Test Battery
Execution of `npx vitest run tests/codex/core/pixelbrain/scholomium-ink/` verified **all 8 test files, 26/26 tests passed green (100%)**:
- `tests/codex/core/pixelbrain/scholomium-ink/scd128-canonical.test.js` (F1, F2: wire contract, block structure, digest verification)
- `tests/codex/core/pixelbrain/scholomium-ink/bank-isolation.test.js` (F3: disjoint dependency graphs, mutation invariance)
- `tests/codex/core/pixelbrain/scholomium-ink/counsel-lawyer.test.js` (F4: pure adjudication, determinism)
- `tests/codex/core/pixelbrain/scholomium-ink/quarantine.test.js` (F5: quarantine containment, non-heritability)
- `tests/codex/core/pixelbrain/scholomium-ink/tree-corpus.test.js` (F6: 7 masters admission receipts)
- `tests/codex/core/pixelbrain/scholomium-ink/tree-derivation.test.js` (F7: 14 variants + 3 hybrids derivation)
- `tests/codex/core/pixelbrain/scholomium-ink/tree-projection.test.js` (F9: 9-layer SCDL v2 projection)
- `tests/codex/core/pixelbrain/scholomium-ink/corpus-ledger.test.js` (Ledger append-only tamper safety)

### 6.2 SCDL v2 Semantic Layer Integrity
Every emitted asset cleanly separates all 9 semantic layers in `layerSurfaces` and Studio JSON packets:
`ground_shadow`, `roots_and_ground`, `trunk`, `primary_branches`, `secondary_branches`, `canopy_masses`, `foliage_edges`, `surface_detail`, `highlights`.

---

## 7. Promotion Verdict & Invariant Boundaries

### 7.1 The Verdict: PROMOTE SCD128 CORE
We recommend that Angel formally **promote the SCD128 Core Architecture** into the standard PixelBrain pre-render intelligence workflow:
- The 128-hex wire specification is sealed.
- The two-bank isolation law (`FORM64 || REALIZATION64`) is mechanically sound and proven.
- The pure Lawyer and quarantine containment protocols are fully functional.

### 7.2 The Non-Negotiable Invariants (Encoded for the Future)

1. **Law of Family Vocabulary Isolation**:
   - The sixteen physical slot roles are universal.
   - The vocabularies (e.g. `broad_rounded`, `tapered_spire`, `cinnamon_furrows`) are strictly **tree-specific**.
   - Future asset families (Chibi Characters, Blades, Plate Armor, Dungeons) must define their own disjoint vocabularies, analyzers, and Lawyer policies. Tree terms must never be imported as shortcuts.

2. **Law of Discrete Pixel Cells (The Anti-Vector Invariant)**:
   - **Pixel art is discrete grid art.**
   - Continuous sub-pixel math (`smoothstep` AA on SDFs, floating-point gradient lighting, continuous harmonic textures) is **strictly forbidden** from substituting for discrete pixel art.
   - Previews and exports must use **integer nearest-neighbour block scaling** only.
   - Shading transitions must use discrete palette ramps and Bayer dithering, never sub-pixel color blending.

---

## 8. Next Steps & Action Items

1. **Angel's Sovereign Sign-Off**:
   - Angel to review this PIR and the visual artifacts in `Pixel-Art-Studio-Skeleton/SCDL-V2-ASSETS/TREES/`.
   - Formally authorize the promotion of the SCD128 Core.
2. **Encyclopedia & Law Enshrinement**:
   - Enshrine Rule 7 ("Pixel Art Sovereignty vs. Vector/SVG Pollution") in `GEMINI.md` under Pipeline Discipline.
   - Update PDR status in `docs/scholomance-encyclopedia/PDR-archive/2026-09-07-scholomium-ink-scd128-tree-lab-pdr.md` to Implemented.

