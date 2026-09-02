"""Idempotent, confirmed download admission outside the language model path."""

from __future__ import annotations

from dataclasses import dataclass
import os
import queue
import re
import threading
import uuid
from urllib.parse import urlparse

from .agent_service import CMD_DOWNLOAD_AUDIO, CMD_DOWNLOAD_VIDEO
# Admission control here and protocol validation in tui/remote/protocol.py are
# deliberately the same predicate. They used to be two hand-maintained host sets
# that had started to drift, which meant a URL could be accepted by the envelope
# parser and then rejected (or, worse, accepted) again at a different layer.
from ..remote.url_policy import evaluate as _evaluate_url


@dataclass(frozen=True)
class RemoteDownloadRequest:
    request_id: str
    url: str
    media_type: str
    rights_confirmed: bool

    def __post_init__(self):
        # Message kept byte-identical to the previous behaviour on purpose; only
        # the predicate is now shared with tui/remote/protocol.py.
        if not self.request_id or not _evaluate_url(self.url, require_https=True).ok:
            raise ValueError("invalid remote download request")
        if self.media_type not in {"audio", "video"} or self.rights_confirmed is not True:
            raise ValueError("invalid remote download request")


class RemoteDownloadQueue:
    def __init__(self, agent_service, event_hub, *, start_worker: bool = True) -> None:
        self.agent_service = agent_service
        self.event_hub = event_hub
        self._queue: queue.Queue[str] = queue.Queue()
        self._jobs: dict[str, dict] = {}
        self._requests: dict[str, str] = {}
        self._lock = threading.RLock()
        if start_worker:
            threading.Thread(target=self._worker, name="divtube-remote-downloads", daemon=True).start()

    def submit(self, request: RemoteDownloadRequest) -> str:
        if not isinstance(request, RemoteDownloadRequest):
            raise ValueError("validated download request required")
        with self._lock:
            existing = self._requests.get(request.request_id)
            if existing:
                return existing
            job_id = "job-" + uuid.uuid4().hex
            self._requests[request.request_id] = job_id
            self._jobs[job_id] = {
                "jobId": job_id, "requestId": request.request_id, "url": request.url,
                "mediaType": request.media_type, "percent": 0, "state": "queued", "filename": "download",
            }
            self._queue.put(job_id)
        self.event_hub.publish(
            "download.accepted",
            {"jobId": job_id, "mediaType": request.media_type, "sourceHost": urlparse(request.url).hostname},
            request_id=request.request_id,
        )
        return job_id

    def snapshot(self) -> list[dict]:
        with self._lock:
            return [dict(self._jobs[key]) for key in sorted(self._jobs)]

    def process_next(self) -> bool:
        try:
            job_id = self._queue.get_nowait()
        except queue.Empty:
            return False
        try:
            self._execute(job_id)
        finally:
            self._queue.task_done()
        return True

    def _worker(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                self._execute(job_id)
            finally:
                self._queue.task_done()

    def _execute(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job["state"] = "downloading"
        done = threading.Event()
        terminal = threading.Event()

        def output(value) -> None:
            candidate = _filename_from_output(str(value))
            if candidate:
                with self._lock:
                    job["filename"] = candidate

        def progress(percent, speed, eta) -> None:
            with self._lock:
                bounded = max(job["percent"], min(100, max(0, int(float(percent)))))
                job["percent"] = bounded
            self.event_hub.publish("download.progress", {
                "jobId": job_id, "percent": bounded, "speed": str(speed)[:64],
                "eta": str(eta)[:64], "state": "downloading",
            }, request_id=job["requestId"])

        def finished(success: bool) -> None:
            if terminal.is_set():
                return
            terminal.set()
            with self._lock:
                job["state"] = "completed" if success else "failed"
                if success:
                    job["percent"] = 100
                filename = os.path.basename(job["filename"]) or "download"
            self.event_hub.publish("download.completed", {
                "jobId": job_id, "state": job["state"], "filename": filename,
            }, request_id=job["requestId"])
            done.set()

        command = CMD_DOWNLOAD_AUDIO if job["mediaType"] == "audio" else CMD_DOWNLOAD_VIDEO
        try:
            self.agent_service.run_command(command, job["url"], output, on_progress=progress, on_done=finished)
        except Exception:
            finished(False)
        done.wait()


def _filename_from_output(text: str) -> str | None:
    for token in reversed(re.split(r"\s+", text)):
        token = token.strip("'\"()[]{}.,")
        if "/" in token or "\\" in token:
            name = os.path.basename(token.replace("\\", "/"))
            if name and name not in {".", ".."}:
                return name[:255]
    return None
