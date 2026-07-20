"""Tests for subtlety crash forwarder (hub POST + spool fallback)."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from tui.services.subtlety_crash_forward import forward_crash


class _FakeOkFalseResponse:
    status = 200

    def read(self) -> bytes:
        return b'{"ok": false, "error": "bad-event"}'

    def __enter__(self) -> "_FakeOkFalseResponse":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None


def test_spool_when_hub_down(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUBTLETY_HUB_URL", "http://127.0.0.1:9")  # closed port
    forward_crash(
        "THREAD CRASH (Thread-32)",
        'Traceback...\ntextual._context.NoActiveAppError\n',
        spool_dir=tmp_path,
    )
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    data = files[0].read_text(encoding="utf-8")
    assert "NoActiveAppError" in data


def test_spool_when_hub_returns_ok_false(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_urlopen(_req: object, timeout: float | None = None) -> _FakeOkFalseResponse:
        assert timeout == 0.5
        return _FakeOkFalseResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    forward_crash(
        "THREAD CRASH (Thread-32)",
        "Traceback...\nRuntimeError: hub rejected\n",
        base_url="http://127.0.0.1:3000",
        spool_dir=tmp_path,
    )
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    assert "RuntimeError" in files[0].read_text(encoding="utf-8")
