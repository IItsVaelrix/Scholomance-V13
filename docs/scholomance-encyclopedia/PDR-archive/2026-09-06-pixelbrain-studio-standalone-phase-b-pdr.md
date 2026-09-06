# PDR: PixelBrain Studio Standalone Phase B
## Full nine-tab authoring parity with a professional Canvas & Aseprite workspace

**Status:** Approved — Angel approved the architecture and professional Canvas direction on 2026-09-06; implementation has not started.
**Classification:** Architectural | Behavioral | PixelBrain | Standalone authoring | UI + Rendering
**Priority:** Critical
**Primary Goal:** Complete the standalone PixelBrain Studio as a coherent nine-tab authoring application whose default Canvas & Aseprite tab supports serious pixel-art work while preserving deterministic, browser-safe PixelBrain behavior.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-STUDIO-STANDALONE-PHASE-B-2026-09-06`

## Owner(s)

- **Codex:** sole design, implementation, and verification owner under Angel's explicit exception to the repository's usual three-tool split.
- **Escalation owner:** Angel (repository owner).

## Context

Phase A of `2026-09-05-pixelbrain-studio-standalone-port-pdr.md` is implemented in `Pixel-Art-Studio-Skeleton/` at commit `82069433`. It established an independent TanStack/Vite application, mirrored the deterministic AMP execution closure, extracted the frozen 14-function `studio-facade.js`, and shipped Foundry, AMP Conveyor, Mutation Lab, and Diagnostics routes.

Phase A deliberately did not claim full authoring parity. This PDR authorizes the remaining work after a new source and dependency audit. The source contract contains exactly nine tabs in this order:

1. Canvas & Aseprite
2. Blueprint
3. Foundry
4. AMP Conveyor
5. Mutation Lab
6. Material & Finish
7. Mentor & Reference
8. Library & Export
9. Diagnostics

Therefore Phase B adds **five routes**, not six: Canvas, Blueprint, Finish, Mentor, and Library. Foundry and Diagnostics already exist as Phase-A routes but require their legacy-backed authoring functions to be completed. AMP Conveyor and Mutation Lab remain live and are connected to the same document authority rather than becoming parallel mini-applications.

The prior Phase-A PDR recorded two legacy components as context-coupled blockers. That evidence is now stale: the current `ForgeGatePanel.jsx` and `MentorCritiquePanel.jsx` are props-driven. They can be adapted without importing `PixelBrainPage`, its context, or the root application shell.

Angel additionally directed that the Aseprite tab must feel professional. This is an approved refinement of Phase B, not permission for an unrelated visual redesign. The standalone surface keeps its existing SWARD visual language while adopting the information density, stable spatial model, keyboard flow, pixel-accurate zoom, layer discipline, and status feedback expected from a production pixel editor.

## Discovery Record

The authorization is based on current code, not the older estimate:

- `src/pages/PixelBrain/studio/studio-tabs.js` is the authoritative nine-tab ordering and feature map.
- Canvas is backed by `TemplateEditor`, `LayerStackPanel`, and `IndexedPalettePanel`; Blueprint by `SketchPad`, construction guides, and `ForgeGatePanel`; Finish by `ShaderForgePanel`, `ShaderSandbox`, `StyleTransmuter`, and `TextureSelector`; Mentor by `MentorCritiquePanel` and `ReferencePanel`; Library by local-library and export behavior; Diagnostics by status, terminal, and receipt evidence.
- The measured editor/Aseprite core is a narrow closure of approximately 28 modules. The measured shader group is approximately 10 modules. The forge/item dependency graph is much larger, approximately 142 modules, and includes a browser-unsafe observed-sampling seam through `microprocessor-route.js` and Node filesystem access.
- Copying the root adapter or its complete transitive closure would pull in more than 300 unrelated or server-facing modules. That is not an acceptable standalone boundary.
- `microprocessor-route.core.js` is the browser-safe pure routing substrate. Phase B must use a target-local route executor built on that core rather than importing the Node sampling path.
- The source's 2,517-line page stylesheet is not a suitable wholesale visual dependency. Phase B ports behavior and selected visual mechanics into scoped `pbs-*` styles while preserving the target application's existing tokens.

These measurements establish the chosen architecture: a second, narrow authoring facade and only the browser-safe closures needed by the approved surfaces.

## 1. Executive Summary

Phase B converts the Phase-A capability browser into one professional authoring studio. The Canvas becomes the default route and the sole authority for the current editable document. Blueprint, Foundry, AMP Conveyor, Mutation Lab, Finish, Mentor, Library, and Diagnostics all read from or deliberately produce a new revision of that document.

The implementation ports proven source algorithms where their closures are browser-safe and bounded. Where a source UI is coupled to the root application, Phase B adapts the behavior into target-native React components. It does not import root UI code at runtime, copy the whole root adapter, introduce auth or cloud persistence, or advertise a control that is not functional.

## 2. Approved Product Model

### 2.1 Navigation and route truth

The route set and visible tab set are exactly:

```text
/studio/canvas
/studio/blueprint
/studio/foundry
/studio/amps
/studio/mutations
/studio/finish
/studio/mentor
/studio/library
/studio/diagnostics
```

`/`, `/studio`, missing tab values, and invalid tab values resolve to `/studio/canvas`. Direct links remain stable across reloads. The ordering and labels match the source tab contract. No tenth route, hidden duplicate editor, or Phase-A-only default survives the cutover.

### 2.2 One document authority

`PixelBrainStudio` owns one document controller for the active session. The controller contains the editable grid, layers, indexed palette, selection/tool state, revision, and normalized snapshot. High-frequency canvas operations may use a component-local mutable engine object for performance, but every committed command emits an immutable document revision and a deterministic normalized snapshot. There is no module-global document and no shadow copy owned by another tab.

All downstream actions obey this flow:

```text
Canvas command
  -> target authoring facade
  -> active grid/layers
  -> normalized snapshot + checksum
  -> PixelBrainStudio document controller
  -> Blueprint / Foundry / AMP / Mutation / Finish / Mentor / Library / Diagnostics
