# PDR: PixelBrain Canvas Professional Interaction Polish
## Desktop-first Aseprite-grade drawing loop with contextual PixelBrain Assist

**Date:** 2026-09-06
**Status:** Design approved — awaiting written PDR review
**Classification:** Architectural | Behavioral | UI + Rendering | PixelBrain | Accessibility
**Priority:** High
**Primary Goal:** Replace the standalone Studio Canvas tab's prototype-grade viewport and pointer loop with a precise, stable, desktop-first pixel-authoring workbench while preserving the existing document, AMP, mutation, export, and browser-local authority contracts.

**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-CANVAS-PRO-POLISH`

## Owner(s)

- **Codex:** pure viewport geometry, stroke aggregation, deterministic assist selection, document/command boundary, and schema-law review.
- **Claude/UI:** Canvas composition, tool and inspector surfaces, interaction feedback, visual tokens, keyboard accessibility, and responsive layout.
- **Gemini/QA:** focused behavior tests, Playwright interaction coverage, accessibility checks, and production-browser verification.
- **Escalation owner:** Angel, for changes to frozen Studio contracts, ownership boundaries, or scope beyond the Canvas tab.

## Context

Standalone Phase B delivered a real nine-tab PixelBrain Studio with a revisioned document controller, paint/erase/fill, layers, a 32-color palette, construction guides, PNG/Aseprite I/O, deterministic AMP execution, mutation isolation, and diagnostics. Live inspection on 2026-09-06 showed that the Canvas is functional but still feels like a prototype: the page spends vertical space on presentation chrome, the viewport is an overflowing scaled bitmap, hover forces React updates, fast strokes can skip cells, zoom is not cursor-anchored, panning is only incidental scrolling, tool feedback is weak, and assistance lives in separate tabs rather than converging on the active piece.

## Target Integration Area

`Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx`, its `authoring/` components, the standalone browser-safe PixelBrain facades under `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/`, scoped Canvas styles, and the standalone Node/Playwright test suites.

## Core Concept

The Canvas becomes a precision instrument with three separately rendered planes: authoritative document pixels, temporary candidate pixels, and non-authoritative guides. A viewport transform makes pan, zoom, drawing, grid lines, cursors, and diagnostics agree on the same lattice. PixelBrain Assist then observes the immutable active revision and offers no more than three explainable, relevant actions: overlays may adapt live, explicitly enabled stroke aids may participate in one undoable gesture, and transformations must pass through preview, compare, Apply, or Dismiss.

## Implementation Philosophy

Evolve the existing Phase B document controller and authoring facade instead of creating a second editor model. Keep screen-space state local to the Canvas instance and document state in the existing revisioned controller. Prefer pure geometry and selection functions that can be tested outside React. Do not add selection, shapes, animation, remote AI, or new persistence in this pass. Every visible control must have real behavior, and every behavior that changes pixels must be undoable.

## Ownership and Law Compliance

- Unsaved art remains browser-memory-only. No autosave, telemetry, remote analysis, or server request is added.
- Pixel data remains authoritative; overlays and previews do not enter exports until explicitly committed.
- Existing `PB-STUDIO-AMP-*`, mutation, receipt, and diff contracts remain frozen.
- No new persistent or interoperable schema is introduced. Canvas-only view and suggestion records are ephemeral implementation types.
- UI imports pure authoring behavior through the existing target-local facades; it does not import the root application or Node-only modules.
- Component-local refs hold transient pointer, frame, cache, and transform state. No module-global mutable viewport state is allowed.
- Styling continues to use the existing `pbs-*` scope and CSS tokens. No hardcoded stacking tier above `1` is introduced.
- The implementation requires `PIR-20260906-PIXELBRAIN-CANVAS-PROFESSIONAL-POLISH.md` before status can become Implemented.

---

## 1. Executive Summary

This pass rebuilds the standalone Canvas tab around a professional viewport and input kernel rather than adding cosmetic chrome to the current bitmap surface. It introduces gap-free stroke interpolation, gesture-level history, cursor-anchored zoom, stable pan and fit, Aseprite-familiar shortcuts, a living lattice cursor, adaptive grid/bounds rendering, and a contextual PixelBrain Assist inspector. Existing document pixels, layers, palette limits, Aseprite/PNG behavior, and AMP/mutation authority remain intact. The main risk is coordinate drift between input and rendering; one pure transform and differential interaction tests contain that risk. The design is approved, but implementation is not complete until focused behavior, accessibility, dev-browser, production-browser, and visual gates pass.

## 2. Out of Scope / Non-Goals

- Marquee or lasso selection, move/transform tools, geometric primitives, text, gradients, or brushes larger than one pixel.
- Animation timeline, frame management, onion skinning, tags, slices, tile-map mode, or multi-document tabs.
- Pixel-identical imitation of Aseprite's visual skin or every Aseprite shortcut.
- Automatic PixelBrain transformations, opaque AI recommendations, remote model calls, or background processing of user art.
- New AMP adapters, a second AMP registry, changes to the generated 54-capability manifest, or changes to frozen Studio execution envelopes.
- Changes to the root Scholomance `/pixelbrain` implementation, SCDL compiler, Foundry output, database, auth, or deployment architecture.
- Equal touch/stylus parity in this pass. Narrow layouts remain operable, but desktop mouse and keyboard are authoritative.
- A redesign of non-Canvas Studio tabs.

## 3. Spec Sheet

### 3.1 Functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| CP1 | Viewport authority | Pan, zoom, fit, hit-testing, grid, cursor, guides, and previews use one invertible transform with no observable drift. |
| CP2 | Gap-free pencil and eraser | A fast drag visits every raster cell between sampled pointer events using deterministic integer line traversal. |
| CP3 | Gesture history | One pointer gesture, including mirrored cells, produces exactly one undoable document command. |
| CP4 | Desktop navigation | Space-drag and middle-drag pan; wheel and `+`/`-` zoom around the pointer or viewport center; `1` selects native scale and `2` fits. |
| CP5 | Aseprite-familiar color use | Left paint uses foreground, right paint uses background, `X` swaps colors, and `I` samples the visible composite. |
| CP6 | Straight-line modifier | Shift-click or Shift-drag commits a deterministic pixel line from the last accepted pencil/eraser anchor. |
| CP7 | Adaptive overlays | Canvas bounds always read clearly; the one-pixel grid appears only above a useful zoom threshold; symmetry, construction, audit, cursor, and AMP preview overlays are independently switchable. |
| CP8 | Locked-layer safety | Drawing, fill, and assisted changes on locked layers make no document change and produce visible, non-modal feedback. |
| CP9 | Tool convergence | The command strip exposes only options relevant to the active tool and reports the active tool, colors, layer, zoom, and assist state. |
| CP10 | Sparse assistance | At most three suggestions are shown, ordered deterministically, each with an evidence-backed relevance reason. |
| CP11 | Preview authority | Transformative assistance previews changed pixels and cell count without changing the active checksum. Apply is explicit and undoable; Dismiss is an exact no-op. |
| CP12 | Stale refusal | A preview whose base checksum no longer matches the active document disables Apply and states why. |
| CP13 | Live safe aids | Construction and audit overlays remain non-authoritative; explicitly enabled symmetry participates in the current reversible stroke and is visibly declared. |
| CP14 | Responsive access | At desktop the workboard dominates; below 1040px tools become horizontal and inspectors become a drawer; at 390px there is no page-level horizontal overflow. |
| CP15 | Classic rollback | `VITE_PIXELBRAIN_CANVAS_PRO=0` restores the pre-polish Canvas composition during rollout without changing document data. |

The zoom ladder is `[0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]`. Fit selects the largest allowed value that fits both axes, preferring integer scales whenever the viewport permits `1x` or greater. Grid lines remain hidden below `4x`.

### 3.2 Keyboard and pointer contract

| Input | Result |
|---|---|
| `B` / `E` / `G` / `I` | Pencil / eraser / fill / eyedropper |
| `Space` held + primary drag | Pan viewport; release or blur exits pan mode |
| Middle drag | Pan viewport |
| Wheel | Step zoom around pointer |
| `+` / `-` | Step zoom around viewport center |
| `1` / `2` | Native scale / fit canvas |
| `X` | Swap foreground and background |
| Primary pencil click/drag | Paint foreground |
| Secondary pencil click/drag | Paint background; context menu is suppressed only over the canvas |
| Shift + pencil or eraser gesture | Raster line from last accepted anchor |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo |
| `Escape` | Cancel uncommitted stroke or assist preview |

Shortcuts do not fire while focus is in an input, textarea, select, contenteditable region, or dialog.

### 3.3 Visual system

- Palette: `#0c0e0b` background, `#141712` instrument surface, `#1a1e17` active surface, `#e8ebe4` foreground, `#9cba7a` accent. Muted/border/checker values derive from these tokens.
- Typography: Fraunces remains in Studio identity; the workbench uses Figtree for commands and IBM Plex Mono for measurements. No new font is added.
- Layout: compact document/command strip; icon tool rail; uninterrupted central workboard; collapsible Layers, Palette, Assist, and Preview inspector sections; compact status bar.
- Memorable mechanic: the living lattice cursor previews the exact destination cell, foreground/background mode, symmetry echoes, and blocked state.
- Motion: only inspector disclosure, transient feedback, and before/after preview comparison; no animated pixel placement or decorative ambient motion.

