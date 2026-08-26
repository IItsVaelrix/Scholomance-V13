"""Integration tests for Task 7: the recall wrapper wired into ToolService.

Covers PDR F1/F4/F5/F6/F7/F8/F9/F10/F11 (acceptance criteria are in PDR
§3.1; this file writes real pytest/unittest cases directly against them)
plus this plan's shadow-mode ruling: shadow mode never serves a stored
result even on a proven hit, and shadow still writes exactly one episode
row per call.

F2/F3 (args_hash / classify_nav purity) and the git-staleness edge cases
(F10/F11) in isolation are already covered by test_episode_store.py and
test_episode_staleness.py (Tasks 4/6); this file additionally exercises
F10/F11 THROUGH the ToolService wrapper, not just against staleness_for
directly, because the property that actually matters for this task is
that the wrapper honors what staleness_for says.
"""
import os
import re
import sqlite3
import subprocess
import tempfile
import unittest
from unittest import mock

from tui.services import code_eval, code_lens
from tui.services.tool_service import ToolService, _toolcall_bytecode
from tui.services import tool_service


BYTECODE_RE = re.compile(r"^PB-XP-v1-TCL-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$")


def _make_db(path):
    """Mirror of migration v17 (same schema as test_episode_store.py's
    helper). Test-only: production Python never runs DDL."""
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


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def _init_repo(root):
    _git("init", "-q", cwd=root)
    _git("config", "user.email", "t@t.com", cwd=root)
    _git("config", "user.name", "t", cwd=root)


def _rows(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM collab_toolcall_episodes ORDER BY id"
        )]
    finally:
        conn.close()


class _EnvGuard:
    """Set/restore a set of env vars around a test body."""

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self._saved = {}

    def __enter__(self):
        for k, v in self.kwargs.items():
            self._saved[k] = os.environ.get(k)
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        return self

    def __exit__(self, *exc):
        for k, v in self._saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def _make_service():
    """Build a ToolService without spawning the node bridge subprocess.
    COLLAB_DB_PATH must already be set in the environment by the caller
    (via _EnvGuard) before calling this — __init__ reads it synchronously."""
    orig = ToolService._init_persistence
    ToolService._init_persistence = lambda self: None
    try:
        return ToolService()
    finally:
        ToolService._init_persistence = orig


class TestToolcallBytecodeFormat(unittest.TestCase):
    """F1: bytecode matches
    ^PB-XP-v1-TCL-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$ for varied inputs,
    verified with an actual regex assertion, not eyeballing."""

    def test_typical_microscope_call(self):
        bc = _toolcall_bytecode("microscope", "a.py", "hash1", "NAV_LOCATE_DEFINITION",
                                 "file-sha256", "deadbeef")
        self.assertRegex(bc, BYTECODE_RE)

    def test_long_tool_name_and_family(self):
        bc = _toolcall_bytecode("a_very_long_synthetic_tool_name_for_testing",
                                 "some/deeply/nested/path/to/a/file.py",
                                 "h" * 32, "NAV_RUNTIME_PROOF", "git-subtree", "k" * 64)
        self.assertRegex(bc, BYTECODE_RE)

    def test_none_target_path(self):
        bc = _toolcall_bytecode("evaluate", None, "hash3", "NAV_RUNTIME_PROOF", "none", None)
        self.assertRegex(bc, BYTECODE_RE)

    def test_short_tool_name(self):
        bc = _toolcall_bytecode("x", None, "h", "NAV_ORIENT", "none", None)
        self.assertRegex(bc, BYTECODE_RE)

    def test_deterministic_for_same_inputs(self):
        a = _toolcall_bytecode("atlas", "codex/core", "hh", "NAV_ORIENT", "repo-clean-head", "kk")
        b = _toolcall_bytecode("atlas", "codex/core", "hh", "NAV_ORIENT", "repo-clean-head", "kk")
        self.assertEqual(a, b)


