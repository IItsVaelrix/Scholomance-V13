# PDR: Code Geometry Structural Mold
## A Post-Hoc AST Shape Compiler for the Brain Protocol Roadmap Compiler, With a Separately-Labeled Semantic Evidence Channel

**Status:** Proposed
**Classification:** Architectural | Agent tooling | Static analysis | Verification
**Priority:** Medium — extends an already-gated Step 1 efficacy probe; not on any critical path
**Date:** 2026-08-28
**Primary Goal:** Give the Brain Protocol roadmap compiler a way to detect a real structural defect class (a new exception-fallback path that collapses "confirmed absent" and "the mechanism itself broke" into the same return value) by parsing the code that was actually written, instead of guessing from words in the task request — while keeping a separate, honestly-labeled channel for real but merely topical evidence, so neither is mistaken for the other.

## Bytecode Search Code

`SCHOL-ENC-BYKE-SEARCH-PDR-CODE-GEOMETRY-STRUCTURAL-MOLD-2026-08-28`

---

## 1. Executive Summary

`docs/superpowers/specs/2026-08-28-opt-in-brain-protocol-execution-design.md` gates its full build behind a cheap efficacy probe. That probe (`steamdeck_brain/brain_protocol_prototype/`) validated two rules (Arm A: boundary-equality completion checks; Arm B: citation-specific completion checks) and then, on direct request, was pointed at my own most prevalent measured blind spot (`feedback-silence-vs-failure-blind-spot.md`: 14 new `except Exception:` fallbacks added in one real session, 12 collapsing "confirmed absent" and "the lookup broke" into the same return value). That third rule (Arm C) worked on the literal historical wording but missed a differently-worded instance of the identical real defect — because its detection mechanism was lexical (keyword co-occurrence in the request text), reproducing, on a rule I had just written, the exact "finds words, not shapes" limitation this project already diagnosed in `CODE_BRAIN`.

This PDR proposes fixing that at its root: detect the defect from the **shape of the code that was actually written** (a post-hoc AST parse), not from the words used to describe the task before it existed. A companion idea — using the project's real vector-embedding substrate (`codex/server/services/codebaseSearch.service.js`, the `vector_tq` index) as "prediction fuel" for the expected shape — was tested directly rather than assumed: the index was rebuilt (5,215 files / 26,496 chunks) and the two real historical defect sites were queried for mutual neighborness. They do not appear in each other's neighbor lists; the index clusters by topic/domain, not by code shape. That is not a defeat of the idea, it is a correction of its role: the semantic channel is kept, but only for what it actually does well (real topical/precedent retrieval), clearly labeled apart from the structural channel that does the shape-detection job.

## 2. Evidence-Grounded Current State

### 2.1 Verified capabilities

