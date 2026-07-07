# PDR: PixelBrain Craft Gate & Finish Suite Convergence
## Strict compiler immunity first, professional pixel-art finish second

**Bytecode Search Code:** `SCHOL-ENC-PDR-PIXELBRAIN-CRAFT-GATE-FINISH-CONVERGENCE-v1.0`
**Date:** 2026-06-29
**Status:** Draft
**Classification:** PixelBrain | Immunity | CLI Gate | AMP Finish Suite | Visual Fidelity | Deterministic Asset Pipeline
**Priority:** Critical
**Primary Goal:** Make PixelBrain refuse structurally amateur forge assets with strict `PB-ERR-v1` craft failures, then apply deterministic directional-light finish AMPs only to assets that pass the gate.

**Source PDRs:**
- [`2026-06-19-pixelbrain-craft-gate-immunity-pdr.md`](./2026-06-19-pixelbrain-craft-gate-immunity-pdr.md)
- [`2026-06-11-pixelbrain-directional-light-finish-pdr.md`](./2026-06-11-pixelbrain-directional-light-finish-pdr.md)
- [`2026-06-19-pixelbrain-silhouette-blueprint-gate-pdr.md`](./2026-06-19-pixelbrain-silhouette-blueprint-gate-pdr.md)

---

# 1. Executive Summary

PixelBrain can already generate deterministic assets, but determinism alone does not make a sprite professional. A deterministic asset can still have crawling diagonals, floating island pixels, weak silhouette relationships, off-palette colors, invalid voxel material ids, or smooth procedural pillow shading. The compiler needs two linked upgrades:

1. A strict **PixelBrain Craft Gate** that blocks amateur or contract-unsafe assets at CLI time and emits stable `PB-ERR-v1` failures for the immune system.
2. A **Directional Light & Finish Suite** that runs after legal construction and replaces procedural-looking output with directional shading, selective outlines, pixel-art anti-aliasing, gem faceting, and detail budgeting.

This PDR is a convergence spec. It does not replace the earlier Craft Gate and Directional Light PDRs. It tightens their acceptance contract into one implementation path: **gate the structure, apply finish AMPs, gate the final artifact again**.

# 2. Problem Statement

The current forge pipeline can accept an asset because it is deterministic and bytecode-shaped while still producing work that reads as amateur pixel art. This is a compiler problem, not just an art problem. If the compiler accepts a shaky diagonal handle, a disconnected pixel island, an unregistered hue, or a voxel packet with bad ordering, the AI has no machine-readable immune feedback telling it why the asset is not shippable.

The finish pipeline has a parallel issue. Existing procedural shading can use distance-from-edge as brightness, creating radial pillow-shading bands. Flat outlines, raw curve stair-steps, smooth gem ramps, and overfilled 3px details make outputs look generated even when the structure is valid. Visual polish must be deterministic, material-authoritative, and subordinate to construction.

# 3. Product Goal

Add a strict forge workflow:

```bash
node scripts/pixelbrain-forge-gate.mjs specs/voidmetal-pickaxe.v1.json --strict --json
node scripts/pixelbrain-forge-gate.mjs specs/voidmetal-pickaxe.v1.json --strict --blueprint specs/voidmetal-pickaxe.silh --json
```

Target pipeline:

```text
ITEM-SPEC-v1
  -> forgeItemAsset()
  -> pre-finish craft gate
       pixel logic
       construction + silhouette readability
       material authority
       volume + PB-VOXEL-ITEM-v1 packet health
  -> finish suite
       directional shading
       selout
       pixel AA
       gem faceting
       detail budget
  -> post-finish craft gate
       final color authority
       final lattice integrity
       final voxel packet determinism
  -> PixelBrainCraftGateReport
  -> PB-ERR-v1 failures or PB-XP-v1 immune memory
```

The strict gate must make bad assets impossible to mistake for successful assets. The finish suite must make legal assets look intentionally finished rather than procedurally filled.

# 4. Non-Goals

- Do not create a new persisted bytecode family such as `PB-FORGE-GATE-v1`.
- Do not treat PNGs, screenshots, shaders, or canvas previews as authority.
- Do not let finish AMPs change silhouette geometry, voxel dimensions, material ids, or sealed `.silh` blueprint intent.
- Do not use live AI, network access, wall-clock time, `Math.random`, or environment-dependent behavior in the forge/gate path.
- Do not add a `/pixelbrain` UI surface as the source of truth. UI may consume the report later through adapters, but the CLI/core gate remains authoritative.
- Do not repaint failed assets inside the gate. The gate diagnoses and blocks; generators or later repair loops may respond to bytecode errors.

