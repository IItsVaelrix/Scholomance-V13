"""/gate-status: visibility into GateKeeper's cooldown/redundancy blocks.

Before this, the only way to know whether the redundancy gate generalization
(microscope/telescope/atlas/evaluate/search_code/list_directory/find_file)
was doing real work on real usage was to take someone's word for it. This
turns "it happens often enough to annoy me" into an actual number.

setup_gate_commands depends solely on self.registry (same pattern as
setup_lab_commands, see test_lab_commands.py) — bound to a lightweight
SimpleNamespace instead of constructing the whole Textual app.
"""
import time
import unittest
from types import SimpleNamespace

from tui.core.command_parser import CommandRegistry
from tui.core.gate_keeper import gate
from tui.ui.app import DivTubeAgentApp


class _MockUI:
    def __init__(self):
        self.logs = []

    def log_msg(self, msg):
        self.logs.append(msg)


def _gate_registry():
    reg = CommandRegistry()
    DivTubeAgentApp.setup_gate_commands(SimpleNamespace(registry=reg))
    return reg


class TestGateStatusCommand(unittest.TestCase):
    def setUp(self):
        gate.reset()

    def tearDown(self):
        gate.reset()

    def test_command_is_registered(self):
        reg = _gate_registry()
        self.assertIn("/gate-status", reg.commands)

    def test_reports_zero_blocks_when_nothing_has_happened(self):
        reg = _gate_registry()
        ui = _MockUI()
        reg.parse_and_execute("/gate-status", ui)
        joined = " ".join(ui.logs)
        self.assertIn("Checks: 0", joined)
        self.assertIn("Blocks: 0", joined)

    def test_reports_a_real_block_count_broken_down_by_reason(self):
        # Manufacture one cooldown block and one redundancy block directly
        # against the real gate singleton, the same one execute_tool uses.
        gate.check("search_code")
        gate.check("search_code")  # cooldown block
        gate.check("microscope", {"path": "a.py"})
        gate._last_calls[(gate.DEFAULT_AGENT_ID, "microscope")] = time.time() - 10.0
        gate.check("microscope", {"path": "a.py"})  # redundancy block

        reg = _gate_registry()
        ui = _MockUI()
        reg.parse_and_execute("/gate-status", ui)
        joined = " ".join(ui.logs)
        self.assertIn("Blocks: 2", joined)
        self.assertIn("1 cooldown", joined)
        self.assertIn("1 redundancy", joined)

    def test_reset_subcommand_zeroes_the_counters(self):
        gate.check("search_code")
        gate.check("search_code")
        reg = _gate_registry()
        ui = _MockUI()
        reg.parse_and_execute("/gate-status reset", ui)
        self.assertTrue(any("reset" in m.lower() for m in ui.logs))
        self.assertEqual(gate.status()["blocks"], 0)


if __name__ == "__main__":
    unittest.main()
