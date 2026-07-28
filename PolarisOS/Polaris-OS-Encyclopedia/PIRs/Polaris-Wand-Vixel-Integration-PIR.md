# PIR: Wand → Vixel Integration

**Date:** 2025-07-14
**Status:** COMPLETE
**Bytecode:** POLARIS-WAND-VIXEL-INTEGRATION-v1

## Executive Summary

Integrated the Wand/DivWand creative instrument into the Vixel pipeline, completing the full art chain:

```
Wand formulas (edge_trace, parametric_curve, mathematical_stroke)
  → evaluateFormula() → vectorPaths [{role, points}]
  → fuseToVixelField(pixelGrid, vectorPaths) → VixelField (QBIT Lattice)
  → evaluateVixelFeel(field) → VixelFeelReport (Photonic Feel)
```

The Wand is now the **primary creative instrument** for shrine-demo art. SCDL provides materials and pixel craft. The Vixel lattice fuses them into concurrent dual-medium cells. The Feel system evaluates the fused composition.

## What Was Built

### 1. Wand Formula Definitions (`worldpacks/shrine-demo/wand/`)

Three assets have Wand definitions:

| Asset | Formulas | Types | Points |
|---|---|---|---|
| `brazier.wand.json` | 5 | edge_trace ×4, parametric_curve ×1 | 48 |
| `lantern.wand.json` | 5 | edge_trace ×3, parametric_curve ×1, mathematical_stroke ×1 | 133 |
| `player-marker.wand.json` | 3 | edge_trace ×2, parametric_curve ×1 | 27 |

Each formula traces the **contour** of an SCDL part. The Wand draws the form; SCDL fills the material. Roles match SCDL part names (e.g., `brazier.rim`, `lantern.flame`).

### 2. Pipeline Script (`scripts/wand-vixel-pipeline.mjs`)

Full 5-step pipeline:
1. Load SCDL compiled packet → pixelGrid (coordinates + materials)
2. Load Wand definition → formula list
3. Evaluate formulas via `evaluateFormula()` → vectorPaths
4. Fuse via `fuseToVixelField()` → VixelField
5. Evaluate via `evaluateVixelFeel()` → VixelFeelReport

Supports `--all` for batch processing and includes determinism verification.

### 3. Bridge Registration (LING-0F03)

Added vixel-lattice functions to the photonic bridge registry in `src/lib/photonic-retina/index.js`:
- `fuseToVixelField`, `diffVixelFields` (from vixel-fusion.js)
- `evaluateLatticeVixelFeel`, `diffLatticeVixelFeel`, `vixelFieldToSpatialField` (from vixel-feel-adapter.js)

codex/core can now access the full Wand pipeline via `getPhotonicBridge()`.

### 4. Integration Tests (`tests/vixel-lattice/wand-integration.test.js`)

19 tests covering:
- Wand formula evaluation (edge_trace, parametric_curve, mathematical_stroke)
- Fusion with 100% vector match for all 3 assets
- Vector provenance assignment (rim cells → brazier.rim)
- Feel role assignment (boundary > interior salience)
- Determinism (identical hashes across runs)
- VixelField diff (identical fields → zero delta)
- Spatial field adapter (enriched emphasis carries vixel salience)

## Results

| Asset | Awareness | Match% | Coherence | Cells | Hash |
|---|---|---|---|---|---|
| brazier | 0.724 | 100% | 1.000 | 175 | eaf1afa8 |
| lantern | 0.754 | 100% | 0.700 | 190 | 5e86798f |
| player-marker | 0.783 | 100% | 0.667 | 54 | afcfd4d1 |

**All deterministic. All 100% vector match. All Feel scores > 0.7.**

## Architecture

```
Wand formulas (.wand.json)
  │  edge_trace: smooth contours per SCDL part
  │  parametric_curve: arcs, circles, glows
  │  mathematical_stroke: expressive strokes (flame, energy)
  ▼
evaluateFormula() [codex/core/pixelbrain/formula-to-coordinates.js]
  │  → [{x, y, z, emphasis, source}]
  ▼
vectorPaths [{role, points: [{x, y, pressure}]}]
  │
  ├──→ fuseToVixelField(pixelGrid, vectorPaths) [src/lib/vixel-lattice/vixel-fusion.js]
  │      │  For each pixel cell:
  │      │    1. Find nearest vector point (brute-force, assets <500 cells)
  │      │    2. Compute parametric T, surface normal, curvature
  │      │    3. Assign vector provenance
  │      │    4. Compute feel state (boundary, salience, role)
  │      ▼
  │    VixelField { vixels: [{x, y, pixel, vector, feel}], vixelHash }
  │
  └──→ evaluateVixelFeel(field) [src/lib/vixel-lattice/vixel-feel-adapter.js]
         │  1. Convert to SpatialField (enriched emphasis = vixel salience)
         │  2. Run Geometry + Construction + Silhouette AMPs
         │  3. Compute vixel diagnostics (coherence, role distribution, curvature)
         ▼
       VixelFeelReport { spatialAwareness, verdict, vixelDiagnostics, suggestions }
```

## What Changed vs. Before

| Before | After |
|---|---|
| SCDL coordinates had no vector provenance | Every pixel knows which Wand curve it sits on |
| No surface normals or curvature data | Each vixel carries normal, curvature, parametric T |
| Feel evaluated pixels only | Feel evaluates the FUSED composition (pixel + vector) |
| No texture-form coherence metric | Coherence score: do materials follow the curves? |
| No Wand integration | Wand is the primary creative instrument |

## Verification

- **19 new integration tests** — all pass
- **185 photonic-retina + vixel-lattice tests** — all pass
- **40 existing Wand tests** — all pass (zero regressions)
- **Determinism** — identical hashes across runs for all 3 assets
- **Pipeline script** — runs end-to-end for all assets with structured output

## Files Created/Modified

| File | Action |
|---|---|
| `PolarisOS/worldpacks/shrine-demo/wand/brazier.wand.json` | Created |
| `PolarisOS/worldpacks/shrine-demo/wand/lantern.wand.json` | Created |
| `PolarisOS/worldpacks/shrine-demo/wand/player-marker.wand.json` | Created |
| `scripts/wand-vixel-pipeline.mjs` | Created |
| `tests/vixel-lattice/wand-integration.test.js` | Created |
| `src/lib/photonic-retina/index.js` | Modified (bridge registration) |

## Deferred

1. **Wand definitions for backgrounds** — forest, shrine, clearing backgrounds need Wand formulas (larger canvases, more complex contours)
2. **Wand → SCDL round-trip** — using Wand output to *generate* SCDL source (currently SCDL is authored separately)
3. **Spatial hash optimization** — brute-force nearest-neighbor is fine for <500 cells but needs a grid-bucket hash for backgrounds (1000+ cells)
4. **Animation frames** — Wand formulas with time parameter for animated assets (flame flicker, glow pulse)
5. **DivWand integration** — the DivWand (divination wand) for procedural variation within deterministic bounds
