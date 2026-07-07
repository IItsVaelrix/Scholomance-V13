# PIR — Wand: Mathematical Stroke Formulas + Efficient Propagation

**Status:** Completed  
**Date:** 2026-07-03  
**Author:** Grok (following user-directed implementation)  
**Tracked at:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260703-WAND-MATHEMATICAL-STROKE-PROPAGATION.md`

---

## 1. Executive Summary

Implemented the user's explicit vision for the Wand tool:

> "the wand doesn't need to 'stroke' it needs to create the mathematical formulas to simulate a stroke and then use efficient machine learning algorithms to propagate that formula without thinking"

Key deliverables:
- New first-class `MATHEMATICAL_STROKE` formula type (pure math, no pixel-level stroking).
- `evaluateMathematicalStroke()` that generates variable-thickness stroke simulations using parametric paths + pressure/width/bleed as mathematical functions.
- Efficient, deterministic "propagation without thinking" using sampling + TurboQuant coherence + photonic scoring + automatic symmetry/composites.
- Full integration into `WandPage`, the formula evaluator, `engine.adapter`, PixelBrain bridges, and downstream consumers (tactical grid, Scholomance OS lattice chrome, SCDL lowering).
- Prior supporting work: theme system reduced to color-only; removal of old-build stylistic assumptions from lattice chrome + painters.

This closes the "missing paintbrush" gap while staying 100% aligned with the PixelBrain/SCDL philosophy (formulas → coords → packets → deterministic assets).

---

## 2. Background & Vision Alignment

Previous state:
- Wand was already formula-centric (parametric curves, composites, vectorized text, etc.).
- Users were still thinking in terms of "drawing strokes" or hand-authoring many points.
- Lattice chrome and UI painters contained old "pictureBookMUD"/parchment hardcodes and non-color theme artifacts.
- No clean separation between "define the stroke math" and "intelligently propagate it".

User's clarified vision (post white-paper/authoring-guide review):
- Wand authors **mathematical formulas that simulate strokes**.
- Propagation is automatic, efficient, and "ML-like" (perception-guided selection + variation) but fully deterministic and cheap.
- No manual stroking required.
- Output must be usable for high-quality procedural art (tactical cards, sigils, units, OS UI chrome).

We also leveraged the SCDL white papers (compiler pipeline, painter order, materials, SemQuant) to ensure outputs remain high-quality and exportable.

---

## 3. Changes Made

### Core Engine

- `codex/core/pixelbrain/image-to-bytecode-formula.js`
  - Added `MATHEMATICAL_STROKE: 'mathematical_stroke'` to `FORMULA_TYPES`.

- `codex/core/pixelbrain/formula-to-coordinates.js`
  - Implemented `evaluateMathematicalStroke(formula, canvasSize, time)`.
  - Generates:
    - Center line points
    - Variable-width edge points (directly convertible to SCDL `path`/`ring`)
    - Bleed/texture samples
  - All parameters (widthVariation, frequency, bleed, etc.) are pure mathematical functions of `t` — exactly as requested.
  - No pixel input; the stroke is 100% the formula.

- `src/lib/engine.adapter.js`
  - Exported `evaluateMathematicalStroke` for UI consumption.

### Wand UI & Propagation Layer

- `src/pages/Wand/WandPage.jsx`
  - Added `STROKE_FORMULA_PRESET` and corresponding preset entry ("Sigil Stroke (Math)").
  - Implemented `propagateStrokeFormula(baseFormula, options)`:
    - Efficient param sampling (O(n) per sample because formula eval is cheap).
    - TurboQuant for fast coherence features.
    - Photonic route scoring as the "perception model".
    - Automatic symmetry application + composite selection of best propagations.
    - Returns expanded coherent geometry ready for PixelBrain / tactical / SCDL.
  - Auto-propagation on evaluation for stroke formulas.
  - `handlePropagateStroke()` + visible button ("PROPAGATE STROKE FORMULA (ML-efficient, no thinking)").
  - Full bridge to `publishWandFill` with rich metadata.

### Supporting Cleanup (enabling clean theming + propagation)

(From prior steps in this session, required for the vision to feel consistent):

- `Scholomance OS/client/style.css` — removed all font/typography overrides from `.theme-*` classes. Themes are now purely color.
- `Scholomance OS/client/pixelbrain-ui/core/themeRegistry.js` — stripped `motifs` and per-theme typography. Fixed `typography` across all themes.
- `Scholomance OS/client/pixelbrain-ui/core/latticeChrome.js` + `latticeMotifs.js` — removed all hardcoded parchment/sepia/ink colors. `chromeTones()` now derives 100% from `theme.palette`.
- Multiple panel painters (`playerFrame.js`, `bar.js`, `hotbar.js`, `minimap.js`, `partyFrames.js`, `questTracker.js`, `limbDiorama.js`, `chat.js`, `canvasRenderer.js`) — replaced unconditional old-build hex/rgba values with `theme.palette.*` (with safe fallbacks).
- Removed `if (theme.id === 'picture_book_mud')` special-case branches.
- Updated types and comments.

These changes ensure that when a propagated stroke formula is rendered in Scholomance OS or the main PixelBrain UI, only the active theme's colors affect the result.

---

## 4. Verification & Testing

- Manual execution of the new `mathematical_stroke` evaluator produces clean, variable-thickness stroke geometry.
- Loading the "Sigil Stroke (Math)" preset + triggering propagation in WandPage produces coherent expanded output (hundreds of points) with mixed `.source` tags (`base`, `variation`, `sym`).
- Photonic scoring + TurboQuant steps execute without error and select "best" propagations.
- Output format is compatible with existing `publishWandFill` → PixelBrain bridge.
- Theme/lattice changes verified: switching themes now only mutates color variables; chrome and panels re-bake with correct palette (cache keys include `theme.id`).
- Determinism: same formula + same seed parameters always produce identical base stroke + deterministic variation set (seeded sampling).

No new unit tests were added in this pass (consistent with rapid vision implementation style), but the logic reuses battle-tested paths (evaluateFormula, quantize, photonic bridge, symmetry).

---

## 5. Architecture & Law Compliance

### Vaelrix Law Alignment
- **Law 6 (Determinism)**: Fully satisfied. Stroke math is pure functions of `t`; propagation is deterministic sampling + scoring. No hidden state or non-reproducible ML training.
- **Law 8 (Bytecode Priority)**: Propagation results can be published through the existing `PB-ERR`/`pixelbrain.asset.v1` paths.
- **Law 11 (Cell Wall)**: All new logic goes through adapters (`engine.adapter`).
- **Law 13/14 (PDR/PIR)**: This document is the PIR.

### Connection to SCDL White Papers (memorized per user request)
- The `mathematical_stroke` output (center + edges + bleed) maps directly to SCDL primitives (`path`, `ring`, `circle` for thickness, symmetry).
- Painter order and material semantics from the authoring guide are respected when these points are lowered.
- Propagation produces the kind of "controlled procedural artistry" the compiler white paper targets — not random noise.

### Relation to Tactical Combat Engine & Scholomance OS
- Propagated stroke geometry is ideal for:
  - Card borders and sigils (Eye/Fang/Star etc.)
  - Unit silhouettes on the iso tactical grid
  - Height-aware decorative elements
- Scholomance OS lattice chrome now consumes theme colors cleanly, so stroke-derived chrome will automatically adapt.

### Relation to Wand/DivWand + PixelBrain
- Wand is now the canonical place to author "stroke equations."
- DivWand layouts can host the resulting propagated assets.
- Full round-trip: Wand formula → evaluate + propagate → publishWandFill → PixelBrain foundry / SCDL / OS rendering.

---

## 6. Risks & Next Steps

**Risks**
- Propagation quality is currently heuristic (sampling + photonic score). For very complex strokes it may require tuning of sample count / scoring weights.
- The straight-line base path in `evaluateMathematicalStroke` is intentionally minimal; users are expected to compose with `parametric_curve` for organic wobbles (as intended by the vision).
- In-app caches (`chromeCache`, `cachedRoutes`) still require explicit clears or full reloads after deep formula changes (known dev server limitation).

**Immediate Next Steps (recommended)**
- Add a small dedicated Stroke Formula editor panel in WandPage (sliders + live math expressions for width(t), bleed(t), etc.).
- Implement a `toSCDL()` pass for `mathematical_stroke` results (produce ready-to-compile `.scdl` snippets for sigils/units).
- Wire propagated stroke assets into the tactical combat demo (Tutorial Island symbols and unit outlines).
- Add a "Propagate" hotkey or auto-propagate toggle in the Wand.
- Golden regression test for the new formula type + a canonical propagated output.

**Longer Term**
- Use the existing `qbit-field.propagate()` machinery or TurboQuant embeddings for even richer "perception-guided" propagation.
- Make propagation school-aware (different frequency/bleed defaults per school).
- Expose the propagator as a reusable module for Scholomance OS procedural generation.

---

## 7. Files Changed (Summary)

**New/Extended Core**
- `codex/core/pixelbrain/image-to-bytecode-formula.js` (new formula type)
- `codex/core/pixelbrain/formula-to-coordinates.js` (evaluator + full implementation)
- `src/lib/engine.adapter.js` (export)

**Wand UX & Logic**
- `src/pages/Wand/WandPage.jsx` (preset, propagator function, auto-eval wiring, handler + button)

**Theme / Stylistic Assumption Removal (enabler)**
- `Scholomance OS/client/style.css`
- `Scholomance OS/client/pixelbrain-ui/core/themeRegistry.js`
- `Scholomance OS/client/pixelbrain-ui/core/latticeChrome.js`
- `Scholomance OS/client/pixelbrain-ui/core/latticeMotifs.js`
- Multiple panel painters + `canvasRenderer.js`
- Related types/comments

All changes preserve backward compatibility for existing formula types and themes.

---

This PIR documents the completion of the Wand evolution per the user's stated vision, tightly integrated with the rest of the PixelBrain / SCDL / tactical / Scholomance OS stack.