### 3.4 Non-functional requirements

- **Determinism:** identical document revision, input-cell sequence, tool state, and options produce identical changed-cell order and document checksum.
- **Rendering:** artwork always uses nearest-neighbor sampling. The viewport backing store accounts for device pixel ratio while clamping DPR to a documented maximum of `2`.
- **Performance:** pointer hover does not update React state. Drawing schedules at most one viewport redraw per animation frame and performs one document commit per completed gesture.
- **Capacity:** Phase B limits remain unchanged: normal work through 160x144, hard document dimension 1024, Aseprite import limits, 32-color palette, and bounded histories.
- **Accessibility:** visible focus, semantic toolbars, accessible names, shortcut descriptions, non-color selected/blocked state, polite status announcements, and reduced-motion support.
- **Security/privacy:** no remote requests, raw HTML injection, content telemetry, or automatic persistence.

### 3.5 Internal contracts

These are instance-local, non-persistent types and are not additions to `SCHEMA_CONTRACT.md`:

```ts
type CanvasViewport = Readonly<{
  panX: number;
  panY: number;
  zoom: number;
}>;

type CanvasAssistSuggestion = Readonly<{
  id: string;
  kind: "overlay" | "stroke-aid" | "transform" | "deeplink";
  priority: number;
  reason: string;
  baseChecksum: string;
  ampId?: string;
}>;
```

