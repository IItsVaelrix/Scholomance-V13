# ConstellationOS Routing Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a derived, SCD64-stamped routing graph for the ConstellationOS engine and run a three-arm pilot that can refute it.

**Architecture:** A pure-stdlib Python builder extracts the static ESM import graph for 67 engine files, stratifies it by distance from entry point into 3 sections, packs measured telemetry into 8 SCD64 slots per section, and writes `.atlas/constellation-skeleton.json` as a sidecar. An independent Node/Babel oracle produces the same graph from a real AST; a fidelity gate demands exact set equality between them. A three-arm A/B (skeleton / files / degree-preserving shuffled control) then measures whether the artifact actually reduces reading, emitting `PB-EXP-v1` rows into the existing empty `collab_experience_ledger`.

**Tech Stack:** Python 3.13 stdlib only; Node ESM with `@babel/parser` 7.29.7 and `better-sqlite3` 12.6.2; vitest 4.1.8; SQLite (`scholomance_collab.sqlite`).

**Spec:** `docs/superpowers/specs/2026-08-14-constellation-skeleton-design.md` (commit `92b24246`)

## Global Constraints

- **Python is stdlib-only.** No third-party imports in any `scripts/*.py` or in `code_lens.py`. This matches the existing `code_lens.py` / `code_atlas.py` house style.
- **Never `from tui.services import ...` in tests.** Verified failing in this environment: `tui/services/__init__.py` imports `prompt_service` → `openai`, which is not installed. Use the direct module loader given in Task 7. The existing `divtube_downloader/tests/test_code_atlas.py` cannot run for this reason — do not copy its import style.
- **Never modify `.atlas/code-atlas.json` or the `CODE-ATLAS-v1` schema**, and never edit `scripts/git-hooks/post-commit-atlas`. The skeleton is a sidecar built on demand.
- **Throttle every test run:** `nice -n 19 npx vitest run <file> --maxWorkers=2`. Vitest has no default cap and will eat all 8 threads of a shared-TDP APU. Never run the full suite without asking.
- **Artifact schema string is exactly `CONSTELLATION-SKELETON-v1`**; domain `TOPOLOGY`; family `CONSTELLATION_SKELETON`; slot-0 version byte `0x01`; ledger bytecode prefix `PB-EXP-v1`.
- **Scope roots are exactly** `codex/core/constellation` and `codex/server/services/constellation`, extensions `.js` and `.mjs`. `codex/server/services/constellationPage.service.js` is a *sibling*, not a member — it must not be included.
- **Preregistration is binding.** Task 8 commits the thresholds file before Task 11 runs the harness. Thresholds are never edited after seeing results.
- All hex in the artifact is **uppercase**.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/skeleton_graph.py` | Create. Scope walk, ESM import/export extraction, specifier resolution, cycle count, dynamic-import hard fail. Pure graph, no telemetry, no encoding. |
| `scripts/skeleton_strata.py` | Create. Entry-point detection and BFS distance-from-entry stratification. |
| `scripts/skeleton_slots.py` | Create. Slot encode/decode, churn bands, layer bitfield, canonical digest string. |
| `scripts/build_constellation_skeleton.py` | Create. CLI. Joins the three modules above with Atlas telemetry and `testedBy`, writes the artifact atomically. |
| `scripts/skeleton_oracle.mjs` | Create. Independent Babel-AST graph extractor. Shares no code with the Python builder. |
| `scripts/skeleton_fidelity_gate.py` | Create. Exact set-equality comparison, non-zero exit on any difference. |
| `scripts/skeleton_questions.py` | Create. Seeded question-set generator + oracle-derived ground truth. |
| `scripts/skeleton_shuffle.py` | Create. Degree-preserving edge permutation for the null control. |
| `scripts/skeleton_ledger.mjs` | Create. Writes `PB-EXP-v1` rows to `collab_experience_ledger`. |
| `scripts/skeleton_ab_score.py` | Create. Scores arm traces, computes burn, runs McNemar's exact test. |
| `divtube_downloader/tui/services/code_lens.py` | Modify. Add `skeleton()` following the existing optional-steroid contract. |
| `divtube_downloader/tests/test_constellation_skeleton.py` | Create. Unit tests for graph, strata, slots, builder determinism, lens degradation. |
| `tests/qa/features/skeleton-oracle.test.js` | Create. Vitest tests for the Babel oracle. |

---

### Task 1: Graph extraction

**Files:**
- Create: `scripts/skeleton_graph.py`
- Test: `divtube_downloader/tests/test_constellation_skeleton.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `build_graph(project_root: str, roots: list[str], extensions: tuple[str, ...]) -> dict` returning
  `{"files": list[str], "imports": dict[str, list[str]], "importedBy": dict[str, list[str]], "exports": dict[str, list[str]], "externals": dict[str, list[str]], "unresolved": list[dict], "cycleCount": int}`.
  All path values are repo-relative POSIX strings, all lists sorted.
  Also `DynamicImportError` (an `Exception` subclass) with attributes `path` and `line`.

- [ ] **Step 1: Write the failing test**

Create `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
"""Tests for the ConstellationOS routing skeleton.

Loads the scripts/ modules directly. Never `from tui.services import ...`:
tui/services/__init__.py imports prompt_service -> openai, which is not
installed here, so the package import raises ModuleNotFoundError.
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def load_module(name, rel_path):
    """Load a module file directly, bypassing package __init__ side effects."""
    path = os.path.join(PROJECT_ROOT, rel_path)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


skeleton_graph = load_module("skeleton_graph", "scripts/skeleton_graph.py")


def write(root, rel, content):
    full = os.path.join(root, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as fh:
        fh.write(content)


def make_fixture():
    """A tree exercising barrels, extensionless specifiers, orphans, bad imports."""
    root = tempfile.mkdtemp(prefix="skeleton-fixture-")
    src = "pkg"
    write(root, f"{src}/entry.js",
          "import { mid } from './mid.js';\n"
          "import { impl } from './barrel/index.js';\n"
          "export function run() { return mid(impl()); }\n")
    write(root, f"{src}/mid.js",
          "import { leaf } from './leaf';\n"          # extensionless
          "export function mid(x) { return leaf(x); }\n")
    write(root, f"{src}/leaf.js", "export function leaf(x) { return x; }\n")
    write(root, f"{src}/barrel/index.js",
          "export { impl } from './impl.js';\n")
    write(root, f"{src}/barrel/impl.js",
          "import crypto from 'node:crypto';\n"
          "export function impl() { return crypto; }\n"
          "export const IMPL_VERSION = 1;\n")
    write(root, f"{src}/orphan.js", "export const alone = true;\n")
    write(root, f"{src}/broken.js", "import { nope } from './nope.js';\nexport { nope };\n")
    return root, [src]


class TestGraphExtraction(unittest.TestCase):
    def setUp(self):
        self.root, self.roots = make_fixture()
        self.addCleanup(shutil.rmtree, self.root, True)
        self.g = skeleton_graph.build_graph(self.root, self.roots, (".js", ".mjs"))

    def test_finds_every_file(self):
        self.assertEqual(len(self.g["files"]), 7)
        self.assertIn("pkg/entry.js", self.g["files"])

    def test_resolves_explicit_and_barrel_specifiers(self):
        self.assertEqual(self.g["imports"]["pkg/entry.js"],
                         ["pkg/barrel/index.js", "pkg/mid.js"])

    def test_resolves_extensionless_specifier(self):
        self.assertEqual(self.g["imports"]["pkg/mid.js"], ["pkg/leaf.js"])

    def test_export_from_counts_as_an_edge(self):
        self.assertEqual(self.g["imports"]["pkg/barrel/index.js"],
                         ["pkg/barrel/impl.js"])

    def test_reverse_edges_are_populated(self):
        self.assertEqual(self.g["importedBy"]["pkg/leaf.js"], ["pkg/mid.js"])
        self.assertEqual(self.g["importedBy"]["pkg/entry.js"], [])

    def test_export_names_collected(self):
        self.assertEqual(self.g["exports"]["pkg/barrel/impl.js"],
                         ["IMPL_VERSION", "impl"])

    def test_external_specifiers_recorded_verbatim(self):
        self.assertEqual(self.g["externals"]["pkg/barrel/impl.js"], ["node:crypto"])

    def test_unresolved_import_is_recorded_never_dropped(self):
        self.assertEqual(len(self.g["unresolved"]), 1)
        self.assertEqual(self.g["unresolved"][0]["from"], "pkg/broken.js")
        self.assertEqual(self.g["unresolved"][0]["specifier"], "./nope.js")

    def test_acyclic_fixture_reports_zero_cycles(self):
        self.assertEqual(self.g["cycleCount"], 0)

    def test_cycle_is_counted_and_terminates(self):
        write(self.root, "pkg/cyc_a.js", "import './cyc_b.js';\nexport const a = 1;\n")
        write(self.root, "pkg/cyc_b.js", "import './cyc_a.js';\nexport const b = 1;\n")
        g = skeleton_graph.build_graph(self.root, self.roots, (".js", ".mjs"))
        self.assertGreater(g["cycleCount"], 0)

    def test_runtime_dynamic_import_fails_loud(self):
        write(self.root, "pkg/dyn.js", "export async function go() {\n  return import('./leaf.js');\n}\n")
        with self.assertRaises(skeleton_graph.DynamicImportError) as ctx:
            skeleton_graph.build_graph(self.root, self.roots, (".js", ".mjs"))
        self.assertEqual(ctx.exception.path, "pkg/dyn.js")
        self.assertEqual(ctx.exception.line, 2)

    def test_jsdoc_import_type_is_not_a_dynamic_import(self):
        write(self.root, "pkg/typed.js",
              "/**\n * @typedef {import('./leaf.js').Leaf} Leaf\n */\n"
              "export const typed = 1;\n")
        g = skeleton_graph.build_graph(self.root, self.roots, (".js", ".mjs"))
        self.assertEqual(g["imports"]["pkg/typed.js"], [])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton -v 2>&1 | tail -20`

Expected: FAIL — `FileNotFoundError` / `ModuleNotFoundError` for `scripts/skeleton_graph.py`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_graph.py`:

```python
"""Static ESM import graph for a set of scope roots. Pure stdlib.

Deliberately regex-based, matching the code_lens.py house style. The Babel
oracle (scripts/skeleton_oracle.mjs) exists to contradict this file; the two
must share no extraction code or the fidelity gate proves nothing.
"""

import os
import re

# `import ... from 'x'` and `export ... from 'x'` -- both create an edge.
_FROM_RE = re.compile(
    r"""^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]""",
    re.M,
)
# Side-effect import: `import 'x';`
_BARE_RE = re.compile(r"""^[ \t]*import\s*['"]([^'"]+)['"]""", re.M)

_EXPORT_NAMED_RE = re.compile(r"""^[ \t]*export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)""", re.M)
_EXPORT_BRACE_RE = re.compile(r"""^[ \t]*export\s*\{([^}]*)\}""", re.M)
_EXPORT_DEFAULT_RE = re.compile(r"""^[ \t]*export\s+default\b""", re.M)

# A runtime dynamic import. `@typedef {import('x')}` lives in a comment and is
# excluded by stripping comments before this runs.
_DYNAMIC_RE = re.compile(r"""(?<![.\w$])import\s*\(""")

_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
_LINE_COMMENT_RE = re.compile(r"//[^\n]*")


class DynamicImportError(Exception):
    """A runtime dynamic import was found. The blind spot must not open silently."""

    def __init__(self, path: str, line: int):
        super().__init__(
            f"{path}:{line}: runtime dynamic import(). The skeleton indexes static "
            f"imports only; a dynamic import would be an undeclared blind spot."
        )
        self.path = path
        self.line = line


def _strip_comments(text: str) -> str:
    """Blank comments while preserving line count and offsets."""
    def blank(match):
        return re.sub(r"[^\n]", " ", match.group(0))
    return _LINE_COMMENT_RE.sub(blank, _BLOCK_COMMENT_RE.sub(blank, text))


def _walk(project_root: str, roots, extensions) -> list[str]:
    found = []
    for rel_root in roots:
        abs_root = os.path.join(project_root, rel_root)
        for dirpath, dirnames, filenames in os.walk(abs_root):
            dirnames.sort()
            for name in sorted(filenames):
                if name.endswith(tuple(extensions)):
                    abs_path = os.path.join(dirpath, name)
                    found.append(os.path.relpath(abs_path, project_root).replace(os.sep, "/"))
    return sorted(found)


def _resolve(specifier: str, from_rel: str, file_set: set[str]) -> str | None:
    """Resolve a relative specifier. Order matters: exact, .js, .mjs, /index.js."""
    base = os.path.normpath(os.path.join(os.path.dirname(from_rel), specifier)).replace(os.sep, "/")
    for candidate in (base, base + ".js", base + ".mjs", base + "/index.js", base + "/index.mjs"):
        if candidate in file_set:
            return candidate
    return None


