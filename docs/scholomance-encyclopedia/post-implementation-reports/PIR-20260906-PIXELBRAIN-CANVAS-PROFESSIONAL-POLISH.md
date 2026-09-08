# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260906-PIXELBRAIN-CANVAS-PROFESSIONAL-POLISH
- **Feature / Fix Name:** PixelBrain Canvas Professional Interaction Polish
- **Author / Agent:** Grok (Task 8 release gates)
- **Date:** 2026-09-06
- **Related PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-06-pixelbrain-canvas-professional-polish-pdr.md`
- **Classification:** Behavioral | Structural | UI + Rendering
- **Priority:** High
- **Status:** Partial — CP1–CP15 have this-run evidence; `npm run typecheck` was fixed after the Partial run and now exits 0; inherited `lint` errors still block Implemented; Task 8 commit skipped.
- **Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-CANVAS-PRO-POLISH`

## 2. Executive Summary

Standalone Studio Canvas now defaults to a professional, viewport-sized invalidation renderer with one invertible transform, gap-free interpolated strokes, one undo per gesture, Aseprite-familiar pointer/keyboard use, compact workbench chrome, and preview-backed PixelBrain Assist through the existing mutation vehicle. Classic composition remains behind `VITE_PIXELBRAIN_CANVAS_PRO=0`.

This PIR records **fresh 2026-09-06 gates**, not prior task reports. Focused Node tests and Playwright Canvas/tab specs passed. Full `npm test` and `npm run build` passed. The first typecheck run failed with three scoped TypeScript errors; those were fixed in `CanvasAssistDock.tsx`, `PixelCanvas.tsx`, and `canvas-assist.js`, and **`npm run typecheck` now exits 0**. `npm run lint` still fails on two **inherited** errors in unmodified Phase A files. The sandbox `browser-smoke.mjs` script cannot write `/workspace/screenshots` in this checkout; equivalent Playwright smokes against `:8090` (dev) and `:8091` (preview) passed with identical body-text hashes and empty consoles.

PDR status remains **Approved**. It is not **Implemented**: inherited `lint` still exits 1, official `browser-smoke.mjs` still exits 1 (`ENOENT /workspace/screenshots`), and Angel has not authorized a commit that would incorporate the inherited Phase B / Tasks 2–7 baseline.

## 3. Before / After

| Surface | Before (Phase B prototype Canvas) | After (professional default) |
|---|---|---|
| Viewport | Overflowing scaled bitmap; hover forced React updates | Viewport-sized invalidation canvas; pan/zoom/fit/hit-test/grid/cursor/guides share one transform |
| Strokes | Sampled cells; fast drags skipped lattice points | `rasterLine` interpolation; 0,0→10,10 visits 11 cells |
| History | Sample-fragmented commits | One pointer gesture → one `doc.paint`/`erase` → one undo |
| Navigation | Incidental scroll; no cursor-anchored zoom | Space-drag and middle-drag pan; wheel and `+`/`-` step zoom; `1` native, `2` fit |
| Color | Right-drag erased | Primary = foreground, secondary = background, `X` swaps, `I` samples composite |
| Chrome | Large “Canvas & Aseprite” heading, prototype docks | Compact command strip, 56px tool rail, 300px inspector, status bar |
| Assist | Separate tabs only | ≤3 evidence-backed suggestions; overlay toggles; transform Preview/Apply/Dismiss with stale refusal |
| Rollout | n/a | Default professional (`env !== "0"`); classic private copy when `=0` |

## 4. Delivered Requirements (CP1–CP15)

Evidence is from **this Task 8 run** unless noted as source inspection of the shipped code.

