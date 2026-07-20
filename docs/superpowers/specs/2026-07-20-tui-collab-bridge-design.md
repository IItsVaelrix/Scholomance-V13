# TUI ↔ scholomance-collab Bridge — Design

**Date:** 2026-07-20
**Status:** Draft → user review

## Problem

The DivTube TUI cockpit currently has no path to the full Vaelrix ForceField
pipeline. The brain daemon's HTTP `/ask` endpoint (`brain_daemon.py`) is wired
to the legacy `steamdeck_brain.BrainBridge` (Cortex + Ollama with the Vaelrix
personality), and its structured payload — SCDNA genes, amplifier results,
arbiter output, health signals, gated tool calls, personality weights,
diagnostic-memory submission, persisted ForceField — is collapsed into a text
summary by `NoLLMBridge._format()`. The full forcefield surface is therefore
invisible to the cockpit.

The `scholomance-collab` MCP bridge (Node, Fastify) exposes that surface over
HTTP Streamable MCP at `http://127.0.0.1:3000/mcp`. This spec adds a Python
TUI service that talks to it.

## Goals

1. Give cockpit agents a single typed Python surface for the full forcefield
   (`brain_forcefield_ask`, `brain_run`, `brain_list`, `brain_scdna_genes`),
   scholomance review (`skill_scholomance_feedback`, `skill_scholomance_knowledge`),
   and collab control plane (`status_get`, `task_list/get/update`, `lock_list`,
   `agent_list`, `forensic_search`, `immunity_scan_file`).
2. Replace the cockpit's text-collapsed Vaelrix path with the structured
   payload as the canonical forcefield surface (`/collab-forcefield`).
3. Do not duplicate any surface the cockpit already exposes.

## Non-goals

- No write-side mutating tools (`task_create`, `lock_acquire`, `edit_file`,
  `apply_patch`, `message_send`, pipeline or bug tools). The cockpit is a
  read/observe surface — mutations go through the planning step elsewhere.
- No stdio fallback. HTTP Streamable only. Add stdio later if a real need
  appears.
- No SSE streaming. None of the 14 tools in scope stream responses; all
  return single JSON bodies.
- No retry/backoff. Single attempt, fast failure. Matches the
  `agent_service.py` style.
- Do not modify or remove any existing cockpit service or command.

## Existing cockpit surface (de-duplication audit)

Audited against `divtube_downloader/tui/ui/app.py` registry and the sidebar
section list. The following existing capabilities cover part of what the
bridge exposes; we deliberately do **not** re-implement them:

| Bridge tool | Existing cockpit surface | Action |
|---|---|---|
| `phenotypic_ideal` | `/phenotypic` (uses `scholomance-bridge.mjs` subprocess) | **Skip** — duplicate |
| `search_codebase` | `/archive-search` (TurboQuant index via `ArchiveBridge`) | **Skip** — duplicate |
| `diagnostic_summary` | `/health`, `/health-emit`, `/health-verify` (`BytecodeBridge`) | **Skip** — duplicate scope |

`/vaelrix` (the brain-daemon path) is **kept** as a legacy surface and is not
modified. The new `/collab-forcefield` is the canonical path for forcefield
queries going forward; the new command's help text and the sidebar label
make this explicit. The `BrainBridgeService` and `/daemon-start`,
`/daemon-stop` commands remain untouched.

## Architecture

```
DivTube TUI (Python)
  │  /collab-* slash commands in tui/ui/app.py
  │            │
  │            ▼
  │    CollabBridgeService  (new — tui/services/collab_bridge_service.py)
  │            │
  │   JSON-RPC over HTTP Streamable MCP
  │            │
  └───────────►│  http://127.0.0.1:3000/mcp
                │   (Fastify collab MCP HTTP routes —
                │    mcp-http.routes.js, StreamableHTTPServerTransport)
                ▼
   mcp-bridge.js (createCollabMcpServer)
                │
                ▼
   vaelrix_forcefield.brain_bridge.BrainBridge
   + all collab control-plane operations
```

The Python TUI reuses the same Node bridge that already serves Claude, Grok,
Codex, and other MCP clients. No new server, no new protocol.

## Component 1: `tui/services/collab_bridge_service.py`

