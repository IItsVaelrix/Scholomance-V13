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
