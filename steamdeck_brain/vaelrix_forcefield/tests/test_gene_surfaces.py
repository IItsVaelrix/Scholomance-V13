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
import uuid
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


class TestUnverifiableIsNotUndatable(unittest.TestCase):
    """Three states the gate must keep apart.

      * UNDATABLE  -- the gene declares no surfaces. A deliberate, backward
        compatible state: freshness is the literal, and the gate passes,
        because blocking here would mute every gene written before surfaces
        existed.
      * MEASURED   -- every probe ran. Use the number they produced.
      * UNVERIFIABLE -- the gene DOES name code, but the measurement could not
        be completed: no git, no stamp, a probe that failed, an exception.

    Collapsing the third into the first is a fail-open. The gene is claiming
    authority over code nobody could date, and its declared 0.9 then walks it
    straight past MIN_FRESHNESS. "We could not check" must never be served as
    "we checked and it was fine".
    """

    def _gene(self, surfaces, declared=0.9):
        g = RetrievalGene()
        g.identity.stableId = "TEST_GENE"
        g.domain.surfaces = list(surfaces)
        g.retrieval.freshness = declared
        return g

    def test_surfaces_outside_a_git_repo_are_unverifiable_not_declared(self):
        with tempfile.TemporaryDirectory() as d:
            v = GF.gene_freshness(self._gene(["src/**"]), d, stamp="deadbeef")
            self.assertEqual(v["basis"], "unverifiable", v)
            self.assertTrue(v["unverifiable"])

    def test_the_gate_refuses_a_gene_it_could_not_date(self):
        from vaelrix_forcefield.scdna import inject
        with tempfile.TemporaryDirectory() as d:
            g = self._gene(["src/**"], declared=0.99)
            self.assertFalse(
                inject.passes_freshness(g, repo_root=d, stamp="deadbeef"),
                "a gene naming code nobody could date rode its declared "
                "literal past the gate")

    def test_a_crash_in_the_measurement_does_not_fall_back_to_the_literal(self):
        """The exact fail-open: a broken instrument re-admits every gene.

        `except Exception: return declared >= MIN` means any defect in
        gene_freshness silently restores the pre-surfaces behaviour, and the
        gate this work exists to build stops existing again -- with the
        machinery still in place to make it look present.
        """
        from vaelrix_forcefield.scdna import inject

        def boom(*a, **kw):
            raise RuntimeError("instrument defect")

        orig = GF.effective_freshness
        GF.effective_freshness = boom
        try:
            g = self._gene(["src/**"], declared=0.99)
            self.assertFalse(inject.passes_freshness(g, repo_root=str(REPO_ROOT)),
                             "measurement crashed and the gene was admitted anyway")
        finally:
            GF.effective_freshness = orig

    def test_a_crash_is_not_silent(self):
        from vaelrix_forcefield.scdna import inject

        def boom(*a, **kw):
            raise RuntimeError("instrument defect")

        orig = GF.effective_freshness
        GF.effective_freshness = boom
        try:
            g = self._gene(["src/**"])
            with self.assertLogs("vaelrix_forcefield.scdna.inject", "ERROR") as cm:
                inject.passes_freshness(g, repo_root=str(REPO_ROOT))
            self.assertIn("TEST_GENE", "\n".join(cm.output))
        finally:
            GF.effective_freshness = orig

    def _probe_fails_on(self, needle):
        """A `_git` that works until the named subcommand, then fails.

        Every other fixture in this file shares one habit: git works for the
        whole run. That habit is why "report the surviving probes as MEASURED"
        survived a mutation sweep -- no test could reach the branch. A probe
        can die partway (a lock, a timeout, a huge status) and the answer that
        comes back is then a PARTIAL check wearing a complete check's label.
        """
        real = GF._git

        def flaky(root, *args):
            if needle in args:
                return None
            return real(root, *args)
        return real, flaky

    def test_a_failed_surface_probe_is_not_a_measurement(self):
        with TempRepo() as r:
            real, flaky = self._probe_fails_on("log")
            GF._git = flaky
            try:
                v = GF.gene_freshness(self._gene(["src/**"]), str(r.root),
                                      stamp=r.stamp)
            finally:
                GF._git = real
            self.assertEqual(v["basis"], "unverifiable", v)
            self.assertIn("could not be run", v["reason"])

    def test_a_failed_worktree_probe_is_not_a_measurement(self):
        """The log can say "no commits touched it" while an uncommitted edit
        sits under the same surface. If `git status` did not run, the clean
        log is half an answer, not a clean bill of health."""
        with TempRepo() as r:
            real, flaky = self._probe_fails_on("status")
            GF._git = flaky
            try:
                v = GF.gene_freshness(self._gene(["src/**"]), str(r.root),
                                      stamp=r.stamp)
            finally:
                GF._git = real
            self.assertEqual(v["basis"], "unverifiable", v)
            self.assertFalse(v["stale"], "log saw no drift; that part is true")

    def test_the_gate_refuses_a_partially_probed_gene(self):
        from vaelrix_forcefield.scdna import inject
        with TempRepo() as r:
            real, flaky = self._probe_fails_on("status")
            GF._git = flaky
            try:
                ok = inject.passes_freshness(self._gene(["src/**"], declared=0.99),
                                             repo_root=str(r.root), stamp=r.stamp)
            finally:
                GF._git = real
            self.assertFalse(ok, "a half-run measurement passed as a clean one")

    def test_undatable_by_design_is_still_admitted(self):
        """The other half of the law: no surfaces must NOT become blocked."""
        from vaelrix_forcefield.scdna import inject
        with tempfile.TemporaryDirectory() as d:
            self.assertTrue(
                inject.passes_freshness(self._gene([]), repo_root=d),
                "a gene with no surfaces was blocked; that mutes the registry")

    def test_resolver_does_not_call_an_undated_gene_resolved(self):
        """RESOLVED asserts the answer was checked. Unverifiable was not."""
        from vaelrix_forcefield.scdna import resolver as R
        g = self._gene(["src/**"])
        g.identity.stableId = "UNVERIFIABLE_GENE_UNDER_TEST"
        with tempfile.TemporaryDirectory() as d:
            v = R.resolve(g.identity.stableId, d,
                          registry={g.identity.stableId: g})
            self.assertEqual(v["kind"], "CLARIFY", v)
            self.assertEqual(v["freshness"]["basis"], "unverifiable")