| Surface | Verified evidence | What it proves |
|---|---|---|
| Roadmap compiler prototype | `steamdeck_brain/brain_protocol_prototype/roadmap_compiler.py`, `tests/test_roadmap_compiler.py` (9/9 passing) | A pure, deterministic compiler already turns task text + evidence into a phased contract with real completion checks (Arms A/B proven, not fixtures). |
| Real blind-spot baseline | `feedback-silence-vs-failure-blind-spot.md`, `AGENT_BLIND_SPOT_DIAGNOSTIC_2026-08-28.md` | 14 real `except Exception:` fallbacks added in one session; 12 collapsed absence and failure. Fixed same-day (`785c417f`, `f523e00c`). This is a real, measured, non-hypothetical target defect class. |
| Arm C (lexical rule) | `steamdeck_brain/brain_protocol_prototype/EFFICACY_RESULT.md` | Fired correctly on the literal historical wording (`ipa_for_word` reworded); missed a real, naturally-worded instance of the same defect (`gateway.py`'s snapshot-provider fallback) because it keys on lookup/exception vocabulary, not code shape. |
| Vector embedding substrate | `codex/server/services/codebaseSearch.service.js`, `scripts/index_codebase_vectors.js`; re-run live this session, 2026-08-28 | A real float32 cosine-similarity index over the whole repo (including `.py`) exists, is reachable via `mcp_scholomance_collab_codebase_get_neighbors`/`_hybrid_search`, and — verified directly, not assumed — clusters `_scholomance_dict.py` with dictionary/phoneme-domain files and `gateway.py` with TUI/remote-domain files. Neither appears in the other's neighbor list. |
| Existing structural tooling | `divtube_downloader/tui/services/code_lens.py`/`code_atlas.py` (`reference-divtube-code-lenses.md`) | A real symbol-definition/cross-reference index already exists for this codebase, and its own documentation is explicit that it has "no binding resolution, no types, no dataflow" — i.e., it already does not claim to solve the shape-detection problem this PDR targets. |

### 2.2 Verified gap

No component in this codebase currently inspects a function's actual control-flow shape (its exception handlers' return expressions vs. its other return points') and mechanically checks whether two logically-distinct outcomes are returned as the same value. The lexical Arm C rule approximates this from task-request vocabulary and is demonstrably incomplete — proven by testing it against a real historical site worded differently, not by argument.

### 2.3 Boundary statement

This PDR does not propose a general code-understanding system. It proposes one small, deterministic, stdlib-only AST compiler (`FunctionShape`) and one predicate (`silence_vs_failure`) that operates on it, run **after** code exists, against the specific files/functions a phase receipt reports as changed — never as a guess about code that doesn't exist yet. The semantic/vector channel is retained only as labeled, non-authoritative supporting evidence; it is explicitly barred from driving a structural completion check.

## 3. Product Goal and Non-Goals

**Product goal:** When the Brain Protocol's roadmap compiler finalizes a phase whose receipt reports changed Python files, it can run a real, deterministic structural check — not a prose reminder — for the one defect class already proven to recur, and report a genuine pass/fail with the exact colliding line numbers.

**Non-goals:**
- Not a general static-analysis or dataflow engine. No control-flow graph, no type inference, no cross-function tracing.
- Not a claim that embedding similarity can detect code-shape similarity. The re-index test this session shows it does not, for the one case that matters most; the semantic channel is scoped to topical evidence only.
- Not an extension of the parent spec's authorized surface. Persistence, MCP tools, and the opt-in skill remain exactly as gated in `docs/superpowers/specs/2026-08-28-opt-in-brain-protocol-execution-design.md`'s Delivery Sequence — this PDR does not authorize moving past that gate.
- Not multi-language. Python/stdlib `ast` only; JS/TS geometry is explicitly out of scope (would require depending on the divtube `code_lens`/tree-sitter-adjacent stack, a separate decision).
- Not a second predicate. One structural rule (`silence_vs_failure`), proven first, per the existing pre-registration discipline this prototype already uses.

## 4. Design Principles

1. **Shape is derived from real code, never from a request's wording.** The structural channel only ever parses files a phase receipt says were actually changed.
2. **Two channels, never merged, always labeled.** Every evidence item in the contract carries `channel: "structural_mold" | "semantic_neighbor" | "brain_citation"`. Only `structural_mold` and `brain_citation` items may drive a completion check; `semantic_neighbor` items are context, explicitly marked as unverified-by-shape.
3. **Fail as a distinct result, never as silence.** A file/function the compiler cannot parse returns a `ShapeUnavailable`-style result (matching the `DictionaryUnavailable`/`EvidenceLookupError` pattern already used in `steamdeck_brain/vaelrix_forcefield/brains/`), never a bare `None` — the same discipline this whole investigation exists to enforce is not to be violated by the tool built to enforce it.
4. **Pre-register before implementing.** Required discovery and negative controls are written before the predicate's detailed logic, matching `PREREGISTRATION.md`'s existing standard for this prototype.
5. **No new dependency for Step 1.** The structural compiler is pure stdlib Python; the semantic channel reuses the already-live MCP tools rather than adding a new client.

## 5. Architecture

| Component | Responsibility | Depends on |
|---|---|---|
| `geometry.py` (new) | Parses a target Python file/function with stdlib `ast`; produces `FunctionShape` (has_try_except, exception_handler_returns, other_returns, each tagged and line-numbered). Returns a distinct unavailable-result on parse failure. | stdlib `ast` only. |
| `silence_vs_failure` predicate (new, in `geometry.py` or a sibling module) | Given a `FunctionShape`, fires when an exception-handler return tag matches an other-return-point tag; names the exact colliding lines. | `FunctionShape`. |
| `semantic_evidence.py` (new) | Thin wrapper calling `mcp_scholomance_collab_codebase_hybrid_search`/`_get_neighbors`; maps hits to `EvidenceItem(channel="semantic_neighbor", ...)`. | Existing live MCP tools; no new service. |
| `EvidenceItem` (new dataclass, `roadmap_compiler.py`) | Replaces the current bare `tuple[str, ...]` evidence field with `channel`, `content`, `source_ref`, optional `confidence`. | — |
| Pipeline sequencing | PREPARE seeds `semantic_neighbor` items as today's Arm B pattern already does for brain citations. Agent implements normally. Phase receipt (already required by the parent spec) reports changed files/functions. A post-hoc step runs `geometry.py` + `silence_vs_failure` against exactly those, producing `structural_mold` findings before `finalize`. | Existing phase-receipt mechanism in the parent spec. |

## 6. Verification Strategy

Same discipline as the existing prototype, not a new one:

1. Pre-register the predicate's required discovery and a negative control before writing its detailed logic (mirrors `PREREGISTRATION.md`).
2. TDD: a failing test against a real, reworded (not fixture-copied) version of the historical defect, watched RED, then made GREEN.
3. Re-run the exact case that beat the lexical Arm C rule (the `gateway.py` snapshot-provider shape, expressed as real code, not request text) and confirm the structural predicate catches it where the lexical one did not — this is the actual proof-of-improvement the parent spec's Delivery Sequence requires before trusting a new rule.
4. Confirm `semantic_neighbor` items never appear inside a completion-check string generated by the compiler (a negative control on the labeling discipline itself).

## 7. Scope of This Ratification

This PDR authorizes design and prototype-level implementation inside `steamdeck_brain/brain_protocol_prototype/` only — the same isolation boundary Step 1 already operates under. It does not authorize:
- any change to `steamdeck_brain/vaelrix_forcefield/` (production brain code),
- persistence, MCP tool registration, or the opt-in skill (still gated by the parent spec's Delivery Sequence step 4),
- a second structural predicate beyond `silence_vs_failure`, or
- extending the semantic channel to drive completion checks.

Each of those remains its own future decision, gated the same way the parent spec already gates them.

## 8. Ownership and Review

- Product authority: Vaelrix (Angel Hernandez)
- Architecture and contract review: this session, pending your review of this PDR
- Implementation: to follow via the standard brainstorming -> writing-plans process, once this PDR is approved

This PDR should be re-reviewed before a second structural predicate, a non-Python target language, or any change outside `brain_protocol_prototype/` is proposed.
