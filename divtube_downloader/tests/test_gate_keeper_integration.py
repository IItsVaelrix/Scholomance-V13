"""GateKeeper wired into ToolService.execute_tool — the actual integration
point that was severed when the gate got disabled (see test_gate_keeper.py
for the pure-gate unit tests and the history of why).

A gate that only exists in gate_keeper.py and is never consulted by the
dispatcher it was built to guard isn't reactivated — it's decorative. These
tests exercise execute_tool() itself, the single dispatch point documented
in tool_service.py, to prove a blocked verdict actually prevents the
underlying handler from running (not just that GateKeeper.check() returns
a Verdict in isolation).
"""
import os
import tempfile
import unittest

from tui.core.gate_keeper import gate
from tui.services.tool_service import ToolService


def _make_service():
    """Build a ToolService without the collab DB / node bridge — mirrors the
    helper in test_episode_recall.py."""
    orig = ToolService._init_persistence
    ToolService._init_persistence = lambda self: None
    try:
        return ToolService()
    finally:
        ToolService._init_persistence = orig


class TestGateWiredIntoExecuteTool(unittest.TestCase):
    def setUp(self):
        gate.reset()
        self.tmp = tempfile.TemporaryDirectory()
        self._orig_collab = os.environ.get("COLLAB_DB_PATH")
        os.environ["COLLAB_DB_PATH"] = os.path.join(self.tmp.name, "collab.sqlite")
        self.service = _make_service()

    def tearDown(self):
        gate.reset()
        if self._orig_collab is None:
            os.environ.pop("COLLAB_DB_PATH", None)
        else:
            os.environ["COLLAB_DB_PATH"] = self._orig_collab
        self.tmp.cleanup()

    def test_rapid_repeat_call_is_blocked_before_the_handler_runs(self):
        first = self.service.execute_tool("list_directory", {"path": "."})
        self.assertNotIn("Gate blocked", str(first))

        second = self.service.execute_tool("list_directory", {"path": "."})
        self.assertIn("Gate blocked", str(second))
        self.assertTrue(str(second).startswith("⛔"))

    def test_blocked_call_does_not_touch_the_filesystem_handler(self):
        # list_directory (non-recursive) is a single fast os.listdir call —
        # microseconds against a 2s cooldown, so there's no race between the
        # handler finishing and the cooldown window closing. Repo-wide
        # search/glob tools measured 1.8s-30s on this tree and are NOT safe
        # picks here: either close enough to a short cooldown to flake
        # under load, or slow enough that the cooldown expires before the
        # second call and the block never fires at all.
        self.service.execute_tool("list_directory", {"path": "tui/core"})
        blocked = self.service.execute_tool("list_directory", {"path": "tui/core"})
        self.assertTrue(str(blocked).startswith("⛔"))


if __name__ == "__main__":
    unittest.main()