| ID | Requirement | This-run evidence | Result |
|---|---|---|---|
| CP1 | Viewport authority | `tests/canvas-interaction.test.mjs` round-trip / `zoomAt` / `fitViewport`; Playwright `data-pan-x/y/zoom` + cursor-anchored wheel zoom keeps `x/y 8/8`; professional `data-renderer="invalidation"` | Met |
| CP2 | Gap-free pencil/eraser | Node `rasterLine` shallow/steep/reverse; Playwright `rapid diagonal drag visits 11 cells`; screenshot `drawing-contract.png` shows a continuous 11-cell diagonal at 4× | Met |
| CP3 | Gesture history | Playwright `Control+z once after a stroke returns 0 cells`; `onGesture` commits once on pointer up in `Canvas.tsx` | Met |
| CP4 | Desktop navigation | Wheel zoom in drawing-contract; this-run contracts: Space pan moved (`panX` 382→422), middle pan moved (422→392), `+`/`-` stepped 4×↔2×; after fit, key `1` → zoom 1 / panX 462, key `2` → zoom 4 / panX 222; 1× and Fit buttons match | Met |
| CP5 | Aseprite-familiar color | Playwright right-drag paints `#336699` background then picker samples it; this-run `X` swapped `#c9a227` ↔ `#0c0e0b` | Met |
| CP6 | Straight-line modifier | `assets/pixelbrain-canvas-professional-polish/smoke-dev.json` `contracts.shiftLine`: after click at 3/3 status is `1 cells`; after Shift-click at 8/3 status is **`6 cells`**. Not in the Playwright file | Met |
| CP7 | Adaptive overlays | Grid control in command bar; drawing-contract grid visible at 4×; Assist overlays independently switchable (`Show overlay` vs transform Preview); bounds readable in workbench screenshots | Met |
| CP8 | Locked-layer safety | Playwright locked Structure: 0 cells + `Layer is locked` in status and polite live region | Met |
| CP9 | Tool convergence | Workbench spec: document bar is New/Import/PNG/Aseprite only; command bar Fit/Grid/zoom; tools Pencil/Eraser/Fill/Picker; status reports tool, colors, layer, zoom, assist | Met |
| CP10 | Sparse assistance | Node `selectCanvasAssists` cap 3; Playwright accounting `relevant + dormant = manifest.length`; screenshot `3 relevant · 51 dormant` with reasons | Met |
| CP11 | Preview authority | Playwright Preview leaves checksum unchanged; Apply installs `ASSIST/square-sharpness-contrast`; Undo removes it; Dismiss leaves no generated layer | Met |
| CP12 | Stale refusal | Node `assistIsStale` + AMP stale Apply; Playwright drawing after Preview disables Apply and explains regeneration | Met |
| CP13 | Live safe aids | Node construction/audit overlays leave checksum unchanged; symmetry Assist is a stroke-aid toggle (`doc.toggleSymmetry`) declared in the dock, not an implicit transform | Met |
| CP14 | Responsive access | Playwright 1440 workboard width > tools+inspector; 390 horizontal tools, ≥44px Inspector drawer, `scrollWidth === clientWidth`; Apply reachable in drawer | Met |
| CP15 | Classic rollback | One-off `:8092` with `VITE_PIXELBRAIN_CANVAS_PRO=0`: no `canvas-viewport`, heading height 40.3px (classic) vs 17.5px (pro), same `160×144` / checksum prefix, empty console. `:8090` left professional | Met |

## 5. Caps and Limits Named in Tests

Unchanged from Phase B:

| Cap | Value |
|---|---|
| Command / undo history | 50 |
| Terminal / event history | 40 |
| Receipt / fault ledger | 20 |
| Indexed palette | 32 |
| Default working size | 160×144 |
| Hard dimension | 1024 |
| Zoom ladder | `[0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]` |
| Grid threshold | hidden below 4× |
| DPR clamp | 2 |
| Assist suggestions | 3 |

## 6. Architecture

```text
Canvas (tabs/Canvas.tsx)
  ├── import.meta.env.VITE_PIXELBRAIN_CANVAS_PRO !== "0"
  │     └── ProfessionalCanvas
  │           ├── PixelCanvas.tsx     viewport invalidation renderer (one RAF)
  │           ├── CanvasCommandBar    zoom/fit/grid/tool options
  │           ├── CanvasInspector     Layers / Palette / Assist / Preview
  │           │     └── CanvasAssistDock  ≤3 suggestions; mutation Preview/Apply/Dismiss
  │           └── CanvasStatusBar     imperative cursor (no Canvas setState on hover)
  └── === "0"
        └── ClassicCanvas.tsx       private pre-polish copy (does not import PixelCanvas.tsx)

Pure kernels (no DOM):
  canvas-interaction.js   transform, rasterLine, fit, stepZoom
  canvas-assist.js        audit + selectCanvasAssists + staleness

Document/AMP authority unchanged:
  createDocumentController()  paint/erase/fill/history
  studio-facade.js            propose/accept/reject mutation
```

Classic rollback is a **private copy**, not a re-export of the rewritten renderer.

## 7. Commands and Outcomes (this run)

Working directory for all gates: `Pixel-Art-Studio-Skeleton`. Playwright project: **`chromium-desktop`** (there is no project named `chromium`).