class TestPerGeneStamp(unittest.TestCase):
    """A registry-wide stamp launders staleness.

    Genes live together in registry.py, so "the last commit touching
    registry.py" is shared by all of them. Edit gene B for any reason -- fix a
    typo, add a gene -- and gene A's baseline jumps forward past drift that
    already happened under gene A's surfaces. The drift is still there; the
    measurement just stops being able to see it, and gene A silently reads
    fresh again. A stamp has to belong to the gene it dates.
    """

    REG = Path("steamdeck_brain") / "vaelrix_forcefield" / "scdna" / "registry.py"
    JSON = Path("steamdeck_brain") / "vaelrix_forcefield" / "scdna" / "compiler.json"

    def _repo(self, tmp):
        root = Path(tmp)
        git(root, "init", "-q")
        git(root, "config", "user.email", "t@t.t")
        git(root, "config", "user.name", "t")
        (root / "src").mkdir()
        (root / "src" / "paint.js").write_text("// paint\n")
        (root / self.REG).parent.mkdir(parents=True)
        (root / self.REG).write_text(
            'GENE_A = "TEST_GENE_ALPHA"\nGENE_B = "TEST_GENE_BETA"\n')
        # Most genes live HERE, not in registry.py -- load_injection_registry
        # merges both, and only 3 of the 13 it yields are Python defaults.
        (root / self.JSON).write_text('{"TEST_GENE_GAMMA": {}}\n')
        git(root, "add", "-A")
        git(root, "commit", "-qm", "init")
        return root

    def _gene(self, stable_id, surfaces):
        g = RetrievalGene()
        g.identity.stableId = stable_id
        g.domain.surfaces = list(surfaces)
        g.retrieval.freshness = 0.9
        return g

    def test_editing_another_gene_does_not_relaunder_this_ones_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._repo(tmp)
            gene_a = self._gene("TEST_GENE_ALPHA", ["src/**"])

            # Drift under GENE_A's surface.
            (root / "src" / "paint.js").write_text("// drifted\n")
            git(root, "add", "-A")
            git(root, "commit", "-qm", "drift under alpha")

            v = GF.gene_freshness(gene_a, str(root))
            self.assertTrue(v["stale"], f"fixture never went stale: {v}")

            # Now touch GENE_B only. Nothing about GENE_A changed, and the
            # drift under src/ is still there and still unreviewed.
            (root / self.REG).write_text(
                'GENE_A = "TEST_GENE_ALPHA"\nGENE_B = "TEST_GENE_BETA"  # note\n')
            git(root, "add", "-A")
            git(root, "commit", "-qm", "unrelated edit to gene B")

            v = GF.gene_freshness(gene_a, str(root))
            self.assertTrue(
                v["stale"],
                "an unrelated edit to another gene reset this gene's baseline "
                f"and hid its drift: {v}")

    def test_a_json_only_gene_can_still_be_dated(self):
        """The registry is two files, so the stamp has to look at both.

        `load_injection_registry` merges compiler.json with the Python
        defaults; 10 of the 13 genes it yields are named ONLY in the JSON.
        Dating those against registry.py alone reports "no assertion point"
        for a gene that plainly has one -- refusing it for a reason that is
        an artefact of where the search looked.
        """
        with tempfile.TemporaryDirectory() as tmp:
            root = self._repo(tmp)
            gamma = self._gene("TEST_GENE_GAMMA", ["src/**"])

            v = GF.gene_freshness(gamma, str(root))
            self.assertEqual(v["basis"], "measured", v)
            self.assertFalse(v["stale"], v)

            (root / "src" / "paint.js").write_text("// drifted\n")
            git(root, "add", "-A")
            git(root, "commit", "-qm", "drift under gamma")
            v = GF.gene_freshness(gamma, str(root))
            self.assertTrue(v["stale"], v)

    def test_a_gene_absent_from_the_registry_is_unverifiable(self):
        """No assertion point means no measurement, and no measurement is
        not the same as a clean one."""
        with tempfile.TemporaryDirectory() as tmp:
            root = self._repo(tmp)
            ghost = self._gene("TEST_GENE_" + uuid.uuid4().hex.upper(), ["src/**"])
            v = GF.gene_freshness(ghost, str(root))
            self.assertEqual(v["basis"], "unverifiable", v)
            self.assertIn("stamp", v["reason"].lower())

    def test_an_explicit_stamp_still_wins(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self._repo(tmp)
            stamp = git(root, "rev-parse", "HEAD")
            gene_a = self._gene("TEST_GENE_ALPHA", ["src/**"])
            (root / "src" / "paint.js").write_text("// drifted\n")
            git(root, "add", "-A")
            git(root, "commit", "-qm", "drift")
            v = GF.gene_freshness(gene_a, str(root), stamp=stamp)
            self.assertEqual(v["stampedAt"], stamp)
            self.assertTrue(v["stale"], v)


class TestRegistryReality(unittest.TestCase):

    def test_every_registry_gene_reports_its_surface_state(self):
        """No gene may be silent about whether it can be dated."""
        for gene_id, gene in DEFAULT_GENE_REGISTRY.items():
            v = GF.gene_freshness(gene, str(REPO_ROOT))
            self.assertIn(v["basis"], ("measured", "declared", "unverifiable"),
                          (gene_id, v))
            if not gene.domain.surfaces:
                self.assertTrue(v["unverifiable"],
                                f"{gene_id} has no surfaces but is not unverifiable")


if __name__ == "__main__":
    unittest.main()
