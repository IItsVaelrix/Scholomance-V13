"""Tests for the Telescope + Microscope code lenses (tui.services.code_lens).

Ground truth is the real repository: the microscope is validated against
actual Python (AST) and JS (regex) files, not toy fixtures alone.
Determinism is stress-tested: identical filesystem state => identical output.
"""

import json
import os
import tempfile
import unittest

from tui.services import code_lens

# divtube_downloader/ is the cwd root for these tests' imports; the repo
# root is one level up from it.
HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(DIVTUBE_ROOT, ".."))


class TestPathSafety(unittest.TestCase):
    def test_escape_rejected_telescope(self):
        result = code_lens.telescope(PROJECT_ROOT, "../../etc")
        self.assertFalse(result["ok"])
        self.assertIn("escapes", result["error"])

    def test_escape_rejected_microscope(self):
        result = code_lens.microscope(PROJECT_ROOT, "../../etc/passwd")
        self.assertFalse(result["ok"])

    def test_missing_path(self):
        result = code_lens.telescope(PROJECT_ROOT, "no/such/dir/anywhere")
        self.assertFalse(result["ok"])

    def test_resolve_within_root(self):
        self.assertIsNotNone(
            code_lens.resolve_within_root(PROJECT_ROOT, "divtube_downloader")
        )
        self.assertIsNone(code_lens.resolve_within_root(PROJECT_ROOT, "../outside"))


class TestTelescopeTempDir(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        os.makedirs(os.path.join(root, "pkg", "sub"))
        os.makedirs(os.path.join(root, "node_modules", "junk"))
        with open(os.path.join(root, "pkg", "a.py"), "w") as fh:
            fh.write("def alpha(x):\n    return x\n\nclass Beta:\n    def method(self):\n        pass\n")
        with open(os.path.join(root, "pkg", "sub", "b.js"), "w") as fh:
            fh.write("export function gamma() {\n  return 1;\n}\n")
        with open(os.path.join(root, "node_modules", "junk", "skip.js"), "w") as fh:
            fh.write("// never indexed\n")
        self.root = root

    def tearDown(self):
        self.tmp.cleanup()

    def test_tree_shape_and_counts(self):
        result = code_lens.telescope(self.root, ".", max_depth=3)
        self.assertTrue(result["ok"])
        self.assertEqual(result["type"], "dir")
        s = result["summary"]
        self.assertEqual(s["files"], 2)  # node_modules ignored
        self.assertEqual(s["dirs"], 2)   # pkg, pkg/sub
        self.assertGreater(s["lines"], 0)

    def test_ignored_dirs_excluded(self):
        result = code_lens.telescope(self.root, ".", max_depth=4)
        serialized = json.dumps(result)
        self.assertNotIn("node_modules", serialized)
        self.assertNotIn("skip.js", serialized)

    def test_symbols_extracted(self):
        result = code_lens.telescope(self.root, "pkg", max_depth=2)
        serialized = json.dumps(result)
        self.assertIn("alpha", serialized)
        self.assertIn("Beta", serialized)
        self.assertIn("gamma", serialized)

    def test_depth_limit_collapses(self):
        result = code_lens.telescope(self.root, ".", max_depth=0)
        serialized = json.dumps(result)
        self.assertIn("collapsed", serialized)

    def test_determinism(self):
        a = code_lens.telescope(self.root, ".", max_depth=3)
        b = code_lens.telescope(self.root, ".", max_depth=3)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_js_default_arg_braces_do_not_truncate_body(self):
        """Regression: `options = {}` in the param list must not end the body."""
        js = os.path.join(self.root, "pkg", "defaultarg.js")
        with open(js, "w") as fh:
            fh.write(
                "export function delta(packet, options = {}) {\n"
                "  const x = {\n"
                "    a: 1,\n"
                "  };\n"
                "  return x;\n"
                "}\n"
            )
        result = code_lens.microscope(self.root, "pkg/defaultarg.js", symbol="delta")
        self.assertTrue(result["ok"])
        match = result["matches"][0]
        self.assertEqual(match["line"], 1)
        self.assertEqual(match["endLine"], 6, match)
        self.assertIn("return x;", match["body"])

    def test_file_view(self):
        result = code_lens.telescope(self.root, "pkg/a.py")
        self.assertTrue(result["ok"])
        self.assertEqual(result["type"], "file")
        names = [s["name"] for s in result["view"]["symbols"]]
        self.assertIn("alpha", names)
        self.assertIn("Beta.method", names)


class TestMicroscopePython(unittest.TestCase):
    """Ground truth: harness_tools.py is a real, stable Python module."""

    TARGET = "divtube_downloader/tui/services/harness_tools.py"

    def test_symbol_index(self):
        result = code_lens.microscope(PROJECT_ROOT, self.TARGET)
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "index")
        names = [s["name"] for s in result["symbols"]]
        self.assertIn("normalize_violation", names)
        self.assertIn("resolve_node_bin_dir", names)

    def test_symbol_extraction_body(self):
        result = code_lens.microscope(
            PROJECT_ROOT, self.TARGET, symbol="normalize_violation"
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "symbol")
        match = result["matches"][0]
        self.assertEqual(match["name"], "normalize_violation")
        self.assertIn("def normalize_violation", match["body"])
        self.assertGreaterEqual(match["endLine"], match["line"])

    def test_qualified_method_match(self):
        result = code_lens.microscope(PROJECT_ROOT, self.TARGET, symbol="resolve_node")
        self.assertTrue(result["ok"])
        self.assertEqual(result["matches"][0]["name"], "resolve_node_bin_dir")

    def test_unknown_symbol_falls_back_to_text_or_fails(self):
        result = code_lens.microscope(
            PROJECT_ROOT, self.TARGET, symbol="zz_no_such_symbol_zz"
        )
        self.assertFalse(result["ok"])

    def test_line_window(self):
        result = code_lens.microscope(PROJECT_ROOT, self.TARGET, line=5, context=2)
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "line")
        lines = result["lines"]
        self.assertEqual(lines[2]["line"], 5)
        self.assertLessEqual(len(lines), 5)

    def test_line_out_of_range(self):
        result = code_lens.microscope(PROJECT_ROOT, self.TARGET, line=999999)
        self.assertFalse(result["ok"])

    def test_determinism(self):
        a = code_lens.microscope(PROJECT_ROOT, self.TARGET, symbol="node_env")
        b = code_lens.microscope(PROJECT_ROOT, self.TARGET, symbol="node_env")
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))