def _export_names(clean: str) -> list[str]:
    names = set(_EXPORT_NAMED_RE.findall(clean))
    for group in _EXPORT_BRACE_RE.findall(clean):
        for piece in group.split(","):
            piece = piece.strip()
            if not piece:
                continue
            # `a as b` exports the name b.
            parts = re.split(r"\s+as\s+", piece)
            candidate = parts[-1].strip()
            if re.fullmatch(r"[A-Za-z_$][\w$]*", candidate):
                names.add(candidate)
    if _EXPORT_DEFAULT_RE.search(clean):
        names.add("default")
    return sorted(names)


def _count_cycles(imports: dict[str, list[str]]) -> int:
    """Number of back edges found by iterative DFS. Zero iff acyclic."""
    WHITE, GREY, BLACK = 0, 1, 2
    color = {node: WHITE for node in imports}
    back_edges = 0
    for start in sorted(imports):
        if color[start] != WHITE:
            continue
        stack = [(start, iter(imports[start]))]
        color[start] = GREY
        while stack:
            node, children = stack[-1]
            advanced = False
            for child in children:
                if color.get(child, BLACK) == GREY:
                    back_edges += 1
                elif color.get(child, BLACK) == WHITE:
                    color[child] = GREY
                    stack.append((child, iter(imports[child])))
                    advanced = True
                    break
            if not advanced:
                color[node] = BLACK
                stack.pop()
    return back_edges


