# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260905-PIXELBRAIN-STUDIO-STANDALONE-PORT
- **Feature / Fix Name:** PixelBrain Studio Standalone Phase A Port
- **Author / Agent:** Codex
- **Date:** 2026-09-05
- **Related PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-05-pixelbrain-studio-standalone-port-pdr.md`
- **Classification:** Architectural | Behavioral | PixelBrain | Standalone app
- **Priority:** Critical
- **Status:** Implementation complete; every scoped gate passes. Phase B is not started.

## 2. Executive Summary

`Pixel-Art-Studio-Skeleton` now opens as an independent four-tab PixelBrain
Studio at `/studio/foundry`. Foundry, AMP Conveyor, Mutation Lab, and
Diagnostics run against a target-local mirror of the full PixelBrain Studio
execution closure. The app does not import the root application's `codex/`
tree or React adapter at runtime, and it does not activate auth, server persistence,
telemetry, or cloud autosave.

The mirror contains exactly 104 byte-identical files. Its registry loads all
54 manifest records and the differential oracle executes each source and
target record against the same frozen witness, comparing complete outputs,
diffs, and receipts. Diagnostics reports 54/54 coverage with no missing or
extra adapter definitions.

## 3. Delivered Requirements

| PDR | Delivered result | Primary evidence |
|---|---|---|
| P1 | Exact 104-file closure copied to target-relative paths. | Byte comparison plus full source/target execution oracle. |
| P2 | Target-local facade exports exactly the approved 14 functions. | Exact export-name test and forbidden-import scan. |
| P3 | `/`, `/studio`, and invalid tabs resolve to Foundry; four valid deep links remain addressable. | Unit normalization and Playwright URL assertions. |
| P4 | Foundry, AMP Conveyor, and Mutation Lab execute through the local facade. | Real grass generation, real `grass` AMP preview, and mutation safety assertions. |
| P5 | Diagnostics exposes coverage, current lineage, five newest receipts, and five newest faults read-only. | Browser assertion records 54/54 and retained preview evidence. |
| P6 | Studio styles are fully `pbs-*` scoped and retain the target's SWARD colors/type hierarchy. | Desktop/mobile render inspection and zero horizontal overflow. |
| P7 | Dev and production servers render the Studio, not merely a successful HTTP response. | Four Playwright cases pass against both `:8090` dev and `:8091` production preview. |

## 4. Port and Isolation Evidence

The closure walker begins at the six Studio modules and four grass modules,
follows literal relative imports, and resolves exactly 104 files: 101 under
`src/lib/pixelbrain/` plus one file in each of `src/lib/constants/`,
`src/lib/microprocessors/`, and `src/lib/quantization/`. Every mapped target
file is compared as bytes to its source before execution begins.

The second differential test imports both registries and executors. It loads
all 54 adapters, invokes the five support records through the support inspector,
invokes all ten mutation records through proposal, and previews the remaining
39 runnable/runtime-gated records. Complete returned values are compared with
deep equality; receipts and diffs are not reduced to shape checks.

Production source scans found no target import of root `codex/`, root
`src/lib/pixelbrain.adapter.js`, or root `src/pages/PixelBrain/`. The root
PixelBrain page, route, adapter, and core sources have no implementation diff
from this port.

## 5. Facade, State, and Route Evidence

The facade surface is exactly:

```text
getStudioAmpManifest             planStudioAmps
getStudioAdapterCoverage         inspectStudioSupportExecution
previewStudioAmpExecution        commitStudioAmpExecution
proposeStudioMutationExecution   createStudioAssetSnapshot
getStudioGrassDefaults           getStudioGrassPalettes
generateStudioGrass              beginStudioMutation
acceptStudioMutation             rejectStudioMutation
```

The standalone state begins from a frozen 32x32 rectangular snapshot. Commit
installation validates the receipt's base checksum, records parent lineage,
and advances to the receipt output checksum. Mutation installation validates
the same lineage, while rejection returns the exact current object. Receipt
and fault ledgers are immutable, newest-first, and capped at 20.

Only `foundry`, `amps`, `mutations`, and `diagnostics` are routable tabs.
Keyboard Arrow, Home, and End navigation uses roving focus and updates the URL.
All deferred Phase-B IDs normalize to Foundry and render no placeholders.

## 6. Determinism and Checksum Witness

Representative target-local `grass` preview from the initial standalone
snapshot:

```text
snapshotChecksum  studio-output1:d8671f51586018c9b2ec63d6475233d118fe8ca70f5f92aad30258cfa34c7b7c
planChecksum      studio-plan1:aefd96a71d125cdee9b07797815d30266dd55b1931cbd81356b69c58239290fb
manifestChecksum 548324adabc8c6d801a8c47be78fba5e38863354d7234a89d134f9ea721d3149
outputChecksum    studio-output1:c99922654e40ea1280a5e1f712bfb3793171b68c0b5ec5db66b0e7a16099491b
coverage          54 records, missing=[], extra=[]
```

The same output checksum appears in the browser receipt and Diagnostics ledger.

## 7. Visual Evidence

Target captures retained with this PIR:

- [Foundry desktop](./assets/pixelbrain-studio-standalone/foundry-desktop.png)
- [AMP Conveyor desktop](./assets/pixelbrain-studio-standalone/amps-desktop.png)
- [Mutation Lab mobile](./assets/pixelbrain-studio-standalone/mutations-mobile.png)
- [Diagnostics desktop](./assets/pixelbrain-studio-standalone/diagnostics-desktop.png)

All four were inspected at original resolution. Foundry keeps the source
three-bench composition and exact seed-23063 field, with nearest-neighbour
pixels and the canvas as the dominant surface. Mutation Lab keeps the locked
baseline and disabled accept/reject controls before a proposal. AMP Conveyor
shows the real checked `grass` record, deterministic plan, and preview receipt.
Diagnostics shows the same receipt and 54/54 coverage. Desktop and Pixel 7
layouts have no page-level horizontal overflow.

The repository has source goldens for Foundry desktop and Mutation mobile;
those were inspected side by side with the target captures. Their information
hierarchy and control semantics agree while the standalone intentionally uses
the target SWARD palette, Figtree/Fraunces/IBM Plex typography, and lacks the
root application's global navigation. No source golden exists for AMP
Conveyor or Diagnostics, so those two comparisons are structural/behavioral,
not pixel-diff claims.

## 8. Verification Commands and Results

```text
npm test
PASS — 195 platform script tests + 45 TypeScript auth/data tests + 12 port tests

