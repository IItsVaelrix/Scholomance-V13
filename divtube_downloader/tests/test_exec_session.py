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
        self.assertTrue("timed out" in out.lower() or "interrupted" in out.lower(), f"expected timeout message, got: {out!r}")
        # session still usable afterwards
        out2 = self.sess.run_bash("echo recovered")
        self.assertIn("recovered", out2)


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


if __name__ == "__main__":
    unittest.main()