### 7.1 Focused Node + Playwright

```text
node --test tests/canvas-interaction.test.mjs tests/canvas-assist.test.mjs \
  tests/studio-authoring-editor.test.mjs tests/studio-amp-document.test.mjs \
  tests/studio-document.test.mjs
# tests 27
# pass 27
# fail 0
# duration_ms 334.562801
# exit 0

npx playwright test tests/visual/studio-canvas-pro.spec.mjs \
  tests/visual/studio-tabs.spec.mjs --project=chromium-desktop
# Running 23 tests using 2 workers
#   23 passed (1.2m)
# exit 0
```

Playwright split: `studio-canvas-pro` 20, `studio-tabs` 3.

### 7.2 Full standalone gates

`npm test` is `node --test scripts/*.test.mjs && node --import tsx --test src/lib/app-data/app-data.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts && node --test tests/*.test.mjs`.

```text
npm test
# scripts/*.test.mjs   tests 195  pass 195  fail 0
# tsx auth/app-data    tests  45  pass  45  fail 0
# tests/*.test.mjs     tests  53  pass  53  fail 0
# combined 293 pass, 0 fail, exit 0

npm run typecheck
# First run (pre-fix): tsc --noEmit, exit 2
#   CanvasAssistDock.tsx(152,31) TS2367 dest === "finish" not in dest union
#   Canvas.tsx(414,13) TS4104 readonly guides assigned to OverlayCell[]
#   Canvas.tsx(534,15) TS2322 kind: string vs Assist kind union
# After scoped fix (AssistDeeplinkTab includes "finish"; PixelCanvas
# guides?: readonly OverlayCell[]; JSDoc CanvasAssistKind on RULES /
# selectCanvasAssists): tsc --noEmit, exit 0

npm run lint
# eslint ., exit 1
# ✖ 181 problems (2 errors, 179 warnings)
# Inherited errors (files unmodified this pass; last commit 82069433 Phase A):
#   src/lib/app-data/client.server.ts:214  error  Empty block statement  no-empty
#   src/lib/grass/engine.ts:414            error  'dy' is never reassigned. Use 'const'  prefer-const
# Canvas-scoped findings are warnings only (react-hooks/exhaustive-deps on
# PixelCanvas.tsx, Canvas.tsx, ClassicCanvas.tsx; unused `relevant` in canvas-assist.js).

npm run build
# vite client + ssr + nitro, then db:migrate skipped (DATABASE_URL unset)
# client built in 1.54s; ssr built in 729ms
# exit 0
```

The three typecheck errors were **scoped to Canvas polish files** and are **fixed**; `npm run typecheck` exits 0. Lint **errors** are inherited Phase A (`client.server.ts` empty block; `grass/engine.ts` prefer-const); lint still exited 1. Do not treat lint as passing.

### 7.3 Dev / production browser

```text
sh startup.sh
# exit 0 (8090 already listening; script also ran preview stop on 8091)

node scripts/browser-smoke.mjs
# exit 1
# Error: ENOENT: no such file or directory, mkdir '/workspace/screenshots'
# Default URL is http://127.0.0.1:8080/ (404 JSON here). The script is
# sandbox-path-locked to /workspace; this checkout cannot create that directory
# (read-only filesystem at /).

npm run preview:restart
# [preview] serving http://127.0.0.1:8091/  exit 0
```

Equivalent smoke (Playwright, same fields as `browser-smoke.mjs`, writable PIR assets):

| Target | Status | hasCanvas | overflow | console/page errors | renderer | heading px | bodyTextHash |
|---|---|---|---|---|---|---|---|
| `http://127.0.0.1:8090/studio/canvas` desktop 1280×800 | 200 | true | false | none | invalidation | 17.52 | `1c3969dd…a9e6` |
| `:8090` mobile 390×844 | 200 | true | false | none | invalidation | 17.52 | `3064f7de…c850` |
| `http://127.0.0.1:8091/studio/canvas` desktop | 200 | true | false | none | invalidation | 17.52 | **identical to 8090 desktop** |
| `:8091` mobile | 200 | true | false | none | invalidation | 17.52 | **identical to 8090 mobile** |

Checked JSON verdicts, not HTTP 200 alone. Footer copy visible in screenshots: `browser-local · deterministic · no telemetry`.

The archived `screenshots/app-builder-preview.json` baseline is the old Sward grass app on `:8080` (`bodyTextPrefix` starts `Sward Pixel grass…`). It is not a Studio Canvas baseline; an official `--baseline` compare would diverge for identity reasons even if `/workspace` existed.