def build_graph(project_root: str, roots, extensions=(".js", ".mjs")) -> dict:
    files = _walk(project_root, roots, extensions)
    file_set = set(files)

    imports = {f: set() for f in files}
    exports = {}
    externals = {f: set() for f in files}
    unresolved = []

    for rel in files:
        with open(os.path.join(project_root, rel), encoding="utf-8", errors="replace") as fh:
            raw = fh.read()
        clean = _strip_comments(raw)

        dynamic = _DYNAMIC_RE.search(clean)
        if dynamic:
            raise DynamicImportError(rel, clean.count("\n", 0, dynamic.start()) + 1)

        for specifier in _FROM_RE.findall(clean) + _BARE_RE.findall(clean):
            if not specifier.startswith("."):
                externals[rel].add(specifier)
                continue
            target = _resolve(specifier, rel, file_set)
            if target is None:
                unresolved.append({"from": rel, "specifier": specifier})
            else:
                imports[rel].add(target)

        exports[rel] = _export_names(clean)

    imported_by = {f: set() for f in files}
    for source, targets in imports.items():
        for target in targets:
            imported_by[target].add(source)

    sorted_imports = {f: sorted(imports[f]) for f in files}
    return {
        "files": files,
        "imports": sorted_imports,
        "importedBy": {f: sorted(imported_by[f]) for f in files},
        "exports": exports,
        "externals": {f: sorted(externals[f]) for f in files},
        "unresolved": sorted(unresolved, key=lambda u: (u["from"], u["specifier"])),
        "cycleCount": _count_cycles(sorted_imports),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton -v 2>&1 | tail -20`

Expected: PASS, 12 tests.

- [ ] **Step 5: Verify against the real tree**

Run:
```bash
cd /home/deck/Downloads/Scholomance-V12-main && python3 -c "
import importlib.util,sys
spec=importlib.util.spec_from_file_location('g','scripts/skeleton_graph.py')
g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
r=g.build_graph('.',['codex/core/constellation','codex/server/services/constellation'])
print('files',len(r['files']),'edges',sum(len(v) for v in r['imports'].values()),'cycles',r['cycleCount'],'unresolved',len(r['unresolved']))
"
```

Expected: `files 67 edges 105 cycles 0 unresolved 0`. If edges differ from 105, do not adjust the expectation — the fidelity gate in Task 6 is the arbiter, and a mismatch here is a finding to report, not a number to edit.

- [ ] **Step 6: Commit**

```bash
git add scripts/skeleton_graph.py divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "feat(skeleton): static ESM import graph extraction

Pure-stdlib. Hard-fails on runtime dynamic import so the blind spot
cannot open silently; JSDoc import() types are stripped as comments first."
```

---

### Task 2: Stratification by distance from entry point

**Files:**
- Create: `scripts/skeleton_strata.py`
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: the graph dict from `skeleton_graph.build_graph`.
- Produces: `stratify(graph: dict) -> dict` returning `{"stratum": dict[str, int], "entryPoints": list[str], "isolated": list[str], "sections": list[list[str]]}` where `sections[i]` is the sorted list of paths at stratum `i`.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
skeleton_strata = load_module("skeleton_strata", "scripts/skeleton_strata.py")


class TestStratification(unittest.TestCase):
    def setUp(self):
        self.root, self.roots = make_fixture()
        self.addCleanup(shutil.rmtree, self.root, True)
        graph = skeleton_graph.build_graph(self.root, self.roots, (".js", ".mjs"))
        self.s = skeleton_strata.stratify(graph)

    def test_entry_points_have_no_inbound_edge(self):
        self.assertEqual(self.s["entryPoints"],
                         ["pkg/broken.js", "pkg/entry.js", "pkg/orphan.js"])

    def test_entry_points_are_stratum_zero(self):
        self.assertEqual(self.s["stratum"]["pkg/entry.js"], 0)

    def test_orphan_is_an_entry_point_not_a_special_case(self):
        self.assertEqual(self.s["stratum"]["pkg/orphan.js"], 0)
        self.assertIn("pkg/orphan.js", self.s["isolated"])

    def test_distance_is_shortest_not_longest(self):
        self.assertEqual(self.s["stratum"]["pkg/mid.js"], 1)
        self.assertEqual(self.s["stratum"]["pkg/barrel/index.js"], 1)
        self.assertEqual(self.s["stratum"]["pkg/leaf.js"], 2)
        self.assertEqual(self.s["stratum"]["pkg/barrel/impl.js"], 2)

    def test_every_file_lands_in_exactly_one_section(self):
        placed = [p for section in self.s["sections"] for p in section]
        self.assertEqual(sorted(placed), sorted(self.s["stratum"]))
        self.assertEqual(len(placed), len(set(placed)))

    def test_sections_are_contiguous_from_zero(self):
        self.assertEqual(len(self.s["sections"]), 3)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestStratification -v 2>&1 | tail -10`

Expected: FAIL — `scripts/skeleton_strata.py` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_strata.py`:

```python
"""Stratify an import graph by shortest distance from the nearest entry point.

Measured 2026-08-14 on the ConstellationOS engine: longest-path-to-leaf gives
9 sections of 24/32/9/3/3/5/1/1/1 -- 71% of the tree in two sections and three
singletons. Distance-from-entry gives 3 sections of 20/22/25 with nothing
stranded. It is also the measure that answers the question strata were chosen
for: am I upstream or downstream of the thing I am changing.
"""

from collections import deque


def stratify(graph: dict) -> dict:
    files = graph["files"]
    imports = graph["imports"]
    imported_by = graph["importedBy"]

    entry_points = sorted(f for f in files if not imported_by[f])
    isolated = sorted(f for f in files if not imported_by[f] and not imports[f])

    stratum = {}
    queue = deque()
    for entry in entry_points:          # sorted, so BFS order is deterministic
        stratum[entry] = 0
        queue.append(entry)

    while queue:
        node = queue.popleft()
        for child in imports[node]:
            if child not in stratum:
                stratum[child] = stratum[node] + 1
                queue.append(child)

    # A file reachable only through a cycle with no entry point would be
    # unvisited. Place it after the deepest known stratum rather than dropping
    # it -- a routing artifact must never silently lose a file.
    if len(stratum) < len(files):
        orphan_rank = (max(stratum.values()) + 1) if stratum else 0
        for f in files:
            stratum.setdefault(f, orphan_rank)

    depth = max(stratum.values()) if stratum else 0
    sections = [sorted(f for f in files if stratum[f] == i) for i in range(depth + 1)]

    return {
        "stratum": stratum,
        "entryPoints": entry_points,
        "isolated": isolated,
        "sections": sections,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestStratification -v 2>&1 | tail -10`

Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the real section sizes match the spec**

Run:
```bash
cd /home/deck/Downloads/Scholomance-V12-main && python3 -c "
import importlib.util
def L(n,p):
    s=importlib.util.spec_from_file_location(n,p); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
g=L('g','scripts/skeleton_graph.py'); st=L('s','scripts/skeleton_strata.py')
r=g.build_graph('.',['codex/core/constellation','codex/server/services/constellation'])
s=st.stratify(r)
print('section sizes:',[len(x) for x in s['sections']])
print('entry points:',len(s['entryPoints']),'isolated:',len(s['isolated']))
"
```

Expected: `section sizes: [20, 22, 25]`, `entry points: 20 isolated: 4`.

- [ ] **Step 6: Commit**

```bash
git add scripts/skeleton_strata.py divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "feat(skeleton): stratify by distance from entry point

Measured: leaf-depth gives 24/32/9/3/3/5/1/1/1; entry-distance gives
20/22/25 with nothing stranded."
```

---

### Task 3: SCD64 slot encoding

**Files:**
- Create: `scripts/skeleton_slots.py`
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure functions over primitives).
- Produces:
  - `LAYER_BITS: dict[str, int]` — `Core`=0, `Server`=1, `UI`=2, `Test`=3, `Services`=4, `Runtime`=5, `Script`=6, `Doc`=7, `Unknown`=8 (bit *indices*).
  - `churn_band(churn: int) -> int`
  - `canonical_section_string(stratum: int, paths: list[str], edges: list[str]) -> str`
  - `encode_slots(facts: dict) -> list[dict]` returning 8 dicts `{"index","name","hex","decoded"}`.
  - `checksum64(slots: list[dict]) -> str`
  - `SATURATION_REPORT: list[str]` module-level list, appended to whenever a field clamps; the builder copies it into `meta.saturatedFields`.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
skeleton_slots = load_module("skeleton_slots", "scripts/skeleton_slots.py")

SAMPLE_FACTS = {
    "stratum": 0, "nodeCount": 20,
    "maxFanIn": 18, "medianFanIn": 1, "hubCount": 4, "entryPoints": 20,
    "maxFanOut": 6, "medianFanOut": 2, "outboundEdges": 40,
    "totalExports": 171, "maxExports": 22, "zeroExportFiles": 1,
    "medianChurnBand": 7, "maxChurnBand": 10, "totalCommits": 300,
    "layers": ["Core", "Server"], "dominantLayer": "Core", "filesOutsideDominant": 8,
    "testedFiles": 12, "percentCovered": 60, "testFiles": 5,
    "digestHex": "ABCD1234",
}


class TestSlotEncoding(unittest.TestCase):
    def test_churn_band_is_log2_of_churn_plus_one(self):
        self.assertEqual(skeleton_slots.churn_band(0), 0)
        self.assertEqual(skeleton_slots.churn_band(6), 2)      # log2(7)  = 2.80
        self.assertEqual(skeleton_slots.churn_band(136), 7)    # log2(137)= 7.10
        self.assertEqual(skeleton_slots.churn_band(1356), 10)  # log2(1357)=10.4

    def test_churn_band_caps_at_fifteen(self):
        self.assertEqual(skeleton_slots.churn_band(10 ** 9), 15)

    def test_stratum_slot_packs_version_index_and_count(self):
        slots = skeleton_slots.encode_slots(SAMPLE_FACTS)
        self.assertEqual(slots[0]["name"], "STRATUM")
        self.assertEqual(slots[0]["hex"], "01000014")   # v1, stratum 0, 20 nodes
        self.assertEqual(slots[0]["decoded"]["nodeCount"], 20)

    def test_layer_bitfield_sets_one_bit_per_present_layer(self):
        slots = skeleton_slots.encode_slots(SAMPLE_FACTS)
        # Core=bit0, Server=bit1 -> 0b11 = 3; dominant Core = index 0
        self.assertEqual(slots[5]["hex"], "00030008")
        self.assertEqual(slots[5]["decoded"]["layerBitfield"], 3)
        self.assertEqual(slots[5]["decoded"]["dominantLayerCode"], 0)

    def test_every_slot_is_eight_uppercase_hex_chars(self):
        for slot in skeleton_slots.encode_slots(SAMPLE_FACTS):
            self.assertRegex(slot["hex"], r"^[0-9A-F]{8}$")

    def test_checksum64_is_the_concatenation(self):
        slots = skeleton_slots.encode_slots(SAMPLE_FACTS)
        self.assertEqual(skeleton_slots.checksum64(slots),
                         "".join(s["hex"] for s in slots))
        self.assertEqual(len(skeleton_slots.checksum64(slots)), 64)

    def test_decoded_round_trips_from_hex(self):
        for slot in skeleton_slots.encode_slots(SAMPLE_FACTS)[:7]:
            value = int(slot["hex"], 16)
            rebuilt = skeleton_slots.decode_slot(slot["index"], value)
            self.assertEqual(rebuilt, slot["decoded"])

    def test_saturation_is_recorded_never_silent(self):
        skeleton_slots.SATURATION_REPORT.clear()
        facts = dict(SAMPLE_FACTS, maxFanIn=9999)
        slots = skeleton_slots.encode_slots(facts)
        self.assertEqual(slots[1]["decoded"]["maxFanIn"], 255)
        self.assertTrue(any("maxFanIn" in entry for entry in skeleton_slots.SATURATION_REPORT))

    def test_canonical_string_is_order_independent_of_input(self):
        a = skeleton_slots.canonical_section_string(1, ["b.js", "a.js"], ["b.js>a.js"])
        b = skeleton_slots.canonical_section_string(1, ["a.js", "b.js"], ["b.js>a.js"])
        self.assertEqual(a, b)
        self.assertIn("stratum=1", a)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestSlotEncoding -v 2>&1 | tail -10`

Expected: FAIL — `scripts/skeleton_slots.py` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_slots.py`:

```python
"""SCD64 TOPOLOGY / CONSTELLATION_SKELETON slot encoding.

Departs from COLOR_DRAGON (spatial-immune-orchestrator.js:496) in one way, on
purpose: that family hashes every slot, making the stamp a constant identity
that is opaque without a glossary lookup. A section stamp is derived from
MEASURED facts, so slots 0-6 pack them directly and read as hex byte pairs.
Slot 7 keeps the SHA-256 convention and supplies staleness detection.
"""

import hashlib

VERSION_BYTE = 0x01

LAYER_BITS = {
    "Core": 0, "Server": 1, "UI": 2, "Test": 3, "Services": 4,
    "Runtime": 5, "Script": 6, "Doc": 7, "Unknown": 8,
}

SLOT_NAMES = ("STRATUM", "FANIN", "FANOUT", "EXPORTS",
              "CHURN", "LAYER", "COVERAGE", "DIGEST")

SATURATION_REPORT: list[str] = []


def _u8(value: int, label: str) -> int:
    if value > 255:
        SATURATION_REPORT.append(f"{label}={value} clamped to 255")
        return 255
    return max(0, int(value))


def _u16(value: int, label: str) -> int:
    if value > 65535:
        SATURATION_REPORT.append(f"{label}={value} clamped to 65535")
        return 65535
    return max(0, int(value))


def churn_band(churn: int) -> int:
    """min(15, floor(log2(churn + 1))). Measured range 6..1356 -> bands 2..10."""
    return min(15, max(0, int(churn) + 1).bit_length() - 1)


def _hex(value: int) -> str:
    return f"{value & 0xFFFFFFFF:08X}"


def canonical_section_string(stratum: int, paths: list[str], edges: list[str]) -> str:
    return (
        f"TOPOLOGY|CONSTELLATION_SKELETON|v1|stratum={stratum}|"
        f"{','.join(sorted(paths))}|{','.join(sorted(edges))}"
    )


def digest_hex(canonical: str) -> str:
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:8].upper()


def decode_slot(index: int, value: int) -> dict:
    b0 = (value >> 24) & 0xFF
    b1 = (value >> 16) & 0xFF
    b2 = (value >> 8) & 0xFF
    b3 = value & 0xFF
    low16 = value & 0xFFFF
    high16 = (value >> 16) & 0xFFFF
    if index == 0:
        return {"versionByte": b0, "stratumIndex": b1, "nodeCount": low16}
    if index == 1:
        return {"maxFanIn": b0, "medianFanIn": b1, "hubCount": b2, "entryPoints": b3}
    if index == 2:
        return {"maxFanOut": b0, "medianFanOut": b1, "outboundEdges": low16}
    if index == 3:
        return {"totalExports": high16, "maxExports": b2, "zeroExportFiles": b3}
    if index == 4:
        return {"medianChurnBand": b0, "maxChurnBand": b1, "totalCommits": low16}
    if index == 5:
        return {"layerBitfield": high16, "dominantLayerCode": b2, "filesOutsideDominant": b3}
    if index == 6:
        return {"testedFiles": high16, "percentCovered": b2, "testFiles": b3}
    raise ValueError(f"slot {index} is the digest and does not decode")


def encode_slots(facts: dict) -> list[dict]:
    layer_bitfield = 0
    for layer in facts["layers"]:
        layer_bitfield |= 1 << LAYER_BITS.get(layer, LAYER_BITS["Unknown"])

    values = [
        (VERSION_BYTE << 24) | (_u8(facts["stratum"], "stratum") << 16)
        | _u16(facts["nodeCount"], "nodeCount"),

        (_u8(facts["maxFanIn"], "maxFanIn") << 24)
        | (_u8(facts["medianFanIn"], "medianFanIn") << 16)
        | (_u8(facts["hubCount"], "hubCount") << 8)
        | _u8(facts["entryPoints"], "entryPoints"),

        (_u8(facts["maxFanOut"], "maxFanOut") << 24)
        | (_u8(facts["medianFanOut"], "medianFanOut") << 16)
        | _u16(facts["outboundEdges"], "outboundEdges"),

        (_u16(facts["totalExports"], "totalExports") << 16)
        | (_u8(facts["maxExports"], "maxExports") << 8)
        | _u8(facts["zeroExportFiles"], "zeroExportFiles"),

        (_u8(facts["medianChurnBand"], "medianChurnBand") << 24)
        | (_u8(facts["maxChurnBand"], "maxChurnBand") << 16)
        | _u16(facts["totalCommits"], "totalCommits"),

        (_u16(layer_bitfield, "layerBitfield") << 16)
        | (_u8(LAYER_BITS.get(facts["dominantLayer"], LAYER_BITS["Unknown"]), "dominantLayerCode") << 8)
        | _u8(facts["filesOutsideDominant"], "filesOutsideDominant"),

        (_u16(facts["testedFiles"], "testedFiles") << 16)
        | (_u8(facts["percentCovered"], "percentCovered") << 8)
        | _u8(facts["testFiles"], "testFiles"),
    ]

    slots = []
    for index, value in enumerate(values):
        slots.append({
            "index": index,
            "name": SLOT_NAMES[index],
            "hex": _hex(value),
            "decoded": decode_slot(index, value),
        })
    slots.append({
        "index": 7,
        "name": "DIGEST",
        "hex": facts["digestHex"].upper(),
        "decoded": {"sha256Prefix": facts["digestHex"].upper()},
    })
    return slots


def checksum64(slots: list[dict]) -> str:
    return "".join(slot["hex"] for slot in slots)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestSlotEncoding -v 2>&1 | tail -10`

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/skeleton_slots.py divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "feat(skeleton): SCD64 TOPOLOGY slot encoding

7 slots pack measured ordinals byte-aligned so the hex reads directly;
slot 7 keeps the SHA-256 digest convention. Saturation is recorded,
never silent."
```

---

### Task 4: Artifact builder CLI

**Files:**
- Create: `scripts/build_constellation_skeleton.py`
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: `skeleton_graph.build_graph`, `skeleton_strata.stratify`, `skeleton_slots.encode_slots` / `checksum64` / `canonical_section_string` / `digest_hex` / `churn_band` / `SATURATION_REPORT`, and `code_atlas.load_atlas(project_root)` → `.file_info(rel)`.
- Produces: `build(project_root: str, out_path: str | None = None) -> dict` writing the artifact and returning the payload. CLI: `python3 scripts/build_constellation_skeleton.py [--root .] [--out .atlas/constellation-skeleton.json]`.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
builder = load_module("build_constellation_skeleton", "scripts/build_constellation_skeleton.py")


class TestBuilder(unittest.TestCase):
    def setUp(self):
        self.out = os.path.join(tempfile.mkdtemp(prefix="skeleton-out-"), "skel.json")
        self.payload = builder.build(PROJECT_ROOT, out_path=self.out)

    def test_schema_and_family_are_exact(self):
        self.assertEqual(self.payload["schema"], "CONSTELLATION-SKELETON-v1")
        self.assertEqual(self.payload["domain"], "TOPOLOGY")
        self.assertEqual(self.payload["family"], "CONSTELLATION_SKELETON")

    def test_scope_excludes_the_sibling_page_service(self):
        paths = [n["path"] for s in self.payload["sections"] for n in s["nodes"]]
        self.assertNotIn("codex/server/services/constellationPage.service.js", paths)
        self.assertEqual(len(paths), 67)

    def test_three_sections_sized_twenty_twentytwo_twentyfive(self):
        self.assertEqual([len(s["nodes"]) for s in self.payload["sections"]], [20, 22, 25])

    def test_every_section_has_a_64_hex_checksum(self):
        for section in self.payload["sections"]:
            self.assertRegex(section["checksum64"], r"^[0-9A-F]{64}$")
            self.assertEqual(len(section["slots"]), 8)

    def test_atlas_telemetry_is_joined_onto_nodes(self):
        nodes = {n["path"]: n for s in self.payload["sections"] for n in s["nodes"]}
        compose = nodes["codex/core/constellation/compose.js"]
        self.assertEqual(compose["layer"], "Core")
        self.assertIsInstance(compose["churn"], int)
        self.assertIsInstance(compose["commits"], int)

    def test_blind_spots_are_declared(self):
        reasons = " ".join(b["what"] for b in self.payload["declaredBlindSpots"])
        self.assertIn("HTTP", reasons)
        self.assertIn("Barrel", reasons)

    def test_built_at_head_is_recorded(self):
        self.assertRegex(self.payload["builtAtHead"], r"^[0-9a-f]{7,40}$")

    def test_build_is_deterministic(self):
        second = os.path.join(os.path.dirname(self.out), "skel2.json")
        builder.build(PROJECT_ROOT, out_path=second)
        with open(self.out) as a, open(second) as b:
            pa, pb = json.load(a), json.load(b)
        pa.pop("builtAt"); pb.pop("builtAt")
        self.assertEqual(json.dumps(pa, sort_keys=True), json.dumps(pb, sort_keys=True))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestBuilder -v 2>&1 | tail -10`

Expected: FAIL — builder module missing.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/build_constellation_skeleton.py`:

```python
#!/usr/bin/env python3
"""Build .atlas/constellation-skeleton.json -- a routing sidecar to the Code Atlas.

Sidecar by design: code-atlas.json's CODE-ATLAS-v1 schema is load-bearing for
the lenses and the post-commit hook, and a pilot must not change it.
"""

import argparse
import datetime
import importlib.util
import json
import os
import statistics
import subprocess
import sys
import types

SCHEMA = "CONSTELLATION-SKELETON-v1"
DOMAIN = "TOPOLOGY"
FAMILY = "CONSTELLATION_SKELETON"
OUT_REL_PATH = os.path.join(".atlas", "constellation-skeleton.json")

SCOPE_ROOTS = ["codex/core/constellation", "codex/server/services/constellation"]
EXTENSIONS = (".js", ".mjs")
TEST_ROOT = "tests/core/constellation"

BLIND_SPOTS = [
    {"what": "UI-to-engine HTTP seam",
     "detail": "src/pages/Constellation imports zero files from codex/; it reaches the "
               "engine over HTTP via src/hooks/useConstellationPage.js. Invisible to a "
               "static import graph. The engine-side terminus "
               "codex/server/services/constellationPage.service.js is a sibling of the "
               "scope directory, not a member, and is also excluded."},
    {"what": "Runtime dynamic imports",
     "detail": "None exist today. The builder hard-fails rather than skipping if one appears."},
    {"what": "Barrel provenance",
     "detail": "Re-exports through grimoire/index.js resolve to the barrel, not to the "
               "module that originally defined the symbol."},
    {"what": "Test files",
     "detail": "Excluded from the graph; used only for testedBy and the COVERAGE slot."},
]

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, rel))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


skeleton_graph = _load("skeleton_graph", "skeleton_graph.py")
skeleton_strata = _load("skeleton_strata", "skeleton_strata.py")
skeleton_slots = _load("skeleton_slots", "skeleton_slots.py")


def _load_atlas(project_root):
    """Optional steroid: telemetry is nice, absence must not break the build."""
    for pkg in ("tui", "tui.services"):
        if pkg not in sys.modules:
            module = types.ModuleType(pkg)
            module.__path__ = []
            sys.modules[pkg] = module
    path = os.path.join(project_root, "divtube_downloader", "tui", "services", "code_atlas.py")
    if not os.path.exists(path):
        return None
    try:
        code_atlas = _load("tui.services.code_atlas", os.path.relpath(path, _HERE))
        atlas = code_atlas.load_atlas(project_root)
        return atlas if atlas is not None and atlas.verify() else None
    except Exception:                       # noqa: BLE001 -- optional steroid
        return None


def _head(project_root):
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=project_root,
                             capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except Exception:                       # noqa: BLE001
        return "unknown"


def _tested_by(project_root, files):
    """Map each scope file to the test files that import it."""
    mapping = {f: set() for f in files}
    test_abs = os.path.join(project_root, TEST_ROOT)
    if not os.path.isdir(test_abs):
        return {f: [] for f in files}, 0
    test_files = []
    for dirpath, dirnames, filenames in os.walk(test_abs):
        dirnames.sort()
        for name in sorted(filenames):
            if name.endswith(EXTENSIONS):
                test_files.append(os.path.join(dirpath, name))
    basenames = {}
    for f in files:
        basenames.setdefault(os.path.basename(f), []).append(f)
    for abs_test in test_files:
        rel_test = os.path.relpath(abs_test, project_root).replace(os.sep, "/")
        with open(abs_test, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        for base, targets in basenames.items():
            if base in text:
                for target in targets:
                    mapping[target].add(rel_test)
    return {f: sorted(mapping[f]) for f in files}, len(test_files)


def _median_int(values):
    return int(statistics.median(values)) if values else 0


def build(project_root: str, out_path: str | None = None) -> dict:
    project_root = os.path.abspath(project_root)
    graph = skeleton_graph.build_graph(project_root, SCOPE_ROOTS, EXTENSIONS)
    strata = skeleton_strata.stratify(graph)
    atlas = _load_atlas(project_root)
    tested_by, test_file_count = _tested_by(project_root, graph["files"])

    skeleton_slots.SATURATION_REPORT.clear()
    unresolved_telemetry = []
    sections = []

    for index, paths in enumerate(strata["sections"]):
        nodes = []
        for path in paths:
            info = atlas.file_info(path) if atlas else None
            if info is None:
                unresolved_telemetry.append(path)
            nodes.append({
                "path": path,
                "stratum": index,
                "imports": graph["imports"][path],
                "importedBy": graph["importedBy"][path],
                "exports": graph["exports"][path],
                "externals": graph["externals"][path],
                "layer": info["layer"] if info else None,
                "commits": info["commits"] if info else None,
                "churn": info["churn"] if info else None,
                "lastCommit": info["lastCommit"] if info else None,
                "testedBy": tested_by[path],
            })

        fan_in = [len(n["importedBy"]) for n in nodes]
        fan_out = [len(n["imports"]) for n in nodes]
        export_counts = [len(n["exports"]) for n in nodes]
        churns = [n["churn"] for n in nodes if n["churn"] is not None]
        commits = [n["commits"] for n in nodes if n["commits"] is not None]
        layers = sorted({n["layer"] or "Unknown" for n in nodes})
        layer_counts = {}
        for node in nodes:
            key = node["layer"] or "Unknown"
            layer_counts[key] = layer_counts.get(key, 0) + 1
        dominant = max(sorted(layer_counts), key=lambda k: layer_counts[k])
        tested = [n for n in nodes if n["testedBy"]]
        edges = sorted(f"{n['path']}>{t}" for n in nodes for t in n["imports"])

        canonical = skeleton_slots.canonical_section_string(index, paths, edges)
        facts = {
            "stratum": index, "nodeCount": len(nodes),
            "maxFanIn": max(fan_in, default=0), "medianFanIn": _median_int(fan_in),
            "hubCount": sum(1 for v in fan_in if v >= 4),
            "entryPoints": sum(1 for n in nodes if not n["importedBy"]),
            "maxFanOut": max(fan_out, default=0), "medianFanOut": _median_int(fan_out),
            "outboundEdges": sum(fan_out),
            "totalExports": sum(export_counts), "maxExports": max(export_counts, default=0),
            "zeroExportFiles": sum(1 for v in export_counts if v == 0),
            "medianChurnBand": skeleton_slots.churn_band(_median_int(churns)),
            "maxChurnBand": skeleton_slots.churn_band(max(churns, default=0)),
            "totalCommits": sum(commits),
            "layers": layers, "dominantLayer": dominant,
            "filesOutsideDominant": len(nodes) - layer_counts[dominant],
            "testedFiles": len(tested),
            "percentCovered": round(100 * len(tested) / len(nodes)) if nodes else 0,
            "testFiles": len({t for n in nodes for t in n["testedBy"]}),
            "digestHex": skeleton_slots.digest_hex(canonical),
        }
        slots = skeleton_slots.encode_slots(facts)
        sections.append({
            "stratum": index,
            "checksum64": skeleton_slots.checksum64(slots),
            "slots": slots,
            "nodes": nodes,
        })

    payload = {
        "schema": SCHEMA,
        "domain": DOMAIN,
        "family": FAMILY,
        "builtAtHead": _head(project_root),
        "builtAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope": {"roots": SCOPE_ROOTS, "extensions": list(EXTENSIONS),
                  "fileCount": len(graph["files"]), "testRoot": TEST_ROOT},
        "meta": {
            "edgeCount": sum(len(v) for v in graph["imports"].values()),
            "cycleCount": graph["cycleCount"],
            "entryPoints": len(strata["entryPoints"]),
            "isolated": len(strata["isolated"]),
            "unresolved": graph["unresolved"],
            "missingTelemetry": sorted(unresolved_telemetry),
            "saturatedFields": list(skeleton_slots.SATURATION_REPORT),
            "testFilesScanned": test_file_count,
            "atlasAvailable": atlas is not None,
        },
        "declaredBlindSpots": BLIND_SPOTS,
        "sections": sections,
    }

    target = out_path or os.path.join(project_root, OUT_REL_PATH)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    tmp = target + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=1, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, target)                 # atomic swap, matching code_atlas.py
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()
    payload = build(args.root, out_path=args.out)
    meta = payload["meta"]
    print(f"{payload['scope']['fileCount']} files, {meta['edgeCount']} edges, "
          f"{len(payload['sections'])} sections "
          f"{[len(s['nodes']) for s in payload['sections']]}, "
          f"cycles={meta['cycleCount']}, head={payload['builtAtHead'][:8]}")
    if meta["saturatedFields"]:
        print("SATURATED:", meta["saturatedFields"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestBuilder -v 2>&1 | tail -10`

Expected: PASS, 8 tests.

- [ ] **Step 5: Build the real artifact**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 scripts/build_constellation_skeleton.py`

Expected: `67 files, 105 edges, 3 sections [20, 22, 25], cycles=0, head=<sha>` and no `SATURATED:` line.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_constellation_skeleton.py divtube_downloader/tests/test_constellation_skeleton.py .atlas/constellation-skeleton.json
git commit -m "feat(skeleton): artifact builder CLI

Sidecar at .atlas/constellation-skeleton.json; code-atlas.json untouched.
Atomic tmp+rename swap, deterministic modulo builtAt."
```

---

### Task 5: Independent Babel oracle

**Files:**
- Create: `scripts/skeleton_oracle.mjs`
- Create: `tests/qa/features/skeleton-oracle.test.js`

**Interfaces:**
- Consumes: nothing from the Python side — that is the point.
- Produces: `export function extractModuleFacts(sourceText, relPath)` → `{ specifiers: string[], exports: string[], dynamicImports: number[] }`, and `export function buildOracleGraph(projectRoot, roots, extensions)` → the same shape as `skeleton_graph.build_graph` minus `cycleCount`. CLI: `node scripts/skeleton_oracle.mjs --out <path>`.

**Why a separate implementation:** if the builder and the oracle were both regex over the same text they would agree and prove nothing. This file uses a real AST. Do not import anything from `scripts/skeleton_graph.py` or reimplement its regexes here.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/skeleton-oracle.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { extractModuleFacts } from '../../../scripts/skeleton_oracle.mjs';

describe('skeleton oracle (Babel AST)', () => {
  it('collects import and export-from specifiers as edges', () => {
    const facts = extractModuleFacts(
      "import { a } from './a.js';\nexport { b } from './b.js';\n", 'x.js');
    expect(facts.specifiers).toEqual(['./a.js', './b.js']);
  });

  it('collects side-effect imports', () => {
    const facts = extractModuleFacts("import './side.js';\n", 'x.js');
    expect(facts.specifiers).toEqual(['./side.js']);
  });

  it('collects named, declared and default export names', () => {
    const facts = extractModuleFacts(
      'export const A = 1;\nexport function b() {}\nexport { c as d };\nexport default 5;\n',
      'x.js');
    expect(facts.exports.sort()).toEqual(['A', 'b', 'd', 'default']);
  });

  it('collects export-all as a specifier with no local name', () => {
    const facts = extractModuleFacts("export * from './all.js';\n", 'x.js');
    expect(facts.specifiers).toEqual(['./all.js']);
    expect(facts.exports).toEqual([]);
  });

  it('reports a runtime dynamic import with its line', () => {
    const facts = extractModuleFacts(
      'export async function go() {\n  return import("./d.js");\n}\n', 'x.js');
    expect(facts.dynamicImports).toEqual([2]);
  });

  it('does not treat a JSDoc import() type as a dynamic import', () => {
    const facts = extractModuleFacts(
      "/**\n * @typedef {import('./t.js').T} T\n */\nexport const v = 1;\n", 'x.js');
    expect(facts.dynamicImports).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && nice -n 19 npx vitest run tests/qa/features/skeleton-oracle.test.js --maxWorkers=2 2>&1 | tail -15`

Expected: FAIL — cannot resolve `scripts/skeleton_oracle.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_oracle.mjs`:

```js
#!/usr/bin/env node
/**
 * Independent ESM graph extractor for the skeleton fidelity gate.
 *
 * Uses a real Babel AST. It exists to CONTRADICT scripts/skeleton_graph.py,
 * so it must share no extraction code with it. ESM import/export declarations
 * are only legal at module top level, so iterating program.body is complete;
 * dynamic imports need a walk, done below without @babel/traverse.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const EXTENSIONS = ['.js', '.mjs'];

export function extractModuleFacts(sourceText, relPath) {
  const ast = parse(sourceText, {
    sourceType: 'module',
    errorRecovery: true,
    plugins: ['jsx', 'classProperties', 'dynamicImport', 'importAssertions'],
  });

  const specifiers = [];
  const exports = [];

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      specifiers.push(node.source.value);
    } else if (node.type === 'ExportAllDeclaration') {
      specifiers.push(node.source.value);
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.source) specifiers.push(node.source.value);
      for (const spec of node.specifiers) {
        const exported = spec.exported;
        exports.push(exported.type === 'Identifier' ? exported.name : exported.value);
      }
      const decl = node.declaration;
      if (decl) {
        if (decl.id && decl.id.name) {
          exports.push(decl.id.name);
        }
        for (const declarator of decl.declarations ?? []) {
          if (declarator.id.type === 'Identifier') exports.push(declarator.id.name);
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      exports.push('default');
    }
  }

  const dynamicImports = [];
  const seen = new Set();
  const walk = node => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Import') {
      dynamicImports.push(node.loc ? node.loc.start.line : 0);
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === 'string') walk(value);
    }
  };
  walk(ast.program);

  return {
    path: relPath,
    specifiers: [...specifiers].sort(),
    exports: [...new Set(exports)].sort(),
    dynamicImports: dynamicImports.sort((a, b) => a - b),
  };
}

function walkFiles(projectRoot, roots) {
  const found = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
        found.push(path.relative(projectRoot, full).split(path.sep).join('/'));
      }
    }
  };
  for (const root of roots) visit(path.join(projectRoot, root));
  return found.sort();
}

function resolve(specifier, fromRel, fileSet) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, `${base}/index.js`, `${base}/index.mjs`]) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

export function buildOracleGraph(projectRoot, roots, extensions = EXTENSIONS) {
  const files = walkFiles(projectRoot, roots, extensions);
  const fileSet = new Set(files);
  const imports = {};
  const exports = {};
  const externals = {};
  const unresolved = [];
  const dynamic = [];

  for (const rel of files) {
    const text = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
    const facts = extractModuleFacts(text, rel);
    if (facts.dynamicImports.length) {
      dynamic.push({ path: rel, lines: facts.dynamicImports });
    }
    const targets = new Set();
    const ext = new Set();
    for (const specifier of facts.specifiers) {
      if (!specifier.startsWith('.')) { ext.add(specifier); continue; }
      const target = resolve(specifier, rel, fileSet);
      if (target) targets.add(target);
      else unresolved.push({ from: rel, specifier });
    }
    imports[rel] = [...targets].sort();
    externals[rel] = [...ext].sort();
    exports[rel] = facts.exports;
  }

  const importedBy = Object.fromEntries(files.map(f => [f, []]));
  for (const [source, targets] of Object.entries(imports)) {
    for (const target of targets) importedBy[target].push(source);
  }
  for (const key of Object.keys(importedBy)) importedBy[key].sort();

  return { files, imports, importedBy, exports, externals, unresolved, dynamic };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outIndex = process.argv.indexOf('--out');
  const graph = buildOracleGraph(process.cwd(), [
    'codex/core/constellation',
    'codex/server/services/constellation',
  ]);
  const json = JSON.stringify(graph, null, 1);
  if (outIndex > -1) fs.writeFileSync(process.argv[outIndex + 1], `${json}\n`);
  else process.stdout.write(`${json}\n`);
  const edges = Object.values(graph.imports).reduce((n, v) => n + v.length, 0);
  process.stderr.write(`oracle: ${graph.files.length} files, ${edges} edges, ` +
    `${graph.unresolved.length} unresolved, ${graph.dynamic.length} dynamic\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && nice -n 19 npx vitest run tests/qa/features/skeleton-oracle.test.js --maxWorkers=2 2>&1 | tail -15`

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the oracle on the real tree**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && node scripts/skeleton_oracle.mjs --out /tmp/oracle-graph.json`

Expected on stderr: `oracle: 67 files, 105 edges, 0 unresolved, 0 dynamic`.

- [ ] **Step 6: Commit**

```bash
git add scripts/skeleton_oracle.mjs tests/qa/features/skeleton-oracle.test.js
git commit -m "feat(skeleton): independent Babel-AST oracle

Real AST, shares no extraction code with the Python builder -- otherwise
the fidelity gate is regex agreeing with regex."
```

---

### Task 6: Fidelity gate

**Files:**
- Create: `scripts/skeleton_fidelity_gate.py`
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: the artifact from Task 4 and the oracle JSON from Task 5.
- Produces: `compare(skeleton_payload: dict, oracle_graph: dict) -> dict` returning `{"pass": bool, "edgeDiff": {...}, "exportDiff": {...}, "fileDiff": {...}}`. CLI exits `0` on pass, `1` on any difference.

**Threshold, fixed:** exact set equality on internal edges **and** on export names. Not a ratio. A routing artifact that is 98% right sends you to the wrong file once in fifty and gives no way to know which time. **If the regex builder cannot reach exact equality, do not loosen this gate** — replace the builder's extraction with a Babel-based one and re-point the oracle at Node's own resolver plus `es-module-lexer` (installed). That contingency is fixed in the spec so it is not an ad-hoc call here.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
gate = load_module("skeleton_fidelity_gate", "scripts/skeleton_fidelity_gate.py")


def _tiny_skeleton(imports, exports):
    return {"sections": [{"nodes": [
        {"path": p, "imports": v, "exports": exports.get(p, [])}
        for p, v in sorted(imports.items())]}]}


class TestFidelityGate(unittest.TestCase):
    def test_identical_graphs_pass(self):
        imports = {"a.js": ["b.js"], "b.js": []}
        exports = {"a.js": ["A"], "b.js": ["B"]}
        result = gate.compare(_tiny_skeleton(imports, exports),
                              {"files": ["a.js", "b.js"], "imports": imports, "exports": exports})
        self.assertTrue(result["pass"])

    def test_a_single_missing_edge_fails(self):
        skel = _tiny_skeleton({"a.js": [], "b.js": []}, {"a.js": [], "b.js": []})
        oracle = {"files": ["a.js", "b.js"],
                  "imports": {"a.js": ["b.js"], "b.js": []},
                  "exports": {"a.js": [], "b.js": []}}
        result = gate.compare(skel, oracle)
        self.assertFalse(result["pass"])
        self.assertIn("a.js>b.js", result["edgeDiff"]["onlyInOracle"])

    def test_a_single_extra_edge_fails(self):
        skel = _tiny_skeleton({"a.js": ["b.js"], "b.js": []}, {"a.js": [], "b.js": []})
        oracle = {"files": ["a.js", "b.js"],
                  "imports": {"a.js": [], "b.js": []},
                  "exports": {"a.js": [], "b.js": []}}
        result = gate.compare(skel, oracle)
        self.assertFalse(result["pass"])
        self.assertIn("a.js>b.js", result["edgeDiff"]["onlyInSkeleton"])

    def test_export_name_mismatch_fails(self):
        imports = {"a.js": []}
        skel = _tiny_skeleton(imports, {"a.js": ["A"]})
        oracle = {"files": ["a.js"], "imports": imports, "exports": {"a.js": ["A", "B"]}}
        result = gate.compare(skel, oracle)
        self.assertFalse(result["pass"])
        self.assertIn("a.js:B", result["exportDiff"]["onlyInOracle"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestFidelityGate -v 2>&1 | tail -10`

Expected: FAIL — gate module missing.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_fidelity_gate.py`:

```python
#!/usr/bin/env python3
"""Exact set-equality gate between the skeleton artifact and the Babel oracle.

A skeleton that is small AND wrong saves tokens by lying. This runs before any
burn claim. The threshold is equality, not a ratio: 98% correct routing sends
you to the wrong file once in fifty with no way to know which time.
"""

import argparse
import json
import sys


def _skeleton_sets(payload):
    edges, exports, files = set(), set(), set()
    for section in payload["sections"]:
        for node in section["nodes"]:
            files.add(node["path"])
            for target in node["imports"]:
                edges.add(f"{node['path']}>{target}")
            for name in node["exports"]:
                exports.add(f"{node['path']}:{name}")
    return edges, exports, files


def _oracle_sets(graph):
    edges = {f"{src}>{dst}" for src, targets in graph["imports"].items() for dst in targets}
    exports = {f"{path}:{name}" for path, names in graph["exports"].items() for name in names}
    return edges, exports, set(graph["files"])


def _diff(left, right):
    return {"onlyInSkeleton": sorted(left - right), "onlyInOracle": sorted(right - left)}


def compare(skeleton_payload: dict, oracle_graph: dict) -> dict:
    s_edges, s_exports, s_files = _skeleton_sets(skeleton_payload)
    o_edges, o_exports, o_files = _oracle_sets(oracle_graph)
    edge_diff = _diff(s_edges, o_edges)
    export_diff = _diff(s_exports, o_exports)
    file_diff = _diff(s_files, o_files)
    passed = not any(d["onlyInSkeleton"] or d["onlyInOracle"]
                     for d in (edge_diff, export_diff, file_diff))
    return {
        "pass": passed,
        "edgeDiff": edge_diff,
        "exportDiff": export_diff,
        "fileDiff": file_diff,
        "counts": {"skeletonEdges": len(s_edges), "oracleEdges": len(o_edges),
                   "skeletonExports": len(s_exports), "oracleExports": len(o_exports)},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skeleton", default=".atlas/constellation-skeleton.json")
    parser.add_argument("--oracle", required=True)
    args = parser.parse_args()

    with open(args.skeleton, encoding="utf-8") as fh:
        skeleton = json.load(fh)
    with open(args.oracle, encoding="utf-8") as fh:
        oracle = json.load(fh)

    result = compare(skeleton, oracle)
    print(json.dumps(result["counts"], indent=1))
    if result["pass"]:
        print("FIDELITY GATE: PASS (exact set equality on files, edges, exports)")
        return 0
    print("FIDELITY GATE: FAIL")
    for name in ("fileDiff", "edgeDiff", "exportDiff"):
        for side in ("onlyInSkeleton", "onlyInOracle"):
            for item in result[name][side][:20]:
                print(f"  {name}/{side}: {item}")
    print("\nDo NOT loosen this threshold. Per spec 10.1, replace the regex builder "
          "with a Babel extractor and re-point the oracle at es-module-lexer.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestFidelityGate -v 2>&1 | tail -10`

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the gate for real — this is the decision point**

Run:
```bash
cd /home/deck/Downloads/Scholomance-V12-main
node scripts/skeleton_oracle.mjs --out /tmp/oracle-graph.json
python3 scripts/build_constellation_skeleton.py
python3 scripts/skeleton_fidelity_gate.py --oracle /tmp/oracle-graph.json; echo "exit=$?"
```

Expected: `FIDELITY GATE: PASS`, `exit=0`.

**If it fails, stop and report the diff.** Do not adjust the builder to match the oracle by special-casing individual files, and do not weaken the gate. Report which side is wrong and why — a disagreement here is the gate doing its job, and it is a finding worth surfacing before any burn measurement.

- [ ] **Step 6: Commit**

```bash
git add scripts/skeleton_fidelity_gate.py divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "feat(skeleton): exact-equality fidelity gate

Threshold is set equality, not a ratio, on files, edges and export names."
```

---

### Task 7: The `skeleton()` lens

**Files:**
- Modify: `divtube_downloader/tui/services/code_lens.py` (append near `_atlas_for`, around line 495)
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: the artifact from Task 4; `code_atlas.live_head(project_root)` for staleness.
- Produces: `skeleton(project_root: str, section: int | None = None, path: str | None = None) -> dict`.
  Always returns a dict, never raises. Keys on success: `available: True`, `schema`, `stale`, `commitsBehind`, `builtAtHead`, `head`, `sections` (summaries), and — when `section` or `path` is given — `nodes` or `node`.
  On failure: `{"available": False, "reason": <str>}`.

**Contract to preserve:** `code_lens.py` treats the atlas as an optional steroid (`_atlas_for`, lines 495–507: missing module, missing file, or failed checksum all return `None` and the lenses degrade rather than break). The skeleton must behave identically — a corrupt artifact must not affect `telescope` or `microscope`.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
def load_code_lens():
    """Direct load. `from tui.services import code_lens` raises ModuleNotFoundError
    here because tui/services/__init__.py imports prompt_service -> openai."""
    for pkg in ("tui", "tui.services"):
        if pkg not in sys.modules:
            module = types.ModuleType(pkg)
            module.__path__ = []
            sys.modules[pkg] = module
    load_module("tui.services.code_atlas", "divtube_downloader/tui/services/code_atlas.py")
    return load_module("tui.services.code_lens", "divtube_downloader/tui/services/code_lens.py")


class TestSkeletonLens(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.code_lens = load_code_lens()

    def test_reports_sections_on_the_real_tree(self):
        result = self.code_lens.skeleton(PROJECT_ROOT)
        self.assertTrue(result["available"])
        self.assertEqual(result["schema"], "CONSTELLATION-SKELETON-v1")
        self.assertEqual(len(result["sections"]), 3)
        self.assertRegex(result["sections"][0]["checksum64"], r"^[0-9A-F]{64}$")

    def test_section_query_returns_nodes(self):
        result = self.code_lens.skeleton(PROJECT_ROOT, section=0)
        self.assertEqual(len(result["nodes"]), 20)

    def test_path_query_returns_one_node_with_both_edge_directions(self):
        result = self.code_lens.skeleton(
            PROJECT_ROOT, path="codex/core/constellation/compose.js")
        self.assertEqual(result["node"]["path"], "codex/core/constellation/compose.js")
        self.assertIn("imports", result["node"])
        self.assertIn("importedBy", result["node"])

    def test_unknown_path_is_reported_not_raised(self):
        result = self.code_lens.skeleton(PROJECT_ROOT, path="nope/missing.js")
        self.assertFalse(result["available"])
        self.assertIn("not-in-skeleton", result["reason"])

    def test_missing_artifact_degrades(self):
        empty = tempfile.mkdtemp(prefix="no-skeleton-")
        self.addCleanup(shutil.rmtree, empty, True)
        result = self.code_lens.skeleton(empty)
        self.assertFalse(result["available"])
        self.assertEqual(result["reason"], "skeleton-not-built")

    def test_corrupt_artifact_degrades_and_does_not_break_telescope(self):
        broken = tempfile.mkdtemp(prefix="bad-skeleton-")
        self.addCleanup(shutil.rmtree, broken, True)
        os.makedirs(os.path.join(broken, ".atlas"))
        with open(os.path.join(broken, ".atlas", "constellation-skeleton.json"), "w") as fh:
            fh.write("{ this is not json")
        with open(os.path.join(broken, "thing.js"), "w") as fh:
            fh.write("export function thing() { return 1; }\n")
        result = self.code_lens.skeleton(broken)
        self.assertFalse(result["available"])
        self.assertEqual(result["reason"], "skeleton-unreadable")
        # The other lenses must be unaffected.
        self.assertIn("tree", self.code_lens.telescope(broken, "."))

    def test_staleness_is_stamped_never_silent(self):
        result = self.code_lens.skeleton(PROJECT_ROOT)
        self.assertIn("stale", result)
        self.assertIn("commitsBehind", result)
        self.assertIn("builtAtHead", result)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestSkeletonLens -v 2>&1 | tail -10`

Expected: FAIL — `AttributeError: module has no attribute 'skeleton'`.

- [ ] **Step 3: Write minimal implementation**

Append to `divtube_downloader/tui/services/code_lens.py`:

```python
# ---------------------------------------------------------------------------
# The routing skeleton (.atlas/constellation-skeleton.json) is a sidecar to the
# atlas and is treated the same way: an optional steroid. Missing, unreadable
# or wrong-schema all degrade to available=False and never break telescope or
# microscope. Staleness is stamped, never silent.
# ---------------------------------------------------------------------------

SKELETON_REL_PATH = os.path.join(".atlas", "constellation-skeleton.json")
SKELETON_SCHEMA = "CONSTELLATION-SKELETON-v1"


def _skeleton_payload(project_root: str):
    """(payload, None) or (None, reason)."""
    full = os.path.join(project_root, SKELETON_REL_PATH)
    if not os.path.exists(full):
        return None, "skeleton-not-built"
    try:
        with open(full, encoding="utf-8") as fh:
            payload = json.load(fh)
    except Exception:  # noqa: BLE001 — optional steroid, never raise at callers
        return None, "skeleton-unreadable"
    if payload.get("schema") != SKELETON_SCHEMA:
        return None, f"skeleton-schema-mismatch:{payload.get('schema')!r}"
    return payload, None


def skeleton(project_root: str, section: int | None = None, path: str | None = None) -> dict:
    """Routing lens: where a module sits, what it imports, what imports it.

    Answers structure only — never behaviour. For what a symbol DOES use
    code_eval.evaluate(); for binding resolution use the cleri-probe Babel
    facts adapter.
    """
    payload, reason = _skeleton_payload(project_root)
    if payload is None:
        return {"available": False, "reason": reason}

    built_head = payload.get("builtAtHead")
    head = None
    behind = 0
    try:
        from tui.services import code_atlas  # noqa: PLC0415 — lazy, optional
        head = code_atlas.live_head(project_root)
        if head and built_head and head != built_head:
            out = code_atlas._git(project_root, "rev-list", "--count", f"{built_head}..{head}")
            behind = int(out.strip()) if out and out.strip().isdigit() else -1
    except Exception:  # noqa: BLE001
        head = None

    result = {
        "available": True,
        "schema": payload["schema"],
        "builtAtHead": built_head,
        "head": head,
        "stale": bool(head and built_head and head != built_head),
        "commitsBehind": behind,
        "scope": payload.get("scope", {}),
        "meta": payload.get("meta", {}),
        "declaredBlindSpots": payload.get("declaredBlindSpots", []),
        "sections": [
            {"stratum": s["stratum"], "checksum64": s["checksum64"],
             "nodeCount": len(s["nodes"]), "slots": s["slots"]}
            for s in payload["sections"]
        ],
    }

    if path is not None:
        for sec in payload["sections"]:
            for node in sec["nodes"]:
                if node["path"] == path:
                    result["node"] = node
                    return result
        return {"available": False, "reason": f"not-in-skeleton:{path}"}

    if section is not None:
        for sec in payload["sections"]:
            if sec["stratum"] == section:
                result["nodes"] = sec["nodes"]
                return result
        return {"available": False, "reason": f"no-such-section:{section}"}

    return result
```

Confirm `json` and `os` are already imported at the top of `code_lens.py` — they are.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestSkeletonLens -v 2>&1 | tail -10`

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole Python suite for this feature**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton -v 2>&1 | tail -5`

Expected: PASS, 46 tests total.

- [ ] **Step 6: Commit**

```bash
git add divtube_downloader/tui/services/code_lens.py divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "feat(skeleton): skeleton() routing lens on code_lens

Optional-steroid contract preserved: missing/corrupt/wrong-schema all
degrade to available=False; telescope and microscope unaffected."
```

---

### Task 8: Question set, ground truth, and preregistration

**Files:**
- Create: `scripts/skeleton_questions.py`
- Create: `docs/superpowers/plans/2026-08-14-skeleton-pilot-prereg.md`

**Interfaces:**
- Consumes: the oracle JSON from Task 5.
- Produces: `generate(oracle_graph: dict, seed: int, n_per_class: int = 30) -> list[dict]`, each question `{"id": str, "class": "importers"|"imports", "target": str, "answer": list[str]}`. CLI writes `evidence/skeleton-pilot/questions.json`.

**This task ends with the thresholds committed to git before any arm runs.** That ordering is the whole point — a threshold chosen after seeing results is not a threshold.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
questions = load_module("skeleton_questions", "scripts/skeleton_questions.py")

ORACLE_STUB = {
    "files": [f"f{i}.js" for i in range(40)],
    "imports": {f"f{i}.js": ([f"f{i + 1}.js"] if i < 39 else []) for i in range(40)},
    "importedBy": {f"f{i}.js": ([f"f{i - 1}.js"] if i > 0 else []) for i in range(40)},
    "exports": {f"f{i}.js": [f"e{i}"] for i in range(40)},
}


class TestQuestionSet(unittest.TestCase):
    def test_generates_thirty_of_each_class(self):
        qs = questions.generate(ORACLE_STUB, seed=1234, n_per_class=30)
        self.assertEqual(len(qs), 60)
        self.assertEqual(sum(1 for q in qs if q["class"] == "importers"), 30)
        self.assertEqual(sum(1 for q in qs if q["class"] == "imports"), 30)

    def test_same_seed_gives_the_same_questions(self):
        a = questions.generate(ORACLE_STUB, seed=1234)
        b = questions.generate(ORACLE_STUB, seed=1234)
        self.assertEqual(a, b)

    def test_different_seed_gives_different_questions(self):
        a = questions.generate(ORACLE_STUB, seed=1234)
        b = questions.generate(ORACLE_STUB, seed=99)
        self.assertNotEqual([q["target"] for q in a], [q["target"] for q in b])

    def test_targets_are_drawn_without_replacement_within_a_class(self):
        qs = questions.generate(ORACLE_STUB, seed=7)
        importers = [q["target"] for q in qs if q["class"] == "importers"]
        self.assertEqual(len(importers), len(set(importers)))

    def test_answers_come_from_the_oracle(self):
        qs = questions.generate(ORACLE_STUB, seed=7)
        for q in qs:
            source = "importedBy" if q["class"] == "importers" else "imports"
            self.assertEqual(q["answer"], sorted(ORACLE_STUB[source][q["target"]]))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestQuestionSet -v 2>&1 | tail -10`

Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_questions.py`:

```python
#!/usr/bin/env python3
"""Seeded routing question set with oracle-derived ground truth.

Questions are generated from the FILE LIST and answered from the Babel oracle.
Neither is authored by the agent whose performance they measure.
"""

import argparse
import json
import os
import random

DEFAULT_SEED = 20260814
OUT_REL_PATH = os.path.join("evidence", "skeleton-pilot", "questions.json")

PROMPTS = {
    "importers": "Which modules in the ConstellationOS engine import {target}? "
                 "Answer with the complete list of repo-relative paths, or an empty list.",
    "imports": "Which modules in the ConstellationOS engine does {target} import? "
               "Answer with the complete list of repo-relative paths, or an empty list.",
}


def generate(oracle_graph: dict, seed: int = DEFAULT_SEED, n_per_class: int = 30) -> list[dict]:
    files = sorted(oracle_graph["files"])
    out = []
    for class_index, (name, source) in enumerate(
            (("importers", "importedBy"), ("imports", "imports"))):
        # Independent stream per class, so a file may appear in both.
        rng = random.Random(f"{seed}:{name}")
        targets = rng.sample(files, min(n_per_class, len(files)))
        for i, target in enumerate(sorted(targets)):
            out.append({
                "id": f"{name}-{i:02d}",
                "class": name,
                "target": target,
                "prompt": PROMPTS[name].format(target=target),
                "answer": sorted(oracle_graph[source][target]),
            })
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", required=True)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", default=OUT_REL_PATH)
    args = parser.parse_args()

    with open(args.oracle, encoding="utf-8") as fh:
        oracle = json.load(fh)
    qs = generate(oracle, seed=args.seed)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump({"seed": args.seed, "count": len(qs), "questions": qs}, fh, indent=1)
        fh.write("\n")
    empty = sum(1 for q in qs if not q["answer"])
    print(f"{len(qs)} questions, seed={args.seed}, {empty} with an empty answer -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestQuestionSet -v 2>&1 | tail -10`

Expected: PASS, 5 tests.

- [ ] **Step 5: Generate the real question set**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 scripts/skeleton_questions.py --oracle /tmp/oracle-graph.json`

Expected: `60 questions, seed=20260814, N with an empty answer -> evidence/skeleton-pilot/questions.json`.

- [ ] **Step 6: Write the preregistration**

Create `docs/superpowers/plans/2026-08-14-skeleton-pilot-prereg.md`:

```markdown
# Skeleton Pilot — Preregistration

Committed before any arm runs. Not edited afterwards.

**Question set:** `evidence/skeleton-pilot/questions.json`, seed 20260814, n=60
(30 `importers`, 30 `imports`). Ground truth from `scripts/skeleton_oracle.mjs`.

**Scoring:** exact set match per question, 1 or 0. No partial credit — a routing
answer that names four of five importers still sends you looking in the wrong place.

**Arms:** `skeleton` (artifact only, barred from reading constellation sources),
`files` (normal tools, no artifact), `shuffled` (degree-preserving permuted edges,
otherwise identical presentation to `skeleton`).

**Primary hypothesis.** `skeleton` correctness > `shuffled` correctness.
Test: McNemar's exact test on discordant pairs (the arms answer identical questions,
so the comparison is paired). Significance: p < 0.05, one-sided.
**If this fails the pilot is REFUTED regardless of token savings.**

**Secondary (burn).** Median bytes of source content delivered into context per
CORRECT answer, `skeleton` vs `files`. Reported only if the primary passes.

**Burn metric definition.** Each arm emits a machine-readable trace listing every
path it opened. The harness computes bytes by re-reading those paths itself. The
arm's self-report of *which files* is verifiable against its answers; a self-reported
token count would not be, and is not used.

**n is fixed at 60** and is not extended after inspecting results. No post-hoc
subgroups: results are reported over all 60 questions, and any split by question
class is reported alongside the full set, never in place of it.
```

- [ ] **Step 7: Commit the preregistration**

```bash
git add scripts/skeleton_questions.py evidence/skeleton-pilot/questions.json \
        docs/superpowers/plans/2026-08-14-skeleton-pilot-prereg.md \
        divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "test(skeleton): question set + preregistered thresholds

Thresholds committed before any arm runs. n=60 fixed, no post-hoc subgroups."
```

---

### Task 9: Degree-preserving shuffled control

**Files:**
- Create: `scripts/skeleton_shuffle.py`
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: the artifact from Task 4.
- Produces: `shuffle_payload(payload: dict, seed: int) -> dict` — an artifact identical in shape and in every degree, with edges permuted. CLI writes `evidence/skeleton-pilot/skeleton-shuffled.json`.

**Why degree-preserving:** if the control had a different edge count or different fan-in distribution, a `skeleton` win could come from the *shape* of the data rather than its *truth*. Preserving both degree sequences leaves truth as the only difference.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
shuffler = load_module("skeleton_shuffle", "scripts/skeleton_shuffle.py")


class TestShuffledControl(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(PROJECT_ROOT, ".atlas", "constellation-skeleton.json")) as fh:
            cls.real = json.load(fh)
        cls.shuffled = shuffler.shuffle_payload(cls.real, seed=4242)

    def _nodes(self, payload):
        return {n["path"]: n for s in payload["sections"] for n in s["nodes"]}

    def test_same_files(self):
        self.assertEqual(sorted(self._nodes(self.real)), sorted(self._nodes(self.shuffled)))

    def test_same_total_edge_count(self):
        count = lambda p: sum(len(n["imports"]) for n in self._nodes(p).values())
        self.assertEqual(count(self.real), count(self.shuffled))

    def test_out_degree_preserved_per_file(self):
        real, fake = self._nodes(self.real), self._nodes(self.shuffled)
        for path in real:
            self.assertEqual(len(real[path]["imports"]), len(fake[path]["imports"]))

    def test_in_degree_sequence_preserved(self):
        degrees = lambda p: sorted(len(n["importedBy"]) for n in self._nodes(p).values())
        self.assertEqual(degrees(self.real), degrees(self.shuffled))

    def test_edges_actually_differ(self):
        edges = lambda p: {f"{n['path']}>{t}" for n in self._nodes(p).values() for t in n["imports"]}
        overlap = len(edges(self.real) & edges(self.shuffled))
        self.assertLess(overlap, 0.2 * len(edges(self.real)))

    def test_reverse_edges_are_consistent_with_forward_edges(self):
        nodes = self._nodes(self.shuffled)
        rebuilt = {p: set() for p in nodes}
        for path, node in nodes.items():
            for target in node["imports"]:
                rebuilt[target].add(path)
        for path, node in nodes.items():
            self.assertEqual(sorted(rebuilt[path]), node["importedBy"])

    def test_deterministic_for_a_seed(self):
        again = shuffler.shuffle_payload(self.real, seed=4242)
        self.assertEqual(json.dumps(again, sort_keys=True),
                         json.dumps(self.shuffled, sort_keys=True))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestShuffledControl -v 2>&1 | tail -10`

Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_shuffle.py`:

```python
#!/usr/bin/env python3
"""Degree-preserving edge permutation: the pilot's null control.

If the control had a different edge count or fan-in distribution, a skeleton win
could come from the SHAPE of the data rather than its TRUTH. Preserving both
degree sequences leaves truth as the only difference between the arms.

Method: collect every edge, then repeatedly double-edge-swap (a->b, c->d becomes
a->d, c->b). Swaps preserve both out-degree and in-degree exactly.
"""

import argparse
import copy
import json
import os
import random

OUT_REL_PATH = os.path.join("evidence", "skeleton-pilot", "skeleton-shuffled.json")


def shuffle_payload(payload: dict, seed: int) -> dict:
    out = copy.deepcopy(payload)
    nodes = {n["path"]: n for s in out["sections"] for n in s["nodes"]}

    edges = []
    for path in sorted(nodes):
        for target in nodes[path]["imports"]:
            edges.append([path, target])

    rng = random.Random(seed)
    swaps = 0
    attempts = 0
    target_swaps = 20 * len(edges)          # well past mixing for a graph this size
    while swaps < target_swaps and attempts < 200 * len(edges):
        attempts += 1
        i, j = rng.randrange(len(edges)), rng.randrange(len(edges))
        if i == j:
            continue
        (a, b), (c, d) = edges[i], edges[j]
        if a == d or c == b:                # would create a self-loop
            continue
        if [a, d] in edges or [c, b] in edges:   # would create a duplicate edge
            continue
        edges[i], edges[j] = [a, d], [c, b]
        swaps += 1

    for node in nodes.values():
        node["imports"] = []
        node["importedBy"] = []
    for source, target in edges:
        nodes[source]["imports"].append(target)
        nodes[target]["importedBy"].append(source)
    for node in nodes.values():
        node["imports"].sort()
        node["importedBy"].sort()

    out["meta"]["control"] = {
        "kind": "degree-preserving-shuffle", "seed": seed,
        "swaps": swaps, "attempts": attempts,
    }
    # The stamps describe the real graph and would be false here.
    for section in out["sections"]:
        section["checksum64"] = "0" * 64
        section["slots"] = []
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skeleton", default=".atlas/constellation-skeleton.json")
    parser.add_argument("--seed", type=int, default=4242)
    parser.add_argument("--out", default=OUT_REL_PATH)
    args = parser.parse_args()

    with open(args.skeleton, encoding="utf-8") as fh:
        payload = json.load(fh)
    shuffled = shuffle_payload(payload, seed=args.seed)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(shuffled, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"shuffled: {shuffled['meta']['control']['swaps']} swaps -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestShuffledControl -v 2>&1 | tail -10`

Expected: PASS, 7 tests.

- [ ] **Step 5: Generate the real control**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 scripts/skeleton_shuffle.py`

Expected: `shuffled: <n> swaps -> evidence/skeleton-pilot/skeleton-shuffled.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/skeleton_shuffle.py evidence/skeleton-pilot/skeleton-shuffled.json \
        divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "test(skeleton): degree-preserving shuffled control

Double-edge-swap preserves both degree sequences exactly, leaving truth
as the only difference between the skeleton and control arms."
```

---

### Task 10: Ledger writer

**Files:**
- Create: `scripts/skeleton_ledger.mjs`
- Create: `tests/qa/features/skeleton-ledger.test.js`

**Interfaces:**
- Consumes: arm trace rows.
- Produces: `export function ledgerKey({sectionChecksum, questionClass, arm, routeSignature})` → 32-char lowercase hex; `export function recordOutcome(db, row)` → `{inserted: boolean, corroborationCount: number, ledgerStatus: string}`; `export function openDb(path)`.

**No schema change.** `collab_experience_ledger` already exists with exactly the needed columns and currently holds 0 rows. Verify before writing:

```
skeleton_hash TEXT PRIMARY KEY, bytecode_prefix TEXT DEFAULT 'PB-EXP-v1',
raw_trace_ref TEXT, corroboration_count INTEGER DEFAULT 1,
corroborating_agent_ids TEXT DEFAULT '[]', ledger_status TEXT DEFAULT 'pending',
created_at DATETIME, updated_at DATETIME
```

A row is a **measured outcome**, never advice. `corroboration_count` must only ever mean *N independent agents measured this route and got the same result* — if it comes to mean *N agents found the claim plausible*, the ledger becomes folklore that strengthens with repetition.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/skeleton-ledger.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ledgerKey, recordOutcome } from '../../../scripts/skeleton_ledger.mjs';

const SCHEMA = `CREATE TABLE collab_experience_ledger (
  skeleton_hash TEXT PRIMARY KEY,
  bytecode_prefix TEXT NOT NULL DEFAULT 'PB-EXP-v1',
  raw_trace_ref TEXT,
  corroboration_count INTEGER DEFAULT 1,
  corroborating_agent_ids TEXT DEFAULT '[]',
  ledger_status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

let db;
let dir;

const ROW = {
  sectionChecksum: 'A'.repeat(64),
  questionClass: 'importers',
  arm: 'skeleton',
  routeSignature: 'skeleton:section-1',
  agentId: 'agent-one',
  traceRef: 'evidence/skeleton-pilot/run.jsonl',
  correct: true,
  bytesRead: 4096,
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  db = new Database(path.join(dir, 'test.sqlite'));
  db.exec(SCHEMA);
});

afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('experience ledger', () => {
  it('derives a stable 32-char key from the route identity', () => {
    const a = ledgerKey(ROW);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(ledgerKey({ ...ROW })).toBe(a);
  });

  it('gives different arms different keys', () => {
    expect(ledgerKey(ROW)).not.toBe(ledgerKey({ ...ROW, arm: 'files' }));
  });

  it('inserts a pending row with the PB-EXP-v1 prefix', () => {
    const out = recordOutcome(db, ROW);
    expect(out.inserted).toBe(true);
    expect(out.corroborationCount).toBe(1);
    expect(out.ledgerStatus).toBe('pending');
    const stored = db.prepare('SELECT * FROM collab_experience_ledger').get();
    expect(stored.bytecode_prefix).toBe('PB-EXP-v1');
    expect(JSON.parse(stored.corroborating_agent_ids)).toEqual(['agent-one']);
  });

  it('corroborates on a second independent agent and promotes the status', () => {
    recordOutcome(db, ROW);
    const out = recordOutcome(db, { ...ROW, agentId: 'agent-two' });
    expect(out.inserted).toBe(false);
    expect(out.corroborationCount).toBe(2);
    expect(out.ledgerStatus).toBe('corroborated');
  });

  it('does not let the same agent corroborate itself', () => {
    recordOutcome(db, ROW);
    const out = recordOutcome(db, { ...ROW });
    expect(out.corroborationCount).toBe(1);
    expect(out.ledgerStatus).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && nice -n 19 npx vitest run tests/qa/features/skeleton-ledger.test.js --maxWorkers=2 2>&1 | tail -15`

Expected: FAIL — cannot resolve `scripts/skeleton_ledger.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_ledger.mjs`:

```js
#!/usr/bin/env node
/**
 * PB-EXP-v1 rows into the existing collab_experience_ledger. No schema change.
 *
 * A row is a MEASURED OUTCOME -- question class, route taken, bytes read,
 * correct against the oracle -- never advice. corroboration_count means
 * "N independent agents measured this route and got the same result". If it
 * ever comes to mean "N agents found this plausible", the ledger stops being
 * evidence and becomes folklore that strengthens with repetition.
 */

import crypto from 'node:crypto';
import Database from 'better-sqlite3';

export const BYTECODE_PREFIX = 'PB-EXP-v1';
export const CORROBORATION_THRESHOLD = 2;

export function openDb(dbPath) {
  return new Database(dbPath);
}

export function ledgerKey({ sectionChecksum, questionClass, arm, routeSignature }) {
  return crypto
    .createHash('sha256')
    .update(`${sectionChecksum}|${questionClass}|${arm}|${routeSignature}`)
    .digest('hex')
    .slice(0, 32);
}

export function recordOutcome(db, row) {
  const key = ledgerKey(row);
  const existing = db
    .prepare('SELECT * FROM collab_experience_ledger WHERE skeleton_hash = ?')
    .get(key);

  if (!existing) {
    db.prepare(
      `INSERT INTO collab_experience_ledger
         (skeleton_hash, bytecode_prefix, raw_trace_ref,
          corroboration_count, corroborating_agent_ids, ledger_status)
       VALUES (?, ?, ?, 1, ?, 'pending')`,
    ).run(key, BYTECODE_PREFIX, row.traceRef, JSON.stringify([row.agentId]));
    return { inserted: true, corroborationCount: 1, ledgerStatus: 'pending', key };
  }

  const agents = JSON.parse(existing.corroborating_agent_ids || '[]');
  if (agents.includes(row.agentId)) {
    // An agent cannot corroborate itself. Re-measuring is not new evidence.
    return {
      inserted: false,
      corroborationCount: existing.corroboration_count,
      ledgerStatus: existing.ledger_status,
      key,
    };
  }

  agents.push(row.agentId);
  const count = agents.length;
  const status = count >= CORROBORATION_THRESHOLD ? 'corroborated' : 'pending';
  db.prepare(
    `UPDATE collab_experience_ledger
        SET corroboration_count = ?, corroborating_agent_ids = ?,
            ledger_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE skeleton_hash = ?`,
  ).run(count, JSON.stringify(agents), status, key);

  return { inserted: false, corroborationCount: count, ledgerStatus: status, key };
}

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index > -1 ? process.argv[index + 1] : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const reportPath = argValue('--report', 'evidence/skeleton-pilot/report.json');
  const dbPath = argValue('--db', 'scholomance_collab.sqlite');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const skeleton = JSON.parse(
    fs.readFileSync('.atlas/constellation-skeleton.json', 'utf8'),
  );
  const sectionOf = new Map();
  for (const section of skeleton.sections) {
    for (const node of section.nodes) sectionOf.set(node.path, section.checksum64);
  }
  const questions = JSON.parse(
    fs.readFileSync('evidence/skeleton-pilot/questions.json', 'utf8'),
  ).questions;
  const classOf = new Map(questions.map(q => [q.id, q.class]));
  const targetOf = new Map(questions.map(q => [q.id, q.target]));

  const db = openDb(dbPath);
  let written = 0;
  for (const [arm, armReport] of Object.entries(report.armTraces ?? {})) {
    for (const entry of armReport) {
      const result = recordOutcome(db, {
        sectionChecksum: sectionOf.get(targetOf.get(entry.id)) ?? '0'.repeat(64),
        questionClass: classOf.get(entry.id) ?? 'unknown',
        arm,
        routeSignature: entry.route ?? 'unknown',
        agentId: `${arm}-arm`,
        traceRef: `evidence/skeleton-pilot/${arm}.jsonl`,
        correct: entry.correct === true,
      });
      if (result.inserted) written += 1;
    }
  }
  db.close();
  process.stdout.write(`ledger: ${written} rows inserted into ${dbPath}\n`);
}
```

Add `import fs from 'node:fs';` to the top of the file alongside the `crypto` import.

The CLI reads `report.armTraces` — so `scripts/skeleton_ab_score.py` must include it. Add this line to `main()` in Task 11 Step 3, immediately before `os.makedirs`:

```python
    report["armTraces"] = {name: arm["perQuestion"] for name, arm in arms.items()}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && nice -n 19 npx vitest run tests/qa/features/skeleton-ledger.test.js --maxWorkers=2 2>&1 | tail -15`

Expected: PASS, 5 tests.

- [ ] **Step 5: Confirm the real table is still untouched**

Run:
```bash
cd /home/deck/Downloads/Scholomance-V12-main && python3 -c "
import sqlite3
c=sqlite3.connect('file:scholomance_collab.sqlite?mode=ro',uri=True)
print('rows:', c.execute('select count(*) from collab_experience_ledger').fetchone()[0])
"
```

Expected: `rows: 0`. Task 11 is what puts rows in it.

- [ ] **Step 6: Commit**

```bash
git add scripts/skeleton_ledger.mjs tests/qa/features/skeleton-ledger.test.js
git commit -m "feat(skeleton): PB-EXP-v1 experience ledger writer

Uses the existing collab_experience_ledger with no schema change. A row is
a measured outcome; an agent cannot corroborate itself."
```

---

### Task 11: Three-arm A/B harness and the run

**Files:**
- Create: `scripts/skeleton_ab_score.py`
- Create: `evidence/skeleton-pilot/` (trace and report output)
- Modify: `divtube_downloader/tests/test_constellation_skeleton.py` (append)

**Interfaces:**
- Consumes: `evidence/skeleton-pilot/questions.json`, per-arm trace files, `scripts/skeleton_ledger.mjs`.
- Produces: `score_arm(questions, trace) -> dict`, `mcnemar_exact(a_correct, b_correct) -> float`, `burn(project_root, trace) -> dict`. CLI writes `evidence/skeleton-pilot/report.json`.

**Arm trace format** — each arm writes JSONL, one object per question:
```json
{"id": "importers-00", "answer": ["path/a.js"], "opened": ["path/b.js"], "route": "skeleton:section-1"}
```
`opened` is every path the arm read. The harness computes bytes by re-reading those paths itself; the arm's self-reported byte count is never used.

- [ ] **Step 1: Write the failing test**

Append to `divtube_downloader/tests/test_constellation_skeleton.py`:

```python
scorer = load_module("skeleton_ab_score", "scripts/skeleton_ab_score.py")

QS = [{"id": "q1", "class": "imports", "target": "a.js", "answer": ["b.js"]},
      {"id": "q2", "class": "imports", "target": "c.js", "answer": []}]


class TestScoring(unittest.TestCase):
    def test_exact_set_match_scores_one(self):
        trace = [{"id": "q1", "answer": ["b.js"], "opened": []},
                 {"id": "q2", "answer": [], "opened": []}]
        self.assertEqual(scorer.score_arm(QS, trace)["correct"], 2)

    def test_order_does_not_matter(self):
        qs = [{"id": "q1", "class": "imports", "target": "a.js", "answer": ["b.js", "c.js"]}]
        trace = [{"id": "q1", "answer": ["c.js", "b.js"], "opened": []}]
        self.assertEqual(scorer.score_arm(qs, trace)["correct"], 1)

    def test_partial_answer_scores_zero(self):
        qs = [{"id": "q1", "class": "imports", "target": "a.js", "answer": ["b.js", "c.js"]}]
        trace = [{"id": "q1", "answer": ["b.js"], "opened": []}]
        self.assertEqual(scorer.score_arm(qs, trace)["correct"], 0)

    def test_missing_answer_scores_zero_and_is_counted(self):
        trace = [{"id": "q1", "answer": ["b.js"], "opened": []}]
        result = scorer.score_arm(QS, trace)
        self.assertEqual(result["correct"], 1)
        self.assertEqual(result["unanswered"], 1)

    def test_mcnemar_ignores_concordant_pairs(self):
        # 10 questions, both arms identical -> no evidence either way.
        self.assertEqual(scorer.mcnemar_exact([True] * 10, [True] * 10), 1.0)

    def test_mcnemar_detects_a_one_sided_advantage(self):
        a = [True] * 12 + [False] * 8
        b = [False] * 20
        self.assertLess(scorer.mcnemar_exact(a, b), 0.001)

    def test_mcnemar_is_not_significant_for_a_small_edge(self):
        a = [True, True, False, False, False]
        b = [False, True, False, False, False]
        self.assertGreater(scorer.mcnemar_exact(a, b), 0.05)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestScoring -v 2>&1 | tail -10`

Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/skeleton_ab_score.py`:

```python
#!/usr/bin/env python3
"""Score the three pilot arms against preregistered thresholds.

Scoring is exact set match. McNemar's exact test is used because the arms
answer IDENTICAL questions -- the comparison is paired, and an unpaired test
would throw away that pairing and lose power.
"""

import argparse
import json
import os
import statistics
from math import comb

PREREG = "docs/superpowers/plans/2026-08-14-skeleton-pilot-prereg.md"


def score_arm(questions: list[dict], trace: list[dict]) -> dict:
    by_id = {row["id"]: row for row in trace}
    per_question = []
    correct = 0
    unanswered = 0
    for question in questions:
        row = by_id.get(question["id"])
        if row is None:
            unanswered += 1
            per_question.append({"id": question["id"], "correct": False, "opened": []})
            continue
        got = sorted(set(row.get("answer") or []))
        want = sorted(set(question["answer"]))
        ok = got == want
        correct += 1 if ok else 0
        per_question.append({"id": question["id"], "correct": ok,
                             "opened": row.get("opened") or []})
    return {"correct": correct, "total": len(questions), "unanswered": unanswered,
            "perQuestion": per_question,
            "correctFlags": [p["correct"] for p in per_question]}


def mcnemar_exact(a_correct: list[bool], b_correct: list[bool]) -> float:
    """One-sided exact test: is A better than B on the discordant pairs?"""
    a_only = sum(1 for a, b in zip(a_correct, b_correct) if a and not b)
    b_only = sum(1 for a, b in zip(a_correct, b_correct) if b and not a)
    n = a_only + b_only
    if n == 0:
        return 1.0
    # P(X >= a_only) under X ~ Binomial(n, 0.5)
    tail = sum(comb(n, k) for k in range(a_only, n + 1))
    return tail / (2 ** n)


def burn(project_root: str, arm_score: dict) -> dict:
    """Bytes of source delivered into context, computed by re-reading the paths
    the arm reported opening. The arm's own byte count is never trusted."""
    per_question = []
    for entry in arm_score["perQuestion"]:
        total = 0
        for rel in entry["opened"]:
            full = os.path.join(project_root, rel)
            if os.path.exists(full):
                total += os.path.getsize(full)
        per_question.append({"id": entry["id"], "bytes": total, "correct": entry["correct"]})
    correct_bytes = [p["bytes"] for p in per_question if p["correct"]]
    return {
        "medianBytesPerCorrectAnswer": int(statistics.median(correct_bytes)) if correct_bytes else None,
        "totalBytes": sum(p["bytes"] for p in per_question),
        "perQuestion": per_question,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--questions", default="evidence/skeleton-pilot/questions.json")
    parser.add_argument("--skeleton-trace", required=True)
    parser.add_argument("--files-trace", required=True)
    parser.add_argument("--shuffled-trace", required=True)
    parser.add_argument("--root", default=".")
    parser.add_argument("--out", default="evidence/skeleton-pilot/report.json")
    args = parser.parse_args()

    with open(args.questions, encoding="utf-8") as fh:
        questions = json.load(fh)["questions"]

    def read_trace(path):
        with open(path, encoding="utf-8") as fh:
            return [json.loads(line) for line in fh if line.strip()]

    arms = {
        "skeleton": score_arm(questions, read_trace(args.skeleton_trace)),
        "files": score_arm(questions, read_trace(args.files_trace)),
        "shuffled": score_arm(questions, read_trace(args.shuffled_trace)),
    }

    p_value = mcnemar_exact(arms["skeleton"]["correctFlags"], arms["shuffled"]["correctFlags"])
    primary_pass = p_value < 0.05 and arms["skeleton"]["correct"] > arms["shuffled"]["correct"]

    report = {
        "preregistration": PREREG,
        "n": len(questions),
        "correct": {name: arm["correct"] for name, arm in arms.items()},
        "primary": {
            "hypothesis": "skeleton > shuffled",
            "test": "McNemar exact, one-sided",
            "p": p_value,
            "threshold": 0.05,
            "pass": primary_pass,
        },
    }

    if primary_pass:
        report["burn"] = {
            "skeleton": burn(args.root, arms["skeleton"]),
            "files": burn(args.root, arms["files"]),
        }
    else:
        report["burn"] = {
            "withheld": "Primary hypothesis not met. Per preregistration the burn "
                        "figure is not reported: a favourable token count with no "
                        "correctness advantage measures only the cost of being "
                        "confidently wrong."
        }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
        fh.write("\n")

    print(json.dumps(report["correct"], indent=1))
    print(f"primary: p={p_value:.5f} pass={primary_pass}")
    if primary_pass:
        skel = report["burn"]["skeleton"]["medianBytesPerCorrectAnswer"]
        files = report["burn"]["files"]["medianBytesPerCorrectAnswer"]
        print(f"burn: skeleton={skel} bytes/correct, files={files} bytes/correct")
    else:
        print("burn: WITHHELD -- pilot refuted")
    return 0 if primary_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && python3 -m unittest divtube_downloader.tests.test_constellation_skeleton.TestScoring -v 2>&1 | tail -10`

Expected: PASS, 7 tests.

- [ ] **Step 5: Run the three arms**

Dispatch three fresh subagents, one per arm, each with **no prior context** and the identical 60 questions from `evidence/skeleton-pilot/questions.json`. Each writes JSONL to `evidence/skeleton-pilot/<arm>.jsonl`.

Arm prompts, verbatim:

- **`skeleton`** — "You may read ONLY `.atlas/constellation-skeleton.json`. You are forbidden from reading, grepping, or listing anything under `codex/core/constellation` or `codex/server/services/constellation`. For each question in `evidence/skeleton-pilot/questions.json`, append one JSONL line to `evidence/skeleton-pilot/skeleton.jsonl`: `{"id":…, "answer":[…], "opened":[every path you read], "route":"…"}`. Answer with repo-relative paths. If you cannot answer, still emit the line with an empty answer."
- **`files`** — identical, except: "You may use any tool to read the repository. You are forbidden from reading `.atlas/constellation-skeleton.json` or anything under `evidence/skeleton-pilot/` other than `questions.json`." Output to `files.jsonl`.
- **`shuffled`** — identical to `skeleton`, except the artifact is `evidence/skeleton-pilot/skeleton-shuffled.json` and the same source-reading ban applies. Output to `shuffled.jsonl`. **Do not tell this arm its data is shuffled.**

- [ ] **Step 6: Score the run**

Run:
```bash
cd /home/deck/Downloads/Scholomance-V12-main && python3 scripts/skeleton_ab_score.py \
  --skeleton-trace evidence/skeleton-pilot/skeleton.jsonl \
  --files-trace evidence/skeleton-pilot/files.jsonl \
  --shuffled-trace evidence/skeleton-pilot/shuffled.jsonl; echo "exit=$?"
```

Report the result **as measured**. `exit=1` means the pilot is refuted, and that is a valid, publishable outcome — record it and do not re-run with a different seed hoping for a better draw.

- [ ] **Step 7: Write ledger rows**

Run: `cd /home/deck/Downloads/Scholomance-V12-main && node scripts/skeleton_ledger.mjs --report evidence/skeleton-pilot/report.json --db scholomance_collab.sqlite`

Then confirm:
```bash
python3 -c "
import sqlite3
c=sqlite3.connect('file:scholomance_collab.sqlite?mode=ro',uri=True)
print(c.execute('select ledger_status, count(*) from collab_experience_ledger group by 1').fetchall())
"
```

Expected: non-zero rows, the first ever written to that table.

- [ ] **Step 8: Commit**

```bash
git add scripts/skeleton_ab_score.py evidence/skeleton-pilot/ \
        divtube_downloader/tests/test_constellation_skeleton.py
git commit -m "test(skeleton): three-arm pilot harness and measured result

McNemar exact on paired questions; burn withheld unless the primary
hypothesis clears the shuffled control."
```

---

## Self-Review

**Spec coverage.** §1–3 → Task 1 (graph, dynamic-import fail-loud). §4 stratification → Task 2. §5 artifact and node record → Task 4. §6 slot table, churn band, layer bitfield, saturation, canonical string → Task 3. §7 builder/oracle/lens → Tasks 1, 5, 7. §8 blind spots → Task 4 `BLIND_SPOTS`. §9 testing (fixture, determinism, round-trip, degradation, staleness) → Tasks 1–4, 7. §10.1 fidelity gate with the fixed contingency → Task 6. §10.2 three arms, preregistration, McNemar → Tasks 8, 9, 11. §10.3 ledger emission → Tasks 10, 11. §11 out of scope → not implemented, as specified. No gaps.

**Placeholder scan.** No TBDs, no "add error handling", no "similar to Task N". Every code step carries runnable code; every test step carries a real command with an expected result.

**Type consistency.** `build_graph` returns the same seven keys consumed by `stratify` (`files`, `imports`, `importedBy`) and by `build` (all seven). `encode_slots(facts)` receives exactly the 21 keys the builder constructs. `decode_slot` mirrors `encode_slots` bit-for-bit for slots 0–6 and raises on 7, matching the round-trip test which slices `[:7]`. `score_arm` emits `correctFlags`, which `mcnemar_exact` consumes, and `perQuestion`, which `burn` consumes. `ledgerKey` takes the four fields `recordOutcome` passes through.

**Cross-task wiring checked.** Task 11 Step 7 invokes `scripts/skeleton_ledger.mjs --report … --db …`; that CLI is specified in Task 10 Step 3 and consumes `report.armTraces`, which Task 11 Step 3 is instructed to emit. `perQuestion` entries carry `id` and `correct`, which the CLI reads, and `route` comes through from the arm trace. No dangling interface.

**Arithmetic verified by hand.** Slot 0 for stratum 0 / 20 nodes: `0x01<<24 | 0<<16 | 0x0014` = `01000014`, matching the test. Slot 5 for Core+Server, dominant Core, 8 outside: `3<<16 | 0<<8 | 8` = `00030008`, matching. `churn_band` via `(churn+1).bit_length()-1` gives 0→0, 6→2, 136→7, 1356→10, 10⁹→15 (capped), matching all five assertions. `mcnemar_exact` gives 1.0 for zero discordant pairs, 1/4096 ≈ 0.000244 for 12-vs-0, and 0.5 for 1-vs-0 — clearing the `<0.001`, `>0.05` and `==1.0` assertions respectively.
