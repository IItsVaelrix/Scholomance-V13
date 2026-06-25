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


if __name__ == "__main__":
    unittest.main()
