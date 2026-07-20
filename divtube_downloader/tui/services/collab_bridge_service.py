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

    # ── HTTP helpers ──────────────────────────────────────────────────────

    def _http_request(
        self,
        method: str,
        path: str,
        body: dict | None,
        timeout: float,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        """Perform a single HTTP request. Returns (status, headers, body_bytes)."""
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json, text/event-stream")
        if self.key:
            req.add_header("Authorization", f"Bearer {self.key}")
        if self.agent_id:
            req.add_header("X-Agent-ID", self.agent_id)
        if self._session_id:
            req.add_header("mcp-session-id", self._session_id)
        if extra_headers:
            for k, v in extra_headers.items():
                req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers or {}), e.read() or b""

    def _ensure_session(self) -> None:
        """Perform the MCP ``initialize`` handshake if no session is active."""
        with self._lock:
            if self._session_id is not None:
                return
            init_body = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "divtube-tui", "version": "0.1.0"},
                },
            }
            status, headers, raw = self._http_request(
                "POST", "/mcp", init_body, INIT_TIMEOUT_S
            )
            if status < 200 or status >= 300:
                raise RuntimeError(
                    f"collab /mcp initialize failed: HTTP {status}"
                )
            # MCP returns the session id in the response header.
            session = headers.get("Mcp-Session-Id") or headers.get("mcp-session-id")
            if not session:
                raise RuntimeError(
                    "collab /mcp initialize returned no Mcp-Session-Id header"
                )
            self._session_id = session
            # Best-effort: parse serverInfo from the response body.
            try:
                parsed = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                parsed = {}
            self._server_info = (
                parsed.get("result", {}).get("serverInfo")
                if isinstance(parsed, dict) else None
            )

    def _maybe_rotate_session(self, headers: dict[str, str]) -> None:
        """Server may rotate the session id; pick up the new value if present."""
        new_id = headers.get("Mcp-Session-Id") or headers.get("mcp-session-id")
        if new_id and new_id != self._session_id:
            self._session_id = new_id

    # ── Core dispatcher ───────────────────────────────────────────────────

    def call_tool(
        self,
        name: str,
        args: dict,
        callback: Callable[[str], None],
    ) -> None:
        """Dispatch a ``tools/call`` to the bridge. Result is delivered via callback."""

        def run():
            err = self.auth_error()
            if err:
                callback(f"[{ERROR}]{name}: {err}[/]")
                return
            try:
                self._ensure_session()
            except Exception as e:
                callback(f"[{ERROR}]{name}: initialize failed — {e}[/]")
                return
            body = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": name, "arguments": args or {}},
            }
            try:
                status, headers, raw = self._http_request(
                    "POST", "/mcp", body, TOOL_TIMEOUT_S
                )
            except Exception as e:
                callback(f"[{ERROR}]{name}: transport error — {e}[/]")
                return
            self._maybe_rotate_session(headers)
            if status < 200 or status >= 300:
                callback(
                    f"[{ERROR}]{name}: HTTP {status} — "
                    f"{raw[:200].decode('utf-8', errors='replace')}[/]"
                )
                return
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as e:
                callback(f"[{ERROR}]{name}: non-JSON response ({e})[/]")
                return
            if isinstance(parsed, dict) and parsed.get("error"):
                msg = parsed["error"].get("message", "unknown error")
                callback(f"[{ERROR}]{name}: {msg}[/]")
                return
            result = parsed.get("result") if isinstance(parsed, dict) else None
            if result is None:
                callback(f"[{MUTED}]{name}: empty result[/]")
                return
            callback(json.dumps(result, indent=2, default=str))

        threading.Thread(target=run, daemon=True).start()

    def close(self) -> None:
        """Send ``DELETE /mcp`` to close the session. Never raises."""
        if not self._session_id:
            return
        try:
            self._http_request("DELETE", "/mcp", None, 5.0)
        except Exception:
            pass
        self._session_id = None
        self._server_info = None

    # ── Forcefield surface ────────────────────────────────────────────────

    def forcefield_ask(
        self,
        query: str,
        callback: Callable[[str], None] = lambda r: None,
        *,
        show_context: bool = False,
        deterministic: bool = True,
    ) -> None:
        self.call_tool(
            "mcp_scholomance_collab_brain_forcefield_ask",
            {"query": query},
            callback,
        )

    def list_brains(self, callback: Callable[[str], None] = lambda r: None) -> None:
        self.call_tool("mcp_scholomance_collab_brain_list", {}, callback)

    def run_brain(
        self,
        brain_id: str,
        query: str,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        self.call_tool(
            "mcp_scholomance_collab_brain_run",
            {"name": brain_id, "query": query},
            callback,
        )

    def get_scdna_genes(
        self,
        domain: str = "all",
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        self.call_tool(
            "mcp_scholomance_collab_brain_scdna_genes",
            {"domain": domain},
            callback,
        )

    def scholomance_feedback(
        self,
        subject: str,
        mode: str = "A",
        context: str | None = None,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        args: dict[str, Any] = {"subject": subject, "mode": mode}
        if context is not None:
            args["context"] = context
        self.call_tool(
            "mcp_scholomance_collab_skill_scholomance_feedback", args, callback
        )

    def scholomance_knowledge(
        self, callback: Callable[[str], None] = lambda r: None
    ) -> None:
        self.call_tool("mcp_scholomance_collab_skill_scholomance_knowledge", {}, callback)
