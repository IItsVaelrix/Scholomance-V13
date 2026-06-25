# Persistent Runtime Execution Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent bash session and a persistent in-process Python REPL as AI tools on the cockpit's `ToolService`, so every `ToolService`-consuming AI path (cloud model, content-critic) gets stateful, more-powerful runtime execution than the one-shot `run_command`.

**Architecture:** A module-level singleton `RuntimeExecSession` (in a new `tui/services/exec_session_service.py`) owns a long-lived `bash` subprocess and a persistent Python namespace dict. Three new tools (`bash_session`, `python_exec`, `exec_reset`) are added to `ToolService.tools` and dispatched in `execute_tool`. The TUI app binds itself into the session on mount so `python_exec` can touch live cockpit objects.

**Tech Stack:** Python 3.13, `subprocess`, `threading`, `ctypes` (async exception injection), `ast` (REPL eval-last-expression), `unittest` (matches existing tests in `divtube_downloader/tests/`).

## Global Constraints

- All paths in this plan are relative to `/home/deck/Downloads/Scholomance-V12-main/divtube_downloader/` unless noted.
- Tests use the `unittest` framework (matching `tests/test_rate_limiter.py`); run with `python3 -m pytest <path> -v` from the `divtube_downloader/` directory.
- The session object MUST be a module-level singleton accessed via `get_exec_session()` — never an instance attribute of `ToolService` (each AI path constructs its own `ToolService()`, so only a module global truly persists/shares state).
- The three new tools must NOT carry `is_coding_action: True` (they are not file edits).
- The three new tools must be exempt from the `_gate_check` cooldown at the top of `execute_tool`.
- Bash timeout is a hard process-group kill. Python in-process timeout is best-effort via `ctypes.pythonapi.PyThreadState_SetAsyncExc` (cannot interrupt a blocked C call) — this limitation is accepted, do not try to "fix" it with more force.

---

### Task 1: Persistent bash session

**Files:**
- Create: `tui/services/exec_session_service.py`
- Test: `tests/test_exec_session.py`

**Interfaces:**
- Consumes: nothing (standalone, headless).
- Produces:
  - `get_exec_session() -> RuntimeExecSession` (module singleton accessor)
  - `RuntimeExecSession.run_bash(command: str, timeout: int = 30) -> str`
  - `RuntimeExecSession.reset(target: str = "all") -> str` (this task implements `target in {"bash","all"}`; the `"python"` branch is added in Task 2)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_exec_session.py`:

```python
"""Tests for RuntimeExecSession — persistent bash + python exec for AI tools.

Each test uses a fresh session instance (not the module singleton) so state
does not leak between tests.
"""

import time
import unittest

from tui.services.exec_session_service import RuntimeExecSession


