"""MobileCodingAdapter._execute_observe must scope its tool calls to the
task's own agent_id, not the shared default bucket.

Live-reproduced root cause of "started a task and then did nothing, state
of stasis": desktop and a mobile coding task run as two concurrent agents
in the SAME process, sharing ONE GateKeeper singleton. Before this, a
mobile task's tool call was keyed identically to the desktop's — same tool
name, no agent dimension — so a desktop tool call moments earlier could
silently gate-block the phone's unrelated task. Fixing GateKeeper and
ToolService.execute_tool (see test_gate_keeper.py, test_gate_keeper_
integration.py) does nothing unless the mobile path actually passes an
agent_id through — this is that last mile.
"""
import unittest

from tui.remote.action_journal import ActionJournal
from tui.remote.coding_event_hub import CodingEventHub
from tui.services.mobile_coding_adapter import MobileCodingAdapter


def _fake_tool(name):
    return {
        "type": "function",
        "function": {"name": name, "description": "x", "parameters": {"type": "object", "properties": {}}},
    }


class _RecordingToolService:
    def __init__(self, names):
        self.tools = [_fake_tool(n) for n in names]
        self.calls = []

    def execute_tool(self, name, arguments, callback, agent_id=None):
        self.calls.append({"name": name, "arguments": arguments, "agent_id": agent_id})
        return "ok"


class _FakePromptService:
    def __init__(self, names):
        self.tools = _RecordingToolService(names)


class TestMobileExecuteObserveAgentScoping(unittest.TestCase):
    def setUp(self):
        self.prompt_service = _FakePromptService(["list_directory"])
        self.adapter = MobileCodingAdapter(
            "/tmp", ActionJournal("/tmp/journal-agent-scoping-test"), CodingEventHub("pc-1"),
            prompt_service=self.prompt_service,
        )

    def test_observe_call_carries_the_task_scoped_agent_id(self):
        self.adapter._execute_observe(
            "list_directory", {"path": "."}, agent_id="mobile:phone-1:task-1"
        )
        self.assertEqual(self.prompt_service.tools.calls[-1]["agent_id"], "mobile:phone-1:task-1")

    def test_two_different_tasks_get_distinct_agent_ids(self):
        self.adapter._execute_observe("list_directory", {"path": "."}, agent_id="mobile:phone-1:task-1")
        self.adapter._execute_observe("list_directory", {"path": "."}, agent_id="mobile:phone-1:task-2")
        agent_ids = [c["agent_id"] for c in self.prompt_service.tools.calls]
        self.assertEqual(agent_ids, ["mobile:phone-1:task-1", "mobile:phone-1:task-2"])


if __name__ == "__main__":
    unittest.main()
