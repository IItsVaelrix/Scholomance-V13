# PDR: PixelBrain SWARD Studio Unification

**Status:** Draft — implementation authorization requested; no runtime changes are part of this PDR.
**Classification:** Architectural | Behavioral | PixelBrain | Studio migration | AMP activation | High-fidelity authoring
**Priority:** Critical
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-SWARD-STUDIO-UNIFICATION-2026-09-05`

## Owner(s)

- **Codex:** studio contracts, AMP manifest and execution adapters, activation/order law, SCDL/foundry/blueprint integration, and invariants.
- **Codex:** the native SWARD-derived Studio shell, tabs, canvas/editor surfaces, visual migration, keyboard behavior, and accessibility.
- **Codex:** server/job adapters where required, test suites, migration harnesses, deterministic fixtures, CI gates, and rollout controls.
- **Escalation owner:** Angel (repository owner).

## Context

PixelBrain currently has a capable but dispersed UI surface, while `Pixel-Art-Studio-Skeleton/` demonstrates an unusually clear working surface: form-first asset inspection, adjustable parameters, local library, layer views, variants, seams, and direct export. The AMP activation substrate is now real but deliberately only a pilot; it selects some AMPs deterministically and no real production authoring surface yet consumes its result. This PDR turns SWARD’s interaction model into PixelBrain’s single native studio without treating the experimental `amp-registry.js` as an inventory.

## Target Integration Area

- `src/pages/PixelBrain/` and `src/pages/PixelBrain/components/` — current PixelBrain UI to be retired only after parity.
- New `src/pages/PixelBrain/studio/` — native root-app Studio surface; **not** a nested copy of `Pixel-Art-Studio-Skeleton/`.
- `src/lib/pixelbrain.adapter.js` — the existing client-safe facade; UI never imports `codex/` directly.
- `codex/core/pixelbrain/amp-substrate/` and new `codex/core/pixelbrain/studio/` — authoritative manifest, planning, execution, and mutation transaction seams.

## Core Concept

SWARD becomes a workshop, not a grass-only generator: one asset document moves through a deterministic conveyor of blueprint, manual lattice edit, selected AMPs, mutation experiment, render/fidelity inspection, gate, and export. Every callable PixelBrain AMP becomes an entry in one generated, checksummed manifest and has an executable studio adapter with a declared input/output contract, preview capability, and test witness. Mutation AMPs remain fully available but operate through an isolated Mutation Lab transaction: they propose a derived candidate and a diff; they never silently alter the working asset.

## Implementation Philosophy

Port the successful SWARD *preferences*—calm three-pane composition, direct visible output, form-before-colour inspection, deterministic variants, local library, and export clarity—into the existing root application. Do not embed the separate TanStack/React-19 App Builder project in the React-18 root app, duplicate its platform scaffolding, or allow a generic AMP loader to invoke arbitrary exports. Each integration is an explicit adapter seam. Existing direct factory calls remain authoritative until their manifest-backed replacement has passed differential comparison.

## Ownership & Law Compliance

The plan honors the Core → Services → Runtime → Server boundary, deterministic execution (VAELRIX Law 6), client-side draft sovereignty, adapter-only UI access, and existing file ownership. Any new frozen wire contract must be registered in `SCHEMA_CONTRACT.md` by Codex with Angel’s awareness. New UI paths are Claude-owned; test paths are Gemini-owned. Cross-domain disagreement uses the `ESCALATION:` blocks in §6.

## 1. Executive Summary

This PDR replaces the fragmented PixelBrain page with a native SWARD Studio shell that gives every flagship capability a named, clickable home: Canvas, Blueprint, Foundry, AMP Conveyor, Mutation Lab, Material & Finish, Mentor & Reference, Library & Export, and Diagnostics. It makes the effect catalog—not the two-entry, write-only `amp-registry.js`—the starting inventory, then requires every catalogued executable AMP to be classified, manifest-backed, selectable, executable through a purpose-built adapter, previewable, and covered by a deterministic witness before Studio claims coverage.

The blast radius is intentionally large but staged: new UI routes and adapters land beside existing PixelBrain UI, then parity is proven before any old control is retired. The substantive risk is AMP conflict and the difference between a static relevance predicate and a runtime-dependent gate; the plan addresses both through pipeline planning, read/write declarations, immutable snapshots, and a separate mutation vehicle. Current status is **Draft / no implementation started**.

## 2. Out of Scope / Non-Goals

- Rewriting PixelBrain engine algorithms, AMP internals, SCDL, ITEM-SPEC-v1, Aseprite serialization, or Forge Craft Gate semantics merely to fit the new UI.
- Embedding or deploying `Pixel-Art-Studio-Skeleton/` as a second application, copying its App Builder auth/PWA scaffold, or importing its Zustand store wholesale.
- Auto-running all AMPs on every asset; activation remains explicit, deterministic, and spec/asset-context dependent.
- Treating support modules, generators, or microprocessors as safe image-mutating buttons without an adapter and declared contract.
- Removing the legacy PixelBrain page before tab-by-tab parity, a11y, export, and differential gates are green.
- Cloud autosave of unsaved artwork, hidden telemetry of art content, or background mutations.
- A trained or stochastic AMP selector.

## 3. Spec Sheet

### Functional requirements and acceptance criteria

| ID | Requirement | Acceptance criterion |
|---|---|---|
| F1 | Native Studio route and shell | `/pixelbrain/studio` renders in the root app with SWARD’s three-pane desktop layout and usable single-column mobile layout; it shares the existing asset facade. |
| F2 | Flagship homes | Each migrated feature has exactly one top-level tab and deep-linkable subroute: Canvas, Blueprint, Foundry, AMP Conveyor, Mutation Lab, Material & Finish, Mentor & Reference, Library & Export, Diagnostics. |
| F3 | Aseprite Bench | Canvas tab hosts the existing `TemplateEditor` capabilities: layers, palette, symmetry, selection, undo/redo, Aseprite import/export, PixelBrain packet import/export, and keyboard editing. |
| F4 | Exhaustive AMP coverage | `npm run effects -- --json` (added by this PDR) and the generated Studio manifest agree one-for-one on every catalogued AMP/effect module. Each record is `runnable`, `support`, or `blocked-with-reason`; no unclassified entry may ship. Every `runnable` record has an adapter, preview, commit or mutation transaction, provenance event, and test witness. |
| F5 | Deterministic planning | Given the same asset snapshot, intent, manifest, and options, the AMP plan, ordering, skipped reasons, and output checksum are byte-identical. The UI presents `activated`, `skipped`, and conflict decisions before commit. |
| F6 | Mutation Lab | A mutation-capable AMP runs only against an immutable baseline and produces a candidate branch, visual/raster diff, diagnostics, and accept/reject controls. Accept creates a new document revision; reject changes nothing. |
| F7 | High-fidelity gates | Blueprint, Forge Gate, palette authority, construction guides, shader/VRI previews, and output formats survive migration with byte-identical or approved-golden output. |
| F8 | Local library and export | Unsaved documents and library state stay browser-local. Export emits the pre-existing legal formats plus provenance/plan receipts; an explicit save is required for any server persistence. |
| F9 | Legacy retirement | The old PixelBrain page becomes a compatibility redirect only after a parity matrix, visual baselines, and a rollback flag pass. |

### Non-functional requirements

- **Determinism:** zero RNG after a documented seed is chosen; sort manifests and plans by stable `order`, then `ampId`; checksum every input/output snapshot.
- **Latency:** a synchronous preview budget of 150 ms for 64×64 and 500 ms for 256×256 assets on the reference browser; longer work enters a cancellable job state with progress and no UI freeze.
- **Memory:** retain at most 20 undo/branch snapshots by default; report estimated bytes before retaining a larger candidate.
- **Accessibility:** tablist semantics, roving keyboard focus, labelled canvas/tool controls, live status for jobs/gates, reduced-motion support, no colour-only verdicts.
- **Safety:** no `eval`, dynamic user module imports, or mutation of a committed baseline; allow-list manifest ids only.

### Contracts

`PB-STUDIO-AMP-MANIFEST-v1` is a new frozen, generated contract. It references the existing `PB-AMP-RELEVANCE-v2` record when a static predicate is lawful; it does not force a dishonest predicate onto runtime-gated AMPs.

```js
export const STUDIO_AMP_MANIFEST_CONTRACT = 'PB-STUDIO-AMP-MANIFEST-v1';