class BashSessionTest(unittest.TestCase):
    def setUp(self):
        self.sess = RuntimeExecSession()

    def tearDown(self):
        self.sess.reset("all")

    def test_cwd_persists_across_calls(self):
        self.sess.run_bash("cd /tmp")
        out = self.sess.run_bash("pwd")
        self.assertIn("/tmp", out)

    def test_env_var_persists_across_calls(self):
        self.sess.run_bash("export SCHOLO_TEST_VAR=42")
        out = self.sess.run_bash("echo $SCHOLO_TEST_VAR")
        self.assertIn("42", out)

    def test_reset_bash_restores_origin_cwd(self):
        origin = self.sess.run_bash("pwd").strip()
        self.sess.run_bash("cd /tmp")
        self.sess.reset("bash")
        out = self.sess.run_bash("pwd")
        self.assertIn(origin.splitlines()[0].split("(")[0].strip() or "/", out)

    def test_bash_timeout_kills_and_recovers(self):
        start = time.time()
        out = self.sess.run_bash("sleep 60", timeout=1)
        elapsed = time.time() - start
        self.assertLess(elapsed, 10, "timeout did not fire promptly")
        self.assertIn("timed out", out.lower())
        # session still usable afterwards
        out2 = self.sess.run_bash("echo recovered")
        self.assertIn("recovered", out2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_exec_session.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'tui.services.exec_session_service'`

- [ ] **Step 3: Write the bash half of the session module**

Create `tui/services/exec_session_service.py`:

```python
"""Persistent runtime-execution session shared by the cockpit's AI tools.

Owns a long-lived bash subprocess and (Task 2) a persistent in-process Python
namespace. Exposed to AI agents through ToolService as bash_session /
python_exec / exec_reset. A single module-level singleton is shared across the
multiple ToolService instances the cockpit creates.
"""

import os
import signal
import subprocess
import threading
import uuid

_OUT_LIMIT = 4000


class RuntimeExecSession:
    def __init__(self):
        self._lock = threading.RLock()
        self._bash = None
        self._marker = None
        self._origin_cwd = os.getcwd()
        # ── python state (Task 2) ──
        self._py_ns = None
        self._app = None

    # ── bash ────────────────────────────────────────────────────────
    def _ensure_bash(self):
        if self._bash is not None and self._bash.poll() is None:
            return
        self._marker = "__EXEC_DONE_%s__" % uuid.uuid4().hex
        self._bash = subprocess.Popen(
            ["bash"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd=self._origin_cwd,
            start_new_session=True,
        )

    def _kill_bash(self):
        if self._bash is not None:
            try:
                os.killpg(os.getpgid(self._bash.pid), signal.SIGKILL)
            except Exception:
                try:
                    self._bash.kill()
                except Exception:
                    pass
            self._bash = None

    def run_bash(self, command, timeout=30):
        with self._lock:
            self._ensure_bash()
            sh = self._bash
            marker = self._marker
            try:
                sh.stdin.write(command + "\n")
                sh.stdin.write('echo "%s $?"\n' % marker)
                sh.stdin.flush()
            except (BrokenPipeError, OSError):
                self._kill_bash()
                return "(bash session died; restarted — re-run your command)"

            lines = []
            exit_code = [None]
            done = threading.Event()

            def reader():
                for line in sh.stdout:
                    if line.startswith(marker):
                        parts = line.strip().split()
                        try:
                            exit_code[0] = int(parts[-1])
                        except Exception:
                            exit_code[0] = -1
                        break
                    lines.append(line)
                done.set()

            t = threading.Thread(target=reader, daemon=True)
            t.start()

            if not done.wait(timeout):
                # interrupt the foreground command in the shell's process group
                try:
                    os.killpg(os.getpgid(sh.pid), signal.SIGINT)
                except Exception:
                    pass
                if not done.wait(2):
                    self._kill_bash()
                    return "(bash timed out after %ss; session restarted)" % timeout
                return self._format_bash("".join(lines), exit_code[0], note="interrupted after %ss" % timeout)

            return self._format_bash("".join(lines), exit_code[0])

    def _format_bash(self, output, code, note=None):
        output = output.rstrip("\n")
        if len(output) > _OUT_LIMIT:
            output = output[:_OUT_LIMIT] + "\n... [output truncated]"
        tail = ""
        if note:
            tail = "\n(%s)" % note
        elif code is not None:
            tail = "" if output else ""
            output = output or "(no output)"
            tail = "\n(exit %s)" % code
        return (output + tail) if output or tail else "(no output)"

    # ── reset ───────────────────────────────────────────────────────
    def reset(self, target="all"):
        with self._lock:
            msgs = []
            if target in ("bash", "all"):
                self._kill_bash()
                msgs.append("bash session reset")
            # python branch added in Task 2
            return "; ".join(msgs) if msgs else "nothing reset"


_session = None


def get_exec_session():
    global _session
    if _session is None:
        _session = RuntimeExecSession()
    return _session
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_exec_session.py -v`
Expected: PASS (4 tests). If `test_reset_bash_restores_origin_cwd` is brittle on your shell, the origin is whatever `pwd` returned first; the assertion only checks the restored cwd contains that path.

- [ ] **Step 5: Commit**

```bash
git add tui/services/exec_session_service.py tests/test_exec_session.py
git commit -m "feat(exec): persistent bash session for cockpit AI tools

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Persistent in-process Python REPL + app binding

**Files:**
- Modify: `tui/services/exec_session_service.py`
- Test: `tests/test_exec_session.py` (add a second TestCase)

**Interfaces:**
- Consumes: `RuntimeExecSession` from Task 1.
- Produces:
  - `RuntimeExecSession.run_python(code: str, timeout: int = 30, host=None) -> str`
  - `RuntimeExecSession.bind_app(app) -> None`
  - `RuntimeExecSession.reset(target)` now also handles `target in {"python","all"}`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_exec_session.py` (before the `if __name__` block):

```python
class PythonExecTest(unittest.TestCase):
    def setUp(self):
        self.sess = RuntimeExecSession()

    def tearDown(self):
        self.sess.reset("all")

    def test_variable_persists_across_calls(self):
        self.sess.run_python("x = 41")
        out = self.sess.run_python("x + 1")
        self.assertIn("42", out)

    def test_import_persists_across_calls(self):
        self.sess.run_python("import math")
        out = self.sess.run_python("math.floor(3.9)")
        self.assertIn("3", out)

    def test_stdout_is_captured(self):
        out = self.sess.run_python("print('hello-exec')")
        self.assertIn("hello-exec", out)

    def test_exception_returns_traceback_not_raise(self):
        out = self.sess.run_python("1/0")
        self.assertIn("ZeroDivisionError", out)

    def test_reset_python_clears_namespace(self):
        self.sess.run_python("y = 99")
        self.sess.reset("python")
        out = self.sess.run_python("y")
        self.assertIn("NameError", out)

    def test_python_timeout_interrupts_busy_loop(self):
        start = time.time()
        out = self.sess.run_python("while True:\n    pass", timeout=1)
        elapsed = time.time() - start
        self.assertLess(elapsed, 10, "python timeout did not fire promptly")
        self.assertIn("timed out", out.lower())

    def test_bind_app_exposes_app_in_namespace(self):
        marker = object()
        self.sess.bind_app(marker)
        out = self.sess.run_python("id(app)")
        self.assertIn(str(id(marker)), out)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_exec_session.py::PythonExecTest -v`
Expected: FAIL with `AttributeError: 'RuntimeExecSession' object has no attribute 'run_python'`

- [ ] **Step 3: Add the Python REPL to the module**

In `tui/services/exec_session_service.py`, add these imports at the top (after the existing imports):

```python
import ast
import ctypes
import io
import json
import sys
import traceback
```

Add this module-level helper and sentinel near the top (after `_OUT_LIMIT = 4000`):

```python
_NO_VALUE = object()


def _async_raise(thread_id, exctype):
    """Best-effort: inject *exctype* into the thread with id *thread_id*.

    Interrupts pure-Python loops; cannot interrupt a blocked C call.
    """
    res = ctypes.pythonapi.PyThreadState_SetAsyncExc(
        ctypes.c_long(thread_id), ctypes.py_object(exctype)
    )
    if res > 1:
        ctypes.pythonapi.PyThreadState_SetAsyncExc(ctypes.c_long(thread_id), None)


def _run_repl(code, ns):
    """Exec all statements; eval a trailing expression and return its value."""
    block = ast.parse(code, mode="exec")
    if block.body and isinstance(block.body[-1], ast.Expr):
        last = ast.Expression(block.body.pop().value)
        if block.body:
            exec(compile(block, "<exec_session>", "exec"), ns)
        return eval(compile(last, "<exec_session>", "eval"), ns)
    exec(compile(block, "<exec_session>", "exec"), ns)
    return _NO_VALUE
```

Add these methods to `RuntimeExecSession` (place after `run_bash`/`_format_bash`, before `reset`):

```python
    # ── python ──────────────────────────────────────────────────────
    def bind_app(self, app):
        self._app = app
        if self._py_ns is not None:
            self._py_ns["app"] = app

    def _ensure_ns(self):
        if self._py_ns is None:
            self._py_ns = {
                "__name__": "__exec_session__",
                "os": os,
                "sys": sys,
                "json": json,
                "app": self._app,
                "tools": None,
            }
        return self._py_ns

    def run_python(self, code, timeout=30, host=None):
        with self._lock:
            ns = self._ensure_ns()
            ns["app"] = self._app
            if host is not None:
                ns["tools"] = host

            buf = io.StringIO()
            holder = {"value": _NO_VALUE, "exc": None}

            def target():
                try:
                    holder["value"] = _run_repl(code, ns)
                except BaseException:
                    holder["exc"] = traceback.format_exc()

            old_out, old_err = sys.stdout, sys.stderr
            sys.stdout = sys.stderr = buf
            th = threading.Thread(target=target, daemon=True)
            th.start()
            th.join(timeout)
            timed_out = th.is_alive()
            if timed_out:
                _async_raise(th.ident, TimeoutError)
                th.join(2)
            sys.stdout, sys.stderr = old_out, old_err

            out = buf.getvalue()
            if timed_out:
                return (out + "\n(python timed out after %ss; best-effort interrupt sent)" % timeout).strip()
            if holder["exc"]:
                return (out + holder["exc"]).strip()
            val = holder["value"]
            if val is not _NO_VALUE and val is not None:
                out += repr(val)
            return out.strip() if out.strip() else "(no output)"
```

Update `reset` to clear the namespace — replace the existing `reset` body's comment line with the python branch:

```python
    def reset(self, target="all"):
        with self._lock:
            msgs = []
            if target in ("bash", "all"):
                self._kill_bash()
                msgs.append("bash session reset")
            if target in ("python", "all"):
                self._py_ns = None
                msgs.append("python namespace cleared")
            return "; ".join(msgs) if msgs else "nothing reset"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_exec_session.py -v`
Expected: PASS (11 tests total — 4 bash + 7 python).

- [ ] **Step 5: Commit**

```bash
git add tui/services/exec_session_service.py tests/test_exec_session.py
git commit -m "feat(exec): persistent in-process python REPL + app binding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Expose the three tools through ToolService

**Files:**
- Modify: `tui/services/tool_service.py` (tool schemas ~line 1191 close of `self.tools = [...]`; `execute_tool` dispatch ~line 1202; gate at ~line 1203)
- Test: `tests/test_exec_session.py` (add a `ToolServiceExecTest`)

**Interfaces:**
- Consumes: `get_exec_session` from Task 2; the existing `ToolService.execute_tool(tool_name, kwargs, callback=None)`.
- Produces: tool names `bash_session`, `python_exec`, `exec_reset` resolvable via `ToolService().execute_tool(...)` and present in `ToolService().tools`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_exec_session.py` (before `if __name__`):

```python
class ToolServiceExecTest(unittest.TestCase):
    def setUp(self):
        from tui.services.tool_service import ToolService
        self.svc = ToolService()

    def tearDown(self):
        from tui.services.exec_session_service import get_exec_session
        get_exec_session().reset("all")

    def test_tools_are_registered_in_schema(self):
        names = {t["function"]["name"] for t in self.svc.tools}
        self.assertIn("bash_session", names)
        self.assertIn("python_exec", names)
        self.assertIn("exec_reset", names)

    def test_bash_session_tool_runs(self):
        out = self.svc.execute_tool("bash_session", {"command": "echo via-toolservice"})
        self.assertIn("via-toolservice", out)

    def test_python_exec_tool_runs_and_persists(self):
        self.svc.execute_tool("python_exec", {"code": "z = 7"})
        out = self.svc.execute_tool("python_exec", {"code": "z * 6"})
        self.assertIn("42", out)

    def test_exec_reset_tool_clears_python(self):
        self.svc.execute_tool("python_exec", {"code": "w = 5"})
        self.svc.execute_tool("exec_reset", {"target": "python"})
        out = self.svc.execute_tool("python_exec", {"code": "w"})
        self.assertIn("NameError", out)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_exec_session.py::ToolServiceExecTest -v`
Expected: FAIL — `test_tools_are_registered_in_schema` fails (names absent) and the exec tests return `"Tool not found."`

- [ ] **Step 3a: Register the import and schemas**

In `tui/services/tool_service.py`, add to the imports at the top of the file (after `import subprocess`):

```python
from tui.services.exec_session_service import get_exec_session
```

Then find the close of the `self.tools = [...]` list (the lines reading):

```python
                }
            }
        ]
 
    def _init_persistence(self):
