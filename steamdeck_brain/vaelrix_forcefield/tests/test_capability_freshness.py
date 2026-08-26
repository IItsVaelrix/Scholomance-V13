"""SCDNA — a capability packet must know when it has stopped being true.

`capability_store` already proves a packet was not hand-edited (checksum) and
decides which packet a path belongs to (matches_surface). Neither answers the
question that makes a document living: does this packet still describe the code
it claims to describe?

Integrity is not freshness. `code_atlas` learned the same thing and says so in
its own header -- HEAD-equality alone is not freshness, so it probes the
worktree too. This suite holds the freshness layer to the same bar.

THE CONTROL: `test_surface_commit_makes_packet_stale` must fail before the
detector exists. A staleness check that cannot go stale is the repo's
documented recurring pathology, and it would pass every other test here.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
FORCEFIELD = HERE.parent
REPO_ROOT = FORCEFIELD.parents[1]
sys.path.insert(0, str(FORCEFIELD.parent))

from vaelrix_forcefield.scdna import capability_freshness as fresh  # noqa: E402


def git(cwd, *args, check=True):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {r.stderr}")
    return r.stdout.strip()


class TempRepo:
    """A real git repo. Freshness is a git question; faking git would test a mock."""

    def __enter__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        git(self.root, "config", "user.email", "t@t.t")
        git(self.root, "config", "user.name", "t")
        (self.root / "src").mkdir()
        (self.root / "src" / "engine.py").write_text("x = 1\n")
        (self.root / "src" / "other.py").write_text("y = 1\n")
        (self.root / "unrelated.md").write_text("hi\n")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "initial")
        return self

    def __exit__(self, *a):
        self.tmp.cleanup()

    def write(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def commit(self, msg="change"):
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", msg)
        return git(self.root, "rev-parse", "HEAD")

    def packet(self, surfaces, paths=(), name="demo"):
        pkt = {
            "contract": "SCDNA-CAPABILITY-v1",
            "version": "1.0.0",
            "domain": name,
            "surfaces": list(surfaces),
            "capabilities": [
                {"need": "n", "canonical": "c", "path": p, "evidence": "e",
                 "forbidden": []}
                for p in paths
            ],
        }
        d = self.root / "caps"
        d.mkdir(exist_ok=True)
        f = d / f"{name}.capability.json"
        f.write_text(json.dumps(pkt, indent=2))
        return pkt, f


class TestFreshness(unittest.TestCase):

    def test_packet_committed_with_code_is_fresh(self):
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            v = fresh.freshness(pkt, str(r.root), packet_path=str(f))
            self.assertFalse(v["stale"], v)
            self.assertEqual(v["changedSurfaces"], [])

    def test_surface_commit_makes_packet_stale(self):
        """THE CONTROL. Touch a declared surface after the packet is stamped."""
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            r.write("src/engine.py", "x = 2  # drifted\n")
            r.commit("change the code the packet describes")
            v = fresh.freshness(pkt, str(r.root), packet_path=str(f))
            self.assertTrue(v["stale"], f"detector never goes stale: {v}")
            self.assertIn("src/**", v["changedSurfaces"])
            self.assertGreaterEqual(v["commitsBehind"], 1)

    def test_unrelated_commit_does_not_make_it_stale(self):
        """Staleness must track the declared surface, not repo activity."""
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            r.write("unrelated.md", "totally unrelated\n")
            r.commit("unrelated")
            v = fresh.freshness(pkt, str(r.root), packet_path=str(f))
            self.assertFalse(v["stale"], f"fired on an unrelated commit: {v}")

    def test_uncommitted_edit_under_surface_is_reported(self):
        """A dirty worktree is drift the packet cannot see in the commit log."""
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            r.write("src/engine.py", "x = 999  # uncommitted\n")
            v = fresh.freshness(pkt, str(r.root), packet_path=str(f))
            self.assertTrue(v["dirty"], v)
            self.assertIn("src/engine.py", v["dirtyFiles"])

    def test_missing_path_is_named(self):
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py", "src/gone.py"])
            r.commit("add packet")
            v = fresh.freshness(pkt, str(r.root), packet_path=str(f))
            self.assertIn("src/gone.py", v["missingPaths"])
            self.assertTrue(v["stale"])

    def test_never_answers_silently(self):
        """Every verdict states its basis, per the atlas's own law."""
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            v = fresh.freshness(pkt, str(r.root), packet_path=str(f))
            for key in ("stale", "unverifiable", "stampedAt", "changedSurfaces",
                        "dirty", "dirtyFiles", "missingPaths", "commitsBehind",
                        "reason"):
                self.assertIn(key, v)
            self.assertTrue(v["reason"], "verdict carries no stated basis")

    def test_unverifiable_outside_git_is_not_reported_fresh(self):
        """No git => unknown. Unknown must never be served as fresh."""
        with tempfile.TemporaryDirectory() as td:
            pkt = {"contract": "SCDNA-CAPABILITY-v1", "domain": "d",
                   "surfaces": ["src/**"], "capabilities": []}
            v = fresh.freshness(pkt, td, packet_path=None)
            self.assertTrue(v["unverifiable"], v)
            self.assertFalse(v.get("fresh", False))