### 7.4 Classic rollback

```text
PATH="$PWD/node_modules/.bin:$PATH" \
  VITE_PIXELBRAIN_CANVAS_PRO=0 \
  node scripts/with-app-env.mjs vite dev --host 127.0.0.1 --port 8092
# (first attempt without node_modules/.bin failed: spawn vite ENOENT)

GET :8092/__app-env  →  VITE_PIXELBRAIN_CANVAS_PRO=0
GET :8090/__app-env  →  flag unset (professional default)
```

Classic `:8092` `/studio/canvas`: `hasViewport=false`, large heading 40.3px desktop / 43.7px at 1440, `160×144` Structure, checksum prefix `studio-output1:a03caad726b8ac08a…` matches professional, no console/page errors. Classic server was then killed. Professional `:8090` remained 200 with `canvas-viewport`.

**Rollback instruction:** set `VITE_PIXELBRAIN_CANVAS_PRO=0` and restart Vite (the flag is compile-time `import.meta.env`; a running professional server does not pick it up). Restore professional by unsetting the variable (or setting `"1"`) and restarting. No document migration.

### 7.5 Diff hygiene

```text
git diff --check
git diff --check -- Pixel-Art-Studio-Skeleton/src/lib/pixelbrain \
  Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain \
  Pixel-Art-Studio-Skeleton/src/styles Pixel-Art-Studio-Skeleton/tests
# both exit 0 (tracked files only)

# Untracked polish paths scanned for trailing whitespace: 0 hits on
# canvas-interaction.js, canvas-assist.js, Canvas.tsx, authoring/* polish
# components, pixelbrain.css, canvas-*.test.mjs, studio-canvas-pro.spec.mjs,
# studio-tabs.spec.mjs.
# Inherited AMP/codec files under src/lib/pixelbrain/ still contain trailing
# whitespace; they are Phase B / Phase A ports, not this polish pass.
```

HEAD remains `7a2b7c04 feat(pixelbrain): add Canvas interaction kernel`.

## 8. Red–green evidence (Tasks 1–7, as recorded then; gates re-run green above)

| Task | Red (first failure) | Green |
|---|---|---|
| 1 Kernel | `ERR_MODULE_NOT_FOUND` canvas-interaction.js | 5/5 Node; commit `7a2b7c04` |
| 2 Assist select | missing `canvas-assist.js` | 15/15 Node including studio-document/authoring |
| 3 Renderer | no `canvas-viewport` / Classic only | Playwright viewport + tabs |
| 4 Pointer/keyboard | wheel zoom poll timeout; no Picker | drawing-contract 6 passed |
| 5 Workbench | heading height 43.67 ≮ 24; no inspector testid | workbench 3 passed |
| 6 Assist dock | no `assist-accounting` / Preview | Assist 3 passed |
| 7 A11y | tab order included hidden Import; no focus ring; empty description; idle Escape prevented; feedback transitions | 23 passed combined |

## 9. Files

### 9.1 Touched this Task 8 pass

| Path | Role |
|---|---|
| `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260906-PIXELBRAIN-CANVAS-PROFESSIONAL-POLISH.md` | This report |
| `docs/scholomance-encyclopedia/post-implementation-reports/assets/pixelbrain-canvas-professional-polish/` | Screenshots + smoke JSON copied/captured this run |
| `.superpowers/sdd/Viewport-Plan/task-8-report.md` | Implementer report |

PDR and archive README were **not** changed: DoD is not fully met.

### 9.2 Professional Canvas implementation (Tasks 1–7; unstaged except Task 1)

**Committed (Task 1):**

- `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/canvas-interaction.js`
- `Pixel-Art-Studio-Skeleton/tests/canvas-interaction.test.mjs`

**Unstaged polish (Tasks 2–7):**

