# PDR: PixelBrain Studio Standalone Port

**Status:** Implemented — corrected Phase A scope shipped on 2026-09-05; all scoped unit, type, build, dev-browser, and production-browser gates pass. Phase B was separately authorized by `2026-09-06-pixelbrain-studio-standalone-phase-b-pdr.md`.
**Classification:** Architectural | Behavioral | PixelBrain | Studio migration | Standalone app
**Priority:** Critical
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-STUDIO-STANDALONE-PORT-2026-09-05`

## Owner(s)

- **Codex:** sole implementation owner — facade extraction, router/shell wiring, component/CSS port, build/startup contract for the target app. Same explicit exception to this repo's usual three-tool split as the companion PDR below, at Angel's direction.
- **Escalation owner:** Angel (repository owner).

## Context

The companion PDR (`2026-09-05-pixelbrain-sward-studio-unification-pdr.md`, implemented) built the real PixelBrain Studio — a 54-capability manifest, static per-AMP adapters, deterministic planning with conflict refusal, an isolated Mutation Lab, and the literal SWARD grass algorithm port — as a new route (`/pixelbrain/studio`) **inside the existing root React 18 application**, behind `<AdminRoute>`. That PDR's own Non-Goals explicitly chose this: "Embedding or deploying `Pixel-Art-Studio-Skeleton/` as a second application... Do not embed the separate TanStack/React-19 App Builder project in the React-18 root app." That choice was never challenged during that PDR's review.

It does not satisfy the original ask this whole effort started from: "wire everything to this, and make it run the way divtube runs. As a separate app that can be visually inspected." A tab buried inside the main multi-purpose Scholomance web app, gated behind admin auth, sharing that app's build/deploy lifecycle, is not a standalone, always-inspectable tool. `Pixel-Art-Studio-Skeleton/` — the app this whole effort started from, now running locally on its own (`startup.sh` fixed, dev server on `:8090`) — still shows only the original SWARD grass-only prototype. None of the manifest/adapter/Mutation Lab work is reachable from it.

This PDR ports the already-fulfilled Studio logic — verified, working, tested — into `Pixel-Art-Studio-Skeleton/` as its new native surface, replacing its grass-only `Studio.tsx`. It is a port, not a redesign: the target is to relocate working capability into a genuinely standalone shell, not to rebuild it.

### What is actually portable, measured

- `codex/core/pixelbrain/studio/*.js` (manifest schema/generated, planner, execution, mutation-transaction, adapter registry) and `codex/core/pixelbrain/grass-{amp,engine,palettes,types}.js`: **zero React or DOM imports** (grep-verified). Pure logic, already framework-agnostic. The execution registry is not self-contained, however: its 54 static adapter imports expand to a measured closure of **104 local files** (101 under `codex/core/pixelbrain/` plus one each under `codex/core/{microprocessors,constants,quantization}/`). Full execution therefore requires a byte-identical local mirror of that closure, not only the ten initially named entry files.
- `src/lib/pixelbrain.adapter.js`: the Studio-relevant exports (`getStudioAmpManifest`, `planStudioAmps`, `getStudioAdapterCoverage`, `inspectStudioSupportExecution`, `previewStudioAmpExecution`, `commitStudioAmpExecution`, `proposeStudioMutationExecution`, `createStudioAssetSnapshot`, `getStudioGrassDefaults`, `getStudioGrassPalettes`, `generateStudioGrass`, `beginStudioMutation`, `acceptStudioMutation`, `rejectStudioMutation`) are a small, identifiable slice of a ~900-line file that **also** imports `engine.adapter.js` and `photonic-retina/index.js` for unrelated pages. The whole file does not port cleanly; the Studio slice does, once extracted into its own facade module.
- `src/pages/PixelBrain/studio/*.{jsx,js}` (806 lines: `AmpConveyorPanel`, `GrassFoundryPanel`, `MutationLabPanel`, `StudioTabBar`, `StudioTabSurface`, `PixelBrainStudioPage`, `PixelBrainEntryPage`, `studio-tabs.js`, `studio-flags.js`): genuinely new Studio-native code. The Phase-A panels couple to the adapter facade; `AmpConveyorPanel` also imports the legacy `ExtensionSelector`, and the page-level files use `react-router-dom`. The target uses `@tanstack/react-router` and already ships Lucide icons, so the selector is adapted to target-native React/Lucide while preserving its selection behavior and the three Studio panels are otherwise ported without redesign.
- The 6 tabs Studio reuses from the pre-existing legacy PixelBrain page (Canvas/Aseprite, Blueprint, Material & Finish, Mentor & Reference, Library & Export, Diagnostics) are backed by 13 components in `src/pages/PixelBrain/components/` (plus `FormulaLibrary.jsx` and `PixelBrainPage.jsx` itself) — **measured, not assumed**: 11 of 13 import only React hooks and are props-driven; 2 (`ForgeGatePanel.jsx`, `MentorCritiquePanel.jsx`) reference `PixelBrainPage`/`usePixelBrain`/`PixelBrainContext` and need that coupling resolved before they port.
- Styling: neither the legacy page nor the new Studio tabs use Tailwind — both are styled by one hand-authored `PixelBrainPage.css` (2,517 lines, class-name driven: `.pb-studio-*`, `.pb-grass-*`, etc.), despite the target app (`Pixel-Art-Studio-Skeleton`) using Tailwind v4 elsewhere. Porting means bringing the relevant CSS over as plain CSS alongside the components, not a Tailwind rewrite — one consistent story for every tab, not two.

## Target Integration Area

- `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/` (new) — the byte-identical PixelBrain portion of the measured 104-file execution closure and a new, Studio-only facade extracted from `pixelbrain.adapter.js`.
- `Pixel-Art-Studio-Skeleton/src/lib/{microprocessors,constants,quantization}/` (new) — the three byte-identical sibling files required to preserve the source registry's relative imports without rewriting frozen core files.
- `Pixel-Art-Studio-Skeleton/src/components/studio/` — replaces `Studio.tsx` (SWARD-only) with the four-tab Phase-A shell; the SWARD grass UI becomes the Foundry tab's content, not the whole app.
- `Pixel-Art-Studio-Skeleton/src/routes/` — TanStack Start file routes replacing `react-router-dom` usage from the ported page-level components.
- `Pixel-Art-Studio-Skeleton/src/styles/pixelbrain.css` (new) — the ported slice of `PixelBrainPage.css`.
- Source (read-only for this PDR, not modified): `codex/core/pixelbrain/studio/`, `codex/core/pixelbrain/grass-*.js`, `src/lib/pixelbrain.adapter.js`, `src/pages/PixelBrain/studio/`, `src/pages/PixelBrain/components/`.

## Core Concept

This is a **port**, not a rebuild: every capability being moved already has a passing test suite in its source location (companion PDR's PIR: 151 tests, adapter coverage 54/54, grass differential 6/6). The job is relocation with equivalence, not re-implementation — the acceptance bar for each ported piece is "produces the same output as its source" (checksums, differential tests against the still-live source module), not "looks similar."

Two honest phases, because the portability evidence is uneven:

- **Phase A (this PDR's committed scope):** mirror the measured 104-file framework-agnostic execution closure wholesale, extract the Studio facade, and stand up the 3 genuinely new tabs (Foundry/grass, AMP Conveyor, Mutation Lab) plus Diagnostics in the target app. Only those four tabs are rendered or routable in Phase A. This is where the verified core capability lives; the larger-than-first-estimated copy is required so every advertised adapter can actually load and execute in the independent app.
- **Phase B (historical scope boundary for this PDR):** complete the six legacy-backed surfaces for full nine-tab parity. Diagnostics received its Phase-A evidence shell, so the later work adds five routes (Canvas/Aseprite, Blueprint, Material & Finish, Mentor & Reference, Library & Export) and completes Diagnostics. At the time of this Phase-A decision, two components appeared context-coupled; the follow-up Phase-B PDR records the corrected dependency audit and authorization.

Auth is dropped entirely, not ported: `<AdminRoute>` gates the main app's route because it's a shared, multi-tenant web app; `Pixel-Art-Studio-Skeleton` is a local, single-user tool (matches its own `AGENTS.md`: auth stays OFF unless the ask names accounts/sign-in). No login screen, no `authMiddleware`.

## Implementation Philosophy

Prefer moving files over rewriting them. Every file in the measured 104-file core closure is copied verbatim at a target-relative path that preserves its import graph — no reformatting, no generated preambles, and no "while I'm here" cleanup. Framework-bound UI is adapted narrowly: React Router becomes TanStack Router, and the legacy extension selector uses the target's installed Lucide icons rather than importing the main app's icon barrel or adding Framer Motion solely for one panel. Do not use this port as an opportunity to redesign the Studio UI, retheme it, or "improve" a legacy component.

## Ownership & Law Compliance

Same determinism (VAELRIX Law 6), adapter-only-access, and frozen-contract rules as the companion PDR — the contracts (`PB-STUDIO-AMP-MANIFEST-v1`, `PB-STUDIO-AMP-PLAN-v1`, `PB-STUDIO-AMP-RECEIPT-v1`, `PB-STUDIO-MUTATION-v1`, `PB-STUDIO-DIFF-v1`) are not renegotiated by moving their implementation — a ported module must produce byte-identical checksums to its source for the same input, or the port has a bug.

## 1. Executive Summary

Port the already-implemented, already-tested PixelBrain Studio core (manifest, planner, execution, mutation-transaction, adapter registry, the real SWARD-ported grass engine) plus its 3 new Studio-native UI tabs (Foundry, AMP Conveyor, Mutation Lab) from their current home — a route inside the main Scholomance React app — into `Pixel-Art-Studio-Skeleton`, a genuinely standalone app with its own dev server, build, and lifecycle. This is Phase A of a two-phase plan; this document did not commit the six legacy-backed surfaces. The later Phase-B PDR authorizes five new routes plus completion of the Phase-A Diagnostics surface after a corrected dependency audit.

The main app's `/pixelbrain/studio` route is left exactly as it is — this PDR adds a second, independent home for the same capability, it does not retire or modify the first.

## 2. Out of Scope / Non-Goals

- Modifying, retiring, or redirecting the main app's existing `/pixelbrain/studio` route, `<AdminRoute>`, or any file under `src/pages/PixelBrain/` — this PDR only reads from those locations.
- Phase B's six legacy-backed surfaces — historically named above but not committed by this Phase-A PDR. They are authorized only by the approved 2026-09-06 follow-up PDR.
- Any auth, accounts, or per-user data in the target app — it is a single-user local tool.
- Redesigning the Studio UI, its CSS, or its interaction model during the port. Visual output should be a plain relocation, not a refresh.
- Changing the manifest/planner/execution/mutation-transaction contracts themselves — this PDR moves their implementation, not their design.
- Cloud deploy of the target app for this purpose (`Pixel-Art-Studio-Skeleton`'s own Vercel target is irrelevant here — this is a local dev tool).

## 3. Spec Sheet

### Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criterion |
|---|---|---|
| P1 | Core logic ports verbatim | The target contains byte-identical copies of the complete measured 104-file closure: 101 files under `src/lib/pixelbrain/` and one each under `src/lib/{microprocessors,constants,quantization}/`; a differential suite imports source and ported modules, loads all 54 adapters, and asserts full output/receipt equality for deterministic witnesses. |
| P2 | Studio facade extracted, not duplicated whole | A new, Studio-only facade module exposes exactly the 14 Studio-relevant functions from `pixelbrain.adapter.js` (listed in Context), with no dependency on `engine.adapter.js` or `photonic-retina/index.js`. |
| P3 | Four-tab TanStack routing | `/studio/{foundry,amps,mutations,diagnostics}` deep-links through TanStack Router; `/` and missing/invalid Phase-A tab values redirect to `/studio/foundry`, because the source default (`canvas`) belongs to deferred Phase B. |
| P4 | Three new tabs live | Foundry (grass), AMP Conveyor, and Mutation Lab render in the target app, backed by the ported facade, with the same manifest/adapter/mutation behavior as the source (checksum-verified, not just "looks the same"). The Conveyor's legacy extension selection is preserved with a target-native selector adaptation. |
| P5 | Diagnostics tab | A simple read-only tab showing manifest coverage counts, receipts, and rejection reasons — the lowest-coupling legacy-adjacent tab, included in Phase A since it has no `PixelBrainPage` dependency. |
| P6 | Styling ported, not redesigned | The relevant slice of `PixelBrainPage.css` is copied to the target app and scoped so it doesn't leak into Sward's own Tailwind-styled chrome; visual output for the 4 Phase-A tabs matches the source route's rendering. |
| P7 | Standalone and runnable | `startup.sh` brings the target app up with the ported Studio as its default view (replacing the SWARD-only `Studio.tsx` entry), verified by an actual render check (screenshot or DOM assertion), not just a 200 status. |

### Non-functional requirements

- **Determinism:** every ported function must produce checksums identical to its source counterpart for the same input — this is the primary regression gate for a port (see P1).
- **No new frozen contracts:** this PDR moves implementation, not design; no new `PB-*-v` contract is introduced.
- **Isolation:** target runtime code must not import from root-app `src/pages/PixelBrain/`, root-app `src/lib/pixelbrain.adapter.js`, or root `codex/`. Source imports are allowed only inside differential tests. Production imports resolve exclusively to the target's local mirror, so the apps can build and run independently.
- **Sovereign local state:** the standalone working snapshot, receipt ledger, rejection/fault ledger, grass library, and drafts stay in browser state/local storage only. No server persistence, telemetry, or auth is added.

### Contracts

No new contracts. Existing contracts (`PB-STUDIO-AMP-MANIFEST-v1`, `PB-STUDIO-AMP-PLAN-v1`, `PB-STUDIO-AMP-RECEIPT-v1`, `PB-STUDIO-MUTATION-v1`, `PB-STUDIO-DIFF-v1`, `PB-GRASS-FIELD-v5`) are preserved verbatim by the ported code.

## 4. Change Classification

- **Structural:** a new `src/lib/pixelbrain/` tree and a replaced `Studio.tsx` entry point in `Pixel-Art-Studio-Skeleton`.
- **Behavioral:** core execution behavior is unchanged and checksum-verified. The standalone shell intentionally defaults to Foundry rather than the unavailable Phase-B Canvas tab; this route-only difference is required by the approved four-tab scope.
- **Architectural:** establishes that PixelBrain Studio capability now has two independent homes (main app route, standalone app) sharing no runtime code — a deliberate duplication, not a shared-package extraction, per P-isolation above.

## 5. Assumptions and Unknowns

- **Measured:** `codex/core/pixelbrain/studio/*.js` and `grass-{amp,engine,palettes,types}.js` have zero React/DOM imports (grep-verified 2026-09-05).
- **Measured:** 11 of 13 legacy PixelBrain components import only React hooks (no shared context); 2 (`ForgeGatePanel.jsx`, `MentorCritiquePanel.jsx`) reference `PixelBrainPage`/`usePixelBrain`/`PixelBrainContext` — this measurement is why Phase B is not committed yet.
- **Measured:** a fresh dependency walk from all ten named entry files reaches 104 local files and no external package imports. Preserve that full closure or the 54-adapter claim is false.
- **Measured:** the target's untouched `npm run typecheck` and `npm run build` pass on Node 20.20.2. Its untouched `npm test` fails before running tests because the quoted `scripts/**/*.test.mjs` glob is treated literally; A0 repairs this test harness before adding feature tests.
- **Decision:** TanStack route semantics intentionally differ at the default only: Foundry is the first authorized Phase-A tab, while explicit deep links retain stable four-tab behavior.
- **Unknown:** whether `PixelBrainPage.css`'s 2,517 rules have any global selectors (bare element selectors, `*`, unscoped `body`/`html` rules) that would leak into Sward's own chrome once co-loaded. Audit before copying, don't assume it's cleanly scoped just because its rules are prefixed `.pb-*` in the parts already read.
- **Unknown:** the Node engine mismatch noted when installing `Pixel-Art-Studio-Skeleton`'s dependencies (`@tanstack/start-*` wants Node ≥22.12.0; this machine has 20.20.2) ran fine for `npm run dev` in practice, but hasn't been stress-tested under the added load of the ported Studio code. Watch for it, don't assume it's fully inconsequential.

## 6. Resolved Escalation

```text
RESOLVED_ESCALATION: PHASE_B_AUTHORIZATION
- Clause: scope of legacy-tab porting
- Resolution: Angel approved the follow-up `2026-09-06-pixelbrain-studio-standalone-phase-b-pdr.md` on 2026-09-06 after a fresh source and dependency audit.
- Evidence correction: the current ForgeGatePanel.jsx and MentorCritiquePanel.jsx are props-driven; the older context-coupling observation in this Phase-A record is stale.
- Authorized scope: five new routes complete the exact nine-tab contract, while Foundry and Diagnostics receive their remaining legacy-backed functions.
- Critical Nature: MEDIUM
- Structural Impact: SCOPE, ESTIMATE ACCURACY
- Needs: governed Phase-B implementation and verification under the follow-up PDR.
```

## 7. Architecture / File Map

```text
Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/       Codex
  studio/ and transitive core modules                101 byte-identical PixelBrain files
  studio-facade.js                                   NEW — the extracted 14-function Studio facade
