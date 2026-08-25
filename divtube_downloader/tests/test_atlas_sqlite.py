"""Differential: a sqlite-backed atlas must answer exactly like the JSON one.

The JSON backend is the oracle. Every question a lens can ask -- refs,
prefix, file_info, dir_rollup, meta -- is put to both backends over the
SAME payload, and any disagreement is a defect in the new backend.

Why differential and not hand-written expectations: hand-written cases
inherit the author's blind spots. The real atlas carries 6,778 files and
201,953 tokens of idioms nobody would think to write down -- hyphenated
queries, tokens that appear in one file, tokens that appear in hundreds,
paths with unicode, empty rollups. Sampling it is the only way to test
against inputs I did not choose.

The sample is SEEDED so a failure is reproducible.
"""

import json
import os
import random
import tempfile
import unittest

from tui.services import code_atlas

# Imported unguarded ON PURPOSE. A try/except here would turn "the backend
# is missing or broken" into 14 silent skips, and a suite that skips is not
# a suite that passes. If this import fails, the run must go red.
from tui.services import atlas_sqlite

HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(DIVTUBE_ROOT, ".."))
REAL_ATLAS = os.path.join(PROJECT_ROOT, code_atlas.ATLAS_REL_PATH)

SAMPLE_TOKENS = 400
SAMPLE_FILES = 300
SEED = 20260825


def _load_real_payload():
    if not os.path.exists(REAL_ATLAS):
        return None
    with open(REAL_ATLAS, "r", encoding="utf-8") as fh:
        return json.load(fh)


