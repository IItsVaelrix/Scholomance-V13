# PIR — PB-Semantics (SemQuant): PixelBrain Semantic Annotation & Type Unification Layer

**Status:** Completed  
**Date:** 2026-07-02  
**Author:** Grok (xAI) assisted by Antigravity (Gemini domain)  
**Tracked at:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260702-PB-SEMANTICS-SEMQUANT.md`

---

## 1. Executive Summary

We have implemented **PB-Semantics (SemQuant)** — the semantic annotation and type unification layer for PixelBrain authoring. SemQuant sits between input adapters and deterministic lowering passes, converting heterogeneous authoring signals (SCDL ops, construction specs, future SDF nodes, Aseprite layers, shape grammars) into a canonical set of semantic types with roles, parts, materials, effects, construction guides, provenance, and confidence scores.

This directly enables "creative autonomy" by eliminating semantic drift: a layer named "00_Reference/ring_body", an SCDL `glow` op, a construction `ring`, and an SDF node can now all resolve to the same machine-readable meaning before any pixels are rasterized.

Key outcomes:
- New `codex/core/pixelbrain/semantic/` module with IR node shape, unifier pass, and initial adapters.
- Thin, non-disruptive integration into the SCDL compiler (after parse/validate).
- Semantic metadata propagates through `expand-vector`, `expand-cells`, and `emit-packet` into final `PixelBrainAssetPacket` coordinates.
- PB-SEM-* diagnostic family (e.g. `PB-SEM-003 MISSING_MATERIAL_BINDING`).
- 8 dedicated SemQuant tests + full SCDL suite now at 72 passing tests (0 regressions).
- Construction adapter stub demonstrates extensibility for future authoring surfaces.
- Determinism, packet contracts, exporters, and golden fixtures untouched.

---

## 2. Changes Made

All new semantic code lives in a dedicated subtree. Only minimal, reversible bridges were added to the SCDL pipeline.

### New files (`codex/core/pixelbrain/semantic/`)
- `semantic-types.js` — `PB-SEM-v1`, `SemanticDomains`, `CanonicalRoles`, `SemanticDiagnosticCodes` (PB-SEM-001..005)
- `semantic-aliases.js` — deterministic `ROLE_ALIASES` table (body/torso → body, rim/outline/edge → rim, reference/guide → constructionGuide, etc.)
- `pixelbrain-ir-node.js` — `createIRNode()` factory for the shared IR shape
- `semantic-unifier.js` — `semanticUnifierPass()` core: role/effect/part/material inference, multi-role collection from compound names, confidence scoring, diagnostics emission
- `adapters/scdl-to-ir.adapter.js` — SCDL AST (parts + ops) → IR nodes with sourceRefs and part context
- `adapters/construction-to-ir.adapter.js` — stub adapter for `Construction Line Microprocessor` specs (center, rings, radials) → `ConstructionGuide` nodes
- `index.js` — clean re-exports under `SemQuant.*`
- `README.md` — phase status and usage

### Modifications to SCDL
- `scdl.grammar.js`: `parseOp(partId, opIndex)` and `parsePart()` now emit stable `id` + `sourceSpan` (Phase 1B requirement)
- `scdl.compiler.js`:
  - Imports adapter + unifier
  - Thin bridge after `validatePass`: `scdlAstToIR` → `semanticUnifierPass` → `attachSemanticAnnotations`
  - Semantic diagnostics merged into errors (non-fatal)
  - Lowering history recorded
- `passes/expand-vector.pass.js`:
  - Enhanced `pushCell(..., sourceOp)` to forward `partId`, `sourceOpId`, `role` (from annotations), `material`
  - Vector ops now carry context through rasterization
- `passes/expand-cells.pass.js`:
  - `cell` / `rim` / `fill` coordinate objects now carry `sourceOpId`, enriched `role`/`partId` from op annotations
- `passes/emit-packet.pass.js`:
  - Coordinates in packet include `sourceOpId`
  - `provenance.operations` records `semantic-unifier`
- `passes/emit-diagnostics.pass.js`:
  - Recognizes PB-SEM codes, tags with `source: 'PB-Semantics'`, `_semantic: true`
- `index.js`:
  - Re-exports `SemQuant`, `semanticUnifierPass`, `scdlAstToIR`, `constructionSpecToIR`

### Tests
- New: `tests/codex/core/pixelbrain/scdl/scdl.semquant.test.js` (8 tests)
  - Annotation attachment via compile path
  - PB-SEM-003 for glow without material
  - Direct IR + unifier role inference
  - Determinism preservation
  - Construction adapter + unifier
  - Aseprite-style layer simulation (`00_Reference/ring_body` → constructionGuide + body)
  - Effect classification
  - End-to-end survival into `packet.geometry.coordinates`

All original SCDL fixtures, parsers, golden regressions, and exporters continue to work unchanged. Total SCDL tests: 72.

### Documentation
- New PIR (this file)
- Semantic README

No changes to:
- Rasterization math, `createPixelBrainAssetPacket` contract, exporters, HUD rendering, or existing AMPS.

---

## 3. Verification & Testing

### Test Execution
```bash
npx vitest run tests/codex/core/pixelbrain/scdl/
```

Result:
```
 ✓ ... (all 6 test files)
 Test Files  6 passed (6)
      Tests  72 passed (72)
```

### Key Behavior Verified
- `compileSCDL(glowSource)` emits `PB-SEM-003` in both `errors` and `diagnostics`.
- Sphere body part produces cells with `role: 'body'`, `partId`, `sourceOpId`.
- Semantic fields survive vector lowering and appear in final packet.
- Construction spec IR unifies to `constructionGuide` annotations.
- Compound layer names produce multiple canonical roles.
- Old fixtures (`void_chestplate.scdl`, `crimson-ooze-vector.scdl`, etc.) produce identical packets before/after.
- Determinism: identical source → identical AST/packet/diagnostics.

### Manual Checks
- `node codex/core/pixelbrain/scdl/scdl.cli.js check` on glow fixture surfaces the semantic warning.
- IR nodes always carry `sourceRefs`.
- Annotations are merged without duplication.

---

## 4. Vaelrix Law Compliance

- **Law 6 (Determinism)**: Fully satisfied. `semanticUnifierPass`, alias maps, and inference are pure and deterministic. No random, no ML, no hidden state. Lowering steps are recorded explicitly.
- **Law 8 (Bytecode / Diagnostics Priority)**: PB-SEM-* family integrated into the same diagnostic pipeline as PB-ERR. Warnings are machine-readable and surfaced in `result.diagnostics`.
- **Law 13 (PDR Archive)**: The design originated in interactive specification (user-provided architecture + thin-slice plan). This PIR + `semantic/README.md` serve as the implementation record.
- **Law 14 (PIR Mandatory)**: This document fulfills the requirement.
- Additional alignment: Preserves existing `SCDL-AST-v1` contract and `pixelbrain.asset.v1` lattice. Semantic data is additive (does not mutate geometry for hashing).

---

## 5. Open Items / Future Work (Beyond Phase 1 Thin Slice)

- Additional adapters (SDF, full Aseprite layer parser with metadata, shape-grammar).
- Consumption of annotations by `region-fill-amp.js`, fidelity pipeline, and motif systems.
- Optional semantic sidecar or enriched packet metadata.
- IDE / language server support for the semantic types.
- Explicit boolean composition rules (union/subtract should preserve parent `part`/`role` unless overridden).

The semantic spine is now in place. All future authoring surfaces have a single place to report meaning.