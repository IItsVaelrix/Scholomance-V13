"""Canonical DivTube Cockpit remote protocol v1 contracts."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from threading import Lock
from typing import Any, ClassVar
from urllib.parse import urlparse

PROTOCOL_VERSION = "divtube-remote-v1"
CLIENT_TYPES = frozenset({
    "session.hello",
    "chat.turn.request",
    "download.request",
    "status.snapshot.request",
})
SERVER_TYPES = frozenset({
    "status.snapshot",
    "chat.activity",
    "chat.message",
    "download.accepted",
    "download.progress",
    "download.completed",
    "error",
})

_ENVELOPE_KEYS = frozenset({"protocolVersion", "type", "requestId", "payload"})
_SERVER_KEYS = frozenset({"protocolVersion", "instanceId", "seq", "type", "requestId", "payload"})
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_YOUTUBE_HOSTS = frozenset({
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtu.be", "www.youtu.be",
})
_COCKPIT_STATES = frozenset({"idle", "thinking", "looking", "responding", "downloading", "failed"})
_CHAT_ACTIVITY_STATES = frozenset({"thinking", "looking", "responding", "idle", "failed"})
_JOB_STATES = frozenset({"queued", "downloading", "processing", "failed", "cancelled"})
_COMPLETED_JOB_STATES = frozenset({"completed", "failed", "cancelled"})
_FORBIDDEN_SERVER_FIELD_NAMES = frozenset({
    "api_key", "apikey", "arguments", "authorization", "command", "config",
    "credential", "credentials", "cwd", "directory", "env", "headers", "password",
    "path", "paths", "secret", "secrets", "shell", "shelloutput", "stdout", "stderr",
    "token", "tokens", "url",
})


@dataclass(frozen=True)
class ProtocolError(Exception):
    """A deterministic protocol validation failure."""

    code: str
    message: str

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)


def stable_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _fail(message: str, code: str = "invalid_envelope") -> None:
    raise ProtocolError(code, message)


def _object(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ProtocolError("invalid_json", "Envelope must contain valid JSON.") from exc
    if not isinstance(data, dict):
        _fail("Envelope must be an object.")
    return data


def _exact_keys(value: dict[str, Any], expected: set[str] | frozenset[str]) -> None:
    if set(value) != set(expected):
        _fail("Envelope contains missing or extra keys.")


def _string(value: Any, field: str, *, max_length: int = 128) -> str:
    if not isinstance(value, str) or not value or len(value) > max_length or any(0xD800 <= ord(c) <= 0xDFFF for c in value):
        _fail(f"Invalid {field}.", f"invalid_{field}")
    return value


def _identifier(value: Any, field: str) -> str:
    value = _string(value, field)
    if not _IDENTIFIER.fullmatch(value):
        _fail(f"Invalid {field}.", f"invalid_{field}")
    return value


def _display_text(value: Any, field: str, *, max_length: int = 512) -> str:
    value = _string(value, field, max_length=max_length)
    if "\x00" in value or any(ord(character) < 0x20 and character not in "\n\r\t" for character in value):
        _fail(f"Invalid {field}.", f"invalid_{field}")
    return value


def _bounded_percent(value: Any, field: str = "percent") -> int:
    if type(value) is not int or not 0 <= value <= 100:
        _fail(f"Invalid {field}.", f"invalid_{field}")
    return value


def _exact_object(value: Any, expected: set[str], field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(f"{field} must be an object.", f"invalid_{field}")
    _exact_keys(value, expected)
    return value


def _reject_forbidden_server_fields(value: Any) -> None:
    if isinstance(value, dict):
        for key, nested_value in value.items():
            if not isinstance(key, str):
                _fail("Server payload keys must be strings.", "invalid_payload")
            normalized = re.sub(r"[^a-z0-9]", "", key.lower())
            if normalized in _FORBIDDEN_SERVER_FIELD_NAMES:
                _fail("Server payload includes a forbidden field.", "unsafe_payload_field")
            _reject_forbidden_server_fields(nested_value)
    elif isinstance(value, list):
        for nested_value in value:
            _reject_forbidden_server_fields(nested_value)
    elif value is None or type(value) in {str, bool, int}:
        return
    else:
        _fail("Server payload contains an unsafe value.", "invalid_payload")


def _payload(data: dict[str, Any], message_type: str) -> None:
    expected: dict[str, set[str]] = {
        "session.hello": {"appVersion"},
        "chat.turn.request": {"text", "conversation"},
        "download.request": {"url", "mediaType", "rightsConfirmed"},
        "status.snapshot.request": set(),
    }
    _exact_keys(data, expected[message_type])
    if message_type == "session.hello":
        _string(data["appVersion"], "appVersion", max_length=64)
    elif message_type == "chat.turn.request":
        text = data["text"]
        if not isinstance(text, str) or any(0xD800 <= ord(c) <= 0xDFFF for c in text) or not 1 <= len(text) <= 8000:
            _fail("Chat text must contain 1 to 8,000 Unicode scalar values.", "invalid_chat_text")
        _identifier(data["conversation"], "conversation")
    elif message_type == "download.request":
        url = _string(data["url"], "url", max_length=2048)
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.hostname not in _YOUTUBE_HOSTS or not parsed.path:
            _fail("Download URL must be an HTTPS YouTube URL.", "invalid_url")
        if data["mediaType"] not in {"video", "audio"}:
            _fail("Media type must be video or audio.", "invalid_media_type")
        if type(data["rightsConfirmed"]) is not bool or data["rightsConfirmed"] is not True:
            _fail("Rights confirmation is required.", "rights_not_confirmed")


def _job_summary(value: Any) -> dict[str, Any]:
    data = _exact_object(value, {"jobId", "mediaType", "percent", "state"}, "activeJobs entry")
    job_id = _identifier(data["jobId"], "jobId")
    if not isinstance(data["mediaType"], str) or data["mediaType"] not in {"video", "audio"}:
        _fail("Media type must be video or audio.", "invalid_media_type")
    percent = _bounded_percent(data["percent"])
    if not isinstance(data["state"], str) or data["state"] not in _JOB_STATES:
        _fail("Invalid download state.", "invalid_state")
    return {"jobId": job_id, "mediaType": data["mediaType"], "percent": percent, "state": data["state"]}


def _server_payload(data: Any, message_type: str) -> dict[str, Any]:
    if not isinstance(data, dict):
        _fail("Payload must be an object.")
    _reject_forbidden_server_fields(data)

    if message_type == "status.snapshot":
        payload = _exact_object(data, {"cockpit", "activeJobs"}, "status snapshot payload")
        cockpit = _exact_object(payload["cockpit"], {"state"}, "cockpit")
        if not isinstance(cockpit["state"], str) or cockpit["state"] not in _COCKPIT_STATES:
            _fail("Invalid cockpit state.", "invalid_state")
        if not isinstance(payload["activeJobs"], list) or len(payload["activeJobs"]) > 100:
            _fail("activeJobs must contain at most 100 summaries.", "invalid_activeJobs")
        return {"cockpit": {"state": cockpit["state"]}, "activeJobs": [_job_summary(job) for job in payload["activeJobs"]]}

    if message_type == "chat.activity":
        payload = _exact_object(data, {"state"}, "chat activity payload")
        if not isinstance(payload["state"], str) or payload["state"] not in _CHAT_ACTIVITY_STATES:
            _fail("Invalid chat activity state.", "invalid_state")
        return {"state": payload["state"]}

    if message_type == "chat.message":
        payload = _exact_object(data, {"messageId", "role", "text", "terminal"}, "chat message payload")
        if payload["role"] != "assistant":
            _fail("Invalid chat message role.", "invalid_role")
        if type(payload["terminal"]) is not bool:
            _fail("terminal must be a boolean.", "invalid_terminal")
        return {
            "messageId": _identifier(payload["messageId"], "messageId"),
            "role": payload["role"],
            "text": _display_text(payload["text"], "text", max_length=8000),
            "terminal": payload["terminal"],
        }

    if message_type == "download.accepted":
        payload = _exact_object(data, {"jobId", "mediaType", "sourceHost"}, "download accepted payload")
        if not isinstance(payload["mediaType"], str) or payload["mediaType"] not in {"video", "audio"}:
            _fail("Media type must be video or audio.", "invalid_media_type")
        if not isinstance(payload["sourceHost"], str) or payload["sourceHost"] not in _YOUTUBE_HOSTS:
            _fail("Invalid source host.", "invalid_sourceHost")
        return {"jobId": _identifier(payload["jobId"], "jobId"), "mediaType": payload["mediaType"], "sourceHost": payload["sourceHost"]}

    if message_type == "download.progress":
        payload = _exact_object(data, {"jobId", "percent", "speed", "eta", "state"}, "download progress payload")
        if not isinstance(payload["state"], str) or payload["state"] not in _JOB_STATES:
            _fail("Invalid download state.", "invalid_state")
        return {
            "jobId": _identifier(payload["jobId"], "jobId"),
            "percent": _bounded_percent(payload["percent"]),
            "speed": _display_text(payload["speed"], "speed", max_length=64),
            "eta": _display_text(payload["eta"], "eta", max_length=64),
            "state": payload["state"],
        }

    if message_type == "download.completed":
        payload = _exact_object(data, {"jobId", "state", "filename"}, "download completed payload")
        filename = _display_text(payload["filename"], "filename", max_length=255)
        if "/" in filename or "\\" in filename or filename in {".", ".."}:
            _fail("filename must be display-safe and not a path.", "invalid_filename")
        if not isinstance(payload["state"], str) or payload["state"] not in _COMPLETED_JOB_STATES:
            _fail("Invalid completed download state.", "invalid_state")
        return {"jobId": _identifier(payload["jobId"], "jobId"), "state": payload["state"], "filename": filename}

    if message_type == "error":
        expected = {"code", "message"}
        if isinstance(data, dict) and "field" in data:
            expected.add("field")
        payload = _exact_object(data, expected, "error payload")
        result = {
            "code": _identifier(payload["code"], "code"),
            "message": _display_text(payload["message"], "message", max_length=512),
        }
        if "field" in payload:
            result["field"] = _identifier(payload["field"], "field")
        return result

    _fail("Unsupported server event type.", "unknown_type")


@dataclass(frozen=True)
class ClientEnvelope:
    protocolVersion: str
    type: str
    requestId: str
    payload: dict[str, Any]

    @classmethod
    def from_json(cls, raw: str) -> "ClientEnvelope":
        data = _object(raw)
        _exact_keys(data, _ENVELOPE_KEYS)
        if data["protocolVersion"] != PROTOCOL_VERSION:
            _fail("Unsupported protocol version.", "protocol_mismatch")
        if data["type"] not in CLIENT_TYPES:
            _fail("Unsupported request type.", "unknown_type")
        _identifier(data["requestId"], "requestId")
        if not isinstance(data["payload"], dict):
            _fail("Payload must be an object.")
        _payload(data["payload"], data["type"])
        return cls(data["protocolVersion"], data["type"], data["requestId"], data["payload"])


@dataclass(frozen=True)
class ServerEnvelope:
    type: str
    instance_id: str
    seq: int
    request_id: str | None
    payload: dict[str, Any]
    protocol_version: str = PROTOCOL_VERSION

    _sequences: ClassVar[dict[str, int]] = {}
    _sequence_lock: ClassVar[Lock] = Lock()

    def __post_init__(self) -> None:
        if self.protocol_version != PROTOCOL_VERSION:
            _fail("Unsupported protocol version.", "protocol_mismatch")
        if self.type not in SERVER_TYPES:
            _fail("Unsupported server event type.", "unknown_type")
        _identifier(self.instance_id, "instanceId")
        if type(self.seq) is not int or self.seq < 0:
            _fail("Server sequence must be a nonnegative integer.", "invalid_seq")
        if self.request_id is not None:
            _identifier(self.request_id, "requestId")
        object.__setattr__(self, "payload", _server_payload(self.payload, self.type))

    @classmethod
    def next_sequence(cls, instance_id: str) -> int:
        _identifier(instance_id, "instanceId")
        with cls._sequence_lock:
            cls._sequences[instance_id] = cls._sequences.get(instance_id, 0) + 1
            return cls._sequences[instance_id]

    def to_json(self) -> str:
        return stable_json({
            "protocolVersion": self.protocol_version,
            "instanceId": self.instance_id,
            "seq": self.seq,
            "type": self.type,
            "requestId": self.request_id,
            "payload": _server_payload(self.payload, self.type),
        })