Transformative AMP output continues to use the existing Studio preview/receipt/diff records. Canvas does not define a competing transaction format.

### 3.6 Deferred follow-ups

- Selection and transforms.
- Lines, rectangles, ellipses, and configurable brush footprints.
- Animation and onion skinning.
- Full touch/stylus ergonomics.
- Customizable shortcut maps and workspace presets.

## 4. Change Classification

- **Architectural:** replaces the scaled-document canvas with a viewport-sized renderer and a shared coordinate transform.
- **Behavioral:** changes drawing semantics from sampled cells to interpolated gesture commands and changes secondary pencil input from erase to background paint.
- **Structural:** adds tool options, inspector composition, assist selection, feedback, and pure interaction helpers.
- **Cosmetic:** compacts Canvas-only chrome and refines states using the existing SWARD token language.

## 5. Assumptions and Unknowns

- Phase B's current uncommitted source is the baseline and must be preserved rather than reconstructed from `HEAD`.
- `createDocumentController().paint()` and `.erase()` already aggregate arrays of cells into one stroke command and expand configured symmetry; implementation should reuse this seam.
- `compositeSnapshotToRgba()` is the authoritative visible color source for eyedropper and viewport pixels.
- The standalone manifest and planner remain the capability denominator; `amp-registry.js` is not used for Canvas suggestions.
- Construction Guide, `critiqueDocument()`, symmetry, palette quantization, and specialist tab destinations are sufficient for a useful initial Assist set.
- The existing 50-command document-history cap remains adequate for this pass.
- Unknown: browser-specific trackpad wheel magnitudes. The implementation normalizes only direction into discrete zoom steps, preventing hardware-dependent semantic output.

