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


def test_download_accepts_explicit_audio_rights_confirmation():
    payload = {
        "url": "https://youtu.be/abc123",
        "mediaType": "audio",
        "rightsConfirmed": True,
    }
    envelope = ClientEnvelope.from_json(json.dumps({
        "protocolVersion": PROTOCOL_VERSION,
        "type": "download.request",
        "requestId": "r-audio",
        "payload": payload,
    }))
    assert envelope.payload == payload


def test_server_event_payloads_are_exactly_sanitized_before_serialization():
    events = {
        "status.snapshot": {
            "cockpit": {"state": "idle"},
            "activeJobs": [{"jobId": "job-1", "mediaType": "audio", "percent": 50, "state": "downloading"}],
            "lastSeq": 0,
        },
        "chat.activity": {"state": "thinking"},
        "chat.message": {"messageId": "message-1", "role": "assistant", "text": "Safe reply", "terminal": True},
        "download.accepted": {"jobId": "job-1", "mediaType": "audio", "sourceHost": "youtu.be"},
        "download.progress": {"jobId": "job-1", "percent": 50, "speed": "1.2 MiB/s", "eta": "00:10", "state": "downloading"},
        "download.completed": {"jobId": "job-1", "state": "completed", "filename": "clip.mp3"},
        "error": {"code": "invalid_url", "message": "The URL is not supported.", "field": "url"},
    }
    for index, (event_type, payload) in enumerate(events.items()):
        envelope = ServerEnvelope(
            type=event_type,
            instance_id="pc-1",
            seq=index,
            request_id="r-1",
            payload=payload,
        )
        assert json.loads(envelope.to_json())["payload"] == payload


@pytest.mark.parametrize("event_type,payload", [
    ("status.snapshot", {"cockpit": {"state": "idle"}}),
    ("status.snapshot", {"cockpit": {"state": "idle", "config": "secret"}, "activeJobs": [], "lastSeq": 1}),
    ("chat.activity", {"state": "thinking", "arguments": {"cmd": "id"}}),
    ("chat.message", {"messageId": "message-1", "role": "assistant", "text": "reply", "terminal": True, "shellOutput": "secret"}),
    ("download.accepted", {"jobId": "job-1", "mediaType": "video", "sourceHost": "youtube.com", "url": "https://youtube.com/watch?v=abc"}),
    ("download.progress", {"jobId": "job-1", "percent": True, "speed": "1 MiB/s", "eta": "00:10", "state": "downloading"}),
    ("download.progress", {"jobId": "job-1", "percent": 50, "speed": "1 MiB/s", "eta": "00:10", "state": "downloading", "path": "/home/deck/secret"}),
    ("download.completed", {"jobId": "job-1", "state": "completed", "filename": "/home/deck/clip.mp3"}),
    ("error", {"code": "bad", "message": "bad", "field": "url", "config": {"token": "secret"}}),
])
def test_server_event_payloads_reject_unknown_or_unsafe_nested_values(event_type, payload):
    with pytest.raises(ProtocolError):
        ServerEnvelope(
            type=event_type,
            instance_id="pc-1",
            seq=1,
            request_id="r-1",
            payload=payload,
        ).to_json()


def test_server_envelope_revalidates_payload_if_a_caller_mutates_it_after_construction():
    envelope = ServerEnvelope(
        type="chat.activity",
        instance_id="pc-1",
        seq=1,
        request_id="r-1",
        payload={"state": "thinking"},
    )
    envelope.payload["config"] = {"token": "secret"}
    with pytest.raises(ProtocolError, match="forbidden"):
        envelope.to_json()