export function makeStudioAmpRecord({ ampId, kind, pipeline, order, adapterId, mutates, reads, writes }) {
  return Object.freeze({
    contract: STUDIO_AMP_MANIFEST_CONTRACT,
    ampId, kind, pipeline, order, adapterId, mutates,
    reads: [...reads].sort(), writes: [...writes].sort(),
  });
}
```

`PB-STUDIO-AMP-PLAN-v1` records the immutable base checksum, selected ids, skips, conflict decisions, and deterministic output checksum. It is provenance, not a second source of asset truth.

```js
export function createStudioPlan(snapshotChecksum, candidates) {
  const ordered = [...candidates].sort((a, b) => a.order - b.order || a.ampId.localeCompare(b.ampId));
  return Object.freeze({ contract: 'PB-STUDIO-AMP-PLAN-v1', snapshotChecksum, steps: ordered });
}
```

## 4. Change Classification

- **Cosmetic:** SWARD’s visual language and layout replace the old panel collage while preserving high-contrast pixel inspection.
- **Structural:** a new Studio route, tab registry, document state, manifest, and adapter layer replace direct UI-to-feature wiring.
- **Behavioral:** AMP previews, commits, mutations, gate runs, and exports become explicit Studio actions with receipts.
- **Architectural:** all AMP activation is made manifest-visible and every legacy UI feature moves behind one client-safe facade.

## 5. Assumptions and Unknowns

- **Measured:** `amp-registry.js` is write-only and must not be used as an inventory; the generated effect catalog is the coverage denominator.
- **Measured:** the activation substrate currently has pilot records and intentionally does not drive a real forge caller.
- **Assumption:** the existing adapter can expose each needed function without importing `codex/` from React; adapters will prove or reject this one AMP at a time.
- **Unknown:** which effects require runtime observations rather than `PB-AMP-RELEVANCE-v2` predicates. These receive `runtime-gated` records, not fabricated predicates.
- **Unknown:** the full mutation AMP set and its legal invariants. The discovery phase must classify it from source/export behavior and test evidence before the Mutation Lab may claim full coverage.
- **Unknown:** whether current `TemplateEditor` can render all Aseprite features losslessly; export/import tests, not screenshots, decide it.

## 6. Open Questions / Escalations

```text
ESCALATION: AMP_CONFLICT_POLICY
- Clause: Studio plan execution
- Current Text: Existing direct factories own implicit write ordering.
- Proposed Text: The Studio manifest declares read/write regions and stable order; conflicting writes require a named compositor or a blocking refusal.
- Rationale: "all AMPs" cannot mean undefined last-writer-wins behavior.
- Critical Nature: HIGH
- Structural Impact: ARCHITECTURE, DETERMINISM, FIDELITY
- Needs: Angel approval after the discovery matrix identifies actual conflicts.
```

```text
ESCALATION: LEGACY_PIXELBRAIN_ROUTE_RETIREMENT
- Clause: legacy UI routing
- Current Text: PixelBrainPage is the existing functional surface.
- Proposed Text: Retire it only after the parity matrix is mechanically green and a feature flag enables immediate rollback.
- Rationale: A visual migration must not strand working authoring features.
- Critical Nature: MEDIUM
- Structural Impact: UI, RELEASE SAFETY
- Needs: Angel approval at Phase 8.
```

## 7. Architecture / File Map

```text
src/pages/PixelBrain/studio/                 Claude
  PixelBrainStudioPage.jsx                   tab shell and document provider
  studio-tabs.js                             deep-linkable flagship registry
  tabs/{Canvas,Blueprint,Foundry,AmpConveyor,MutationLab,Finish,Mentor,Library,Diagnostics}Tab.jsx
