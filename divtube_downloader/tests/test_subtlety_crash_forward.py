"""Tests for subtlety crash forwarder (hub POST + spool fallback)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from tui.services.subtlety_crash_forward import (
    _build_event,
    _crash_signature,
    _rotate_spool,
    _spool_crash,
    forward_crash,
)


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


# ── Boon 4: dedup + rotation ─────────────────────────────────────────────


def test_signature_is_stable_and_discriminating() -> None:
    event_a = _build_event("THREAD CRASH (Thread-1)", "Traceback...\nValueError: bad\n")
    event_a2 = _build_event("THREAD CRASH (Thread-1)", "Traceback...\nValueError: bad\n")
    event_b = _build_event("THREAD CRASH (Thread-2)", "Traceback...\nKeyError: other\n")
    assert _crash_signature(event_a) == _crash_signature(event_a2)
    assert _crash_signature(event_a) != _crash_signature(event_b)


def test_spool_dedups_identical_crashes(tmp_path: Path) -> None:
    event = _build_event("THREAD CRASH (Thread-9)", "Traceback...\nRuntimeError: same\n")
    _spool_crash(tmp_path, event)
    _spool_crash(tmp_path, event)
    _spool_crash(tmp_path, event)
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1, "byte-identical crashes must collapse to one spool file"
    record = json.loads(files[0].read_text(encoding="utf-8"))
    assert record["count"] == 3
    assert "RuntimeError" in record["stack"]
    assert record["first_seen"] <= record["last_seen"]


def test_spool_keeps_distinct_crashes_separate(tmp_path: Path) -> None:
    _spool_crash(tmp_path, _build_event("THREAD CRASH (A)", "ValueError: one\n"))
    _spool_crash(tmp_path, _build_event("THREAD CRASH (B)", "KeyError: two\n"))
    assert len(list(tmp_path.glob("*.json"))) == 2


def test_rotation_bounds_the_spool(tmp_path: Path) -> None:
    for i in range(12):
        _spool_crash(tmp_path, _build_event(f"THREAD CRASH (T{i})", f"Error: crash-{i}\n"), keep=5)
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 5, "rotation must keep only the N most-recent spool files"


def test_forward_crash_dedups_end_to_end(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SUBTLETY_HUB_URL", "http://127.0.0.1:9")  # closed port -> spool
    for _ in range(3):
        forward_crash(
            "THREAD CRASH (Thread-32)",
            "Traceback...\ntextual._context.NoActiveAppError\n",
            spool_dir=tmp_path,
        )
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    assert json.loads(files[0].read_text(encoding="utf-8"))["count"] == 3
