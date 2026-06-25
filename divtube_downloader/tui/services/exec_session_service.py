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

import ast
import ctypes
import io
import json
import sys
import traceback

_OUT_LIMIT = 4000


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

    # ── reset ───────────────────────────────────────────────────────
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


_session = None


def get_exec_session():
    global _session
    if _session is None:
        _session = RuntimeExecSession()
    return _session