class TestSqliteMatchesJson(unittest.TestCase):
    """The real atlas is the corpus. Skipped only if it has never been built."""

    @classmethod
    def setUpClass(cls):
        cls.payload = _load_real_payload()
        if cls.payload is None:
            raise unittest.SkipTest(f"no atlas at {REAL_ATLAS}; run scripts/atlas_rebuild.py")
        cls.json_atlas = code_atlas.CodeAtlas(cls.payload)
        cls.json_atlas._project_root = PROJECT_ROOT
        cls.tmp = tempfile.TemporaryDirectory()
        cls.db_path = os.path.join(cls.tmp.name, "atlas.sqlite3")
        atlas_sqlite.build_sqlite(cls.payload, cls.db_path)
        cls.sq = atlas_sqlite.SqliteAtlas(cls.db_path)
        cls.sq._project_root = PROJECT_ROOT
        rng = random.Random(SEED)
        toks = list(cls.payload["postings"].keys())
        cls.tokens = rng.sample(toks, min(SAMPLE_TOKENS, len(toks)))
        paths = [r["path"] for r in cls.payload["files"]]
        cls.paths = rng.sample(paths, min(SAMPLE_FILES, len(paths)))

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, "tmp", None):
            cls.tmp.cleanup()

    def test_refs_identical(self):
        mismatches = []
        for tok in self.tokens:
            a = self.json_atlas.refs(tok)
            b = self.sq.refs(tok)
            if a != b:
                mismatches.append((tok, len(a), len(b)))
        self.assertEqual(mismatches, [], f"{len(mismatches)} tokens disagree")

    def test_refs_respects_max_files(self):
        for tok in self.tokens[:50]:
            self.assertEqual(
                self.json_atlas.refs(tok, max_files=3),
                self.sq.refs(tok, max_files=3),
                f"max_files disagreement on {tok!r}",
            )

    def test_refs_rejects_same_queries(self):
        # Malformed queries must be refused identically, not merely be empty.
        for bad in ["", "   ", "a b", "a.b", "-lead", "trail-", "a--b", "*"]:
            self.assertEqual(
                self.json_atlas.refs(bad), self.sq.refs(bad),
                f"disagreement rejecting {bad!r}",
            )

    def test_refs_hyphenated(self):
        # Hyphen queries intersect runs then verify the literal on disk --
        # the one path where postings alone are not sufficient.
        toks = [t for t in self.payload["postings"] if len(t) > 3][:60]
        pairs = [f"{a}-{b}" for a, b in zip(toks[::2], toks[1::2])]
        real = [r["path"] for r in self.payload["files"] if "-" in os.path.basename(r["path"])]
        for p in real[:20]:
            stem = os.path.basename(p).rsplit(".", 1)[0]
            if code_atlas._HYPHEN_QUERY_RE.match(stem):
                pairs.append(stem)
        for q in pairs:
            self.assertEqual(
                self.json_atlas.refs(q), self.sq.refs(q),
                f"hyphen disagreement on {q!r}",
            )

    def test_refs_hyphen_without_project_root(self):
        """The intersect must be right on its own, not rescued downstream.

        With a project root set, `_contains_literal` re-checks each candidate
        on disk and quietly repairs a broken posting-list intersection --
        masking the bug. Without a root both backends keep every candidate,
        so the intersection is the only thing deciding the answer. A mutant
        that unions instead of intersects survives the other tests and dies
        here.
        """
        rootless_json = code_atlas.CodeAtlas(self.payload)
        rootless_sq = atlas_sqlite.SqliteAtlas(self.db_path)
        self.assertIsNone(getattr(rootless_json, "_project_root", None))
        self.assertIsNone(getattr(rootless_sq, "_project_root", None))

        postings = self.payload["postings"]
        common = sorted(postings, key=lambda t: -len(postings[t]))[:12]
        queries = [f"{a}-{b}" for a in common[:6] for b in common[6:]]
        checked = 0
        for q in queries:
            if not code_atlas._HYPHEN_QUERY_RE.match(q):
                continue
            a, b = q.split("-")
            # Only meaningful where union and intersection actually differ.
            if set(postings[a]) == set(postings[b]):
                continue
            checked += 1
            self.assertEqual(
                rootless_json.refs(q, max_files=10_000),
                rootless_sq.refs(q, max_files=10_000),
                f"rootless hyphen disagreement on {q!r}",
            )
        self.assertGreater(checked, 0, "no query exercised the intersection")

        # A run that is absent from the postings must kill the whole query.
        # With a project root the literal check would hide a backend that
        # merely skips the missing run; rootless, nothing hides it.
        absent = "qqzzxx_not_a_token_in_this_repo"
        self.assertNotIn(absent, postings)
        for q in (f"{common[0]}-{absent}", f"{absent}-{common[0]}", f"{absent}-{absent}"):
            self.assertEqual(
                rootless_json.refs(q, max_files=10_000),
                rootless_sq.refs(q, max_files=10_000),
                f"absent-run disagreement on {q!r}",
            )

    def test_prefix_scan_is_bounded(self):
        """prefix() must stop at the first non-match, not scan 201,953 rows.

        Correctness alone cannot catch this: matches are contiguous, so a
        scan that never breaks returns the identical list. Only the cost
        separates them.

        A common prefix cannot show this: it fills `limit` immediately and
        the limit-break hides the missing match-break. The scan only runs
        away when matches are FEWER than the limit, so the probe is a
        zero-match prefix positioned at the very start of the token table --
        worst case for a scan that refuses to stop.
        """
        import time
        first = min(self.payload["postings"])
        pref = first + "zzqqxx"          # sorts just after `first`, matches nothing
        self.assertEqual(self.sq.prefix(pref), [], "probe must match nothing")
        t = time.perf_counter()
        for _ in range(10):
            self.sq.prefix(pref)
        elapsed_ms = (time.perf_counter() - t) * 1000 / 10
        self.assertLess(elapsed_ms, 15.0,
                        f"zero-match prefix averaged {elapsed_ms:.1f}ms; scan is unbounded")

    def test_prefix_identical(self):
        mismatches = []
        for tok in self.tokens:
            for n in (1, 3, 6):
                pref = tok[:n]
                if not pref:
                    continue
                a = self.json_atlas.prefix(pref)
                b = self.sq.prefix(pref)
                if a != b:
                    mismatches.append(pref)
        self.assertEqual(mismatches, [], f"{len(mismatches)} prefixes disagree")

    def test_prefix_respects_limit(self):
        for tok in self.tokens[:50]:
            self.assertEqual(
                self.json_atlas.prefix(tok[:2], limit=5),
                self.sq.prefix(tok[:2], limit=5),
            )

    def test_prefix_empty_query(self):
        self.assertEqual(self.json_atlas.prefix(""), self.sq.prefix(""))
        self.assertEqual(self.json_atlas.prefix("   "), self.sq.prefix("   "))

    def test_file_info_identical(self):
        for p in self.paths:
            self.assertEqual(
                self.json_atlas.file_info(p), self.sq.file_info(p),
                f"file_info disagreement on {p}",
            )

    def test_file_info_missing_is_none(self):
        for p in ["nope/not/here.py", "", "."]:
            self.assertEqual(self.json_atlas.file_info(p), self.sq.file_info(p))

    def test_dir_rollup_identical(self):
        dirs = {os.path.dirname(p) for p in self.paths}
        dirs |= {"", ".", "src", "scripts", "divtube_downloader", "codex"}
        for d in sorted(dirs):
            self.assertEqual(
                self.json_atlas.dir_rollup(d), self.sq.dir_rollup(d),
                f"dir_rollup disagreement on {d!r}",
            )

    def test_meta_identical(self):
        self.assertEqual(self.json_atlas.meta, self.sq.meta)

    def test_verify_agrees(self):
        # Integrity is a design law, not an optimization to trade away.
        self.assertEqual(self.json_atlas.verify(), self.sq.verify())

    def test_verify_is_not_vacuous(self):
        """A checksum check that cannot fail is not a checksum check.

        Corrupt one telemetry value in the DB and verify() must go False.
        If this passes on a tampered database the guarantee is theatre.
        """
        import shutil
        import sqlite3
        tampered = os.path.join(self.tmp.name, "tampered.sqlite3")
        shutil.copy(self.db_path, tampered)
        con = sqlite3.connect(tampered)
        row = con.execute("SELECT path FROM files ORDER BY idx LIMIT 1").fetchone()
        con.execute(
            "UPDATE files SET record = json_set(record, '$.pathogens', 9999) WHERE path = ?",
            (row[0],),
        )
        con.commit()
        con.close()
        bad = atlas_sqlite.SqliteAtlas(tampered)
        self.assertFalse(bad.verify(), "tampered atlas verified OK -- check is vacuous")


class TestSqliteCost(unittest.TestCase):
    """The reason the backend exists: answer one question without loading 14MB."""

    def test_single_lookup_does_not_read_whole_index(self):
        payload = _load_real_payload()
        if payload is None:
            self.skipTest("no atlas built")
        with tempfile.TemporaryDirectory() as td:
            db = os.path.join(td, "a.sqlite3")
            atlas_sqlite.build_sqlite(payload, db)
            import time
            t = time.perf_counter()
            sq = atlas_sqlite.SqliteAtlas(db)
            sq._project_root = PROJECT_ROOT
            sq.refs("telescope")
            elapsed_ms = (time.perf_counter() - t) * 1000
        # JSON backend needs 345-890ms on this corpus just to parse.
        self.assertLess(elapsed_ms, 100.0,
                        f"open+lookup took {elapsed_ms:.1f}ms; no better than JSON")


if __name__ == "__main__":
    unittest.main()
