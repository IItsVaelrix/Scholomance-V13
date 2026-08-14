import gzip
import os
import sqlite3
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

from build_scholomance_dict import enrich_entries_from_etymology  # noqa: E402
from etymology_project import (  # noqa: E402
    apply_etymology,
    normalize_pos,
    parse_kaikki_etymology,
)

FIXTURE = os.path.join(ROOT, "tests", "fixtures", "etymology-kaikki-mini.jsonl")


def _make_entry_db(rows):
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
    CREATE TABLE entry(
        id INTEGER PRIMARY KEY,
        headword TEXT NOT NULL,
        headword_lower TEXT NOT NULL,
        lang TEXT NOT NULL,
        pos TEXT,
        ipa TEXT,
        etymology TEXT,
        senses_json TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT
    );
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
    """)
    conn.executemany(
        """INSERT INTO entry(
            id, headword, headword_lower, lang, pos, ipa, etymology,
            senses_json, source, source_url
        ) VALUES (?, ?, ?, 'English', ?, NULL, ?, '[]', 'cmudict', 'cmu')""",
        rows,
    )
    return conn


class TestNormalizePos(unittest.TestCase):
    def test_maps_kaikki_and_oewn_tags_to_one_key(self):
        self.assertEqual(normalize_pos("noun"), "n")
        self.assertEqual(normalize_pos("n"), "n")
        self.assertEqual(normalize_pos("verb"), "v")
        self.assertEqual(normalize_pos("V"), "v")
        self.assertEqual(normalize_pos("adj"), "a")
        self.assertEqual(normalize_pos("adjective"), "a")
        self.assertEqual(normalize_pos("s"), "a")
        self.assertEqual(normalize_pos("adv"), "r")
        self.assertEqual(normalize_pos("adverb"), "r")
        self.assertEqual(normalize_pos(""), "")
        self.assertEqual(normalize_pos(None), "")


class TestParse(unittest.TestCase):
    def test_indexes_english_etymology_by_lemma_and_pos(self):
        parsed = parse_kaikki_etymology(FIXTURE)
        self.assertEqual(
            parsed.by_key[("wound", "n")],
            "From Middle English wounde, from Old English wund.",
        )
        self.assertEqual(
            parsed.by_key[("wound", "v")],
            "From Middle English wounden, from Old English windan.",
        )
        self.assertEqual(
            parsed.by_key[("gravity", "n")],
            "From Middle French gravité, from Latin gravitas.",
        )
        self.assertEqual(parsed.by_key[("wind", "v")], "From Old English windan.")

    def test_first_record_wins_for_duplicate_lemma_pos(self):
        parsed = parse_kaikki_etymology(FIXTURE)
        self.assertNotIn("SECOND", parsed.by_key[("wound", "n")])

    def test_skips_non_english_missing_text_and_malformed_lines(self):
        parsed = parse_kaikki_etymology(FIXTURE)
        self.assertNotIn(("blanc", "n"), parsed.by_key)
        self.assertNotIn(("echo", "n"), parsed.by_key)
        self.assertGreaterEqual(parsed.skipped_line_count, 2)

    def test_collapses_whitespace_and_casefolds_the_lemma(self):
        parsed = parse_kaikki_etymology(FIXTURE)
        self.assertEqual(parsed.by_key[("time", "n")], "From Old English tīma.")

    def test_caps_etymology_at_400_characters(self):
        parsed = parse_kaikki_etymology(FIXTURE)
        text = parsed.by_key[("longword", "n")]
        self.assertLessEqual(len(text), 400)
        self.assertTrue(text.endswith("..."))

    def test_wanted_lemmas_drop_other_headwords(self):
        parsed = parse_kaikki_etymology(FIXTURE, wanted_lemmas={"wound"})
        self.assertIn(("wound", "n"), parsed.by_key)
        self.assertIn(("wound", "v"), parsed.by_key)
        self.assertNotIn(("gravity", "n"), parsed.by_key)
        self.assertNotIn(("wind", "v"), parsed.by_key)

    def test_reads_gzip_jsonl(self):
        with tempfile.NamedTemporaryFile(suffix=".jsonl.gz", delete=False) as handle:
            gz_path = handle.name
        try:
            with open(FIXTURE, "rb") as source, gzip.open(gz_path, "wb") as dest:
                dest.write(source.read())
            parsed = parse_kaikki_etymology(gz_path)
            self.assertIn(("gravity", "n"), parsed.by_key)
        finally:
            os.unlink(gz_path)


class TestApply(unittest.TestCase):
    def test_fills_matching_headword_and_pos_only(self):
        conn = _make_entry_db([
            (1, "Wound", "wound", "n", None),
            (2, "Gravity", "gravity", "n", None),
        ])
        try:
            parsed = parse_kaikki_etymology(FIXTURE, wanted_lemmas={"wound", "gravity"})
            result = apply_etymology(
                conn, parsed,
                source_path=FIXTURE,
                source_sha256="abc",
            )
            rows = dict(conn.execute("SELECT headword_lower, etymology FROM entry"))
            self.assertEqual(
                rows["wound"],
                "From Middle English wounde, from Old English wund.",
            )
            self.assertEqual(
                rows["gravity"],
                "From Middle French gravité, from Latin gravitas.",
            )
            self.assertEqual(result.updated_count, 2)
        finally:
            conn.close()

    def test_does_not_steal_another_pos_origin(self):
        conn = _make_entry_db([
            (1, "Wound", "wound", "v", None),
        ])
        try:
            parsed = parse_kaikki_etymology(FIXTURE, wanted_lemmas={"wound"})
            apply_etymology(conn, parsed, source_path=FIXTURE, source_sha256="abc")
            etymology = conn.execute(
                "SELECT etymology FROM entry WHERE headword_lower = 'wound'"
            ).fetchone()[0]
            self.assertEqual(
                etymology,
                "From Middle English wounden, from Old English windan.",
            )
            self.assertNotIn("wund.", etymology)
        finally:
            conn.close()

    def test_does_not_overwrite_existing_etymology(self):
        conn = _make_entry_db([
            (1, "Wound", "wound", "n", "already filled"),
        ])
        try:
            parsed = parse_kaikki_etymology(FIXTURE, wanted_lemmas={"wound"})
            result = apply_etymology(
                conn, parsed,
                source_path=FIXTURE,
                source_sha256="abc",
            )
            etymology = conn.execute("SELECT etymology FROM entry").fetchone()[0]
            self.assertEqual(etymology, "already filled")
            self.assertEqual(result.updated_count, 0)
            self.assertEqual(result.skipped_existing_count, 1)
        finally:
            conn.close()

    def test_null_pos_fills_only_when_the_word_has_one_origin(self):
        conn = _make_entry_db([
            (1, "Gravity", "gravity", None, None),
            (2, "Wound", "wound", None, None),
        ])
        try:
            parsed = parse_kaikki_etymology(FIXTURE, wanted_lemmas={"gravity", "wound"})
            apply_etymology(conn, parsed, source_path=FIXTURE, source_sha256="abc")
            rows = dict(conn.execute("SELECT headword_lower, etymology FROM entry"))
            self.assertEqual(
                rows["gravity"],
                "From Middle French gravité, from Latin gravitas.",
            )
            self.assertIsNone(rows["wound"])
        finally:
            conn.close()

    def test_stamps_meta_provenance(self):
        conn = _make_entry_db([
            (1, "Gravity", "gravity", "n", None),
        ])
        try:
            parsed = parse_kaikki_etymology(FIXTURE, wanted_lemmas={"gravity"})
            result = apply_etymology(
                conn, parsed,
                source_path=FIXTURE,
                source_sha256="deadbeef",
            )
            meta = dict(conn.execute("SELECT key, value FROM meta"))
            self.assertEqual(meta["etymology_source"], FIXTURE)
            self.assertEqual(meta["etymology_source_sha256"], "deadbeef")
            self.assertEqual(int(meta["etymology_updated_count"]), result.updated_count)
            self.assertEqual(int(meta["etymology_kept_count"]), parsed.kept_count)
        finally:
            conn.close()


class TestBuilderHelper(unittest.TestCase):
    def test_builder_join_runs_after_pos_is_on_the_entry(self):
        conn = _make_entry_db([
            (1, "Wound", "wound", "n", None),
            (2, "Time", "time", "n", None),
        ])
        try:
            result, parsed = enrich_entries_from_etymology(conn, FIXTURE)
            rows = dict(conn.execute("SELECT headword_lower, etymology FROM entry"))
            self.assertEqual(
                rows["wound"],
                "From Middle English wounde, from Old English wund.",
            )
            self.assertEqual(rows["time"], "From Old English tīma.")
            self.assertEqual(result.updated_count, 2)
            self.assertGreaterEqual(parsed.kept_count, 2)
            meta = dict(conn.execute("SELECT key, value FROM meta"))
            self.assertEqual(meta["etymology_source"], FIXTURE)
            self.assertEqual(len(meta["etymology_source_sha256"]), 64)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
