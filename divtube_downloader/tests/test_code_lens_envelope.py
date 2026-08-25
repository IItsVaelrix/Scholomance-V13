"""Symbol ENVELOPE accuracy for the JS/TS microscope, judged by a real parser.

`microscope(symbol=...)` slices a body out of a file using the `endLine` that
`_js_body_end` computes. When that number is short the lens returns a fragment
and reports `truncated: False` — a partial answer wearing a complete answer's
label. Measured against @babel/parser over a 2,098-file held-out corpus, the
original code got 95.57% of envelopes exact and cut 457 bodies short, 361 of
them stopping at a fixed seven-line bailout.

WHY THE FIXTURES LOOK LIKE THIS
-------------------------------
The first version of this file used five small hand-written fixtures and passed.
`antigen-witness` then broke nine decision points in `_js_body_end` one at a
time and re-ran it: eight survived. The suite could not tell the logic was
broken, because every fixture written by hand shared the author's blind spots —
balanced braces, a semicolon, a block body, a `.js` extension — so a mis-lexed
region still landed on the same envelope, and the TypeScript path was never
entered at all.

`fixtures/js_envelopes/corpus/` therefore holds real repository files, frozen,
each selected because a mutant answered differently on it across the held-out
corpus. The remaining hand fixtures cover shapes no file in this repo has.

Expected line ranges are written by @babel/parser via
`scripts/gen-envelope-fixture.mjs`, never by hand. A hand-tuned expectation for
a hand-written brace tracker proves only that its author was self-consistent.
"""

import json
import os
import re
import unittest

from tui.services import code_lens

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE_DIR = os.path.join(HERE, "fixtures", "js_envelopes")
EXPECTED_PATH = os.path.join(FIXTURE_DIR, "expected.json")

# What `_js_symbols` contracts to emit: functions, classes, and consts that are
# either exported or function-valued. Anything else in the oracle is out of
# scope, not a miss.
def _in_contract(sym):
    return sym["kind"] in ("function", "class") or (
        sym["kind"] == "const" and sym.get("exported")
    )


# A TypeScript type annotation between the name and the `=` defeats
# `_JS_BINDING`, so the declaration is invisible to the symbol table. This is a
# known, separate defect (168 exported typed consts across 78 files repo-wide);
# it is a RULE here rather than a list of names, so nothing can be quietly
# added to the exception set.
def _is_typed_const(source_line, name):
    return bool(re.match(
        r"^\s*export\s+(?:const|let|var)\s+" + re.escape(name) + r"\s*:",
        source_line,
    ))


