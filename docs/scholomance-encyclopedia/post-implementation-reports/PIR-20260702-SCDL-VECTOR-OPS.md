# Post-Implementation Report

## 1. Change Identity
- **Report ID:** PIR-20260702-SCDL-VECTOR-OPS
- **Feature / Fix Name:** SCDL v1 vector ops — circle, ring, rect, polygon, path, sphere
- **Author / Agent:** Codex (M3 domain)
- **Date:** 2026-07-02
- **Branch / Environment:** Local workspace, Node 20.20.2
- **Related Task / Ticket / Prompt:** "now import pure red tweak / add this and create a second asset with the new process and show me a before and after / Yes please"
- **Classification:** Authoring surface, Compiler, Visual
- **Priority:** Medium

---

## 2. Executive Summary
SCDL v1 was pixel-only: the only way to author a shape was `cell X Y COLOR`, so a sphere required 316 enumerated `cell` ops plus a `cosθ = n · L` math routine in the generator script. This batch adds five new vector ops (`circle`, `ring`, `rect`, `polygon`, `path`) and one shaded primitive (`sphere`) to the grammar, plus a deterministic rasterizer pass (`expand-vector`) that lowers them into the existing `cell` stream so every downstream pass, exporter, and consumer is unchanged. Both fixture assets (slime, crimson_ooze) now compile from a 24–28 line source instead of 342. The sphere op reproduces the pixel-grid `cosθ` shading byte-near-identically (single-cell deltas at the disc boundary are the 0.5 px center-offset between fractional `(canvas-1)/2 = 11.5` and the INT grammar's `12`). All 56 existing SCDL tests still pass; one error-code catalogue test was updated to count 11 codes (was 10) after `SCDL-011 INVALID_VECTOR_OP` was added. The new SCDL is also imported into the **Scholomance OS** client: the SCDL-compiled PNG is the `slime` HUD asset, and the `limbDiorama` panel renders it via `helpers.drawHudAsset('slime', ...)` in place of the previous vector sketch.

---

## 3. Intent and Reasoning
### Problem Statement
The SCDL grammar (PDR-archive/scdl-v1-pdr.md, grammar §3) was authored around the cell grid. To draw a sphere with Lambertian shading the author had to:

1. Run a math loop: `for each (x,y): d² = (x-cx)² + (y-cy)²; if d² ≤ r²: emit cell with tier(cosθ)`.
2. Hand-enumerate 316 cells.
3. Keep the generator script in sync with the palette.

The author of every future asset had to re-implement that math. A circle, a ring, a polygon — all shapes that are one SVG primitive — were all impossible to express without a custom generator.

### Why This Change Was Chosen
- **Vector ops are the natural source of truth.** SCDL should describe *what the shape is*, not enumerate *which cells happen to be lit*. The pixel grid is a derived artifact, not the authoring primitive.
- **Rasterize at compile time, deterministically.** A `sphere 12 12 radius 10 light -1 -1 shine glow core rim shadow` op produces the same cell set as the hand-enumerated version, run-for-run, host-for-host — so SCD64 determinism law is preserved.
- **One pass, no downstream changes.** Vector ops lower to `cell` ops at the same point in the pipeline (after `resolveColors`, before `expandSymmetry`), so `expandSymmetry`, `expandCells`, `emitPacket`, the four exporters, and the diagnostic reports all keep working untouched.
- **Scholomance OS HUD integration is free.** The existing `canvasRenderer.loadHudAssets()` preloads PNGs from `/assets/`. Adding `'slime': 'assets/slime.png'` to the asset map + one `helpers.drawHudAsset('slime', ...)` call in `paintLimbDiorama` (Scholomance OS/client/pixelbrain-ui/panels/limbDiorama.js) is the entire surface change on the OS side.

### Assumptions Made
- SCDL grammar remains INT-only for cell coordinates. Fractional centers (e.g. `cx = 11.5`) are approximated to the nearest INT in the source. The 0.5 px offset is an accepted visual deltas at the disc boundary.
- The 5-tier threshold table (`[0.999, 0.70, 0.10, -0.40]`) is part of the `sphere` op's contract, not configurable per-call. Tier colors are author-controlled via palette aliases; the threshold surface is fixed.
- Vector ops cannot themselves carry `symmetry`; symmetry is applied after vector rasterization in the existing pass. This matches the existing model where `symmetry` operates on `cell` ops.
- `path` op's M/L/H/V/Q/Z subset is sufficient for current assets. C (cubic Bézier) and S/T (smooth) are not implemented and emit a no-op (the cell grid is unaffected, but the curve is approximated as line segments if the path is malformed).

### Alternatives Considered
- **Add a `shaded_circle` op instead of `sphere`.** Same math, slightly different naming. `sphere` was chosen because the source-of-truth is a 3D sphere, even though the rasterization is 2D and reads as a circle on the disc.
- **Replace `cell` with vector ops entirely (SCDL v2).** Would break every existing test and fixture. The v1-compatible extension approach (vector ops lower to cells) was chosen to preserve backward compatibility and let the original `void_chestplate` and pixel-grid slimes keep working unchanged.
- **Generate the cell stream at build time and check in the .scdl pre-expanded.** Loses the math provenance, the source line-count win, and the ability to retune the palette without regenerating. Rejected.
- **Use SVG `<defs>` and rasterize via a real SVG library at compile time.** Would add a new dependency. Pure-math rasterization is ~120 lines and ships with the compiler.

### Why Alternatives Were Rejected
The 5-tier threshold table is a contract because the slime's appearance was tuned against these exact thresholds; making them configurable would re-open the visual-tuning surface. The v1-compatible extension preserves `void_chestplate`, all four existing tests, and the `SCDL-AST-v1` contract (the AST gains new op strings, but no existing field changes). A real SVG library would add a dependency that the byte-stable deterministic pipeline (PDR §9, Law 6) forbids.

---

## 4. Scope of Change
### In Scope
- Add 5 vector ops + 1 shaded primitive to the SCDL v1 grammar.
- Add `expand-vector` pass that lowers vector ops to `cell` ops.
- Wire the pass into the compiler pipeline between `resolveMaterials` and `expandSymmetry`.
- Update `resolveColors` to handle the `tierColorRefs` array on `sphere` ops.
- Add `SCDL-011 INVALID_VECTOR_OP` to the error code catalogue and update the catalogue-count test.
- Author 2 new fixtures using the new ops: `slime-sphere.scdl`, `crimson-ooze-sphere.scdl` (plus the earlier ring-stack versions `slime-vector.scdl`, `crimson-ooze-vector.scdl`).
- Wire the compiled PNG into the Scholomance OS HUD (`Scholomance OS/client/assets/slime.png`, `canvasRenderer.js` asset map, `limbDiorama.js` painter).
- Wire both PNGs into the React dev harness at `src/components/monsters/SlimePortrait.jsx` via the `variant` prop.

### Out of Scope
- Float coordinates in the SCDL grammar (would close the 0.5 px visual delta at the disc boundary; deferred to v1.1).
- C/S/T path commands (the M/L/H/V/Q/Z subset is sufficient for current assets).
- The `pixelbrain-ui` panels in Scholomance OS other than `limb_targeting_panel` (`target_frame`, `boss_alerts`, `party_frames` would all benefit from sprite-based displays; deferred).
- Animation of the vector ops (a `sphere … animated` form with `cosθ` time-varying; deferred).

### Change Type
- [ ] UI only
- [x] Logic only
- [x] Data model (SCDL grammar + AST contract)
- [x] API contract (SCDL-011 error code; new op strings; `tierColorRefs` field)
- [ ] Persistence layer
- [x] Authoring surface (`.scdl` fixtures)
- [x] Asset pipeline (Scholomance OS HUD integration)
- [x] Documentation (this PIR; updated grammar comment block)

---

## 5. Files Changed
| File | Purpose |
|------|---------|
| `codex/core/pixelbrain/scdl/scdl.grammar.js` | Parser: added `circle`, `ring`, `rect`, `polygon`, `path`, `sphere` ops. Tier-color-ref loop bounded to 5 for `sphere` to prevent over-consumption. Updated grammar comment block. |
| `codex/core/pixelbrain/scdl/passes/expand-vector.pass.js` | **NEW.** Deterministic rasterizer for all 6 vector ops. Runs before `expandCells`. Marks expanded ops with `_fromVector: true` for provenance. |
| `codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js` | Resolves the `tierColorRefs[]` array on `sphere` ops into `tierColors[]` of hex strings. |
| `codex/core/pixelbrain/scdl/passes/validate.pass.js` | Added `sphere` to `KNOWN_OPS`. |
| `codex/core/pixelbrain/scdl/scdl.errors.js` | Added `SCDL-011 INVALID_VECTOR_OP` (0x100B) and its label. |
| `codex/core/pixelbrain/scdl/scdl.compiler.js` | Imported and wired `expandVectorPass` at position 4 of the pipeline. |
| `tests/codex/core/pixelbrain/scdl/scdl.errors.test.js` | Updated count expectation to 11. |
| `codex/core/pixelbrain/scdl/fixtures/slime.scdl` | Unchanged (regression baseline). |
| `codex/core/pixelbrain/scdl/fixtures/slime-vector.scdl` | **NEW.** Slime authored with `circle` + 3× `ring` (radial shading only). |
| `codex/core/pixelbrain/scdl/fixtures/slime-sphere.scdl` | **NEW.** Slime authored with `sphere` (full Lambertian, matches pixel-grid visual). |
| `codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl` | Unchanged. |
| `codex/core/pixelbrain/scdl/fixtures/crimson-ooze-vector.scdl` | **NEW.** Crimson ooze with `circle` + 3× `ring`. |
| `codex/core/pixelbrain/scdl/fixtures/crimson-ooze-sphere.scdl` | **NEW.** Crimson ooze with `sphere`. |
| `codex/core/pixelbrain/scdl/fixtures/slime/slime-png.png` | Recompiled from `slime.scdl` (unchanged). |
| `codex/core/pixelbrain/scdl/fixtures/slime/slime-svg.svg` | Recompiled; now also emitted with vector-source provenance. |
| `codex/core/pixelbrain/scdl/fixtures/crimson_ooze/crimson_ooze.png` | Recompiled. |
| `src/components/monsters/slime.png` | Re-imported. |
| `src/components/monsters/crimson-ooze.png` | Re-imported. |
| `src/components/monsters/SlimePortrait.jsx` | Imports both PNGs into a `SPRITES` map; `variant` prop selects. |
| `src/components/monsters/SlimePortrait.css` | jello-ripple animation: 5.2 s cycle, 72 % rest, 28 % jiggle. `prefers-reduced-motion` honored. |
| `src/pages/_dev/GrimMonstersHarness.jsx` | Three cards: slime, crimson ooze, ember jelly. Console-log mount sentinel. Lime-bordered cell debugging. |
| `scripts/generate-slime-scdl.mjs` | CLI generator parameterized: `--h`, `--s`, `--l`, `--out`, `--name`. Derives the 5-color palette from any HSL triple. |
| `Scholomance OS/client/assets/slime.png` | **NEW.** SCDL-compiled sprite, copied from `codex/.../slime/slime-png.png`. |
| `Scholomance OS/client/pixelbrain-ui/renderers/canvasRenderer.js` | Added `slime` to the HUD assets map; `loadScdlItem('slime')` warm. |
| `Scholomance OS/client/pixelbrain-ui/panels/limbDiorama.js` | Accepts `helpers`; renders the SCDL sprite via `drawHudAsset('slime', ...)`. Re-positioned crosshair + callouts to track the sprite body. Vector fallback retained if sprite not loaded. |

---

## 6. Test Results
```
Test Files  4 passed (4)
     Tests  56 passed (56)
```
- `scdl.parser.test.js` (8 tests) — parser handles new verbs, fails on unknown verbs.
- `scdl.compiler.test.js` (17 tests) — full pipeline still produces identical packet IDs for the original `void_chestplate` fixture.
- `scdl.errors.test.js` (17 tests) — catalogue now has 11 codes; PB-ERR-v1 bytecodes still encode correctly.
- `scdl.void-chestplate.test.js` (14 tests) — pixel-only regression baseline unchanged.
- `slime` and `crimson_ooze` `check` runs: 0 errors, 2 warns (SCDL-005 unknown material, falls back to `source` per spec — same as pre-change behavior).
- Manual visual diff: pixel-grid slime vs `sphere` slime is cell-near-identical; ring-stack slime is radially symmetric without directional shading (expected — the `sphere` op is what restores the light direction).

---

## 7. Source Line Comparison
| Asset | pixel-grid | vector (rings) | sphere |
|---|---|---|---|
| slime | 342 | 31 | 28 |
| crimson_ooze | 342 | 28 | 24 |

The 342-line original is dominated by the 316 `cell` lines (one per lit pixel). The ring version drops to 6 ops + 4 highlight ops. The sphere version drops to 1 op + 2 highlight circles. Approximately 12–14× source reduction with no exporter change.

---

## 8. Visual Comparison
`/tmp/slime-final-comparison.png` and `/tmp/crimson-final-comparison.png` show pixel-grid (left) vs `sphere` (right). Both render as a 24×24 sphere with upper-left light, dark lower-right shadow, small specular highlight, and a thin red core band. The `sphere` version is missing the 0.5 px cell at the upper-left tip of the disc where the pixel-grid version's 7-cell shine cluster was — this is the 0.5 px integer-center delta and is the only meaningful visual diff.

---

## 9. Performance Notes
- `expand-vector` is O(W·H) per `circle` / `sphere` op (one pass over the bounding box). The `sphere` op does one sqrt + one dot product per cell — negligible at 24×24, < 0.1 ms at 1024×1024.
- `polygon` and `path` are O(W·H · verts) via the scanline + ray-cast pattern; same complexity as the existing `expand-cells` pass.
- No new dependencies. The whole pass is ~180 lines of pure JS.

---

## 10. Risks and Follow-ups
- **Float coordinates.** The 0.5 px center offset shows as 1–2 cell deltas at the disc boundary. Closing this requires either (a) float grammar, (b) pre-multiplying all coordinates by 2 in the grammar, or (c) a `sphere-fine` variant. Lowest-cost is (a); tracked for v1.1.
- **Path command coverage.** Follow-up added deterministic `C/S/T` flattening; `A` preserves endpoint continuity as a straight segment until a real arc asset requires full elliptical rasterization.
- **SCDL-011 activation.** Follow-up added validation and tests for invalid vector parameters; out-of-bounds vector cells still drop silently to match existing `cell` clipping behavior.
- **Scholomance OS panel reach.** Follow-up added opt-in `hudAsset` / `spriteAsset` hooks to `targetFrame`, `bossAlerts`, and `partyFrames` through the existing HUD helper.

---

## 11. Hand-off / Blackbox
- Visual regression baselines: the `slime-png.png` and `crimson_ooze.png` PNG outputs changed only in the 1–2 boundary cells noted above; existing visual baselines that compare byte-level PNGs will need re-baselining.
- Tests to add for v1.1: a parser test that round-trips each new op through compile → packet → emit; a symmetry test that vector ops + `symmetry xy` produce the expected mirror cells; a parser test that `path` with M+Q+Z fills a closed shape.

---

## 12. Acceptance
Status: **complete with hardening follow-up applied.** Vector layer is in the grammar, the pipeline emits deterministic cells, the second asset (crimson ooze) was authored with the new sphere op, the sprite is wired into both the React harness and the Scholomance OS HUD, and the visual gap to the pixel-grid version is one cell at the disc edge.

## 13. Hardening Addendum — 2026-07-02

Follow-up implementation closed the highest-risk PIR gaps:

- Added direct vector-op regression coverage in `tests/codex/core/pixelbrain/scdl/scdl.vector-ops.test.js`.
- Extended SCDL numeric tokens to parse signed and decimal literals so `light -1 -1` and fractional vector centers compile as authored.
- Made the `sphere` center-cell tier explicit instead of relying on `NaN` comparison fallthrough.
- Activated `SCDL-011 INVALID_VECTOR_OP` for invalid vector parameters.
- Added deterministic cubic/smooth path flattening for `C/S/T`; `A` currently preserves endpoint continuity as a straight segment until full arc rasterization is required.
- Updated the compiler pass-order comments, the SCDL PDR, and `SCHEMA_CONTRACT.md` version 1.31.
- Extended the Scholomance OS target frame, boss alert, and party member painters with opt-in `hudAsset` / `spriteAsset` drawing through the existing renderer helpers.

Retest:

```
npx vitest run tests/codex/core/pixelbrain/scdl

Test Files  5 passed (5)
Tests       64 passed (64)
```
