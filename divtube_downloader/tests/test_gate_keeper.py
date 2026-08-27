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
        self.gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, "tui_inspect")] = time.time() - 999
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
        self.gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, "read_file")] = time.time() - 10.0
        second = self.gate.check("read_file", {"path": self.real_path})
        self.assertFalse(second.allowed)
        self.assertEqual(second.reason, "REDUNDANCY")

    def test_reading_a_different_file_is_not_redundant(self):
        self.gate.check("read_file", {"path": self.real_path})
        self.gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, "read_file")] = time.time() - 10.0
        other = self.gate.check("read_file", {"path": "divtube_downloader/tui/core/gate_keeper.py"})
        self.assertTrue(other.allowed)


class TestGenericArgsRedundancyGate(unittest.TestCase):
    """read_file's redundancy check only ever covered read_file — every other
    query/lens tool (microscope, telescope, atlas, evaluate, search_code,
    list_directory, find_file) got no protection against being asked the
    exact same question twice, only the flat per-tool cooldown. This is the
    generalization: same tool + same arguments, seen recently, blocked —
    regardless of which of those tools it is."""

    def setUp(self):
        self.gate = GateKeeper()

    def _bypass_cooldown(self, tool_name):
        # Isolate the redundancy check from the (much shorter) cooldown gate,
        # same technique as TestRedundancyGate above.
        self.gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, tool_name)] = time.time() - 10.0

    def test_repeated_identical_microscope_call_is_blocked(self):
        kwargs = {"path": "tui/core/gate_keeper.py", "symbol": "GateKeeper"}
        first = self.gate.check("microscope", kwargs)
        self.assertTrue(first.allowed)
        self._bypass_cooldown("microscope")
        second = self.gate.check("microscope", kwargs)
        self.assertFalse(second.allowed)
        self.assertEqual(second.reason, "REDUNDANCY")

    def test_microscope_call_with_different_args_is_allowed(self):
        self.gate.check("microscope", {"path": "a.py", "symbol": "Foo"})
        self._bypass_cooldown("microscope")
        other = self.gate.check("microscope", {"path": "a.py", "symbol": "Bar"})
        self.assertTrue(other.allowed)

    def test_redundancy_covers_every_query_lens_tool(self):
        for tool_name in ("telescope", "atlas", "evaluate", "search_code", "list_directory", "find_file"):
            with self.subTest(tool=tool_name):
                gate = GateKeeper()
                kwargs = {"path": "some/path"}
                gate.check(tool_name, kwargs)
                gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, tool_name)] = time.time() - 10.0
                second = gate.check(tool_name, kwargs)
                self.assertFalse(second.allowed, f"{tool_name} should redundancy-gate a repeat")
                self.assertEqual(second.reason, "REDUNDANCY")

    def test_mutating_tools_are_not_subject_to_generic_redundancy(self):
        # run_command repeated with identical args (e.g. re-running the same
        # test suite after a fix) is a normal, intentional thing to do —
        # only the flat cooldown should apply, never a redundancy block.
        kwargs = {"command": "npm test"}
        self.gate.check("run_command", kwargs)
        self.gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, "run_command")] = time.time() - 10.0
        second = self.gate.check("run_command", kwargs)
        self.assertTrue(second.allowed)

    def test_argument_key_order_does_not_matter(self):
        self.gate.check("microscope", {"path": "a.py", "symbol": "Foo"})
        self._bypass_cooldown("microscope")
        # Same arguments, different insertion order — must still count as
        # the same call (canonical, order-independent identity).
        second = self.gate.check("microscope", {"symbol": "Foo", "path": "a.py"})
        self.assertFalse(second.allowed)


class TestVerdictAndStatus(unittest.TestCase):
    def setUp(self):
        self.gate = GateKeeper()

    def test_blocked_verdict_increments_total_blocks(self):
        self.gate.check("search_code")
        self.gate.check("search_code")
        status = self.gate.status()
        self.assertEqual(status["blocks"], 1)

    def test_blocks_are_broken_down_by_reason(self):
        # 1 cooldown block (second search_code too soon)...
        self.gate.check("search_code")
        self.gate.check("search_code")
        # ...and 1 redundancy block (identical microscope call, cooldown bypassed).
        kwargs = {"path": "a.py"}
        self.gate.check("microscope", kwargs)
        self.gate._last_calls[(GateKeeper.DEFAULT_AGENT_ID, "microscope")] = time.time() - 10.0
        self.gate.check("microscope", kwargs)

        status = self.gate.status()
        self.assertEqual(status["blocks"], 2)
        self.assertEqual(status["blocks_by_reason"], {"COOLDOWN": 1, "REDUNDANCY": 1})

    def test_reset_clears_blocks_by_reason(self):
        self.gate.check("search_code")
        self.gate.check("search_code")
        self.gate.reset()
        self.assertEqual(self.gate.status()["blocks_by_reason"], {})

    def test_reset_clears_cooldown_state(self):
        self.gate.check("search_code")
        self.gate.reset()
        verdict = self.gate.check("search_code")
        self.assertTrue(verdict.allowed)


class TestAgentScoping(unittest.TestCase):
    """The cockpit is no longer a single desktop agent talking to one gate:
    the mobile coding partner runs a second, concurrent agent in the SAME
    process. Reproduced live (repro_gate_collision.py): a mobile task's
    tool call got '⛔ GATE [COOLDOWN]' blocked purely because the desktop
    called the same tool moments earlier — completely unrelated
    conversations, sharing one un-scoped singleton. Gate state must be
    keyed by (agent_id, tool_name[, args]), not tool_name alone."""

    def setUp(self):
        self.gate = GateKeeper()

    def test_different_agents_do_not_share_cooldown(self):
        first = self.gate.check("search_code", agent_id="divtube")
        self.assertTrue(first.allowed)
        second = self.gate.check("search_code", agent_id="mobile:phone-1:task-1")
        self.assertTrue(second.allowed, "a different agent's call must not inherit another agent's cooldown")

    def test_same_agent_still_gets_cooldown_protection(self):
        self.gate.check("search_code", agent_id="divtube")
        second = self.gate.check("search_code", agent_id="divtube")
        self.assertFalse(second.allowed, "isolating agents must not weaken protection WITHIN one agent")

    def test_different_agents_do_not_share_redundancy(self):
        kwargs = {"path": "tui/services", "symbol": "ToolService"}
        self.gate.check("microscope", kwargs, agent_id="divtube")
        self.gate._last_calls[("divtube", "microscope")] = time.time() - 10.0
        other_agent = self.gate.check("microscope", kwargs, agent_id="mobile:phone-1:task-1")
        self.assertTrue(other_agent.allowed, "same args from a different agent is not redundancy")

    def test_default_agent_id_preserves_prior_shared_behavior(self):
        # Every existing caller that never passes agent_id (e.g. /release,
        # think_before, older direct check() calls) must keep behaving
        # exactly as before this existed: one shared implicit bucket.
        first = self.gate.check("search_code")
        second = self.gate.check("search_code")
        self.assertTrue(first.allowed)
        self.assertFalse(second.allowed)

    def test_reset_clears_state_for_every_agent(self):
        self.gate.check("search_code", agent_id="divtube")
        self.gate.check("search_code", agent_id="mobile:phone-1:task-1")
        self.gate.reset()
        self.assertTrue(self.gate.check("search_code", agent_id="divtube").allowed)
        self.assertTrue(self.gate.check("search_code", agent_id="mobile:phone-1:task-1").allowed)


if __name__ == "__main__":
    unittest.main()
