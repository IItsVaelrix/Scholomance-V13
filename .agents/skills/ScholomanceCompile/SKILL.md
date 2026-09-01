---
name: ScholomanceCompile
description: Use when reading, writing, auditing, debugging, or extending SCDL (codex/core/pixelbrain/scdl/ — the Scholomance PixelBrain vector/cell asset DSL and its grammar/compiler/rasterizer/exporter pipeline), or when designing/reviewing any generalized parser->AST->passes->packet asset-compiler or rasterization system — pass ordering, cross-entity resolution, silhouette/ownership models, "never throws" compiler contracts, SVG-style path parsing.
---

# ScholomanceCompile

## Overview

Two things live here: (1) the concrete map of SCDL's pipeline — grammar, pass order, error codes, rasterizers, exporters — and (2) generalized asset-compiler/rasterization engineering patterns that transfer to any similar system, distilled from a real audit-and-fix pass on this exact codebase (2026-08-30: one CRITICAL crash found and fixed, a dead union/subtract/intersect feature diagnosed and rebuilt end-to-end).

## When to Use

- Writing or reviewing SCDL source, grammar changes, or new ops.
- Debugging a compile that throws, silently no-ops, or produces wrong geometry.
- Adding a compiler pass, error code, or exporter to `codex/core/pixelbrain/scdl/`.
- Designing/reviewing any other parser→AST→passes→packet compiler (a shader compiler, a scene-graph builder, a template engine) — the patterns below aren't SCDL-specific.
- Parsing SVG-style path data, or writing a tokenizer/lexer pair.

## Quick Reference — SCDL Pipeline

```
source text
  → parseSCDL (scdl.grammar.js: _tokenizeFull + recursive-descent parser)
  → validatePass          → resolveColorsPass    → resolveMaterialsPass
  → expandVectorPass       (phase 1: rasterize each part's own vector ops
                             phase 2: resolveBooleanOpsPass, cross-part)
  → expandSymmetryPass    → expandCellsPass       → [projectGenesPass, optional]
  → emitPacketPass        → emitDiagnosticsPass
  → CompileResult { ok, ast, packet, errors, diagnostics }
```

Full grammar EBNF, the complete `SCDL_ERROR_CODES` catalogue, rasterizer math (SDF formulas, sphere-shading thresholds), and exporter/CLI details: `references/scdl-pipeline.md`.

## Core Patterns (generalize beyond SCDL)