Mirrors the `BrainBridgeService` shape: lazy client, thread-pooled callbacks,
graceful unavailability.

### Configuration

- `SCHOLOMANCE_COLLAB_URL` env var (default `http://127.0.0.1:3000`)
- `SCHOLOMANCE_COLLAB_KEY` env var — the agent's Bearer key issued by
  `POST /agents/register`. If absent, the service degrades with a clear
  message (see Error handling).
- `SCHOLOMANCE_COLLAB_AGENT_ID` env var — required for `task_update` and any
  other tool that the bridge expects to be called with an `X-Agent-ID`
  header. Optional otherwise; if absent we omit the header.

### Connection lifecycle

- `__init__(base_url=None, env_file=None)` — reads env, builds an
  `urllib.request`-based HTTP client (no extra dependency; the cockpit
  already uses `urllib` in `prompt_service.py` and `app.py`).
- `_ensure_session()` — runs the MCP `initialize` handshake the first time
  any tool is called. Stores `self._session_id` and `self._server_info`.
  Subsequent calls reuse them.
- `is_available()` — fast `GET /health` against the Fastify server (no
  session required). Returns `False` if the server is down so the TUI can
  show the start hint without paying the cost of a full handshake.
- `close()` — sends `DELETE /mcp` with the session header; clears state.

### Core dispatcher

```python
def call_tool(self, name: str, args: dict, callback) -> None
```

- Generates a monotonic JSON-RPC `id`, dispatches the work to a worker
  thread, and:
  1. Calls `_ensure_session()` on the worker thread.
  2. POSTs `{"jsonrpc":"2.0","id":<n>,"method":"tools/call","params":{"name":<name>,"arguments":<args>}}`
     with headers:
     ```
     Content-Type: application/json
     Accept: application/json, text/event-stream
     Authorization: Bearer <SCHOLOMANCE_COLLAB_KEY>
     X-Agent-ID: <SCHOLOMANCE_COLLAB_AGENT_ID>  (if set)
     mcp-session-id: <session>                    (after initialize)
     ```
  3. Parses the response. JSON-RPC `error` → `callback(f"[{ERROR}]<name>: {err['message']}[/]")`.
     `result.structuredContent` (or `result.content[*].text`) → pretty-printed
     JSON via `callback(json.dumps(result, indent=2, default=str))`.
- All typed methods are thin wrappers over `call_tool`.

### Typed methods (14)

| Method | MCP tool | Args (snake_case) |
|---|---|---|
| `forcefield_ask(query, show_context=False, deterministic=True, callback)` | `mcp_scholomance_collab_brain_forcefield_ask` | `query` |
| `run_brain(brain_id, query, callback)` | `mcp_scholomance_collab_brain_run` | `name`, `query` |
| `list_brains(callback)` | `mcp_scholomance_collab_brain_list` | — |
| `get_scdna_genes(domain="all", callback)` | `mcp_scholomance_collab_brain_scdna_genes` | `domain` |
| `scholomance_feedback(subject, mode="A", context=None, callback)` | `mcp_scholomance_collab_skill_scholomance_feedback` | `subject`, `mode`, `context?` |
| `scholomance_knowledge(callback)` | `mcp_scholomance_collab_skill_scholomance_knowledge` | — |
| `status_get(callback)` | `mcp_scholomance_collab_status_get` | — |
| `task_list(status=None, limit=50, callback)` | `mcp_scholomance_collab_task_list` | `status?`, `limit` |
| `task_get(task_id, callback)` | `mcp_scholomance_collab_task_get` | `id` |
| `task_update(task_id, note, status=None, priority=None, callback)` | `mcp_scholomance_collab_task_update` | `id`, `note` (required, Rule 12), `status?`, `priority?` |
| `lock_list(callback)` | `mcp_scholomance_collab_lock_list` | — |
| `agent_list(role=None, status=None, callback)` | `mcp_scholomance_collab_agent_list` | `role?`, `status?` |
| `forensic_search(query, is_regex=False, case_sensitive=False, include_pattern=None, exclude_pattern=None, limit=75, callback)` | `mcp_scholomance_collab_forensic_search` | `query`, `isRegex`, `caseSensitive`, `includePattern?`, `excludePattern?`, `limit` |
| `immunity_scan_file(content, file_path, callback)` | `mcp_scholomance_collab_immunity_scan_file` | `content`, `filePath` |

