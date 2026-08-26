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
        if not isinstance(self.payload, dict):
            _fail("Payload must be an object.")

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
            "payload": self.payload,
        })