## 6. Open Questions / Escalations

No user-decision blocker remains. The following implementation condition is pre-authorized but must be escalated if encountered:

```text
ESCALATION: CANVAS_CONTRACT_CHANGE
- Collision: A required Canvas behavior cannot be implemented through the existing
  document controller or Studio AMP preview/receipt/mutation contracts.
- Current boundary: View state is ephemeral; document and AMP state use existing contracts.
- Required action: Stop before inventing a persistent schema or direct core import.
- Needs: Angel plus the owning schema/UI agent.
```

## 7. Architecture / File Map

```text
Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/
  studio-document.js                    extend fg/bg swap, sampling/commit seams only if required
  studio-authoring-facade.js            expose pure composite/critique/guide behavior only
  studio-facade.js                      reuse manifest/planner/preview; preserve public behavior
  canvas-interaction.js                 NEW pure transforms, fit, zoom anchoring, raster traversal
  canvas-assist.js                      NEW deterministic ephemeral suggestion selection

Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/
  tabs/Canvas.tsx                       orchestration and classic/pro rollout boundary
  authoring/PixelCanvas.tsx             viewport-sized invalidation renderer and pointer surface
  authoring/CanvasCommandBar.tsx         NEW zoom/fit/grid/tool-option controls
  authoring/CanvasAssistDock.tsx         NEW sparse suggestions, preview/apply/dismiss/deeplink
  authoring/CanvasInspector.tsx          NEW collapsible Layers/Palette/Assist/Preview composition
  authoring/CanvasFeedback.tsx           NEW viewport-local status and aria-live announcements
  authoring/ToolRail.tsx                 pencil/erase/fill/picker tools and shortcut disclosure
  authoring/DocumentBar.tsx              compact document/export actions
  authoring/CanvasStatusBar.tsx          active state and assist visibility
  authoring/LayerDock.tsx                selection, lock, opacity, and action ergonomics
  authoring/IndexedPaletteDock.tsx       fg/bg swap and palette-pressure feedback
  authoring/NativePreview.tsx            inspector preview placement

Pixel-Art-Studio-Skeleton/src/styles/
  pixelbrain.css                         scoped workbench, cursor, overlay, drawer, focus styles

Pixel-Art-Studio-Skeleton/tests/
  canvas-interaction.test.mjs            NEW pure transform and stroke tests
  canvas-assist.test.mjs                 NEW relevance/ordering/staleness tests
  studio-authoring-editor.test.mjs       extend document gesture/color/lock behavior
  visual/studio-canvas-pro.spec.mjs      NEW real pointer/keyboard/responsive browser workflow
  visual/studio-tabs.spec.mjs            preserve cross-tab regression flow
```

### 7.1 Dependency flow

```text
Canvas.tsx
  -> Canvas interaction components
  -> studio-authoring-facade.js / studio-facade.js
  -> existing document controller + AMP planner/executor
  -> immutable snapshot + receipt/fault/event surfaces

PixelCanvas.tsx
  -> canvas-interaction.js
  -> compositeSnapshotToRgba(snapshot)
  -> viewport draw only; never mutates document directly
```

### 7.2 UI specification

