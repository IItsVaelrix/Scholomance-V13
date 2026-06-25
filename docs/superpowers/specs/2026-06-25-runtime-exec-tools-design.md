# Persistent Runtime Execution Tools — Design

**Date:** 2026-06-25
**Component:** `divtube_downloader` TUI cockpit — `ToolService`
**Status:** Approved (brainstorming)

## Goal

Give the cockpit's AI agents a **more powerful runtime-execution primitive** than
the existing one-shot, 15-second `run_command` shell tool: a **persistent bash
session** and a **persistent in-process Python REPL**, both surviving across tool
calls, with an explicit reset.

## Context

The cockpit has two AI paths:

1. **Cloud / OpenAI-compatible model** — `tui/services/prompt_service.py` runs a
   tool-use loop (`MAX_TURNS=50`) that enumerates `self.tools.tools` and dispatches
   through `self.tools.execute_tool(name, args, callback)`. Already has the gated
   `run_command` shell tool plus ~40 others via `ToolService`.
2. **Local "Vaelrix" SteamDeck brain** — `tui/services/brain_bridge_service.py` →
   Ollama daemon on :9090. Calls `client.ask(text)`; tool calls execute *inside the
   daemon*, and the cockpit only displays them.

`content_critic_service.py` also consumes `ToolService` the same way as path 1.

**Key fact:** any tool added to `ToolService.tools` + a dispatch branch in
`execute_tool` is automatically exposed to every path that goes through
`ToolService` (the cloud-model loop and content-critic).

## Scope

- **In scope:** the `ToolService`-consuming paths (cloud model, content-critic).
- **Out of scope:** the local Vaelrix/Ollama brain. It executes tools inside its own
  daemon process, so cockpit-side `ToolService` tools do not reach it; wiring it
  would require daemon-side changes. Explicitly excluded so the design does not
  imply coverage it lacks.

## Architecture

### New module: `tui/services/exec_session_service.py`

A **module-level singleton** `RuntimeExecSession` (accessed via a module function,
e.g. `get_exec_session()`). It MUST be module-global rather than an attribute of a
`ToolService` instance, because `prompt_service` and `content_critic_service` each
construct their own `ToolService()`; a global singleton is the only way the session
state genuinely persists and is shared across both.

Responsibilities:

- **Persistent bash subprocess** — one long-lived `bash` process with piped
  stdin/stdout/stderr. Each command is run via a sentinel protocol: write
  `<command>\n` followed by `printf '<MARKER>%s\n' "$?"`, then read stdout until the
  `<MARKER>` line, parsing the trailing exit code. `cd`, `export`, and shell
  variables persist across calls because it is a single shell. The marker is a
  random per-session UUID so it cannot collide with command output.
- **Persistent in-process Python namespace** — a single `dict` used as both globals
  for `exec`. Execution: parse the code; `exec` all but a trailing expression
  statement, then `eval` the trailing expression (if any) to capture its value
  (REPL semantics). `stdout`/`stderr` captured by temporarily redirecting
  `sys.stdout`/`sys.stderr` to `io.StringIO`. Imports and variables persist across
  calls. Namespace seeded with `os`, `sys`, `json`, the live `ToolService` instance,
  and the running TUI `app` (see Wiring).
- **`threading.Lock`** serializing concurrent tool calls so the bash sentinel
  protocol and the shared Python namespace are not corrupted by overlapping calls.

### New tools (added to `ToolService.tools` schema list + `execute_tool` dispatch)

| Tool          | Params                                              | Returns |
|---------------|-----------------------------------------------------|---------|
| `bash_session`| `command` (string, required), `timeout` (int, default 30) | combined stdout/stderr (truncated like `run_command`) + exit code; cwd/env persist |
| `python_exec` | `code` (string, required), `timeout` (int, default 30)    | captured stdout + `repr` of trailing-expression value (if any) + traceback on error; vars persist |
| `exec_reset`  | `target` (enum: `bash` \| `python` \| `all`, default `all`) | confirmation string; restarts bash and/or clears the Python namespace |

`is_coding_action` is **not** set on these (they are not file edits, so they should
not trigger the diff-panel rendering path).

### Data flow

```
AI model → tool_call(bash_session|python_exec|exec_reset)
  → ToolService.execute_tool(name, kwargs, callback)
      → get_exec_session().run_bash(...) | run_python(...) | reset(...)
          → (bash) write to persistent shell, read to sentinel, return output
          → (python) exec/eval in persistent namespace under watchdog, return output
  → tool_result string → appended to messages → loop continues
```

## Safety envelope (timeout + cancel only)

- **Bash timeout:** hard, process-level. On deadline, send SIGINT to the shell's
  foreground process group; if still alive, kill and respawn the shell (state lost,
  reported to the model). Reliable.
- **Python in-process timeout:** **best-effort.** Python cannot force-terminate a
  thread. A watchdog thread injects an async exception via
  `ctypes.pythonapi.PyThreadState_SetAsyncExc(thread_id, SystemExit/TimeoutError)`
  into the executing thread. This interrupts pure-Python loops (e.g. `while True:
  pass`) but **cannot interrupt a blocked C call** (e.g. C-level `time.sleep`, a hung
  socket read). This single non-absolute guarantee is accepted and documented.
- **No `_safe_cmd` blocklist** and **no gate-keeper cooldown** on these three tools.
  The `_gate_check` redundancy/cooldown guard at the top of `execute_tool` is
  exempted for `bash_session`, `python_exec`, and `exec_reset` (they are the
  intentionally-powerful path; repeated calls are expected).
- **Esc-cancellation** continues to work *between* tool calls via the existing
  controller (`agent_cancelled(token)` checks in the agent loops), unchanged. There
  is no per-call Esc interruption mid-exec; the per-call timeout is the in-call
  guard.

## Wiring (one hook in `app.py`)

On app mount, call `get_exec_session().bind_app(self)` so `python_exec`'s namespace
can expose the live `app`. Textual's `active_app` ContextVar is **not** usable from
the worker thread the tool loop runs on — that is exactly the `NoActiveAppError`
seen in the cockpit's crash logs — so an explicit bind is used instead of relying on
the ContextVar. If the app is never bound (e.g. headless tests), `app` is `None` in
the namespace.

## Testing (TDD)

`divtube_downloader/tests/test_exec_session.py`, headless (no Textual required, the
session is standalone):

1. **bash persistence:** `cd /tmp` then `pwd` in a second call returns `/tmp`;
   `export X=1` then `echo $X` returns `1`.
2. **bash reset:** after `exec_reset(target=bash)`, `pwd` returns the original cwd.
3. **bash timeout:** `sleep 60` with `timeout=1` returns a timeout result quickly and
   leaves the session usable afterward.
4. **python persistence:** `x = 41` then `x + 1` returns `42` (trailing-expression
   value); an `import` in one call is usable in the next.
5. **python stdout + traceback:** `print("hi")` captured; `1/0` returns a traceback
   string, not a raised exception.
6. **python reset:** after `exec_reset(target=python)`, referencing `x` raises
   `NameError` (namespace cleared).
7. **python timeout:** `while True: pass` with `timeout=1` returns a timeout result
   (best-effort interrupt) within a few seconds.

## Files changed

- **new** `tui/services/exec_session_service.py` — `RuntimeExecSession` + singleton accessor.
- **edit** `tui/services/tool_service.py` — 3 schema entries; 3 dispatch branches; `_gate_check` exemption.
- **edit** `tui/ui/app.py` — `bind_app` hook on mount.
- **new** `tests/test_exec_session.py` — the tests above.
