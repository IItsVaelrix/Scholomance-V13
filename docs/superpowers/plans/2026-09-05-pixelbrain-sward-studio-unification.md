# PixelBrain SWARD Studio Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `/pixelbrain` route a SWARD-derived, tabbed authoring studio whose generated capability manifest covers every PixelBrain AMP/effect and isolates mutating operations in a transactional Mutation Lab.

**Architecture:** Keep the root React 18 application authoritative and reuse the existing `PixelBrainPage` state/handlers and `pixelbrain.adapter.js` boundary. Add pure Studio manifest, planning, and mutation-transaction modules under `codex/core/pixelbrain/studio/`, expose browser-safe data through the existing adapter, and reshape the current page into stable tabs without embedding the separate App Builder project.

**Tech Stack:** Node 20 ESM, React 18, React Router 7, Framer Motion, Vitest 4, Playwright, existing PixelBrain core and TemplateEditor.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-sward-studio-unification-pdr.md`

## Global Constraints

- Same input, seed, manifest, and options must produce byte-identical plans and checksums.
- React UI imports PixelBrain behavior only through `src/lib/pixelbrain.adapter.js`.
- Unsaved artwork stays in browser memory/local storage; no background server persistence.
- Mutation operations never change the baseline until the user explicitly accepts the candidate.
- The generated effect catalog is the coverage denominator; `amp-registry.js` is not an inventory.
- Preserve the existing PixelBrain route until the new Studio parity surface is verified.
- Do not stage or overwrite unrelated dirty-worktree changes.

---

### Task 1: Exhaustive Studio manifest contract and generator

**Files:**
- Create: `codex/core/pixelbrain/studio/studio-amp-manifest.schema.js`
- Create: `codex/core/pixelbrain/studio/studio-amp-manifest.generated.js`
- Create: `scripts/generate-pixelbrain-studio-manifest.mjs`
- Modify: `scripts/pixelbrain-effect-catalog.mjs`
- Modify: `package.json`
- Test: `tests/codex/core/pixelbrain/studio/studio-amp-manifest.test.js`

**Interfaces:**
- Consumes: `buildEffectCatalog()` returning `{ amps, generators, summary }`.
- Produces: `STUDIO_AMP_RECORDS`, `validateStudioAmpManifest(records, catalogPaths)`, and `npm run studio:manifest:{gen,check}`.

- [ ] Write a failing test proving every catalog AMP path occurs exactly once, classifications are closed, ids are unique, mutation records target `mutations`, and no record is blocked.
- [ ] Run `npx vitest run tests/codex/core/pixelbrain/studio/studio-amp-manifest.test.js` and confirm the missing-module failure.
- [ ] Export the catalog builder, implement frozen record validation and deterministic generation, generate the checked-in manifest, and add scripts.
- [ ] Re-run the targeted test and `npm run studio:manifest:check` to green.

### Task 2: Deterministic plan and mutation transaction contracts

**Files:**
- Create: `codex/core/pixelbrain/studio/studio-amp-planner.js`
- Create: `codex/core/pixelbrain/studio/studio-mutation-transaction.js`
- Test: `tests/codex/core/pixelbrain/studio/studio-amp-planner.test.js`
- Test: `tests/codex/core/pixelbrain/studio/studio-mutation-transaction.test.js`

**Interfaces:**
- Produces: `createStudioAmpPlan({ snapshotChecksum, records, selectedIds })`, `createMutationCandidate(base, result, ampId)`, `acceptMutation(current, transaction)`, and `rejectMutation(current, transaction)`.

- [ ] Write failing tests for deterministic ordering, stable skip reasons, write-conflict refusal, immutable candidate creation, stale-base refusal, and reject no-op identity.
- [ ] Run both test files and confirm missing-module failures.
- [ ] Implement the minimal pure contracts with recursive freezing and canonical SHA-256 checksums.
- [ ] Re-run both files and the 100-repeat determinism case to green.

### Task 3: Browser-safe Studio adapter surface

**Files:**
- Modify: `src/lib/pixelbrain.adapter.js`
- Test: `tests/lib/pixelbrain-studio-adapter.test.js`

**Interfaces:**
- Produces: `getStudioAmpManifest()`, `planStudioAmps(input)`, `beginStudioMutation(input)`, `acceptStudioMutation(input)`, and `rejectStudioMutation(input)`.

- [ ] Write a failing adapter test that reads the full manifest, plans known AMP ids, and verifies reject preserves the original snapshot.
- [ ] Run the test and confirm the new exports are missing.
- [ ] Add explicit imports/exports through the existing adapter; do not create a second UI-to-core bridge.
- [ ] Re-run the adapter and existing PixelBrain adapter tests.

### Task 4: Native Studio shell and tab semantics

**Files:**
- Create: `src/pages/PixelBrain/studio/studio-tabs.js`
- Create: `src/pages/PixelBrain/studio/StudioTabBar.jsx`
- Create: `src/pages/PixelBrain/studio/StudioTabBar.css`
- Modify: `src/pages/PixelBrain/PixelBrainPage.jsx`
- Modify: `src/pages/PixelBrain/PixelBrainPage.css`
- Test: `tests/pages/pixelbrain-studio-shell.test.jsx`

**Interfaces:**
- Produces: nine deep-linkable tab ids and `StudioTabBar({ activeTab, onSelect })` with ARIA tab semantics and local URL/hash restoration.

- [ ] Write failing UI tests for all nine tabs, arrow-key roving focus, selected panel state, and stable URL hash.
- [ ] Run the shell test and confirm the tabs do not exist.
- [ ] Implement the SWARD visual token layer and tab shell around existing PixelBrain state without deleting handlers.
- [ ] Re-run the shell test and inspect the desktop/mobile structure.

### Task 5: Canvas, Blueprint, Foundry, Finish, Mentor, Library, and Diagnostics parity homes

**Files:**
- Modify: `src/pages/PixelBrain/PixelBrainPage.jsx`
- Modify: `src/pages/PixelBrain/PixelBrainPage.css`
- Test: `tests/pages/pixelbrain-studio-parity.test.jsx`

**Interfaces:**
- Consumes: existing `TemplateEditor`, `LayerStackPanel`, `IndexedPalettePanel`, `ReferencePanel`, `ForgeGatePanel`, `MentorCritiquePanel`, and `PixelBrainTerminal` callbacks.
- Produces: one stable home for every legacy surface named in PDR §7.1.

- [ ] Write a failing parity test that asserts every legacy surface is reachable from exactly one Studio tab.
- [ ] Run the parity test and confirm missing homes.
- [ ] Move the existing rendered surfaces behind tab panels while preserving the same callbacks and editor ref.
- [ ] Re-run parity and existing page/component tests.

### Task 6: AMP Conveyor and transactional Mutation Lab

**Files:**
- Create: `src/pages/PixelBrain/studio/AMPConveyorPanel.jsx`
- Create: `src/pages/PixelBrain/studio/MutationLabPanel.jsx`
- Create: `src/pages/PixelBrain/studio/StudioAmpPanels.css`
- Modify: `src/pages/PixelBrain/PixelBrainPage.jsx`
- Modify: `src/pages/PixelBrain/components/TemplateEditor.jsx`
- Test: `tests/pages/pixelbrain-studio-amp-panels.test.jsx`
- Test: `tests/qa/pixelbrain/studio-amp-execution.test.js`

**Interfaces:**
- Consumes: exhaustive Studio manifest, existing `TemplateEditor.applyAMP/previewAMP`, deterministic plan, and mutation transaction APIs.
- Produces: searchable grouped capability list, activated/skipped receipts, direct verified editor actions, workflow routing for runtime/support capabilities, and candidate accept/reject for every mutation record.

- [ ] Write failing UI and execution tests for full manifest visibility, no mutation in the Conveyor, preview/commit receipts, and reject-no-op.
- [ ] Run tests and confirm failures on absent panels.
- [ ] Implement panels and extend editor command routing for manifest-declared editor mutations; route other records to their owning Studio home with an explicit execution context.
- [ ] Re-run targeted tests and existing Aseprite/editor QA.

### Task 7: Rollout flags, accessibility, performance, and regression gates

**Files:**
- Modify: `src/pages/PixelBrain/PixelBrainPage.jsx`
- Modify: `src/pages/PixelBrain/PixelBrainPage.css`
- Create: `tests/visual/pixelbrain-studio.spec.js`
- Create: `tests/visual/pixelbrain-studio-a11y.spec.js`
- Test: `tests/pages/pixelbrain-studio-rollout.test.jsx`

**Interfaces:**
- Produces: `VITE_PIXELBRAIN_STUDIO_V1` safe default-on local behavior, legacy escape hatch, responsive tab rail, reduced-motion behavior, and performance marks for manifest/plan operations.

- [ ] Write failing rollout/a11y tests for the flag, legacy fallback, tab panel labelling, and no colour-only status.
- [ ] Run targeted tests and confirm failures.
- [ ] Add the reversible rollout seam and accessibility behaviors; keep all draft state client-side.
- [ ] Run targeted Vitest and Playwright Studio tests.

### Task 8: Full verification, PDR closure, and PIR

**Files:**
- Modify: `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-sward-studio-unification-pdr.md`
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260905-PIXELBRAIN-SWARD-STUDIO-UNIFICATION.md`

**Interfaces:**
- Produces: measured coverage counts, exceptions, commands, visual evidence, and rollback status.

- [ ] Run `npm run studio:manifest:check`, targeted Studio tests, existing PixelBrain/AMP tests, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:qa`, and Studio Playwright tests.
- [ ] Inspect desktop and mobile screenshots plus representative 1×/8× asset renders.
- [ ] Re-read every PDR Definition-of-Done checkbox against evidence and leave any unmet item unchecked.
- [ ] Write the PIR with exact results and update PDR status only to the level the evidence supports.
