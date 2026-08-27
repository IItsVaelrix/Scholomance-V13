"""PromptService._execute_selected_tool must forward agent_id to
ToolService.execute_tool — the plumbing that makes GateKeeper's agent
scoping (see test_gate_keeper.py::TestAgentScoping and
test_gate_keeper_integration.py) actually reach the desktop/remote-chat
call path, not just the mobile coding path.

Reproduced live: a mobile coding-partner task's tool call got COOLDOWN-
blocked purely because the desktop driver called the same tool moments
earlier — same process, same gate singleton, unrelated conversations.
Fixing GateKeeper alone does nothing unless every caller actually tells it
which agent is asking.
"""
import unittest

from tui.services.prompt_service import PromptService


def _fake_tool(name):
    return {
        "type": "function",
        "function": {"name": name, "description": "x", "parameters": {"type": "object", "properties": {}}},
    }


class _RecordingToolService:
    def __init__(self):
        self.calls = []

    def execute_tool(self, name, arguments, callback, agent_id=None):
        self.calls.append({"name": name, "arguments": arguments, "agent_id": agent_id})
        return "ok"


def _make_service():
    svc = PromptService.__new__(PromptService)
    svc.tools = _RecordingToolService()
    return svc


class TestExecuteSelectedToolForwardsAgentId(unittest.TestCase):
    def test_agent_id_reaches_tool_service_execute_tool(self):
        svc = _make_service()
        selected = [_fake_tool("list_directory")]
        svc._execute_selected_tool("list_directory", {"path": "."}, lambda m: None, selected, agent_id="divtube")
        self.assertEqual(svc.tools.calls[-1]["agent_id"], "divtube")

    def test_different_agent_ids_are_forwarded_distinctly(self):
        svc = _make_service()
        selected = [_fake_tool("list_directory")]
        svc._execute_selected_tool("list_directory", {"path": "."}, lambda m: None, selected, agent_id="divtube")
        svc._execute_selected_tool(
            "list_directory", {"path": "."}, lambda m: None, selected, agent_id="mobile:phone-1:task-1"
        )
        agent_ids = [c["agent_id"] for c in svc.tools.calls]
        self.assertEqual(agent_ids, ["divtube", "mobile:phone-1:task-1"])

    def test_omitted_agent_id_forwards_none(self):
        # No caller-supplied agent_id — must not silently invent one;
        # ToolService/GateKeeper own the "what does no agent_id mean" default.
        svc = _make_service()
        selected = [_fake_tool("list_directory")]
        svc._execute_selected_tool("list_directory", {"path": "."}, lambda m: None, selected)
        self.assertIsNone(svc.tools.calls[-1]["agent_id"])

    def test_tool_executor_path_is_unaffected(self):
        # The mobile coding path supplies its own tool_executor and handles
        # its own agent_id internally (see mobile_coding_adapter.py) —
        # _execute_selected_tool must not force agent_id onto that callable.
        svc = _make_service()
        selected = [_fake_tool("mobile_propose_patch")]
        captured = {}

        def executor(name, arguments, callback):
            captured["name"] = name
            return "handled"

        result = svc._execute_selected_tool(
            "mobile_propose_patch", {}, lambda m: None, selected, tool_executor=executor, agent_id="mobile:phone-1:task-1"
        )
        self.assertEqual(result, "handled")
        self.assertEqual(captured["name"], "mobile_propose_patch")
        self.assertEqual(svc.tools.calls, [])  # never touched execute_tool directly


if __name__ == "__main__":
    unittest.main()