Pixel-Art-Studio-Skeleton/src/lib/{microprocessors,
  constants,quantization}/                           3 byte-identical sibling dependencies
Pixel-Art-Studio-Skeleton/src/components/studio/     Codex
  PixelBrainStudio.tsx                                replaces Studio.tsx as the app's entry component
  tabs/{Foundry,AmpConveyor,MutationLab,Diagnostics}.tsx  ported from the 3 new panels + a new Diagnostics tab
  StudioTabBar.tsx                                    ported from StudioTabBar.jsx
  ExtensionSelector.tsx                              target-native adaptation of the legacy selector
Pixel-Art-Studio-Skeleton/src/routes/
  index.tsx                                           redirect to /studio/foundry
  studio.$tab.tsx                                     TanStack Start file route replacing react-router-dom usage
Pixel-Art-Studio-Skeleton/src/styles/pixelbrain.css  Codex — ported, audited slice of PixelBrainPage.css
tests/ (in Pixel-Art-Studio-Skeleton)                Codex
  pixelbrain-port-differential.test.ts                P1: source vs. ported-copy checksum equality
  studio-facade.test.ts                               P2: facade export surface + no engine.adapter/photonic-retina import
```

Dependency direction: target Studio UI → `src/lib/pixelbrain/studio-facade.js` → target-local byte-identical core mirror. The mirror may traverse the three target-local sibling roots required by the preserved relative import graph, but production code never crosses back to root `codex/` or root-app `src/`. Differential tests are the sole exception and import both trees deliberately.

The standalone shell owns an immutable current snapshot plus receipt and rejection ledgers capped at 20 entries. A successful non-mutation commit advances the checksum while retaining the last compatible lattice fields; accepting a mutation installs the returned candidate revision with parent lineage; rejecting it returns the exact baseline object. Diagnostics reads these ledgers and adapter coverage but performs no mutation.

## 8. Step-by-Step Implementation Plan

| Phase | Owner | Estimate | Independently shippable milestone and exit criteria |
|---|---|---:|---|
| A0. Harness repair + verbatim closure port | Codex | 1 day | Target `npm test` executes; all 104 closure files are byte-identical and production code has no root-app imports. |
| A1. Facade extraction | Codex | 1 day | `studio-facade.js` exposes exactly the 14 Studio functions; test proves it imports neither `engine.adapter.js` nor `photonic-retina/index.js` (grep-based static check, not just "it works"). |
| A2. Differential execution proof | Codex | 1 day | All 54 source and ported adapters load; deterministic runnable/support/mutation witnesses produce equal outputs, diffs, and receipts. |
| A3. Router, state shell, and four tabs | Codex | 2 days | Foundry/grass, AMP Conveyor, Mutation Lab, and Diagnostics render; root/invalid routes resolve to Foundry; receipt/rejection state remains browser-local; actions checksum-match source outputs. |
| A4. CSS port + audit | Codex | 1 day | Relevant `PixelBrainPage.css` slice copied and scoped; visual check confirms no leakage into Sward's own chrome outside the Studio tabs. |
| A5. Startup + verification | Codex | 1 day | `startup.sh` serves the ported Studio as the default view; real render check (not just HTTP 200) confirms content. |

Phase B is not estimated here (see §6 escalation).

## 9. Pivotal Code Examples

### 1. Differential port test (P1)

```ts
// tests/pixelbrain-port-differential.test.ts
import { GrassAMP as SourceGrassAMP } from '../../codex/core/pixelbrain/grass-amp.js';
import { GrassAMP as PortedGrassAMP } from '../src/lib/pixelbrain/grass-amp.js';

