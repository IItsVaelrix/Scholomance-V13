# OEWN Antonym Ingest (Additive) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Additively ingest OEWN antonyms into `scholomance_dict.sqlite` so `lookupAntonyms` / Analyze Oppositions return real bidirectional evidence — without a full dict rebuild, without erasing non-OEWN antonyms, and without silent release mismatches.

**Architecture:** Shared pure projection module (`scripts/oewn_antonym_project.py`) parses OEWN LMF (SenseRelation + SynsetRelation antonyms), projects to synset pairs, applies reciprocal closure, and computes asserted-only resolution metrics. Additive CLI (`scripts/ingest_oewn_antonyms.py`) validates outside a write lock, then `BEGIN IMMEDIATE` → scoped delete `source='oewn'` antonyms → skip-on-manual-conflict insert → meta. Full builder reuses the same module for parity.

**Tech Stack:** Python 3 stdlib (`xml.etree.ElementTree`, `sqlite3`, `unittest`, `gzip`, `hashlib`); existing `scholomance_dict.sqlite` WordNet tables; Vitest only for optional live-DB smoke of `lookupAntonyms` after ingest.

**Spec:** `docs/superpowers/specs/2026-07-18-oewn-antonym-ingest-design.md`

## Global Constraints

- Scoped delete only: `DELETE FROM wordnet_rel WHERE rel = 'antonym' AND source = 'oewn'`
- Reciprocal closure required (`reverse: antonym`); then dedupe
- Caller `--timestamp` required for write mode; no wall-clock for stamped meta
- `--expected-release` required; abort on mismatch before writes
- Gate: `unresolved_ratio = unresolved_asserted_count / max(asserted_count, 1) <= max_unresolved_ratio`
- Resolution formula uses asserted metrics only — never `projected_count_after_closure`
- Preserve non-OEWN antonyms for the same synset pair; skip OEWN insert; count skips
- Do not add/alter a `wordnet_rel` UNIQUE constraint
- Parse+validate outside transaction; then `BEGIN IMMEDIATE` … `COMMIT`
- Streaming `iterparse`, reopen stream per pass, `elem.clear()`, LMF namespaces via `{*}Tag`
- Builder and CLI must produce identical antonym sets from the same fixture via the shared module

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `scripts/oewn_antonym_project.py` | Shared parse / project / reciprocal / metrics / apply helpers |
| `scripts/ingest_oewn_antonyms.py` | Additive CLI |
| `scripts/build_scholomance_dict.py` | Call shared module during OEWN ingest (SenseRelation + SynsetRelation) |
| `tests/fixtures/oewn-antonym-mini.xml` | Tiny LMF fixture |
| `tests/scripts/test_oewn_antonym_project.py` | unittest matrix (projection + CLI write behavior on temp DB) |
| `dict_data/README.md` | Ops note |
| `package.json` | `dict:ingest-antonyms` script |
| `tests/server/lexicon.antonyms.live.test.js` | Optional live smoke (skips if no antonym rows) |

---

### Task 1: Mini LMF fixture + pure projection unit tests (TDD)

**Files:**
- Create: `tests/fixtures/oewn-antonym-mini.xml`
- Create: `tests/scripts/test_oewn_antonym_project.py`
- Create: `scripts/oewn_antonym_project.py` (minimal to pass)

**Interfaces:**
- Produces:
  - `file_sha256(path: str) -> str`
  - `parse_oewn_antonyms(path: str) -> ParseResult` dataclass/namedtuple with:
    - `release: str`
    - `sense_to_synset: dict[str, str]`
    - `asserted_edges: list[tuple[str, str]]`  # directed sense-or-synset ends as synset ids when already synset-level; see notes
    - Actually prefer: asserted as list of `("sense"|"synset", src_id, tgt_id)` OR project inside parse — keep API as below
  - `project_antonyms(parse: ParseResult, existing_synsets: set[str]) -> ProjectionResult` with fields:
    - `asserted_count: int`
    - `resolved_asserted_count: int`
    - `unresolved_asserted_count: int`
    - `resolution_ratio: float`
    - `unresolved_ratio: float`
    - `projected_pairs: set[tuple[str, str]]`  # after reciprocal + dedupe
    - `projected_count_after_closure: int`
  - `PINNED_OEWN_URLS = {"2024": "https://en-word.net/static/english-wordnet-2024.xml.gz"}`

