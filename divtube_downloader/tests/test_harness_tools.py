import json
import os
import tempfile
import unittest

from tui.services.harness_tools import (
    file_create,
    format_violations_text,
    node_env,
    normalize_violation,
    parse_git_blame_porcelain,
    parse_git_log,
    parse_tsc_errors,
    parse_vitest_json,
    resolve_node_bin_dir,
    _tool,
)


class TestNormalizeViolation(unittest.TestCase):
    def test_maps_file_path_from_context(self):
        v = {
            "severity": "WARN",
            "context": {
                "filePath": "src/foo.jsx",
                "ruleId": "STATE-0307",
                "detail": "Redundant CSRF",
                "line": 42,
            },
        }
        n = normalize_violation(v)
        self.assertEqual(n["file_path"], "src/foo.jsx")
        self.assertEqual(n["line"], 42)
        self.assertEqual(n["rule_id"], "STATE-0307")
        self.assertIn("Redundant", n["message"])

    def test_format_includes_location(self):
        text = format_violations_text([{
            "severity": "WARN",
            "context": {"filePath": "a.js", "ruleId": "X", "detail": "oops", "line": 3},
        }])
        self.assertIn("a.js:3", text)


class TestParsers(unittest.TestCase):
    def test_parse_tsc_errors(self):
        out = (
            "src/a.ts(10,5): error TS2339: Property 'x' does not exist.\n"
            "Something else\n"
            "src/b.tsx(1,1): error TS1005: '}' expected.\n"
        )
        errs = parse_tsc_errors(out)
        self.assertEqual(len(errs), 2)
        self.assertEqual(errs[0]["file"], "src/a.ts")
        self.assertEqual(errs[0]["line"], 10)
        self.assertEqual(errs[0]["code"], "TS2339")

    def test_parse_vitest_json_jest_shape(self):
        payload = {
            "numPassedTests": 2,
            "numFailedTests": 1,
            "numPendingTests": 0,
            "testResults": [{
                "name": "foo.test.ts",
                "assertionResults": [
                    {"fullName": "a", "status": "passed"},
                    {"fullName": "b", "status": "failed"},
                    {"fullName": "c", "status": "passed"},
                ],
            }],
        }
        s = parse_vitest_json(payload)
        self.assertEqual(s["passed"], 2)
        self.assertEqual(s["failed"], 1)
        self.assertEqual(len(s["tests"]), 3)

    def test_parse_git_log(self):
        raw = "abc\x00Ann\x002026-01-01\x00msg one\ndef\x00Bob\x002026-01-02\x00msg two\n"
        entries = parse_git_log(raw, limit=10)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["hash"], "abc")
        self.assertEqual(entries[0]["summary"], "msg one")

    def test_parse_git_blame_porcelain(self):
        raw = (
            "deadbeef 1 1 2\n"
            "author Alice\n"
            "author-time 1\n"
            "summary init\n"
            "\tline1\n"
            "deadbeef 2 2\n"
            "\tline2\n"
        )
        entries = parse_git_blame_porcelain(raw)
        self.assertGreaterEqual(len(entries), 1)
        self.assertEqual(entries[0]["author"], "Alice")
        self.assertEqual(entries[0]["start_line"], 1)


class TestNodePath(unittest.TestCase):
    def test_resolve_node_bin_dir_finds_node(self):
        d = resolve_node_bin_dir()
        # On Deck with nvm this should resolve; skip soft-fail if CI has no node.
        if d is None:
            self.skipTest("no node/nvm on this host")
        self.assertTrue(os.path.isfile(os.path.join(d, "node")))

    def test_node_env_prepends_bin(self):
        d = resolve_node_bin_dir()
        if d is None:
            self.skipTest("no node/nvm on this host")
        env = node_env({"PATH": "/usr/bin"})
        self.assertTrue(env["PATH"].startswith(d + os.pathsep))

    def test_tool_npm_resolves_when_path_stripped(self):
        d = resolve_node_bin_dir()
        if d is None or not os.path.isfile(os.path.join(d, "npm")):
            self.skipTest("no npm under nvm on this host")
        # Even with a PATH that cannot see npm, _tool should return absolute npm.
        old = os.environ.get("PATH")
        try:
            os.environ["PATH"] = "/usr/bin:/bin"
            npm = _tool("npm")
            self.assertTrue(os.path.isabs(npm), npm)
            self.assertTrue(npm.endswith("/npm"), npm)
        finally:
            if old is None:
                os.environ.pop("PATH", None)
            else:
                os.environ["PATH"] = old


class TestFileCreate(unittest.TestCase):
    def test_create_and_overwrite_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            r1 = file_create(tmp, "nested/a.txt", "hello")
            self.assertTrue(r1["ok"])
            self.assertTrue(r1["created"])
            self.assertEqual(open(os.path.join(tmp, "nested/a.txt")).read(), "hello")

            r2 = file_create(tmp, "nested/a.txt", "world", overwrite=False)
            self.assertFalse(r2["ok"])
            self.assertIn("already exists", r2["error"])

            r3 = file_create(tmp, "nested/a.txt", "world", overwrite=True)
            self.assertTrue(r3["ok"])
            self.assertFalse(r3["created"])
            self.assertEqual(open(os.path.join(tmp, "nested/a.txt")).read(), "world")

    def test_rejects_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = file_create(tmp, "../escape.txt", "x")
            self.assertFalse(r["ok"])


if __name__ == "__main__":
    unittest.main()
