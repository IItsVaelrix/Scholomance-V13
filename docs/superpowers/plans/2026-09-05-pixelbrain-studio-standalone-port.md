# PixelBrain Studio Standalone Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved four-tab PixelBrain Studio Phase A run as an independent TanStack Start application with all 54 Studio adapters locally executable and source-equivalent.

**Architecture:** Mirror the source adapter dependency closure byte-for-byte into the target app, expose it through a 14-function local facade, and place a browser-local immutable snapshot/ledger shell around the ported panels. TanStack routes expose only Foundry, AMP Conveyor, Mutation Lab, and Diagnostics; no production import crosses back into root `codex/` or the main React app.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, JavaScript ESM, Tailwind v4 plus scoped CSS, Node test runner, Playwright/Chromium.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-studio-standalone-port-pdr.md`

## Global Constraints

- Implement Phase A only: `foundry`, `amps`, `mutations`, and `diagnostics`; Phase B remains deferred.
- Preserve all 104 mirrored core files byte-for-byte; do not add preambles or reformat them.
- Production target code must not import root `codex/`, root `src/lib/pixelbrain.adapter.js`, or root `src/pages/PixelBrain/`.
- Keep the root application's `/pixelbrain/studio` route and files unchanged.
- Keep auth, accounts, database persistence, server persistence, telemetry, and cloud autosave off.
- Browser-local receipts and faults are capped at 20 entries.
- Use Foundry as the root, missing-tab, and invalid-tab fallback.
- Preserve the target's existing SWARD palette, fonts, and quiet form-first hierarchy; do not redesign the source panels.
- Every behavior change follows red-green-refactor; every completion claim requires fresh test, typecheck, build, and rendered-browser evidence.

## UI Spec and Visual Plan

**Components:** `PixelBrainStudio`, `StudioTabBar`, `Foundry`, `AmpConveyor`, `MutationLab`, `Diagnostics`, and `ExtensionSelector` under `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/`.

**World-law connection:** the shell makes deterministic lattice transformation visible as a workshop sequence: grow a field, plan an AMP, isolate a mutation, then inspect its checksum evidence. Diagnostics exists as the visible consequence of “bytecode is truth,” not decorative dashboard chrome.

**Data consumed:** the local facade's frozen manifest, plan/receipt/diff contracts, grass result, immutable working snapshot, and browser-local receipt/fault ledgers. No event bus, server state, auth state, or external API is consumed.

**State:** component-local React state owns snapshot lineage, selected tab, job progress, candidate mutation, receipts, and faults. The existing Foundry local library remains explicit browser-local persistence. No module-scoped mutable UI state is introduced.

**Accessibility:** semantic tablist/tab/panel relationships; arrow, Home, and End navigation; labelled controls; live job/fault status; visible focus; non-color verdict text; 40px minimum targets; mobile no-overflow; global reduced-motion rule retained.

**School theming:** none. This is the SWARD workshop surface, so it consumes the target's established charcoal, leaf, and parchment-neutral tokens without inventing a second school palette.

**Animation:** no autonomous entrances or decorative motion. Hover/focus transitions are 150–200ms and the existing reduced-motion override collapses them.

**Regression risk:** route generation, dynamic adapter chunks, Tailwind reset interaction, target root typography, grass canvas rendering, small-screen tab scrolling, and mutation button enablement. Task 4/5 Playwright checks cover these surfaces.

**Color:** `#0c0e0b` field, `#141712` raised plane, `#1a1e17` selected plane, `#e8ebe4` primary ink, `#99a192` secondary ink, and `#9cba7a` leaf accent. These are the target's existing SWARD colors, not a new aesthetic.

**Type:** Fraunces for the restrained workshop title, Figtree for controls/copy, and IBM Plex Mono only for checksums, counts, and receipts.

**Layout:** one continuous workshop frame with a narrow header and horizontally scrollable tab rail; each tab owns a fluid workbench grid that collapses to one column on mobile.

```text
desktop: [ SWARD / PIXELBRAIN | immutable checksum ]
         [ Foundry | AMP Conveyor | Mutation Lab | Diagnostics ]
         [ controls / manifest ][ dominant work area ][ evidence ]

mobile:  [ title + checksum ]
         [ horizontally scrollable tabs ]
         [ primary work area ]
         [ controls ]
         [ evidence ]
```

