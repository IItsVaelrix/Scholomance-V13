import hashlib
import asyncio
import json

import pytest

from tui.remote.action_journal import ActionJournal
from tui.remote.coding_event_hub import CodingEventHub
from tui.remote.coding_protocol import V2ClientEnvelope
from tui.services.mobile_coding_adapter import MobileCodingAdapter, MobileCodingError


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def test_patch_proposal_does_not_write_until_digest_bound_approval(tmp_path):
    """Applying during proposal would bypass the entire phone-review boundary."""
    path = tmp_path / "note.txt"
    path.write_text("before\n", encoding="utf-8")
    adapter = MobileCodingAdapter(tmp_path, ActionJournal(tmp_path / "journal"), CodingEventHub("pc-1"), now=lambda: 100.0)

    proposal = adapter.propose_patch("device-1", "task-1", {"path": "note.txt", "patch": "before\n---\nafter"})

    assert path.read_text(encoding="utf-8") == "before\n"
    assert proposal["state"] == "pending_approval"
    assert proposal["targetDigests"] == {"note.txt": digest("before\n")}


def test_approved_patch_applies_once_and_emits_authoritative_post_image_receipt(tmp_path):
    """Replacing the post-apply read with the agent claim must fail this test."""
    path = tmp_path / "note.txt"
    path.write_text("before\n", encoding="utf-8")
    adapter = MobileCodingAdapter(tmp_path, ActionJournal(tmp_path / "journal"), CodingEventHub("pc-1"), now=lambda: 100.0)
    proposal = adapter.propose_patch("device-1", "task-1", {"path": "note.txt", "patch": "before\n---\nafter"})

    receipt = adapter.approve_patch("device-1", "task-1", proposal["actionId"], proposal["proposalDigest"])

    assert path.read_text(encoding="utf-8") == "after\n"
    assert receipt["state"] == "applied"
    assert receipt["changedFiles"] == ["note.txt"]
    assert receipt["postImageDigests"] == {"note.txt": digest("after\n")}


def test_changed_preimage_invalidates_before_approved_patch_can_write(tmp_path):
    """A review of one file version must not apply to a later version."""
    path = tmp_path / "note.txt"
    path.write_text("before\n", encoding="utf-8")
    adapter = MobileCodingAdapter(tmp_path, ActionJournal(tmp_path / "journal"), CodingEventHub("pc-1"), now=lambda: 100.0)
    proposal = adapter.propose_patch("device-1", "task-1", {"path": "note.txt", "patch": "before\n---\nafter"})
    path.write_text("new desktop edit\n", encoding="utf-8")

    with pytest.raises(MobileCodingError, match="stale"):
        adapter.approve_patch("device-1", "task-1", proposal["actionId"], proposal["proposalDigest"])

    assert path.read_text(encoding="utf-8") == "new desktop edit\n"


def test_approved_patch_survives_adapter_restart_without_losing_reviewed_body(tmp_path):
    """Keeping the reviewed patch only in RAM would strand or weaken approvals after a host restart."""
    path = tmp_path / "note.txt"
    path.write_text("before\n", encoding="utf-8")
    journal_path = tmp_path / "journal"
    first = MobileCodingAdapter(tmp_path, ActionJournal(journal_path), CodingEventHub("pc-1"), now=lambda: 100.0)
    proposal = first.propose_patch("device-1", "task-1", {"path": "note.txt", "patch": "before\n---\nafter"})
    restarted = MobileCodingAdapter(tmp_path, ActionJournal(journal_path), CodingEventHub("pc-1"), now=lambda: 100.0)

    receipt = restarted.approve_patch("device-1", "task-1", proposal["actionId"], proposal["proposalDigest"])

    assert receipt["state"] == "applied"
    assert path.read_text(encoding="utf-8") == "after\n"


def test_typed_task_create_updates_reconnect_snapshot_without_a_command_channel(tmp_path):
    """A phone task becomes host state; it cannot smuggle an executable string."""
    async def scenario():
        hub = CodingEventHub("pc-1")
        adapter = MobileCodingAdapter(tmp_path, ActionJournal(tmp_path / "journal"), hub)
        adapter.dispatch("device-1", V2ClientEnvelope.from_json(json.dumps({
            "protocolVersion": "divtube-remote-v2", "type": "task.create", "requestId": "req-1",
            "payload": {"text": "Inspect the pairing flow"},
        })))
        queue = hub.attach("device-1")
        snapshot = json.loads(await queue.get())
        assert snapshot["type"] == "task.snapshot"
        assert snapshot["payload"]["tasks"] == [{
            "taskId": snapshot["payload"]["tasks"][0]["taskId"],
            "title": "Inspect the pairing flow", "state": "planning",
            "summary": "Host queued a bounded coding task.",
        }]

    asyncio.run(scenario())
