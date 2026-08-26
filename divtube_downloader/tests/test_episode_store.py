import os
import sqlite3
import tempfile
import unittest

from tui.services import episode_store


def _make_db(path):
    """Mirror of migration v17. Test-only: production Python never runs DDL."""
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE collab_toolcall_episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
            agent_id TEXT NOT NULL DEFAULT '', tool_name TEXT NOT NULL,
            target_path TEXT, target_symbol TEXT, args_hash TEXT NOT NULL,
            why_family TEXT NOT NULL, why_hex TEXT NOT NULL,
            staleness_kind TEXT NOT NULL DEFAULT 'none', staleness_key TEXT,
            result_text TEXT, result_digest TEXT NOT NULL,
            result_bytes INTEGER NOT NULL DEFAULT 0,
            truncated INTEGER NOT NULL DEFAULT 0,
            repeat_index INTEGER NOT NULL DEFAULT 0, bytecode TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
    conn.commit()
    conn.close()


class TestArgsHash(unittest.TestCase):
    def test_key_order_does_not_change_identity(self):
        a = episode_store.args_hash_for("microscope", {"path": "a.py", "refs": True})
        b = episode_store.args_hash_for("microscope", {"refs": True, "path": "a.py"})
        self.assertEqual(a, b)

    def test_different_args_differ(self):
        a = episode_store.args_hash_for("microscope", {"path": "a.py"})
        b = episode_store.args_hash_for("microscope", {"path": "b.py"})
        self.assertNotEqual(a, b)


class TestDegradation(unittest.TestCase):
    def test_missing_database_is_silent(self):
        store = episode_store.EpisodeStore("/nonexistent/nope.sqlite")
        self.assertIsNone(store.lookup("h", "file-sha256", "k"))
        self.assertIsNone(store.record(
            tool_name="microscope", target_path="a.py", target_symbol=None,
            args_hash="h", why_family="NAV_ORIENT", why_hex="D1AAAAAA",
            staleness_kind="file-sha256", staleness_key="k",
            result_text="x", bytecode="PB-XP-v1-TCL-AAAA-0-0"))

    def test_present_file_without_table_stays_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "empty.sqlite")
            sqlite3.connect(path).close()   # a real DB with no episode table
            store = episode_store.EpisodeStore(path)
            self.assertIsNone(store.lookup("h", "file-sha256", "k"))

    def test_turso_configured_disables_local_store_even_if_file_exists(self):
        # Regression test for the split-brain finding: a real, populated local
        # file must NOT be trusted once the collab layer is told to use Turso
        # instead — reading/writing it would silently diverge from whatever
        # the Node server (and everyone else) actually sees.
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "collab.sqlite")
            _make_db(path)
            os.environ["TURSO_COLLAB_DB_URL"] = "libsql://example.turso.io"
            try:
                store = episode_store.EpisodeStore(path)
                self.assertIsNone(store.lookup("h", "file-sha256", "k"))
                self.assertIsNone(store.record(
                    tool_name="microscope", target_path="a.py", target_symbol=None,
                    args_hash="h", why_family="NAV_ORIENT", why_hex="D1AAAAAA",
                    staleness_kind="file-sha256", staleness_key="k",
                    result_text="x", bytecode="PB-XP-v1-TCL-AAAA-0-0"))
            finally:
                del os.environ["TURSO_COLLAB_DB_URL"]


class TestRecordAndLookup(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.path)
        self.store = episode_store.EpisodeStore(self.path, session_id="s1")

    def tearDown(self):
        self.tmp.cleanup()

    def _record(self, key="k1", text="hello"):
        return self.store.record(
            tool_name="microscope", target_path="a.py", target_symbol="f",
            args_hash="h1", why_family="NAV_LOCATE_DEFINITION", why_hex="D2BBBBBB",
            staleness_kind="file-sha256", staleness_key=key,
            result_text=text, bytecode="PB-XP-v1-TCL-AAAA-0-0")

    def test_repeat_index_counts_priors(self):
        self.assertEqual(self._record(), 0)
        self.assertEqual(self._record(), 1)
        self.assertEqual(self._record(), 2)

    def test_lookup_hits_on_matching_key(self):
        self._record()
        self.assertEqual(self.store.lookup("h1", "file-sha256", "k1")["result_text"], "hello")

    def test_lookup_misses_on_changed_key(self):
        self._record(key="k1")
        self.assertIsNone(self.store.lookup("h1", "file-sha256", "CHANGED"))

    def test_none_key_never_recalls(self):
        self._record()
        self.assertIsNone(self.store.lookup("h1", "none", None))

    def test_corrupted_row_is_a_miss_not_a_hit(self):
        # The digest is checked, not just stored (Codex review): a hand-corrupted
        # row must never be served.
        self._record()
        with sqlite3.connect(self.path) as conn:
            conn.execute("UPDATE collab_toolcall_episodes SET result_text = 'tampered'")
        self.assertIsNone(self.store.lookup("h1", "file-sha256", "k1"))

    def test_truncated_row_is_never_recalled(self):
        big = "x" * (episode_store.MAX_RESULT_BYTES + 100)
        self._record(text=big)
        self.assertIsNone(self.store.lookup("h1", "file-sha256", "k1"))

    def test_multibyte_truncation_stays_valid_utf8_and_under_budget(self):
        # A naive text[:N] can slice a multi-byte character in half. The
        # snowman is 3 bytes in UTF-8; this string is built to straddle the
        # cap exactly on a multi-byte boundary.
        text = "☃" * (episode_store.MAX_RESULT_BYTES // 3 + 5)
        stored, truncated = episode_store._truncate_utf8(text, episode_store.MAX_RESULT_BYTES)
        self.assertTrue(truncated)
        self.assertLessEqual(len(stored.encode("utf-8")), episode_store.MAX_RESULT_BYTES)
        stored.encode("utf-8").decode("utf-8")  # raises on a split code point


class TestRepeatIndexConcurrency(unittest.TestCase):
    """Codex review, finding 6: COUNT-then-INSERT was two statements, so two
    threads could read the same count before either inserted. BEGIN IMMEDIATE
    must make this impossible, not merely unlikely — asserted by requiring the
    four indices to be a full permutation of {0,1,2,3}, not just four rows."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_concurrent_records_get_distinct_sequential_repeat_index(self):
        import threading

        results = []
        lock = threading.Lock()

        def worker():
            store = episode_store.EpisodeStore(self.path, session_id="s1")
            idx = store.record(
                tool_name="microscope", target_path="a.py", target_symbol="f",
                args_hash="shared", why_family="NAV_ORIENT", why_hex="D1AAAAAA",
                staleness_kind="file-sha256", staleness_key="k1",
                result_text="hello", bytecode="PB-XP-v1-TCL-AAAA-0-0")
            with lock:
                results.append(idx)

        threads = [threading.Thread(target=worker) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(sorted(results), [0, 1, 2, 3])
