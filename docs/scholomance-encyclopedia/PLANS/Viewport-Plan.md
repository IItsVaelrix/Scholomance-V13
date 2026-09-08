PixelBrain Canvas Professional Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a desktop-first, Aseprite-grade PixelBrain Canvas with a deterministic viewport/input kernel, gap-free gesture editing, professional workbench feedback, and sparse preview-backed assistance.

**Architecture:** Keep the existing Phase B document controller authoritative and introduce two zero-DOM pure modules: `canvas-interaction.js` for geometry/input math and `canvas-assist.js` for local audit/suggestion logic. Render into a viewport-sized Canvas 2D surface from immutable snapshots, storing transient pointer, stroke, source-raster, and RAF state in refs. Preserve the current Canvas as a classic rollback path while the professional composition uses existing authoring and Studio mutation facades.

**Tech Stack:** React 19, TypeScript TSX, Canvas 2D, Vite/TanStack Start, Node test runner, Playwright Chromium, existing PixelBrain Studio facades and CSS token system.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-06-pixelbrain-canvas-professional-polish-pdr.md`

## Global Constraints

- Desktop mouse and keyboard are authoritative; 390px remains operable without claiming touch parity.
- Unsaved artwork remains browser-memory-only; add no requests, telemetry, autosave, auth, or database access.
- Reuse the current document controller, 32-color policy, generated 54-capability manifest, mutation transaction, receipts, and diagnostics. Add no persistent schema and no second registry.
- Transformative AMPs always use the existing mutation proposal, explicit acceptance, and stale-base refusal. Dismiss is an exact no-op.
- Keep Canvas view state instance-local. No module-global mutable pointer, transform, raster cache, or assist state.
- Use only current `--color-*`, `--font-*`, `--radius-*`, and `--pbs-*` derived tokens. Do not add raw z-index values above `1`.
- Artwork uses nearest-neighbor sampling. Clamp renderer DPR to `2`; the grid is hidden below `4x`.
- The zoom ladder is exactly `[0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]`.
- `VITE_PIXELBRAIN_CANVAS_PRO=0` selects classic Canvas; unset or `1` selects professional Canvas.
- Preserve all inherited dirty Phase B work. Do not stage or commit an inherited untracked file unless Angel separately authorizes incorporating that baseline. Task-end commit commands are conditional on a cleanly attributable index; otherwise record a verified checkpoint without committing.
- Follow strict red-green-refactor: every new behavior gets a failing test, the failure is observed, and only then is production code written.

---

### Task 1: Build the pure interaction kernel

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/tests/canvas-interaction.test.mjs`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-interaction.js`

**Interfaces:**
- Consumes: plain finite numeric point, size, viewport, and zoom-ladder records.
- Produces: `ZOOM_LADDER`, `rasterLine(from, to)`, `dedupeCells(cells, bounds)`, `screenToCell(point, viewport, docSize)`, `cellToScreen(cell, viewport)`, `zoomAt(viewport, anchor, nextZoom)`, `stepZoom(viewport, anchor, direction, ladder)`, and `fitViewport(docSize, containerSize, ladder, padding)`.

- [ ] **Step 1: Write the failing geometry tests**

Create tests that name the production behavior directly:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  ZOOM_LADDER,
  cellToScreen,
  dedupeCells,
  fitViewport,
  rasterLine,
  screenToCell,
  stepZoom,
  zoomAt,
} from "../src/lib/pixelbrain/canvas-interaction.js";

test("rasterLine fills fast shallow, steep, and reverse strokes without gaps", () => {
  assert.deepEqual(rasterLine({ x: 0, y: 0 }, { x: 5, y: 2 }), [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 },
    { x: 3, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 2 },
  ]);
  assert.deepEqual(rasterLine({ x: 2, y: 5 }, { x: 0, y: 0 }).at(-1), { x: 0, y: 0 });
});

test("screen and cell transforms round-trip at fractional and integer zoom", () => {
  for (const zoom of [0.5, 1, 8, 32]) {
    const viewport = { panX: 37, panY: 19, zoom };
    const screen = cellToScreen({ x: 7, y: 11 }, viewport);
    assert.deepEqual(screenToCell({ x: screen.x + zoom / 2, y: screen.y + zoom / 2 }, viewport, { width: 20, height: 20 }), { x: 7, y: 11 });
  }
});

test("zoomAt preserves the world coordinate beneath the pointer", () => {
  const before = { panX: 20, panY: 30, zoom: 4 };
  const after = zoomAt(before, { x: 148, y: 94 }, 8);
  assert.equal((148 - before.panX) / before.zoom, (148 - after.panX) / after.zoom);
  assert.equal((94 - before.panY) / before.zoom, (94 - after.panY) / after.zoom);
});

test("fitViewport uses the largest legal zoom and centers the document", () => {
  assert.deepEqual(fitViewport({ width: 160, height: 144 }, { width: 720, height: 680 }, ZOOM_LADDER, 32), {
    zoom: 4,
    panX: 40,
    panY: 52,
  });
});

test("stepZoom uses ladder values and dedupeCells clips document bounds", () => {
  assert.equal(stepZoom({ panX: 0, panY: 0, zoom: 4 }, { x: 20, y: 20 }, 1).zoom, 8);
  assert.deepEqual(dedupeCells([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: -1, y: 0 }], { width: 2, height: 2 }), [{ x: 1, y: 1 }]);
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-interaction.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `canvas-interaction.js`.

- [ ] **Step 3: Implement the zero-dependency kernel**

Implement the named exports with these invariants:

```js
export const ZOOM_LADDER = Object.freeze([0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]);

