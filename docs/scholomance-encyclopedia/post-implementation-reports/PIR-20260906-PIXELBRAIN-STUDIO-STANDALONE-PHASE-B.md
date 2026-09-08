# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260906-PIXELBRAIN-STUDIO-STANDALONE-PHASE-B
- **Feature / Fix Name:** PixelBrain Studio Standalone Phase B
- **Author / Agent:** Codex
- **Date:** 2026-09-06
- **Related PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-06-pixelbrain-studio-standalone-phase-b-pdr.md`
- **Classification:** Architectural | Behavioral | PixelBrain | Standalone authoring | UI + Rendering
- **Priority:** Critical
- **Status:** Implementation complete; scoped Phase B gates green.

## 2. Executive Summary

`Pixel-Art-Studio-Skeleton` now opens as a nine-tab PixelBrain Studio whose default route is `/studio/canvas`. Canvas is a professional three-pane editor (tool rail, integer-zoom pixel stage, layers + indexed palette) and the sole authority for the active document. Blueprint, Foundry, AMP Conveyor, Mutation Lab, Finish, Mentor, Library, and Diagnostics all read from or deliberately write a new revision of that document.

The Phase-A 14-function facade is unchanged. A second, browser-safe authoring facade owns editor/Aseprite, PNG, construction, forge-gate, finish, mentor, and local library operations. Production target files do not import root `src/`, root `codex/`, or Node filesystem APIs.

## 3. Delivered Requirements

| PDR | Delivered result | Primary evidence |
|---|---|---|
| B1 | Nine source tabs in source order; Canvas is the default for `/`, `/studio`, and invalid paths. | `tests/studio-tabs-phase-b.test.mjs`, Playwright URL assertions. |
| B2 | One revisioned document controller; AMP/mutation/forge/finish commits install named generated layers. | `studio-document.test.mjs`, `studio-amp-document.test.mjs`, Foundry Use in Canvas. |
| B3 | Paint, erase, fill, pan/zoom, undo/redo, layers, palette, grids, symmetry, native preview, status bar. | Differential editor tests + Playwright paint loop. |
| B4 | PNG and Aseprite round-trips; invalid/oversized files throw typed faults without mutating the document. | `tests/studio-io.test.mjs`. |
| B5 | Blueprint sketch notes, construction guides, live Forge Gate PASS/FAIL, handoff to Canvas. | `studio-forge-finish-library.test.mjs`, Playwright Blueprint FAIL verdict. |
| B6 | Foundry retains grass generation and adds intake, duplicate inspection, Use in Canvas, New Canvas from field. | Playwright Foundry + Use in Canvas. |
| B7 | Deterministic style transmutation and shader finish; WebGL absence is a readable fault. | Finish determinism tests + Playwright WebGL status. |
| B8 | Mentor critique from active-document metrics; `externalService: false`. | Mentor unit test + Playwright copy. |
| B9 | Keep locally, discard, download PNG, export Aseprite, export recipe are distinct; v1 grass records are normalized without rewrite. | Library unit test. |
| B10 | Diagnostics shows revision, checksum, coverage, receipts, faults, terminal events, last gate. | Playwright Diagnostics 54/54. |
| B11 | Isolation scan of production `src/` found no root or `node:fs` imports. Phase-A facade still exports exactly 14 names. | `tests/studio-isolation.test.mjs`. |
| B12 | Desktop three-pane editor; mobile tool strip + dock drawer; no page-level horizontal overflow. | Playwright desktop + Pixel 7. |

## 4. Caps and Limits Named in Tests

| Cap | Value |
|---|---|
| Command / undo history | 50 (`COMMAND_HISTORY_LIMIT`) |
| Terminal / event history | 40 (`EVENT_HISTORY_LIMIT`) |
| Receipt / fault ledger | 20 (Phase A, unchanged) |
| Indexed palette | 32 |
| Default working size | 160×144, `cellSize` 1, rectangular |
| Hard dimension | 1024 |
| Aseprite import | 512×512, 256 frames, 64 layers, 262144 cells |

## 5. Architecture

```text
PixelBrainStudio
  └── createDocumentController()     mutable grid + command stack + frozen snapshots
        ▲
        └── studio-authoring-facade.js   UI import path for authoring engines
              ├── template-grid-engine.js / editor-command-stack.js
              ├── aseprite-binary-codec.js + studio-png.js (fflate)
              ├── construction-guides.js
              ├── microprocessor-route.core.js (validateRoute only)
              ├── pixel-art-shaders.js
              └── local library v2 + v1 loader
```

Phase-A `studio-facade.js` remains the frozen AMP/grass/mutation surface.

## 6. Commands and Outcomes

```text
cd Pixel-Art-Studio-Skeleton

node --test tests/*.test.mjs
# tests 37, pass 37, fail 0

npm test
# scripts + auth + unit tests, exit 0

npm run typecheck
# tsc --noEmit, exit 0

npm run build
# client + ssr + nitro, exit 0

npx playwright test tests/visual/studio-tabs.spec.mjs
# 6 passed (desktop + mobile)

STUDIO_PREVIEW=1 npx playwright test tests/visual/studio-tabs.spec.mjs
# 6 passed against production preview :8091
```

`git diff --check` on the Phase B paths produced no whitespace errors.

## 7. Browser Evidence

Assets live in `docs/scholomance-encyclopedia/post-implementation-reports/assets/pixelbrain-studio-standalone-phase-b/`.

- `canvas-desktop.png` — default Canvas route, nine-tab rail, three-pane editor, integer zoom, painted Structure cells, 32px + native previews, 32-color palette dock.
- `canvas-mobile.png` — narrow layout with horizontal tool strip and no page overflow.
- `foundry-desktop.png` — grass foundry plus Use in Canvas.
- `amps-desktop.png` / `mutations-desktop.png` / `diagnostics-desktop.png` — Phase A flows still execute against the shared document checksum.

## 8. Known Limits

- Forge Gate is a bounded browser-safe evaluator (cell count, compactness, palette ceiling, optional `validateRoute`). It does **not** copy the 142-module item-foundry or run Node observed sampling. Observed sampling fails as `PB-STUDIO-FORGE-CAPABILITY`.
- Finish transmutation maps luminance onto school/era ramps. It is deterministic and keyed by content + checksum + style + `pb-studio-finish-v1`. It is not the root worker's neural transmuter.
- WebGL is a preview-availability probe. Exported finish pixels are CPU-side.
- Copied `editor-command-stack.js` still stamps `Date.now()` on command provenance metadata (source-marked EXEMPT). Finish/library identity does not use wall-clock keys.
- The root application's `/pixelbrain/studio` route was not modified.

## 9. Falsifiers Checked

- Nine tabs, Canvas default: pass.
- Canvas is a live editor, not a mock: pass (paint + status cell count).
- Palette ceiling and Aseprite/PNG round-trips: pass in unit tests.
- Rejected mutation leaves the document checksum unchanged: pass.
- Isolation scan: pass.
- Observed sampling not fabricated: pass.
- Keep locally is explicit: pass.

## 10. Unrelated Baseline

No unrelated repository baseline failure was used to erase a Phase B failure. Root PixelBrain unification work on the current branch is out of this PDR's scope and was not required to be green for Phase B cutover.