```text
UI SPEC:
- Component: Professional Canvas workbench
- World-law connection: one viewport transform enforces lattice law; assist evidence
  makes deterministic PixelBrain capability visible without stealing authority.
- Data consumed: immutable Studio snapshot, active layer/tool/colors, manifest records,
  existing critique/guide output, AMP previews and receipts.
- State: React owns declarative tool/inspector/preview state; refs own transient pointer,
  transform cache, stroke cells, frame request, and composite cache.
- Accessibility: semantic toolbars, ARIA names and pressed states, focus visibility,
  shortcut help, polite status, reduced motion, no tab trap.
- School theming: uses existing SWARD tokens only; artwork palette stays independent.
- Animation: 150-200ms disclosure and preview comparison, transform/opacity only.
- Regression risk: coordinate mapping, history grouping, right-click semantics, locked
  layers, Canvas height, narrow drawer, Studio tab navigation, PNG/Aseprite output.
```

## 8. Step-by-Step Implementation Plan

The detailed executable plan is written only after this PDR is reviewed. Its phases must preserve this order:

1. **Pure interaction kernel** — owner Codex, 0.5 day. Add failing then passing transform, fit, anchor-zoom, raster-line, and cell-dedup tests. Exit: pure suite green; production behavior unchanged.
2. **Viewport renderer behind flag** — owner UI, 1 day. Add viewport-sized invalidation renderer, coordinate transform, cursor/bounds/grid planes, pan/zoom/fit. Exit: classic remains default during this phase; side-by-side fixtures match composite pixels.
3. **Professional drawing loop** — owners UI + Codex, 1 day. Add pointer capture, gap-free aggregation, background paint, picker, Shift-line, keyboard modifiers, and one-command gestures. Exit: focused interaction tests green with pro flag on.
4. **Workbench convergence** — owner UI, 0.5-1 day. Compact header, add command bar, living lattice cursor, adaptive inspectors, improved layer/palette/status feedback. Exit: desktop and 390px screenshots pass visual/a11y inspection.
5. **PixelBrain Assist** — owners Codex + UI, 1 day. Add deterministic suggestions, construction/audit overlays, symmetry state, palette pressure, preview comparison, Apply/Dismiss, stale refusal, and AMP Conveyor deep links. Exit: checksum/no-op/undo tests green.
6. **Cutover and evidence** — owners QA + UI, 0.5-1 day. Default pro flag on, run complete gates in dev and production preview, inspect screenshots, record baseline exceptions, write PIR. Exit: no falsifier remains.

Each stage leaves the app runnable. `VITE_PIXELBRAIN_CANVAS_PRO=0` remains the emergency rollback until the PIR closes the pass.

## 9. Pivotal Code Examples

The implementation plan may refine names, but these examples pin the required behavior.

### 9.1 Deterministic raster traversal

```js
export function rasterLine(from, to) {
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const sx = x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - y);
  const sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  const cells = [];
  while (true) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) return cells;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}
```

### 9.2 Invertible viewport hit-test

```js
export function screenToCell(point, viewport, canvasOrigin, size) {
  const x = Math.floor((point.x - canvasOrigin.x - viewport.panX) / viewport.zoom);
  const y = Math.floor((point.y - canvasOrigin.y - viewport.panY) / viewport.zoom);
  return x >= 0 && y >= 0 && x < size.width && y < size.height ? { x, y } : null;
}
```

### 9.3 Cursor-anchored integer zoom

```js
export function zoomAt(viewport, anchor, nextZoom) {
  const worldX = (anchor.x - viewport.panX) / viewport.zoom;
  const worldY = (anchor.y - viewport.panY) / viewport.zoom;
  return {
    zoom: nextZoom,
    panX: anchor.x - worldX * nextZoom,
    panY: anchor.y - worldY * nextZoom,
  };
}
```

### 9.4 One document commit per gesture