- `src/lib/pixelbrain/canvas-assist.js`
- `src/components/studio/pixelbrain/tabs/Canvas.tsx`
- `src/components/studio/pixelbrain/authoring/ClassicCanvas.tsx`
- `src/components/studio/pixelbrain/authoring/PixelCanvas.tsx`
- `src/components/studio/pixelbrain/authoring/CanvasCommandBar.tsx`
- `src/components/studio/pixelbrain/authoring/CanvasAssistDock.tsx`
- `src/components/studio/pixelbrain/authoring/CanvasInspector.tsx`
- `src/components/studio/pixelbrain/authoring/CanvasFeedback.tsx`
- `src/components/studio/pixelbrain/authoring/CanvasStatusBar.tsx`
- `src/components/studio/pixelbrain/authoring/ToolRail.tsx`
- `src/components/studio/pixelbrain/authoring/DocumentBar.tsx`
- `src/components/studio/pixelbrain/authoring/LayerDock.tsx`
- `src/components/studio/pixelbrain/authoring/IndexedPaletteDock.tsx`
- `src/components/studio/pixelbrain/authoring/NativePreview.tsx`
- `src/components/studio/pixelbrain/PixelBrainStudio.tsx` (passes `onOpenTab` / `onReceipt`)
- `src/styles/pixelbrain.css`
- `tests/canvas-assist.test.mjs`
- `tests/visual/studio-canvas-pro.spec.mjs`
- `tests/visual/studio-tabs.spec.mjs` (Canvas description + nine-tab loop)
- `tests/studio-amp-document.test.mjs`, `tests/studio-authoring-editor.test.mjs`, `tests/studio-document.test.mjs` (seams)

Phase B untracked document/facade/tab files remain the inherited baseline and were not committed.

## 10. Browser Evidence

Assets: `docs/scholomance-encyclopedia/post-implementation-reports/assets/pixelbrain-canvas-professional-polish/`.

Inspected at original resolution this run:

| File | Observation |
|---|---|
| `workbench-desktop.png` | 1440-class frame: compact `CANVAS & ASEPRITE` label, nine tabs, workboard-dominant checkerboard, tool rail, Layers+Palette, status `Pencil … 2× … Structure 0 cells`. Footer `browser-local · deterministic · no telemetry`. |
| `workbench-mobile.png` | 390×844: horizontal Pencil/Eraser/Fill/Picker, Inspector drawer open on Layers, no page-level horizontal overflow. Status clips layer name to `Str` (known gap). |
| `a11y-desktop-focus.png` | Token `--color-ring` outline around the pixel canvas, unclipped, `outline-offset` inside the workboard. |
| `drawing-contract.png` | Fitted 4× grid, 11-cell gold diagonal, status `11 cells`, Assist `2 relevant · 52 dormant`. Inspector Assist list is nested-scroll cramped (known gap). |
| `assist-preview-fitted.png` | `3 relevant · 51 dormant`; overlay suggestions have Show overlay only; transform has Preview/Apply/Dismiss; native preview lives in inspector; pending `square-sharpness-contrast`. |
| `smoke-dev-desktop.png` / `smoke-preview-desktop.png` | Professional invalidation workbench; preview hash matches dev. |
| `smoke-dev-mobile.png` | 390 Inspector closed; checkerboard visible; no overflow. |
| `smoke-classic-desktop.png` | Large Fraunces “Canvas & Aseprite” heading, prototype docks, native preview on the stage, **no** professional command strip / inspector Assist. Same document checksum. |

No uncaught `pageerror` in Playwright 23 or equivalent smokes. No hydration warnings observed in those consoles.

## 11. Performance design (source + tests)

- **Hover does not update Canvas React state.** `PixelCanvas` keeps cursor in refs and calls `statusRef.setCursor` (status-bar local state). Classic path still uses `setCursor` in `ClassicCanvas`.
- **At most one RAF per burst.** `invalidate()` returns if `rafRef` is set; the rAF callback clears it and draws once.
- **One document commit per completed gesture.** `onGesture(cells, mode)` runs on pointer up (or context-menu cancel that still commits a secondary stroke); fill/picker are one-shot.
- Not a profiler capture this run; these are the implemented contracts plus the 11-cell / one-undo Playwright proofs.

## 12. Privacy / security

- No `fetch`, autosave, telemetry, or remote Assist calls in `Canvas.tsx`, `canvas-assist.js`, or `authoring/*`.
- Unsaved art remains the in-memory document controller. Footer states `browser-local · deterministic · no telemetry`.
- Overlays and Assist candidates do not enter `encodePng` / Aseprite until Apply installs a generated layer. Construction/audit overlay tests leave checksum unchanged.
- Apply uses existing `proposeStudioMutationExecution` / `acceptStudioMutation` / `installGeneratedOutput` receipts. No new schema.

## 13. Inherited dirty-worktree boundary