All 14 follow the same shape: `def name(self, ..., callback)` and dispatch to
`call_tool` on a worker thread. The TUI is a Textual app and must not block
the event loop.

### Renderers

Each method is paired with a small renderer that turns the JSON-RPC result
into a log-friendly string. The service exposes `render_result(tool_name,
result)` so commands can use it without duplicating formatting logic.

- `forcefield_ask` → renders `answer`, `key_findings`, `next_action`,
  `findings` (if `show_context=True`), SCDNA gene count, health-signal count.
- `run_brain` → renders the brain's raw result.
- `list_brains` → table of `id` + `description`.
- `get_scdna_genes` → table of `id` + `domain_primary` + `imperative`.
- `scholomance_feedback` → renders `verdict`, `findings`, `recommendation`.
- `scholomance_knowledge` → renders the knowledge dump verbatim.
- `status_get` → plane summary (agents online/busy, tasks by status, locks).
- `task_list` / `task_get` → table with id, title, status, priority, agent.
- `lock_list` → table with file_path, agent_id, acquired_at.
- `agent_list` → table with id, role, status, current_task.
- `forensic_search` → file:line:snippet.
- `immunity_scan_file` → list of violations with severity + rule.

The dispatcher's default fallback (when no renderer matches) is pretty-printed
JSON, so adding new tools later does not break the service.

### Error handling

| Condition | Behavior |
|---|---|
| Server down (connection refused, DNS, timeout on `/health`) | `is_available()` returns `False`; command prints `npm run dev:server` hint in error color |
| `SCHOLOMANCE_COLLAB_KEY` missing | First tool call prints `Set SCHOLOMANCE_COLLAB_KEY and SCHOLOMANCE_COLLAB_AGENT_ID in .env` in error color; service short-circuits |
| `initialize` returns non-2xx (401) | Print `Auth failed — check SCHOLOMANCE_COLLAB_KEY in .env` in error color |
| Tool returns JSON-RPC `error` | Print `error.message` verbatim in error color |
| `DELETE /mcp` on shutdown fails | Log a warning, do not raise |

## Component 2: TUI integration in `tui/ui/app.py`

Add a `setup_collab_commands()` method, called alongside
`setup_daemon_commands()` (line 1388) in the same `__init__`. New commands
and one new sidebar section.

### Commands (12)

| Command | Args | Calls | Notes |
|---|---|---|---|
| `/collab-status` | — | `status_get` | One-line plane summary |
| `/collab-forcefield` | `<query>` | `forcefield_ask` | **Canonical forcefield path** (replaces `/vaelrix` for new code) |
| `/collab-brains` | — | `list_brains` | Discoverability for `/collab-brain` |
| `/collab-brain` | `<id> <query>` | `run_brain` | Single brain |
| `/collab-genes` | `[domain]` | `get_scdna_genes` | Defaults to `all` |
| `/collab-tasks` | `[status]` | `task_list` | Defaults to all statuses |
| `/collab-task` | `<id> [note]` | `task_get`, optional `task_update` | With a `note` arg, appends a Rule-12 note |
| `/collab-agents` | — | `agent_list` | Online/busy filter optional |
| `/collab-locks` | — | `lock_list` | File lock board |
| `/collab-grep` | `<pattern> [--regex]` | `forensic_search` | Literal by default; `--regex` switches to regex |
| `/collab-feedback` | `<A-H> <subject>` | `scholomance_feedback` | Mode A=Concept ... H=Law Tribunal |
| `/collab-knowledge` | — | `scholomance_knowledge` | Dump knowledge base |

Each handler:
1. Lazily imports `CollabBridgeService` so app startup stays cheap.
2. Parses args.
3. Calls the typed method with a callback that calls `ui.call_from_thread(ui.log_msg, ...)`.
4. On error, prints a clear red message.

### Sidebar (one new section)