src/lib/pixelbrain.adapter.js                Codex (existing facade, additive Studio methods)
codex/core/pixelbrain/studio/                Codex
  studio-amp-manifest.schema.js              frozen manifest validation
  studio-amp-manifest.generated.js           generated exhaustive inventory
  studio-amp-planner.js                      pure ordering/conflict plan
  studio-mutation-transaction.js             immutable branch/accept/reject law
  adapters/*.adapter.js                      one declared adapter per runnable AMP family
codex/core/pixelbrain/amp-substrate/         Codex/Gemini (existing; expanded only lawfully)
scripts/generate-pixelbrain-studio-manifest.mjs Codex
tests/codex/core/pixelbrain/studio/          Gemini
tests/pages/pixelbrain-studio-*.test.jsx     Gemini
tests/visual/pixelbrain-studio-*.spec.js     Claude
```

Dependency direction is one-way: Studio UI → `pixelbrain.adapter.js` → Studio runtime adapters/planner → existing PixelBrain core AMPs. The adapters may call existing modules; no core AMP imports React or Studio state. Server persistence is optional and explicit; browser-local document state is the default.

## 8. Step-by-Step Implementation Plan

| Phase | Owner | Estimate | Independently shippable milestone and exit criteria |
|---|---|---:|---|
| 0. Evidence inventory | Codex + Gemini | 2 days | Generate catalog-to-manifest matrix; CI fails on an unclassified catalog entry. No UI behavior changes. |
| 1. Contract and planner | Codex | 2 days | Frozen manifest/plan schema, deterministic ordering and conflict refusal tests green behind `PIXELBRAIN_STUDIO_V1`. |
| 2. SWARD shell | Claude | 3 days | Native root-app Studio layout and empty tab registry render behind flag; no nested skeleton app. |
| 3. Manual canvas parity | Claude + Gemini | 4 days | TemplateEditor, layers, palette, Aseprite, undo/redo, and source packet round-trips pass old/new differential tests. |
| 4. Blueprint/foundry/finish homes | Codex + Claude | 4 days | Forge Gate, construction blueprint, Foundry, shader/VRI, critique/reference tabs use existing adapter calls and preserve output goldens. |
| 5. AMP Conveyor | Codex + Gemini + Claude | 6 days | Every non-mutation runnable AMP has an adapter/manifest/test witness; plan preview and provenance visible before commit. |
| 6. Mutation Lab | Codex + Gemini + Claude | 4 days | Every mutation AMP uses branch/diff/accept/reject; baseline immutability and reject-no-op tests green. |
| 7. Library/export and stress | Claude + Gemini | 3 days | Local library, explicit export, a11y, performance, large asset, cancellation, and no-content-telemetry tests green. |
| 8. Parity canary and retirement | Angel + all | 2 days | Internal canary, old/new differential corpus, visual baselines, rollback flag tested; legacy redirect only after approval. |

## 9. Pivotal Code Examples

### 1. Manifest coverage gate

```js
// scripts/generate-pixelbrain-studio-manifest.mjs
import { readEffectCatalog } from './pixelbrain-effect-catalog.mjs';
import { buildStudioManifest } from '../codex/core/pixelbrain/studio/studio-amp-manifest.schema.js';

const catalog = await readEffectCatalog();
const manifest = buildStudioManifest(catalog);
if (manifest.unclassified.length) throw new Error(`Unclassified Studio effects: ${manifest.unclassified.join(', ')}`);
process.stdout.write(`${JSON.stringify(manifest.records, null, 2)}\n`);
```

### 2. Allow-listed adapter dispatch

```js
// codex/core/pixelbrain/studio/execute-studio-amp.js
export async function executeStudioAmp({ manifest, snapshot, ampId, options }) {
  const record = manifest.records.find((entry) => entry.ampId === ampId && entry.kind === 'runnable');
  if (!record) throw new Error(`Studio AMP is not runnable: ${ampId}`);
  const adapter = await import(`./adapters/${record.adapterId}.adapter.js`);
  return adapter.preview({ snapshot, options: structuredClone(options ?? {}) });
}
```

### 3. Deterministic conflict refusal

```js
// codex/core/pixelbrain/studio/studio-amp-planner.js
export function planStudioAmps(records) {
  const claimed = new Map();
  for (const record of [...records].sort((a, b) => a.order - b.order || a.ampId.localeCompare(b.ampId))) {
    for (const region of record.writes) {
      if (claimed.has(region)) throw new Error(`PB-STUDIO-CONFLICT: ${claimed.get(region)} and ${record.ampId} write ${region}`);
      claimed.set(region, record.ampId);
    }
  }
  return Object.freeze([...records]);
}
```

### 4. Mutation transaction law

```js
// codex/core/pixelbrain/studio/studio-mutation-transaction.js
export function createMutationCandidate(base, result, ampId) {
  return Object.freeze({ baseChecksum: base.checksum, ampId, candidate: result, accepted: false });
}

export function acceptMutation(current, transaction) {
  if (current.checksum !== transaction.baseChecksum) throw new Error('PB-STUDIO-STALE-BASELINE');
  return Object.freeze({ ...transaction.candidate, parentChecksum: current.checksum, mutationAmpId: transaction.ampId });
}
```

### 5. Native tab registry

```js
// src/pages/PixelBrain/studio/studio-tabs.js
export const STUDIO_TABS = Object.freeze([
  ['canvas', 'Canvas & Aseprite'], ['blueprint', 'Blueprint'], ['foundry', 'Foundry'],
  ['amps', 'AMP Conveyor'], ['mutations', 'Mutation Lab'], ['finish', 'Material & Finish'],
  ['mentor', 'Mentor & Reference'], ['library', 'Library & Export'], ['diagnostics', 'Diagnostics'],
].map(([id, label]) => ({ id, label, href: `/pixelbrain/studio/${id}` })));
```

## 10. Glossary

- **AMP:** a PixelBrain transformation, analysis, or generation module; only a manifest-backed executable may run from Studio.
- **Adapter:** the explicit boundary translating a Studio snapshot to an existing AMP’s true API and back.
- **Manifest:** generated, checksummed inventory declaring coverage and execution class for every catalogued effect.
- **Mutation Lab:** isolated branch vehicle for AMPs that propose a changed asset rather than a normal non-destructive layer/pass.
- **Sward preferences:** form-first inspection, parameter clarity, visible variants, seams, local library, and direct exports.
- **Witness:** a deterministic test fixture proving an AMP’s Studio adapter actually invokes the intended behavior.

## 11. Q&A — Top 10 Concerns

1. **Does “all AMPs” mean one unsafe generic button?** No; it means exhaustive manifest coverage plus a real, tested adapter for every runnable AMP.
2. **Why not use `amp-registry.js`?** It self-documents as write-only and is not a capability inventory.
3. **Will every AMP auto-run?** No. Selection and commit are explicit, deterministic, and inspectable.
4. **What happens when two AMPs touch the same cells?** The planner refuses until a named compositor is approved.
5. **Where do mutations go?** Mutation Lab only, as candidate branches with diff/accept/reject.
6. **Is the App Builder skeleton embedded?** No. Its product UX is ported into the root app; its separate framework/platform remains isolated.
7. **Does Aseprite fidelity rely on screenshots?** No. Import/export bytes, layers, palette, and dimensions use round-trip tests.
8. **What if an AMP only makes sense at runtime?** It is marked runtime-gated with an adapter trigger and evidence; no false static predicate is invented.
9. **Can an unsaved artwork leave the browser?** Only through an explicit user action, consistent with the Sovereign Editor principle.
10. **When is the old page deleted?** Never during canary; only after parity, approval, and rollback validation.

## 12. QA Plan

New tests:

- `tests/codex/core/pixelbrain/studio/studio-amp-manifest.test.js` — catalog/manifest completeness, checksum, no unclassified entries.
- `tests/codex/core/pixelbrain/studio/studio-amp-planner.test.js` — order, skip reasons, conflict refusal, 100-repeat determinism.
- `tests/codex/core/pixelbrain/studio/studio-mutation-transaction.test.js` — immutable baseline, accept lineage, reject no-op, stale-base refusal.
- `tests/codex/core/pixelbrain/studio/adapters/*.test.js` — one witness per runnable adapter, comparing real AMP output to its Studio preview/commit path.
- `tests/pages/pixelbrain-studio-parity.test.jsx` — old feature adapter outputs versus Studio homes.
- `tests/visual/pixelbrain-studio.spec.js` and `tests/visual/pixelbrain-studio-a11y.spec.js` — desktop/mobile baselines, tabs, keyboard paths, axe.

Commands:

```bash
npm run effects:check
npx vitest run tests/codex/core/pixelbrain/studio tests/pages/pixelbrain-studio-parity.test.jsx
npm run test:qa
npm run test:visual -- --grep "PixelBrain Studio"
npm run typecheck
npm run lint
```

Representative executable test:

```js
import { expect, it } from 'vitest';
import { planStudioAmps } from '../../../../../codex/core/pixelbrain/studio/studio-amp-planner.js';

it('refuses competing writers deterministically', () => {
  const records = [{ ampId: 'a', order: 1, writes: ['pixels'] }, { ampId: 'b', order: 2, writes: ['pixels'] }];
  expect(() => planStudioAmps(records)).toThrow('PB-STUDIO-CONFLICT: a and b write pixels');
});
```

## 13. Regression Risks and Specific Retest Checklist

- **Adapter drift:** compare Studio outputs with existing direct calls for canonical chestplate, shield, character, terrain, SCDL, Aseprite, and blueprint fixtures.
- **High-fidelity loss:** render and inspect 1×, target scale, and 8× nearest-neighbour outputs; compare raw RGBA where the existing source is deterministic.
- **Legacy UI loss:** execute every mapped old control: TemplateEditor, AMPApply, Reference, ForgeGate, MentorCritique, palette/layer tools, shader/VRI, upload/import, and terminal.
- **Mutation leakage:** reject candidate, reload page, and verify baseline checksum/bytes are unchanged.
- **Mobile/a11y:** 390×844 tab navigation, canvas keyboard paint/undo, focus return after dialogs, and reduced motion.

## 14. Rollout Plan

`PIXELBRAIN_STUDIO_V1` gates the new route; `PIXELBRAIN_STUDIO_LEGACY_REDIRECT` stays false until Phase 8. Initial deployment is internal-only and read/preview-first: Studio may render manifests, plans, previews, and exports but commits are disabled for an AMP until its witness passes. Then enable non-mutation commits for a small allow-list, followed by Mutation Lab candidates, and compare output checksums/visual renders against legacy paths on the golden corpus.

**Incomplete-but-safe:** before full coverage, Studio is useful as a shell and can show only verified adapters. Any unverified manifest record is visible as unavailable with its concrete reason; it cannot be presented as functional and cannot modify an asset. Roll back by disabling both flags; legacy PixelBrain remains intact and no baseline data has been migrated destructively.

## 15. Definition of Done

- [ ] Every generated effect-catalog entry has exactly one valid Studio manifest record.
- [ ] Every runnable record has adapter, preview, commit or Mutation Lab transaction, provenance receipt, and witness test.
- [ ] Every mutation-capable record passes baseline/accept/reject/stale-base tests.
- [ ] All flagship homes are deep-linkable, keyboard-operable, and pass axe/visual checks.
- [ ] TemplateEditor and Aseprite round trips preserve their approved contract fixtures.
- [ ] AMP plans and outputs pass 100-repeat deterministic replay on the golden corpus.
- [ ] Existing direct paths pass differential tests before they are redirected or replaced.
- [ ] `npm run effects:check`, targeted Vitest, QA, visual, typecheck, and lint commands pass.
- [ ] Flags, internal canary, and rollback path are exercised.
- [ ] PIR below records results, exceptions, and any deferred AMP records.

## 16. Final Architectural Verdict

**Complete with acceptable risk.** The user’s desired end state is architecturally sound only if “all AMPs” means exhaustively inventoried, individually adapted, deterministically planned capabilities—not a generic dynamic-import surface. The migration is ambitious but can remain safe because the legacy UI remains the rollback authority until a generated coverage gate and differential corpus establish genuine functional parity.

## 17. References

- `Pixel-Art-Studio-Skeleton/src/components/studio/` — SWARD interaction model to port, not embed.
- `src/pages/PixelBrain/PixelBrainPage.jsx` — current PixelBrain surface and migration source.
- `src/pages/PixelBrain/components/TemplateEditor.jsx` — manual Aseprite-like lattice editing capability.
- `src/pages/PixelBrain/components/AMPApplyPanel.jsx` — current limited AMP preview/commit model.
- `src/pages/PixelBrain/components/ForgeGatePanel.jsx` — gate and blueprint capability to preserve.
- `src/lib/pixelbrain.adapter.js` — client-safe integration boundary.
- `codex/core/pixelbrain/EFFECT_CATALOG.md` — generated, real import-graph coverage denominator.
- `codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js` — existing `PB-AMP-RELEVANCE-v2` contract.
- `codex/core/pixelbrain/amp-substrate/amp-selector.js` — existing deterministic relevance selector.
- `docs/scholomance-encyclopedia/PDR-archive/2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md` — pilot substrate scope and its named wiring follow-up.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — determinism, schema, ownership, and escalation law.
- `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` — frozen-contract registration authority.

## 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260905-PIXELBRAIN-SWARD-STUDIO-UNIFICATION.md`. It must include the generated catalog/manifest coverage counts, the runnable/support/runtime-gated/mutation breakdown, every unblocked exception, plan/output checksum evidence, visual A/B renders, performance data, migration/rollback status, and the exact tests/commands run.
