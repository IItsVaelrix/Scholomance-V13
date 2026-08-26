import json
import threading

from tui.remote.event_hub import RemoteEventHub
from tui.services.remote_download_queue import RemoteDownloadQueue, RemoteDownloadRequest


class Agent:
    def __init__(self):
        self.calls = []

    def run_command(self, cmd, url, callback, **kwargs):
        self.calls.append((cmd, url))
        kwargs["on_progress"](120, "1MiB/s", "00:01")
        callback("saved /tmp/private/video.mp4")
        kwargs["on_done"](True)


def test_queue_is_fifo_idempotent_and_sanitizes_progress_and_filename():
    agent = Agent()
    hub = RemoteEventHub("pc-1")
    queue = RemoteDownloadQueue(agent, hub, start_worker=False)
    first = RemoteDownloadRequest("r-1", "https://youtu.be/abc", "video", True)
    second = RemoteDownloadRequest("r-2", "https://www.youtube.com/watch?v=def", "audio", True)
    first_job = queue.submit(first)
    assert queue.submit(first) == first_job
    queue.submit(second)
    queue.process_next()
    queue.process_next()

    assert agent.calls == [("2", first.url), ("6", second.url)]
    decoded = [json.loads(item) for item in hub.backlog()]
    progress = [item for item in decoded if item["type"] == "download.progress"]
    completed = [item for item in decoded if item["type"] == "download.completed"]
    assert all(item["payload"]["percent"] == 100 for item in progress)
    assert all("/" not in item["payload"]["filename"] for item in completed)
    assert len(completed) == 2


def test_queue_continues_without_a_connected_device():
    agent = Agent()
    hub = RemoteEventHub("pc-1")
    queue = RemoteDownloadQueue(agent, hub, start_worker=False)
    queue.submit(RemoteDownloadRequest("r-3", "https://youtube.com/watch?v=x", "video", True))
    queue.process_next()
    assert queue.snapshot()[0]["state"] == "completed"