@pytest.mark.parametrize("event_type,payload,field", [
    ("status.snapshot", {"cockpit": {"state": []}, "activeJobs": [], "lastSeq": 1}, ("cockpit", "state")),
    ("status.snapshot", {"cockpit": {"state": "idle"}, "activeJobs": [{
        "jobId": "job-1", "mediaType": {}, "percent": 0, "state": "queued",
    }], "lastSeq": 1}, ("activeJobs", 0, "mediaType")),
    ("status.snapshot", {"cockpit": {"state": "idle"}, "activeJobs": [{
        "jobId": "job-1", "mediaType": "video", "percent": 0, "state": [],
    }], "lastSeq": 1}, ("activeJobs", 0, "state")),
    ("chat.activity", {"state": {}}, ("state",)),
    ("download.accepted", {"jobId": "job-1", "mediaType": [], "sourceHost": "youtube.com"}, ("mediaType",)),
    ("download.accepted", {"jobId": "job-1", "mediaType": "video", "sourceHost": {}}, ("sourceHost",)),
    ("download.progress", {
        "jobId": "job-1", "percent": 0, "speed": "0 MiB/s", "eta": "00:00", "state": [],
    }, ("state",)),
    ("download.completed", {"jobId": "job-1", "state": {}, "filename": "clip.mp4"}, ("state",)),
])
def test_server_enum_fields_reject_unhashable_values_during_construction(event_type, payload, field):
    with pytest.raises(ProtocolError):
        ServerEnvelope(type=event_type, instance_id="pc-1", seq=1, request_id=None, payload=payload)


@pytest.mark.parametrize("event_type,payload,mutate", [
    ("status.snapshot", {"cockpit": {"state": "idle"}, "activeJobs": [], "lastSeq": 1}, lambda p: p["cockpit"].update(state=[])),
    ("status.snapshot", {"cockpit": {"state": "idle"}, "activeJobs": [{
        "jobId": "job-1", "mediaType": "video", "percent": 0, "state": "queued",
    }], "lastSeq": 1}, lambda p: p["activeJobs"][0].update(mediaType={})),
    ("status.snapshot", {"cockpit": {"state": "idle"}, "activeJobs": [{
        "jobId": "job-1", "mediaType": "video", "percent": 0, "state": "queued",
    }], "lastSeq": 1}, lambda p: p["activeJobs"][0].update(state=[])),
    ("chat.activity", {"state": "thinking"}, lambda p: p.update(state={})),
    ("download.accepted", {"jobId": "job-1", "mediaType": "video", "sourceHost": "youtube.com"}, lambda p: p.update(mediaType=[])),
    ("download.accepted", {"jobId": "job-1", "mediaType": "video", "sourceHost": "youtube.com"}, lambda p: p.update(sourceHost={})),
    ("download.progress", {
        "jobId": "job-1", "percent": 0, "speed": "0 MiB/s", "eta": "00:00", "state": "queued",
    }, lambda p: p.update(state=[])),
    ("download.completed", {"jobId": "job-1", "state": "completed", "filename": "clip.mp4"}, lambda p: p.update(state={})),
])
def test_server_enum_fields_reject_unhashable_values_during_serialization(event_type, payload, mutate):
    envelope = ServerEnvelope(type=event_type, instance_id="pc-1", seq=1, request_id=None, payload=payload)
    mutate(envelope.payload)
    with pytest.raises(ProtocolError):
        envelope.to_json()


def test_server_envelope_uses_stable_sorted_json_and_validates_sequence():
    envelope = ServerEnvelope(
        type="status.snapshot",
        instance_id="pc-1",
        seq=7,
        request_id=None,
        payload={"cockpit": {"state": "idle"}, "activeJobs": [], "lastSeq": 7},
    )
    assert envelope.to_json() == (
        '{"instanceId":"pc-1","payload":{"activeJobs":[],"cockpit":{"state":"idle"},"lastSeq":7},'
        '"protocolVersion":"divtube-remote-v1","requestId":null,"seq":7,'
        '"type":"status.snapshot"}'
    )
    for bad in (-1, True, 1.0):
        with pytest.raises(ProtocolError):
            ServerEnvelope(type="status.snapshot", instance_id="pc-1", seq=bad, request_id=None, payload={})


@pytest.mark.parametrize("last_seq", [True, -1, 1.0, 8])
def test_status_snapshot_last_seq_is_an_integer_matching_its_envelope(last_seq):
    with pytest.raises(ProtocolError):
        ServerEnvelope(
            type="status.snapshot",
            instance_id="pc-1",
            seq=7,
            request_id=None,
            payload={"cockpit": {"state": "idle"}, "activeJobs": [], "lastSeq": last_seq},
        )


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