class TestReconciliationIsBounded(unittest.TestCase):
    """The living-document law must not license the agent to invent content.

    Derived facts (does the path exist?) are mechanical and may be rewritten.
    Authored claims (canonical, evidence, forbidden) encode human intent; an
    agent that rewrites them from the diff is guessing and calling it the
    user's design -- the exact failure SEMANTIC_KIND_THEORY_UNBOUND and
    SEMANTIC_KIND_CLARIFY_UNDERSPECIFIED forbid. Those get FLAGGED, never
    auto-written.
    """

    def test_authored_claims_are_flagged_not_rewritten(self):
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            r.write("src/engine.py", "x = 2\n")
            r.commit("drift")
            plan = fresh.reconciliation_plan(pkt, str(r.root), packet_path=str(f))
            kinds = {a["kind"] for a in plan["actions"]}
            self.assertIn("CLARIFY", kinds,
                          "drifted authored claims must raise CLARIFY")
            for a in plan["actions"]:
                if a["kind"] == "CLARIFY":
                    self.assertIn("field", a)
                    self.assertNotIn("newValue", a,
                                     "a CLARIFY that proposes a value is a fabricated Do")

    def test_missing_path_is_mechanically_actionable(self):
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/gone.py"])
            r.commit("add packet")
            plan = fresh.reconciliation_plan(pkt, str(r.root), packet_path=str(f))
            kinds = {a["kind"] for a in plan["actions"]}
            self.assertTrue({"DO", "CLARIFY"} & kinds)
            self.assertTrue(plan["actions"], "a missing path produced no action")

    def test_clarify_is_scoped_to_the_capability_that_moved(self):
        """A question about code that did not change is noise, and noise is how
        a living document gets ignored. Two capabilities, one drifted file."""
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py", "src/other.py"])
            r.commit("add packet")
            r.write("src/engine.py", "x = 2  # only this one moved\n")
            r.commit("drift one file")
            plan = fresh.reconciliation_plan(pkt, str(r.root), packet_path=str(f))
            paths = {a["path"] for a in plan["actions"] if a["kind"] == "CLARIFY"}
            self.assertIn("src/engine.py", paths)
            self.assertNotIn("src/other.py", paths,
                             "CLARIFY fired on a file that never changed")

    def test_uncommitted_edit_raises_clarify_for_that_capability(self):
        """Drift that was never committed still makes the claim untrue.

        The commit-log branch and the worktree branch are separate paths into
        scoping; a test that only ever commits leaves the second one unguarded.
        """
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py", "src/other.py"])
            r.commit("add packet")
            r.write("src/engine.py", "x = 3  # never committed\n")
            plan = fresh.reconciliation_plan(pkt, str(r.root), packet_path=str(f))
            paths = {a["path"] for a in plan["actions"] if a["kind"] == "CLARIFY"}
            self.assertIn("src/engine.py", paths,
                          "uncommitted drift raised no question")
            self.assertNotIn("src/other.py", paths)

    def test_fresh_packet_yields_no_actions(self):
        with TempRepo() as r:
            pkt, f = r.packet(["src/**"], ["src/engine.py"])
            r.commit("add packet")
            plan = fresh.reconciliation_plan(pkt, str(r.root), packet_path=str(f))
            self.assertEqual(plan["actions"], [], plan)


if __name__ == "__main__":
    unittest.main()
