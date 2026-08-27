import asyncio
import json

from tui.remote.coding_event_hub import CodingEventHub


def test_v2_reconnect_receives_a_task_snapshot_before_later_events():
    """A reconnect must not render a stale client-side task as authoritative."""
    asyncio.run(_reconnect_snapshot_before_events())


async def _reconnect_snapshot_before_events():
    hub = CodingEventHub("pc-1")
    hub.set_snapshot({"tasks": [{"taskId": "task-1", "title": "Inspect", "state": "planning", "summary": "Queued"}]})
    queue = hub.attach("device-1")

    first = json.loads(await queue.get())
    hub.publish("task.activity", {"taskId": "task-1", "state": "exploring"})
    second = json.loads(await queue.get())

    assert first["type"] == "task.snapshot"
    assert first["seq"] < second["seq"]
    assert second["payload"]["state"] == "exploring"


def test_v2_hub_drops_only_a_full_stale_device_queue():
    """A slow phone must not prevent a live phone from receiving an event."""
    asyncio.run(_full_queue_does_not_block_other_device())


async def _full_queue_does_not_block_other_device():
    hub = CodingEventHub("pc-1", queue_limit=1)
    stale = hub.attach("stale")
    live = hub.attach("live")
    await stale.get(); await live.get()

    hub.publish("task.activity", {"taskId": "task-1", "state": "planning"})
    hub.publish("task.activity", {"taskId": "task-1", "state": "exploring"})

    delivered = json.loads(await live.get())
    assert delivered["payload"]["state"] == "planning"
    assert not hub.is_connected("stale")
