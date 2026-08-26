"""SCDNA resolver — gene | SCD64 | path -> the module that explains that code.

The law this suite enforces hardest is the one that is easiest to violate for
a nicer demo: an identifier that does not bind must come back THEORY, not a
plausible neighbour. SEMANTIC_KIND_THEORY_UNBOUND is explicit that Theory is a
lookup and not a judgement, and that resolving an unbound concept to a
plausible default is the failure. A resolver that always finds something is
indistinguishable from one that guesses.

Gene identifiers are the live case: genes carry `domain.primary` ("code",
"phoneme") while capability packets carry `domain` ("divtube-cockpit",
"phonology"). Those namespaces do not bind, so a gene must NOT silently
resolve to a capability that merely sounds related.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
FORCEFIELD = HERE.parent
REPO_ROOT = FORCEFIELD.parents[1]
sys.path.insert(0, str(FORCEFIELD.parent))

from vaelrix_forcefield.scdna import resolver as R  # noqa: E402

GLOSSARY_INDEX = REPO_ROOT / ".atlas" / "scd64-glossary.json"


def _require_glossary():
    if not GLOSSARY_INDEX.exists():
        raise AssertionError(
            f"{GLOSSARY_INDEX} missing — run `npx tsx scripts/scd64-glossary-export.mjs`. "
            "Skipping would let the resolver ship untested."
        )
    return json.loads(GLOSSARY_INDEX.read_text())


class TestUnboundStaysUnbound(unittest.TestCase):
    """The anti-guessing law. These are the tests a 'helpful' resolver fails."""

    def test_unknown_identifier_is_theory(self):
        v = R.resolve("TOTALLY_MADE_UP_THING_XYZ", str(REPO_ROOT))
        self.assertEqual(v["kind"], "THEORY", v)
        self.assertIsNone(v["module"])

    def test_theory_proposes_no_substitute(self):
        """A near-miss must not be answered with the near neighbour."""
        v = R.resolve("BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBAC", str(REPO_ROOT))
        self.assertEqual(v["kind"], "THEORY", v)
        self.assertIsNone(v["module"])
        self.assertNotIn("didYouMean", v,
                         "a suggestion here becomes the answer downstream")

    def test_unknown_hex_is_theory_not_nearest_family(self):
        v = R.resolve("A" * 64, str(REPO_ROOT))
        self.assertEqual(v["kind"], "THEORY", v)
        self.assertIsNone(v["module"])

    def test_empty_query_is_theory(self):
        for q in ("", "   ", None):
            v = R.resolve(q, str(REPO_ROOT))
            self.assertEqual(v["kind"], "THEORY", f"{q!r} -> {v}")


class TestGlossaryResolution(unittest.TestCase):

    def setUp(self):
        self.gl = _require_glossary()

    def test_full_family_code_resolves_to_its_family(self):
        for family, rec in self.gl["families"].items():
            if not rec["code"]:
                continue
            v = R.resolve(rec["code"], str(REPO_ROOT))
            self.assertEqual(v["kind"], "RESOLVED", v)
            self.assertEqual(v["boundAs"], "scd64-glossary")
            self.assertEqual(v["module"]["family"], family)
            self.assertEqual(len(v["module"]["slots"]), 8)

    def test_family_codes_are_distinct(self):
        codes = [r["code"] for r in self.gl["families"].values() if r["code"]]
        self.assertEqual(len(codes), len(set(codes)),
                         "two families share a code; resolution would be ambiguous")

    def test_code_is_case_insensitive_but_canonicalised(self):
        rec = next(r for r in self.gl["families"].values() if r["code"])
        v = R.resolve(rec["code"].lower(), str(REPO_ROOT))
        self.assertEqual(v["kind"], "RESOLVED", v)
        self.assertEqual(v["module"]["code"], rec["code"])

    def test_single_slot_reports_every_owner(self):
        """7 slot hexes are shared. Reporting one owner would be a false answer."""
        shared = [h for h, owners in self.gl["slots"].items() if len(owners) > 1]
        self.assertTrue(shared, "fixture assumption changed: no shared slots")
        v = R.resolve(shared[0], str(REPO_ROOT))
        self.assertEqual(v["kind"], "RESOLVED", v)
        self.assertEqual(v["boundAs"], "scd64-slot")
        self.assertGreater(len(v["module"]["owners"]), 1)
        self.assertTrue(v["module"]["ambiguous"])


class TestCapabilityResolution(unittest.TestCase):

    def test_capability_checksum_resolves_with_measured_freshness(self):
        caps = sorted((REPO_ROOT / "steamdeck_brain/vaelrix_forcefield/scdna/capabilities")
                      .glob("*.capability.json"))
        self.assertTrue(caps, "no capability packets present")
        pkt = json.loads(caps[0].read_text())
        v = R.resolve(pkt["checksum"], str(REPO_ROOT))
        self.assertEqual(v["kind"] in ("RESOLVED", "CLARIFY"), True, v)
        self.assertEqual(v["boundAs"], "capability-checksum")
        self.assertEqual(v["module"]["domain"], pkt["domain"])
        self.assertEqual(v["freshness"]["basis"], "measured")

    def test_stale_capability_resolves_as_clarify(self):
        """Resolution succeeds; the answer is flagged as no longer trustworthy."""
        caps = REPO_ROOT / "steamdeck_brain/vaelrix_forcefield/scdna/capabilities"
        stale = None
        for f in sorted(caps.glob("*.capability.json")):
            pkt = json.loads(f.read_text())
            v = R.resolve(pkt["checksum"], str(REPO_ROOT))
            if v["freshness"].get("stale"):
                stale = v
                break
        if stale is None:
            self.skipTest("every packet is currently fresh")
        self.assertEqual(stale["kind"], "CLARIFY", stale)
        self.assertTrue(stale["module"], "a stale module must still be served")

    def test_path_resolves_to_owning_packets(self):
        v = R.resolve("divtube_downloader/tui/services/tool_service.py", str(REPO_ROOT))
        self.assertEqual(v["kind"] in ("RESOLVED", "CLARIFY"), True, v)
        self.assertEqual(v["boundAs"], "path")
        self.assertIn("divtube-cockpit", [m["domain"] for m in v["module"]["packets"]])

    def test_unowned_path_is_theory(self):
        """A real file no packet claims is unbound, not 'probably fine'."""
        v = R.resolve("README.md", str(REPO_ROOT))
        self.assertEqual(v["kind"], "THEORY", v)


class TestGeneResolution(unittest.TestCase):

    def test_gene_id_resolves(self):
        v = R.resolve("BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK", str(REPO_ROOT))
        self.assertEqual(v["kind"] in ("RESOLVED", "CLARIFY"), True, v)
        self.assertEqual(v["boundAs"], "gene")
        self.assertEqual(v["module"]["stableId"],
                         "BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK")
        self.assertTrue(v["module"]["requiredChecks"])

    def test_gene_freshness_is_declared_not_measured(self):
        """The number in registry.py is a literal. Serving it as measured would
        be the check that cannot fail: genes declare no surfaces, so nothing
        about the repo can ever lower it."""
        v = R.resolve("BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK", str(REPO_ROOT))
        self.assertEqual(v["freshness"]["basis"], "declared")
        self.assertTrue(v["freshness"]["unverifiable"])
        self.assertIn("surface", v["freshness"]["reason"].lower())

    def test_gene_does_not_bind_to_a_capability_by_name_similarity(self):
        """gene.domain 'phoneme' must not silently become capability 'phonology'."""
        v = R.resolve("BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK", str(REPO_ROOT))
        self.assertNotIn("capability", (v["module"].get("boundCapability") or ""),
                         "gene->capability join was invented")
        self.assertIsNone(v["module"].get("boundCapability"))


class TestNeverSilent(unittest.TestCase):

    def test_every_verdict_states_its_basis(self):
        for q in ["BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK", "A" * 64,
                  "README.md", "nonsense", ""]:
            v = R.resolve(q, str(REPO_ROOT))
            for key in ("query", "kind", "boundAs", "module", "freshness", "reason"):
                self.assertIn(key, v, f"{q!r} verdict missing {key}")
            self.assertTrue(v["reason"], f"{q!r} answered with no stated basis")

    def test_missing_glossary_index_is_reported_not_silent(self):
        """"Index absent" and "code unknown" are different diagnoses.

        Both return THEORY, so the kind cannot separate them. If a missing
        index degrades into "matches no family", broken infrastructure is
        indistinguishable from a normal negative and nobody ever rebuilds it.
        The verdict must name the remedy.
        """
        with tempfile.TemporaryDirectory() as td:
            missing = os.path.join(td, "nope.json")
            v = R.resolve("0" * 64, td, glossary_path=missing)
            self.assertEqual(v["kind"], "THEORY")
            self.assertIn("scd64-glossary-export", v["reason"],
                          f"missing index did not name its remedy: {v['reason']!r}")
            self.assertIn(missing, v["reason"])

        # And the same query against a REAL index must not produce that reason,
        # or the assertion above would pass for the wrong reason.
        real = R.resolve("0" * 64, str(REPO_ROOT))
        self.assertEqual(real["kind"], "THEORY")
        self.assertNotIn("scd64-glossary-export", real["reason"])


if __name__ == "__main__":
    unittest.main()
