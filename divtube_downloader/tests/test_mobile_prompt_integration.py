from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

from tui.remote.action_journal import ActionJournal
from tui.remote.coding_event_hub import CodingEventHub
from tui.remote.coding_protocol import V2ClientEnvelope
from tui.services.mobile_coding_adapter import MobileCodingAdapter


def tool(name, properties):
    return {"type": "function", "function": {"name": name, "parameters": {"type": "object", "properties": properties}}}


class ScriptedPrompt:
    def __init__(self):
        catalog = [
            tool("read_file", {"path": {"type": "string"}}),
            tool("microscope", {"query": {"type": "string"}, "eval": {"type": "boolean"}}),
            tool("replace_file_content", {"path": {"type": "string"}, "replacement_content": {"type": "string"}}),
        ]
        self.tool_calls = []
        self.tools = SimpleNamespace(tools=catalog, execute_tool=self.execute_tool)
        self.executed = []
        self.selected = []

    def execute_tool(self, name, arguments, _callback):
        self.tool_calls.append((name, arguments))
        return "note body"

    def prompt(self, text, callback, *, tools, tool_executor, on_finished, **_):
        self.selected = tools
        self.executed.append(tool_executor("read_file", {"path": "note.txt"}, callback))
        self.executed.append(tool_executor("mobile_propose_patch", {"path": "note.txt", "patch": "before\n---\nafter"}, callback))
        callback("I prepared one reviewable change.")
        on_finished(True, "complete")


def test_phone_task_uses_live_safe_catalog_and_turns_agent_patch_into_a_proposal(tmp_path):
    """Changing the runner to desktop tools or a direct write must fail this integration test."""
    async def scenario():
        (tmp_path / "note.txt").write_text("before\n", encoding="utf-8")
        prompt = ScriptedPrompt()
        hub = CodingEventHub("pc-1")
        adapter = MobileCodingAdapter(tmp_path, ActionJournal(tmp_path / "journal"), hub, prompt_service=prompt)
        queue = hub.attach("device-1")
        await queue.get()  # initial reconnect snapshot
        adapter.dispatch("device-1", V2ClientEnvelope("task.create", "req-1", {"text": "Repair the note"}))

        selected = {item["function"]["name"]: item for item in prompt.selected}
        assert set(selected) == {"read_file", "microscope", "mobile_propose_patch"}
        assert "eval" not in selected["microscope"]["function"]["parameters"]["properties"]
        assert (tmp_path / "note.txt").read_text(encoding="utf-8") == "before\n"
        assert prompt.executed[0] == "note body"
        assert prompt.tool_calls == [("read_file", {"path": "note.txt"})]

        events = [json.loads(await queue.get()) for _ in range(5)]
        assert any(event["type"] == "action.proposed" for event in events)
        assert any(event["type"] == "task.completed" for event in events)

    asyncio.run(scenario())
