# Nervous System v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing SCDNA capability hubs falsifiable — mechanically probe each claim, adjudicate the evidence into a Semantic Calculus kind, and route questions through only the claims that survive.

**Architecture:** Two processes, following the existing `cleri-probe → cleri-gate` split. A Python prober uses the Telescope/Microscope/Eval lenses to turn capability claims into evidence; a Node gate feeds that evidence to the TypeScript calculus and writes per-domain reports. The prober never judges; the gate never gathers.

**Tech Stack:** Python 3 (stdlib + the existing `code_lens` / `code_eval` modules), Node 20 via `npx tsx` for the calculus, pytest, vitest.

Design spec: `docs/superpowers/specs/2026-08-09-nervous-system-design.md`

## Global Constraints

- **`UNCHECKABLE` is never `false`.** A resolver that cannot run returns `"uncheckable"`, which adjudicates to `Clarify`. Only a resolver that ran and disproved the claim returns `"failed"`, which adjudicates to `Theory`. Every resolver must be able to return all three.
- **Curated files are never machine-written.** `*.capability.json` is hand/agent authored only. All generated output goes to `docs/superpowers/evidence/2026-08-09-nervous-sweep-*.md`.
- **Per-domain output files plus an index.** Never one hardcoded output path — a receipt the next run overwrites is not a receipt.
- **Chemistry never appears in an admission test.** No score thresholds anywhere. Kinds are categorical.
- **Python lives beside its dependencies.** `code_lens` and `code_eval` are in `divtube_downloader/tui/services/`; the new Python modules join them and are imported the same way.
- **Test command (Python):** run from `divtube_downloader/`: `PYTHONPATH=. .venv/bin/python -m pytest tests/<file> -v`
- **Real-repository ground truth**, as `test_code_lens.py` already does — not toy fixtures.
- **`assert` result vocabulary is exactly:** `"passed"`, `"failed"`, `"uncheckable"`.

---

## File Structure

| File | Responsibility |
|---|---|
| `divtube_downloader/tui/services/nervous_assertions.py` | The assertion vocabulary and its resolvers. Pure; no I/O beyond reading the repo. |
| `divtube_downloader/tui/services/nervous_probe.py` | Walks capability packets, runs their assertions, emits evidence JSON. |
| `scripts/nervous-gate.mjs` | Evidence JSON → calculus kinds → per-domain reports + index. |
| `divtube_downloader/tui/services/nervous_router.py` | `route(question)` over admitted claims and bridges, budget-bounded. |
| `divtube_downloader/tests/test_nervous_assertions.py` | Resolver tests, real-repo ground truth. |
| `divtube_downloader/tests/test_nervous_probe.py` | Packet walking, evidence shape, corruption meta-test. |
| `divtube_downloader/tests/test_nervous_router.py` | Routing, budgets, the wrong-entry-point benchmark. |
| `tests/qa/features/nervous-gate.test.js` | Kind mapping, including the collapse test. |

---

## Task 1: Evidence type, `path-exists`, `symbol-exists`

Establishes the result vocabulary every later resolver follows, and the
extractor-blindness rule that keeps `UNCHECKABLE` separate from `false`.

**Files:**
- Create: `divtube_downloader/tui/services/nervous_assertions.py`
- Test: `divtube_downloader/tests/test_nervous_assertions.py`

**Interfaces:**
- Consumes: `code_lens.resolve_within_root(project_root, rel_path) -> str | None`, `code_lens.symbols_for_file(abs_path) -> list[dict]` (each dict has `name`, `kind`, `line`, `endLine`)
- Produces: `PASSED`, `FAILED`, `UNCHECKABLE` string constants; `evidence(name, args, result, detail="") -> dict`; `assert_path_exists(project_root, file) -> dict`; `assert_symbol_exists(project_root, file, symbol) -> dict`

- [ ] **Step 1: Write the failing tests**

Create `divtube_downloader/tests/test_nervous_assertions.py`:

```python
"""Tests for the nervous-system assertion resolvers.

Ground truth is the real repository, as test_code_lens.py does it.

The rule these tests exist to protect: a resolver that could not run returns
UNCHECKABLE, never FAILED. Collapsing "could not check" into "checked and
false" makes the sweep report live guidance as dead.
"""

import os
import unittest

from tui.services import nervous_assertions as na

HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(DIVTUBE_ROOT, ".."))

LENS = "divtube_downloader/tui/services/code_lens.py"


class TestPathExists(unittest.TestCase):
    def test_real_path_passes(self):
        r = na.assert_path_exists(PROJECT_ROOT, LENS)
        self.assertEqual(r["result"], na.PASSED)

    def test_missing_path_fails(self):
        r = na.assert_path_exists(PROJECT_ROOT, "no/such/file.py")
        self.assertEqual(r["result"], na.FAILED)

    def test_escaping_path_is_uncheckable_not_failed(self):
        """Outside the root we are not permitted to look, so we do not know."""
        r = na.assert_path_exists(PROJECT_ROOT, "../../etc/passwd")
        self.assertEqual(r["result"], na.UNCHECKABLE)


class TestSymbolExists(unittest.TestCase):
    def test_real_symbol_passes(self):
        r = na.assert_symbol_exists(PROJECT_ROOT, LENS, "microscope")
        self.assertEqual(r["result"], na.PASSED)

    def test_absent_symbol_fails(self):
        r = na.assert_symbol_exists(PROJECT_ROOT, LENS, "no_such_function_anywhere")
        self.assertEqual(r["result"], na.FAILED)

    def test_symbol_in_text_but_not_symbol_table_is_uncheckable(self):
        """The JS extractor is regex-based and incomplete. If the name appears
        in the file but the extractor did not surface it, we cannot conclude
        the symbol is absent -- only that we could not see it."""
        r = na.assert_symbol_exists(
            PROJECT_ROOT, LENS, "IGNORED_DIR_PREFIXES"
        )
        self.assertEqual(r["result"], na.UNCHECKABLE)

    def test_missing_file_is_failed_not_crash(self):
        r = na.assert_symbol_exists(PROJECT_ROOT, "no/such/file.py", "x")
        self.assertEqual(r["result"], na.FAILED)


class TestEvidenceShape(unittest.TestCase):
    def test_evidence_carries_assertion_name_and_args(self):
        r = na.assert_path_exists(PROJECT_ROOT, LENS)
        self.assertEqual(r["assert"], "path-exists")
        self.assertEqual(r["args"]["file"], LENS)
        self.assertIn("detail", r)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `divtube_downloader/`:
```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -v
```
Expected: collection error — `ImportError: cannot import name 'nervous_assertions'`.

- [ ] **Step 3: Write the implementation**

Create `divtube_downloader/tui/services/nervous_assertions.py`:

```python
"""Assertion vocabulary for the nervous system.

A curated claim is admissible only if it names an assertion here. Anything not
expressible in this vocabulary cannot bind, and deposits as Theory rather than
becoming a routable edge.

THE RULE THIS MODULE EXISTS TO ENFORCE

Every resolver returns one of three results, and the third is not optional:

  passed       the resolver ran and the claim held
  failed       the resolver ran and DISPROVED the claim
  uncheckable  the resolver could not run

Collapsing `uncheckable` into `failed` reports live guidance as dead; collapsing
it into `passed` reports dead guidance as healthy. It is the same failure
`cleri-gate` was built to catch, where a bare NO VERIFIED FINDINGS reads as a
clean bill of health but means "these verifiers proved nothing".
"""

from __future__ import annotations

import os

from tui.services.code_lens import resolve_within_root, symbols_for_file

PASSED = "passed"
FAILED = "failed"
UNCHECKABLE = "uncheckable"


def evidence(name: str, args: dict, result: str, detail: str = "") -> dict:
    """One assertion's outcome, carrying enough to reconstruct the check."""
    return {"assert": name, "args": args, "result": result, "detail": detail}