```ts
function commitStroke() {
  const cells = Array.from(strokeCells.current.values());
  strokeCells.current.clear();
  if (cells.length === 0) return;
  if (strokeMode.current === "erase") document.erase(cells);
  else document.paint(cells);
  onChange();
}
```

### 9.5 Sparse deterministic suggestion ordering

```js
export function selectCanvasAssists(candidates) {
  return candidates
    .filter((item) => item.relevant === true)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map(({ relevant, ...suggestion }) => Object.freeze(suggestion));
}
```

### 9.6 Stale preview refusal

```ts
const stale = preview !== null && preview.baseChecksum !== snapshot.checksum;
<button type="button" disabled={!preview || stale} onClick={applyPreview}>
  Apply
</button>
```

### 9.7 Invalidation rather than continuous animation

```ts
function invalidate() {
  if (frame.current !== null) return;
  frame.current = requestAnimationFrame(() => {
    frame.current = null;
    drawViewport();
  });
}
```

## 10. Glossary

- **Authoritative pixels:** cells in the active document snapshot that participate in checksum, undo, and export.
- **Candidate pixels:** temporary output drawn for a stroke or AMP preview but not yet committed.
- **Overlay:** non-exported grid, cursor, symmetry, construction, or diagnostic rendering.
- **Viewport transform:** the single pan/zoom mapping between screen space and lattice space.
- **Gesture command:** one undoable operation produced by one complete pointer gesture.
- **Living lattice cursor:** cell-accurate pointer feedback that reflects tool, button color, symmetry, and blocked state.
- **Safe aid:** an overlay or explicitly enabled reversible stroke behavior that does not silently transform an existing document.
- **Transformative assist:** an operation that proposes changed pixels and therefore requires preview and explicit Apply.
- **Stale preview:** a candidate created from a base checksum that no longer matches the active revision.
- **Dormant AMP:** a manifest capability not relevant to the current document or not Canvas-executable; its reason remains inspectable.

## 11. Q&A — Top 10 Implementation Concerns

1. **Why not just enlarge the existing canvas element?** Its backing size grows with document zoom, hover rerenders React, and scrolling substitutes for a coherent transform. A viewport-sized renderer makes input and display share one coordinate system.
2. **Does the new renderer replace the document model?** No. It consumes immutable snapshots and emits cells through the existing controller.
3. **How is a fast stroke still one undo?** Interpolated cells accumulate in an ordered keyed map until pointer completion, then enter one `paint()` or `erase()` call.
4. **Does right click still erase?** No. Aseprite-familiar pencil behavior uses the background color. Erase is the explicit `E` tool; this behavioral change receives a browser regression test and tooltip disclosure.
5. **Can overlays leak into PNG or Aseprite?** No. Export reads the document snapshot, never the viewport buffer.
6. **Is symmetry an automatic transformation?** Only after the artist explicitly enables a symmetry mode. Its mirrored cells remain part of the same reversible gesture and the status bar declares the mode.
7. **How are AMP suggestions chosen?** From current snapshot evidence, existing critique/guide behavior, and the generated manifest. Ordering is priority then stable id, limited to three.
8. **Does Canvas duplicate AMP Conveyor?** No. Canvas offers context, preview, and a deep link; the Conveyor remains the complete execution bench.
9. **What happens if the document changes during preview?** Apply disables because base and current checksums differ. Dismiss remains a no-op.
10. **What about mobile?** Controls remain reachable in a drawer and no page overflow is allowed, but mouse/keyboard parity is the explicit first milestone.

## 12. QA Plan

### 12.1 Focused Node tests

```bash
cd Pixel-Art-Studio-Skeleton
node --test tests/canvas-interaction.test.mjs
node --test tests/canvas-assist.test.mjs
node --test tests/studio-authoring-editor.test.mjs
node --test tests/studio-amp-document.test.mjs
```

Required assertions include horizontal, vertical, steep, shallow, reverse, repeated-cell, and out-of-bounds line traversal; transform round trips; anchor-preserving zoom; deterministic fit; suggestion limit/order/reasons; checksum isolation; stale refusal; and one undo per gesture.

