from __future__ import annotations

import asyncio
import json

from tui.remote.action_journal import ActionJournal
from tui.remote.coding_event_hub import CodingEventHub
from tui.remote.coding_protocol import V2ClientEnvelope
from tui.services.mobile_coding_adapter import MobileCodingAdapter


def test_named_verification_preset_emits_host_receipt_without_accepting_a_command(tmp_path):
    """Only a fixed preset reaches an executor; the phone frame has no command field."""
    calls = []

    def executor(preset, root):
        calls.append((preset, root))
        return True, "12 checks passed"

    async def scenario():
        hub = CodingEventHub("pc-1")
        adapter = MobileCodingAdapter(tmp_path, ActionJournal(tmp_path / "journal"), hub, verification_executor=executor)
        adapter.dispatch("device-1", V2ClientEnvelope("task.create", "task-create", {"text": "Verify companion"}))
        task_id = next(iter(adapter.tasks))
        queue = hub.attach("device-1")
        await queue.get()  # reconnect snapshot
        adapter.dispatch("device-1", V2ClientEnvelope("verification.start.request", "verify-1", {"taskId": task_id, "preset": "test_run"}))
        progress = json.loads(await queue.get())
        receipt = json.loads(await queue.get())
        assert progress["type"] == "verification.progress"
        assert receipt["type"] == "verification.receipt"
        assert receipt["payload"] == {"taskId": task_id, "preset": "test_run", "state": "passed", "summary": "12 checks passed"}

    asyncio.run(scenario())
    assert calls == [("test_run", tmp_path.resolve())]
