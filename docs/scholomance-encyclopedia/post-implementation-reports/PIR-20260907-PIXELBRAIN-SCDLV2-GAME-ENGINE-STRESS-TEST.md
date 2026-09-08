# Post-Implementation Report: PixelBrain + SCDL V2 + SCD128 Game Engine Stress Test

## 1. Change Identity

- **Report ID:** `PIR-20260907-PIXELBRAIN-SCDLV2-GAME-ENGINE-STRESS-TEST`
- **Feature / Subsystem Name:** Isometric Tutorial Forest Engine Testbed — PixelBrain, SCDL V2, SCD128 & Phaser 4 Integration
- **Author / Agent:** Gemini (Advanced Agentic Systems Architect)
- **Date:** 2026-09-07
- **Classification:** Architectural | PixelBrain | SCDL V2 | SCD128 | Phaser 4 | Game Engine Evaluation
- **Priority:** Critical
- **Status:** Complete — Empirical Benchmark Validated
- **Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PIR-PIXELBRAIN-SCDLV2-GAME-ENGINE-2026-09-07`

---

## 2. Executive Summary

This report documents the findings, empirical benchmarks, and architectural evaluation of our stress test: **evaluating PixelBrain, SCDL V2, and SCD128 acting as a procedural visual engine for an isometric living game world (Phaser 4)**.

### Core Deliverables Achieved:
1. **Zero Premade / External Assets**: All visible terrain tiles, botanical trees, water caustics, lilypads, lotus blooms, environmental props, and the player character were synthesized **from scratch** programmatically.
2. **SCD128 Dual-Witness Asset Architecture**: Established strict `FORM64` (geometry/silhouette) and `REALIZATION64` (discrete palette/material) contracts across 4 new asset classes (`GrassTile`, `BotanicalTree`, `PixelLotus`, `ForestProp`), maintaining 100% bank isolation and 128-hex wire digest compliance.
3. **Original SCDL V2 Player Character**: Authored and compiled `lotus_wanderer` completely in valid SCDL V2 syntax, respecting the 4-head RPG pixel canon and generating multi-frame idle and walking cycles without manual sprite templates.
4. **Living World in Phaser 4**: Assembled a 24x24 structured tutorial forest featuring an opening sunlit glade, winding cobblestone path, sunken sacred lotus pond with animated caustics, dense canopy framing, wind-swayed tree oscillations, drifting spore particles, and deterministic BFS pathfinding.
5. **100% Test Battery Pass Rate**: All 15 tests in `tests/game/tutorial-forest/` and all 26 existing tests in `tests/codex/core/pixelbrain/scholomium-ink/` passed green with zero regressions and zero ESLint errors.
6. **Interactive Testbed UI**: Delivered `TutorialForestSandbox.jsx` mounted at `/internal/pixel-lotus/tutorial-forest`, providing real-time lighting mode controls (Day, Twilight, Night), wind/spore toggles, re-seeding, and a live SCD128 wire & slot inspector drawer.

---

## 3. Deep Engineering Assessment: System Strengths and Limitations

### 3.1 What PixelBrain Handled Well
- **Discrete 1x Cell Quantization**: PixelBrain's fundamental model of discrete integer coordinates `[{ x, y, color, alpha }]` is ideal for classic pixel art. It completely avoids the blurry sub-pixel vector smoothing that plagued earlier tests.
- **Fast Dynamic Upload to CanvasTexture**: Uploading synthesized cell arrays into Phaser 4 `CanvasTexture` took $< 15\text{ms}$ total across all 18 textures. WebGL texture binding and batch rendering were exceptionally fast.
- **Color Palettization**: The stepped, hue-shifted 8-tone botanical ramps and Bayer dithering generated clean volumetric forms without banding or color bleeding.

### 3.2 What SCDL V2 Handled Well
- **Strict Grammar & Expressive Geometric Composition**: The SCDL V2 parser and compiler (`compileSCDLV2`) cleanly handled complex composite shapes (`CIRCLE`, `RECT`, `ELLIPSE`, `TRIANGLE`, `PIXEL`) organized across semantic layers (`shadow`, `legs`, `tunic`, `mantle`, `head`, `staff`).
- **Deterministic Pure IR Output**: Compilation was 100% deterministic; the character model compiled to 585 cells with verified budgets and zero diagnostics errors.
- **Zero-Throw Compiler Resilience**: When a syntax variation occurred during early authoring (e.g. `RECT FROM ... TO ...` instead of `RECT ORIGIN ... SIZE ...`), the compiler never crashed; it emitted precise, actionable diagnostic errors (`SCDL-PARSE-004`, `SCDL-PARSE-006`) with exact span locations and expected tokens.

### 3.3 What SCD128 Contributed
- **Clean Separation of Structure from Skin**: By separating `FORM64` (bounding bounds, elevation, tile socket boundaries) from `REALIZATION64` (palette logic, Bayer dithering, weathering), we were able to generate multiple distinct biomes (`verdant_glade`, `mossy_grove`, `path_verge`) without altering a single line of geometric logic.
- **Explainable Asset Provenance**: Every entity on the map carries an immutable 128-hex digest. Clicking any tile or tree in the testbed displays the exact 8 blocks of geometry and 8 blocks of art, enabling forensic inspection of procedural world content.

### 3.4 Where the Pipeline Was Difficult & Required Workarounds
1. **SCDL V2 RECT Grammar vs Human Expectation**:
   - *Issue*: Authors naturally write `RECT FROM (VEC2 p1) TO (VEC2 p2)`. SCDL V2 opcode `0x0205` strictly requires `ORIGIN (VEC2)` and `SIZE (VEC2)`.
   - *Workaround*: Converted all coordinates from bounding points to origin + extent.
   - *Architectural Recommendation*: Add syntactic sugar to the SCDL V2 parser allowing `RECT FROM ... TO ...` which desugars to `ORIGIN ... SIZE ...` during CST-to-AST lowering.
2. **Animation Expressiveness in SCDL V2**:
   - *Issue*: SCDL V2 does not yet have a native skeletal/FK rigging instruction set in the language itself for multi-joint character animations.
   - *Workaround*: The base character was compiled through SCDL V2, and procedural frame deformation passes were applied to the canonical cell coordinates to synthesize idle breathing and stride walk cycles.
   - *Architectural Recommendation*: Implement an `ANIMATE` / `DEFORM` block or first-class armature joint syntax in SCDL V2.3.

---

## 4. Visual Cohesion & The Anti-Vector Invariant

The test validated Rule 7 ("Pixel Art Sovereignty vs. Vector/SVG Pollution"):
- **Zero Sub-Pixel Anti-Aliasing**: All outlines and silhouettes are discrete 1px steps.
- **Nearest-Neighbour Integer Scaling**: When scaled for previews or zoomed in Phaser, pixels remain sharp squares.
- **Consistent Top-Left Lighting Vector**: $[-0.65, -0.75]$ was uniformly applied across grass diamond planes, spherical tree canopy lobes, cobblestone bevels, and character robes, creating a unified sense of afternoon forest sunlight.

---

## 5. Promotion and Next Steps

We recommend:
1. Formalizing the `SCD128GrassGenerator`, `SCD128TreeGenerator`, and `SCD128LotusGenerator` as canonical modules in `codex/core/pixelbrain/`.
2. Integrating the `TutorialForestScene` as the interactive tutorial environment for Scholomance's exploration and combat systems.
3. Extending SCDL V2 with directional sprite-sheet export (`N, NE, E, SE, S, SW, W, NW`) for full 8-directional isometric character traversal.