### 12.2 Full standalone gates

```bash
cd Pixel-Art-Studio-Skeleton
npm test
npm run typecheck
npm run lint
npm run build
```

### 12.3 Browser gates

```bash
cd Pixel-Art-Studio-Skeleton
sh startup.sh
npx playwright test tests/visual/studio-canvas-pro.spec.mjs --project=chromium
npx playwright test tests/visual/studio-tabs.spec.mjs --project=chromium
npm run preview:restart
node scripts/browser-smoke.mjs --baseline screenshots/app-builder-preview.json
```

Browser interaction must draw a fast diagonal and verify every expected cell, undo it once, zoom under the cursor, pan, sample, background-paint, trigger a locked-layer refusal, preview/dismiss an assist, create a stale preview, and apply a fresh candidate.

### 12.4 Visual and accessibility inspection

- Inspect desktop 1440x900 and narrow 390x844 screenshots at original resolution.
- Confirm dominant workboard, legible canvas bounds, quiet grid, unclipped focus, usable inspector drawer, and no low-contrast disabled ambiguity.
- Confirm no uncaught page errors, hydration warnings, or page-level horizontal overflow.
- Confirm reduced-motion behavior and an `aria-live` announcement for blocked/stale actions.

## 13. Regression Risks and Retest Checklist

- **Coordinate drift:** draw at all four corners and after multiple pan/zoom cycles; compare exact cells.
- **Skipped pixels:** replay high-velocity horizontal, vertical, diagonal, and looping gestures.
- **History fragmentation:** verify one undo removes one completed gesture, including symmetry copies.
- **Palette regression:** left/right colors, `X`, sampling, and 32-color reduction remain correct.
- **Layer regression:** active, visible, locked, opacity, reorder, rename, duplicate, delete, flatten, and protected reference behavior remain intact.
- **Export contamination:** enable every overlay, export PNG/Aseprite, and compare pixels to the snapshot without overlays.
- **AMP boundary regression:** preview leaves checksum unchanged; Apply has a receipt and history entry; Dismiss is exact; stale Apply is refused.
- **Cross-tab regression:** Foundry Use in Canvas, AMP commit, Mutation accept/reject, Finish, Mentor, Library, and Diagnostics continue to consume the shared document.
- **Layout regression:** Studio tab strip, footer, Canvas workbench, inspector drawer, and status bar do not cause page overflow.
- **Performance regression:** pointer hover does not call the Canvas React state setter and the renderer has no perpetual RAF loop.

## 14. Rollout Plan

1. Add pure helpers and tests with production behavior unchanged.
2. Add the professional viewport with `VITE_PIXELBRAIN_CANVAS_PRO=0` selecting classic mode and `=1` selecting professional mode during development comparison.
3. Exercise classic and professional modes against the same document fixtures and exported bytes.
4. Turn professional mode on by default after focused interaction and cross-tab tests pass; retain `=0` as the rollback switch.
5. Run dev and production-browser gates, inspect screenshots, and record exact evidence in the PIR.
6. Remove the classic path only in a later cleanup after one full accepted release; removal is not part of this PDR.

**Incomplete-but-safe clause:** before the pro viewport passes all behavior gates, the standalone app must continue to start in classic Canvas mode. Assist suggestions may ship read-only before Apply exists, but an Apply button must not render unless it performs a real receipt-backed, undoable commit with stale-base refusal.

**Rollback:** set `VITE_PIXELBRAIN_CANVAS_PRO=0` and restart the app. If the pro path corrupts document state or exports, revert its scoped commits; no data migration is required because the document and export formats do not change.

## 15. Definition of Done