```

Accepted AMP or mutation output is installed as a new editor revision, normally on a named generated layer. Rejection is a no-op on the document. Foundry offers an explicit **Use in Canvas** action that creates a new document or imported layer; merely previewing a forge result never overwrites work.

### 2.3 Professional Canvas & Aseprite workspace

The desktop Canvas uses a stable three-pane editor composition:

```text
Document bar: New | Import | Undo | Redo | Grid | Symmetry | Export
Tool rail    | pixel canvas and native preview | Layers and indexed palette
Status bar: x/y | zoom | color | dimensions | grid | active layer | cell count
```

Required behavior:

- Pencil, eraser, and bounded fill tools, with `B`, `E`, and `G` shortcuts.
- Undo and redo through standard platform chords; space-drag pans without changing the active tool.
- Crisp integer pixel zoom with image smoothing disabled. A native-size preview remains available so zoomed editing cannot hide silhouette or cluster defects.
- Rectangular, isometric, hexagonal, circular, and Fibonacci construction-grid modes where supported by the source engine, plus explicit symmetry controls.
- A protected `00_Reference` layer and a professional default layer vocabulary: Structure, Energy, Focal, Shading, Glow, and Final. The user can rename, show/hide, lock, change opacity, reorder, duplicate, create, delete, and flatten layers. Destructive layer operations require an explicit action and remain undoable.
- An indexed palette dock with foreground/background colors, editable hexadecimal values, clear selected-color state, and a hard 32-color ceiling. Imports above the ceiling are deterministically reduced to 32 colors and report the reduction.
- Real PNG and Aseprite import/export. Round-trips must preserve dimensions, frame/layer order, visibility, opacity, palette indices where representable, and pixel content under the documented format limits.
- Icon-sized and native-size previews for professional cluster evaluation.
- Dense but quiet visual hierarchy using the standalone application's SWARD palette and typography. The canvas is dominant; secondary panels do not compete with it through glow, oversized headings, or decorative chrome.
- On narrow screens, the tool rail becomes a compact horizontal strip and the layer/palette docks become accessible drawers. The page itself must not create horizontal overflow.

### 2.4 Remaining tab responsibilities

- **Blueprint:** reference intake, sketch pad, construction guides, and a live Forge Gate. The gate produces explicit PASS/FAIL findings with measurable reasons and can hand an approved structure to Canvas.
- **Foundry:** retains Phase-A grass generation and adds governed upload/intake, analysis results, parameters, formula selection, duplicate detection, forge previews, and **Use in Canvas**. Controls must operate on real state; unavailable source-only services are omitted rather than simulated.
- **AMP Conveyor:** continues deterministic sparse selection and execution. Commit results become document revisions through the shared controller.
- **Mutation Lab:** retains immutable-baseline proposal, explicit accept/reject, and stale-base refusal. Accept writes a new document revision; reject does not mutate Canvas.
- **Material & Finish:** real shader preview/sandbox behavior, textures, deterministic style transmutation, and export of the rendered result. WebGL absence or shader compilation failure is a readable fault, never a blank panel.
- **Mentor & Reference:** computed critique metrics, prioritized corrections, reference study, and drills based on the active document. It must not imply an external AI service or fabricate analysis.
- **Library & Export:** explicit session library, locally kept artifacts, deterministic recipes/receipts, PNG export, and Aseprite export. Persistence occurs only after **Keep locally**; download and keep are separate actions.
- **Diagnostics:** document checksum/revision, Forge Gate evidence, adapter coverage, AMP and mutation receipts, export receipts, editor events, and a bounded terminal/fault ledger.

## 3. Functional Requirements and Acceptance Criteria

| ID | Requirement | Acceptance criterion |
|---|---|---|
| B1 | Exact nine-tab parity | The tab bar and route normalizer expose exactly the nine source tabs in source order; Canvas is the default for root and invalid paths. |
| B2 | Single active document | Every tab consumes the same revisioned document snapshot; AMP, mutation, forge, and finish commits enter it only through the document controller. |
| B3 | Professional editor mechanics | Painting, erasing, fill, pan/zoom, undo/redo, layers, palette editing, construction grids, symmetry, native preview, and status feedback are functional and keyboard-accessible. |
| B4 | Aseprite and PNG interoperability | Fixture-based differential and round-trip tests prove supported pixel, layer, frame, palette, opacity, and visibility fidelity. Invalid or oversized files return typed, visible faults. |
| B5 | Blueprint is live | Sketch and construction controls alter real blueprint state; Forge Gate emits deterministic PASS/FAIL evidence and approved output can enter Canvas. |
| B6 | Foundry is complete | Analysis, parameters, formula, duplicate inspection, preview, and Use in Canvas are wired to real target-local logic alongside grass generation. |
| B7 | Finish is functional | Shader preview and deterministic finish/transmutation produce inspectable output and downloadable artifacts; WebGL faults are explicit. |
| B8 | Mentor is evidence-based | Critique and drill suggestions are derived from active-document metrics and never claim unavailable services. |
| B9 | Library is deliberate | Keep locally, discard, download PNG, export Aseprite, and export recipe/receipt are distinct actions with deterministic metadata. |
| B10 | Diagnostics closes the loop | Current revision, checksum, gates, receipts, faults, and bounded terminal events are visible and correspond to actual actions. |
| B11 | Runtime isolation | Production target code has no imports from root `src/`, root `codex/`, Node filesystem APIs, root auth/database code, or server-only adapters. Source imports occur only in differential tests. |
| B12 | Professional responsive surface | Desktop layout preserves the three-pane editor; narrow layouts remain operable without page overflow; focus, contrast, labels, and reduced-motion behavior pass the project gates. |

## 4. Input and Resource Limits

Phase B preserves the source engine's defensive limits unless a stricter target-local limit is documented by a test:

- Normal working size: up to 160 x 144 pixels.
- Warning threshold: above 512 pixels on either axis.
- Hard dimension limit: 1024 pixels on either axis.
- Aseprite import limit: 512 x 512 pixels, 256 frames, 64 layers, and 262,144 decoded cells.
- Indexed palette: at most 32 colors after deterministic reduction.
- Undo history and terminal/event history are bounded in memory; the implementation plan must name and test the chosen caps.
- Imported names, formula labels, and diagnostic text are rendered as text, never injected HTML.

Work beyond a hard limit fails before expensive allocation and produces a stable bytecode fault with the violated limit.

## 5. Architecture and File Map

Phase B adds a separate authoring boundary; the Phase-A facade remains frozen at exactly its existing 14 exports.

```text
Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/
  studio-facade.js                         unchanged Phase-A public surface
  studio-state.js                          extended only through compatible helpers
  studio-authoring-facade.js               NEW browser-safe authoring boundary
  studio-document.js                       NEW revisioned document controller/core
  [measured editor, Aseprite, blueprint,
   forge-core, shader, and export modules]  local bounded closures only

Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/
  PixelBrainStudio.tsx                     shared controller and tab composition
  StudioTabBar.tsx                         exact nine-tab navigation
  studio-tabs.js                           exact source order/default contract
  authoring/
    DocumentBar.tsx
    ToolRail.tsx
    PixelCanvas.tsx
    LayerDock.tsx
    IndexedPaletteDock.tsx
    CanvasStatusBar.tsx
    NativePreview.tsx
  tabs/
    Canvas.tsx
    Blueprint.tsx
    Foundry.tsx                            completed legacy-backed functions
    AmpConveyor.tsx
    MutationLab.tsx
    Finish.tsx
    Mentor.tsx
    Library.tsx
    Diagnostics.tsx                       completed evidence surface

