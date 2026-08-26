"""SCDNA coverage — measure what is uncovered WITHOUT inventing canon.

Coverage is the step where a documentation system usually starts lying. The
temptation is to generate a capability packet per uncovered file so the number
goes green. But `canonical`, `evidence` and `forbidden` are authored intent
that no static analysis contains, and these packets are INJECTED INTO AGENT
CONTEXT AS DIRECTIVES. A generated `canonical` is a fabricated instruction
carrying the system's authority -- it would add hallucination, not prevent it.

capability_store already names the principle: uncurated content wearing a
curated badge is excluded, not served. This suite holds coverage to it.

THE LOAD-BEARING TEST: `test_candidate_is_rejected_by_the_packet_loader`. A
candidate dropped into capabilities/ must FAIL to load. If a candidate can be
served as a packet, every other guarantee here is decorative.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
FORCEFIELD = HERE.parent
REPO_ROOT = FORCEFIELD.parents[1]
sys.path.insert(0, str(FORCEFIELD.parent))

from vaelrix_forcefield.scdna import capability_store as store  # noqa: E402
from vaelrix_forcefield.scdna import coverage as C  # noqa: E402
from vaelrix_forcefield.scdna.capability_types import validate_packet  # noqa: E402

AUTHORED = ("canonical", "evidence", "forbidden", "need")


class TestNoInventedCanon(unittest.TestCase):

    def setUp(self):
        self.report = C.coverage_report(str(REPO_ROOT), limit_candidates=40)

    def test_no_candidate_carries_an_authored_field(self):
        """The whole point. A generated `canonical` is a fabricated directive."""
        for cand in self.report["candidates"]:
            for field in AUTHORED:
                self.assertNotIn(field, cand,
                                 f"candidate invented {field!r}: {cand}")

    def test_candidate_is_marked_theory(self):
        for cand in self.report["candidates"]:
            self.assertEqual(cand["kind"], "THEORY", cand)

    def test_candidate_is_rejected_by_the_packet_loader(self):
        """A candidate must not be loadable as a capability packet.

        Structural, not conventional: drop candidates into a capabilities dir
        and the loader must serve none of them.
        """
        cands = self.report["candidates"]
        self.assertTrue(cands, "no candidates produced; test proves nothing")
        with tempfile.TemporaryDirectory() as td:
            d = Path(td)
            for i, cand in enumerate(cands[:5]):
                (d / f"cand{i}.capability.json").write_text(json.dumps(cand))
            packets, errors = store.load_packets(d)
            self.assertEqual(packets, [],
                             "a THEORY candidate was served as a curated packet")
            self.assertEqual(len(errors), min(5, len(cands)),
                             "candidates were dropped without an error")

    def test_candidate_fails_packet_validation_explicitly(self):
        for cand in self.report["candidates"][:5]:
            self.assertTrue(validate_packet(cand),
                            "candidate passes validate_packet; it can masquerade")


class TestCanonicalAwareness(unittest.TestCase):
    """Coverage must consult existing canon before declaring anything uncovered."""

    def setUp(self):
        self.report = C.coverage_report(str(REPO_ROOT), limit_candidates=40)

    def test_reports_all_three_canon_states(self):
        s = self.report["summary"]
        for key in ("files", "capabilityCovered", "bibleClassified",
                    "noCanonAtAll", "bibleAvailable"):
            self.assertIn(key, s, s)

    def test_bible_classified_count_is_a_real_count(self):
        """Key-presence is not a count. `bibleClassified: 0` passes a schema
        check and silently erases the middle canon state."""
        s = self.report["summary"]
        if not s["bibleAvailable"]:
            self.skipTest("bible.json not present")
        self.assertGreater(s["bibleClassified"], 0,
                           "Bible is loaded yet classifies nothing")
        self.assertEqual(s["files"] - s["capabilityCovered"] - s["noCanonAtAll"] >= 0,
                         True, s)

    def test_unknown_layer_is_not_counted_as_canon(self):
        """92.8% of Bible entries carry layer 'Unknown'. Counting those as
        classified would report near-total canonical coverage and make the
        whole report a comfort blanket."""
        s = self.report["summary"]
        if not s["bibleAvailable"]:
            self.skipTest("bible.json not present")
        self.assertLess(s["bibleClassified"], s["files"],
                        "every file counted as classified — 'Unknown' is "
                        "being treated as canon")
        self.assertEqual(C._bible_view({"path": "x", "layer": "Unknown"})["known"],
                         False, "'Unknown' accepted as a real layer")
        self.assertIsNone(C._bible_view({"path": "x", "layer": "Unknown"})["layer"])
        self.assertTrue(C._bible_view({"path": "x", "layer": "Core"})["known"])

    def test_first_atlas_file_when_covered_is_never_a_candidate(self):
        """Deterministic, not ordering-dependent.

        Scanning the real report cannot prove this: candidates fill from the
        top of the atlas in path order, so if the first N files happen to be
        uncovered the list is full before iteration reaches a covered one, and
        a missing `continue` stays invisible. So cover the file that sorts
        FIRST with a fixture packet — under a broken skip it becomes candidate
        number one.
        """
        from vaelrix_forcefield.scdna.capability_types import checksum

        atlas_files, err = C._load_atlas_files(str(REPO_ROOT))
        self.assertIsNotNone(atlas_files, err)
        first = atlas_files[0]["path"]

        pkt = {
            "contract": "SCDNA-CAPABILITY-v1",
            "version": "1.0.0",
            "domain": "fixture-first-file",
            "surfaces": [first],
            "capabilities": [{
                "need": "fixture",
                "canonical": "fixture packet used only to pin the skip",
                "path": first,
            }],
        }
        pkt["checksum"] = checksum(pkt)

        with tempfile.TemporaryDirectory() as td:
            (Path(td) / "fixture.capability.json").write_text(json.dumps(pkt))
            loaded, errors = store.load_packets(Path(td))
            self.assertEqual(len(loaded), 1, f"fixture packet rejected: {errors}")

            r = C.coverage_report(str(REPO_ROOT), capability_dir=td,
                                  limit_candidates=5)
            self.assertGreaterEqual(r["summary"]["capabilityCovered"], 1)
            self.assertNotIn(first, [c["path"] for c in r["candidates"]],
                             "a covered file was offered as a candidate")

    def test_no_candidate_is_covered_by_any_packet(self):
        """Direct invariant, not a sampled intersection.

        The previous version compared a 200-file sample against the first 40
        candidates and passed on ordering luck. Every candidate must be
        unmatched by every packet surface, checked one by one.
        """
        packets, _ = store.load_packets()
        self.assertTrue(packets, "no packets loaded; test proves nothing")
        for cand in self.report["candidates"]:
            owning = [p["domain"] for p in packets
                      if store.matches_surface(cand["path"], p)]
            self.assertEqual(owning, [],
                             f"{cand['path']} is claimed by {owning} "
                             "yet was offered as uncovered")

    def test_candidates_cite_bible_canon_when_it_exists(self):
        """Where the Bible already classifies a file, say so instead of
        re-deriving it -- that is what makes the report canonically aware."""
        if not self.report["summary"]["bibleAvailable"]:
            self.skipTest("bible.json not present")
        for cand in self.report["candidates"]:
            self.assertIn("bible", cand)
            self.assertIn("layer", cand["bible"])

    def test_denominator_excludes_vendored_paths(self):
        """The Bible counts .venv and nlp_chatbot; a coverage ratio built on
        that denominator is meaningless. The atlas's hygiene is the standard."""
        for p in self.report["coveredSample"] + [c["path"] for c in self.report["candidates"]]:
            for bad in (".venv", "node_modules", ".worktrees", "nlp_chatbot", "dist/"):
                self.assertNotIn(bad, p, f"vendored path entered the denominator: {p}")

    def test_ratio_is_reported_against_the_stated_denominator(self):
        s = self.report["summary"]
        self.assertLessEqual(s["capabilityCovered"], s["files"])
        self.assertLessEqual(s["noCanonAtAll"], s["files"])


class TestNeverSilent(unittest.TestCase):

    def test_report_states_its_sources(self):
        r = C.coverage_report(str(REPO_ROOT), limit_candidates=5)
        self.assertIn("sources", r)
        self.assertIn("reason", r)
        self.assertTrue(r["reason"])

    def test_missing_atlas_is_reported_not_guessed(self):
        with tempfile.TemporaryDirectory() as td:
            r = C.coverage_report(td, limit_candidates=5)
            self.assertTrue(r["summary"]["unverifiable"], r)
            self.assertIn("atlas", r["reason"].lower())
            self.assertEqual(r["candidates"], [],
                             "candidates invented with no file source")


if __name__ == "__main__":
    unittest.main()