npm run typecheck
PASS — strict TypeScript, no emit

npm run build
PASS — 1,939 client modules, 172 SSR modules, 1,934 Nitro modules;
       Vercel output generated; DATABASE_URL-absent migration skipped as designed

npx playwright test tests/visual/studio-tabs.spec.mjs --reporter=line
PASS — 4/4 against the live development app (desktop + Pixel 7)

STUDIO_PREVIEW=1 npx playwright test tests/visual/studio-tabs.spec.mjs --reporter=line
PASS — 4/4 against the production preview (desktop + Pixel 7)
```

The browser suite verifies the four-tab count, root/invalid redirects, keyboard
navigation, deterministic 32x32 grass render, a real `grass` AMP preview,
disabled pre-proposal mutation controls, receipt retention, 54/54 coverage,
no uncaught page errors, and no horizontal overflow.

## 9. Implementation Deviations and Repairs

- The PDR's illustrative file map named `src/styles/pixelbrain.css`; the scoped
  rules were added to the target's existing single `src/styles.css` entry
  instead. Every new selector uses `pbs-*`, so the isolation requirement is
  preserved without another stylesheet import.
- Repairing the skeleton's quoted test glob exposed 195 dormant platform tests.
  Eight PWA tests were unintentionally reading this app's real `site.json` and
  card assets; they now use an explicit empty-workspace fixture. Production PWA
  precedence was not changed.
- Node 20 cannot run Node 22's `--experimental-strip-types`; the test command now
  uses the local `tsx` loader, so all existing TypeScript tests actually run on
  the implementation host. The project still emits the pre-existing TanStack
  package engine warnings during installation, but test, build, dev, and preview
  execution pass on Node 20.20.2.
- The byte-identical mirror deliberately retains trailing whitespace present in
  its source closure. `git diff --check` is clean for authored and scaffold files;
  normalizing those mirrored lines would violate the byte-for-byte port oracle.

## 10. Migration, Rollback, and Deferred Work

There is no data migration. The old target `Studio.tsx` remains in the tree but
is no longer the root route; rollback is a route revert plus removal of the
new target-local mirror and components. The main Scholomance app remains an
independent working home throughout.

Phase B remains explicitly deferred under the PDR escalation. Canvas/Aseprite,
Blueprint, Material & Finish, Mentor & Reference, Library & Export, and the two
coupled legacy components were not copied, routed, or represented as active.

## 11. Final Verdict

The corrected Phase A PDR is fulfilled. PixelBrain Studio now has a genuinely
standalone, visually inspectable execution home whose 54 capabilities are
target-local and source-equivalent, whose mutation path preserves immutable
lineage, and whose browser state remains sovereign and bounded.
