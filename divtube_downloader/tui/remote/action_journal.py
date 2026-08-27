"""Atomic, host-local records for mobile coding proposals and approvals."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any


_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_RECORD_KEYS = frozenset({
    "deviceId", "taskId", "actionId", "capability", "proposalDigest", "targetDigests",
    "expiresAt", "summary", "operation", "state",
})
_STATES = frozenset({"pending_approval", "approved", "running", "applied", "rejected", "invalidated", "failed", "cancelled"})


class ActionStateError(ValueError):
    """Raised for invalid proposal transitions without invoking a host tool."""


class ActionJournal:
    """Single-worktree action journal with atomic whole-record persistence."""

    def __init__(self, state_dir: str | Path) -> None:
        self._state_dir = Path(state_dir)
        self._state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self._state_dir, 0o700)
        self._path = self._state_dir / "mobile-coding-actions.json"
        self._records = self._load()

    def propose(self, record: dict[str, Any]) -> dict[str, Any]:
        validated = _record(record)
        if validated["state"] != "pending_approval":
            raise ActionStateError("proposal must start pending approval")
        if validated["actionId"] in self._records:
            raise ActionStateError("action id already exists")
        self._records[validated["actionId"]] = validated
        self._write()
        return _copy(validated)

    def get(self, action_id: str) -> dict[str, Any]:
        _identifier(action_id, "action id")
        try:
            return _copy(self._records[action_id])
        except KeyError as exc:
            raise ActionStateError("unknown action") from exc

    def approve(self, device_id: str, task_id: str, action_id: str, proposal_digest: str, *, now: float) -> dict[str, Any]:
        record = self.get(action_id)
        if record["state"] != "pending_approval":
            raise ActionStateError("action is not pending approval")
        if record["deviceId"] != device_id or record["taskId"] != task_id:
            raise ActionStateError("approval identity does not match proposal")
        if record["proposalDigest"] != proposal_digest:
            raise ActionStateError("approval digest does not match proposal")
        if not isinstance(now, (int, float)) or isinstance(now, bool):
            raise ActionStateError("invalid approval clock")
        if now >= record["expiresAt"]:
            raise ActionStateError("approval expired")
        return self._transition(action_id, "approved")

    def invalidate_if_stale(self, action_id: str, current_target_digests: dict[str, str]) -> dict[str, Any]:
        record = self.get(action_id)
        current = _target_digests(current_target_digests)
        if current != record["targetDigests"] and record["state"] in {"pending_approval", "approved"}:
            return self._transition(action_id, "invalidated")
        return record

    def record_receipt(self, action_id: str, state: str) -> dict[str, Any]:
        if state not in {"applied", "failed", "cancelled", "rejected"}:
            raise ActionStateError("invalid receipt state")
        record = self.get(action_id)
        if record["state"] not in {"approved", "running"}:
            raise ActionStateError("action is not executable")
        return self._transition(action_id, state)

    def start(self, action_id: str) -> dict[str, Any]:
        record = self.get(action_id)
        if record["state"] != "approved":
            raise ActionStateError("action is not approved")
        return self._transition(action_id, "running")

    def _transition(self, action_id: str, state: str) -> dict[str, Any]:
        if state not in _STATES:
            raise ActionStateError("invalid action state")
        updated = {**self._records[action_id], "state": state}
        self._records[action_id] = _record(updated)
        self._write()
        return _copy(updated)

    def _load(self) -> dict[str, dict[str, Any]]:
        if not self._path.exists():
            return {}
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ActionStateError("action journal is unreadable") from exc
        if not isinstance(raw, list):
            raise ActionStateError("action journal is invalid")
        records: dict[str, dict[str, Any]] = {}
        for item in raw:
            record = _record(item)
            if record["actionId"] in records:
                raise ActionStateError("action journal contains duplicate action id")
            records[record["actionId"]] = record
        return records

    def _write(self) -> None:
        descriptor, temporary = tempfile.mkstemp(prefix=".mobile-coding-actions-", dir=self._state_dir)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump([self._records[key] for key in sorted(self._records)], handle, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def _record(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _RECORD_KEYS:
        raise ActionStateError("action record is invalid")
    result = dict(value)
    for key in ("deviceId", "taskId", "actionId", "capability"):
        _identifier(result[key], key)
    if not isinstance(result["proposalDigest"], str) or not _DIGEST.fullmatch(result["proposalDigest"]):
        raise ActionStateError("action record has invalid proposal digest")
    result["targetDigests"] = _target_digests(result["targetDigests"])
    if not isinstance(result["expiresAt"], (int, float)) or isinstance(result["expiresAt"], bool):
        raise ActionStateError("action record has invalid expiry")
    if not isinstance(result["summary"], str) or not result["summary"] or len(result["summary"]) > 1024:
        raise ActionStateError("action record has invalid summary")
    result["operation"] = _operation(result["operation"], result["targetDigests"])
    if result["state"] not in _STATES:
        raise ActionStateError("action record has invalid state")
    return result


def _operation(value: Any, targets: dict[str, str]) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != {"kind", "path", "search", "replacement"}:
        raise ActionStateError("action record has invalid operation")
    if value["kind"] != "search_replace" or value["path"] not in targets:
        raise ActionStateError("action record has invalid operation")
    if not isinstance(value["search"], str) or not value["search"] or not isinstance(value["replacement"], str):
        raise ActionStateError("action record has invalid operation")
    if len(value["search"]) > 65536 or len(value["replacement"]) > 65536:
        raise ActionStateError("action record has invalid operation")
    return dict(value)


def _target_digests(value: Any) -> dict[str, str]:
    if not isinstance(value, dict) or not value:
        raise ActionStateError("action record has invalid target digests")
    result: dict[str, str] = {}
    for path, digest in value.items():
        if not isinstance(path, str) or not path or path.startswith("/") or "\\" in path or ".." in path.split("/"):
            raise ActionStateError("action record has invalid target path")
        if not isinstance(digest, str) or not _DIGEST.fullmatch(digest):
            raise ActionStateError("action record has invalid target digest")
        result[path] = digest
    return result


def _identifier(value: Any, field: str) -> None:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ActionStateError(f"action record has invalid {field}")


def _copy(record: dict[str, Any]) -> dict[str, Any]:
    return {**record, "targetDigests": dict(record["targetDigests"]), "operation": dict(record["operation"])}
