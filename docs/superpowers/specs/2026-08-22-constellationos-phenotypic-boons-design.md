# ConstellationOS Phenotypic Boons Design

**Date:** 2026-08-22
**Status:** Approved for implementation
**Source:** `divtube_downloader/tui/skills/phenotypic_idealism.md`, followed by Atlas, telescope, and microscope inspection

## Goal

Strengthen ConstellationOS at five measured seams: bounded classic-parser QA, auditable offline evaluation evidence, independent channel overlap, semantic-index hygiene, and explicit SCDNA capability discovery.

## Architectural boundary

The shipped page remains `Server -> Runtime -> Services -> Core`. The packed parser and treebank runner remain offline evaluation machinery; this work must not wire `composePacked` into `buildConstellationPage` or imply that benchmark coverage is parse accuracy or shipped-product behavior.

## Boon 1: bounded classic compatibility smoke

Replace the corpus-sized classic parser smoke with one tiny hand-authored CoNLL-U sentence and a two-entry POS map. The test proves that the compatibility path executes and projects a non-empty result without asking the classic parser to materialize a broad parse forest. Documentation will state that packed is the evaluation default and classic is an explicit differential/compatibility path.

## Boon 2: deterministic evaluation evidence

Add a pure Core adapter that accepts a completed treebank run plus fixture identities and emits a recursively frozen report containing:

- parser identity and token budget;
- fixture SHA-256 identities;
- aggregate metrics and complete accounting counters;
- row-level outcomes without sentence text;
- sorted failure signatures;
- a deterministic checksum over canonical report content.

The report contains no raw source text, timestamps, environment data, or request-path claims. Its schema becomes `SCHOL-CONSTELLATION-EVALUATION-EVIDENCE-v1` in the sovereign schema contract.

## Boon 3: independent channel overlap

Start asynchronous rhyme analysis before synchronous leximancy analysis, then await both as a fixed pair. This permits the rhyme query to make progress while leximancy performs local lookup. Diagnostics are applied afterward in a stable order, and the existing dependencies remain intact: genome still follows rhyme; semantic inquiry still follows leximancy.

## Boon 4: semantic-index hygiene

Create one pure path policy shared by vector indexing and lexical fallback search. It excludes dependency and generated trees including `venv`, `.venv*`, `.worktrees`, caches, build products, and package-manager outputs. Rebuild the index and assert that no indexed path traverses an excluded directory.

## Boon 5: curated SCDNA capability packet

Author and compile a `constellation-os` capability packet whose surfaces and capabilities point only to verified backend/runtime/evaluation seams. It will explicitly preserve the offline-versus-request-path boundary and expose the new evidence adapter. Compilation and repository tests validate paths, symbols, and checksum; capability discovery is curated rather than inferred from search hits.

## Acceptance criteria

1. The classic smoke completes within the normal Vitest budget on its tiny fixture.
2. Evidence reports are schema-valid, deterministic, recursively frozen, text-free, and change checksum when evidence changes.
3. A test proves rhyme starts before independent leximancy work, while existing page packet tests remain unchanged.
4. Both indexing and fallback search use the same ignore policy, and a rebuilt index contains no excluded environment paths.
5. The compiled `constellation-os` packet passes capability verification and appears in phenotypic discovery.
6. Focused tests, integrated Constellation tests, schema checks, and scope review pass without touching unrelated user changes.