```

Replace the closing `]` line so the three schemas are appended inside the list — change:

```python
                }
            }
        ]
```

to:

```python
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "bash_session",
                    "description": "Run a shell command in a PERSISTENT bash session. Unlike run_command, the working directory, exported env vars, and shell state PERSIST across calls. Use for multi-step shell work. Default timeout 30s; on timeout the command is killed and the session restarted.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {"type": "string", "description": "Shell command to run in the persistent session."},
                            "timeout": {"type": "integer", "description": "Seconds before the command is killed (default 30).", "default": 30}
                        },
                        "required": ["command"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "python_exec",
                    "description": "Execute Python in a PERSISTENT in-process REPL inside the running cockpit. Variables and imports persist across calls. A trailing expression's value is returned (REPL semantics); stdout is captured. The namespace exposes os, sys, json, the live 'tools' (ToolService), and 'app' (the running TUI app) for direct runtime introspection. Default timeout 30s (best-effort interrupt; cannot kill a blocked C call).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "code": {"type": "string", "description": "Python source to execute in the persistent namespace."},
                            "timeout": {"type": "integer", "description": "Seconds before a best-effort interrupt (default 30).", "default": 30}
                        },
                        "required": ["code"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "exec_reset",
                    "description": "Reset the persistent execution sessions: restart the bash session and/or clear the python REPL namespace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "target": {"type": "string", "enum": ["bash", "python", "all"], "description": "Which session to reset (default all).", "default": "all"}
                        },
                        "required": []
                    }
                }
            }
        ]