Pixel-Art-Studio-Skeleton/src/styles/pixelbrain.css
  scoped pbs-* editor, tab, responsive, focus, and fault styles
```

The file names above define responsibility, not permission to create empty shells. A component enters production only when its controls are connected to the authoring facade and covered by behavior tests.

### 5.1 Authoring facade boundary

`studio-authoring-facade.js` is the only production UI import path for editor/Aseprite, blueprint/forge, shader/finish, analysis, and export engines. It may expose grouped operations for:

- document creation, normalization, checksums, and asset-packet conversion;
- paint, erase, fill, symmetry, construction grids, and layer changes;
- PNG/Aseprite decode and encode;
- reference analysis, construction solving, and Forge Gate evaluation;
- deterministic shader/texture/style preview and export;
- critique metrics and export-recipe generation.

It may not expose database, auth, filesystem, root router, telemetry, or server request behavior. It may not re-export the root adapter.

### 5.2 Forge browser seam

The standalone forge executor is built from the pure `microprocessor-route.core.js` behavior and the specifically required target-local processors. Observed sampling that requires Node filesystem access is unavailable in the browser and must fail with an explicit capability fault. It must not be silently replaced with random or synthetic evidence.

Differential fixtures compare the target executor against the source for the overlapping deterministic route set. The large root forge closure is not copied merely to make imports resolve.

### 5.3 Deterministic finish seam

Style transmutation and finish outputs are keyed by input content, active document checksum, explicit style/school parameters, and versioned algorithm identity. Timestamps and `Date.now()` are not semantic cache or output keys. GPU preview is a view of deterministic inputs; exported pixels are verified independently of the preview chrome.

## 6. State, Persistence, and Safety

- The active session is memory-resident. No autosave to a server, database, or filesystem is added.
- **Keep locally** is explicit and uses bounded browser storage. A failed quota write leaves the active document intact and reports the fault.
- Downloads are user-directed exports and do not imply that an artifact was kept in the in-app library.
- Imports are parsed defensively before committing a document revision. A failed import cannot partially replace the current document.
- Undo/redo, mutation, and AMP acceptance use revision checks. A stale proposal is refused.
- Existing Phase-A manifest, planner, receipt, mutation, and diff contracts remain unchanged.
- No auth, accounts, telemetry, remote AI, or cloud deployment is introduced.

## 7. Visual and Accessibility Contract

The existing SWARD visual identity remains authoritative: near-black green surfaces, restrained acid-green accents, compact technical type, and direct squared geometry. Professional feel comes from spatial stability, hierarchy, precision, and feedback—not ornamental effects.

- Canvas receives the largest uninterrupted area at common desktop sizes.
- Primary controls are recognizable by icon plus accessible name; ambiguous controls retain visible text.
- Selected tool, layer, palette color, tab, focus, disabled, busy, PASS, FAIL, and fault states are visually distinct without depending on color alone.
- Every icon-only button has an accessible name and tooltip where its meaning is not universal.
- Keyboard focus is never clipped by panels or drawers.
- Reduced-motion preference disables nonessential transitions.
- Canvas pointer interaction has keyboard-accessible commands for core operations; exported data and diagnostics remain available as text.
- Native pixels are rendered without interpolation at integer scales.

Wholesale copying of the root `.pb-*` stylesheet is prohibited. Only scoped target styles required by shipped components may enter the bundle.

## 8. Error and Diagnostic Contract

Expected user faults remain inside their owning panel and are also appended to the bounded Diagnostics ledger. The minimum stable fault families are:

```text
PB-STUDIO-EDITOR-INPUT
PB-STUDIO-EDITOR-LIMIT
PB-STUDIO-ASEPRITE-DECODE
PB-STUDIO-ASEPRITE-ENCODE
PB-STUDIO-PNG-DECODE
PB-STUDIO-FORGE-GATE
PB-STUDIO-FORGE-CAPABILITY
PB-STUDIO-SHADER-COMPILE
PB-STUDIO-WEBGL-UNAVAILABLE
PB-STUDIO-EXPORT
PB-STUDIO-LOCAL-STORE
PB-STUDIO-STALE-REVISION
```

Faults include a short human explanation, operation, current revision where relevant, and deterministic details. Alerts, swallowed exceptions, blank canvases, and console-only failures do not satisfy the contract.

## 9. Verification Strategy

Implementation follows test-driven slices. Each behavior begins with a failing focused test and ends with current command output recorded in the PIR.

### 9.1 Contract and differential tests

- Exact nine-tab order, labels, feature homes, and Canvas normalization.
- Differential grid creation, paint, erase, bounded fill, layer operations, symmetry, and construction behavior against source modules.
- PNG and Aseprite fixture round-trips, including palette, visibility, opacity, frame/layer order, and raw pixel comparisons.
- Target forge-core results against the overlapping source route fixtures, including PASS, FAIL, blueprint evidence, PNG/VRI outputs, and unsupported observed-sampling refusal.
- Shader/finish determinism and export-byte stability for fixed inputs.
- Isolation scans proving target production files do not import root runtime or Node-only modules.

### 9.2 Component and interaction tests

- Paint, erase, fill, pan/zoom, undo/redo, tool shortcuts, active coordinates, and native preview.
- Layer create/rename/lock/visibility/opacity/reorder/duplicate/delete/flatten and undo safety.
- Palette select/edit, foreground/background, and deterministic reduction to 32 colors.
- Import success/failure atomicity and PNG/Aseprite export actions.
- Blueprint edit, construction changes, gate PASS/FAIL, and handoff to Canvas.
- Foundry analysis/formula/duplicate flow and Use in Canvas.
- AMP commit, mutation accept, rejected mutation no-op, and stale proposal refusal.
- Finish preview/export and WebGL/shader fault presentation.
- Mentor metrics tied to the active revision.
- Keep locally versus download semantics, discard, and restore.
- Diagnostics correspondence to real revisions, receipts, and faults.

### 9.3 Browser and visual verification

Run the real standalone app and exercise every route at desktop and narrow widths. Capture evidence for:

- initial Canvas route and full nine-tab navigation;
- professional three-pane hierarchy and dominant canvas;
- a complete paint -> layer -> palette -> export workflow;
- Aseprite import and export;
- Blueprint/Foundry handoff;
- accepted AMP or mutation entering Canvas and rejected mutation leaving it unchanged;
- Finish preview and an intentional readable fault;
- no horizontal page overflow, no clipped focus, no unexpected console errors, and crisp native pixels.

### 9.4 Repository gates

The minimum final gate is:

```text
target focused unit/differential/component suites
target npm test
target npm run typecheck
target npm run build
target npm run dev browser smoke
target production preview browser smoke
root source parity suite used by the port
git diff --check
```

Any unrelated repository baseline failure is recorded separately with exact evidence and cannot be used to erase a Phase-B failure.

## 10. Falsifiers

Phase B is not complete if any of the following is true:

- Fewer or more than nine tabs are routable, the order differs, or Canvas is not the default.
- Canvas is a decorative mockup, a second shadow document, or cannot complete a paint/layer/palette/import/export workflow.
- The editor looks polished but interpolates pixels, loses layer order, exceeds the 32-color contract, or corrupts Aseprite round-trips.
- AMP, mutation, forge, or finish output is displayed but cannot deliberately enter the active document.
- Rejected or stale mutation output changes the active document.
- Foundry or Diagnostics remains a Phase-A placeholder while the tab label implies the complete source feature home.
- A production target file imports the root UI, root adapter, root `codex/` path, Node filesystem, auth/database code, or server-only route.
- Forge observed sampling is fabricated or silently downgraded.
- Finish output depends semantically on wall-clock time or nondeterministic randomness.
- Local persistence happens without **Keep locally**.
- A control is present without behavior, a recoverable fault is visible only in the console, or any tab crashes the shell.
- Desktop or narrow browser checks show page-level horizontal overflow, inaccessible controls, clipped focus, unreadable state, or unexpected console errors.

## 11. Out of Scope / Non-Goals

- Modifying or retiring the root application's `/pixelbrain/studio` route.
- Importing source files across application boundaries in production.
- A wholesale root-adapter or root-stylesheet copy.
- Cloud sync, collaboration, accounts, auth, telemetry, remote AI critique, or server persistence.
- Unlimited image dimensions, layers, frames, palette size, history, or diagnostic retention.
- New frozen AMP/mutation contracts or changes to the Phase-A 14-function facade.
- Pretending unsupported observed sampling or external services are available.
- Pixel-identical visual parity with the older root page. Behavioral parity and professional target-native hierarchy are the acceptance standard.

## 12. Rollback and Migration

No data migration or database schema change is required. Phase B is additive inside the standalone application except for changing its default route to Canvas and extending its in-memory/local document format. Any locally kept Phase-A artifacts must be normalized through a versioned loader; invalid records are left untouched and reported, never destructively rewritten.

Rollback consists of reverting the Phase-B commits. The Phase-A facade/core and the root application remain independently usable.

## 13. Implementation Sequence

The implementation plan must preserve these reviewable stages:

1. Freeze nine-tab and document-controller tests; introduce Canvas default routing.
2. Port editor/grid/layer/palette behavior and build the professional Canvas shell.
3. Add PNG/Aseprite import/export with fixture differentials and resource guards.
4. Add Blueprint and the browser-safe forge-core seam.
5. Complete Foundry and connect explicit Use in Canvas.
6. Connect AMP and Mutation results to document revisions.
7. Add Finish, Mentor, and Library behavior.
8. Complete Diagnostics, responsive/accessibility polish, and cross-tab browser workflows.
9. Run all gates, write the PIR, and update PDR lifecycle status only after evidence passes.

Each stage must leave the standalone application runnable. Empty route shells do not count as a stage.

## 14. Definition of Done

Phase B is implemented only when:

- all B1-B12 acceptance criteria pass;
- the nine-tab standalone application is usable without the root app running;
- a user can create or import pixel art, edit it professionally, pass it through approved PixelBrain operations, inspect evidence, keep it locally by choice, and export reproducible PNG/Aseprite deliverables;
- differential, interaction, type, build, development-browser, and production-browser gates are current and green;
- the PIR records exact commands, outcomes, screenshots/artifacts, known limits, and any unrelated baseline failures;
- this PDR and the archive index are updated from Approved to Implemented only after those gates pass.

## 15. Approval Record

- 2026-09-06: Angel approved Phase B implementation.
- 2026-09-06: Angel approved Canvas as the default route and directed that the Aseprite tab have a professional feel.
- 2026-09-06: Angel approved the narrow browser-safe authoring facade, one-document authority, professional three-pane Canvas, explicit local persistence, and full verification/falsifier design.
