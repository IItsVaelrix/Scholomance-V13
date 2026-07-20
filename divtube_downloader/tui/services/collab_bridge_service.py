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
        # TODO: handle text/event-stream if the bridge ever streams (spec currently excludes SSE)
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
        show_context: bool = False,
        deterministic: bool = True,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        """Dispatch a Vaelrix ForceField ask via the collab bridge.

        NOTE: the real Zod schema on the server only accepts ``query`` at the
        moment. ``show_context`` and ``deterministic`` are accepted here for
        signature compatibility with the ``_wrap`` call site (so the 4-positional
        bind does not raise TypeError) and are reserved for future schema
        relaxation — they are not forwarded over the wire.
        """
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

    # ── Collab control surface ────────────────────────────────────────────

    def status_get(self, callback: Callable[[str], None] = lambda r: None) -> None:
        self.call_tool("mcp_scholomance_collab_status_get", {}, callback)

    def task_list(
        self,
        status: str | None = None,
        limit: int = 50,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        args: dict[str, Any] = {"limit": limit}
        if status is not None:
            args["status"] = status
        self.call_tool("mcp_scholomance_collab_task_list", args, callback)

    def task_get(
        self,
        task_id: str,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        self.call_tool(
            "mcp_scholomance_collab_task_get", {"id": task_id}, callback
        )

    def task_update(
        self,
        task_id: str,
        note: str,
        status: str | None = None,
        priority: int | None = None,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        if not note:
            callback(f"[{ERROR}]task_update: note is required (Rule 12)[/]")
            return
        args: dict[str, Any] = {"id": task_id, "note": note}
        if status is not None:
            args["status"] = status
        if priority is not None:
            args["priority"] = priority
        self.call_tool("mcp_scholomance_collab_task_update", args, callback)

    def lock_list(self, callback: Callable[[str], None] = lambda r: None) -> None:
        self.call_tool("mcp_scholomance_collab_lock_list", {}, callback)

    def agent_list(
        self,
        role: str | None = None,
        status: str | None = None,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        args: dict[str, Any] = {}
        if role is not None:
            args["role"] = role
        if status is not None:
            args["status"] = status
        self.call_tool("mcp_scholomance_collab_agent_list", args, callback)

    def forensic_search(
        self,
        query: str,
        is_regex: bool = False,
        case_sensitive: bool = False,
        include_pattern: str | None = None,
        exclude_pattern: str | None = None,
        limit: int = 75,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        args: dict[str, Any] = {
            "query": query,
            "isRegex": is_regex,
            "caseSensitive": case_sensitive,
            "limit": limit,
        }
        if include_pattern is not None:
            args["includePattern"] = include_pattern
        if exclude_pattern is not None:
            args["excludePattern"] = exclude_pattern
        self.call_tool("mcp_scholomance_collab_forensic_search", args, callback)

    def immunity_scan_file(
        self,
        content: str,
        file_path: str,
        callback: Callable[[str], None] = lambda r: None,
    ) -> None:
        self.call_tool(
            "mcp_scholomance_collab_immunity_scan_file",
            {"content": content, "filePath": file_path},
            callback,
        )


# ── Renderers ─────────────────────────────────────────────────────────────
#
# Each collab tool returns a JSON-RPC result that ``call_tool`` serialises to
# a string. The renderers below turn that string into a Rich-markup log line
# suitable for ``ui.log_msg``. New tools fall through to pretty-printed JSON
# so the service never crashes on an unfamiliar shape.


def _parse(raw: str) -> dict | None:
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(parsed, dict):
        # MCP wraps content under "structuredContent" or "content[*].text".
        if "structuredContent" in parsed and isinstance(parsed["structuredContent"], dict):
            return parsed["structuredContent"]
        return parsed
    return None


def _kv(label: str, value, color: str = GOLD) -> str:
    return f"[{color}]{label}:[/] {value}"


def render_result(tool_name: str, raw_json: str) -> str:
    """Render a tool's JSON-RPC result into Rich markup for the TUI log."""
    data = _parse(raw_json)
    if data is None:
        return str(raw_json)

    r = _RENDERERS.get(tool_name, _render_default)
    return r(data)


def _render_default(data: dict) -> str:
    return json.dumps(data, indent=2, default=str)


def _render_list_brains(data: dict) -> str:
    brains = data.get("brains") or []
    if not brains:
        return f"[{MUTED}]No brains registered.[/]"
    lines = [f"[bold {PURPLE}]Brains ({len(brains)})[/]"]
    for b in brains:
        bid = b.get("id") or b.get("brainId") or "?"
        desc = b.get("description") or ""
        lines.append(f"  [{GOLD}]{bid}[/]  [{MUTED}]{desc}[/]")
    return "\n".join(lines)


def _render_status_get(data: dict) -> str:
    agents = data.get("agents") or {}
    tasks = data.get("tasks") or {}
    locks = data.get("locks") or 0
    pipelines = data.get("pipelines") or {}
    lines = [f"[bold {GOLD}]Collab plane[/]"]
    if isinstance(agents, dict):
        online = len(agents.get("online") or [])
        busy = len(agents.get("busy") or [])
        lines.append(f"  agents  online={online}  busy={busy}")
    if isinstance(tasks, dict):
        bits = "  ".join(f"{k}={v}" for k, v in tasks.items() if isinstance(v, int))
        if bits:
            lines.append(f"  tasks   {bits}")
    lines.append(f"  locks={locks}")
    if isinstance(pipelines, dict) and pipelines:
        bits = "  ".join(f"{k}={v}" for k, v in pipelines.items() if isinstance(v, int))
        if bits:
            lines.append(f"  pipelines {bits}")
    return "\n".join(lines)


def _render_task_list(data: dict) -> str:
    tasks = data.get("tasks") or data.get("items") or []
    if not tasks:
        return f"[{MUTED}]No tasks.[/]"
    lines = [f"[bold {PURPLE}]Tasks ({len(tasks)})[/]"]
    for t in tasks:
        tid = t.get("id") or "?"
        title = (t.get("title") or "")[:60]
        status = t.get("status") or "?"
        prio = t.get("priority")
        prio_s = f"  P{prio}" if prio is not None else ""
        lines.append(
            f"  [{GOLD}]{tid}[/]  [{status}]{status}[/]{prio_s}  {title}"
        )
    return "\n".join(lines)


def _render_task_get(data: dict) -> str:
    return _render_default(data)


def _render_lock_list(data: dict) -> str:
    locks = data.get("locks") or []
    if not locks:
        return f"[{MUTED}]No active locks.[/]"
    lines = [f"[bold {PURPLE}]Locks ({len(locks)})[/]"]
    for l in locks:
        path = l.get("filePath") or l.get("path") or "?"
        agent = l.get("agentId") or l.get("agent_id") or "?"
        when = l.get("acquiredAt") or l.get("acquired_at") or ""
        lines.append(f"  [{GOLD}]{path}[/]  [{MUTED}]{agent}  {when}[/]")
    return "\n".join(lines)


def _render_agent_list(data: dict) -> str:
    agents = data.get("agents") or []
    if not agents:
        return f"[{MUTED}]No agents.[/]"
    lines = [f"[bold {PURPLE}]Agents ({len(agents)})[/]"]
    for a in agents:
        aid = a.get("id") or "?"
        role = a.get("role") or "?"
        status = a.get("status") or "?"
        task = a.get("currentTaskId") or ""
        task_s = f"  task={task}" if task else ""
        lines.append(f"  [{GOLD}]{aid}[/]  [{status}]{status}[/]  role={role}{task_s}")
    return "\n".join(lines)


def _render_forensic_search(data: dict) -> str:
    hits = data.get("hits") or []
    if not hits:
        return f"[{MUTED}]No matches.[/]"
    lines = [f"[bold {PURPLE}]Matches ({len(hits)})[/]"]
    for h in hits[:50]:
        file = h.get("file") or h.get("path") or "?"
        line_no = h.get("line") or 0
        snippet = (h.get("snippet") or h.get("text") or "")[:120]
        lines.append(f"  [{GOLD}]{file}:{line_no}[/]  {snippet}")
    return "\n".join(lines)


def _render_scdna_genes(data: dict) -> str:
    genes = data.get("genes") or []
    if not genes:
        return f"[{MUTED}]No genes active for this domain.[/]"
    lines = [f"[bold {PURPLE}]SCDNA genes ({len(genes)})[/]"]
    for g in genes:
        gid = g.get("id") or "?"
        dom = g.get("domain_primary") or g.get("domain") or "?"
        imp = (g.get("imperative") or "")[:80]
        lines.append(f"  [{GOLD}]{gid}[/]  [{MUTED}]{dom}[/]  {imp}")
    return "\n".join(lines)


def _render_scholomance_feedback(data: dict) -> str:
    verdict = data.get("verdict") or "?"
    findings = data.get("findings") or []
    rec = data.get("recommendation") or ""
    lines = [f"[bold {GOLD}]Scholomance feedback: {verdict}[/]"]
    for f in findings[:8]:
        lines.append(f"  - {f}")
    if rec:
        lines.append(f"  [{PURPLE}]recommendation:[/] {rec}")
    return "\n".join(lines)


def _render_immunity_scan_file(data: dict) -> str:
    violations = data.get("violations") or []
    if not violations:
        return f"[{SUCCESS}]Immunity scan: clean.[/]"
    lines = [f"[bold {ERROR}]Immunity violations ({len(violations)})[/]"]
    for v in violations:
        sev = v.get("severity") or "?"
        rule = v.get("ruleId") or v.get("rule") or "?"
        msg = v.get("message") or v.get("msg") or ""
        lines.append(f"  [{sev}]{sev}[/]  [{GOLD}]{rule}[/]  {msg}")
    return "\n".join(lines)


def _render_forcefield_ask(data: dict) -> str:
    """The full forcefield payload — render answer + key fields."""
    answer = data.get("answer")
    if isinstance(answer, dict):
        summary = answer.get("summary") or answer.get("direct") or ""
        kf = answer.get("key_findings") or []
        lines = [f"[bold {GOLD}]ForceField[/]  [{MUTED}]{summary}[/]"]
        for f in kf[:8]:
            lines.append(f"  - {f}")
    else:
        lines = [f"[bold {GOLD}]ForceField[/]  {answer or ''}"]
    next_action = data.get("next_action")
    if next_action:
        lines.append(f"  [{PURPLE}]next:[/] {next_action}")
    scdna_genes = data.get("scdna_genes") or []
    if scdna_genes:
        lines.append(f"  [{MUTED}]scdna genes: {len(scdna_genes)}[/]")
    health = data.get("health_signals") or data.get("scdna_health_signals") or []
    if health:
        lines.append(f"  [{MUTED}]health signals: {len(health)}[/]")
    return "\n".join(lines)


_RENDERERS: dict[str, Callable[[dict], str]] = {
    "mcp_scholomance_collab_brain_forcefield_ask": _render_forcefield_ask,
    "mcp_scholomance_collab_brain_list": _render_list_brains,
    "mcp_scholomance_collab_brain_run": _render_default,
    "mcp_scholomance_collab_brain_scdna_genes": _render_scdna_genes,
    "mcp_scholomance_collab_skill_scholomance_feedback": _render_scholomance_feedback,
    "mcp_scholomance_collab_skill_scholomance_knowledge": _render_default,
    "mcp_scholomance_collab_status_get": _render_status_get,
    "mcp_scholomance_collab_task_list": _render_task_list,
    "mcp_scholomance_collab_task_get": _render_task_get,
    "mcp_scholomance_collab_task_update": _render_default,
    "mcp_scholomance_collab_lock_list": _render_lock_list,
    "mcp_scholomance_collab_agent_list": _render_agent_list,
    "mcp_scholomance_collab_forensic_search": _render_forensic_search,
    "mcp_scholomance_collab_immunity_scan_file": _render_immunity_scan_file,
}