```

- [ ] **Step 3b: Exempt the tools from the gate and add dispatch branches**

In `execute_tool`, change the gate block at the top from:

```python
    def execute_tool(self, tool_name, kwargs, callback=None):
        # ── CLI Gate: cooldown + redundancy check ────────────
        if not _gate_check(tool_name, kwargs, callback):
            return f"⛔ Gate blocked '{tool_name}': check your cadence."
        # ──────────────────────────────────────────────────────
```

to:

```python
    def execute_tool(self, tool_name, kwargs, callback=None):
        # ── CLI Gate: cooldown + redundancy check ────────────
        # exec tools are the intentionally-powerful path; repeated calls are expected.
        if tool_name not in ("bash_session", "python_exec", "exec_reset"):
            if not _gate_check(tool_name, kwargs, callback):
                return f"⛔ Gate blocked '{tool_name}': check your cadence."
        # ──────────────────────────────────────────────────────
```

Then add three dispatch branches immediately before the final `return "Tool not found."` line:

```python
        elif tool_name == "bash_session":
            return self._bash_session(kwargs, callback)
        elif tool_name == "python_exec":
            return self._python_exec(kwargs, callback)
        elif tool_name == "exec_reset":
            return self._exec_reset(kwargs, callback)
        return "Tool not found."