# 5. Core Design Principles

- **Construction before polish.** Silhouette, connectivity, anchors, and voxel packet health must pass before directional lighting or AA can be trusted.
- **Readability before effects.** A pickaxe must read as a pickaxe in 1-bit silhouette before glow, selout, or gem sparkles matter.
- **Lattice is law.** Audits inspect integer coordinates, part ids, material ids, construction hints, volume buffers, and voxel packets.
- **Material authority is absolute.** Every emitted final color must trace to a registry material anchor or a documented palette quantization/blend.
- **Errors are bytecode.** Blocking failures emit `PB-ERR-v1` with parseable context, stable checksums, and repair-relevant evidence.
- **Finish is deterministic.** AMPs are pure coordinate transforms over canonical inputs. Same spec and options produce byte-identical outputs.
- **No amateur exceptions in strict mode.** Strict mode fails on floating islands, crawl-prone diagonals, unbound construction, unauthorized colors, and malformed voxel packets.

# 6. Feature Overview

## 6.1 Strict Craft Gate

The craft gate must return the registered CLI/internal `PixelBrainCraftGateReport` contract from `SCHEMA_CONTRACT.md`:

```ts
interface PixelBrainCraftGateReport {
  contract: "pixelbrain.craft-gate.v1";
  schemaVersion: "0.1.0";
  source: {
    path: string | null;
    specId: string | null;
    artifactKind: "ITEM-SPEC-v1" | "pixelbrain.asset.v1" | "PB-VOXEL-ITEM-v1";
  };
  strict: boolean;
  status: "pass" | "fail";
  summary: { audits: number; failures: number; warnings: number; fatal: number };
  audits: PixelBrainCraftGateAudit[];
  bytecodeErrors: string[];
}
```

Required strict audit targets:

| Target | Blocking checks |
|---|---|
| `pixelLogic` | Detect crawling/jittery diagonal runs, uncontrolled stair cadence, isolated 1-cell islands, motif/rim conflicts, and noisy single pixels that do not belong to a part cluster. |
| `construction` | Enforce required anchors, part attachments, handle/head relationships, collar/head overlap, inlay containment, and blueprint mould constraints when `.silh` is supplied. |
| `silhouetteReadability` | Require one connected silhouette for the intended class unless an explicitly allowed detached part exists; verify pickaxe head/base/handle anatomy reads in 1-bit inspection. |
| `materialAuthority` | Reject final colors that cannot be traced to `material-registry.js`, source-palette quantization, or an approved two-color blend emitted by a named AMP. |
| `volume` | Verify dimensions, typed-array lengths, non-empty occupied cells, legal energy values, legal energy types, and no illegal energy mass contribution. |
| `voxelPacket` | Verify `PB-VOXEL-ITEM-v1`, positive dimensions, integer in-bounds voxels, canonical `y -> z -> x` ordering, positive material ids, valid material table references, and paired `energy`/`energyType`. |
| `determinism` | Forge twice and compare stable packet JSON, lattice hashes, volume diagnostics, voxel packet, and finish output hashes. |

## 6.2 Directional Light & Finish Suite

The finish suite runs only after pre-finish structure passes. Existing modules may be hardened rather than duplicated:

| AMP | Required behavior |
|---|---|
| `normal-estimation.js` | Use the gradient of the distance field to approximate per-cell normals; fall back to analytic part normals if tiny forms make the gradient unstable. |
| directional shading in `sketch-amp.js` | Replace radial brightness authority with `depth + normal dot light + ambient`; preserve legacy mode when no `light` option is supplied. |
| `selout-amp.js` | Modulate outline anchors by light direction while keeping the declared material family. Lit edge shifts brighter; shadow edge shifts darker. |
| `pixel-aa-amp.js` | Recolor eligible inner-corner cells on 1-cell curve steps with a documented 50/50 adjacent-color blend; never add/remove cells or soften deliberate points. |
| `facet-amp.js` | For gem-class/faceted parts, replace smooth ramps with planar regions, hard tonal borders, and deterministic sparkle cells. |
| `detail-budget.js` | Enforce width-aware detail policy: width >= 7 gets motif + glow; width 4-6 gets motif only; width <= 3 gets single-pixel accents. |

