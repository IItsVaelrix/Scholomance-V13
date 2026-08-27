"""Strict, secret-safe wire contract for the mobile coding partner V2."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any


PROTOCOL_VERSION = "divtube-remote-v2"
CLIENT_TYPES = frozenset({
    "session.hello", "capability.manifest.request", "task.create", "task.cancel",
    "task.snapshot.request", "action.approve", "action.reject", "action.cancel",
    "artifact.open.request", "verification.start.request", "device.revoke",
})
SERVER_TYPES = frozenset({
    "capability.manifest", "task.snapshot", "task.activity", "task.message", "task.blocked",
    "task.completed", "artifact.summary", "artifact.chunk", "action.proposed",
    "action.approval.required", "action.running", "action.receipt", "action.invalidated",
    "verification.progress", "verification.receipt", "device.notice", "error",
})
_CLIENT_KEYS = frozenset({"protocolVersion", "type", "requestId", "payload"})
_SERVER_KEYS = frozenset({"protocolVersion", "instanceId", "seq", "type", "requestId", "payload"})
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_DIGEST = re.compile(r"^(?:sha256:)?[0-9a-f]{64}$")
_FORBIDDEN_FIELD_NAMES = frozenset({
    "apikey", "authorization", "command", "config", "credential", "credentials",
    "cwd", "directory", "env", "headers", "password", "path", "paths", "secret", "secrets",
    "shell", "stdout", "stderr", "token", "tokens", "url",
})
_TASK_STATES = frozenset({"planning", "exploring", "awaiting_approval", "executing", "blocked", "completed", "failed", "cancelled"})
_ACTION_STATES = frozenset({"pending_approval", "approved", "running", "applied", "rejected", "invalidated", "failed", "cancelled"})


class CodingProtocolError(ValueError):
    """A deterministic rejection before the host adapter is invoked."""


def stable_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _fail(message: str) -> None:
    raise CodingProtocolError(message)


def _object(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise CodingProtocolError("Envelope must contain valid JSON.") from exc
    if not isinstance(value, dict):
        _fail("Envelope must be an object.")
    return value


def _exact_keys(value: dict[str, Any], expected: set[str] | frozenset[str]) -> None:
    if set(value) != set(expected):
        _fail("Envelope contains missing or extra keys.")


def _identifier(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail(f"Invalid {field}.")
    return value


def _text(value: Any, field: str, maximum: int = 512) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or "\x00" in value:
        _fail(f"Invalid {field}.")
    if any(ord(char) < 0x20 and char not in "\n\r\t" for char in value):
        _fail(f"Invalid {field}.")
    return value


def _digest(value: Any) -> str:
    if not isinstance(value, str) or not _DIGEST.fullmatch(value):
        _fail("Invalid proposalDigest.")
    return value


def _payload(value: Any, message_type: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("Payload must be an object.")
    required: dict[str, set[str]] = {
        "session.hello": {"appVersion"}, "capability.manifest.request": set(),
        "task.create": {"text"}, "task.cancel": {"taskId"}, "task.snapshot.request": set(),
        "action.approve": {"taskId", "actionId", "proposalDigest"},
        "action.reject": {"taskId", "actionId", "reason"}, "action.cancel": {"taskId", "actionId"},
        "artifact.open.request": {"artifactId", "cursor"},
        "verification.start.request": {"taskId", "preset"}, "device.revoke": set(),
    }
    _exact_keys(value, required[message_type])
    if message_type == "session.hello":
        _text(value["appVersion"], "appVersion", 64)
    elif message_type == "task.create":
        _text(value["text"], "text", 8000)
    elif message_type == "task.cancel":
        _identifier(value["taskId"], "taskId")
    elif message_type == "action.approve":
        _identifier(value["taskId"], "taskId"); _identifier(value["actionId"], "actionId"); _digest(value["proposalDigest"])
    elif message_type == "action.reject":
        _identifier(value["taskId"], "taskId"); _identifier(value["actionId"], "actionId"); _text(value["reason"], "reason")
    elif message_type == "action.cancel":
        _identifier(value["taskId"], "taskId"); _identifier(value["actionId"], "actionId")
    elif message_type == "artifact.open.request":
        _identifier(value["artifactId"], "artifactId")
        if type(value["cursor"]) is not int or value["cursor"] < 0:
            _fail("Invalid cursor.")
    elif message_type == "verification.start.request":
        _identifier(value["taskId"], "taskId"); _identifier(value["preset"], "preset")
    return dict(value)


def _reject_forbidden_fields(value: Any) -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            if not isinstance(key, str):
                _fail("Server payload keys must be strings.")
            normalized = re.sub(r"[^a-z0-9]", "", key.lower())
            if normalized in _FORBIDDEN_FIELD_NAMES:
                _fail("Server payload includes a forbidden field.")
            _reject_forbidden_fields(nested)
    elif isinstance(value, list):
        for nested in value:
            _reject_forbidden_fields(nested)
    elif value is None or type(value) in {bool, int, str}:
        return
    else:
        _fail("Server payload contains an unsafe value.")


def _server_payload(value: Any, message_type: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("Payload must be an object.")
    _reject_forbidden_fields(value)
    if message_type == "task.snapshot":
        _exact_keys(value, {"tasks", "lastSeq"})
        if type(value["lastSeq"]) is not int or value["lastSeq"] < 0:
            _fail("Invalid task snapshot sequence.")
        if not isinstance(value["tasks"], list):
            _fail("Invalid task snapshot.")
        for task in value["tasks"]:
            if not isinstance(task, dict):
                _fail("Invalid task snapshot.")
            _exact_keys(task, {"taskId", "title", "state", "summary"})
            _identifier(task["taskId"], "taskId")
            _text(task["title"], "title", 256)
            if task["state"] not in _TASK_STATES | {"review"}:
                _fail("Invalid task state.")
            _text(task["summary"], "summary", 1024)
    elif message_type == "task.activity":
        _exact_keys(value, {"taskId", "state"})
        _identifier(value["taskId"], "taskId")
        if value["state"] not in _TASK_STATES:
            _fail("Invalid task state.")
    elif message_type == "task.message":
        _exact_keys(value, {"taskId", "text"})
        _identifier(value["taskId"], "taskId")
        _text(value["text"], "text", 8000)
    elif message_type in {"task.blocked", "task.completed"}:
        _exact_keys(value, {"taskId", "summary"})
        _identifier(value["taskId"], "taskId")
        _text(value["summary"], "summary", 1024)
    elif message_type in {"action.proposed", "action.approval.required"}:
        _exact_keys(value, {"taskId", "actionId", "capability", "summary", "proposalDigest", "expiresAt", "risk", "targets", "state"})
        _identifier(value["taskId"], "taskId"); _identifier(value["actionId"], "actionId")
        _identifier(value["capability"], "capability"); _digest(value["proposalDigest"])
        _text(value["summary"], "summary", 1024); _text(value["expiresAt"], "expiresAt", 64); _identifier(value["risk"], "risk")
        if value["state"] not in _ACTION_STATES:
            _fail("Invalid action state.")
        if not isinstance(value["targets"], list) or not value["targets"] or any(not isinstance(item, str) or item.startswith("/") or "\\" in item or ".." in item.split("/") for item in value["targets"]):
            _fail("Invalid action targets.")
    elif message_type == "action.receipt":
        _exact_keys(value, {"taskId", "actionId", "proposalDigest", "state", "summary", "postDigest"})
        _identifier(value["taskId"], "taskId"); _identifier(value["actionId"], "actionId"); _digest(value["proposalDigest"])
        if value["state"] not in _ACTION_STATES:
            _fail("Invalid action state.")
        _text(value["summary"], "summary", 1024)
        _digest(value["postDigest"])
    elif message_type == "error":
        _exact_keys(value, {"code", "message"})
        _identifier(value["code"], "code"); _text(value["message"], "message")
    return dict(value)


@dataclass(frozen=True)
class V2ClientEnvelope:
    message_type: str
    request_id: str
    payload: dict[str, Any]

    @classmethod
    def from_json(cls, raw: str) -> "V2ClientEnvelope":
        value = _object(raw)
        _exact_keys(value, _CLIENT_KEYS)
        if value["protocolVersion"] != PROTOCOL_VERSION:
            _fail("Unsupported protocol version.")
        if value["type"] not in CLIENT_TYPES:
            _fail("Unsupported request type.")
        _identifier(value["requestId"], "requestId")
        return cls(value["type"], value["requestId"], _payload(value["payload"], value["type"]))


@dataclass(frozen=True)
class V2ServerEnvelope:
    event_type: str
    instance_id: str
    seq: int
    request_id: str | None
    payload: dict[str, Any]

    def __post_init__(self) -> None:
        if self.event_type not in SERVER_TYPES:
            _fail("Unsupported server event type.")
        _identifier(self.instance_id, "instanceId")
        if type(self.seq) is not int or self.seq < 0:
            _fail("Server sequence must be nonnegative.")
        if self.request_id is not None:
            _identifier(self.request_id, "requestId")
        object.__setattr__(self, "payload", _server_payload(self.payload, self.event_type))

    def to_json(self) -> str:
        return stable_json({
            "protocolVersion": PROTOCOL_VERSION, "instanceId": self.instance_id, "seq": self.seq,
            "type": self.event_type, "requestId": self.request_id,
            "payload": _server_payload(self.payload, self.event_type),
        })
