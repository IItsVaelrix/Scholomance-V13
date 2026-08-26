import unittest

from tui.services.nav_classifier import (
    classify_nav, NAV_ORIENT, NAV_LOCATE_DEFINITION,
    NAV_VERIFY_USAGE, NAV_RUNTIME_PROOF, NAV_EDIT_VERIFY,
)


class TestClassification(unittest.TestCase):
    def test_evaluate_is_runtime_proof_even_after_an_edit(self):
        # Running code outranks the edit context: the intent is proof, not review.
        self.assertEqual(
            classify_nav("evaluate", {"path": "a.js", "symbol": "f"}, frozenset({"a.js"})),
            NAV_RUNTIME_PROOF)

    def test_microscope_eval_true_is_also_runtime_proof(self):
        # Codex review, finding 2's classification corollary: eval=true is a
        # second door into the same execution path evaluate uses, and must be
        # tagged the same way or a mined LOCATE_DEFINITION cluster would
        # silently include calls that actually ran code.
        self.assertEqual(
            classify_nav("microscope", {"path": "a.js", "symbol": "f", "eval": True}),
            NAV_RUNTIME_PROOF)

    def test_refs_is_usage_verification(self):
        self.assertEqual(classify_nav("microscope", {"path": "a.py", "refs": True}), NAV_VERIFY_USAGE)

    def test_symbol_without_refs_locates(self):
        self.assertEqual(classify_nav("microscope", {"path": "a.py", "symbol": "g"}), NAV_LOCATE_DEFINITION)

    def test_line_zero_still_locates(self):
        # `line: 0` is falsy — a truthiness check here would misclassify it.
        self.assertEqual(classify_nav("microscope", {"path": "a.py", "line": 0}), NAV_LOCATE_DEFINITION)

    def test_bare_microscope_orients(self):
        self.assertEqual(classify_nav("microscope", {"path": "a.py"}), NAV_ORIENT)

    def test_recently_written_path_is_edit_verify(self):
        self.assertEqual(
            classify_nav("microscope", {"path": "a.py", "symbol": "g"}, frozenset({"a.py"})),
            NAV_EDIT_VERIFY)

    def test_atlas_action_splits_usage_from_orientation(self):
        self.assertEqual(classify_nav("atlas", {"action": "refs", "token": "t"}), NAV_VERIFY_USAGE)
        self.assertEqual(classify_nav("atlas", {"action": "rollup", "path": "p"}), NAV_ORIENT)

    def test_is_pure(self):
        args = {"path": "a.py", "refs": True}
        first = classify_nav("microscope", args)
        for _ in range(50):
            self.assertEqual(classify_nav("microscope", args), first)
        self.assertEqual(args, {"path": "a.py", "refs": True})  # not mutated
