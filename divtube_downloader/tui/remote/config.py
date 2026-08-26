"""Fail-closed configuration for the optional DivTube remote companion."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping


REMOTE_MODES = frozenset({"off", "status_only", "chat_read_only", "downloads_confirmed"})


def _enabled(value: str | None) -> bool:
    return value == "true"


@dataclass(frozen=True)
class RemoteCompanionConfig:
    """The only flags that can make the companion listener eligible to start."""

    enabled: bool
    lan_enabled: bool
    mode: str
    max_paired_devices: int = 3

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "RemoteCompanionConfig":
        source = os.environ if env is None else env
        enabled = _enabled(source.get("DIVTUBE_REMOTE_COMPANION_ENABLED"))
        lan_enabled = _enabled(source.get("DIVTUBE_REMOTE_COMPANION_LAN_ENABLED"))
        mode = source.get("DIVTUBE_REMOTE_COMPANION_MODE", "off")
        if mode not in REMOTE_MODES:
            mode = "off"
        max_paired_devices = _positive_int(source.get("DIVTUBE_REMOTE_COMPANION_MAX_PAIRED_DEVICES"), 3)
        return cls(
            enabled=enabled,
            lan_enabled=lan_enabled,
            mode=mode,
            max_paired_devices=max_paired_devices,
        )

    @property
    def listener_enabled(self) -> bool:
        return self.enabled and self.mode != "off"

    @property
    def bind_host(self) -> str | None:
        if not self.listener_enabled:
            return None
        return "0.0.0.0" if self.lan_enabled else "127.0.0.1"


def _positive_int(value: str | None, default: int) -> int:
    try:
        parsed = int(value) if value is not None else default
    except ValueError:
        return default
    return parsed if parsed > 0 else default
