"""Best-effort crash forwarder: POST to Subtlety hub or spool locally."""
from __future__ import annotations

import datetime
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_HUB_URL = "http://127.0.0.1:8080"
POST_TIMEOUT_S = 0.5
_RUNTIME = "divtube-tui"
_DEFAULT_UNIT_ID = "crash.divtube.tui.unspecified"
_THREAD_HEADER_RE = re.compile(r"^THREAD CRASH \((.+)\)$")


def _divtube_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _default_spool_dir() -> Path:
    return _divtube_root() / "subtlety-spool"


def _env_file_value(key: str) -> str | None:
    """The TUI never loads .env into os.environ; read divtube .env directly."""
    try:
        for line in (_divtube_root() / ".env").read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip() or None
    except OSError:
        pass
    return None


def _resolve_env(key: str) -> str | None:
    return os.environ.get(key) or _env_file_value(key)


def _resolve_base_url(base_url: str | None) -> str:
    return (base_url or _resolve_env("SUBTLETY_HUB_URL") or DEFAULT_HUB_URL).rstrip("/")


def _parse_thread(header: str) -> str | None:
    match = _THREAD_HEADER_RE.match(header.strip())
    return match.group(1) if match else None


def _parse_error_type(exc_text: str) -> tuple[str, str]:
    lines = [line.strip() for line in exc_text.strip().splitlines() if line.strip()]
    if not lines:
        return "Error", ""
    last = lines[-1]
    if ":" in last:
        error_type, message = last.split(":", 1)
        return error_type.strip() or "Error", message.strip()
    return last, last


def _build_event(header: str, exc_text: str) -> dict:
    error_type, message = _parse_error_type(exc_text)
    return {
        "runtime": _RUNTIME,
        "unitId": _DEFAULT_UNIT_ID,
        "errorType": error_type,
        "message": message,
        "stack": exc_text,
        "thread": _parse_thread(header),
    }


def _post_crash(base_url: str, event: dict) -> None:
    payload = json.dumps(event).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    token = (_resolve_env("SUBTLETY_INGEST_TOKEN") or "").strip()
    if token:
        headers["x-subtlety-token"] = token
    req = urllib.request.Request(
        f"{base_url}/subtlety/crash",
        data=payload,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=POST_TIMEOUT_S) as resp:
        if resp.status >= 400:
            raise urllib.error.HTTPError(
                req.full_url, resp.status, resp.reason, resp.headers, None
            )
        raw = resp.read()
        if raw:
            try:
                body = json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return
            if body.get("ok") is False:
                raise RuntimeError("hub rejected crash ingest")


def _spool_crash(spool_dir: Path, event: dict) -> None:
    spool_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = spool_dir / f"{stamp}-{os.getpid()}.json"
    path.write_text(json.dumps(event), encoding="utf-8")


def forward_crash(
    header: str,
    exc_text: str,
    *,
    base_url: str | None = None,
    spool_dir: Path | None = None,
) -> None:
    """POST crash JSON to the Subtlety hub; spool locally when the hub is down."""
    hub = _resolve_base_url(base_url)
    target_spool = spool_dir or _default_spool_dir()
    event = _build_event(header, exc_text)
    try:
        _post_crash(hub, event)
    except Exception:
        _spool_crash(target_spool, event)
