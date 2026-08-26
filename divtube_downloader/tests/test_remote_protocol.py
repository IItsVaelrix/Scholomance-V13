import json
import uuid

import pytest

from tui.remote.protocol import (
    CLIENT_TYPES,
    PROTOCOL_VERSION,
    ClientEnvelope,
    ProtocolError,
    ServerEnvelope,
)


def test_primary_client_envelope_contract():
    envelope = ClientEnvelope.from_json(
        '{"protocolVersion":"divtube-remote-v1","type":"status.snapshot.request","requestId":"r-1","payload":{}}'
    )
    assert envelope.type == "status.snapshot.request"


def test_client_envelope_rejects_missing_extra_and_mismatched_fields():
    base = {
        "protocolVersion": PROTOCOL_VERSION,
        "type": "status.snapshot.request",
        "requestId": "r-1",
        "payload": {},
    }
    for mutation in (
        {**base, "extra": True},
        {key: value for key, value in base.items() if key != "payload"},
        {**base, "protocolVersion": "divtube-remote-v0"},
    ):
        with pytest.raises(ProtocolError):
            ClientEnvelope.from_json(json.dumps(mutation))


def test_client_envelope_rejects_unknown_types_and_payload_keys():
    with pytest.raises(ProtocolError):
        ClientEnvelope.from_json(json.dumps({
            "protocolVersion": PROTOCOL_VERSION,
            "type": "future.command",
            "requestId": "r-1",
            "payload": {},
        }))
    with pytest.raises(ProtocolError):
        ClientEnvelope.from_json(json.dumps({
            "protocolVersion": PROTOCOL_VERSION,
            "type": "status.snapshot.request",
            "requestId": "r-1",
            "payload": {"unexpected": 1},
        }))


def test_chat_turn_has_8000_unicode_scalar_limit():
    def raw(text):
        return json.dumps({
            "protocolVersion": PROTOCOL_VERSION,
            "type": "chat.turn.request",
            "requestId": "r-1",
            "payload": {"text": text, "conversation": "main"},
        })

    assert ClientEnvelope.from_json(raw("x" * 8000)).payload["text"] == "x" * 8000
    with pytest.raises(ProtocolError):
        ClientEnvelope.from_json(raw("x" * 8001))


def test_download_requires_https_youtube_url_and_explicit_rights():
    def raw(**payload):
        return json.dumps({
            "protocolVersion": PROTOCOL_VERSION,
            "type": "download.request",
            "requestId": str(uuid.uuid4()),
            "payload": payload,
        })

    valid = {"url": "https://www.youtube.com/watch?v=abc123", "mediaType": "video", "rightsConfirmed": True}
    assert ClientEnvelope.from_json(raw(**valid)).payload == valid
    for mutation in (
        {**valid, "rightsConfirmed": False},
        {**valid, "url": "http://www.youtube.com/watch?v=abc123"},
        {**valid, "url": "https://example.com/watch?v=abc123"},
        {**valid, "mediaType": "image"},
        {**valid, "rightsConfirmed": 1},
    ):
        with pytest.raises(ProtocolError):
            ClientEnvelope.from_json(raw(**mutation))


def test_server_envelope_uses_stable_sorted_json_and_validates_sequence():
    envelope = ServerEnvelope(
        type="status.snapshot",
        instance_id="pc-1",
        seq=7,
        request_id=None,
        payload={"z": "é", "a": 1},
    )
    assert envelope.to_json() == (
        '{"instanceId":"pc-1","payload":{"a":1,"z":"é"},'
        '"protocolVersion":"divtube-remote-v1","requestId":null,"seq":7,'
        '"type":"status.snapshot"}'
    )
    for bad in (-1, True, 1.0):
        with pytest.raises(ProtocolError):
            ServerEnvelope(type="status.snapshot", instance_id="pc-1", seq=bad, request_id=None, payload={})


def test_server_sequence_is_monotonic_per_instance():
    first = ServerEnvelope.next_sequence("pc-1")
    second = ServerEnvelope.next_sequence("pc-1")
    other = ServerEnvelope.next_sequence("pc-2")
    assert second > first
    assert other == 1


def test_client_types_are_explicit():
    assert CLIENT_TYPES == frozenset({
        "session.hello", "chat.turn.request", "download.request", "status.snapshot.request",
    })
