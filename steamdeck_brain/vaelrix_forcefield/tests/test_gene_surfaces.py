"""SCDNA — genes declare surfaces, so their freshness can be measured.

Before this, `retrieval.freshness` was a literal in registry.py (0.9/0.95/0.9)
and `inject.py` gated on MIN_FRESHNESS. Genes named no code, so nothing that
happened in the repo could ever lower the number: the gate could not fire. A
check that cannot fail.

A gene that declares surfaces can be dated the same way a capability packet is,
and `MIN_FRESHNESS` becomes a real gate.

Two laws this suite holds:

  * A gene with NO surfaces must report `unverifiable`, never `fresh`. Silence
    served as freshness is how a stale directive keeps its authority.
  * The proposer suggests surfaces; it never writes them. Which code a gene
    governs is intent, and a file merely MENTIONING a gene id is evidence, not
    a decision.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
FORCEFIELD = HERE.parent
REPO_ROOT = FORCEFIELD.parents[1]
sys.path.insert(0, str(FORCEFIELD.parent))

from vaelrix_forcefield.scdna import gene_freshness as GF  # noqa: E402
from vaelrix_forcefield.scdna.registry import DEFAULT_GENE_REGISTRY  # noqa: E402
from vaelrix_forcefield.scdna.types import RetrievalGene  # noqa: E402


def git(cwd, *a):
    r = subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


class TempRepo:
    def __enter__(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        git(self.root, "init", "-q")
        git(self.root, "config", "user.email", "t@t.t")
        git(self.root, "config", "user.name", "t")
        (self.root / "src").mkdir()
        (self.root / "src" / "paint.js").write_text("// paint\n")
        (self.root / "other.md").write_text("hi\n")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "init")
        self.stamp = git(self.root, "rev-parse", "HEAD")
        return self

    def __exit__(self, *a):
        self.tmp.cleanup()

    def change(self, rel, text, msg="drift"):
        (self.root / rel).write_text(text)
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", msg)


class TestSchema(unittest.TestCase):

    def test_gene_domain_has_surfaces_defaulting_empty(self):
        g = RetrievalGene()
        self.assertEqual(g.domain.surfaces, [])

    def test_surfaces_round_trip(self):
        g = RetrievalGene()
        g.domain.surfaces = ["src/**", "codex/core/paint.js"]
        back = RetrievalGene.from_dict(g.to_dict())
        self.assertEqual(back.domain.surfaces, ["src/**", "codex/core/paint.js"])

    def test_gene_without_surfaces_still_loads(self):
        """Backward compatibility: every serialized gene predates this field."""
        g = RetrievalGene()
        d = g.to_dict()
        del d["domain"]["surfaces"]
        back = RetrievalGene.from_dict(d)
        self.assertEqual(back.domain.surfaces, [])


class TestMeasuredFreshness(unittest.TestCase):

    def _gene(self, surfaces, declared=0.9):
        g = RetrievalGene()
        g.identity.stableId = "TEST_GENE"
        g.domain.surfaces = list(surfaces)
        g.retrieval.freshness = declared
        return g

    def test_no_surfaces_is_unverifiable_never_fresh(self):
        with TempRepo() as r:
            v = GF.gene_freshness(self._gene([]), str(r.root), stamp=r.stamp)
            self.assertTrue(v["unverifiable"], v)
            self.assertEqual(v["basis"], "declared")
            self.assertIn("surface", v["reason"].lower())

    def test_untouched_surface_stays_fresh(self):
        with TempRepo() as r:
            v = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            self.assertEqual(v["basis"], "measured")
            self.assertFalse(v["stale"], v)
            self.assertEqual(v["measured"], 0.9)

    def test_changed_surface_makes_the_gene_stale(self):
        """THE CONTROL — without this the gate still cannot fire."""
        with TempRepo() as r:
            r.change("src/paint.js", "// repainted\n")
            v = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            self.assertEqual(v["basis"], "measured")
            self.assertTrue(v["stale"], v)
            self.assertGreaterEqual(v["commitsBehind"], 1)

    def test_unrelated_commit_does_not_stale_the_gene(self):
        with TempRepo() as r:
            r.change("other.md", "unrelated\n")
            v = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            self.assertFalse(v["stale"], v)

    def test_stale_gene_drops_below_min_freshness(self):
        """The whole point: MIN_FRESHNESS must become capable of firing."""
        from vaelrix_forcefield.scdna.inject import MIN_FRESHNESS
        with TempRepo() as r:
            r.change("src/paint.js", "// repainted\n")
            v = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            self.assertLess(v["measured"], MIN_FRESHNESS,
                            f"stale gene still passes the gate: {v}")

    def test_uncommitted_drift_under_a_surface_stales_the_gene(self):
        """The worktree branch, which every other test here misses.

        TempRepo.change() COMMITS, so a suite built only from it exercises the
        commit-log path and leaves the worktree probe unguarded — the same gap
        that survived in capability_freshness. Written here deliberately.
        """
        with TempRepo() as r:
            (r.root / "src" / "paint.js").write_text("// never committed\n")
            v = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            self.assertTrue(v["dirty"], v)
            self.assertIn("src/paint.js", v["dirtyFiles"])
            self.assertTrue(v["stale"], v)
            self.assertEqual(v["measured"], GF.STALE_FRESHNESS)

    def test_no_decay_curve_is_invented(self):
        """Freshness is measured as stale-or-not. A per-commit decay would be
        precision nobody measured, so 1 commit behind and 40 read the same."""
        with TempRepo() as r:
            r.change("src/paint.js", "// one\n")
            one = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            for i in range(4):
                r.change("src/paint.js", f"// {i}\n")
            many = GF.gene_freshness(self._gene(["src/**"]), str(r.root), stamp=r.stamp)
            self.assertEqual(one["measured"], many["measured"])
            self.assertGreater(many["commitsBehind"], one["commitsBehind"])


class TestProposerNeverAuthors(unittest.TestCase):

    def test_proposal_is_theory_and_names_its_evidence(self):
        props = GF.propose_surfaces("BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK",
                                    str(REPO_ROOT), limit=10)
        self.assertEqual(props["kind"], "THEORY", props)
        self.assertTrue(props["candidates"], props["reason"])
        for c in props["candidates"]:
            self.assertIn("path", c)
            self.assertIn("evidence", c)

    def test_proposal_does_not_mutate_the_registry(self):
        before = {k: list(v.domain.surfaces) for k, v in DEFAULT_GENE_REGISTRY.items()}
        GF.propose_surfaces("BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK",
                            str(REPO_ROOT), limit=5)
        after = {k: list(v.domain.surfaces) for k, v in DEFAULT_GENE_REGISTRY.items()}
        self.assertEqual(before, after, "proposer wrote surfaces into the registry")

    def test_proposals_exclude_worktree_checkouts(self):
        """A worktree copy is the same file under a second path.

        Offering both trains the author to think a gene spans two trees, and it
        is how 18,395 `.worktrees` entries got into the Bible.
        """
        props = GF.propose_surfaces("TOOL_RULE_SEARCH_BEFORE_ASSUME",
                                    str(REPO_ROOT), limit=40)
        for c in props["candidates"]:
            for bad in (".claude/", ".worktrees/", "node_modules/", ".venv"):
                self.assertNotIn(bad, c["path"],
                                 f"worktree/vendored copy proposed: {c['path']}")

    def test_unknown_gene_proposes_nothing(self):
        """The id is assembled at runtime on purpose.

        Written as a literal it would appear in THIS file, and the proposer --
        correctly -- would find it, failing the test for the right reason. The
        test file is inside the corpus it searches.
        """
        absent = "ZZ" + "NOSUCH" + "GENE" + "QQXX"
        props = GF.propose_surfaces(absent, str(REPO_ROOT), limit=5)
        self.assertEqual(props["candidates"], [], props)
        self.assertTrue(props["reason"])


class TestInjectionGateUsesMeasurement(unittest.TestCase):
    """The gate must consume the measured value, not the literal.

    Measuring freshness and then gating on the constant anyway would leave the
    original defect exactly where it was, with a measurement bolted beside it.
    """

    def _gene(self, gene_id, surfaces, declared=0.9):
        g = RetrievalGene()
        g.identity.stableId = gene_id
        g.domain.surfaces = list(surfaces)
        g.retrieval.freshness = declared
        return g

    def test_effective_freshness_prefers_the_measurement(self):
        with TempRepo() as r:
            r.change("src/paint.js", "// drifted\n")
            g = self._gene("G", ["src/**"])
            eff = GF.effective_freshness(g, str(r.root), stamp=r.stamp)
            self.assertEqual(eff["value"], GF.STALE_FRESHNESS)
            self.assertEqual(eff["basis"], "measured")

    def test_effective_freshness_falls_back_to_declared_when_undatable(self):
        with TempRepo() as r:
            g = self._gene("G", [])
            eff = GF.effective_freshness(g, str(r.root), stamp=r.stamp)
            self.assertEqual(eff["value"], 0.9)
            self.assertEqual(eff["basis"], "declared")
            self.assertTrue(eff["unverifiable"])

    def test_a_stale_gene_is_refused_by_the_gate(self):
        """End to end: a gene whose code moved must stop being injected."""
        from vaelrix_forcefield.scdna import inject
        with TempRepo() as r:
            r.change("src/paint.js", "// drifted\n")
            g = self._gene("G", ["src/**"])
            self.assertFalse(
                inject.passes_freshness(g, repo_root=str(r.root), stamp=r.stamp),
                "stale gene still passed the freshness gate")

    def test_a_fresh_gene_still_passes_the_gate(self):
        from vaelrix_forcefield.scdna import inject
        with TempRepo() as r:
            g = self._gene("G", ["src/**"])
            self.assertTrue(
                inject.passes_freshness(g, repo_root=str(r.root), stamp=r.stamp))

    def test_select_genes_actually_applies_the_measured_gate(self):
        """End to end through select_genes, not just passes_freshness.

        Testing the helper alone leaves the WIRING untested: reverting
        select_genes to the old `gene.retrieval.freshness < MIN_FRESHNESS`
        passes every direct test of passes_freshness while restoring the exact
        defect this change exists to remove.
        """
        from vaelrix_forcefield.scdna import inject
        with TempRepo() as r:
            g = self._gene("DRIFTED_GENE_UNDER_TEST", ["src/**"])
            g.retrieval.confidence = 0.99
            g.retrieval.minConfidence = 0.1
            registry = {g.identity.stableId: g}

            picked = inject.select_genes(g.identity.stableId, registry,
                                         repo_root=str(r.root), stamp=r.stamp)
            self.assertEqual([x.identity.stableId for x in picked],
                             [g.identity.stableId],
                             "fresh gene was not selected; fixture is wrong")

            r.change("src/paint.js", "// drifted\n")
            picked = inject.select_genes(g.identity.stableId, registry,
                                         repo_root=str(r.root), stamp=r.stamp)
            self.assertEqual(picked, [],
                             "select_genes injected a gene whose code drifted")

    def test_undatable_gene_is_not_silently_refused(self):
        """Genes with no surfaces must keep working exactly as before.

        Turning "cannot be dated" into "blocked" would silently mute every
        existing gene the moment this shipped.
        """
        from vaelrix_forcefield.scdna import inject
        with TempRepo() as r:
            g = self._gene("G", [])
            self.assertTrue(
                inject.passes_freshness(g, repo_root=str(r.root), stamp=r.stamp),
                "undatable gene was blocked; this would mute the whole registry")


class TestRegistryReality(unittest.TestCase):

    def test_every_registry_gene_reports_its_surface_state(self):
        """No gene may be silent about whether it can be dated."""
        for gene_id, gene in DEFAULT_GENE_REGISTRY.items():
            v = GF.gene_freshness(gene, str(REPO_ROOT))
            self.assertIn(v["basis"], ("measured", "declared"), (gene_id, v))
            if not gene.domain.surfaces:
                self.assertTrue(v["unverifiable"],
                                f"{gene_id} has no surfaces but is not unverifiable")


if __name__ == "__main__":
    unittest.main()