export function rasterLine(from, to) {
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  const endX = Math.floor(to.x);
  const endY = Math.floor(to.y);
  const dx = Math.abs(endX - x);
  const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y);
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  const cells = [];
  while (true) {
    cells.push({ x, y });
    if (x === endX && y === endY) return cells;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

export function screenToCell(point, viewport, docSize) {
  const x = Math.floor((point.x - viewport.panX) / viewport.zoom);
  const y = Math.floor((point.y - viewport.panY) / viewport.zoom);
  return x >= 0 && y >= 0 && x < docSize.width && y < docSize.height ? { x, y } : null;
}

export function cellToScreen(cell, viewport) {
  return { x: viewport.panX + cell.x * viewport.zoom, y: viewport.panY + cell.y * viewport.zoom };
}

export function zoomAt(viewport, anchor, nextZoom) {
  const worldX = (anchor.x - viewport.panX) / viewport.zoom;
  const worldY = (anchor.y - viewport.panY) / viewport.zoom;
  return { zoom: nextZoom, panX: anchor.x - worldX * nextZoom, panY: anchor.y - worldY * nextZoom };
}
```

`fitViewport` must subtract `padding * 2` before selecting a zoom, choose `ladder[0]` if none fits, and center the document. `stepZoom` must move exactly one ladder index by the sign of `direction`. `dedupeCells` must preserve first-seen order while clipping non-integer or out-of-bounds cells.

- [ ] **Step 4: Run the interaction tests green**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-interaction.test.mjs
```

Expected: all five tests PASS with no warnings.

- [ ] **Step 5: Checkpoint Task 1**

```bash
git diff --check -- Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-interaction.js Pixel-Art-Studio-Skeleton/tests/canvas-interaction.test.mjs
git status --short -- Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-interaction.js Pixel-Art-Studio-Skeleton/tests/canvas-interaction.test.mjs
```

If both paths are newly attributable to this task and the user has authorized implementation commits:

```bash
git add -- Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-interaction.js Pixel-Art-Studio-Skeleton/tests/canvas-interaction.test.mjs
git commit -m "feat(pixelbrain): add Canvas interaction kernel"
```

---

### Task 2: Add deterministic Canvas audit and assist selection

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/tests/canvas-assist.test.mjs`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-assist.js`
- Modify: `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-authoring-facade.js`
- Modify: `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-document.js`

**Interfaces:**
- Consumes: frozen document snapshots, `critiqueDocument(snapshot)`, `getStudioAmpManifest()`, and construction-guide geometry.
- Produces: `auditCanvasPixels(snapshot)`, `selectCanvasAssists({ snapshot, critique, manifest })`, `assistIsStale(suggestion, checksum)`, `assistOutputCells(output)`, and `previewConstructionGuides(snapshot, options)`.
- Extends: `cellsFromOutput(output)` to accept a direct array of coordinate cells without changing current object forms.

- [ ] **Step 1: Write failing assist tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { assistIsStale, assistOutputCells, auditCanvasPixels, selectCanvasAssists } from "../src/lib/pixelbrain/canvas-assist.js";

const snapshot = {
  checksum: "studio-output1:base",
  width: 8,
  height: 8,
  palette: ["#000000", "#ffffff"],
  layers: [{ visible: true, cells: [{ x: 1, y: 1, color: "#ffffff" }, { x: 5, y: 5, color: "#ffffff" }] }],
};

test("auditCanvasPixels identifies isolated visible pixels deterministically", () => {
  assert.deepEqual(auditCanvasPixels(snapshot).isolatedCells, [{ x: 1, y: 1 }, { x: 5, y: 5 }]);
});

test("selectCanvasAssists caps stable evidence-backed suggestions at three", () => {
  const suggestions = selectCanvasAssists({
    snapshot,
    critique: { weakSilhouette: true, likelyCenterDrift: true },
    manifest: [
      { ampId: "square-sharpness-contrast", kind: "mutation", order: 8 },
      { ampId: "palette-quantization-amp", kind: "mutation", order: 9 },
    ],
  });
  assert.equal(suggestions.length, 3);
  assert.deepEqual(suggestions.map((item) => item.id), ["construction-guides", "pixel-audit", "square-sharpness-contrast"]);
  assert.ok(suggestions.every((item) => item.reason.length > 0 && item.baseChecksum === snapshot.checksum));
});

test("assist staleness and direct-array output normalization are explicit", () => {
  assert.equal(assistIsStale({ baseChecksum: "a" }, "b"), true);
  assert.deepEqual(assistOutputCells([{ x: 2, y: 3, color: "#abcdef" }]), [{ x: 2, y: 3, color: "#abcdef" }]);
});
```

- [ ] **Step 2: Verify the assist tests fail for missing production code**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-assist.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `canvas-assist.js`.

- [ ] **Step 3: Implement the audit and selection module**

Use visible-layer compositing in layer order. An isolated cell has no occupied neighbor in its eight-cell neighborhood. Stable suggestion rules are:

```js
const RULES = Object.freeze([
  { id: "construction-guides", kind: "overlay", priority: 100 },
  { id: "pixel-audit", kind: "overlay", priority: 90 },
  { id: "square-sharpness-contrast", kind: "transform", priority: 80, ampId: "square-sharpness-contrast" },
  { id: "symmetry-assist", kind: "stroke-aid", priority: 70 },
  { id: "palette-quantization-amp", kind: "transform", priority: 60, ampId: "palette-quantization-amp" },
]);
```

Construction is relevant for an empty document or center drift. Pixel audit is relevant when isolated cells exist. Square sharpness is relevant only when its exact manifest mutation record exists and isolated cells exist. Symmetry assist is relevant when the document has occupied pixels but no symmetry axis. Palette pressure is relevant at 28 or more colors and only when the exact mutation record exists. Sort by descending priority then `id`, cap at three, and include `baseChecksum` plus a plain evidence reason.

- [ ] **Step 4: Add preview-only guide and output normalization seams**

In `studio-authoring-facade.js`, export a no-mutation guide function:

```js
export function previewConstructionGuides(snapshot, options = {}) {
  return Object.freeze(buildConstructionGuideCells({
    width: snapshot.width,
    height: snapshot.height,
    color: options.color || "#00e5ff",
  }).map((cell) => Object.freeze({ ...cell })));
}
```

In `studio-document.js`, make `cellsFromOutput()` accept a direct array first:

```js
export function cellsFromOutput(output) {
  if (Array.isArray(output)) return output.map((cell) => ({ ...cell }));
  if (!output || typeof output !== "object") return [];
  // preserve every existing object-form branch unchanged
}
```

Add direct tests for both behaviors to `canvas-assist.test.mjs`.

- [ ] **Step 5: Run focused assist and document regression tests**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-assist.test.mjs tests/studio-authoring-editor.test.mjs tests/studio-document.test.mjs
```

Expected: all tests PASS; existing object-form generated outputs still install correctly.

- [ ] **Step 6: Checkpoint Task 2**

```bash
git diff --check -- Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-assist.js Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-authoring-facade.js Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-document.js Pixel-Art-Studio-Skeleton/tests/canvas-assist.test.mjs
```

Commit only if all four paths are cleanly attributable; otherwise leave the verified checkpoint unstaged.

---

### Task 3: Introduce the viewport-sized professional renderer

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/ClassicCanvas.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/PixelCanvas.tsx`
- Create: `Pixel-Art-Studio-Skeleton/tests/visual/studio-canvas-pro.spec.mjs`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx`

**Interfaces:**
- Consumes: `snapshot.width`, `snapshot.height`, `compositeSnapshotToRgba(snapshot)`, viewport helpers, tool/colors/lock state, guide/candidate arrays.
- Produces: `PixelCanvas` props `snapshot`, `viewport`, `tool`, `fgColor`, `bgColor`, `locked`, `spacePan`, `gridVisible`, `guides`, `candidate`, `onViewportChange`, `onGesture`, `onFill`, `onPick`, `onCursor`, and `onFeedback`.
- Rollback: `ClassicCanvas` contains the current pre-polish Canvas implementation; `Canvas.tsx` selects classic only when `VITE_PIXELBRAIN_CANVAS_PRO === "0"`.

- [ ] **Step 1: Preserve the classic implementation before changing behavior**

Move the current `Canvas.tsx` component body into `authoring/ClassicCanvas.tsx`, rename its export to `ClassicCanvas`, and keep its current props and behavior byte-for-byte except import paths. Replace `Canvas.tsx` with a feature-gated wrapper that initially renders classic in both branches.

```tsx
const professionalEnabled = import.meta.env.VITE_PIXELBRAIN_CANVAS_PRO !== "0";
return professionalEnabled
  ? <ClassicCanvas {...props} />
  : <ClassicCanvas {...props} />;
```

Run the existing visual tab test before continuing; it must still pass.

- [ ] **Step 2: Write the failing professional-viewport browser test**

```js
import { expect, test } from "playwright/test";

test("professional Canvas owns a viewport-sized workboard", async ({ page }) => {
  await page.goto("/studio/canvas");
  const viewport = page.getByTestId("canvas-viewport");
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveAttribute("data-renderer", "invalidation");
  const box = await viewport.boundingBox();
  expect(box.width).toBeGreaterThan(500);
  expect(box.height).toBeGreaterThan(360);
});
```

- [ ] **Step 3: Run the browser test red**

```bash
cd Pixel-Art-Studio-Skeleton
sh startup.sh
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "owns a viewport"
```

Expected: FAIL because `canvas-viewport` does not exist.

- [ ] **Step 4: Refactor `PixelCanvas.tsx` into an invalidation renderer**

Use a `ResizeObserver` to set CSS size and a backing store of `round(css * min(devicePixelRatio, 2))`. Cache the authoritative document as a native-size in-memory canvas created from `new ImageData(rgba, width, height)`; do not call `createImageBitmap` with the facade result object. Draw only after `invalidate()` schedules one RAF.

The draw order is fixed:

1. workboard background;
2. checkerboard clipped to document bounds;
3. authoritative source canvas with `imageSmoothingEnabled = false`;
4. current gesture or AMP candidate pixels;
5. construction/audit/symmetry overlays;
6. adaptive grid when `zoom >= 4`;
7. canvas bound and living lattice cursor.

Use current CSS tokens for DOM chrome. Canvas drawing colors may be resolved once with `getComputedStyle(container)`; do not pass CSS `var()` strings to `CanvasRenderingContext2D.fillStyle`.

- [ ] **Step 5: Add fit-on-first-layout and renderer cleanup**

On first nonzero `ResizeObserver` measurement and when document dimensions change, call `fitViewport(..., 32)`. On unmount, cancel the RAF, disconnect the observer, and release pointer capture if held. Viewport changes go through `onViewportChange`; pointer hover stays in refs.

- [ ] **Step 6: Route the professional branch to the new composition**

Create a private `ProfessionalCanvas` in `Canvas.tsx` initially containing the current document bar, tool rail, viewport, docks, and status. Render it when the flag is enabled and Classic otherwise. Keep Canvas's external props unchanged so `PixelBrainStudio.tsx` requires no behavior change in this task.

- [ ] **Step 7: Run the viewport browser and existing Studio tests green**

```bash
cd Pixel-Art-Studio-Skeleton
npx playwright test tests/visual/studio-canvas-pro.spec.mjs tests/visual/studio-tabs.spec.mjs --project=chromium
node --test tests/studio-router.test.mjs tests/studio-tabs-phase-b.test.mjs
```

Expected: viewport test and existing tab tests PASS with no page errors.

- [ ] **Step 8: Checkpoint Task 3**

```bash
git diff --check -- Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/ClassicCanvas.tsx Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/PixelCanvas.tsx Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx Pixel-Art-Studio-Skeleton/tests/visual/studio-canvas-pro.spec.mjs
```

Do not commit the inherited untracked Phase B files unless their baseline ownership has been resolved.

---

### Task 4: Implement Aseprite-grade pointer and keyboard behavior

**Files:**
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/PixelCanvas.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/ToolRail.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/CanvasStatusBar.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/tests/visual/studio-canvas-pro.spec.mjs`

**Interfaces:**
- Gesture mode: `"foreground" | "background" | "erase"` chosen on pointer down and retained until pointer up/cancel.
- `onGesture(cells, mode)` commits one ordered deduplicated cell array.
- Picker returns a lowercase `#rrggbb` sampled from the authoritative composite cache.
- `CanvasStatusBar` exposes an imperative `setCursor({ x, y, color, blocked })` handle so pointer hover does not set React state.

- [ ] **Step 1: Add failing browser tests for the drawing contract**

Extend the browser spec with distinct tests that:

- drag rapidly across eleven diagonal cells and observe `11 cells`;
- press `Control+z` once and observe `0 cells`;
- zoom with the pointer over a known lattice cell and verify the reported coordinate remains unchanged;
- select Eraser with `E`, Fill with `G`, Picker with `I`, Pencil with `B`;
- right-drag with a distinct background color and sample the result with Picker;
- lock the active layer, attempt a stroke, and verify both unchanged cell count and `Layer is locked` status.

Use the viewport's bounding box and the exposed `data-pan-x`, `data-pan-y`, and `data-zoom` diagnostics to calculate exact screen positions; these attributes describe view state only and expose no user content.

- [ ] **Step 2: Run the new interaction tests red**

```bash
cd Pixel-Art-Studio-Skeleton
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "drawing contract"
```

Expected: FAIL on missing interpolated/right-button/picker/locked-feedback behavior.

- [ ] **Step 3: Implement gesture aggregation and pointer capture**

On pointer down:

- focus the canvas;
- choose pan for Space or middle button;
- choose fill/picker as one-shot operations;
- otherwise capture the pointer, freeze gesture mode, and seed the ordered Map.

On pointer move:

- update the cursor ref;
- if panning, add the client-position delta to viewport pan;
- if drawing, traverse `rasterLine(lastCell, currentCell)` and add unseen in-bounds cells;
- if Shift began the gesture, traverse from the last accepted anchor instead of the last sampled cell.

On pointer up/cancel/lost capture:

- commit the cell Map once or cancel it on Escape;
- clear gesture and temporary pan state;
- preserve the last accepted drawing anchor for the next Shift gesture.

Secondary pencil gestures paint `bgColor`; Eraser always emits erase. Suppress the context menu only on the viewport canvas.

- [ ] **Step 4: Implement zoom, pan, fit, and modifier cleanup**

Wheel direction steps exactly one `ZOOM_LADDER` value and uses `zoomAt`. `+`/`-` anchor to the viewport center; `1` uses zoom `1` centered on the document; `2` uses fit. Window blur and visibility loss clear Space-pan and cancel any uncommitted gesture.

- [ ] **Step 5: Add Picker, `X`, and imperative status feedback**

Picker reads the cached authoritative RGBA at the hit cell and calls `doc.setFgColor(hex)`. `X` swaps foreground and background by reading both before setting either. Tool shortcuts ignore form/contenteditable/dialog targets. Status text includes tool, coordinates, sampled color, zoom, layer, grid type, cell count, symmetry mode, and pending-assist state.

- [ ] **Step 6: Run focused tests green**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-interaction.test.mjs tests/studio-authoring-editor.test.mjs
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "drawing contract"
```

Expected: all named interaction paths PASS and no warning is emitted.

- [ ] **Step 7: Checkpoint Task 4**

Run `git diff --check` on the five touched paths and record the browser screenshot path for comparison.

---

### Task 5: Build the compact professional workbench

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/CanvasCommandBar.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/CanvasInspector.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/CanvasFeedback.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/DocumentBar.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/LayerDock.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/IndexedPaletteDock.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/NativePreview.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/styles/pixelbrain.css`
- Modify: `Pixel-Art-Studio-Skeleton/tests/visual/studio-canvas-pro.spec.mjs`

**Interfaces:**
- `CanvasCommandBar` receives tool, zoom, grid-visible, symmetry, undo/redo, zoom/fit, and toggles; it owns no document state.
- `CanvasInspector` receives Layer, Palette, Assist, and Preview children and stores only disclosure state.
- `CanvasFeedback` receives a message record `{ id, tone, text }`, renders a viewport-local status plus polite live region, and expires presentation without clearing faults from Diagnostics.

- [ ] **Step 1: Write a failing visual-structure test**

Assert that the professional route has no large `Canvas & Aseprite` page heading, the compact document bar is above the workboard, the tool rail contains Pencil/Eraser/Fill/Picker, inspector headings are Layers/Palette/Assist/Preview, and the 1440x900 viewport allocates more width to the workboard than the two side rails combined.

- [ ] **Step 2: Run the visual-structure test red**

```bash
cd Pixel-Art-Studio-Skeleton
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "professional workbench"
```

Expected: FAIL because the current heading and dock composition remain.

- [ ] **Step 3: Implement semantic command and inspector components**

Use real `<button>`, `<section>`, `<details>`, and toolbar semantics. Put only document/import/export actions in `DocumentBar`; tool options, zoom, fit, grid, and symmetry go in `CanvasCommandBar`. Keep visible text for destructive or ambiguous actions and tooltip/title plus accessible name for icon-only commands.

- [ ] **Step 4: Refine layer and palette ergonomics**

Stop nested layer buttons from accidentally triggering layer selection before their own action. Keep layer selected/locked/hidden states distinct without color alone. Add an explicit fg/bg swap button and label right-click background behavior. Palette swatches retain semantic labels and 32-color count.

- [ ] **Step 5: Apply the Canvas-only visual system**

Rewrite the Canvas layout rules around:

```css
.pbs-editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: calc(100dvh - var(--pbs-studio-chrome-height));
}

.pbs-editor-body {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 300px;
  min-height: 0;
}
```

Define `--pbs-studio-chrome-height` inside `.pbs-shell` and keep all colors derived from current tokens. The viewport has `overflow: hidden`; internal pan replaces scroll. Use `position: sticky` only where it does not create a new z-index tier. The living cursor is drawn in Canvas, not a decorative DOM glow.

Below 1040px, make tools horizontal and inspector a normal-flow drawer opened by a 44px button. At 390px, document/command rows scroll internally if needed but `html.scrollWidth === html.clientWidth`.

- [ ] **Step 6: Run visual, focus, and responsive checks green**

```bash
cd Pixel-Art-Studio-Skeleton
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "professional workbench"
npx playwright test tests/visual/studio-tabs.spec.mjs --project=chromium
```

Capture desktop and mobile screenshots and inspect both at original resolution before accepting the task.

- [ ] **Step 7: Checkpoint Task 5**

Run scoped `git diff --check`; do not stage inherited Phase B files.

---

### Task 6: Integrate preview-backed PixelBrain Assist

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/CanvasAssistDock.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/PixelCanvas.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/PixelBrainStudio.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/styles/pixelbrain.css`
- Modify: `Pixel-Art-Studio-Skeleton/tests/canvas-assist.test.mjs`
- Modify: `Pixel-Art-Studio-Skeleton/tests/studio-amp-document.test.mjs`
- Modify: `Pixel-Art-Studio-Skeleton/tests/visual/studio-canvas-pro.spec.mjs`

**Interfaces:**
- `CanvasAssistDock` receives stable suggestions, active id, preview state, dormant count, busy state, and explicit preview/apply/dismiss/toggle/deeplink callbacks.
- `PixelCanvas.candidate` is `null` or `{ cells, visible, mode: "overlay" | "generated-layer" }` and never changes document state.
- Canvas mutation flow uses `proposeStudioMutationExecution`, `acceptStudioMutation`, `rejectStudioMutation`, and the existing receipt/fault recorders supplied by `PixelBrainStudio`.

- [ ] **Step 1: Add failing no-op, stale, and apply tests**

Unit tests must prove:

- selecting/toggling construction or audit overlays leaves the document checksum unchanged;
- Dismiss calls the existing reject transaction and returns the exact baseline object;
- drawing after preview makes `assistIsStale` true;
- Apply refuses stale proposals;
- a fresh accepted direct-array mutation installs real cells as one generated layer and one undo removes it;
- receipts and faults appear in Diagnostics through the current controller.

Browser tests must verify visible `Preview`, `Apply`, and `Dismiss` controls only for transform suggestions, an explicit stale message, and `2 relevant · 52 dormant`-style accounting derived from the actual manifest length.

- [ ] **Step 2: Run assist tests red**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-assist.test.mjs tests/studio-amp-document.test.mjs
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "Canvas Assist"
```

Expected: FAIL because the dock and Canvas mutation bridge do not exist.

- [ ] **Step 3: Implement overlay and stroke-aid suggestions first**

Compute critique, audit, manifest, and suggestions with `useMemo` keyed by snapshot checksum. Construction preview uses `previewConstructionGuides` and remains a guide plane until the existing explicit promotion action is chosen. Pixel Audit marks isolated cells with a non-exported outline. Symmetry Assist toggles the existing document symmetry axis and reports the active mode; it does not invent a second mirroring implementation.

- [ ] **Step 4: Implement transform preview through the mutation vehicle**

For `square-sharpness-contrast`, call:

```ts
const proposal = await proposeStudioMutationExecution({
  ampId: suggestion.ampId,
  snapshot,
  options: { signal: controller.signal },
});
```

Extract display cells from `proposal.transaction.candidate.data` through `assistOutputCells`. Record the mutation-preview receipt immediately. Store the proposal with its `baseChecksum`; do not install output during Preview.

- [ ] **Step 5: Implement explicit Apply and Dismiss**

Apply must first compare proposal base with the current snapshot, then:

```ts
const accepted = acceptStudioMutation({ current: snapshot, transaction: proposal.transaction });
doc.installGeneratedOutput(
  accepted.data,
  { ...proposal.receipt, baseChecksum: accepted.parentChecksum },
  { name: `ASSIST/${String(accepted.mutationAmpId)}` },
);
```

Dismiss must call `rejectStudioMutation({ current: snapshot, transaction })`, verify identity with the current baseline, clear only preview state, and add no generated layer. Escape performs the same dismissal. A stale proposal leaves the candidate visible for comparison but disables Apply and explains regeneration.

- [ ] **Step 6: Add deep-link handling without duplicating Conveyor**

Pass an `onOpenTab(tab)` callback from `PixelBrainStudio` into Canvas. Suggestions that require parameters or non-Canvas execution open `amps`, `mutations`, `blueprint`, or `finish` through the existing tab router. The dock may list dormant reasons in disclosure, but it does not render the full manifest controls.

- [ ] **Step 7: Run all assist tests green**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-assist.test.mjs tests/studio-amp-document.test.mjs tests/studio-authoring-editor.test.mjs
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium -g "Canvas Assist"
```

Expected: all PASS, preview and dismissal preserve checksum, stale Apply is disabled, and fresh Apply is undoable.

- [ ] **Step 8: Checkpoint Task 6**

Run scoped `git diff --check` and inspect the candidate overlay in the real browser at native and magnified zoom.

---

### Task 7: Close accessibility, responsive, and cross-tab regressions

**Files:**
- Modify: `Pixel-Art-Studio-Skeleton/tests/visual/studio-canvas-pro.spec.mjs`
- Modify: `Pixel-Art-Studio-Skeleton/tests/visual/studio-tabs.spec.mjs`
- Modify only as failures require: Canvas files listed in Tasks 3-6.

**Interfaces:**
- Consumes: the completed professional Canvas.
- Produces: current desktop/narrow interaction evidence and preserved nine-tab authoring flow.

- [ ] **Step 1: Add failing accessibility and responsive assertions before fixing any discovered issue**

Cover keyboard tab order, visible focus, tool `aria-pressed`, status `aria-live`, locked/stale message text, reduced motion, 390px overflow, inspector drawer access, and Canvas description containing size/zoom/tool/layer. When a discovered regression needs production work, first add the smallest assertion that fails for that regression.

- [ ] **Step 2: Run the complete Canvas browser spec**

```bash
cd Pixel-Art-Studio-Skeleton
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium
```

Expected at the red checkpoint: at least the newly added assertion fails until its production behavior is implemented.

- [ ] **Step 3: Implement only the accessibility/responsive changes proven by failing assertions**

Use semantic elements and current token focus styles. Do not introduce a modal for non-destructive actions or fixed-position drawers with a hardcoded z-index. Respect `prefers-reduced-motion` through the existing global rule and Canvas-specific transition removal.

- [ ] **Step 4: Run Canvas and nine-tab browser flows green**

```bash
cd Pixel-Art-Studio-Skeleton
npx playwright test tests/visual/studio-canvas-pro.spec.mjs tests/visual/studio-tabs.spec.mjs --project=chromium
```

Expected: both suites PASS, no uncaught page error, and no page-level overflow.

- [ ] **Step 5: Inspect original-resolution screenshots**

Inspect the generated 1440x900 and 390x844 screenshots. Reject the task if the workboard is not dominant, the document is visually lost, controls overlap, selected/disabled states are ambiguous, focus is clipped, or palette/art colors are confused with Studio accent color.

- [ ] **Step 6: Checkpoint Task 7**

Run scoped `git diff --check` and retain the screenshot/test-result paths for the PIR.

---

### Task 8: Run release gates and write the PIR

**Files:**
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260906-PIXELBRAIN-CANVAS-PROFESSIONAL-POLISH.md`
- Modify: `docs/scholomance-encyclopedia/PDR-archive/2026-09-06-pixelbrain-canvas-professional-polish-pdr.md`
- Modify: `docs/scholomance-encyclopedia/PDR-archive/README.md`

**Interfaces:**
- Consumes: complete scoped diff and fresh command/browser evidence.
- Produces: an evidence-backed implementation verdict, current rollback instructions, and lifecycle status.

- [ ] **Step 1: Run focused unit and browser gates fresh**

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-interaction.test.mjs tests/canvas-assist.test.mjs tests/studio-authoring-editor.test.mjs tests/studio-amp-document.test.mjs tests/studio-document.test.mjs
npx playwright test tests/visual/studio-canvas-pro.spec.mjs tests/visual/studio-tabs.spec.mjs --project=chromium
```

Record exact totals, duration, and failures.

- [ ] **Step 2: Run the full standalone quality gates fresh**

```bash
cd Pixel-Art-Studio-Skeleton
npm test
npm run typecheck
npm run lint
npm run build
```

Do not describe a nonzero exit as passing. Separate inherited failures only after reproducing them against the pre-polish baseline.

- [ ] **Step 3: Verify dev and production rendering**

```bash
cd Pixel-Art-Studio-Skeleton
sh startup.sh
node scripts/browser-smoke.mjs
npm run preview:restart
node scripts/browser-smoke.mjs --baseline screenshots/app-builder-preview.json
```

Read the JSON verdicts, browser console results, and both desktop/mobile screenshots. A 200 response is not completion evidence.

- [ ] **Step 4: Verify classic rollback**

Start once with `VITE_PIXELBRAIN_CANVAS_PRO=0`, open `/studio/canvas`, and verify the classic Canvas renders the same active document without console errors. Restore default professional mode afterward.

- [ ] **Step 5: Audit the full Definition of Done and scoped diff**

```bash
git diff --check
git status --short
git diff -- Pixel-Art-Studio-Skeleton/src/lib/pixelbrain Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain Pixel-Art-Studio-Skeleton/src/styles Pixel-Art-Studio-Skeleton/tests
```

Map CP1-CP15 to concrete tests or browser observations. List any unmet item plainly; do not mark the PDR Implemented while one remains.

- [ ] **Step 6: Write the PIR from actual evidence**

Use the repository PIR template and include before/after behavior, exact files, red-green evidence, test totals, screenshot paths, performance design, privacy/security review, classic rollback, inherited dirty-worktree boundaries, and known gaps.

- [ ] **Step 7: Update lifecycle status only if evidence permits**

If every Definition of Done item is satisfied, change the PDR and archive row to `Implemented — scoped Canvas gates green; PIR records exact evidence`. Otherwise leave the PDR Approved and set the PIR verdict to Partial with the exact remaining items.

- [ ] **Step 8: Final checkpoint and optional commit**

Stage only paths attributable to this pass. Because several Phase B target files entered this turn untracked, do not commit them without explicit Angel authorization to include that inherited baseline. If authorization is provided and the staged diff is exact:

```bash
git diff --cached --check
git commit -m "feat(pixelbrain): professionalize Canvas editing"
```

Report the actual commit hash only after `git show --stat --oneline HEAD` confirms it.