**Principles:** output and evidence dominate; controls stay compact; one leaf accent identifies action/focus; panels are planes rather than floating cards; exact source behavior wins over ornamental polish. This is deliberately specific to a deterministic pixel-field workshop and avoids generic dashboard metrics, gradients, glows, and motion.

---

### Task 1: Repair the test harness and mirror the executable core

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/tests/pixelbrain-port-differential.test.mjs`
- Modify: `Pixel-Art-Studio-Skeleton/package.json`
- Modify: `Pixel-Art-Studio-Skeleton/tsconfig.json`
- Create: 101 closure files under `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/microprocessors/arena/arena-tick.processor.js`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/constants/schools.js`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/quantization/turboquant.js`

**Interfaces:**
- Consumes: source modules under `codex/core/` as the differential oracle.
- Produces: a target-local mirror whose `studio/studio-amp-adapter-registry.js` loads all 54 adapters without a root-repository runtime import.

- [ ] **Step 1: Write the failing closure test**

The test recursively follows literal relative imports from the ten approved entry files, asserts the hand-verified closure size of 104, and compares every source byte with its mapped target path. If a target file is absent, use `assert.fail("missing mirrored file: ...")` so RED is an assertion failure rather than an unresolved import error.

```js
test('mirrors the complete 104-file Studio execution closure byte-for-byte', () => {
  const closure = collectClosure(SOURCE_ENTRIES);
  assert.equal(closure.length, 104);
  for (const sourcePath of closure) {
    const targetPath = targetForSource(sourcePath);
    assert.equal(existsSync(targetPath), true, `missing mirrored file: ${targetPath}`);
    assert.deepEqual(readFileSync(targetPath), readFileSync(sourcePath));
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd Pixel-Art-Studio-Skeleton && node --test tests/pixelbrain-port-differential.test.mjs`

Expected: FAIL with `missing mirrored file`, proving the target closure is absent.

- [ ] **Step 3: Repair the baseline runner and copy the closure mechanically**

Change the quoted recursive glob in `npm test` to executable explicit globs and append `node --test tests/*.test.mjs`. Set `checkJs` to `false` so TypeScript does not reinterpret byte-identical JavaScript copies while retaining strict checks for TypeScript. Copy only files returned by the closure walk, mapping `codex/core/pixelbrain/*` to `src/lib/pixelbrain/*` and the three sibling roots to their corresponding `src/lib/*` locations.

- [ ] **Step 4: Add real source-versus-port execution witnesses**

Extend the test to import both registries/executors, load all 54 adapters, execute every non-support record twice in both trees against the literal baseline snapshot, exercise each support inspector, and compare outputs, diffs, and receipts with `assert.deepStrictEqual`.

- [ ] **Step 5: Run Task 1 gates**

Run: `cd Pixel-Art-Studio-Skeleton && npm test`

Expected: all pre-existing script/auth tests and the port differential suite PASS.

Run: `cd Pixel-Art-Studio-Skeleton && npm run typecheck`

Expected: PASS.

### Task 2: Extract the exact facade and browser-local state seam

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/tests/studio-facade.test.mjs`
- Create: `Pixel-Art-Studio-Skeleton/tests/studio-state.test.mjs`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-facade.js`
- Create: `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-state.js`

**Interfaces:**
- Produces facade functions: `getStudioAmpManifest`, `planStudioAmps`, `getStudioAdapterCoverage`, `inspectStudioSupportExecution`, `previewStudioAmpExecution`, `commitStudioAmpExecution`, `proposeStudioMutationExecution`, `createStudioAssetSnapshot`, `getStudioGrassDefaults`, `getStudioGrassPalettes`, `generateStudioGrass`, `beginStudioMutation`, `acceptStudioMutation`, `rejectStudioMutation`.
- Produces state functions: `createStandaloneSnapshot()`, `advanceStandaloneSnapshot(current, output, receipt)`, `installAcceptedMutation(current, accepted)`, and `appendStudioLedger(current, entry, limit = 20)`.

- [ ] **Step 1: Write facade and state RED tests**

Assert the exact sorted 14-name facade surface, 54 frozen manifest records, no forbidden source imports, deterministic empty snapshot checksum, immutable parent linkage on commit, accepted mutation lineage, rejection identity, and a 20-entry cap.

```js
assert.deepEqual(Object.keys(facade).sort(), EXPECTED_FACADE_EXPORTS);
assert.equal(facade.getStudioAmpManifest().length, 54);
assert.equal(appendStudioLedger(Array.from({ length: 20 }, (_, id) => ({ id })), { id: 20 }).length, 20);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd Pixel-Art-Studio-Skeleton && node --test tests/studio-facade.test.mjs tests/studio-state.test.mjs`

Expected: FAIL because both target modules are absent.

- [ ] **Step 3: Implement the minimal facade and state seam**

Extract only the approved functions from the root adapter. `createStandaloneSnapshot()` calls `createStudioAssetSnapshot` over a literal 32×32 empty rectangular grid. `advanceStandaloneSnapshot` retains compatible lattice fields, stores output under `data`, and advances to `receipt.outputChecksum`; `installAcceptedMutation` overlays candidate metadata on the prior snapshot; ledger appends freeze copies and keeps the newest 20.

- [ ] **Step 4: Run Task 2 gates**

Run: `cd Pixel-Art-Studio-Skeleton && node --test tests/studio-facade.test.mjs tests/studio-state.test.mjs`

Expected: PASS.

### Task 3: Add the four-tab route contract and shell state

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/tests/studio-router.test.mjs`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/studio-tabs.js`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/StudioTabBar.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/PixelBrainStudio.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/routes/index.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/routes/studio.index.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/routes/studio.$tab.tsx`
- Generated: `Pixel-Art-Studio-Skeleton/src/routeTree.gen.ts`

**Interfaces:**
- Produces `PHASE_A_STUDIO_TABS`, `normalizeStudioTab(value)`, and `isStudioTab(value)`.
- `PixelBrainStudio` consumes a normalized tab and `onTabChange(tab)` and owns current snapshot, receipt ledger, and fault ledger in React state.

- [ ] **Step 1: Write route-normalization RED tests**

Use literal expectations for the four IDs, Foundry fallback, and absence of all six Phase-B IDs.

```js
assert.deepEqual(PHASE_A_STUDIO_TABS.map(({ id }) => id), ['foundry', 'amps', 'mutations', 'diagnostics']);
assert.equal(normalizeStudioTab('canvas'), 'foundry');
assert.equal(normalizeStudioTab('mutations'), 'mutations');
```

- [ ] **Step 2: Run and verify RED**

Run: `cd Pixel-Art-Studio-Skeleton && node --test tests/studio-router.test.mjs`

Expected: FAIL because the tab contract does not exist.

- [ ] **Step 3: Implement tab contract and TanStack routes**

Use `Navigate` for `/` and `/studio/`. The dynamic route validates `$tab`; invalid values render a replace navigation to `/studio/foundry`. The tab bar provides `role="tablist"`, roving focus, arrow/Home/End keys, visible focus, and `aria-controls` links.

- [ ] **Step 4: Implement shell state only**

The shell starts with `createStandaloneSnapshot()`, keeps the newest 20 receipts/faults, advances snapshot after non-mutation commit, installs accepted mutation lineage, and passes read-only evidence to Diagnostics. No effect sends artwork or receipts to a server.

- [ ] **Step 5: Run Task 3 gates**

Run: `cd Pixel-Art-Studio-Skeleton && npm test && npm run typecheck`

Expected: PASS.

### Task 4: Port Foundry, Conveyor, Mutation Lab, and Diagnostics

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/tests/visual/studio-tabs.spec.mjs`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Foundry.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/AmpConveyor.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/MutationLab.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/tabs/Diagnostics.tsx`
- Create: `Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/ExtensionSelector.tsx`

**Interfaces:**
- Foundry consumes the local facade's grass defaults, palettes, and generator.
- Conveyor consumes snapshot and emits `onCommit(result)`, `onReceipt(receipt)`, and `onFault(message)`.
- Mutation Lab consumes snapshot and emits `onAccept(accepted, receipt)`, `onReceipt(receipt)`, and `onFault(message)`.
- Diagnostics consumes manifest coverage, snapshot, receipts, and faults read-only.

- [ ] **Step 1: Write failing browser behavior tests**

The Playwright suite starts from `/studio/foundry` and asserts four tabs only, keyboard navigation, deterministic grass dimensions, one real grass preview receipt, Mutation accept/reject disabled before proposal, Diagnostics coverage `54 / 54`, mobile no-horizontal-overflow, and no uncaught console errors.

- [ ] **Step 2: Run the focused browser test and verify RED**

Run: `cd Pixel-Art-Studio-Skeleton && npx playwright test tests/visual/studio-tabs.spec.mjs --reporter=line`

Expected: FAIL because the route and panels do not render yet.

- [ ] **Step 3: Port the three source panels minimally**

Translate the source panels to typed target components, change only facade/component imports, keep source action labels and ARIA live regions, and use the installed Lucide `Palette`, `Monitor`, `Zap`, and `Check` icons in the selector. Keep all AMP errors visible as `PB-STUDIO-*` fault strings and forward them to the fault ledger.

- [ ] **Step 4: Author the read-only Diagnostics surface**

Show total/covered/missing/extra adapter counts, current checksum/parent/mutation AMP, the five newest receipts, and the five newest faults or rejections. Do not provide mutation controls from Diagnostics.

- [ ] **Step 5: Run Task 4 unit/type gates**

Run: `cd Pixel-Art-Studio-Skeleton && npm test && npm run typecheck`

Expected: PASS.

### Task 5: Scope the source styling and prove rendered behavior

**Files:**
- Create: `Pixel-Art-Studio-Skeleton/src/styles/pixelbrain.css`
- Modify: `Pixel-Art-Studio-Skeleton/src/routes/__root.tsx`
- Modify: `Pixel-Art-Studio-Skeleton/src/styles.css`
- Create/update: `Pixel-Art-Studio-Skeleton/screenshots/`

**Interfaces:**
- The stylesheet applies only below `.pb-studio-standalone`; target global Tailwind chrome remains unchanged.

- [ ] **Step 1: Add a CSS-leak assertion to the browser suite and verify RED**

Mount the route, assert body/root computed typography and background remain the target tokens, and assert the Studio panels use the expected SWARD surface/accent values. The test fails before the scoped stylesheet exists.

- [ ] **Step 2: Port the smallest complete CSS slice**

Copy/adapt the source `.pb-studio-*`, `.pb-grass-*`, `.pb-amp-*`, mutation, receipt, and extension rules under `.pb-studio-standalone`. Use the existing `--color-*`, `--font-*`, radius, and spacing tokens; preserve the source's quiet green/charcoal language. All controls receive visible focus and at least a 40px hit target; the 390px layout has no horizontal overflow; reduced motion remains global.

- [ ] **Step 3: Run browser interaction and screenshot verification**

Run `sh startup.sh`, then run the focused Playwright suite. Run `node scripts/browser-smoke.mjs`, inspect both desktop and mobile PNGs, and compare the overlapping Foundry/Mutation surfaces against the existing root-app source snapshots.

- [ ] **Step 4: Build and smoke production output**

Run: `npm run build && npm run preview:restart`

Then run the smoke tool against `http://127.0.0.1:8091` with the dev verdict as baseline. Expected: visible content in both viewports, no console errors, and no dev/production structural divergence.

### Task 6: Close documentation and final gates

**Files:**
- Modify: `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-studio-standalone-port-pdr.md`
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260905-PIXELBRAIN-STUDIO-STANDALONE-PORT.md`

**Interfaces:**
- PIR records exact closure hash evidence, 54-adapter differential results, facade isolation, route/render results, CSS audit, build output, and Phase B deferral.

- [ ] **Step 1: Run all fresh final gates**

Run from the target: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, dev browser smoke, production browser smoke, and focused Playwright interaction tests.

Run from repository root: `git diff --check` and a path audit proving no main-app Studio source changed.

- [ ] **Step 2: Write the evidence-backed PIR**

Record exact pass counts, output checksums, screenshot paths, bundle result, known baseline exceptions, and explicitly state that the six Phase-B tabs remain deferred.

- [ ] **Step 3: Mark the PDR Implemented only if every Phase-A gate passed**

Change PDR status from `Approved`/`In Progress` to `Implemented`; update the archive catalog status to match. If any required gate remains red, leave status `In Progress` and describe the blocker without a completion claim.

- [ ] **Step 4: Stage only implementation-owned paths and commit**

Use explicit `git add --` paths for the target app files, plan, PDR/catalog, and PIR. Do not stage `dead-code.md`, `scd64-index.json`, unrelated PDRs/assets, or other pre-existing changes.
