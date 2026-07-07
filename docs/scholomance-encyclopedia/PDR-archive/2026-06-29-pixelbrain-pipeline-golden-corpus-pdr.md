# PDR: PixelBrain Pipeline Golden Corpus
## Mutation and polish fixtures for trustworthy forge immunity

## Bytecode Search Code

`SCHOL-ENC-PDR-PIXELBRAIN-PIPELINE-GOLDEN-CORPUS-v1`

**Status:** In Progress
**Classification:** PixelBrain | Immunity | QA Corpus | CLI Gate | Visual Fidelity
**Priority:** Critical
**Primary Goal:** Add a deterministic mutation/golden corpus that proves the PixelBrain forge gate catches amateur structural failures and that finish AMPs preserve professional pixel-art invariants.

---

# 1. Executive Summary

The PixelBrain craft gate now blocks many known bad assets, but it needs a reusable corpus to prevent regressions and to make the pipeline trustworthy instead of merely promising. This PDR defines a data-driven internal corpus runner with one explicit fixture for each high-risk failure or polish invariant: unauthorized hue, bad voxel sort, invalid voxel material ID, disconnected handle, floating island pixel, pillow-shading regression, AA stair-step, gem faceting, and tiny-detail clutter. The runner must be callable from a CLI and reusable by QA-owned tests without requiring test authors to duplicate fixture logic.

The corpus does not create a new persisted bytecode family. Blocking asset failures continue to emit `PB-ERR-v1`, and passing forge-gate runs may continue to emit `PB-XP-v1`. The corpus report is an internal diagnostic envelope that summarizes case outcomes and embeds the craft-gate reports or finish-suite evidence needed by the immune system.

---

# 2. Problem Statement

The forge pipeline is stronger after the strict craft gate, but coverage is still too narrow:

- Existing tests contain individual examples but do not form a named corpus with stable case IDs.
- Some failure classes are only manually smoke-tested, so regressions can slip in during later AMP work.
- Finish-suite behavior is partly tested at the function level, but not collected with the same pass/fail vocabulary as gate mutations.
- The AI correction loop needs stable, repeated examples of what "amateur" means in bytecode terms.

Without a corpus, the pipeline can drift back toward deterministic but unprofessional assets.

---

# 3. Product Goal

Create a reusable PixelBrain pipeline corpus that answers one question deterministically:

> Given the current forge and finish suite, do all known bad mutations fail loudly, and do all required professional polish passes preserve their expected invariants?

---

# 4. Non-Goals

- Do not introduce a new persisted bytecode family.
- Do not replace `PixelBrainCraftGateReport`.
- Do not move visual judgement into PNG/image comparison.
- Do not create UI surfaces.
- Do not alter user-authored browser data flows.
- Do not attempt exhaustive class coverage for every item archetype in this pass.

---

# 5. Core Design Principles

1. **Bytecode first:** Blocking forge failures must expose `PB-ERR-v1` bytecode through the existing craft gate.
2. **Corpus as contract:** Each case gets a stable ID, expected status, expected audit or invariant, and deterministic evidence.
3. **Mutation over snapshots:** Bad cases should be generated from a known-good base asset so the failure source is isolated.
4. **Pixel logic over raster taste:** Finish cases assert measurable professional invariants such as directional light asymmetry, legal AA provenance, hard facet tones, and detail budget simplification.
5. **QA handoff ready:** The core runner lives outside `tests/` so QA-owned tests can import it without reimplementing fixture setup.

---

# 6. Feature Overview

## 6.1 Corpus Cases

| Case ID | Type | Expected Result | Required Evidence |
|---|---|---|---|
| `gate.unauthorized-final-hue` | Mutation | Fail | `materialAuthority.final-colors` failure with `PB-ERR-v1` |
| `gate.bad-voxel-sort` | Mutation | Fail | `voxelPacket.contract-health` failure with `PB-ERR-v1` |
| `gate.invalid-voxel-material-id` | Mutation | Fail | unresolved `voxel.materialId` failure with `PB-ERR-v1` |
| `gate.disconnected-handle` | Mutation | Fail | construction or silhouette failure with `PB-ERR-v1` |
| `gate.floating-island-pixel` | Mutation | Fail | `pixelLogic.floating-islands` failure with `PB-ERR-v1` |
| `finish.directional-anti-pillow` | Golden | Pass | lit half outshines shadow half under directional light |
| `finish.pixel-aa-stair-step` | Golden | Pass | inner stair-step cell receives documented AA provenance |
| `finish.gem-faceting` | Golden | Pass | gem interior has multiple registry facet tones |
| `finish.detail-budget-tight-interior` | Golden | Pass | tight interior simplifies motifs and drops glow |

