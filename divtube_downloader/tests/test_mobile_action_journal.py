import pytest

from tui.remote.action_journal import ActionJournal, ActionStateError


def proposal(action_id="action-1", *, expires_at=101, target_digest="a" * 64):
    return {
        "deviceId": "device-1", "taskId": "task-1", "actionId": action_id,
        "capability": "apply_patch", "proposalDigest": "b" * 64,
        "targetDigests": {"note.txt": target_digest}, "expiresAt": expires_at,
        "summary": "Change note", "operation": {"kind": "search_replace", "path": "note.txt", "search": "before", "replacement": "after"},
        "state": "pending_approval",
    }


def test_replayed_approval_cannot_transition_a_proposal_twice(tmp_path):
    """Removing single-use state transition would permit a duplicate write."""
    journal = ActionJournal(tmp_path)
    record = journal.propose(proposal())

    assert journal.approve("device-1", "task-1", "action-1", record["proposalDigest"], now=100)["state"] == "approved"
    with pytest.raises(ActionStateError, match="not pending"):
        journal.approve("device-1", "task-1", "action-1", record["proposalDigest"], now=100)


def test_changed_digest_or_expired_approval_has_no_state_effect(tmp_path):
    """Dropping digest/expiry checks would make delayed approvals dangerous."""
    journal = ActionJournal(tmp_path)
    journal.propose(proposal())

    with pytest.raises(ActionStateError, match="digest"):
        journal.approve("device-1", "task-1", "action-1", "c" * 64, now=100)
    with pytest.raises(ActionStateError, match="expired"):
        journal.approve("device-1", "task-1", "action-1", "b" * 64, now=101)
    assert journal.get("action-1")["state"] == "pending_approval"


def test_stale_target_invalidates_the_proposal_before_execution(tmp_path):
    """A diff must not apply after the reviewed pre-image changes."""
    journal = ActionJournal(tmp_path)
    journal.propose(proposal())

    invalidated = journal.invalidate_if_stale("action-1", {"note.txt": "d" * 64})

    assert invalidated["state"] == "invalidated"
    assert journal.get("action-1")["state"] == "invalidated"


def test_journal_persists_only_known_record_keys_across_restart(tmp_path):
    """A partial/corrupt journal cannot be treated as an approved action."""
    ActionJournal(tmp_path).propose(proposal())

    restored = ActionJournal(tmp_path)

    assert restored.get("action-1")["targetDigests"] == {"note.txt": "a" * 64}