```python
("COLLAB", ["/collab-status", "/collab-forcefield", "/collab-brain", "/collab-brains",
            "/collab-genes", "/collab-tasks", "/collab-task", "/collab-agents",
            "/collab-locks", "/collab-grep", "/collab-feedback", "/collab-knowledge"]),
```

Inserted between `("PHENOTYPIC", …)` and `("ARCHIVE", …)`. The existing
sections stay untouched.

### First-time setup (env-var only in v1)

The TUI does not auto-register an agent. The user obtains a key by running
the collab server's CLI registration flow (already documented for other
agents) and sets `SCHOLOMANCE_COLLAB_KEY` and `SCHOLOMANCE_COLLAB_AGENT_ID`
in `.env`. If the env vars are missing, every `/collab-*` command prints
the same env-var hint (see Error handling). Adding a `/collab-register`
helper is deferred to a follow-up spec.

## Tests

`divtube_downloader/tests/test_collab_bridge_service.py`:

1. **Unit: JSON-RPC framing** — mock `http.server` that captures the request
   body and headers; assert each call sends the expected `id`, `method`,
   `params`, `mcp-session-id`, `Authorization`, and `X-Agent-ID`.
2. **Unit: session lifecycle** — first call sends no session; response sets
   one via `Mcp-Session-Id` header; subsequent calls include it; `close()`
   sends `DELETE` with the session.
3. **Unit: error envelope** — JSON-RPC `{"error": {"code": -32600, "message": "..."}}`
   surfaces the message in the callback.
4. **Unit: auth-missing path** — without `SCHOLOMANCE_COLLAB_KEY`, the
   service short-circuits with the env-var hint.
5. **Unit: each typed method** — assert the correct `tools/call` payload is
   constructed (name + snake→camelCase argument conversion).
6. **Live (gated by `RUN_LIVE_COLLAB=1`)** — hits the real bridge on
   `127.0.0.1:3000` with a 5-second timeout, calls `status_get`, and asserts
   a non-error response. Skipped by default in CI.

## File ownership

| File | Change |
|---|---|
| `divtube_downloader/tui/services/collab_bridge_service.py` | **New** (~280 lines) |
| `divtube_downloader/tui/ui/app.py` | **Extend** — add `setup_collab_commands()` method (~120 lines) and one call to it from `__init__` |
| `divtube_downloader/tui/ui/widgets/sidebar.py` | **Extend** — one new tuple in `SECTIONS` |
| `divtube_downloader/tests/test_collab_bridge_service.py` | **New** (~200 lines) |

Total: ~600 lines new + ~5 lines touched.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `mcp-session-id` rotation mid-session | After every successful `tools/call`, check the response for a new `mcp-session-id` header (MCP allows server rotation) and re-cache it. |
| Long forcefield calls (60–120s) block a worker thread | Each `call_tool` runs on a fresh `threading.Thread(daemon=True)`, matching the existing `BrainBridgeService` pattern. The TUI's `controller.agent_cancelled(token)` pattern from `prompt_service.py` is **out of scope** for v1 — added in a follow-up if the long-running `/collab-forcefield` becomes annoying. |
| `urllib` vs `httpx` | Use `urllib` to avoid a new dependency. The cockpit already uses `urllib` in `prompt_service.py` and `app.py`. |
| Server endpoint ever changes (Fastify route or path) | Configurable via `SCHOLOMANCE_COLLAB_URL`; default is `http://127.0.0.1:3000`. |
| Backward-compat with `/vaelrix` users | `/vaelrix` stays; documentation in the new command's help text points users to the canonical path. |

## Out of scope (YAGNI, re-stated)

- No write tools (no `task_create`, `lock_acquire`, `edit_file`, `apply_patch`,
  `message_send`, `pipeline_*`, `bug_*`).
- No SSE streaming.
- No stdio fallback.
- No retry/backoff.
- No `/collab-register` command in v1 (env-var hint only — see First-time setup).
- No automatic agent registration at TUI startup.
- No removal of existing commands or services.

## Open question

None. The de-duplication question was answered in the prior turn (drop
`phenotypic_ideal`, `search_codebase`, `diagnostic_summary`; keep the
`/vaelrix` legacy path). The transport (HTTP Streamable) and the integration
shape (service + new commands) were answered in the prior turn.
