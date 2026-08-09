# Cyclotron Collision: Nervous System v1 Plan

**Date:** 2026-08-09
**Candidate bond:** `docs/superpowers/plans/2026-08-09-nervous-system-v1.md`
**Method:** every load-bearing interface assumption in the plan collided against
live repo ground truth (microscope symbol tables, signature inspection, and the
eval lens executing real code). No claim accepted on prose alone.

## Collision table

| # | Plan's assumption | Probe | Result |
|---|---|---|---|
| 1 | `code_lens.resolve_within_root(project_root, rel_path) -> str \| None` | microscope | ✅ PASS — line 84, exact args |
| 2 | `code_lens.symbols_for_file(abs_path) -> list[dict]` with name/kind/line/endLine | microscope + live call | ✅ PASS — line 260, dict keys confirmed |
| 3 | `code_lens._cross_reference(project_root, symbol, max_hits=25)` | `inspect.signature` | ✅ PASS — `(project_root, symbol, *, max_hits: int = 25)` |
| 4 | `code_eval.evaluate(..., *, args=None, timeout=10, summarise_only=False)` returns ok/shape/declaredPure | signature + `DEFAULT_TIMEOUT` | ✅ PASS — timeout default is exactly 10 |
| 5 | `code_eval._declared_pure(abs_path) -> bool` | microscope | ✅ PASS — line 68 |
| 6 | Task 3 fixture: `synthesizeByProjection` returns array length 79, module pure | **live eval** | ✅ PASS — `{'type': 'array', 'length': 79}`, `declaredPure: True` |
| 7 | Task 1 fixture: `IGNORED_DIR_PREFIXES` in text but NOT symbol table | live check | ✅ PASS — text line 45, absent from AST-extracted table; the UNCHECKABLE case is real |
| 8 | Calculus kinds Do/Clarify/Theory/Probe + `adjudicateLaw` + riskProfile | kind.ts lines 33-215 | ✅ PASS |
| 9 | cleri-gate precedent: probe gathers, gate adjudicates; empty findings = Theory | scripts/cleri-gate.mjs | ✅ PASS — pattern exists and is cited correctly |
| 10 | `capability_store.load_packets(directory) -> (packets, errors)`, checksum refusal | microscope symbol body | ✅ PASS — exact signature; 4 capability packets exist, matching Task 7's "four capabilities" |
| 11 | Task 3 fixture: `code_lens.py` declares NO purity → resolver refuses | `_declared_pure()` live | ❌ **FAIL — STALE FIXTURE** |
| 12 | Prober imports capability_store from beside its dependencies | filesystem walk | ⚠️ **UNDER-SPECIFIED** |

## Finding 11 — the stale fixture (deterministic test failure at Task 3 Step 4)

The plan uses `code_lens.py` as its impure-module fixture:

> `test_impure_module_is_uncheckable_and_never_executed` — "code_lens.py declares
> no purity, so the resolver must refuse rather than risk running import-time
> side effects."

Live ground truth: `code_lens.py` **does** declare purity — its docstring carries
`pure stdlib — no numpy, no external parsers, no subprocess` (lines 17-18), and
`_declared_pure()` returns `True` for it since the purity-detector fix
(commit `bb65e4a2`, which added the `pure stdlib` declaration form).

Consequence: the resolver will NOT refuse. It will proceed to evaluate
`microscope` with no arguments, fail at the call stage, and return UNCHECKABLE
with a *call-error* detail. The `result == UNCHECKABLE` assertion may still hold,
but `"purity" in detail.lower()` will fail. The test breaks loudly at Task 3
Step 4 — which is the plan working as designed (a test catching a wrong fixture),
but the fixture must be swapped before execution.

**Fix:** use a module with no purity declaration as the fixture. Verified
candidates: `divtube_downloader/tui/services/harness_tools.py`,
`divtube_downloader/tui/services/app.py`, `scripts/replay_capabilities.py`
(all three checked: no declaration present).

## Finding 12 — capability_store does not live beside the prober

The plan's prober sits in `divtube_downloader/tui/services/` and its Global
Constraints say "Python lives beside its dependencies." But `load_packets` lives
in `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py` — a different
tree entirely.

Prior art exists and is proven: `scripts/verify_capabilities.py` lines 35-40
solve exactly this with `sys.path.insert(0, str(_ROOT / "steamdeck_brain"))`
followed by `from vaelrix_forcefield.scdna.capability_store import ...`.
The plan should adopt that pattern explicitly rather than leave the import
mechanism to the implementer.

## Discipline audit — does the plan follow the cyclotron's own rules?

| Cyclotron principle | Plan's embodiment |
|---|---|
| Beam dump / refusal machinery | `UNCHECKABLE` is never collapsed into false or passed; every resolver can return all three |
| Protect floor | purity declaration required before any code execution; checksum refusal in `load_packets` |
| Blind holdout | Task 9's wrong-entry-point benchmark is the TEST measurement |
| No score thresholds in admission | "Chemistry never appears in an admission test. Kinds are categorical." — literally stated |
| Control arm | corruption meta-test in test_nervous_probe.py |
| TDD ordering | every task writes the failing test first, runs it red, then implements |
| Receipts not overwritten | per-domain output files + index, dated, never one hardcoded path |
| Curation law | `*.capability.json` hand/agent-authored only; generated output goes to evidence/ |

All eight disciplines present. The plan is built out of the same refusal
machinery as the cyclotron itself.

## Verdict

**PROMOTE — with two mandatory pre-flight fixes.**

10 of 12 assumptions are gold-backed by live probes. The two failures are a stale
test fixture and an under-specified import path — both minutes to fix, neither
structural. This is the `TO|NP|PP` pattern in reverse: high license, small
contamination, named re-entry path. The contamination here is smaller than
TO|NP|PP's was, and unlike that bond both defects are *deterministically caught
by the plan's own tests*, which is exactly what a sound plan owes you.

Pre-flight fixes before Task 1:
1. Swap Task 3's impure fixture from `code_lens.py` to `harness_tools.py`.
2. Add the `steamdeck_brain` sys.path import pattern (per verify_capabilities.py)
   to Task 5's prober interface notes.