- [ ] **Step 1: Write the fixture**

Create `tests/fixtures/oewn-antonym-mini.xml` (no namespace prefixes required if using `{*}` matching; include `Lexicon version="2024"`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LexicalResource>
  <Lexicon id="oewn" label="Open English WordNet" language="en" version="2024">
    <LexicalEntry id="oewn-hot-a">
      <Lemma writtenForm="hot" partOfSpeech="a"/>
      <Sense id="oewn-hot-1" synset="oewn-syn-hot">
        <SenseRelation relType="antonym" target="oewn-cold-1"/>
      </Sense>
    </LexicalEntry>
    <LexicalEntry id="oewn-cold-a">
      <Lemma writtenForm="cold" partOfSpeech="a"/>
      <Sense id="oewn-cold-1" synset="oewn-syn-cold">
        <SenseRelation relType="antonym" target="oewn-hot-1"/>
      </Sense>
    </LexicalEntry>
    <LexicalEntry id="oewn-good-a">
      <Lemma writtenForm="good" partOfSpeech="a"/>
      <Sense id="oewn-good-1" synset="oewn-syn-good">
        <SenseRelation relType="antonym" target="oewn-bad-missing"/>
      </Sense>
    </LexicalEntry>
    <Synset id="oewn-syn-hot" partOfSpeech="a">
      <Definition>having a high temperature</Definition>
    </Synset>
    <Synset id="oewn-syn-cold" partOfSpeech="a">
      <Definition>having a low temperature</Definition>
      <SynsetRelation relType="antonym" target="oewn-syn-hot"/>
    </Synset>
    <Synset id="oewn-syn-good" partOfSpeech="a">
      <Definition>morally excellent</Definition>
    </Synset>
  </Lexicon>
</LexicalResource>
```

Notes for implementer:
- Asserted edges = every SenseRelation antonym **plus** every SynsetRelation antonym (fixture includes both for hot/cold).
- `oewn-bad-missing` has no Sense and no synset → contributes to `unresolved_asserted_count`.
- When counting asserted edges, count each XML-directed edge once (SenseRelation hot→cold, SenseRelation cold→hot, SynsetRelation cold→hot = 3 asserted in this fixture).

- [ ] **Step 2: Write failing unittest**

```python
# tests/scripts/test_oewn_antonym_project.py
import os
import sys
import tempfile
import unittest
import sqlite3

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from oewn_antonym_project import (  # noqa: E402
    parse_oewn_antonyms,
    project_antonyms,
    apply_oewn_antonyms,
)

FIXTURE = os.path.join(ROOT, "tests", "fixtures", "oewn-antonym-mini.xml")


class TestProject(unittest.TestCase):
    def test_parse_release(self):
        parsed = parse_oewn_antonyms(FIXTURE)
        self.assertEqual(parsed.release, "2024")

    def test_resolution_metrics_use_asserted_not_projected(self):
        # Fixture lock: 3 SenseRelation antonyms + 1 SynsetRelation antonym = 4 asserted.
        # good→oewn-bad-missing is unresolved → resolved=3, unresolved=1.
        parsed = parse_oewn_antonyms(FIXTURE)
        existing = {"oewn-syn-hot", "oewn-syn-cold", "oewn-syn-good"}
        proj = project_antonyms(parsed, existing)
        self.assertEqual(proj.asserted_count, 4)
        self.assertEqual(proj.resolved_asserted_count, 3)
        self.assertEqual(proj.unresolved_asserted_count, 1)
        self.assertEqual(proj.unresolved_ratio, 1 / 4)
        self.assertEqual(proj.resolution_ratio, 3 / 4)
        self.assertIn(("oewn-syn-hot", "oewn-syn-cold"), proj.projected_pairs)
        self.assertIn(("oewn-syn-cold", "oewn-syn-hot"), proj.projected_pairs)
        # Reciprocal closure is an output statistic; must not feed the ratio.
        self.assertEqual(proj.projected_count_after_closure, len(proj.projected_pairs))
        self.assertGreaterEqual(proj.projected_count_after_closure, 2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run to verify fail**

Run: `python3 -m unittest tests.scripts.test_oewn_antonym_project -v`  
(from repo root; if import path fails, run `cd tests && python3 -m unittest scripts.test_oewn_antonym_project -v` after adjusting `sys.path` — prefer running as:)

```bash
cd /home/deck/Downloads/Scholomance-V12-main
PYTHONPATH=scripts python3 -m unittest tests.scripts.test_oewn_antonym_project -v
```

Expected: FAIL (module missing or functions missing).

- [ ] **Step 4: Implement `scripts/oewn_antonym_project.py` (parse + project only)**

Implement:

```python
# scripts/oewn_antonym_project.py
from __future__ import annotations

import gzip
import hashlib
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

PINNED_OEWN_URLS = {
    "2024": "https://en-word.net/static/english-wordnet-2024.xml.gz",
}

def strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag

def open_maybe_gzip(path: str):
    # Mirror build_scholomance_dict.open_maybe_gzip behavior (import or duplicate small helper)
    ...

def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

@dataclass
class ParseResult:
    release: str
    sense_to_synset: dict[str, str]
    # list of ("sense"|"synset", src_id, tgt_id) raw asserted edges
    asserted: list[tuple[str, str, str]]

@dataclass
class ProjectionResult:
    asserted_count: int
    resolved_asserted_count: int
    unresolved_asserted_count: int
    resolution_ratio: float
    unresolved_ratio: float
    projected_pairs: set[tuple[str, str]]
    projected_count_after_closure: int

def parse_oewn_antonyms(path: str) -> ParseResult:
    """Two streaming passes: reopen file each pass. Pass1 Lexicon+Sense map; Pass2 relations."""
    ...

def project_antonyms(parsed: ParseResult, existing_synsets: set[str]) -> ProjectionResult:
    """Resolve asserted edges to synset pairs; reciprocal closure; metrics from asserted only."""
    ...
```

Pass details:
1. Pass 1: on `Lexicon` end (or start attrs): read `version` → `release`. On each `Sense`: map `id` → `synset` attr. `elem.clear()`.
2. Pass 2: on `Sense` collect child `SenseRelation` with `relType=="antonym"`; on `Synset` collect `SynsetRelation` antonym. Reopen stream.

- [ ] **Step 5: Run tests — pass**

```bash
PYTHONPATH=scripts python3 -m unittest tests.scripts.test_oewn_antonym_project -v
```

Expected: PASS for Task 1 tests.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/oewn-antonym-mini.xml tests/scripts/test_oewn_antonym_project.py scripts/oewn_antonym_project.py
git commit -m "feat(dict): OEWN antonym projection module + fixture tests"
```

---

### Task 2: Apply writer — scoped delete, skip conflicts, meta, gates

**Files:**
- Modify: `scripts/oewn_antonym_project.py` — add `apply_oewn_antonyms(...)`
- Modify: `tests/scripts/test_oewn_antonym_project.py` — write-path tests

**Interfaces:**
- Produces: `apply_oewn_antonyms(conn, projection, *, release, source_url, source_sha256, timestamp, max_unresolved_ratio=0.02) -> ApplyResult`
  - Raises `ValueError` / custom `AntonymIngestError` **before** `BEGIN` if `unresolved_ratio > max_unresolved_ratio`
  - `ApplyResult`: `inserted_count`, `skipped_existing_count`, plus echo of projection metrics
- Consumes: `ProjectionResult`

- [ ] **Step 1: Write failing tests** for apply behavior on a temp SQLite DB with WordNet schema stub:

```python
def _make_db():
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
    CREATE TABLE wordnet_synset(id TEXT PRIMARY KEY, pos TEXT, lexname TEXT, definition TEXT, examples_json TEXT, source TEXT, source_url TEXT);
    CREATE TABLE wordnet_rel(synset_id TEXT NOT NULL, rel TEXT NOT NULL, target_synset_id TEXT NOT NULL, source TEXT NOT NULL, source_url TEXT);
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO wordnet_synset(id, pos, lexname, definition, examples_json, source, source_url)
      VALUES ('oewn-syn-hot','a',NULL,'hot','[]','oewn','https://en-word.net/'),
             ('oewn-syn-cold','a',NULL,'cold','[]','oewn','https://en-word.net/'),
             ('oewn-syn-good','a',NULL,'good','[]','oewn','https://en-word.net/');
    INSERT INTO wordnet_rel VALUES ('oewn-syn-hot','antonym','oewn-syn-cold','oewn','https://en-word.net/');
    INSERT INTO wordnet_rel VALUES ('oewn-syn-hot','antonym','oewn-syn-cold','manual','manual');
    INSERT INTO wordnet_rel VALUES ('oewn-syn-hot','similar','oewn-syn-good','oewn','https://en-word.net/');
    """)
    return conn

class TestApply(unittest.TestCase):
    def test_scoped_delete_preserves_manual_and_similar(self):
        conn = _make_db()
        parsed = parse_oewn_antonyms(FIXTURE)
        existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
        proj = project_antonyms(parsed, existing)
        # Use high max_unresolved so fixture's 1/4 unresolved can pass or set threshold 0.3
        apply_oewn_antonyms(
            conn, proj,
            release="2024",
            source_url="file://fixture",
            source_sha256="abc",
            timestamp="2026-07-18T09:00:00Z",
            max_unresolved_ratio=0.5,
        )
        manuals = list(conn.execute(
            "SELECT * FROM wordnet_rel WHERE rel='antonym' AND source='manual'"))
        self.assertEqual(len(manuals), 1)
        similars = list(conn.execute(
            "SELECT * FROM wordnet_rel WHERE rel='similar' AND source='oewn'"))
        self.assertEqual(len(similars), 1)
        # OEWN insert for hot→cold skipped because manual exists
        oewn_hot_cold = list(conn.execute(
            """SELECT * FROM wordnet_rel WHERE rel='antonym' AND source='oewn'
               AND synset_id='oewn-syn-hot' AND target_synset_id='oewn-syn-cold'"""))
        self.assertEqual(len(oewn_hot_cold), 0)
        # reverse cold→hot may insert if no manual
        meta = dict(conn.execute("SELECT key,value FROM meta"))
        self.assertEqual(meta["oewn_antonym_ingested_at"], "2026-07-18T09:00:00Z")
        self.assertGreaterEqual(int(meta["oewn_antonym_skipped_existing_count"]), 1)

    def test_unresolved_gate_aborts_before_writes(self):
        conn = _make_db()
        before = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        parsed = parse_oewn_antonyms(FIXTURE)
        existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
        proj = project_antonyms(parsed, existing)
        with self.assertRaises(Exception):
            apply_oewn_antonyms(
                conn, proj,
                release="2024", source_url="x", source_sha256="y",
                timestamp="2026-07-18T09:00:00Z",
                max_unresolved_ratio=0.0,  # force abort if any unresolved
            )
        after = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        self.assertEqual(before, after)
```

- [ ] **Step 2: Run — fail**

```bash
PYTHONPATH=scripts python3 -m unittest tests.scripts.test_oewn_antonym_project.TestApply -v
```

- [ ] **Step 3: Implement `apply_oewn_antonyms`**

Logic:

```python
def apply_oewn_antonyms(conn, proj, *, release, source_url, source_sha256, timestamp, max_unresolved_ratio=0.02):
    if not timestamp:
        raise ValueError("timestamp is required")
    if proj.unresolved_ratio > max_unresolved_ratio:
        raise ValueError(
            f"unresolved_ratio {proj.unresolved_ratio} exceeds {max_unresolved_ratio}"
        )
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "DELETE FROM wordnet_rel WHERE rel = 'antonym' AND source = 'oewn'"
        )
        existing_non_oewn = {
            (r[0], r[1])
            for r in conn.execute(
                "SELECT synset_id, target_synset_id FROM wordnet_rel "
                "WHERE rel = 'antonym' AND source != 'oewn'"
            )
        }
        inserted = 0
        skipped = 0
        for a, b in sorted(proj.projected_pairs):
            if (a, b) in existing_non_oewn:
                skipped += 1
                continue
            conn.execute(
                "INSERT INTO wordnet_rel(synset_id, rel, target_synset_id, source, source_url) "
                "VALUES (?, 'antonym', ?, 'oewn', ?)",
                (a, b, source_url),
            )
            inserted += 1
        meta = {
            "oewn_antonym_release": release,
            "oewn_antonym_source_url": source_url,
            "oewn_antonym_source_sha256": source_sha256,
            "oewn_antonym_asserted_count": str(proj.asserted_count),
            "oewn_antonym_resolved_asserted_count": str(proj.resolved_asserted_count),
            "oewn_antonym_unresolved_asserted_count": str(proj.unresolved_asserted_count),
            "oewn_antonym_resolution_ratio": repr(proj.resolution_ratio),
            "oewn_antonym_unresolved_ratio": repr(proj.unresolved_ratio),
            "oewn_antonym_projected_count": str(proj.projected_count_after_closure),
            "oewn_antonym_inserted_count": str(inserted),
            "oewn_antonym_skipped_existing_count": str(skipped),
            "oewn_antonym_ingested_at": timestamp,
        }
        for k, v in meta.items():
            conn.execute(
                "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", (k, v)
            )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
```

- [ ] **Step 4: Run — pass**

```bash
PYTHONPATH=scripts python3 -m unittest tests.scripts.test_oewn_antonym_project -v
```

- [ ] **Step 5: Commit**

```bash
git add scripts/oewn_antonym_project.py tests/scripts/test_oewn_antonym_project.py
git commit -m "feat(dict): apply OEWN antonyms with scoped delete and conflict skips"
```

---

### Task 3: Additive CLI

**Files:**
- Create: `scripts/ingest_oewn_antonyms.py`
- Modify: `tests/scripts/test_oewn_antonym_project.py` (CLI subprocess tests)
- Modify: `package.json` — add script
- Modify: `dict_data/README.md`

**Interfaces:**
- CLI args: `--db`, `--oewn_path`, `--expected-release`, `--timestamp`, `--download` (optional), `--max-unresolved-ratio` (default `0.02`)
- Exit non-zero on: missing timestamp, missing path, release mismatch, unresolved gate, malformed XML

- [ ] **Step 1: Write failing CLI tests**

```python
import subprocess

class TestCLI(unittest.TestCase):
    def test_missing_timestamp_rejects(self):
        r = subprocess.run(
            [sys.executable, os.path.join(ROOT, "scripts", "ingest_oewn_antonyms.py"),
             "--db", ":memory:", "--oewn_path", FIXTURE, "--expected-release", "2024"],
            capture_output=True, text=True,
        )
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("timestamp", (r.stderr + r.stdout).lower())

    def test_release_mismatch_no_writes(self):
        # create on-disk temp db with schema + similar row; run with --expected-release 2025
        ...
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement CLI**

```python
# scripts/ingest_oewn_antonyms.py
#!/usr/bin/env python3
"""Additive OEWN antonym ingest. See docs/superpowers/specs/2026-07-18-oewn-antonym-ingest-design.md"""
import argparse, os, sqlite3, sys, urllib.request
from oewn_antonym_project import (
    PINNED_OEWN_URLS, file_sha256, parse_oewn_antonyms, project_antonyms, apply_oewn_antonyms,
)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="scholomance_dict.sqlite")
    ap.add_argument("--oewn_path", required=True)
    ap.add_argument("--expected-release", required=True)
    ap.add_argument("--timestamp", required=True)
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--max-unresolved-ratio", type=float, default=0.02)
    args = ap.parse_args()

    path = args.oewn_path
    if not os.path.exists(path):
        if not args.download:
            sys.exit(f"ERROR: OEWN not found at {path}")
        url = PINNED_OEWN_URLS.get(args.expected_release)
        if not url:
            sys.exit(f"ERROR: no pinned URL for release {args.expected_release}")
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        urllib.request.urlretrieve(url, path)

    sha = file_sha256(path)
    parsed = parse_oewn_antonyms(path)
    if parsed.release != args.expected_release:
        sys.exit(
            f"ERROR: OEWN release {parsed.release!r} != expected {args.expected_release!r}"
        )

    conn = sqlite3.connect(args.db)
    try:
        existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
        proj = project_antonyms(parsed, existing)
        url = PINNED_OEWN_URLS.get(args.expected_release, f"file://{os.path.abspath(path)}")
        result = apply_oewn_antonyms(
            conn, proj,
            release=parsed.release,
            source_url=url,
            source_sha256=sha,
            timestamp=args.timestamp,
            max_unresolved_ratio=args.max_unresolved_ratio,
        )
        print(
            f"inserted={result.inserted_count} skipped_existing={result.skipped_existing_count} "
            f"asserted={proj.asserted_count} unresolved_ratio={proj.unresolved_ratio}"
        )
    finally:
        conn.close()

if __name__ == "__main__":
    main()
```

Note: argparse `required=True` on `--timestamp` satisfies “missing timestamp rejects write mode”. Release check happens **after parse, before apply** (no writes).

- [ ] **Step 4: Wire package.json + README**

```json
"dict:ingest-antonyms": "python3 scripts/ingest_oewn_antonyms.py --db scholomance_dict.sqlite --oewn_path dict_data/english-wordnet-2024.xml.gz --expected-release 2024"
```

Document in `dict_data/README.md` that `--timestamp` must be supplied by the caller, e.g.:

```bash
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
npm run dict:ingest-antonyms -- --timestamp "$TS" --download
```

- [ ] **Step 5: Run all Python tests — pass**

```bash
PYTHONPATH=scripts python3 -m unittest tests.scripts.test_oewn_antonym_project -v
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest_oewn_antonyms.py tests/scripts/test_oewn_antonym_project.py package.json dict_data/README.md
git commit -m "feat(dict): additive OEWN antonym ingest CLI"
```

---

### Task 4: Builder parity via shared module

**Files:**
- Modify: `scripts/build_scholomance_dict.py` — after OEWN synset/lemma ingest (or integrated), call shared projection for antonyms; **or** during `ingest_oewn_xml`, stop inserting SynsetRelation antonyms ad-hoc and instead run `parse_oewn_antonyms` + `apply_oewn_antonyms` at end of OEWN step against the just-built tables
- Modify: `tests/scripts/test_oewn_antonym_project.py` — parity test

**Interfaces:**
- Consumes: `parse_oewn_antonyms`, `project_antonyms`, `apply_oewn_antonyms`
- Produces: identical `wordnet_rel` antonym `source='oewn'` set as CLI for the same XML + same synset universe

Recommended approach (minimal risk to existing synset-rel ingest):
1. Keep existing SynsetRelation ingest for **non-antonym** rels unchanged.
2. When collecting SynsetRelation, **skip** `rel == "antonym"` in the old path (so antonyms are not double-inserted without reciprocal).
3. After `ingest_oewn_xml` completes synsets+lemmas+non-antonym rels, call:

```python
from oewn_antonym_project import parse_oewn_antonyms, project_antonyms, apply_oewn_antonyms, file_sha256, PINNED_OEWN_URLS
parsed = parse_oewn_antonyms(args.oewn_path)
existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
proj = project_antonyms(parsed, existing)
apply_oewn_antonyms(
    conn, proj,
    release=parsed.release,
    source_url="https://en-word.net/",
    source_sha256=file_sha256(args.oewn_path),
    timestamp=os.environ.get("SCHOLOMANCE_DICT_BUILT_AT")  # BAD — do not use env clock
)
```

Builder today uses `time.time()` for `built_at` — **do not** invent a new wall-clock for antonym meta. For full rebuilds, accept an optional `--antonym-timestamp` argparse (required when writing antonyms) **or** reuse a new required `--timestamp` flag on the builder for antonym meta only. Prefer adding:

```python
ap.add_argument("--antonym-timestamp", required=False,
                help="ISO timestamp for oewn_antonym_ingested_at (required to write OEWN antonyms)")
```

If `--antonym-timestamp` omitted on full build: skip antonym apply and print a clear warning (keeps old rebuilds working) **OR** require it — choose **require when OEWN path present** so antonyms always land:

```python
if not args.antonym_timestamp:
    sys.exit("ERROR: --antonym-timestamp is required to stamp OEWN antonyms")
```

- [ ] **Step 1: Parity test**

```python
def test_builder_helper_matches_cli_projection_set(self):
    # Same parse+project from fixture; two apply paths on fresh DBs → identical antonym oewn rows
    ...
```

(If builder wiring is only “call apply after ingest”, parity of **projection set** is enough: `project_antonyms` is shared — assert CLI and builder both call it; test that skipping SynsetRelation antonym in old path + apply produces the reciprocal set.)

- [ ] **Step 2: Implement builder wiring**

- [ ] **Step 3: Run unittest — pass**

- [ ] **Step 4: Commit**

```bash
git add scripts/build_scholomance_dict.py tests/scripts/test_oewn_antonym_project.py
git commit -m "feat(dict): builder uses shared OEWN antonym projection"
```

---

### Task 5: Live ingest against `scholomance_dict.sqlite` + Analyze smoke

**Files:** none required (ops); optional `tests/server/lexicon.antonyms.live.test.js`

- [ ] **Step 1: Download OEWN 2024 if missing**

```bash
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
python3 scripts/ingest_oewn_antonyms.py \
  --db scholomance_dict.sqlite \
  --oewn_path dict_data/english-wordnet-2024.xml.gz \
  --expected-release 2024 \
  --timestamp "$TS" \
  --download
```

Expected: prints `inserted=…` with large counts; `unresolved_ratio` ≤ `0.02`.

- [ ] **Step 2: Verify DB**

```bash
node -e "
const D=require('better-sqlite3');
const db=new D('scholomance_dict.sqlite',{readonly:true});
console.log('antonym', db.prepare(\"select count(*) c from wordnet_rel where rel='antonym'\").get());
console.log('oewn ant', db.prepare(\"select count(*) c from wordnet_rel where rel='antonym' and source='oewn'\").get());
console.log(db.prepare(\"select key,value from meta where key like 'oewn_antonym%'\").all());
"
```

Expected: antonym count ≫ 0; meta keys present.

- [ ] **Step 3: Reciprocal adapter check**

```bash
node -e "
const { createLexiconAdapter } = require('./codex/server/adapters/lexicon.sqlite.adapter.js');
const a = createLexiconAdapter('scholomance_dict.sqlite');
const hot = a.lookupAntonyms('hot', 20);
const cold = a.lookupAntonyms('cold', 20);
console.log({hot, cold});
if (!hot.includes('cold') || !cold.includes('hot')) process.exit(1);
a.close();
"
```

Expected: exit 0.

- [ ] **Step 4: Analyze route smoke** (API must be running current code on `:8080`)

```bash
curl -sS -X POST http://127.0.0.1:8080/api/lexical/analyze \
  -H 'content-type: application/json' \
  -d '{"query":"hot"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const o=j.groups.find(g=>g.key==='oppositions'); if(!o||!o.items.length){console.error(o); process.exit(1)}; console.log('oppositions', o.items.slice(0,5));})"
```

Expected: non-empty Oppositions items.

- [ ] **Step 5: Idempotence**

Re-run Step 1 with a new `--timestamp`. Confirm `oewn` antonym count unchanged; non-antonym `wordnet_rel` count unchanged:

```bash
node -e "
const D=require('better-sqlite3');
const db=new D('scholomance_dict.sqlite',{readonly:true});
console.log(db.prepare(\"select count(*) c from wordnet_rel where rel!='antonym'\").get());
"
```

- [ ] **Step 6: Optional live vitest**

```js
// tests/server/lexicon.antonyms.live.test.js
import { describe, it, expect } from 'vitest';
import { createLexiconAdapter } from '../../codex/server/adapters/lexicon.sqlite.adapter.js';

const DB = 'scholomance_dict.sqlite';

describe('live antonyms', () => {
  it('hot↔cold when OEWN antonyms ingested', () => {
    const a = createLexiconAdapter(DB);
    const n = a.lookupAntonyms('hot', 1);
    if (n.length === 0) { a.close(); return; } // skip-soft if not ingested in CI
    expect(a.lookupAntonyms('hot', 20)).toContain('cold');
    expect(a.lookupAntonyms('cold', 20)).toContain('hot');
    a.close();
  });
});
```

- [ ] **Step 7: Commit** only code/docs from this task (not the sqlite DB — it is gitignored). If only ops verification, skip commit or commit the optional live test + any README tweaks:

```bash
git add tests/server/lexicon.antonyms.live.test.js dict_data/README.md
git commit -m "test(dict): live antonym reciprocity smoke"
```

---

### Task 6: Full QA matrix sign-off

**Files:** none (verification).

Run and record results in `.superpowers/sdd/` or the commit message:

| # | Check | Command / evidence |
|---|-------|-------------------|
| 1 | Reciprocal hot↔cold | Task 5 Step 3 |
| 2 | Manual survives | unittest `test_scoped_delete_preserves_manual_and_similar` |
| 2b | Skip conflicting OEWN | same test — `skipped_existing_count` / no OEWN hot→cold |
| 3 | Release mismatch | CLI test `--expected-release 2025` |
| 4 | Unresolved gate | `test_unresolved_gate_aborts_before_writes` |
| 4b | Metrics formula | `test_resolution_metrics_use_asserted_not_projected` |
| 5 | Malformed XML | unittest with truncated XML file → DB unchanged |
| 6 | Missing timestamp | CLI test |
| 7 | Builder/CLI identical projection | Task 4 parity test |
| 8 | Repeated execution identical | Task 5 Step 5 |
| 9 | Non-antonym counts stable | Task 5 Step 5 |
| 10 | No UNIQUE added | `pragma index_list(wordnet_rel)` still no unique |

- [ ] **Step 1: Add malformed-XML unittest if not already in Task 2/3**

```python
def test_malformed_xml_leaves_db_unchanged(self):
    conn = _make_db()
    before = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
    bad = tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False)
    bad.write("<LexicalResource><Lexicon version='2024'>BROKEN")
    bad.close()
    with self.assertRaises(Exception):
        parse_oewn_antonyms(bad.name)
    after = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
    self.assertEqual(before, after)
```

- [ ] **Step 2: Run full unittest suite — all pass**

```bash
PYTHONPATH=scripts python3 -m unittest tests.scripts.test_oewn_antonym_project -v
```

- [ ] **Step 3: Final commit if any QA test additions**

```bash
git add tests/scripts/test_oewn_antonym_project.py
git commit -m "test(dict): complete OEWN antonym ingest QA matrix"
```

---

## Self-Review notes

- **Spec coverage:** scoped delete → Task 2; reciprocal → Task 1/5; release/sha/timestamp → Task 3; unresolved gate + metrics → Task 1–2; conflict skip → Task 2; builder parity → Task 4; live Analyze → Task 5; QA matrix → Task 6; no UNIQUE change → Task 6 check 10.
- **Placeholder scan:** fixture asserted counts are locked in Task 1 notes (`asserted=4`, `resolved=3`, `unresolved=1`); implementer must align the unittest integers to that lock.
- **Type consistency:** `ParseResult` / `ProjectionResult` / `apply_oewn_antonyms` signatures are stable across Tasks 1–4.
- **Out of scope preserved:** sense-aware Analyze UI deferred.