class TestMicroscopeJavaScript(unittest.TestCase):
    """Ground truth: quantize.js is a small, stable JS module in the repo."""

    TARGET = "codex/core/blender-bridge/quantize.js"

    def setUp(self):
        if not os.path.isfile(os.path.join(PROJECT_ROOT, self.TARGET)):
            self.skipTest("quantize.js not present in repo")

    def test_symbol_index(self):
        result = code_lens.microscope(PROJECT_ROOT, self.TARGET)
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "index")
        names = [s["name"] for s in result["symbols"]]
        self.assertTrue(any("quantize" in n.lower() for n in names), names)

    def test_symbol_extraction(self):
        result = code_lens.microscope(PROJECT_ROOT, self.TARGET, symbol="quantize")
        self.assertTrue(result["ok"])
        # Substring match may return QuantizeError first; find the exact match.
        exact = [m for m in result["matches"] if m["name"] == "quantize"]
        self.assertTrue(exact, f"no exact 'quantize' match in {result['matches']}")
        body = exact[0]["body"]
        self.assertIn("quantize", body)
        self.assertIn("{", body)


class TestCrossReference(unittest.TestCase):
    def test_refs_find_definition_and_users(self):
        result = code_lens.microscope(
            PROJECT_ROOT,
            "divtube_downloader/tui/services/harness_tools.py",
            symbol="normalize_violation",
            refs=True,
            max_refs=25,
        )
        self.assertTrue(result["ok"])
        refs = result.get("refs", [])
        self.assertGreater(len(refs), 0)
        files = {r["file"] for r in refs}
        self.assertIn("divtube_downloader/tui/services/harness_tools.py", files)
        for r in refs:
            self.assertIn("normalize_violation", r["text"])
            self.assertGreaterEqual(r["line"], 1)

    def test_refs_bounded(self):
        result = code_lens.microscope(
            PROJECT_ROOT,
            "divtube_downloader/tui/services/harness_tools.py",
            symbol="os",
            refs=True,
            max_refs=10,
        )
        self.assertLessEqual(len(result.get("refs", [])), 10)

    def test_refs_sorted_deterministic(self):
        a = code_lens.microscope(
            PROJECT_ROOT, "divtube_downloader/tui/services/harness_tools.py",
            symbol="normalize_violation", refs=True,
        )
        b = code_lens.microscope(
            PROJECT_ROOT, "divtube_downloader/tui/services/harness_tools.py",
            symbol="normalize_violation", refs=True,
        )
        self.assertEqual(
            json.dumps(a.get("refs"), sort_keys=True),
            json.dumps(b.get("refs"), sort_keys=True),
        )


class TestDeterminismStress(unittest.TestCase):
    def test_telescope_100_iterations_identical(self):
        target = "divtube_downloader/tui/services"
        first = json.dumps(
            code_lens.telescope(PROJECT_ROOT, target, max_depth=1), sort_keys=True
        )
        for _ in range(99):
            again = json.dumps(
                code_lens.telescope(PROJECT_ROOT, target, max_depth=1), sort_keys=True
            )
            self.assertEqual(first, again)

    def test_microscope_100_iterations_identical(self):
        target = "divtube_downloader/tui/services/harness_tools.py"
        first = json.dumps(
            code_lens.microscope(PROJECT_ROOT, target), sort_keys=True
        )
        for _ in range(99):
            again = json.dumps(
                code_lens.microscope(PROJECT_ROOT, target), sort_keys=True
            )
            self.assertEqual(first, again)


if __name__ == "__main__":
    unittest.main()