test('ported grass-amp matches source byte-for-byte', () => {
  for (const seed of [1, 2, 3, 42, 20260905]) {
    const a = SourceGrassAMP({ width: 32, height: 32, seed });
    const b = PortedGrassAMP({ width: 32, height: 32, seed });
    expect(b).toEqual(a);
  }
});
```

### 2. Facade isolation check (P2)

```js
// tests/studio-facade.test.ts
import { readFileSync } from 'node:fs';

test('studio-facade.js does not import engine.adapter or photonic-retina', () => {
  const src = readFileSync('src/lib/pixelbrain/studio-facade.js', 'utf8');
  expect(src).not.toMatch(/engine\.adapter\.js/);
  expect(src).not.toMatch(/photonic-retina/);
});
```

## 10. Glossary

- **Port:** a verbatim or near-verbatim relocation of already-working code to a new host, verified by output equivalence — not a rewrite or redesign.
- **Phase A / Phase B:** the two-tier scope split in this PDR — A is committed (measured-portable), B is named but requires its own discovery pass before commitment.
- **Studio facade:** the extracted, Studio-only subset of `pixelbrain.adapter.js`'s exports, free of that file's other-page dependencies.

## 11. Q&A — Top 8 Concerns

1. **Does this replace the main app's `/pixelbrain/studio` route?** No. Both exist independently; neither imports the other.
2. **Why not just import the main app's code directly instead of copying it?** Cross-app relative imports between two independently-built, independently-versioned apps create exactly the kind of drift risk this repo's SCDL/AMP work has repeatedly hit — a copy with a differential test is more honest about the two apps' independence than a fragile relative import across a repo boundary neither app owns.
3. **Will this app need auth?** No — single-user local tool, matches `Pixel-Art-Studio-Skeleton`'s own `AGENTS.md` default.
4. **What happened to the six legacy-backed surfaces?** Diagnostics received a Phase-A shell; the approved follow-up PDR adds the other five routes and completes that shell. See §6.
5. **Does the CSS need a rewrite for Tailwind?** No — ported as plain CSS alongside the Tailwind-styled chrome, scoped to avoid leakage.
6. **What if the Node engine mismatch actually breaks something?** Flagged as an open unknown (§5), watched during A5's verification, not assumed away.
7. **Is this a smaller or bigger effort than the original companion PDR?** Much smaller — that PDR built the capability from scratch; this one relocates already-built, already-tested capability into a second home.
8. **Who verifies the port didn't silently change behavior?** The differential tests (P1, code example 1) are the primary gate — checksum equality against the still-live source, not a visual eyeball check alone.

## 12. QA Plan

New tests (in `Pixel-Art-Studio-Skeleton`):

- `tests/pixelbrain-port-differential.test.mjs` — P1, byte identity plus source/port equality across all 54 adapters and deterministic witnesses.
- `tests/studio-facade.test.mjs` — P2, exact export surface and import-isolation check.
- `tests/studio-router.test.mjs` — P3, four legal deep links plus root/invalid redirect behavior.
- `tests/studio-state.test.mjs` — browser-local snapshot, receipt cap, rejection identity, and mutation lineage.
- `tests/visual/studio-tabs.spec.mjs` — P4/P6, interactions and screenshots for all four Phase-A tabs, compared with the existing source-route baselines where surfaces overlap.

Commands:

```bash
npm test
npm run typecheck
npm run build
sh startup.sh
node scripts/browser-smoke.mjs
npm run preview:restart
node scripts/browser-smoke.mjs --baseline screenshots/browser-smoke-verdict.json --base-url http://127.0.0.1:8091
```

## 13. Regression Risks and Specific Retest Checklist

- **Silent output drift:** the differential test is the whole point — if it's skipped or weakened to a shape-only assertion, a port bug (wrong default, dropped field) would ship invisibly. Assert full equality, not "has the same keys."
- **CSS leakage:** the audit in A4 exists because `PixelBrainPage.css` was never written expecting to share a page with Tailwind's reset/utilities. Actually load both and look, don't assume the `.pb-*` prefix already read is exhaustive.
- **Router behavior mismatch:** TanStack Router's redirect/param semantics differ from `react-router-dom`; test the exact four authorized deep links, root redirect, invalid-tab redirect, and browser back/forward behavior. Do not assert source Canvas as the default because it is outside Phase A.
- **Incomplete core copy:** a manifest and coverage screen can look healthy even when a dynamic adapter chunk is absent. Load and execute every adapter from the target build, not only grass or the registry keys.
- **Node engine mismatch:** if `npm run dev` or the build starts failing after adding the ported code's dependencies, check the Node version mismatch noted in §5 before assuming it's a code bug.

## 14. Rollout Plan

No flags needed — this is a new, independent app entry point with no existing users to migrate. `startup.sh` simply serves the new Studio instead of the old SWARD-only one once A5 lands. Rollback is `git revert` on the target app's commits; the main app's route is untouched throughout, so PixelBrain Studio capability is never unavailable during this work.

## 15. Definition of Done

- [x] P1–P7 all pass their stated acceptance criteria.
- [x] The measured 104-file closure is byte-identical and every one of 54 target adapters loads from the production build.
- [x] Differential tests assert full output equality, not shape-only.
- [x] `npm test`, `npm run typecheck`, `npm run build` all pass in `Pixel-Art-Studio-Skeleton`.
- [x] `startup.sh` serves the ported Studio; a real render check (screenshot or DOM assertion) confirms content, not just HTTP 200.
- [x] Main app's `/pixelbrain/studio` route is unmodified (diff review, not just "I didn't mean to touch it").
- [x] Phase B remained deferred for the Phase-A implementation; no placeholder or dead Phase-B tab was presented as live functionality. The later authorization is governed by the follow-up PDR in §6.
- [x] PIR records the differential-test evidence (checksum matches) as the primary proof of correctness.

## 16. Final Architectural Verdict

**Sound, and appropriately conservative.** The prior mistake was scoping a UI migration without checking whether "port" meant "copy something with zero dependencies" or "copy something entangled with a decade of app-specific state" — this PDR does that check first and splits the plan honestly along the line the evidence actually supports, rather than promising all 9 tabs on the strength of 3 of them being clean.

## 17. References

- `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-sward-studio-unification-pdr.md` — the companion PDR whose implemented output this one ports.
- `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260905-PIXELBRAIN-SWARD-STUDIO-UNIFICATION.md` — evidence basis for what's already fulfilled and portable.
- `codex/core/pixelbrain/studio/` — the core logic being ported (manifest, planner, execution, mutation-transaction, adapter registry).
- `codex/core/pixelbrain/grass-{amp,engine,palettes,types}.js` — the real SWARD grass port being ported alongside it.
- `src/lib/pixelbrain.adapter.js` — source of the Studio facade being extracted (P2).
- `src/pages/PixelBrain/studio/` — source of the 3 new tabs + shell being ported (P3, P4).
- `src/pages/PixelBrain/components/ForgeGatePanel.jsx`, `MentorCritiquePanel.jsx` — the two components whose coupling gates Phase B.
- `Pixel-Art-Studio-Skeleton/startup.sh`, `vite.config.ts`, `package.json` — fixed 2026-09-05 to run standalone (port collision with the main app's dev server resolved: 8080/8081 → 8090/8091).
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — determinism, schema, ownership, and escalation law.

## 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260905-PIXELBRAIN-STUDIO-STANDALONE-PORT.md`. It must include the differential-test checksum evidence for every ported module (not a pass/fail summary alone), the facade isolation check result, the CSS-leakage audit finding, visual A/B renders of the 4 Phase-A tabs against their source-route equivalents, and an explicit statement of Phase B's status (deferred-with-escalation-open, or a named follow-up PDR).