## 6.2 CLI

Add a CLI:

```bash
node scripts/pixelbrain-pipeline-corpus.mjs --json
```

Human output should be compact and fail fast for operators. JSON output should include all case IDs, status, expected audits/invariants, and any `PB-ERR-v1` values produced by the craft gate.

---

# 7. Architecture

```
voidmetal-pickaxe spec
  -> forgeItemAsset()
  -> mutation cases clone the good bundle/spec
  -> runForgeCraftGate(..., { throwOnFail: false })
  -> assert expected audit + PB-ERR-v1

finish fixtures
  -> sketch/selout/AA/facet/detail modules
  -> deterministic invariant checks
  -> corpus case evidence

corpus runner
  -> PixelBrainPipelineCorpusReport
  -> CLI human/JSON output
```

The runner must use existing modules:

- `runForgeCraftGate`
- `forgeItemAsset`
- `sketchToSilhouette`
- `applyPixelAA`
- `applyFacets`
- `applyDetailBudget`
- `MATERIAL_PALETTES`

---

# 8. Module Breakdown

## 8.1 `codex/core/pixelbrain/pipeline-golden-corpus.js`

Exports:

- `PIPELINE_CORPUS_CONTRACT`
- `runPixelBrainPipelineCorpus(options)`
- `runPipelineCorpusCase(caseId, options)`
- `PIPELINE_CORPUS_CASE_IDS`

Responsibilities:

- Build a valid base pickaxe bundle.
- Generate deterministic mutations.
- Execute craft-gate and finish-suite assertions.
- Return a frozen internal diagnostic report.

## 8.2 `scripts/pixelbrain-pipeline-corpus.mjs`

Responsibilities:

- Run the full corpus.
- Support `--json`.
- Exit `0` on pass and `1` on fail.
- Print `PB-ERR-v1` bytecodes and failed case IDs in human mode.

## 8.3 `SCHEMA_CONTRACT.md`

Register the internal `PixelBrainPipelineCorpusReport` shape without reserving a new persisted bytecode family.

---

# 9. ByteCode IR Design

No new bytecode family is reserved.

Corpus failures fall into two categories:

- **Forge mutation failures:** Must contain `PB-ERR-v1` from the craft gate.
- **Corpus assertion failures:** Remain internal report failures unless they expose a gate-generated `PB-ERR-v1`.

The internal report contract is:

```ts
interface PixelBrainPipelineCorpusReport {
  contract: "pixelbrain.pipeline-corpus.v1";
  schemaVersion: "0.1.0";
  status: "pass" | "fail";
  summary: {
    cases: number;
    passed: number;
    failed: number;
  };
  cases: PixelBrainPipelineCorpusCase[];
  bytecodeErrors: string[];
}
```

---

# 10. Implementation Phases

## Phase 1: Corpus Contract and PDR

- Create this PDR.
- Index it in the PDR archive.
- Register the internal report shape in the schema contract.

## Phase 2: Core Corpus Runner

- Implement mutation cases for strict gate failures.
- Implement finish-suite golden cases.
- Freeze reports and case results for determinism.

## Phase 3: CLI

- Add the corpus CLI.
- Support human and JSON output.
- Ensure failing mutation cases still make the full corpus pass when the expected gate failure appears.

## Phase 4: Verification and PIR

- Run targeted PixelBrain tests.
- Run the corpus CLI.
- Run encyclopedia hygiene audit.
- Write and index a PIR.

---

# 11. QA Requirements

- The corpus must pass on the existing golden `voidmetal-pickaxe.v1.json`.
- Every gate mutation must produce at least one `PB-ERR-v1`.
- Every gate mutation must prove the expected audit ID failed.
- Finish cases must assert deterministic pixel-art invariants, not subjective image comparisons.
- QA-owned Vitest files may import the runner later without duplicating corpus setup.

---

# 12. Success Criteria

- `node scripts/pixelbrain-pipeline-corpus.mjs --json` exits `0`.
- The JSON report contains all nine required cases.
- A deliberately broken corpus case would exit `1` and expose the failed case ID.
- Existing PixelBrain focused tests remain green.
- The encyclopedia hygiene audit passes with no errors.