- [ ] CP1-CP15 have direct automated or browser evidence.
- [ ] Fast strokes are gap-free and one-gesture/one-undo.
- [ ] Pan, zoom, fit, grid, cursor, guides, and hit-testing share one transform.
- [ ] Pencil, eraser, fill, picker, background paint, Shift-line, color swap, and all named shortcuts work.
- [ ] Locked or out-of-bounds actions cannot mutate the document.
- [ ] Hover and cursor movement do not rerender the Canvas React tree.
- [ ] Construction/audit overlays never appear in exported pixels.
- [ ] Suggestions are evidence-backed, deterministic, capped at three, and explain dormant capability.
- [ ] Transform previews preserve checksum until Apply, Dismiss is exact, and stale Apply is refused.
- [ ] Applied assistance is undoable and records the existing receipt/event evidence.
- [ ] Desktop and 390px layouts pass visual, focus, and overflow inspection.
- [ ] Focused Node tests, full target tests, typecheck, lint, build, dev browser, and production browser gates are recorded.
- [ ] Unrelated baseline failures, if any, are separated from scoped failures.
- [ ] `git diff --check` passes for scoped changes.
- [ ] The required PIR exists and records screenshots, commands, results, limits, and rollback status.

## 16. Final Architectural Verdict

**Complete with acceptable risk.** The design is narrow enough to implement without changing the Studio document or AMP schemas, yet deep enough to address the real prototype feel: viewport authority, gesture semantics, immediate tool feedback, and contextual assistance. Coordinate drift and input regressions are the principal risks, and both are controlled through a pure transform kernel, classic-mode rollback, exact-cell tests, and real browser interaction. The design is approved; shipped status still depends on implementation and current evidence.

## 17. References

- `docs/scholomance-encyclopedia/PDR-archive/2026-09-06-pixelbrain-studio-standalone-phase-b-pdr.md` — implemented standalone document and nine-tab authority.
- `docs/scholomance-encyclopedia/PDR-archive/2026-06-12-pixelbrain-editor-aseprite-rival-pdr.md` — broader editor vision and deferred selection/animation scope.
- `docs/scholomance-encyclopedia/PDR-archive/2026-06-12-sketchamp-construction-line-microprocessor-pdr.md` — construction-guide and reference-layer doctrine.
- `docs/scholomance-encyclopedia/PDR-archive/2026-06-12-foundry-aseprite-bridge-pdr.md` — Aseprite interoperability boundary.
- `docs/scholomance-encyclopedia/Scholomance LAW/SHARED_PREAMBLE.md` — browser sovereignty and lattice law.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — determinism, PixelBrain, evidence, and stacking law.
- `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` — existing Studio AMP plan/receipt/mutation/diff contracts.
- `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Canvas.tsx` — current Canvas orchestration.
- `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/PixelCanvas.tsx` — current scaled bitmap and pointer loop.
- `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-document.js` — shared document, stroke, history, palette, layer, and revision authority.
- `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-authoring-facade.js` — browser-safe composite, guides, critique, I/O, and finish seam.
- `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-facade.js` — manifest, planner, preview, commit, and mutation seam.
- `Pixel-Art-Studio-Skeleton/src/styles.css` and `src/styles/pixelbrain.css` — current SWARD tokens and scoped Studio styles.

## 18. Post-Implementation Report Handoff

Implementation requires:

`docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260906-PIXELBRAIN-CANVAS-PROFESSIONAL-POLISH.md`

The PIR must classify the result as Behavioral / Structural / UI + Rendering, list every touched file, distinguish approved design from shipped behavior, record exact automated and browser evidence, include desktop and narrow screenshots, document classic-mode rollback, and leave this PDR as Approved if any Definition of Done item remains incomplete.

## Approval Record

- 2026-09-06: Angel selected desktop-first professional parity with narrow-layout operability.
- 2026-09-06: Angel selected mixed assistance: live safe aids, explicit preview/acceptance for transformations.
- 2026-09-06: Angel selected the professional interaction-kernel scope over surface-only polish or a full Aseprite clone.
- 2026-09-06: Angel approved viewport architecture, drawing behavior, PixelBrain Assist, visual direction, failure handling, accessibility, and verification design.
