import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from oewn_antonym_project import (  # noqa: E402
    apply_oewn_antonyms,
    parse_oewn_antonyms,
    project_antonyms,
)
from build_scholomance_dict import (  # noqa: E402
    apply_builder_oewn_antonyms,
    ingest_oewn_xml,
)

FIXTURE = os.path.join(ROOT, "tests", "fixtures", "oewn-antonym-mini.xml")


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


def _make_empty_oewn_db():
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE wordnet_synset(id TEXT PRIMARY KEY, pos TEXT, lexname TEXT, definition TEXT, examples_json TEXT, source TEXT, source_url TEXT);
    CREATE TABLE wordnet_lemma(lemma TEXT NOT NULL, lemma_lower TEXT NOT NULL, synset_id TEXT NOT NULL, sense_rank INTEGER, pos TEXT, source TEXT NOT NULL, source_url TEXT);
    CREATE TABLE wordnet_rel(synset_id TEXT NOT NULL, rel TEXT NOT NULL, target_synset_id TEXT NOT NULL, source TEXT NOT NULL, source_url TEXT);
    """)
    return conn


class TestProject(unittest.TestCase):
    def test_parse_release(self):
        parsed = parse_oewn_antonyms(FIXTURE)
        self.assertEqual(parsed.release, "2024")

    def test_malformed_xml_leaves_db_unchanged(self):
        conn = _make_db()
        before_relations = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        before_meta = list(conn.execute("SELECT * FROM meta ORDER BY key"))
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                suffix=".xml",
                delete=False,
                encoding="utf-8",
            ) as malformed:
                malformed.write("<LexicalResource><Lexicon version='2024'>BROKEN")

            with self.assertRaises(Exception):
                parse_oewn_antonyms(malformed.name)

            self.assertEqual(
                before_relations,
                list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid")),
            )
            self.assertEqual(
                before_meta,
                list(conn.execute("SELECT * FROM meta ORDER BY key")),
            )
        finally:
            conn.close()
            if "malformed" in locals():
                os.unlink(malformed.name)

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


class TestApply(unittest.TestCase):
    def test_wordnet_rel_has_no_unique_index(self):
        conn = _make_empty_oewn_db()
        try:
            indexes = list(conn.execute("PRAGMA index_list(wordnet_rel)"))
            self.assertFalse(
                any(index[2] for index in indexes),
                "wordnet_rel must not gain a UNIQUE index",
            )
        finally:
            conn.close()

    def test_builder_helper_matches_cli_projection_set(self):
        cli_conn = _make_empty_oewn_db()
        builder_conn = _make_empty_oewn_db()
        try:
            ingest_oewn_xml(cli_conn, FIXTURE, source_url="file://fixture")
            parsed = parse_oewn_antonyms(FIXTURE)
            cli_projection = project_antonyms(
                parsed,
                {row[0] for row in cli_conn.execute("SELECT id FROM wordnet_synset")},
            )
            apply_oewn_antonyms(
                cli_conn,
                cli_projection,
                release=parsed.release,
                source_url="file://fixture",
                source_sha256="abc",
                timestamp="2026-07-18T09:00:00Z",
                max_unresolved_ratio=0.5,
            )

            ingest_oewn_xml(builder_conn, FIXTURE, source_url="file://fixture")
            self.assertEqual(
                0,
                builder_conn.execute(
                    "SELECT COUNT(*) FROM wordnet_rel WHERE rel = 'antonym' AND source = 'oewn'"
                ).fetchone()[0],
            )
            builder_result, builder_projection = apply_builder_oewn_antonyms(
                builder_conn,
                FIXTURE,
                source_url="file://fixture",
                timestamp="2026-07-18T09:00:00Z",
                max_unresolved_ratio=0.5,
            )

            self.assertEqual(cli_projection.projected_pairs, builder_projection.projected_pairs)
            self.assertEqual(builder_result.projected_count_after_closure, len(cli_projection.projected_pairs))
            self.assertEqual(
                list(cli_conn.execute(
                    """SELECT synset_id, target_synset_id FROM wordnet_rel
                       WHERE rel = 'antonym' AND source = 'oewn'
                       ORDER BY synset_id, target_synset_id"""
                )),
                list(builder_conn.execute(
                    """SELECT synset_id, target_synset_id FROM wordnet_rel
                       WHERE rel = 'antonym' AND source = 'oewn'
                       ORDER BY synset_id, target_synset_id"""
                )),
            )
        finally:
            cli_conn.close()
            builder_conn.close()

    def test_scoped_delete_preserves_manual_and_similar(self):
        conn = _make_db()
        parsed = parse_oewn_antonyms(FIXTURE)
        existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
        proj = project_antonyms(parsed, existing)

        result = apply_oewn_antonyms(
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
        oewn_hot_cold = list(conn.execute(
            """SELECT * FROM wordnet_rel WHERE rel='antonym' AND source='oewn'
               AND synset_id='oewn-syn-hot' AND target_synset_id='oewn-syn-cold'"""))
        self.assertEqual(len(oewn_hot_cold), 0)
        self.assertGreaterEqual(result.skipped_existing_count, 1)
        self.assertGreaterEqual(result.inserted_count, 1)
        meta = dict(conn.execute("SELECT key,value FROM meta"))
        self.assertEqual(meta["oewn_antonym_ingested_at"], "2026-07-18T09:00:00Z")
        self.assertGreaterEqual(int(meta["oewn_antonym_skipped_existing_count"]), 1)

    def test_unresolved_gate_aborts_before_writes(self):
        conn = _make_db()
        before = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        parsed = parse_oewn_antonyms(FIXTURE)
        existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
        proj = project_antonyms(parsed, existing)

        with self.assertRaises(ValueError):
            apply_oewn_antonyms(
                conn, proj,
                release="2024", source_url="x", source_sha256="y",
                timestamp="2026-07-18T09:00:00Z",
                max_unresolved_ratio=0.0,
            )

        after = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        self.assertEqual(before, after)

    def test_non_finite_unresolved_gate_aborts_before_writes(self):
        conn = _make_db()
        before = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        parsed = parse_oewn_antonyms(FIXTURE)
        existing = {r[0] for r in conn.execute("SELECT id FROM wordnet_synset")}
        proj = project_antonyms(parsed, existing)

        with self.assertRaises(ValueError):
            apply_oewn_antonyms(
                conn, proj,
                release="2024", source_url="x", source_sha256="y",
                timestamp="2026-07-18T09:00:00Z",
                max_unresolved_ratio=float("nan"),
            )

        after = list(conn.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
        self.assertEqual(before, after)


class TestCLI(unittest.TestCase):
    def _run_cli(self, *args):
        return subprocess.run(
            [
                sys.executable,
                os.path.join(ROOT, "scripts", "ingest_oewn_antonyms.py"),
                *args,
            ],
            capture_output=True,
            text=True,
        )

    def test_missing_timestamp_rejects(self):
        result = self._run_cli(
            "--db", ":memory:",
            "--oewn_path", FIXTURE,
            "--expected-release", "2024",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("timestamp", (result.stderr + result.stdout).lower())

    def test_invalid_timestamp_rejects_before_writes(self):
        result = self._run_cli(
            "--db", ":memory:",
            "--oewn_path", FIXTURE,
            "--expected-release", "2024",
            "--timestamp", "not-a-timestamp",
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("timestamp", (result.stderr + result.stdout).lower())

    def test_release_mismatch_aborts_before_writes(self):
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = os.path.join(tempdir, "dictionary.sqlite")
            source = _make_db()
            target = sqlite3.connect(db_path)
            try:
                source.backup(target)
            finally:
                target.close()
                source.close()

            before = sqlite3.connect(db_path)
            try:
                relations_before = list(before.execute("SELECT * FROM wordnet_rel ORDER BY rowid"))
                meta_before = list(before.execute("SELECT * FROM meta ORDER BY key"))
            finally:
                before.close()

            result = self._run_cli(
                "--db", db_path,
                "--oewn_path", FIXTURE,
                "--expected-release", "2025",
                "--timestamp", "2026-07-18T09:00:00Z",
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("release", (result.stderr + result.stdout).lower())

            after = sqlite3.connect(db_path)
            try:
                self.assertEqual(
                    relations_before,
                    list(after.execute("SELECT * FROM wordnet_rel ORDER BY rowid")),
                )
                self.assertEqual(meta_before, list(after.execute("SELECT * FROM meta ORDER BY key")))
            finally:
                after.close()


if __name__ == "__main__":
    unittest.main()