def assert_path_exists(project_root: str, file: str) -> dict:
    args = {"file": file}
    abs_path = resolve_within_root(project_root, file)
    if abs_path is None:
        return evidence(
            "path-exists", args, UNCHECKABLE,
            "path escapes the project root; not permitted to look",
        )
    if os.path.isfile(abs_path):
        return evidence("path-exists", args, PASSED, "file present")
    return evidence("path-exists", args, FAILED, "no file at this path")


def assert_symbol_exists(project_root: str, file: str, symbol: str) -> dict:
    """Present in the symbol table -> passed. Absent from the table but present
    in the raw text -> UNCHECKABLE, because the JS extractor is regex-based and
    cannot see every declaration form. Only absent from both is a disproof."""
    args = {"file": file, "symbol": symbol}
    abs_path = resolve_within_root(project_root, file)
    if abs_path is None:
        return evidence(
            "symbol-exists", args, UNCHECKABLE, "path escapes the project root",
        )
    if not os.path.isfile(abs_path):
        return evidence("symbol-exists", args, FAILED, "file does not exist")

    names = [s["name"] for s in symbols_for_file(abs_path)]
    if any(symbol == n or n.endswith(f".{symbol}") for n in names):
        return evidence("symbol-exists", args, PASSED, "found in symbol table")

    try:
        with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        return evidence("symbol-exists", args, UNCHECKABLE, f"unreadable: {exc}")

    if symbol in text:
        return evidence(
            "symbol-exists", args, UNCHECKABLE,
            "name appears in the file but the extractor did not surface it",
        )
    return evidence("symbol-exists", args, FAILED, "absent from table and text")
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -v
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add divtube_downloader/tui/services/nervous_assertions.py \
        divtube_downloader/tests/test_nervous_assertions.py
git commit -m "feat(nervous): assertion evidence vocabulary with path and symbol resolvers"
```

---

## Task 2: `test-references` and `imports`

**Files:**
- Modify: `divtube_downloader/tui/services/nervous_assertions.py`
- Test: `divtube_downloader/tests/test_nervous_assertions.py`

**Interfaces:**
- Consumes: `code_lens._cross_reference(project_root, symbol, max_hits=25) -> list[dict]` (each hit has `file`, `line`)
- Produces: `assert_test_references(project_root, test, symbol) -> dict`; `assert_imports(project_root, a, b) -> dict`

- [ ] **Step 1: Write the failing tests**

Append to `divtube_downloader/tests/test_nervous_assertions.py`:

```python
EVAL = "divtube_downloader/tui/services/code_eval.py"
TEST_LENS = "divtube_downloader/tests/test_code_lens.py"


class TestTestReferences(unittest.TestCase):
    def test_test_that_references_symbol_passes(self):
        r = na.assert_test_references(PROJECT_ROOT, TEST_LENS, "microscope")
        self.assertEqual(r["result"], na.PASSED)

    def test_test_that_does_not_reference_symbol_fails(self):
        r = na.assert_test_references(
            PROJECT_ROOT, TEST_LENS, "no_such_function_anywhere"
        )
        self.assertEqual(r["result"], na.FAILED)

    def test_missing_test_file_is_uncheckable(self):
        """We cannot disprove coverage using a test file that is not there."""
        r = na.assert_test_references(PROJECT_ROOT, "tests/gone.py", "microscope")
        self.assertEqual(r["result"], na.UNCHECKABLE)


class TestImports(unittest.TestCase):
    def test_real_import_passes(self):
        """code_eval imports code_lens at module level."""
        r = na.assert_imports(PROJECT_ROOT, EVAL, LENS)
        self.assertEqual(r["result"], na.PASSED)

    def test_absent_import_fails(self):
        r = na.assert_imports(PROJECT_ROOT, LENS, EVAL)
        self.assertEqual(r["result"], na.FAILED)

    def test_missing_source_is_uncheckable(self):
        r = na.assert_imports(PROJECT_ROOT, "no/such.py", LENS)
        self.assertEqual(r["result"], na.UNCHECKABLE)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -k "References or Imports" -v
```
Expected: 6 errors — `module 'tui.services.nervous_assertions' has no attribute 'assert_test_references'`.

- [ ] **Step 3: Write the implementation**

Append to `nervous_assertions.py` (and add `from tui.services.code_lens import _cross_reference` to the existing import line):

```python
def assert_test_references(project_root: str, test: str, symbol: str) -> dict:
    """Does the named test file mention the symbol? A missing test file is
    UNCHECKABLE, not FAILED -- absence of the test is not disproof of coverage,
    it is absence of the instrument."""
    args = {"test": test, "symbol": symbol}
    abs_test = resolve_within_root(project_root, test)
    if abs_test is None or not os.path.isfile(abs_test):
        return evidence(
            "test-references", args, UNCHECKABLE, "test file not present",
        )
    hits = _cross_reference(project_root, symbol, max_hits=50)
    rel_test = os.path.relpath(
        os.path.abspath(abs_test), os.path.abspath(project_root)
    )
    if any(h["file"] == rel_test for h in hits):
        return evidence("test-references", args, PASSED, "referenced in test")
    return evidence("test-references", args, FAILED, "not referenced in test")


# Matches `import x from 'y'`, `from y import x`, `require('y')`, `import 'y'`.
_IMPORT_TARGET = re.compile(
    r"""(?:from\s+['"]([^'"]+)['"]"""      # JS: from 'y'
    r"""|require\(\s*['"]([^'"]+)['"]"""   # JS: require('y')
    r"""|import\s+['"]([^'"]+)['"]"""      # JS: import 'y'
    r"""|^\s*from\s+([\w.]+)\s+import"""   # PY: from y import x
    r"""|^\s*import\s+([\w.]+))""",        # PY: import y
    re.MULTILINE,
)