The post-finish gate must prove these AMPs did not introduce unauthorized hues, geometry drift, disconnected islands, or nondeterminism.

# 7. Architecture

```text
codex/core/pixelbrain/item-foundry.js
  -> forgeItemAsset(spec)
  -> codex/core/pixelbrain/forge-craft-gate.js
       runForgeCraftGate(spec, {
         strict: true,
         blueprint,
         finish: false
       })
  -> render-fidelity / finish AMPs
       normal-estimation
       directional shading
       selout
       pixel AA
       facet
       detail budget
  -> forge-craft-gate.js
       runForgeCraftGate(finalBundle, {
         strict: true,
         phase: "postFinish"
       })
  -> scripts/pixelbrain-forge-gate.mjs
       --strict
       --json
       --blueprint <file.silh>
       --finish
```

The gate is pure core logic. The CLI is a thin wrapper for file IO, JSON output, human output, and exit codes. Any later UI must read a normalized report through an adapter and must not import core modules directly.

# 8. Module Breakdown

| File | Change |
|---|---|
| `codex/core/pixelbrain/forge-craft-gate.js` | Harden into a report-returning strict auditor instead of a mostly exception-based checker; add explicit audit records for all required targets. |
| `scripts/pixelbrain-forge-gate.mjs` | Support `--strict`, `--json`, `--blueprint`, `--finish`, stable exit code 0/1, and emission of all `bytecodeErrors`. |
| `codex/core/pixelbrain/normal-estimation.js` | Preserve deterministic central differences; add stability diagnostics for thin forms and analytic fallback hooks. |
| `codex/core/pixelbrain/sketch-amp.js` | Ensure directional mode separates depth from illumination and keeps radial legacy mode intact. |
| `codex/core/pixelbrain/selout-amp.js` | Gate all emitted colors through registry anchors. |
| `codex/core/pixelbrain/pixel-aa-amp.js` | Emit blend provenance so `materialAuthority` can accept only documented AA colors. |
| `codex/core/pixelbrain/facet-amp.js` | Ensure faceted part metadata survives normalization and all colors resolve through material anchors. |
| `codex/core/pixelbrain/detail-budget.js` | Integrate with generators so small interiors cannot request both motifs and glow shells. |
| `tests/core/pixelbrain/forge-craft-gate.test.js` | Expand mutation-negative tests for strict gate failure modes. |
| `tests/core/pixelbrain/finish-suite.test.js` | Expand anti-pillow, selout, AA, facet, registry, and determinism coverage. |

# 9. ByteCode IR Design

No new persisted bytecode family is allowed. Blocking failures use existing `PB-ERR-v1` categories and modules. The gate aggregates them into `PixelBrainCraftGateReport.bytecodeErrors`.

| Failure | Category | Severity | Module | Code family |
|---|---|---|---|---|
| missing required spec field or malformed option | `VALUE` | `CRIT` | `IMMUNE` or `SCHEMA` if registered locally | `0103` missing required / `0102` invalid format |
| out-of-bounds coordinate or voxel | `COORD` or `RANGE` | `CRIT` | `COORD` | `0602` coordinate out of bounds / `0201` out of bounds |
| crawling diagonal, floating island, weak class silhouette | `STATE` | `CRIT` | `IMMUNE` | immune invariant block |
| handle not attached to head base / construction anchor missing | `STATE` | `CRIT` | `IMMUNE` | immune invariant block |
| unauthorized final hue | `COLOR` or `VALUE` | `CRIT` | `COLBYT` or `IMMUNE` | `0703` color-byte mismatch / invalid value |
| invalid material id in voxel packet | `VALUE` | `CRIT` | `IMMUNE` | invalid enum/value |
| unsorted voxel packet | `STATE` | `CRIT` | `IMMUNE` | invalid state |
| finish AMP nondeterminism | `STATE` | `CRIT` | `IMMUNE` | deterministic invariant block |
| anti-aliasing blend without provenance | `COLOR` | `CRIT` | `COLBYT` | color-byte mismatch |

Every bytecode context must include enough evidence for repair:

```json
{
  "audit": "pixelLogic",
  "partId": "handle",
  "reason": "crawling diagonal cadence",
  "cells": [[12, 28], [13, 29], [13, 30]],
  "expectedInvariant": "diagonal run cadence remains stable and connected"
}
```

# 10. Implementation Phases

