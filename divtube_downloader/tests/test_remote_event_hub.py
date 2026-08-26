import asyncio
import json

import pytest

from tui.remote.event_hub import RemoteEventHub
from tui.remote.protocol import ProtocolError


def decoded(event):
    return json.loads(event)


def active_job(job_id, percent=0):
    return {"jobId": job_id, "mediaType": "video", "percent": percent, "state": "queued"}


def test_hub_is_the_sole_server_sequence_producer_per_instance():
    hub = RemoteEventHub("pc-1")

    first = decoded(hub.publish("chat.activity", {"state": "thinking"}))
    second = decoded(hub.publish("chat.activity", {"state": "responding"}))

    assert (first["instanceId"], first["seq"]) == ("pc-1", 1)
    assert second["seq"] == 2
    with pytest.raises(TypeError):
        hub.publish("chat.activity", {"state": "idle"}, seq=0)


def test_hub_serializes_immutable_events_using_the_protocol_contract():
    hub = RemoteEventHub("pc-1")
    payload = {"state": "thinking"}

    event = hub.publish("chat.activity", payload, request_id="request-1")
    payload["state"] = "failed"

    assert isinstance(event, str)
    assert decoded(event) == {
        "instanceId": "pc-1",
        "payload": {"state": "thinking"},
        "protocolVersion": "divtube-remote-v1",
        "requestId": "request-1",
        "seq": 1,
        "type": "chat.activity",
    }


def test_malformed_status_snapshot_reaches_the_canonical_protocol_rejection():
    hub = RemoteEventHub("pc-1")

    with pytest.raises(ProtocolError):
        hub.publish("status.snapshot", [])


def test_snapshot_sorts_active_jobs_by_identifier_deterministically():
    hub = RemoteEventHub("pc-1")

    event = decoded(hub.snapshot(
        cockpit={"state": "idle"},
        active_jobs=[active_job("job-z"), active_job("job-a", 30)],
    ))

    assert [job["jobId"] for job in event["payload"]["activeJobs"]] == ["job-a", "job-z"]


def test_backlog_keeps_exactly_the_latest_256_events():
    hub = RemoteEventHub("pc-1")

    for _ in range(300):
        hub.publish("chat.activity", {"state": "idle"})

    backlog = [decoded(event) for event in hub.backlog()]
    assert len(backlog) == 256
    assert backlog[0]["seq"] == 45
    assert backlog[-1]["seq"] == 300


def test_devices_receive_distinct_queues_with_the_same_live_event():
    hub = RemoteEventHub("pc-1")
    phone_a = hub.attach("phone-a")
    phone_b = hub.attach("phone-b")
    phone_a.get_nowait()
    phone_b.get_nowait()

    event = hub.publish("chat.activity", {"state": "thinking"})

    assert phone_a is not phone_b
    assert phone_a.get_nowait() == event
    assert phone_b.get_nowait() == event


def test_reconnect_receives_a_snapshot_before_later_live_events():
    hub = RemoteEventHub("pc-1")
    hub.snapshot(cockpit={"state": "downloading"}, active_jobs=[active_job("job-2")])

    queue = hub.attach("phone-a")
    reconnect_snapshot = decoded(queue.get_nowait())
    live_event = decoded(hub.publish("chat.activity", {"state": "thinking"}))

    assert reconnect_snapshot["type"] == "status.snapshot"
    assert reconnect_snapshot["payload"] == {
        "cockpit": {"state": "downloading"},
        "activeJobs": [active_job("job-2")],
    }
    assert reconnect_snapshot["seq"] < live_event["seq"]
    assert decoded(queue.get_nowait()) == live_event


def test_full_device_queue_drops_only_the_stale_connection_not_the_event():
    hub = RemoteEventHub("pc-1")
    slow = hub.attach("slow-phone")
    healthy = hub.attach("healthy-phone")
    slow.get_nowait()
    healthy.get_nowait()

    for _ in range(256):
        hub.publish("chat.activity", {"state": "idle"})
        healthy.get_nowait()
    final_event = hub.publish("chat.activity", {"state": "thinking"})

    assert hub.is_connected("slow-phone") is False
    assert hub.is_connected("healthy-phone") is True
    assert healthy.get_nowait() == final_event
    assert hub.backlog()[-1] == final_event
    assert isinstance(slow, asyncio.Queue)