def _load_oracle():
    """The Babel-authored expectations. A missing oracle FAILS, never skips."""
    with open(EXPECTED_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _fixture_lines(filename):
    with open(os.path.join(FIXTURE_DIR, filename), "r", encoding="utf-8") as fh:
        return fh.read().splitlines()


def _lens_symbols(filename):
    path = os.path.join(FIXTURE_DIR, filename)
    found = {}
    for s in code_lens.symbols_for_file(path):
        found.setdefault(s["name"], s)
    return found


class TestEnvelopeOraclePresent(unittest.TestCase):
    """A skipped envelope test is a check that cannot fail. Prove it is here."""

    def test_oracle_file_exists(self):
        self.assertTrue(
            os.path.isfile(EXPECTED_PATH),
            "envelope oracle missing — run `node scripts/gen-envelope-fixture.mjs`",
        )

    def test_oracle_is_babel_authored(self):
        oracle = _load_oracle()
        self.assertEqual(oracle["oracle"], "@babel/parser")
        self.assertTrue(oracle["files"], "oracle carries no fixtures")

    def test_frozen_corpus_is_present(self):
        """The mutation-selected fixtures are what make this suite discriminate."""
        oracle = _load_oracle()
        corpus = [f for f in oracle["files"] if f.startswith("corpus/")]
        self.assertGreaterEqual(
            len(corpus), 6,
            "the frozen corpus is what killed the surviving mutants; do not thin it",
        )


class TestSymbolEnvelopes(unittest.TestCase):
    """Every in-contract symbol must match the parser's line range exactly."""

    def test_every_contracted_symbol_matches_babel(self):
        oracle = _load_oracle()
        mismatches = []
        checked = 0
        for filename, expected in oracle["files"].items():
            found = _lens_symbols(filename)
            lines = _fixture_lines(filename)
            for want in expected:
                if not _in_contract(want):
                    continue
                decl = lines[want["line"] - 1] if want["line"] <= len(lines) else ""
                if _is_typed_const(decl, want["name"]):
                    continue          # known blind spot, asserted separately
                checked += 1
                got = found.get(want["name"])
                if got is None:
                    mismatches.append(
                        f"{filename}:{want['line']} {want['name']} — not found by the lens"
                    )
                elif got["line"] != want["line"] or got["endLine"] != want["endLine"]:
                    mismatches.append(
                        f"{filename} {want['name']}: lens [{got['line']}, {got['endLine']}]"
                        f" babel [{want['line']}, {want['endLine']}]"
                        f" ({want['endLine'] - got['endLine']:+d} lines)"
                    )
        self.assertGreater(checked, 40, "oracle produced too little to be meaningful")
        self.assertEqual(mismatches, [], "\n  " + "\n  ".join(mismatches))

    def test_typed_const_blind_spot_is_still_exactly_that(self):
        """Ratchets both ways: fixing the TS gap must update this test."""
        oracle = _load_oracle()
        blind = []
        for filename, expected in oracle["files"].items():
            found = _lens_symbols(filename)
            lines = _fixture_lines(filename)
            for want in expected:
                if not _in_contract(want):
                    continue
                decl = lines[want["line"] - 1] if want["line"] <= len(lines) else ""
                if _is_typed_const(decl, want["name"]):
                    blind.append(f"{filename}:{want['line']} {want['name']}")
                    self.assertNotIn(
                        want["name"], found,
                        f"{want['name']} is now found — the typed-const gap is fixed, "
                        "fold it into the main assertion and drop the rule",
                    )
        self.assertTrue(
            blind,
            "no typed const in the fixtures — the corpus no longer covers the gap",
        )


class TestBranchesTheWitnessFound(unittest.TestCase):
    """One test per decision point that survived mutation with the old fixtures.

    Expected values are read from the oracle rather than written here, so these
    name the branch without also authoring its answer.
    """

    def _expect(self, filename, name):
        for s in _load_oracle()["files"][filename]:
            if s["name"] == name:
                return s
        self.fail(f"{name} not in the oracle for {filename}")

    def _assert_matches(self, filename, name):
        want = self._expect(filename, name)
        got = _lens_symbols(filename).get(name)
        self.assertIsNotNone(got, f"{name} not found in {filename}")
        self.assertEqual(
            (got["line"], got["endLine"]), (want["line"], want["endLine"]),
            f"{name} envelope drifted from the parser",
        )

    def test_regex_literal_must_close_on_its_own_line(self):
        """Worst single branch: breaking it moved 520 held-out symbols."""
        self._assert_matches("corpus/visemeMapping.js", "mapFormantsToMetrics")

    def test_regex_may_follow_an_arrow(self):
        self._assert_matches("corpus/character-to-svg.js", "buildShaderDefs")

    def test_brace_leaves_a_template_hole(self):
        self._assert_matches("corpus/construction-autopsy.mjs", "targetMarkdown")

    def test_type_literal_is_not_the_body(self):
        self._assert_matches("corpus/encodeMotionBytecode.ts", "decodeMotionBytecode")

    def test_const_declaration_ends_at_its_semicolon(self):
        self._assert_matches("corpus/ast-topography.js", "AST_INVENTORY")

    def test_expression_bodied_arrow_ends_at_its_semicolon(self):
        self._assert_matches("expression_arrow.js", "double")

    def test_declaration_without_a_semicolon_still_ends(self):
        """No repo file omits semicolons, so only a fixture can exercise this."""
        self._assert_matches("asi_no_semicolons.js", "FIRST")
        self._assert_matches("asi_no_semicolons.js", "SECOND")

    def test_unbalanced_braces_inside_lexed_regions(self):
        """Balanced braces cancel a lexer bug out; these do not."""
        self._assert_matches("unbalanced_in_lexed_regions.js", "openers")
        self._assert_matches("unbalanced_in_lexed_regions.js", "CLOSERS")
        self._assert_matches("unbalanced_in_lexed_regions.js", "afterUnbalanced")

    def test_body_brace_inside_a_call_paren(self):
        """`Object.freeze({` — 727 declaration sites, an 8-line slice each."""
        self._assert_matches("freeze_wrapper.js", "PHRASE_BANK")

    def test_param_list_longer_than_the_old_bailout(self):
        self._assert_matches("long_destructure.js", "AnalyzePanel")

    def test_parameter_default_brace_is_not_the_body(self):
        self._assert_matches("default_brace_param.js", "withOptions")


class TestMicroscopeBodyIsWhole(unittest.TestCase):
    """The envelope is only interesting because microscope() slices with it."""

    def test_extracted_body_ends_where_the_declaration_ends(self):
        result = code_lens.microscope(
            FIXTURE_DIR, "freeze_wrapper.js", symbol="PHRASE_BANK"
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "symbol")
        body = result["matches"][0]["body"]
        self.assertIn("epsilon", body, "body was cut before its own contents")
        self.assertIn("});", body, "body does not reach its closing brace")
        self.assertFalse(result["matches"][0]["truncated"])

    def test_real_corpus_body_is_not_silently_truncated(self):
        result = code_lens.microscope(
            FIXTURE_DIR, "corpus/encodeMotionBytecode.ts", symbol="decodeMotionBytecode"
        )
        self.assertTrue(result["ok"])
        match = result["matches"][0]
        want = None
        for s in _load_oracle()["files"]["corpus/encodeMotionBytecode.ts"]:
            if s["name"] == "decodeMotionBytecode":
                want = s
        self.assertIsNotNone(want)
        self.assertEqual(match["endLine"], want["endLine"])
        self.assertEqual(
            len(match["body"].splitlines()), want["endLine"] - want["line"] + 1
        )


if __name__ == "__main__":
    unittest.main()