| Phase | Deliverable | Acceptance |
|---|---|---|
| 0 | Contract alignment audit | Confirm `PixelBrainCraftGateReport`, `PB-VOXEL-ITEM-v1`, and `.silh` gate targets match `SCHEMA_CONTRACT.md`; no schema drift. |
| 1 | Strict gate report mode | CLI emits JSON and human output from the same report; every failed strict audit carries `PB-ERR-v1`. |
| 2 | Pixel logic + construction audits | Crawling diagonals, floating islands, weak handle/head attachment, missing anchors, and bad 1-bit silhouettes fail. |
| 3 | Material + voxel packet audits | Unauthorized hues, invalid material ids, bad voxel ordering, out-of-bounds voxels, bad energy pairs, and volume length mismatches fail. |
| 4 | Finish suite integration | Directional shading, selout, AA, facet, and detail budget run behind opt-in `--finish`; legacy no-light mode stays pinned. |
| 5 | Post-finish gate | Final colors, geometry, determinism, and voxel packet health pass after finish AMPs; any polish-introduced violation fails. |
| 6 | Immune memory handoff | Passing strict reports may feed `PB-XP-v1`; failing reports expose stable bytecode errors for repair loops. |

# 11. QA Requirements

## 11.1 Strict Gate Mutation Tests

- Valid voidmetal pickaxe spec passes in strict mode.
- Jagged/crawling diagonal handle fails with `pixelLogic`.
- Detached 1-cell island fails with `pixelLogic`.
- Pickaxe handle not connected to head base fails with `construction`.
- Missing required part anchor fails with `construction`.
- 1-bit silhouette that no longer reads as a pickaxe fails with `silhouetteReadability`.
- Final color not from registry, source quantization, or approved blend fails with `materialAuthority`.
- Lowercase or malformed `#RRGGBB` color hints fail when present in voxel material tables.
- `VoxelVolume` typed-array length mismatch fails.
- `PB-VOXEL-ITEM-v1` voxel out of bounds fails.
- `materialId: 0` or unresolved material id fails.
- Voxel order not sorted by `y -> z -> x` fails.
- `energy` without `energyType`, `energyType` without `energy`, illegal energy type, or energy outside `0..1` fails.
- Forge-twice mismatch fails with deterministic evidence.

## 11.2 Finish Suite Tests

- Directional mode passes the anti-pillow property: lit half has higher mean luminance than shadow half on a convex fixture.
- Legacy radial mode remains unchanged when no `light` option is supplied.
- Selout preserves geometry and emits only material-registry anchors.
- Pixel AA preserves geometry, never recolors rim cells, exempts motifs/deliberate points, and emits blend provenance.
- Faceted gem parts use at least two hard tonal planes from registry anchors and no smooth radial ramp.
- Detail budget prevents motif + glow shell on interiors <= 3px.
- Full `--finish` pipeline is deterministic across repeated runs.
- Post-finish `materialAuthority` accepts approved blends and rejects free hues.

## 11.3 CLI Tests

- `--json` output parses as `PixelBrainCraftGateReport`.
- Exit code `0` only on `status: "pass"`.
- Exit code `1` on any strict blocking failure.
- Human output names the failed audit ids and prints bytecode errors.
- `--blueprint` includes `silhouetteBlueprint` and `silhouetteAnimation` audits.
- The CLI does not require server, network, browser, or canvas access.

# 12. Success Criteria

PixelBrain succeeds when the same forge input can no longer silently produce "deterministic but amateur" output. In strict mode:

- Bad structure fails before finish.
- Bad final polish fails after finish.
- Every blocking failure is a stable `PB-ERR-v1`.
- Every final color has material authority.
- Every voxel packet is in-bounds, sorted, and material-valid.
- Directional light breaks pillow shading.
- Selout, AA, facet, and detail-budget passes improve professional read without corrupting lattice or material contracts.

The voidmetal pickaxe is the first acceptance target. It must pass strict pre-finish gate, pass `--finish`, pass strict post-finish gate, and fail deterministically when any required invariant is intentionally corrupted.

# 13. Handoffs

- **Codex** owns schema alignment and confirms no new bytecode family is reserved.
- **Gemini** owns core implementation, CLI behavior, mutation-negative tests, and bytecode assertion coverage.
- **Claude/UI** may later surface `PixelBrainCraftGateReport` in `/pixelbrain` only through an adapter, after the CLI/core contract is green.
- **Arbiter** should review whether strict mode is genuinely blocking amateur assets rather than merely logging warnings.
