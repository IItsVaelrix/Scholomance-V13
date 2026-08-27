"""GateKeeper reactivation: cooldown + redundancy gates must actually block.

Context: gate_keeper.py was neutered to "always allow" as a drive-by change
inside an unrelated feature commit (82a579d0, "land today's phenotypic
idealism...") — no incident or design doc explains the disabling, it just
never got reverted. The DivTube cockpit's agent loop resends its full tool
catalog and ever-growing message history on every tool round-trip (up to
MAX_TURNS=150), so every redundant/spammy tool call the gate used to block
is now a full-price extra turn. These tests restore the original behavior:
cooldown-gate a hot tool, and redundancy-gate a re-read of a file we already
have fresh content for.
"""
import os
import time
import unittest

from tui.core.gate_keeper import GateKeeper


class TestCooldownGate(unittest.TestCase):
    def setUp(self):
        self.gate = GateKeeper()

    def test_second_call_within_cooldown_is_blocked(self):
        first = self.gate.check("search_code")
        self.assertTrue(first.allowed)
        second = self.gate.check("search_code")
        self.assertFalse(second.allowed)
        self.assertEqual(second.reason, "COOLDOWN")

    def test_call_after_cooldown_elapses_is_allowed(self):
        # tui_inspect has no configured cooldown; falls back to DEFAULT_COOLDOWN.
        self.gate._last_calls["tui_inspect"] = time.time() - 999
        verdict = self.gate.check("tui_inspect")
        self.assertTrue(verdict.allowed)

    def test_unconfigured_tool_still_gets_default_cooldown(self):
        first = self.gate.check("some_never_listed_tool")
        self.assertTrue(first.allowed)
        second = self.gate.check("some_never_listed_tool")
        self.assertFalse(second.allowed)


class TestRedundancyGate(unittest.TestCase):
    def setUp(self):
        self.gate = GateKeeper()
        # _resolve_path walks up from gate_keeper.py to the outer monorepo
        # root (it stops at the first .git/package.json/pyproject.toml it
        # finds, which is Scholomance-V12-main/, not divtube_downloader/) —
        # so paths here are relative to THAT root, not this test file's cwd.
        self.real_path = "divtube_downloader/tests/test_gate_keeper.py"

    def test_rereading_same_file_within_window_is_blocked(self):
        first = self.gate.check("read_file", {"path": self.real_path})
        self.assertTrue(first.allowed)
        # cooldown alone would already block a second read_file this fast,
        # so drive the clock forward past the read_file cooldown but still
        # inside the 30s redundancy window to isolate the redundancy gate.
        self.gate._last_calls["read_file"] = time.time() - 10.0
        second = self.gate.check("read_file", {"path": self.real_path})
        self.assertFalse(second.allowed)
        self.assertEqual(second.reason, "REDUNDANCY")

    def test_reading_a_different_file_is_not_redundant(self):
        self.gate.check("read_file", {"path": self.real_path})
        self.gate._last_calls["read_file"] = time.time() - 10.0
        other = self.gate.check("read_file", {"path": "divtube_downloader/tui/core/gate_keeper.py"})
        self.assertTrue(other.allowed)


class TestVerdictAndStatus(unittest.TestCase):
    def setUp(self):
        self.gate = GateKeeper()

    def test_blocked_verdict_increments_total_blocks(self):
        self.gate.check("search_code")
        self.gate.check("search_code")
        status = self.gate.status()
        self.assertEqual(status["blocks"], 1)

    def test_reset_clears_cooldown_state(self):
        self.gate.check("search_code")
        self.gate.reset()
        verdict = self.gate.check("search_code")
        self.assertTrue(verdict.allowed)


if __name__ == "__main__":
    unittest.main()
