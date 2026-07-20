"""CollabBridgeService — TUI ↔ scholomance-collab HTTP Streamable MCP client.

Talks to the Node `mcp-bridge.js` server exposed by the Fastify dev server at
``http://127.0.0.1:3000/mcp`` (configurable via ``SCHOLOMANCE_COLLAB_URL``).
The service performs an MCP ``initialize`` handshake on first use, reuses the
returned ``mcp-session-id`` for every subsequent ``tools/call``, and exposes 14
typed methods that wrap the 14 collab tools in scope (see the design spec).

All public methods are non-blocking: the work happens on a worker thread and
the result is delivered via the caller-provided callback. This matches the
``BrainBridgeService`` and ``prompt_service.py`` patterns.
"""

from __future__ import annotations

import json
import os
import threading
import urllib.error
import urllib.request
from typing import Any, Callable


# Scholomance palette (mirrors tui/services/brain_bridge_service.py)
GOLD    = "#FFD700"
PURPLE  = "#B388FF"
SUCCESS = "#7CFF8B"
WARNING = "#FFD166"
ERROR   = "#FF5C7A"
MUTED   = "#6A5A6A"


DEFAULT_URL = "http://127.0.0.1:3000"
INIT_TIMEOUT_S = 10.0
TOOL_TIMEOUT_S = 120.0


class CollabBridgeService:
    """Python client for the scholomance-collab MCP HTTP endpoint."""

    def __init__(
        self,
        base_url: str | None = None,
        key: str | None = None,
        agent_id: str | None = None,
        env_file: str | None = None,
    ):
        # Resolve from explicit kwargs → env vars → defaults.
        self.base_url: str = (
            base_url
            or os.environ.get("SCHOLOMANCE_COLLAB_URL")
            or DEFAULT_URL
        ).rstrip("/")
        self.key: str | None = (
            key if key is not None else os.environ.get("SCHOLOMANCE_COLLAB_KEY")
        )
        self.agent_id: str | None = (
            agent_id if agent_id is not None else os.environ.get("SCHOLOMANCE_COLLAB_AGENT_ID")
        )

        # Session state (populated by _ensure_session()).
        self._session_id: str | None = None
        self._server_info: dict[str, Any] | None = None
        self._lock = threading.Lock()

    # ── Public helpers ────────────────────────────────────────────────────

    def auth_error(self) -> str | None:
        """Return the env-var hint if the service cannot authenticate, else None."""
        if not self.key:
            return (
                "Set SCHOLOMANCE_COLLAB_KEY and SCHOLOMANCE_COLLAB_AGENT_ID in .env. "
                "Get a key by registering a new agent against the running collab server."
            )
        return None

    def is_available(self) -> bool:
        """Fast ``GET /health`` against the Fastify server (no MCP session)."""
        try:
            req = urllib.request.Request(f"{self.base_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                return 200 <= resp.status < 300
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError):
            return False