```

(Replace the existing standalone `return "Tool not found."` with the block above so the new branches precede it.)

- [ ] **Step 3c: Add the three handler methods**

Add these methods to the `ToolService` class (place them next to `_run_command`):

```python
    def _bash_session(self, kwargs, callback):
        command = kwargs.get("command", "").strip()
        if not command:
            return "Error: No command provided."
        timeout = int(kwargs.get("timeout", 30))
        out = get_exec_session().run_bash(command, timeout=timeout)
        if callback:
            callback(f"  [#7CFF8B]✓[/] bash_session('{command[:60]}')")
        return out

    def _python_exec(self, kwargs, callback):
        code = kwargs.get("code", "")
        if not code.strip():
            return "Error: No code provided."
        timeout = int(kwargs.get("timeout", 30))
        out = get_exec_session().run_python(code, timeout=timeout, host=self)
        if callback:
            first = code.strip().splitlines()[0] if code.strip() else ""
            callback(f"  [#7CFF8B]✓[/] python_exec('{first[:60]}')")
        return out

    def _exec_reset(self, kwargs, callback):
        target = kwargs.get("target", "all")
        if target not in ("bash", "python", "all"):
            target = "all"
        msg = get_exec_session().reset(target)
        if callback:
            callback(f"  [#7CFF8B]✓[/] exec_reset({target}): {msg}")
        return msg
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_exec_session.py -v`
Expected: PASS (15 tests total). Also run the existing suite to confirm no regression: `python3 -m pytest tests/test_agent_tools.py -v` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tui/services/tool_service.py tests/test_exec_session.py
git commit -m "feat(exec): expose bash_session/python_exec/exec_reset via ToolService

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Bind the live app into the session on mount

**Files:**
- Modify: `tui/ui/app.py` (`DivTubeAgentApp.on_mount`, ~line 642)

**Interfaces:**
- Consumes: `get_exec_session` (Task 2); `RuntimeExecSession.bind_app` (Task 2).
- Produces: at runtime, `python_exec`'s namespace `app` is the live `DivTubeAgentApp` instead of `None`.

- [ ] **Step 1: Add the bind call**

In `tui/ui/app.py`, in `async def on_mount(self):` (the `DivTubeAgentApp` one at ~line 642), add a bind call at the very start of the body, before `await scd64_service.start()`:

```python
    async def on_mount(self):
        try:
            from tui.services.exec_session_service import get_exec_session
            get_exec_session().bind_app(self)
        except Exception:
            pass
        await scd64_service.start()