| Layer | State |
|---|---|
| Phase B Studio (nine-tab authoring, document controller, facades, I/O) | Untracked / modified **before** this polish; not committed |
| Task 1 kernel | Committed `7a2b7c04` |
| Tasks 2–7 professional Canvas | Unstaged on top of Phase B |
| Task 8 | Documentation + evidence assets only; **commit skipped** because Angel has not authorized incorporating the inherited baseline |

`git add` / `git commit` were not run for implementation or this PIR.

## 14. Known gaps (deferred minors from the SDD ledger, still true)

- Off-ladder `stepZoom` falls back to index 0.
- Name collision: `raster-math.js` also exports `rasterLine`; Canvas must keep importing `canvas-interaction.js`.
- Inspector nested scroll / drawer cap can starve Assist (visible in `drawing-contract.png`).
- `NativePreview` still uses raw `#10140f`.
- Assist Preview abort race for in-flight jobs.
- 390 status bar clips the layer name (`Str` instead of `Structure`).

Plus this-run quality-gate gaps that keep the verdict Partial:

- `eslint .` exit 1 from inherited `no-empty` (`src/lib/app-data/client.server.ts:214`) and `prefer-const` (`src/lib/grass/engine.ts:414`) errors. Canvas typecheck is **exit 0** after the scoped fix and is not a remaining blocker.
- Official `browser-smoke.mjs` cannot run here because it mkdir’s `/workspace/screenshots` (`ENOENT`).

## 15. Definition of Done (PDR §15) against this run

| Item | Verdict |
|---|---|
| CP1–CP15 have direct automated or browser evidence | Yes (table §4) |
| Fast strokes gap-free; one-gesture/one-undo | Yes |
| Pan/zoom/fit/grid/cursor/guides/hit-test share one transform | Yes |
| Pencil, eraser, fill, picker, background paint, Shift-line, color swap, named shortcuts | Yes (Shift-line via this-run observation) |
| Locked/OOB cannot mutate | Yes (locked Playwright; `dedupeCells` clips bounds) |
| Hover/cursor movement do not rerender Canvas React tree | Yes (source contract) |
| Construction/audit overlays never in exported pixels | Yes via checksum isolation; exports use document snapshot |
| Suggestions evidence-backed, deterministic, cap 3 | Yes |
| Preview preserves checksum; Dismiss exact; stale Apply refused | Yes |
| Applied assistance undoable with receipt/event | Yes |
| Desktop and 390 visual/focus/overflow | Yes (with known 390 status clip) |
| Focused Node, full tests, typecheck, lint, build, dev browser, production browser **recorded** | Recorded. **typecheck exit 0** (after scoped fix). **lint exit 1** (inherited). **official smoke exit 1** (`ENOENT /workspace/screenshots`) |
| Unrelated baseline failures separated | Yes: lint errors in unmodified Phase A files; smoke `/workspace` path |
| `git diff --check` for scoped tracked changes | Pass |
| Required PIR exists with screenshots, commands, limits, rollback | This file |

## 16. Falsifiers Checked

- Professional default is invalidation viewport, not Classic large heading: pass (`headingHeight` 17.5 vs 40+).
- Fast diagonal is 11 cells, one undo: pass.
- Assist Apply is real and undoable; stale Apply disabled: pass.
- Nine-tab loop still paints, Foundry/AMP/Mutation/Diagnostics: pass (`studio-tabs` 3/3).
- Classic `=0` does not import the professional workboard: pass.
- Isolation: production authoring still has no `fetch`/root/`node:fs` in the Canvas files grepped this run; Phase B `studio-isolation` is inside `npm test` 53/53.

## 17. Unrelated Baseline

- `npm run lint` errors live in `src/lib/app-data/client.server.ts` and `src/lib/grass/engine.ts`, unmodified this pass, last touched by `82069433 feat(pixelbrain): ship standalone Studio phase A`.
- Official `browser-smoke.mjs` `/workspace` output path is a Grok-sandbox contract, not a Canvas regression.
- Root Scholomance `/pixelbrain` unification work is out of this PDR’s scope.
- Inherited lint failure is separated from Canvas work. Scoped typecheck now exits 0 and is not used to excuse the remaining lint/smoke blockers.

## 18. Verdict

**Partial.** Ship-quality Canvas behavior is evidenced in Node, Playwright, and browser observation, including classic rollback. `npm run typecheck` exits 0 after the scoped fix. The PDR stays **Approved** (not Implemented) while inherited `lint` exits 1 and official `browser-smoke.mjs` exits 1, and until Angel authorizes a commit of the inherited unstaged baseline.

**Commit:** none. Task 8 commit skipped on purpose.
