"""Safe bridge from authenticated remote requests to the existing Cockpit agent."""

from __future__ import annotations

import re
import threading
import uuid
from typing import Any

from rich.markdown import Markdown
from rich.text import Text

from tui.remote.capability_policy import filter_remote_tools


_POSIX_PATH = re.compile(r"(?<![\w.-])/(?:[^\s/]+/)+[^\s]+")
_WINDOWS_PATH = re.compile(r"\b[A-Za-z]:\\(?:[^\s\\]+\\)+[^\s]+")


def sanitize_remote_text(value: Any) -> str:
    if isinstance(value, Markdown):
        raw = value.markup
    elif isinstance(value, Text):
        raw = value.plain
    else:
        raw = str(value)
    try:
        raw = Text.from_markup(raw).plain
    except Exception:
        pass
    raw = "".join(character for character in raw if character in "\n\t" or ord(character) >= 0x20)
    raw = _WINDOWS_PATH.sub("[local path]", raw)
    raw = _POSIX_PATH.sub("[local path]", raw)
    return raw[:8000]


class RemoteCockpitAdapter:
    def __init__(self, prompt_service, event_hub, download_queue=None) -> None:
        self.prompt_service = prompt_service
        self.event_hub = event_hub
        self.download_queue = download_queue
        self._active: set[str] = set()
        self._lock = threading.Lock()

    def submit_chat(self, device_id: str, request_id: str, text: str) -> bool:
        with self._lock:
            if device_id in self._active:
                self.event_hub.publish(
                    "error",
                    {"code": "chat_busy", "message": "A chat turn is already active for this device."},
                    request_id=request_id,
                )
                return False
            self._active.add(device_id)

        selected_tools = filter_remote_tools(self.prompt_service.tools.tools)
        fragments: list[str] = []
        self.event_hub.publish("chat.activity", {"state": "thinking"}, request_id=request_id)

        def callback(value: Any) -> None:
            plain = sanitize_remote_text(value)
            if plain.strip():
                fragments.append(plain)
                self.event_hub.publish(
                    "chat.message",
                    {"messageId": "msg-" + uuid.uuid4().hex, "role": "assistant", "text": plain, "terminal": False},
                    request_id=request_id,
                )

        def finished(ok: bool, detail: str) -> None:
            try:
                terminal = sanitize_remote_text(detail or ("complete" if ok else "failed"))
                self.event_hub.publish(
                    "chat.message",
                    {"messageId": "msg-" + uuid.uuid4().hex, "role": "assistant", "text": terminal, "terminal": True},
                    request_id=request_id,
                )
                self.event_hub.publish("chat.activity", {"state": "idle" if ok else "failed"}, request_id=request_id)
            finally:
                with self._lock:
                    self._active.discard(device_id)

        try:
            self.prompt_service.prompt(
                text,
                callback,
                agent_id=f"remote:{device_id}:main",
                tools=selected_tools,
                on_finished=finished,
            )
        except Exception:
            finished(False, "failed to start")
            raise
        return True

    def dispatch(self, device_id, envelope) -> bool:
        if envelope.type == "chat.turn.request":
            return self.submit_chat(device_id, envelope.requestId, envelope.payload["text"])
        if envelope.type == "download.request":
            return self.submit_download(envelope)
        return False

    def submit_download(self, envelope) -> bool:
        if self.download_queue is None:
            return False
        from .remote_download_queue import RemoteDownloadRequest
        request = RemoteDownloadRequest(
            envelope.requestId,
            envelope.payload["url"],
            envelope.payload["mediaType"],
            envelope.payload["rightsConfirmed"],
        )
        self.download_queue.submit(request)
        return True