1. **A "never throws" contract binds every producer of the error/diagnostic array, forever.** If `compile()` promises to always return a result object, *every* code path that pushes into the shared errors array must produce the exact same duck-typed shape (here: `.isError()`/`.isWarn()`/`.code`/`.severity`) — one plain `{code, message}` literal slipped in by one pass is enough to crash the whole compiler on a single malformed input, even with a fully green test suite, because nothing exercised that pass's error path. Grep every push-site into that array before trusting the "never throws" doc comment.
2. **A cross-entity operation can't resolve until every entity's own pass has run.** union/subtract/intersect needed to reference *sibling parts*, but each part was being rasterized independently in one pass. Fix: split into phase 1 (rasterize each entity alone, deferring cross-entity ops) and phase 2 (resolve cross-entity ops once every entity's shape is known). Same shape as a linker running after every compilation unit, or a two-pass reference resolver.
3. **"Which cells belong to part X" has two incompatible correct answers — know which one your data model needs.** A silhouette/occupancy map (`{x,y} -> singleOwnerId`, last-writer-wins) is correct when entities are *designed* to be exclusive, non-overlapping territory (an armor spec's pauldron/mantle/core). It is *wrong* for entities that are independently authored and may legitimately overlap (two SCDL parts drawing the same coordinate) — reusing the single-owner model there silently deletes real overlap. Diagnosed here by writing one concentric-circle `intersect` test and getting 0 cells instead of 5. Fix: scope the ownership map per-entity (never share it across entities you don't control the disjointness of).
4. **Only reuse a helper for what its contract actually guarantees, not what its name suggests.** `buildPartMask(partOf, id)` genuinely is "get me this part's shape" — but *only* if you feed it a `partOf` map you built with the right ownership semantics for your case (see #3). Reusing the function was right; reusing it against a shared cross-entity map was not.
5. **Duplicate tokenizers/parsers drift silently.** Two hand-synced implementations of the same lexer (one exported for tests, a private one actually used by the parser) will pass their own tests forever while the real one regresses, because nothing ever compares them. Collapse to one; make the "test" tokenizer a thin wrapper over the real one, not a parallel implementation.
6. **SVG-style number tokenizers need a special case for flag digits.** A generic `-?\d*\.?\d+` number regex greedily swallows adjacent single-digit arc flags (`A rx ry rot large-arc sweep x y`) into one multi-digit token when an author uses SVG's legal concatenated-flag shorthand (`"011"` = flags `0`,`1` + start of the next coordinate), desyncing every token after it. Normalize flag digits to explicit single-character, space-separated tokens *before* generic tokenization, in one dedicated pre-pass over the raw string — don't try to patch the generic regex.
7. **A fully-green test suite proves nothing about a code path with zero tests.** `union`/`subtract`/`intersect` had 250/250 surrounding tests passing while being both crash-prone AND a complete no-op for any hand-written source — because no test exercised those verbs at all. Before trusting a suite's "all green," grep for whether the feature you're relying on has any test naming it.

## Common Mistakes

| Symptom | Real cause | Fix |
|---|---|---|
| Compiler throws despite a "never throws" doc comment | Some pass pushes a non-conforming object into the shared errors array; a later `.isError()` call has no ternary guard | Make every error producer use the same factory (`scdlError`/`scdlWarn`) or an equivalent duck-typed object |
| A feature "works" (no error) but visibly does nothing | Its addressing scheme references an identifier nothing can ever produce (e.g. targeting auto-generated ids that authors can't type) | Trace the target string end-to-end: what produces it, what consumes it, do the two ever actually match on real input? |
| Boolean/overlap op returns fewer cells than expected, sometimes zero | Ownership map is shared across entities that are allowed to overlap, so a later entity's write silently reassigns an earlier entity's cell | Scope the ownership/silhouette map per-entity; only share it when entities are contractually disjoint |
| Arc/curve path renders at the wrong position, or a downstream field goes NaN | Flag-shorthand digits fused with adjacent numbers during tokenization | Pre-normalize flag digits to their own space-separated tokens before generic number tokenization |
| Two tests for "the tokenizer" test different code | An exported convenience function and the parser's internal one have quietly diverged into two implementations | `grep` for a second definition before trusting that a tokenizer test covers the compiler's real lexer |

## Reference Files

- `references/scdl-pipeline.md` — compressed grammar summary, pass-by-file map, complete `SCDL_ERROR_CODES` table, rasterizer/SDF math, exporter and CLI contracts. A distillation for fast lookup, not the living spec — see below for that.
- `references/compiler-engineering-patterns.md` — the six patterns above, expanded with the exact code before/after from this session, for when you need the full worked example rather than the one-line summary.

## Canonical Documentation (source of truth, not distilled here)

This skill's reference files are a compressed snapshot for quick lookup. For
the exhaustive, maintained spec — full formal grammar including v1.2
scene-graph (`def`/`group`/`instance`), the complete material catalogue, and
every op rendered from real compiler output (nothing is a mock-up) — go to:

- `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md` — internals, contracts, full pass pipeline, bytecode/diagnostic registry, CLI manual, troubleshooting log (including this session's crash and dead-boolean-op bugs, §10.5–10.6).
- `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md` — practical, example-driven authoring reference: full op catalog with rendered PNGs compiled from the shown source, the 60-material catalog with transmutation previews, frames/loops, and the authoring playbook.

If either disagrees with this skill's reference files, the white paper and
authoring guide win — they're the ones expected to stay current as the
compiler evolves; this skill's files are a snapshot from the 2026-08-30
session that produced them.
