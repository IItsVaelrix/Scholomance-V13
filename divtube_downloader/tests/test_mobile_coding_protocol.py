import json

import pytest

from tui.remote.coding_protocol import CodingProtocolError, V2ClientEnvelope, V2ServerEnvelope


def client_frame(message_type, payload, *, request_id="req-1"):
    return json.dumps({
        "protocolVersion": "divtube-remote-v2",
        "type": message_type,
        "requestId": request_id,
        "payload": payload,
    })


def test_v2_approval_requires_a_digest_bound_to_one_task_and_action():
    """Dropping task/digest binding must make an approval invalid before dispatch."""
    envelope = V2ClientEnvelope.from_json(client_frame("action.approve", {
        "taskId": "task-1", "actionId": "action-1", "proposalDigest": "a" * 64,
    }))

    assert envelope.payload["proposalDigest"] == "a" * 64
    with pytest.raises(CodingProtocolError, match="missing or extra"):
        V2ClientEnvelope.from_json(client_frame("action.approve", {"actionId": "action-1"}))


def test_v2_rejects_unknown_request_type_and_unknown_payload_key():
    """A future client must not create an unreviewed gateway code path."""
    with pytest.raises(CodingProtocolError, match="Unsupported request type"):
        V2ClientEnvelope.from_json(client_frame("command.run", {}))
    with pytest.raises(CodingProtocolError, match="missing or extra"):
        V2ClientEnvelope.from_json(client_frame("task.create", {"text": "inspect", "shell": "rm -rf"}))


def test_v2_server_receipt_is_canonical_and_contains_no_secret_bearing_field():
    """Changing the receipt serializer to leak command/env/token data must fail."""
    event = V2ServerEnvelope(
        event_type="action.receipt",
        instance_id="pc-1",
        seq=3,
        request_id="req-1",
        payload={
            "taskId": "task-1", "actionId": "action-1", "proposalDigest": "b" * 64,
            "state": "applied", "postDigest": "c" * 64, "summary": "Patch applied",
        },
    )

    encoded = event.to_json()
    assert json.loads(encoded)["payload"]["state"] == "applied"
    assert encoded == json.dumps(json.loads(encoded), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with pytest.raises(CodingProtocolError, match="forbidden"):
        V2ServerEnvelope("action.receipt", "pc-1", 4, "req-2", {
            "taskId": "task-1", "actionId": "action-1", "proposalDigest": "b" * 64,
            "state": "applied", "postDigest": "c" * 64, "summary": "done", "command": "secret",
        })


def test_v2_server_rejects_nonmonotonic_or_invalid_identity_values():
    """A corrupt event cannot be accepted by a typed mobile client."""
    with pytest.raises(CodingProtocolError, match="nonnegative"):
        V2ServerEnvelope("task.activity", "pc-1", -1, None, {"taskId": "task-1", "state": "planning"})
