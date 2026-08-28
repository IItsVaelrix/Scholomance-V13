"""Ordered, sanitized server events for paired DivTube companion devices."""

from __future__ import annotations

import asyncio
from collections import deque
import json
import threading
from typing import Any, Iterable

from .protocol import ServerEnvelope


EVENT_BACKLOG_LIMIT = 256


class RemoteEventHub:
    """The sole producer of server event sequences for one Cockpit instance."""

    def __init__(self, instance_id: str) -> None:
        # The backlog size is fixed by the protocol, not a per-instance
        # choice. This used to be a keyword argument that raised unless it
        # equalled EVENT_BACKLOG_LIMIT exactly — a knob with one legal value,
        # which reads as configurable and is not.
        # Let the canonical protocol perform the identifier validation once, without
        # emitting an event or exposing a sequence-setting API to callers.
        ServerEnvelope(
            type="status.snapshot",
            instance_id=instance_id,
            seq=0,
            request_id=None,
            payload={"cockpit": {"state": "idle", "degraded": False}, "activeJobs": [], "lastSeq": 0},
        )
        self._instance_id = instance_id
        self._last_seq = 0
        self._backlog: deque[str] = deque(maxlen=EVENT_BACKLOG_LIMIT)
        self._connections: dict[str, asyncio.Queue[str]] = {}
        self._snapshot_payload: dict[str, Any] = {"cockpit": {"state": "idle", "degraded": False}, "activeJobs": []}
        self._lock = threading.RLock()

    def publish(self, event_type: str, payload: dict[str, Any], request_id: str | None = None) -> str:
        """Issue and deliver one event; callers cannot select its sequence."""
        with self._lock:
            if event_type == "status.snapshot" and isinstance(payload, dict):
                payload = self._ordered_snapshot_payload(payload.get("cockpit"), payload.get("activeJobs"))
            event = self._emit_locked(event_type, payload, request_id, self._connections)
            if event_type == "status.snapshot":
                self._snapshot_payload = self._snapshot_cache(json.loads(event)["payload"])
            return event

    def snapshot(
        self,
        *,
        cockpit: dict[str, Any],
        active_jobs: list[dict[str, Any]],
        request_id: str | None = None,
    ) -> str:
        """Broadcast the current sanitized, deterministically ordered status."""
        payload = self._ordered_snapshot_payload(cockpit, active_jobs)
        with self._lock:
            event = self._emit_locked("status.snapshot", payload, request_id, self._connections)
            self._snapshot_payload = self._snapshot_cache(json.loads(event)["payload"])
            return event

    def attach(self, device_id: str) -> asyncio.Queue[str]:
        """Replace a device's stale socket queue and prime it with a snapshot."""
        _device_id(device_id)
        with self._lock:
            queue: asyncio.Queue[str] = asyncio.Queue(maxsize=EVENT_BACKLOG_LIMIT)
            self._connections[device_id] = queue
            # A reconnect snapshot itself consumes the latest sequence. Any later
            # live event is therefore strictly greater and arrives after it.
            self._emit_locked("status.snapshot", self._snapshot_payload, None, (device_id,))
            return queue

    def detach(self, device_id: str) -> bool:
        with self._lock:
            return self._connections.pop(device_id, None) is not None

    def is_connected(self, device_id: str) -> bool:
        with self._lock:
            return device_id in self._connections

    def backlog(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(self._backlog)

    def _emit_locked(
        self,
        event_type: str,
        payload: dict[str, Any],
        request_id: str | None,
        device_ids: Iterable[str],
    ) -> str:
        next_seq = self._last_seq + 1
        if event_type == "status.snapshot":
            payload = self._snapshot_payload_for_sequence(payload, next_seq)
        event = ServerEnvelope(
            type=event_type,
            instance_id=self._instance_id,
            seq=next_seq,
            request_id=request_id,
            payload=payload,
        ).to_json()
        self._last_seq = next_seq
        self._backlog.append(event)

        stale_devices: list[str] = []
        for device_id in tuple(device_ids):
            queue = self._connections.get(device_id)
            if queue is None:
                continue
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                stale_devices.append(device_id)
        for device_id in stale_devices:
            self._connections.pop(device_id, None)
        return event

    @staticmethod
    def _ordered_snapshot_payload(cockpit: Any, active_jobs: Any) -> dict[str, Any]:
        if not isinstance(cockpit, dict) or not isinstance(active_jobs, list):
            # The ServerEnvelope will produce the canonical ProtocolError below.
            return {"cockpit": cockpit, "activeJobs": active_jobs}
        jobs = [dict(job) if isinstance(job, dict) else job for job in active_jobs]
        jobs.sort(key=lambda job: job.get("jobId") if isinstance(job, dict) and isinstance(job.get("jobId"), str) else "")
        return {"cockpit": dict(cockpit), "activeJobs": jobs}

    @staticmethod
    def _snapshot_payload_for_sequence(payload: Any, seq: int) -> Any:
        if not isinstance(payload, dict):
            return payload
        result = dict(payload)
        result["lastSeq"] = seq
        return result

    @staticmethod
    def _snapshot_cache(payload: dict[str, Any]) -> dict[str, Any]:
        return {"cockpit": payload["cockpit"], "activeJobs": payload["activeJobs"]}


def _device_id(value: str) -> None:
    if not isinstance(value, str) or not value or len(value) > 128:
        raise ValueError("invalid device id")
