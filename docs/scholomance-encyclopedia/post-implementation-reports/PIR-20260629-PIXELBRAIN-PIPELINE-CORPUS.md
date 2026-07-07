# Post-Implementation Report

## Bytecode Search Code

`SCHOL-ENC-BYKE-SEARCH-PIR-PIXELBRAIN-PIPELINE-CORPUS-v1`

## 1. Change Identity

- **Report ID:** PIR-20260629-PIXELBRAIN-PIPELINE-CORPUS
- **Feature / Fix Name:** PixelBrain Pipeline Golden Corpus
- **Author / Agent:** Codex
- **Date:** 2026-06-29
- **Branch / Environment:** local workspace
- **Related Task / Ticket / Prompt:** Implement `2026-06-29-pixelbrain-pipeline-golden-corpus-pdr.md`
- **Classification:** Behavioral / Architectural / PixelBrain QA tooling
- **Priority:** Critical

## 2. Executive Summary

Implemented a deterministic PixelBrain mutation/golden corpus that turns the pipeline's known craft and finish risks into stable case IDs. The new runner covers unauthorized final hues, voxel sort order, invalid voxel material IDs, disconnected pickaxe handles, floating island pixels, directional anti-pillow shading, AA stair-step provenance, gem faceting, and tight-detail budgeting. A new CLI emits either compact operator output or the full `pixelbrain.pipeline-corpus.v1` JSON report. The schema contract was updated to v1.30 for the internal report shape without reserving a new persisted bytecode family.

## 3. Intent and Reasoning

### Problem Statement

The strict craft gate could catch several failures, but coverage was split between individual tests and manual smoke checks. That made the pipeline stronger than before, but not yet trustworthy as a repeatable immunity benchmark.

### Why This Change Was Chosen

A reusable core runner keeps the fixture logic outside QA-owned test files while still making it importable by future QA tests. Mutation cases clone a known-good forge bundle and perturb one invariant at a time, so each expected failure is isolated and AI-parsable through `PB-ERR-v1`.

### Assumptions Made

- The golden base asset is `specs/voidmetal-pickaxe.v1.json`.
- The corpus report is an internal diagnostic envelope, not a persisted bytecode artifact.
- QA-owned Vitest files can import this runner later if Gemini/QA expands formal coverage.

## 4. Scope of Change

### In Scope

- PDR creation and archive index update.
- Internal corpus report schema registration.
- Core PixelBrain corpus runner.
- CLI for corpus execution.
- PIR and encyclopedia index update.

### Out of Scope

- UI surfaces.
- New persisted bytecode families.
- Editing QA-owned test files.
- Pixel/image snapshot comparison.

## 5. Files and Systems Touched

| Area | File | Type of Change | Risk |
|------|------|----------------|------|
| PDR | `docs/scholomance-encyclopedia/PDR-archive/2026-06-29-pixelbrain-pipeline-golden-corpus-pdr.md` | New requirements doc | Low |
| Schema | `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` | Internal report contract v1.30 | Medium |
| Core | `codex/core/pixelbrain/pipeline-golden-corpus.js` | New corpus runner | Medium |
| CLI | `scripts/pixelbrain-pipeline-corpus.mjs` | New corpus command | Medium |
| Docs | This PIR and indexes | Implementation record | Low |

## 6. Behavior Changes

- `runPixelBrainPipelineCorpus()` returns a frozen `pixelbrain.pipeline-corpus.v1` report.
- `runPipelineCorpusCase(caseId)` runs a single stable case.
- `node scripts/pixelbrain-pipeline-corpus.mjs` prints compact human output.
- `node scripts/pixelbrain-pipeline-corpus.mjs --json` prints the full corpus report with embedded `PB-ERR-v1` evidence.
- `node scripts/pixelbrain-pipeline-corpus.mjs --case <id>` runs one corpus case.

## 7. Verification

Corpus checks:

```bash
node scripts/pixelbrain-pipeline-corpus.mjs
node scripts/pixelbrain-pipeline-corpus.mjs --json
node scripts/pixelbrain-pipeline-corpus.mjs --case gate.bad-voxel-sort --json
```

Result: 9 corpus cases passed.

Focused lint:

```bash
npm exec eslint -- codex/core/pixelbrain/pipeline-golden-corpus.js scripts/pixelbrain-pipeline-corpus.mjs
```

Result: passed.

Focused PixelBrain tests:

```bash
npm exec vitest -- run tests/core/pixelbrain/forge-craft-gate.test.js tests/core/pixelbrain/finish-suite.test.js tests/core/pixelbrain/silhouette-blueprint-golden.test.js
```

Result: 3 files passed, 32 tests passed, 1 skipped.

Encyclopedia hygiene:

```bash
node docs/scholomance-encyclopedia/tools/audit-hygiene.mjs
```

Result: passed, 0 errors, existing warning-only search-anchor debt unchanged at 98 markdown files.

## 8. Residual Risk

The corpus is now reusable, but no QA-owned Vitest file was edited in this implementation. The next QA pass should import `runPixelBrainPipelineCorpus()` and assert the stable report shape directly under `tests/core/pixelbrain/` when that ownership lane is available.