```

- [ ] **Step 2: Verify the module imports and the hook is wired**

Run: `python3 -c "import ast,sys; ast.parse(open('tui/ui/app.py').read()); print('app.py parses')"`
Expected: `app.py parses`

Run: `python3 -c "from tui.services.exec_session_service import get_exec_session; s=get_exec_session(); s.bind_app('FAKE_APP'); print(s.run_python('app'))"`
Expected: output contains `FAKE_APP`

- [ ] **Step 3: Smoke-launch the TUI and drive the new tool**

Launch the cockpit in tmux and confirm it boots without the bind crashing it:

```bash
tmux kill-session -t exec 2>/dev/null
tmux new-session -d -s exec -x 140 -y 45 'cd /home/deck/Downloads/Scholomance-V12-main/divtube_downloader && ./run.sh'
timeout 40 bash -c 'until tmux capture-pane -t exec -p | grep -qiE "DivTube|cockpit|VAELRIX|>"; do sleep 0.5; done'
tmux capture-pane -t exec -p | tail -20
```

Expected: the cockpit UI renders (no Python traceback, no "CRASH DETECTED"). Then quit:

```bash
tmux send-keys -t exec 'q'
tmux kill-session -t exec 2>/dev/null || true
```

If the app uses a different quit key, `tmux kill-session` is the fallback.

- [ ] **Step 4: Commit**

```bash
git add tui/ui/app.py
git commit -m "feat(exec): bind live cockpit app into the exec session on mount

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** bash session → Task 1; python REPL + bind → Task 2; three tools + gate exemption + no `is_coding_action` → Task 3; app bind hook → Task 4; tests for every behavior in the spec's testing section → distributed across Tasks 1–3. Local-brain exclusion is honored (no daemon changes).
- **Singleton:** `get_exec_session()` is module-level; tests use fresh `RuntimeExecSession()` instances to avoid cross-test leakage, while `ToolServiceExecTest` exercises the real singleton and resets it in `tearDown`.
- **Type consistency:** `run_bash(command, timeout)`, `run_python(code, timeout, host)`, `reset(target)`, `bind_app(app)`, `get_exec_session()` are used identically in Tasks 3–4 as defined in Tasks 1–2.
