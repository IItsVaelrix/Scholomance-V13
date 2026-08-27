"""Ordered V2 events and reconnect snapshots for mobile coding tasks."""

from __future__ import annotations

import asyncio
from collections import deque
import threading
from typing import Any, Iterable

from .coding_protocol import V2ServerEnvelope


class CodingEventHub:
    """The only sequence producer for one V2 coding-partner host instance."""

    def __init__(self, instance_id: str, *, queue_limit: int = 256) -> None:
        if type(queue_limit) is not int or queue_limit < 1:
            raise ValueError("invalid queue limit")
        self._instance_id = instance_id
        self._queue_limit = queue_limit
        self._last_seq = 0
        self._connections: dict[str, asyncio.Queue[str]] = {}
        self._backlog: deque[str] = deque(maxlen=queue_limit)
        self._snapshot: dict[str, Any] = {"tasks": []}
        self._lock = threading.RLock()

    def set_snapshot(self, snapshot: dict[str, Any]) -> None:
        if not isinstance(snapshot, dict) or set(snapshot) != {"tasks"} or not isinstance(snapshot["tasks"], list):
            raise ValueError("invalid task snapshot")
        with self._lock:
            self._snapshot = {"tasks": [dict(item) if isinstance(item, dict) else item for item in snapshot["tasks"]]}

    def attach(self, device_id: str) -> asyncio.Queue[str]:
        _device_id(device_id)
        with self._lock:
            queue: asyncio.Queue[str] = asyncio.Queue(maxsize=self._queue_limit)
            self._connections[device_id] = queue
            self._emit_locked("task.snapshot", self._snapshot, None, (device_id,))
            return queue

    def detach(self, device_id: str) -> bool:
        with self._lock:
            return self._connections.pop(device_id, None) is not None

    def is_connected(self, device_id: str) -> bool:
        with self._lock:
            return device_id in self._connections

    def publish(self, event_type: str, payload: dict[str, Any], request_id: str | None = None) -> str:
        with self._lock:
            return self._emit_locked(event_type, payload, request_id, tuple(self._connections))

    def _emit_locked(self, event_type: str, payload: dict[str, Any], request_id: str | None, device_ids: Iterable[str]) -> str:
        sequence = self._last_seq + 1
        if event_type == "task.snapshot":
            payload = {**payload, "lastSeq": sequence}
        event = V2ServerEnvelope(event_type, self._instance_id, sequence, request_id, payload).to_json()
        self._last_seq += 1
        self._backlog.append(event)
        stale: list[str] = []
        for device_id in device_ids:
            queue = self._connections.get(device_id)
            if queue is None:
                continue
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                stale.append(device_id)
        for device_id in stale:
            self._connections.pop(device_id, None)
        return event


def _device_id(value: str) -> None:
    if not isinstance(value, str) or not value or len(value) > 128:
        raise ValueError("invalid device id")
