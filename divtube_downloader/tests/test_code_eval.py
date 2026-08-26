"""Tests for the Eval lens (tui.services.code_eval).

Ground truth is the real repository, same as the telescope/microscope suite:
the lens is validated by calling actual exported functions and comparing
against values verified independently, not against toy fixtures.

The eval lens exists because the symbol lenses report what a file SAYS about
itself. `projection-laws.js` documents `synthesizeByProjection()` as sweeping
"every licensed law"; it actually iterates 50 hand-written keys. Only running
it shows that.
"""

import json
import os
import subprocess
import unittest

from tui.services import code_eval

HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(DIVTUBE_ROOT, ".."))

PROJECTION = "codex/core/constellation/grimoire/projection-laws.js"
LENS = "divtube_downloader/tui/services/code_lens.py"
AST_TOPO = "codex/core/semantic/ast-topography.js"
THIS_MODULE = "divtube_downloader/tui/services/code_eval.py"


class TestPathSafety(unittest.TestCase):
    def test_escape_rejected(self):
        result = code_eval.evaluate(PROJECT_ROOT, "../../etc/passwd", "anything")
        self.assertFalse(result["ok"])
        self.assertIn("escapes", result["error"])

    def test_missing_file(self):
        result = code_eval.evaluate(PROJECT_ROOT, "no/such/file.js", "f")
        self.assertFalse(result["ok"])


def _node_truth(expression: str):
    """Evaluate `expression` against the projection module with plain node.

    Ground truth for the JS shape assertions. These used to be literals (79
    laws, 44 transitions, 50 pair operations) counted by hand when the tests
    were written; commit 2e42ea2e then added laws to the grimoire and all
    three tests went red although the lens was reporting correctly. Pinning
    another team's data counts inside the LENS suite is the wrong coupling —
    what belongs here is "the lens reports the same shape a direct node run
    sees". A law-count regression gate, if one is wanted, belongs with the
    constellation suite that owns the grimoire.

    This is still an independent check: it never consults code_eval, so a lens
    that miscounts, fails to call, or reports a stale cached shape still fails.
    """
    script = (
        f"const m = require({json.dumps(os.path.join(PROJECT_ROOT, PROJECTION))});"
        f"process.stdout.write(String({expression}));"
    )
    out = subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, timeout=30, cwd=PROJECT_ROOT
    )
    if out.returncode != 0:
        raise AssertionError(f"node ground-truth probe failed: {out.stderr.strip()}")
    return int(out.stdout.strip())


class TestJavaScript(unittest.TestCase):
    def test_calls_a_zero_arg_export_and_reports_its_length(self):
        """The motivating case: the doc says 'every licensed law'; only running it counts."""
        result = code_eval.evaluate(PROJECT_ROOT, PROJECTION, "synthesizeByProjection")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertTrue(result["called"])
        self.assertEqual(result["shape"]["type"], "array")
        self.assertEqual(result["shape"]["length"], _node_truth("m.synthesizeByProjection().length"))

    def test_reads_a_non_function_export_without_calling_it(self):
        result = code_eval.evaluate(PROJECT_ROOT, PROJECTION, "PROJECTION_TRANSITIONS")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertFalse(result["called"])
        self.assertEqual(result["shape"]["length"], _node_truth("m.PROJECTION_TRANSITIONS.length"))

    def test_counts_keys_of_an_exported_object(self):
        result = code_eval.evaluate(PROJECT_ROOT, PROJECTION, "PAIR_OPERATIONS")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertEqual(result["shape"]["type"], "object")
        self.assertEqual(
            result["shape"]["keys"], _node_truth("Object.keys(m.PAIR_OPERATIONS).length")
        )

    def test_surfaces_the_modules_own_purity_declaration(self):
        """The lens shows the claim next to the behaviour, which is its whole point."""
        result = code_eval.evaluate(PROJECT_ROOT, PROJECTION, "PAIR_OPERATIONS")
        self.assertTrue(result["declaredPure"])

    def test_passes_literal_args(self):
        result = code_eval.evaluate(
            PROJECT_ROOT, PROJECTION, "projectResult", args=["N", "modify"]
        )
        self.assertTrue(result["ok"], result.get("error"))
        self.assertEqual(result["shape"]["type"], "array")

    def test_unknown_symbol_is_a_clean_error_not_a_crash(self):
        result = code_eval.evaluate(PROJECT_ROOT, PROJECTION, "noSuchExport")
        self.assertFalse(result["ok"])
        self.assertIn("noSuchExport", result["error"])

    def test_summarises_a_value_json_cannot_encode(self):
        """A Set has no JSON form; the lens must describe it, not throw."""
        result = code_eval.evaluate(
            PROJECT_ROOT, PROJECTION, "synthesizeByProjection", summarise_only=True
        )
        self.assertTrue(result["ok"], result.get("error"))
        self.assertIn("repr", result)