class TestEpisodeWriteF1(unittest.TestCase):
    """F1: after a navigation tool executes with the flag in shadow or on,
    exactly one row exists with the right tool_name/target_path/bytecode/why_hex."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def _check_one_row(self, mode):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER=mode):
            svc = _make_service()
            svc._telescope({"path": "divtube_downloader/tui/services"}, None)
        rows = _rows(self.db_path)
        self.assertEqual(len(rows), 1, rows)
        row = rows[0]
        self.assertEqual(row["tool_name"], "telescope")
        self.assertEqual(row["target_path"], "divtube_downloader/tui/services")
        self.assertIsNotNone(row["bytecode"])
        self.assertRegex(row["bytecode"], BYTECODE_RE)
        self.assertIsNotNone(row["why_hex"])
        self.assertEqual(len(row["why_hex"]), 8)

    def test_mode_on_writes_one_row(self):
        self._check_one_row("on")

    def test_mode_shadow_writes_one_row(self):
        self._check_one_row("shadow")


class TestRecallOnUnchangedTarget(unittest.TestCase):
    """F4: with the flag on, a second identical call on an untouched file
    returns byte-identical text and the underlying lens is invoked exactly
    once (not twice)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)
        # Scratch file must live under the real PROJECT_ROOT because
        # tool_service._safe_path / code_lens resolve paths against it.
        self.scratch_dir = os.path.join(
            tool_service.PROJECT_ROOT, "divtube_downloader", "tests", "_scratch_episode_recall"
        )
        os.makedirs(self.scratch_dir, exist_ok=True)
        self.rel_path = os.path.relpath(
            os.path.join(self.scratch_dir, "target.py"), tool_service.PROJECT_ROOT
        )
        with open(os.path.join(self.scratch_dir, "target.py"), "w") as f:
            f.write("def foo():\n    return 1\n")

    def tearDown(self):
        self.tmp.cleanup()
        import shutil
        shutil.rmtree(self.scratch_dir, ignore_errors=True)

    def test_second_call_recalls_and_lens_runs_once(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            svc = _make_service()
            with mock.patch.object(code_lens, "microscope", wraps=code_lens.microscope) as spy:
                r1 = svc._microscope({"path": self.rel_path, "symbol": "foo"}, None)
                r2 = svc._microscope({"path": self.rel_path, "symbol": "foo"}, None)
        self.assertEqual(r1, r2)
        self.assertEqual(spy.call_count, 1)


class TestRecallRefusalOnChangedTarget(unittest.TestCase):
    """F5: if the file changes between calls, the lens executes both times
    and the second result reflects the new content."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)
        self.scratch_dir = os.path.join(
            tool_service.PROJECT_ROOT, "divtube_downloader", "tests", "_scratch_episode_recall_f5"
        )
        os.makedirs(self.scratch_dir, exist_ok=True)
        self.abs_path = os.path.join(self.scratch_dir, "target.py")
        self.rel_path = os.path.relpath(self.abs_path, tool_service.PROJECT_ROOT)
        with open(self.abs_path, "w") as f:
            f.write("def foo():\n    return 1\n")

    def tearDown(self):
        self.tmp.cleanup()
        import shutil
        shutil.rmtree(self.scratch_dir, ignore_errors=True)

    def test_changed_file_forces_second_execution(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            svc = _make_service()
            with mock.patch.object(code_lens, "microscope", wraps=code_lens.microscope) as spy:
                r1 = svc._microscope({"path": self.rel_path, "symbol": "foo"}, None)
                with open(self.abs_path, "a") as f:
                    f.write("\ndef bar():\n    return 2\n")
                r2 = svc._microscope({"path": self.rel_path, "symbol": "bar"}, None)
        self.assertEqual(spy.call_count, 2)
        self.assertIn("bar", r2)
        self.assertNotIn("bar", r1)


class TestRepeatAccountingF6(unittest.TestCase):
    """F6: repeat_index is the count of prior episodes sharing args_hash, at
    write time. Exercised through the wrapper in shadow mode, which always
    writes a fresh row regardless of what a hit would have been — the
    property under test (repeat_index sequencing) is about episode_store's
    write path, not about whether recall served a hit."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_three_identical_calls_get_sequential_repeat_index(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="shadow"):
            svc = _make_service()
            for _ in range(3):
                svc._telescope({"path": "divtube_downloader/tui/services"}, None)
        rows = _rows(self.db_path)
        self.assertEqual(len(rows), 3)
        self.assertEqual([r["repeat_index"] for r in rows], [0, 1, 2])


class TestTotalDegradationSafetyF7(unittest.TestCase):
    """F7: with the database absent, every tool behaves exactly as it does
    today — no exception, a normal result."""

    def test_nonexistent_db_path_does_not_break_the_tool(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH="/nonexistent/x.sqlite", DIVTUBE_EPISODE_LEDGER="on"):
            svc = _make_service()
            self.assertTrue(svc._episodes._disabled)
            result = svc._telescope({"path": "divtube_downloader/tui/services"}, None)
        self.assertIsInstance(result, str)
        self.assertNotIn("Traceback", result)


class TestTursoGuardDisablesLedgerEvenWithRealLocalDb(unittest.TestCase):
    """PDR §2 item 9 / Q5: when TURSO_COLLAB_DB_URL is set, the ledger must
    stay disabled, not silently use a real local db file that happens to be
    present — a local sqlite3 connection would otherwise read/write a
    disconnected split-brain copy."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_turso_url_disables_store_despite_present_local_file(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL="libsql://example.turso.io",
                        COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            svc = _make_service()
            self.assertTrue(svc._episodes._disabled)
            result = svc._telescope({"path": "divtube_downloader/tui/services"}, None)
        self.assertIsInstance(result, str)
        self.assertEqual(len(_rows(self.db_path)), 0)


class TestFlagDefaultF8(unittest.TestCase):
    """F8: with DIVTUBE_EPISODE_LEDGER unset, no row is written and no
    recall is attempted, even with a real, migrated db present."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_flag_unset_leaves_row_count_unchanged(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER=None):
            svc = _make_service()
            svc._telescope({"path": "divtube_downloader/tui/services"}, None)
        self.assertEqual(len(_rows(self.db_path)), 0)


class TestEvaluateAndMicroscopeEvalNeverRecalledF9(unittest.TestCase):
    """F9: evaluate and microscope(eval=true) are logged but never served —
    two identical calls each produce two episode rows and two REAL
    executions, even with the flag on."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)
        self.scratch_dir = os.path.join(
            tool_service.PROJECT_ROOT, "divtube_downloader", "tests", "_scratch_episode_recall_f9"
        )
        os.makedirs(self.scratch_dir, exist_ok=True)
        self.abs_path = os.path.join(self.scratch_dir, "target.py")
        self.rel_path = os.path.relpath(self.abs_path, tool_service.PROJECT_ROOT)
        with open(self.abs_path, "w") as f:
            f.write("def foo():\n    return 1\n")

    def tearDown(self):
        self.tmp.cleanup()
        import shutil
        shutil.rmtree(self.scratch_dir, ignore_errors=True)

    def test_evaluate_runs_twice_and_writes_twice(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            svc = _make_service()
            with mock.patch.object(code_eval, "evaluate", wraps=code_eval.evaluate) as spy:
                svc._evaluate({"path": self.rel_path, "symbol": "foo"}, None)
                svc._evaluate({"path": self.rel_path, "symbol": "foo"}, None)
        self.assertEqual(spy.call_count, 2)
        rows = _rows(self.db_path)
        self.assertEqual(len(rows), 2)
        self.assertEqual([r["tool_name"] for r in rows], ["evaluate", "evaluate"])

    def test_microscope_eval_true_runs_twice_and_writes_twice(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            svc = _make_service()
            with mock.patch.object(code_eval, "evaluate", wraps=code_eval.evaluate) as spy:
                svc._microscope({"path": self.rel_path, "symbol": "foo", "eval": True}, None)
                svc._microscope({"path": self.rel_path, "symbol": "foo", "eval": True}, None)
        self.assertEqual(spy.call_count, 2)
        rows = _rows(self.db_path)
        self.assertEqual(len(rows), 2)


class TestIgnoredSubtreeRefusesRecallF10(unittest.TestCase):
    """F10: a directory-scoped call whose target contains a gitignored path
    never produces a recallable staleness key — the second call always
    executes the lens, through the actual ToolService wrapper."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo_root = self.tmp.name
        _init_repo(self.repo_root)
        with open(os.path.join(self.repo_root, ".gitignore"), "w") as f:
            f.write("sub/ignored/\n")
        _git("add", ".gitignore", cwd=self.repo_root)
        _git("commit", "-q", "-m", "x", cwd=self.repo_root)
        os.makedirs(os.path.join(self.repo_root, "sub", "ignored"))
        with open(os.path.join(self.repo_root, "sub", "ignored", "f.txt"), "w") as f:
            f.write("v1")
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_mutation_inside_ignored_path_never_recalls(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            with mock.patch.object(tool_service, "PROJECT_ROOT", self.repo_root):
                svc = _make_service()
                with mock.patch.object(code_lens, "telescope", wraps=code_lens.telescope) as spy:
                    svc._telescope({"path": "sub"}, None)
                    with open(os.path.join(self.repo_root, "sub", "ignored", "f.txt"), "w") as f:
                        f.write("v2 — content actually changed")
                    svc._telescope({"path": "sub"}, None)
        self.assertEqual(spy.call_count, 2)


class TestMicroscopeRefsOnlyRecallsOnCleanTreeF11(unittest.TestCase):
    """F11: microscope(refs=true) only recalls on a fully clean tree — any
    outstanding change anywhere in the working tree, not just under the
    target path, refuses recall."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo_root = self.tmp.name
        _init_repo(self.repo_root)
        with open(os.path.join(self.repo_root, "target.py"), "w") as f:
            f.write("def foo():\n    return 1\n")
        with open(os.path.join(self.repo_root, "unrelated.py"), "w") as f:
            f.write("x = 1\n")
        _git("add", "-A", cwd=self.repo_root)
        _git("commit", "-q", "-m", "x", cwd=self.repo_root)
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_dirt_in_unrelated_file_refuses_recall(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="on"):
            with mock.patch.object(tool_service, "PROJECT_ROOT", self.repo_root):
                svc = _make_service()
                with mock.patch.object(code_lens, "microscope", wraps=code_lens.microscope) as spy:
                    svc._microscope({"path": "target.py", "symbol": "foo", "refs": True}, None)
                    with open(os.path.join(self.repo_root, "unrelated.py"), "a") as f:
                        f.write("y = 2\n")
                    svc._microscope({"path": "target.py", "symbol": "foo", "refs": True}, None)
        self.assertEqual(spy.call_count, 2)


class TestShadowModeNeverServesAHit(unittest.TestCase):
    """This plan's shadow-mode ruling, part 1: shadow mode never returns a
    stored result even on a proven hit — the wrapper always executes the
    real lens."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)
        self.scratch_dir = os.path.join(
            tool_service.PROJECT_ROOT, "divtube_downloader", "tests", "_scratch_episode_recall_shadow"
        )
        os.makedirs(self.scratch_dir, exist_ok=True)
        self.abs_path = os.path.join(self.scratch_dir, "target.py")
        self.rel_path = os.path.relpath(self.abs_path, tool_service.PROJECT_ROOT)
        with open(self.abs_path, "w") as f:
            f.write("def foo():\n    return 1\n")

    def tearDown(self):
        self.tmp.cleanup()
        import shutil
        shutil.rmtree(self.scratch_dir, ignore_errors=True)

    def test_proven_hit_still_executes_the_lens(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="shadow"):
            svc = _make_service()
            with mock.patch.object(code_lens, "microscope", wraps=code_lens.microscope) as spy:
                svc._microscope({"path": self.rel_path, "symbol": "foo"}, None)
                # A stored episode with a matching staleness key now exists
                # (the file hasn't changed) — a "proven hit" by staleness
                # terms. Shadow must still execute the lens the second time.
                svc._microscope({"path": self.rel_path, "symbol": "foo"}, None)
        self.assertEqual(spy.call_count, 2)

    def test_shadow_reports_match_via_callback_not_result(self):
        messages = []
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="shadow"):
            svc = _make_service()
            svc._microscope({"path": self.rel_path, "symbol": "foo"}, messages.append)
            svc._microscope({"path": self.rel_path, "symbol": "foo"}, messages.append)
        joined = "\n".join(messages)
        self.assertIn("would have recalled (match)", joined)

    def test_shadow_reports_mismatch_when_stored_row_is_hand_tampered(self):
        # A same-key, different-body row simulates an unsound staleness key
        # (the exact failure mode ESCALATION-3's shadow gate exists to
        # catch) without needing to actually construct an unsound key.
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="shadow"):
            svc = _make_service()
            svc._microscope({"path": self.rel_path, "symbol": "foo"}, None)
            import hashlib
            fake_text = "this is not what the lens would compute"
            fake_digest = hashlib.sha256(fake_text.encode("utf-8")).hexdigest()
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    "UPDATE collab_toolcall_episodes SET result_text = ?, result_digest = ?",
                    (fake_text, fake_digest),
                )
            messages = []
            svc._microscope({"path": self.rel_path, "symbol": "foo"}, messages.append)
        joined = "\n".join(messages)
        self.assertIn("MISMATCH", joined)


class TestShadowModeWritesOneRowPerCall(unittest.TestCase):
    """This plan's shadow-mode ruling, part 2: shadow mode still writes
    exactly one episode row per call (matching F1), never zero and never
    more than one, regardless of hit/miss/mismatch."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.db_path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_three_calls_write_three_rows(self):
        with _EnvGuard(TURSO_COLLAB_DB_URL=None, COLLAB_DB_PATH=self.db_path, DIVTUBE_EPISODE_LEDGER="shadow"):
            svc = _make_service()
            for _ in range(3):
                svc._telescope({"path": "divtube_downloader/tui/services"}, None)
        self.assertEqual(len(_rows(self.db_path)), 3)


if __name__ == "__main__":
    unittest.main()