def assert_imports(project_root: str, a: str, b: str) -> dict:
    """Does file `a` import file `b`? Resolved PAIRWISE ON DEMAND -- one file is
    parsed and one target looked for. This deliberately does not build, and does
    not need, a repo-wide import graph."""
    args = {"a": a, "b": b}
    abs_a = resolve_within_root(project_root, a)
    abs_b = resolve_within_root(project_root, b)
    if abs_a is None or not os.path.isfile(abs_a):
        return evidence("imports", args, UNCHECKABLE, "source file not present")
    if abs_b is None:
        return evidence("imports", args, UNCHECKABLE, "target escapes the root")
    try:
        with open(abs_a, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        return evidence("imports", args, UNCHECKABLE, f"unreadable: {exc}")

    # Compare on the target's module stem so './code_lens.js', '../code_lens'
    # and 'tui.services.code_lens' all match code_lens.py.
    stem = os.path.splitext(os.path.basename(abs_b))[0]
    for match in _IMPORT_TARGET.finditer(text):
        target = next((g for g in match.groups() if g), "")
        parts = re.split(r"[./\\]", target)
        if stem in parts:
            return evidence("imports", args, PASSED, f"imports {target}")
    return evidence("imports", args, FAILED, f"no import of {stem}")
```

Add `import re` to the module's imports.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -v
```
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add divtube_downloader/tui/services/nervous_assertions.py \
        divtube_downloader/tests/test_nervous_assertions.py
git commit -m "feat(nervous): test-references and pairwise imports resolvers"
```

---

## Task 3: `symbol-returns`, gated on declared purity

The only resolver that executes code. It must refuse to run against a module
that has not declared itself side-effect free.

**Files:**
- Modify: `divtube_downloader/tui/services/nervous_assertions.py`
- Test: `divtube_downloader/tests/test_nervous_assertions.py`

**Interfaces:**
- Consumes: `code_eval.evaluate(project_root, path, symbol, *, args=None, timeout=10, summarise_only=False) -> dict` (returns `ok`, `shape`, `value`, `called`, `stage`, `declaredPure`); `code_eval._declared_pure(abs_path) -> bool`
- Produces: `assert_symbol_returns(project_root, file, symbol, shape) -> dict`

- [ ] **Step 1: Write the failing tests**

Append to `divtube_downloader/tests/test_nervous_assertions.py`:

```python
PROJECTION = "codex/core/constellation/grimoire/projection-laws.js"


class TestSymbolReturns(unittest.TestCase):
    def test_matching_shape_passes(self):
        """projection-laws.js declares PURE AND ZERO-I/O and returns 79."""
        r = na.assert_symbol_returns(
            PROJECT_ROOT, PROJECTION, "synthesizeByProjection",
            {"type": "array", "length": 79},
        )
        self.assertEqual(r["result"], na.PASSED)

    def test_mismatched_shape_fails(self):
        r = na.assert_symbol_returns(
            PROJECT_ROOT, PROJECTION, "synthesizeByProjection",
            {"type": "array", "length": 1},
        )
        self.assertEqual(r["result"], na.FAILED)

    def test_impure_module_is_uncheckable_and_never_executed(self):
        """code_lens.py declares no purity, so the resolver must refuse rather
        than risk running import-time side effects."""
        r = na.assert_symbol_returns(
            PROJECT_ROOT, LENS, "microscope", {"type": "object"},
        )
        self.assertEqual(r["result"], na.UNCHECKABLE)
        self.assertIn("purity", r["detail"].lower())

    def test_symbol_that_throws_is_uncheckable_not_failed(self):
        """An execution error means we did not learn the shape, not that the
        declared shape is wrong."""
        r = na.assert_symbol_returns(
            PROJECT_ROOT, PROJECTION, "noSuchExport", {"type": "array"},
        )
        self.assertEqual(r["result"], na.UNCHECKABLE)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -k SymbolReturns -v
```
Expected: 4 errors — no attribute `assert_symbol_returns`.

- [ ] **Step 3: Write the implementation**

Append to `nervous_assertions.py`:

```python
from tui.services.code_eval import evaluate as _evaluate, _declared_pure


def assert_symbol_returns(
    project_root: str, file: str, symbol: str, shape: dict,
) -> dict:
    """Compare a symbol's real return shape against the claimed one.

    THIS RESOLVER RUNS CODE, so it refuses any module that has not declared the
    repo's PURE AND ZERO-I/O convention. A verification pass must never be the
    thing that triggers a side effect.
    """
    args = {"file": file, "symbol": symbol, "shape": shape}
    abs_path = resolve_within_root(project_root, file)
    if abs_path is None or not os.path.isfile(abs_path):
        return evidence("symbol-returns", args, UNCHECKABLE, "file not present")
    if not _declared_pure(abs_path):
        return evidence(
            "symbol-returns", args, UNCHECKABLE,
            "module declares no purity; refusing to execute it",
        )

    result = _evaluate(project_root, file, symbol)
    if not result.get("ok"):
        return evidence(
            "symbol-returns", args, UNCHECKABLE,
            f"could not evaluate ({result.get('stage')}): {result.get('error')}",
        )

    actual = result.get("shape") or {}
    mismatched = {k: (v, actual.get(k)) for k, v in shape.items() if actual.get(k) != v}
    if mismatched:
        return evidence(
            "symbol-returns", args, FAILED, f"shape differs: {mismatched}",
        )
    return evidence("symbol-returns", args, PASSED, f"shape matches {actual}")
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -v
```
Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
git add divtube_downloader/tui/services/nervous_assertions.py \
        divtube_downloader/tests/test_nervous_assertions.py
git commit -m "feat(nervous): symbol-returns resolver, refuses modules without a purity declaration"
```

---

## Task 4: `absent-under` and the dispatcher

`absent-under` backs the `forbidden` claims. The dispatcher is what the prober calls.

**Files:**
- Modify: `divtube_downloader/tui/services/nervous_assertions.py`
- Test: `divtube_downloader/tests/test_nervous_assertions.py`

**Interfaces:**
- Produces: `assert_absent_under(project_root, glob, pattern) -> dict`; `RESOLVERS: dict[str, callable]`; `run_assertion(project_root, spec: dict) -> dict`

- [ ] **Step 1: Write the failing tests**

Append to `divtube_downloader/tests/test_nervous_assertions.py`:

```python
class TestAbsentUnder(unittest.TestCase):
    def test_pattern_truly_absent_passes(self):
        r = na.assert_absent_under(
            PROJECT_ROOT, "divtube_downloader/tui/services/code_lens.py",
            "ZZ_NEVER_APPEARS_ZZ",
        )
        self.assertEqual(r["result"], na.PASSED)

    def test_pattern_present_fails(self):
        r = na.assert_absent_under(
            PROJECT_ROOT, "divtube_downloader/tui/services/code_lens.py",
            "def microscope",
        )
        self.assertEqual(r["result"], na.FAILED)

    def test_glob_matching_nothing_is_uncheckable(self):
        """An absence claim over an empty file set is vacuously true, which is
        exactly the vacuous-coverage trap. Report it as unknown."""
        r = na.assert_absent_under(PROJECT_ROOT, "no/such/dir/**", "anything")
        self.assertEqual(r["result"], na.UNCHECKABLE)


class TestDispatcher(unittest.TestCase):
    def test_dispatches_by_name(self):
        r = na.run_assertion(
            PROJECT_ROOT, {"assert": "path-exists", "file": LENS}
        )
        self.assertEqual(r["result"], na.PASSED)

    def test_unknown_assertion_is_uncheckable(self):
        """A claim naming a verb we have no resolver for cannot bind."""
        r = na.run_assertion(PROJECT_ROOT, {"assert": "vibes-align", "x": 1})
        self.assertEqual(r["result"], na.UNCHECKABLE)
        self.assertIn("no resolver", r["detail"].lower())

    def test_missing_required_arg_is_uncheckable(self):
        r = na.run_assertion(PROJECT_ROOT, {"assert": "symbol-exists", "file": LENS})
        self.assertEqual(r["result"], na.UNCHECKABLE)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -k "AbsentUnder or Dispatcher" -v
```
Expected: 6 errors — no attribute `assert_absent_under` / `run_assertion`.

- [ ] **Step 3: Write the implementation**

Append to `nervous_assertions.py` (add `import glob as _glob` to the imports):

```python
def assert_absent_under(project_root: str, glob: str, pattern: str) -> dict:
    """Absence of `pattern` across the files matched by `glob`.

    A glob matching zero files makes the claim vacuously true. That is the
    vacuous-coverage trap -- complete by virtue of never starting -- so it
    reports UNCHECKABLE rather than PASSED.
    """
    args = {"glob": glob, "pattern": pattern}
    root = os.path.abspath(project_root)
    matches = [
        p for p in _glob.glob(os.path.join(root, glob), recursive=True)
        if os.path.isfile(p) and resolve_within_root(project_root, os.path.relpath(p, root))
    ]
    if not matches:
        return evidence(
            "absent-under", args, UNCHECKABLE, "glob matched no files",
        )
    for path in sorted(matches):
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                if pattern in fh.read():
                    rel = os.path.relpath(path, root)
                    return evidence(
                        "absent-under", args, FAILED, f"pattern present in {rel}",
                    )
        except OSError:
            continue
    return evidence(
        "absent-under", args, PASSED, f"absent across {len(matches)} file(s)",
    )


RESOLVERS = {
    "path-exists": (assert_path_exists, ("file",)),
    "symbol-exists": (assert_symbol_exists, ("file", "symbol")),
    "test-references": (assert_test_references, ("test", "symbol")),
    "imports": (assert_imports, ("a", "b")),
    "symbol-returns": (assert_symbol_returns, ("file", "symbol", "shape")),
    "absent-under": (assert_absent_under, ("glob", "pattern")),
}


def run_assertion(project_root: str, spec: dict) -> dict:
    """Dispatch one assertion spec. A verb with no resolver, or a spec missing a
    required argument, cannot bind -- UNCHECKABLE, never FAILED."""
    name = (spec or {}).get("assert", "")
    entry = RESOLVERS.get(name)
    if entry is None:
        return evidence(
            name or "(none)", dict(spec or {}), UNCHECKABLE,
            f"no resolver for assertion {name!r}",
        )
    fn, required = entry
    missing = [k for k in required if k not in spec]
    if missing:
        return evidence(
            name, dict(spec), UNCHECKABLE, f"missing required arg(s): {missing}",
        )
    return fn(project_root, *(spec[k] for k in required))
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_assertions.py -v
```
Expected: 24 passed.

- [ ] **Step 5: Commit**

```bash
git add divtube_downloader/tui/services/nervous_assertions.py \
        divtube_downloader/tests/test_nervous_assertions.py
git commit -m "feat(nervous): absent-under resolver and assertion dispatcher"
```

---

## Task 5: The prober

**Files:**
- Create: `divtube_downloader/tui/services/nervous_probe.py`
- Test: `divtube_downloader/tests/test_nervous_probe.py`

**Interfaces:**
- Consumes: `capability_store.load_packets(directory) -> tuple[list[dict], list[str]]`; `nervous_assertions.run_assertion`
- Produces: `probe_entry(project_root, entry) -> dict`; `probe_packet(project_root, packet) -> dict`; `probe_all(project_root, capabilities_dir) -> dict`

- [ ] **Step 1: Write the failing tests**

Create `divtube_downloader/tests/test_nervous_probe.py`:

```python
"""Tests for the nervous-system prober.

The prober gathers evidence and takes no view on what it warrants. Every test
here asserts about evidence, never about kinds -- kinds are the gate's job.
"""

import os
import unittest

from tui.services import nervous_probe as np

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
LENS = "divtube_downloader/tui/services/code_lens.py"


class TestProbeEntry(unittest.TestCase):
    def test_entry_with_passing_assertions_reports_all_passed(self):
        entry = {
            "need": "n", "canonical": "c", "path": LENS,
            "verification": [
                {"assert": "path-exists", "file": LENS},
                {"assert": "symbol-exists", "file": LENS, "symbol": "microscope"},
            ],
        }
        r = np.probe_entry(PROJECT_ROOT, entry)
        self.assertEqual(r["counts"]["passed"], 2)
        self.assertEqual(r["counts"]["failed"], 0)
        self.assertEqual(r["counts"]["uncheckable"], 0)

    def test_entry_with_dead_path_reports_a_failure(self):
        entry = {
            "need": "n", "canonical": "c", "path": "gone/x.py",
            "verification": [{"assert": "path-exists", "file": "gone/x.py"}],
        }
        r = np.probe_entry(PROJECT_ROOT, entry)
        self.assertEqual(r["counts"]["failed"], 1)

    def test_entry_without_verification_block_is_marked_unverifiable(self):
        """A claim carrying no assertion names nothing checkable."""
        r = np.probe_entry(PROJECT_ROOT, {"need": "n", "canonical": "c"})
        self.assertTrue(r["unverifiable"])
        self.assertEqual(r["evidence"], [])

    def test_forbidden_prose_without_assertion_is_reported_separately(self):
        entry = {
            "need": "n", "canonical": "c", "path": LENS,
            "forbidden": ["spawning a fresh node process per score call"],
            "verification": [{"assert": "path-exists", "file": LENS}],
        }
        r = np.probe_entry(PROJECT_ROOT, entry)
        self.assertEqual(r["forbiddenUnverified"], 1)


class TestProbeAll(unittest.TestCase):
    def test_sweeps_the_real_capability_directory(self):
        r = np.probe_all(PROJECT_ROOT)
        self.assertTrue(r["ok"])
        self.assertGreaterEqual(len(r["domains"]), 4)
        for d in r["domains"]:
            self.assertIn("domain", d)
            self.assertIn("entries", d)

    def test_reports_surfaces_that_match_no_files(self):
        r = np.probe_all(PROJECT_ROOT)
        for d in r["domains"]:
            self.assertIn("deadSurfaces", d)

    def test_is_deterministic(self):
        import json
        a = json.dumps(np.probe_all(PROJECT_ROOT), sort_keys=True)
        b = json.dumps(np.probe_all(PROJECT_ROOT), sort_keys=True)
        self.assertEqual(a, b)


class TestCorruptionMetaTest(unittest.TestCase):
    def test_a_corrupted_capability_is_detected(self):
        """The verifier must be shown failing before it is trusted to pass."""
        entry = {
            "need": "n", "canonical": "c",
            "path": "divtube_downloader/tui/services/code_lens.py",
            "verification": [
                {"assert": "symbol-exists",
                 "file": "divtube_downloader/tui/services/code_lens.py",
                 "symbol": "deliberately_removed_symbol"},
            ],
        }
        r = np.probe_entry(PROJECT_ROOT, entry)
        self.assertEqual(r["counts"]["failed"], 1)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_probe.py -v
```
Expected: collection error — cannot import `nervous_probe`.

- [ ] **Step 3: Write the implementation**

Create `divtube_downloader/tui/services/nervous_probe.py`:

```python
"""Nervous-system prober: capability claims -> evidence.

Gathers and reports. Takes no view on what the evidence warrants -- that is
`scripts/nervous-gate.mjs`, which runs the Semantic Calculus. The split follows
cleri-probe/cleri-gate, for the same reason: the calculus adjudicates results and
takes no part in producing them.

Emits JSON on stdout. Never writes to a capability file.
"""

from __future__ import annotations

import argparse
import glob as _glob
import json
import os
import sys

from tui.services.nervous_assertions import (
    FAILED, PASSED, UNCHECKABLE, run_assertion,
)

DEFAULT_CAPABILITIES_DIR = (
    "steamdeck_brain/vaelrix_forcefield/scdna/capabilities"
)


def probe_entry(project_root: str, entry: dict) -> dict:
    """Run one capability entry's assertions and tally the outcomes."""
    specs = entry.get("verification") or []
    results = [run_assertion(project_root, s) for s in specs]
    counts = {
        PASSED: sum(1 for r in results if r["result"] == PASSED),
        FAILED: sum(1 for r in results if r["result"] == FAILED),
        UNCHECKABLE: sum(1 for r in results if r["result"] == UNCHECKABLE),
    }
    forbidden = entry.get("forbidden") or []
    return {
        "need": entry.get("need", ""),
        "canonical": entry.get("canonical", ""),
        "path": entry.get("path", ""),
        "evidence": results,
        "counts": counts,
        # No assertion at all: nothing about this claim is checkable.
        "unverifiable": len(specs) == 0,
        # `forbidden` entries are prose unless an absent-under assertion covers
        # them. Counted so the gate can type them Hypothesis rather than silently
        # presenting unverified prose as verified guidance.
        "forbiddenUnverified": max(
            0, len(forbidden) - sum(
                1 for s in specs if s.get("assert") == "absent-under"
            ),
        ),
    }


def _dead_surfaces(project_root: str, packet: dict) -> list[str]:
    """Surface globs that match no files -- the hub points at nothing."""
    root = os.path.abspath(project_root)
    dead = []
    for surface in packet.get("surfaces") or []:
        if not _glob.glob(os.path.join(root, surface), recursive=True):
            dead.append(surface)
    return dead


def probe_packet(project_root: str, packet: dict) -> dict:
    return {
        "domain": packet.get("domain", "(unknown)"),
        "contract": packet.get("contract", ""),
        # `surfaces` travels alongside `deadSurfaces` so the gate can tell a hub
        # with one dead glob from a hub whose every glob is dead.
        "surfaces": list(packet.get("surfaces") or []),
        "deadSurfaces": _dead_surfaces(project_root, packet),
        "entries": [
            probe_entry(project_root, e) for e in packet.get("capabilities") or []
        ],
    }


def probe_all(project_root: str, capabilities_dir: str | None = None) -> dict:
    """Sweep every capability packet. Sorted for determinism."""
    rel_dir = capabilities_dir or DEFAULT_CAPABILITIES_DIR
    abs_dir = os.path.join(os.path.abspath(project_root), rel_dir)
    if not os.path.isdir(abs_dir):
        return {
            "ok": False, "stage": "load",
            "error": f"no capabilities directory at {rel_dir}",
            "domains": [],
        }
    packets = []
    for path in sorted(_glob.glob(os.path.join(abs_dir, "*.capability.json"))):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                packets.append(json.load(fh))
        except (OSError, json.JSONDecodeError) as exc:
            return {
                "ok": False, "stage": "load",
                "error": f"{os.path.basename(path)}: {exc}", "domains": [],
            }
    domains = sorted(
        (probe_packet(project_root, p) for p in packets),
        key=lambda d: d["domain"],
    )
    return {"ok": True, "stage": "probed", "domains": domains}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Probe SCDNA capability claims.")
    parser.add_argument("--root", default=os.getcwd())
    parser.add_argument("--capabilities-dir", default=None)
    ns = parser.parse_args(argv)
    report = probe_all(ns.root, ns.capabilities_dir)
    json.dump(report, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    # A sweep that could not run must never look like a clean sweep.
    return 0 if report.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_probe.py -v
```
Expected: 8 passed.

- [ ] **Step 5: Verify the CLI runs against the real repo**

```bash
cd /home/deck/Downloads/Scholomance-V12-main/divtube_downloader
PYTHONPATH=. .venv/bin/python -m tui.services.nervous_probe \
  --root /home/deck/Downloads/Scholomance-V12-main | head -40
```
Expected: JSON with `"ok": true` and four domains. Every entry will currently show
`"unverifiable": true`, because no capability has a `verification` block yet.
That is the correct pre-Task-7 state.

- [ ] **Step 6: Commit**

```bash
git add divtube_downloader/tui/services/nervous_probe.py \
        divtube_downloader/tests/test_nervous_probe.py
git commit -m "feat(nervous): capability prober emitting evidence JSON"
```

---

## Task 6: The gate

**Files:**
- Create: `scripts/nervous-gate.mjs`
- Test: `tests/qa/features/nervous-gate.test.js`

**Interfaces:**
- Consumes: prober JSON from Task 5; `adjudicateLaw({kind, riskProfile})` from `codex/core/semantic-calculus/kind.ts`; `deriveEpistemic(input)` from `codex/core/semantic-calculus/epistemic.ts`; `riskFor(consequence)` from `codex/core/semantic-calculus/cliLexicon.ts`
- Produces: `kindForEntry(entry) -> 'Do'|'Clarify'|'Theory'`; `kindForForbidden(entry) -> 'Hypothesis'|null`; `adjudicateSweep(report) -> {domains, census}`

> **Why `.mjs` run through tsx:** the calculus is TypeScript. `cleri-gate.js`
> imports those `.ts` modules directly and is therefore run as
> `npx tsx scripts/cleri-gate.mjs`. Measured cost of importing the calculus is
> 295ms → 1320ms, which is exactly why the probe stays a separate process.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/nervous-gate.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { kindForEntry, kindForForbidden, adjudicateSweep }
  from '../../../scripts/nervous-gate.mjs';

const entry = (counts, extra = {}) => ({
  need: 'n', canonical: 'c', path: 'p',
  counts: { passed: 0, failed: 0, uncheckable: 0, ...counts },
  unverifiable: false, forbiddenUnverified: 0, evidence: [], ...extra,
});

describe('nervous gate — kind mapping', () => {
  it('types an entry whose assertions all passed as Do', () => {
    expect(kindForEntry(entry({ passed: 3 }))).toBe('Do');
  });

  it('types a disproved claim as Theory', () => {
    expect(kindForEntry(entry({ passed: 2, failed: 1 }))).toBe('Theory');
  });

  /**
   * THE COLLAPSE TEST. An unrunnable resolver is not a disproof. Collapsing
   * uncheckable into failed reports live guidance as dead.
   */
  it('types an unrunnable check as Clarify, never Theory', () => {
    expect(kindForEntry(entry({ passed: 1, uncheckable: 1 }))).toBe('Clarify');
  });

  it('lets a real failure outrank an unrunnable check', () => {
    expect(kindForEntry(entry({ failed: 1, uncheckable: 1 }))).toBe('Theory');
  });

  it('types a claim carrying no assertion at all as Theory', () => {
    expect(kindForEntry(entry({}, { unverifiable: true }))).toBe('Theory');
  });

  it('types unverified forbidden prose as Hypothesis', () => {
    expect(kindForForbidden(entry({ passed: 1 }, { forbiddenUnverified: 2 })))
      .toBe('Hypothesis');
  });

  it('emits no Hypothesis when every forbidden claim is asserted', () => {
    expect(kindForForbidden(entry({ passed: 1 }))).toBeNull();
  });

  /**
   * Spec §9: a Hypothesis must be non-executable by construction, not by
   * convention. This asserts the calculus itself refuses it.
   */
  it('refuses to execute a Hypothesis-kinded act', async () => {
    const { assertExecutable } = await import(
      '../../../codex/core/semantic-calculus/compiler.ts'
    );
    const act = {
      kind: 'Hypothesis',
      law: { decision: 'allow' },
    };
    expect(() => assertExecutable(act)).toThrow();
  });
});

describe('nervous gate — census', () => {
  it('counts kinds across domains and flags dead surfaces', () => {
    const report = {
      ok: true,
      domains: [{
        domain: 'demo', contract: 'SCDNA-CAPABILITY-v2',
        deadSurfaces: ['nope/**'], surfaces: ['nope/**', 'real/**'],
        entries: [entry({ passed: 1 }), entry({ failed: 1 })],
      }],
    };
    const out = adjudicateSweep(report);
    expect(out.census.Do).toBe(1);
    expect(out.census.Theory).toBe(1);
    expect(out.domains[0].deadSurfaces).toEqual(['nope/**']);
  });

  /** Spec §8: a hub whose every surface glob matches nothing points at nothing. */
  it('types a hub with no live surface as Theory', () => {
    const out = adjudicateSweep({
      ok: true,
      domains: [{
        domain: 'ghost', deadSurfaces: ['a/**', 'b/**'],
        surfaces: ['a/**', 'b/**'], entries: [],
      }],
    });
    expect(out.domains[0].hubKind).toBe('Theory');
  });

  it('types a hub with at least one live surface as Probe', () => {
    const out = adjudicateSweep({
      ok: true,
      domains: [{
        domain: 'live', deadSurfaces: ['a/**'],
        surfaces: ['a/**', 'b/**'], entries: [],
      }],
    });
    expect(out.domains[0].hubKind).toBe('Probe');
  });

  it('refuses to certify a sweep that could not run', () => {
    const out = adjudicateSweep({ ok: false, stage: 'load', domains: [] });
    expect(out.ok).toBe(false);
    expect(out.census.Do).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/qa/features/nervous-gate.test.js
```
Expected: FAIL — cannot resolve `scripts/nervous-gate.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/nervous-gate.mjs`:

```javascript
#!/usr/bin/env node
/**
 * NERVOUS GATE — adjudicate a capability sweep through the Semantic Calculus.
 *
 *   PYTHONPATH=. .venv/bin/python -m tui.services.nervous_probe --root ROOT > /tmp/s.json
 *   npx tsx scripts/nervous-gate.mjs /tmp/s.json
 *
 * WHY THIS IS A SEPARATE PROCESS
 *
 * The prober needs the Python lenses; the calculus is TypeScript and costs a
 * 4.5x startup tax under tsx. The same split, and the same reason, as
 * cleri-probe/cleri-gate. It is also the honest separation: the prober says
 * what it verified, this says what that warrants.
 *
 * WHAT IT REFUSES TO DO
 *
 * It never reports a clean sweep for a run that checked nothing, and it never
 * turns "could not check" into "checked and false".
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { riskFor } from '../codex/core/semantic-calculus/cliLexicon.ts';
import { adjudicateLaw } from '../codex/core/semantic-calculus/kind.ts';
import { deriveEpistemic } from '../codex/core/semantic-calculus/epistemic.ts';

export const SCHEMA = 'SCD-NERVOUS-GATE-v1';
const DATE = '2026-08-09';

/**
 * A claim binds when something checkable was checked and held.
 *
 *   any failed        -> Theory      the binding is disproved
 *   no assertions     -> Theory      nothing checkable was named
 *   any uncheckable   -> Clarify     a required slot could not be resolved
 *   all passed        -> Do
 *
 * `failed` outranks `uncheckable`: one disproof settles it regardless of what
 * else could not be reached.
 */
export function kindForEntry(entry) {
  const c = entry.counts || {};
  if ((c.failed || 0) > 0) return 'Theory';
  if (entry.unverifiable || (c.passed || 0) + (c.uncheckable || 0) === 0) return 'Theory';
  if ((c.uncheckable || 0) > 0) return 'Clarify';
  return 'Do';
}

/**
 * Forbidden prose supplies a candidate reading with nothing to bind it to.
 * That is a Hypothesis: still shown as guidance, never asserted as verified.
 */
export function kindForForbidden(entry) {
  return (entry.forbiddenUnverified || 0) > 0 ? 'Hypothesis' : null;
}

export function adjudicateSweep(report) {
  const census = { Do: 0, Clarify: 0, Theory: 0, Hypothesis: 0, Probe: 0 };
  const domains = [];

  for (const d of report.domains || []) {
    const entries = (d.entries || []).map((e) => {
      const kind = kindForEntry(e);
      census[kind] += 1;
      const hypothesis = kindForForbidden(e);
      if (hypothesis) census.Hypothesis += 1;
      const bound = kind === 'Do' || kind === 'Clarify';
      return {
        ...e,
        kind,
        forbiddenKind: hypothesis,
        law: adjudicateLaw({ kind, riskProfile: riskFor('reversible_ui') }),
        epistemic: deriveEpistemic({
          kind,
          bound,
          hasUnresolvedSlots: kind === 'Clarify',
          unknownReferent: kind === 'Theory',
          needsEvidence: !bound,
          hasObservationReceipts: (e.counts?.passed || 0) > 0,
          hasGeneCites: true,
        }),
      };
    });

    // A hub whose every surface glob matches nothing binds to no files at all.
    // Nothing bound is Theory -- it does NOT mean the domain is unrelated to
    // anything, only that this hub currently points at nothing that exists.
    const surfaces = d.surfaces || [];
    const dead = d.deadSurfaces || [];
    const hubKind = surfaces.length > 0 && dead.length === surfaces.length
      ? 'Theory'
      : 'Probe';

    domains.push({ ...d, hubKind, entries });
  }

  return { schema: SCHEMA, ok: Boolean(report.ok), census, domains };
}

function domainMarkdown(d) {
  const rows = d.entries.map((e) => {
    const need = String(e.need).replace(/\|/g, '\\|');
    const p = e.counts?.passed || 0;
    const f = e.counts?.failed || 0;
    const u = e.counts?.uncheckable || 0;
    return `| ${need} | \`${e.kind}\` | ${p} | ${f} | ${u} | ${e.forbiddenKind || '—'} |`;
  }).join('\n');

  const dead = d.deadSurfaces?.length
    ? d.deadSurfaces.map((s) => `- \`${s.replace(/\|/g, '\\|')}\``).join('\n')
    : '_none_';

  return `# Nervous Sweep — \`${d.domain}\` — ${DATE}

**Hub kind:** \`${d.hubKind}\`

Kinds are adjudicated from mechanical evidence. \`Theory\` means nothing bound —
it never means "these systems are unrelated".

| Need | Kind | passed | failed | unchecked | Forbidden |
|---|---|---|---|---|---|
${rows || '_no capability entries_'}

## Surfaces matching no files

${dead}

## Repro

\`\`\`bash
PYTHONPATH=. .venv/bin/python -m tui.services.nervous_probe --root ROOT > /tmp/s.json
npx tsx scripts/nervous-gate.mjs /tmp/s.json
\`\`\`
`;
}

function indexMarkdown(out) {
  const c = out.census;
  const rows = out.domains.map((d) => {
    const k = (kind) => d.entries.filter((e) => e.kind === kind).length;
    return `| \`${d.domain}\` | ${d.entries.length} | ${k('Do')} | ${k('Clarify')} `
      + `| ${k('Theory')} | ${d.deadSurfaces?.length || 0} `
      + `| [detail](${DATE}-nervous-sweep-${d.domain}.md) |`;
  }).join('\n');

  return `# Nervous Sweep — Census — ${DATE}

${out.ok ? '' : '> **SWEEP DID NOT RUN.** Counts below are structurally zero and\n'
    + '> mean nothing was checked. This is not a clean bill of health.\n'}
| Domain | Entries | Do | Clarify | Theory | Dead surfaces | Detail |
|---|---|---|---|---|---|---|
${rows || '_no domains_'}

**Totals:** Do ${c.Do} · Clarify ${c.Clarify} · Theory ${c.Theory} · Hypothesis ${c.Hypothesis}

## Reading this

- \`Do\` — every named assertion ran and held.
- \`Clarify\` — nothing was disproved, but a resolver could not run. Unknown, not false.
- \`Theory\` — a claim was disproved, or named nothing checkable. Deposited, not routable.
- \`Hypothesis\` — \`forbidden\` prose with no mechanical check. Guidance, never verified.

**The premise test:** if no entry that currently reads as authoritative guidance
types \`Theory\`, stale guidance is not the dominant failure and the rest of the
nervous-system design should not be built.
`;
}

const inputPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (inputPath) {
  const report = JSON.parse(readFileSync(inputPath, 'utf8'));
  const out = adjudicateSweep(report);
  const dir = path.resolve('docs/superpowers/evidence');
  mkdirSync(dir, { recursive: true });
  for (const d of out.domains) {
    writeFileSync(
      path.join(dir, `${DATE}-nervous-sweep-${d.domain}.md`), domainMarkdown(d),
    );
  }
  writeFileSync(path.join(dir, `${DATE}-nervous-sweep-index.md`), indexMarkdown(out));
  console.log(`census: ${JSON.stringify(out.census)}`);
  console.log(`wrote ${out.domains.length} domain file(s) + index to ${dir}`);
  process.exitCode = out.ok ? 0 : 2;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/qa/features/nervous-gate.test.js
```
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add scripts/nervous-gate.mjs tests/qa/features/nervous-gate.test.js
git commit -m "feat(nervous): calculus gate adjudicating sweep evidence into kinds"
```

---

## Task 7: Retrofit the four capabilities, run the census — DECISION GATE

**Files:**
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/career-ats.capability.json`
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/divtube-cockpit.capability.json`
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/phonology.capability.json`
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/pixel-art-direction.capability.json`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: `docs/superpowers/evidence/2026-08-09-nervous-sweep-*.md`; the census that decides whether Tasks 8–9 are built.

- [ ] **Step 1: Add a `verification` block to every capability entry**

For each entry, add assertions that name what is actually checkable. Bump
`"contract"` to `"SCDNA-CAPABILITY-v2"`. Worked example for the TurboQuant entry
in `divtube-cockpit.capability.json`:

```json
{
  "need": "semantic SEO / niche match scoring of titles & content (0-100)",
  "canonical": "TurboQuantService (tui/services/turboquant_service.py) — thin Python client that spawns turboquant_plugin.js ONCE and talks JSON-lines over stdio; scoring stays local and sub-millisecond",
  "path": "divtube_downloader/tui/services/turboquant_service.py",
  "evidence": "degrades gracefully (self.available == False) when Node is unavailable so the cockpit still launches; color-codes scores against the shared Scholomance palette",
  "forbidden": [
    "re-implementing scoring in Python — the engine is the Node microservice",
    "spawning a fresh node process per score call — the plugin is long-lived over stdio"
  ],
  "verification": [
    { "assert": "path-exists", "file": "divtube_downloader/tui/services/turboquant_service.py" },
    { "assert": "symbol-exists", "file": "divtube_downloader/tui/services/turboquant_service.py", "symbol": "TurboQuantService" },
    { "assert": "path-exists", "file": "divtube_downloader/turboquant_plugin.js" }
  ]
}
```

Rules while writing these:
- Only assert what the vocabulary can resolve. Do not invent verbs.
- Leave `forbidden` prose alone. It is expected to type `Hypothesis`, and that
  reclassification is a deliberate outcome of this task, not a regression.
- Do not delete a claim because it fails. A failing claim is the finding.

- [ ] **Step 2: Run the sweep**

```bash
cd /home/deck/Downloads/Scholomance-V12-main/divtube_downloader
PYTHONPATH=. .venv/bin/python -m tui.services.nervous_probe \
  --root /home/deck/Downloads/Scholomance-V12-main > /tmp/sweep.json
cd /home/deck/Downloads/Scholomance-V12-main
npx tsx scripts/nervous-gate.mjs /tmp/sweep.json
```
Expected: a census line and five written files (four domains + index).

- [ ] **Step 3: Read the census and decide**

Open `docs/superpowers/evidence/2026-08-09-nervous-sweep-index.md`.

- **If one or more entries type `Theory`** — the premise holds. Stale guidance
  is real and unfalsifiable today. Proceed to Task 8.
- **If no entry types `Theory`** — **STOP.** Report the census to the user and do
  not build Tasks 8–9. The design's own primary success criterion says stale
  guidance is then not the dominant failure, and the remainder is not justified.
  A `Clarify`-heavy census is not a confirmation; it means the resolvers could
  not reach the claims, which is a prober gap, not a drift finding.

- [ ] **Step 4: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/capabilities/*.capability.json \
        docs/superpowers/evidence/2026-08-09-nervous-sweep-*.md
git commit -m "feat(nervous): verification blocks on all capabilities + first kind census"
```

---

## Task 8: Typed bridges between hubs

Only build this if Task 7's census confirmed the premise.

**Files:**
- Modify: `divtube_downloader/tui/services/nervous_probe.py`
- Modify: `divtube_downloader/tests/test_nervous_probe.py`
- Modify: the four `*.capability.json` files

**Interfaces:**
- Consumes: `nervous_assertions.run_assertion`
- Produces: `probe_bridges(project_root, packet) -> list[dict]`; each bridge dict has `from`, `to`, `type`, `evidence`, `counts`. `probe_packet` gains a `"bridges"` key.

- [ ] **Step 1: Write the failing tests**

Append to `divtube_downloader/tests/test_nervous_probe.py`:

```python
BRIDGE_TYPES_OK = {"uses", "depends-on", "validated-by", "feeds", "consumed-by"}


class TestBridges(unittest.TestCase):
    def test_bridge_with_a_holding_assertion_passes(self):
        packet = {"domain": "a", "bridges": [{
            "from": "a", "to": "b", "type": "uses",
            "verification": [{
                "assert": "imports",
                "a": "divtube_downloader/tui/services/code_eval.py",
                "b": "divtube_downloader/tui/services/code_lens.py",
            }],
        }]}
        [b] = np.probe_bridges(PROJECT_ROOT, packet)
        self.assertEqual(b["counts"]["passed"], 1)

    def test_bridge_type_with_no_backing_assertion_is_rejected(self):
        """`conceptually-related-to` names no resolvable slot, so it cannot bind."""
        packet = {"domain": "a", "bridges": [{
            "from": "a", "to": "b", "type": "conceptually-related-to",
        }]}
        [b] = np.probe_bridges(PROJECT_ROOT, packet)
        self.assertTrue(b["unverifiable"])

    def test_unknown_bridge_type_is_rejected(self):
        packet = {"domain": "a", "bridges": [{
            "from": "a", "to": "b", "type": "vibes-with",
            "verification": [{"assert": "path-exists", "file": LENS}],
        }]}
        [b] = np.probe_bridges(PROJECT_ROOT, packet)
        self.assertTrue(b["unverifiable"])
        self.assertIn("bridge type", b["detail"].lower())

    def test_packet_without_bridges_yields_empty_list(self):
        self.assertEqual(np.probe_bridges(PROJECT_ROOT, {"domain": "a"}), [])
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_probe.py -k Bridges -v
```
Expected: 4 errors — no attribute `probe_bridges`.

- [ ] **Step 3: Write the implementation**

Append to `nervous_probe.py`:

```python
# A bridge type is admissible only if an assertion can back it. There is
# deliberately no entry for `conceptually-related-to`: it names no resolvable
# slot, so it cannot bind and is deposited as a note rather than traversed.
BRIDGE_TYPES = frozenset(
    {"uses", "depends-on", "validated-by", "feeds", "consumed-by"}
)


def probe_bridges(project_root: str, packet: dict) -> list[dict]:
    """Verify each declared bridge. An unbacked or unknown type is unverifiable,
    which the gate types as Theory -- stored, never routed."""
    out = []
    for bridge in packet.get("bridges") or []:
        btype = bridge.get("type", "")
        specs = bridge.get("verification") or []
        base = {
            "from": bridge.get("from", ""),
            "to": bridge.get("to", ""),
            "type": btype,
        }
        if btype not in BRIDGE_TYPES:
            out.append({
                **base, "evidence": [], "unverifiable": True,
                "counts": {PASSED: 0, FAILED: 0, UNCHECKABLE: 0},
                "detail": f"bridge type {btype!r} has no backing assertion",
            })
            continue
        if not specs:
            out.append({
                **base, "evidence": [], "unverifiable": True,
                "counts": {PASSED: 0, FAILED: 0, UNCHECKABLE: 0},
                "detail": "bridge declares no verification",
            })
            continue
        results = [run_assertion(project_root, s) for s in specs]
        out.append({
            **base,
            "evidence": results,
            "unverifiable": False,
            "detail": "",
            "counts": {
                PASSED: sum(1 for r in results if r["result"] == PASSED),
                FAILED: sum(1 for r in results if r["result"] == FAILED),
                UNCHECKABLE: sum(1 for r in results if r["result"] == UNCHECKABLE),
            },
        })
    return out
```

Then add `"bridges": probe_bridges(project_root, packet),` to the dict returned by
`probe_packet`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_probe.py -v
```
Expected: 12 passed.

- [ ] **Step 5: Author real bridges**

Add a `"bridges"` array to at least two capability packets, connecting hubs that
genuinely relate. Worked example for `divtube-cockpit`:

```json
"bridges": [
  {
    "from": "divtube-cockpit",
    "to": "phonology",
    "type": "uses",
    "why": "the cockpit's semantic scoring consumes the phoneme engine's vocabulary",
    "verification": [
      { "assert": "path-exists", "file": "divtube_downloader/turbovec.js" }
    ]
  }
]
```

- [ ] **Step 6: Re-run the sweep and commit**

```bash
cd divtube_downloader && PYTHONPATH=. .venv/bin/python -m tui.services.nervous_probe \
  --root .. > /tmp/sweep.json && cd ..
npx tsx scripts/nervous-gate.mjs /tmp/sweep.json
git add divtube_downloader/tui/services/nervous_probe.py \
        divtube_downloader/tests/test_nervous_probe.py \
        steamdeck_brain/vaelrix_forcefield/scdna/capabilities/*.capability.json \
        docs/superpowers/evidence/2026-08-09-nervous-sweep-*.md
git commit -m "feat(nervous): typed bridges admitted only when an assertion backs them"
```

---

## Task 9: The router

**Files:**
- Create: `divtube_downloader/tui/services/nervous_router.py`
- Test: `divtube_downloader/tests/test_nervous_router.py`

**Interfaces:**
- Consumes: `nervous_probe.probe_all(project_root) -> dict`
- Produces: `route(project_root, question, *, k=3, hops=2, files_per_hub=5) -> dict` with keys `hubs`, `budget`, `truncated`

- [ ] **Step 1: Write the failing tests**

Create `divtube_downloader/tests/test_nervous_router.py`:

```python
"""Routing tests, including the benchmark this design was written against."""

import os
import unittest

from tui.services import nervous_router as nr

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


class TestBudgets(unittest.TestCase):
    def test_respects_the_hub_budget(self):
        r = nr.route(PROJECT_ROOT, "scoring", k=2)
        self.assertLessEqual(len(r["hubs"]), 2)

    def test_reports_its_budget_so_truncation_is_visible(self):
        r = nr.route(PROJECT_ROOT, "scoring", k=1)
        self.assertEqual(r["budget"]["k"], 1)
        self.assertIn("truncated", r)

    def test_caps_files_per_hub(self):
        r = nr.route(PROJECT_ROOT, "scoring", files_per_hub=2)
        for hub in r["hubs"]:
            self.assertLessEqual(len(hub["entryPoints"]), 2)


class TestAdmission(unittest.TestCase):
    def test_never_routes_a_theory_claim_as_fact(self):
        r = nr.route(PROJECT_ROOT, "scoring")
        for hub in r["hubs"]:
            for ep in hub["entryPoints"]:
                self.assertIn(ep["kind"], ("Do", "Clarify"))

    def test_a_question_matching_nothing_returns_no_hubs_and_says_so(self):
        """Absence must read as 'nothing bound', never as 'unrelated'."""
        r = nr.route(PROJECT_ROOT, "zzz_no_such_domain_zzz")
        self.assertEqual(r["hubs"], [])
        self.assertEqual(r["kind"], "Theory")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_router.py -v
```
Expected: collection error — cannot import `nervous_router`.

- [ ] **Step 3: Write the implementation**

Create `divtube_downloader/tui/services/nervous_router.py`:

```python
"""Route a question to hubs and entry points, bounded by a declared budget.

NO SPREADING ACTIVATION. k-hop with an explicit budget, and the budget travels
in the result so a truncated answer is visibly truncated rather than silently
cut at a threshold nobody can see.

TRAVERSAL COST COMES FROM KIND, NEVER FROM TRAFFIC. Nothing here counts how
often a path was walked, so no rich-get-richer loop can form and bury the
weak-but-correct edge.
"""

from __future__ import annotations

from tui.services.nervous_probe import probe_all

ROUTABLE_KINDS = ("Do", "Clarify")


def _kind_of(entry: dict) -> str:
    """Mirror of nervous-gate.mjs kindForEntry. Kept in Python so routing does
    not require the tsx process; the gate remains the authority for reports."""
    counts = entry.get("counts") or {}
    if counts.get("failed", 0) > 0:
        return "Theory"
    if entry.get("unverifiable") or counts.get("passed", 0) + counts.get("uncheckable", 0) == 0:
        return "Theory"
    if counts.get("uncheckable", 0) > 0:
        return "Clarify"
    return "Do"


def _score(question: str, entry: dict, domain: str) -> int:
    """Ordinal term overlap. RANKS which hubs surface; never gates admission."""
    words = {w for w in question.lower().split() if len(w) > 2}
    haystack = " ".join([
        domain, entry.get("need", ""), entry.get("canonical", ""),
        entry.get("path", ""),
    ]).lower()
    return sum(1 for w in words if w in haystack)


def route(
    project_root: str,
    question: str,
    *,
    k: int = 3,
    hops: int = 2,
    files_per_hub: int = 5,
) -> dict:
    """Rank hubs by term overlap, return their routable entry points."""
    sweep = probe_all(project_root)
    budget = {"k": k, "hops": hops, "filesPerHub": files_per_hub}

    hubs = []
    for d in sweep.get("domains", []):
        scored = []
        for entry in d.get("entries", []):
            kind = _kind_of(entry)
            if kind not in ROUTABLE_KINDS:
                continue
            s = _score(question, entry, d["domain"])
            if s > 0:
                scored.append((s, {
                    "path": entry.get("path", ""),
                    "need": entry.get("need", ""),
                    "kind": kind,
                    "passedAssertions": (entry.get("counts") or {}).get("passed", 0),
                }))
        if not scored:
            continue
        scored.sort(key=lambda x: (-x[0], x[1]["path"]))
        hubs.append({
            "domain": d["domain"],
            "score": sum(s for s, _ in scored),
            "entryPoints": [e for _, e in scored[:files_per_hub]],
            "truncatedEntryPoints": len(scored) > files_per_hub,
        })

    hubs.sort(key=lambda h: (-h["score"], h["domain"]))
    truncated = len(hubs) > k

    return {
        "question": question,
        "budget": budget,
        "truncated": truncated,
        # Nothing bound is Theory. It is NOT a claim that no relationship exists.
        "kind": "Probe" if hubs else "Theory",
        "hubs": hubs[:k],
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/test_nervous_router.py -v
```
Expected: 5 passed.

- [ ] **Step 5: Run the design's secondary success benchmark**

```bash
cd divtube_downloader
PYTHONPATH=. .venv/bin/python -c "
from tui.services.nervous_router import route
r = route('..', 'why did the extrapolation slate produce zero nuclei')
for h in r['hubs']:
    print(h['domain'], [e['path'] for e in h['entryPoints']])
print('kind:', r['kind'])
"
```
Expected: surfaces `scripts/cyclotron-extrapolation-simulation.mjs`, not only
`grimoire/extrapolation-simulation.js`.

If it does not, that is a real result, not a test to bend: it means no
constellation hub exists yet. Record it and report — do not add a hub purely to
make the benchmark pass, because a hub authored to satisfy its own benchmark is
a check that cannot fail.

- [ ] **Step 6: Commit**

```bash
git add divtube_downloader/tui/services/nervous_router.py \
        divtube_downloader/tests/test_nervous_router.py
git commit -m "feat(nervous): budget-bounded router over admitted claims"
```

---

## Final verification

- [ ] **All suites green**

```bash
cd divtube_downloader && PYTHONPATH=. .venv/bin/python -m pytest tests/ -q && cd ..
npx vitest run tests/qa/features/nervous-gate.test.js
```

- [ ] **The sweep runs end to end and its output is committed**

```bash
cd divtube_downloader && PYTHONPATH=. .venv/bin/python -m tui.services.nervous_probe \
  --root .. > /tmp/sweep.json && cd ..
npx tsx scripts/nervous-gate.mjs /tmp/sweep.json
```

- [ ] **Report the census to the user**, including how many entries type `Theory`,
      how many `forbidden` claims dropped to `Hypothesis`, and whether the
      routing benchmark passed. State plainly if the premise was not confirmed.