class TestPython(unittest.TestCase):
    def test_calls_a_python_function_with_args(self):
        result = code_eval.evaluate(PROJECT_ROOT, LENS, "_lang_of", args=["a/b.mjs"])
        self.assertTrue(result["ok"], result.get("error"))
        self.assertTrue(result["called"])
        self.assertEqual(result["value"], "javascript")

    def test_python_exception_is_reported_not_raised(self):
        result = code_eval.evaluate(PROJECT_ROOT, LENS, "_lang_of", args=[])
        self.assertFalse(result["ok"])
        self.assertIn("stage", result)

    def test_package_relative_imports_resolve(self):
        """code_eval.py imports tui.services.code_lens at module level, so it
        can only load if the driver puts the package root on sys.path. This is
        the lens evaluating a module shaped exactly like itself. Regression:
        the driver used to die with ModuleNotFoundError before reaching the
        symbol."""
        result = code_eval.evaluate(PROJECT_ROOT, THIS_MODULE, "DEFAULT_TIMEOUT")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertFalse(result["called"])
        self.assertEqual(result["value"], 10)


class TestPurityClaims(unittest.TestCase):
    """declaredPure must read declarations, not mentions of them."""

    def test_quoted_mentions_are_not_claims(self):
        """code_eval.py's header QUOTES the purity phrases while documenting
        the detector. The module runs subprocesses by design; reading its own
        documentation as a purity claim is the regression this guards."""
        result = code_eval.evaluate(PROJECT_ROOT, THIS_MODULE, "DEFAULT_TIMEOUT")
        self.assertTrue(result["ok"], result.get("error"))
        self.assertFalse(result["declaredPure"])

    def test_declaration_sharing_a_line_with_quoted_code_still_counts(self):
        """ast-topography.js declares purity on a line that also quotes a code
        span; stripping quotes must remove the span, not the declaration."""
        result = code_eval.evaluate(
            PROJECT_ROOT, AST_TOPO, "assertInventoryFenced", args=[["FunctionDeclaration"]]
        )
        self.assertTrue(result["ok"], result.get("error"))
        self.assertTrue(result["declaredPure"])

    def test_no_subprocess_form_counts(self):
        """code_lens.py writes 'pure stdlib — … no subprocess', a fourth
        documented form of the repo's purity declaration."""
        result = code_eval.evaluate(PROJECT_ROOT, LENS, "_lang_of", args=["x.js"])
        self.assertTrue(result["ok"], result.get("error"))
        self.assertTrue(result["declaredPure"])


class TestBounds(unittest.TestCase):
    def test_timeout_is_enforced_and_reported(self):
        result = code_eval.evaluate(
            PROJECT_ROOT, PROJECTION, "synthesizeByProjection", timeout=0
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "timeout")

    def test_unsupported_language_is_refused(self):
        result = code_eval.evaluate(PROJECT_ROOT, "README.md", "anything")
        self.assertFalse(result["ok"])
        self.assertIn("evaluate", result["error"].lower())


if __name__ == "__main__":
    unittest.main()
