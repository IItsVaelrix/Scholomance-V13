"""Tests for the Code Atlas (tui.services.code_atlas).

The atlas is the telemetry steroid for the telescope/microscope lenses:
a disk-backed token index + git vitality + Bible glossary, stamped with
the git HEAD it was built from and refusing to answer silently when stale.

Provenance: 2026-08-12 accuracy ruling. The old _cross_reference walker
(MAX_REF_FILES_SCANNED=4000, alphabetical) exhausts its budget inside
nlp_chatbot (44k files) and NEVER reaches scripts/, src/, tests/ or
steamdeck_brain/. Measured recall: 0.1%–81.5% on 12 probes, every query
ending walkFinished=False. The atlas replaces that walk with an index
that reproduced exhaustive grep 12/12.

Design laws under test:
  * DECLARED blind spot: nlp_chatbot is excluded from the index and the
    exclusion is recorded in meta (never a silent omission).
  * Staleness is stamped, never silent: built_at_head != live head =>
    stale=True + commitsBehind.
  * Self-integrity: sha256 over the canonical payload (builtAt excluded
    so identical HEAD => identical checksum).
  * Atomic swap: the atlas file is written via tmp + rename.
  * Determinism: same repo state => byte-identical atlas (builtAt aside).
"""

import json
import os
import shutil
import subprocess
import tempfile
import unittest

from tui.services import code_atlas

HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(DIVTUBE_ROOT, ".."))


def _git(repo, *args):
    subprocess.run(
        ["git", *args], cwd=repo, check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ,
             "GIT_AUTHOR_NAME": "atlas-test", "GIT_AUTHOR_EMAIL": "a@t.st",
             "GIT_COMMITTER_NAME": "atlas-test", "GIT_COMMITTER_EMAIL": "a@t.st"},
    )


def _write(repo, rel, content):
    full = os.path.join(repo, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as fh:
        fh.write(content)


def _make_fixture_repo() -> str:
    """A tiny git repo exercising tokens, layers, hyphens, blind spots."""
    repo = tempfile.mkdtemp(prefix="atlas-fixture-")
    _git(repo, "init", "-q")
    _write(repo, "codex/core/thing.js",
           "export function buildExtrapolationSlate(observed) {\n"
           "  return observed; // buildExtrapolationSlate lives here too\n"
           "}\n")
    _write(repo, "scripts/runner.mjs",
           "import { buildExtrapolationSlate } from '../codex/core/thing.js';\n"
           "const well-known = 'hyphen-token-test';\n")
    _write(repo, "src/App.jsx", "export const App = () => <div>React</div>;\n")
    # Silent blind spots the first cut of the atlas never declared: an
    # extension outside _INDEX_EXTENSIONS, and an indexable file over the
    # byte cap. Both must be COUNTED in meta, not quietly dropped.
    _write(repo, "assets/sprite.scdl", "sprite buildExtrapolationSlate {}\n")
    _write(repo, "assets/theme.css", ".buildExtrapolationSlate { color: red }\n")
    _write(repo, "assets/oversize.js",
           "// buildExtrapolationSlate\n" + ("x".ljust(80) + "\n") * 13000)
    # Declared blind spot: must never be indexed.
    _write(repo, "nlp_chatbot/corpus/huge.txt", "buildExtrapolationSlate\n" * 50)
    _write(repo, "nlp_chatbot/README.md", "vendored corpus, not first-party\n")
    # A pathogen-flavoured file for glossary merging.
    _write(repo, "docs/scholomance-bible/bible.json", json.dumps({
        "schema": "BIBLE-JSON-v1",
        "files": [
            {"path": "codex/core/thing.js", "layer": "Core",
             "errorCodes": ["PB-ERR-v1-TEST"], "healthCodes": []},
            {"path": "src/App.jsx", "layer": "UI",
             "errorCodes": [], "healthCodes": ["PB-OK-v1-TEST"]},
        ],
        "pathogens": [
            {"code": "PB-ERR-v1-LINGUISTIC-CRIT-IMMUNE-0F03",
             "file": "src/App.jsx", "detail": "test breach"},
        ],
    }))
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "seed")
    return repo


class TestAtlasBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = _make_fixture_repo()
        cls.result = code_atlas.build_atlas(cls.repo)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.repo, ignore_errors=True)

    def test_build_ok(self):
        self.assertTrue(self.result["ok"], self.result.get("error"))
        self.assertGreater(self.result["files"], 0)
        self.assertGreater(self.result["tokens"], 0)

    def test_blind_spot_excluded_and_declared(self):
        atlas = code_atlas.load_atlas(self.repo)
        self.assertIn("nlp_chatbot", atlas.meta["declaredBlindSpots"])
        # The blind spot's content must not be reachable through the index.
        self.assertNotIn("nlp_chatbot/corpus/huge.txt",
                         atlas.refs("buildExtrapolationSlate"))
        self.assertIsNone(atlas.file_info("nlp_chatbot/corpus/huge.txt"))

    def test_extension_blind_spot_is_declared(self):
        """A file skipped for its EXTENSION is a blind spot like any other.

        The module's own law: excluding content is a governance decision,
        hiding the decision is not. Directory exclusions were declared from
        day one; extension exclusions were silent.
        """
        atlas = code_atlas.load_atlas(self.repo)
        meta = atlas.meta
        self.assertIn(".js", meta["indexedExtensions"])
        self.assertNotIn(".scdl", meta["indexedExtensions"])
        self.assertEqual(meta["skippedByExtension"].get(".scdl"), 1)
        self.assertEqual(meta["skippedByExtension"].get(".css"), 1)

    def test_oversize_blind_spot_is_declared(self):
        """A file skipped for SIZE must be counted, not silently dropped."""
        atlas = code_atlas.load_atlas(self.repo)
        meta = atlas.meta
        self.assertEqual(meta["skippedForSize"], 1)
        self.assertEqual(meta["maxIndexFileBytes"],
                         code_atlas.MAX_INDEX_FILE_BYTES)
        # And it really is absent from the index (the declaration is honest).
        self.assertNotIn("assets/oversize.js",
                         atlas.refs("buildExtrapolationSlate"))

    def test_token_lookup_exhaustive(self):
        atlas = code_atlas.load_atlas(self.repo)
        hits = atlas.refs("buildExtrapolationSlate")
        self.assertEqual(hits, ["codex/core/thing.js", "scripts/runner.mjs"])

    def test_token_lookup_case_sensitive_exact(self):
        atlas = code_atlas.load_atlas(self.repo)
        self.assertEqual(atlas.refs("buildextrapolationslate"), [])

    def test_hyphenated_query_intersect_then_verify(self):
        atlas = code_atlas.load_atlas(self.repo)
        self.assertEqual(atlas.refs("well-known"), ["scripts/runner.mjs"])
        # Runs intersect but the literal never appears => verified away.
        self.assertEqual(atlas.refs("known-well"), [])

    def test_prefix_lookup(self):
        atlas = code_atlas.load_atlas(self.repo)
        pref = atlas.prefix("buildExtrap")
        self.assertIn("buildExtrapolationSlate", pref)

    def test_glossary_merged_from_bible_json(self):
        atlas = code_atlas.load_atlas(self.repo)
        info = atlas.file_info("codex/core/thing.js")
        self.assertEqual(info["layer"], "Core")
        self.assertIn("PB-ERR-v1-TEST", info["errorCodes"])
        ui = atlas.file_info("src/App.jsx")
        self.assertEqual(ui["pathogens"], 1)

    def test_git_telemetry_present(self):
        atlas = code_atlas.load_atlas(self.repo)
        info = atlas.file_info("src/App.jsx")
        self.assertEqual(info["commits"], 1)
        self.assertIsInstance(info["lastCommit"], int)
        self.assertGreater(info["lastCommit"], 0)

    def test_dir_rollup(self):
        atlas = code_atlas.load_atlas(self.repo)
        roll = atlas.dir_rollup("codex")
        self.assertEqual(roll["files"], 1)
        self.assertEqual(roll["byLayer"], {"Core": 1})

    def test_self_integrity(self):
        atlas = code_atlas.load_atlas(self.repo)
        self.assertTrue(atlas.verify())
        # Tamper: content drift must break the checksum.
        path = os.path.join(self.repo, code_atlas.ATLAS_REL_PATH)
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
        payload["files"][0]["commits"] = 999
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        tampered = code_atlas.CodeAtlas(payload)
        self.assertFalse(tampered.verify())

    def test_atomic_write_no_partial_file(self):
        # After build, no tmp debris may remain next to the atlas.
        atlas_dir = os.path.dirname(
            os.path.join(self.repo, code_atlas.ATLAS_REL_PATH))
        leftovers = [n for n in os.listdir(atlas_dir)
                     if n.startswith(".tmp-atlas")]
        self.assertEqual(leftovers, [])

    def test_determinism_same_state_same_checksum(self):
        first = code_atlas.load_atlas(self.repo).meta["checksum"]
        r2 = code_atlas.build_atlas(self.repo)
        self.assertTrue(r2["ok"])
        second = code_atlas.load_atlas(self.repo).meta["checksum"]
        self.assertEqual(first, second)


class TestAtlasStaleness(unittest.TestCase):
    def setUp(self):
        self.repo = _make_fixture_repo()
        code_atlas.build_atlas(self.repo)

    def tearDown(self):
        shutil.rmtree(self.repo, ignore_errors=True)

    def test_fresh_not_stale(self):
        atlas = code_atlas.load_atlas(self.repo)
        st = atlas.is_stale()
        self.assertFalse(st["stale"])
        self.assertEqual(st["commitsBehind"], 0)

    def test_new_commit_stamps_staleness(self):
        _write(self.repo, "src/New.jsx", "export const New = () => null;\n")
        _git(self.repo, "add", "-A")
        _git(self.repo, "commit", "-q", "-m", "second")
        atlas = code_atlas.load_atlas(self.repo)  # cache must not hide this
        st = atlas.is_stale()
        self.assertTrue(st["stale"])
        self.assertEqual(st["commitsBehind"], 1)

    def test_clean_worktree_is_not_dirty(self):
        atlas = code_atlas.load_atlas(self.repo)
        st = atlas.is_stale()
        self.assertFalse(st["dirty"])
        self.assertEqual(st["dirtyFiles"], 0)

    def test_atlas_artifact_is_never_its_own_dirt(self):
        """Writing the atlas must not make the tree look edited.

        The live repo gitignores .atlas/, but that must not be load-bearing:
        the fixture has no .gitignore, so an unfiltered `git status` reports
        the atlas file itself and the tree is dirty forever after a build.
        """
        st = code_atlas.load_atlas(self.repo).is_stale()
        self.assertFalse(st["dirty"], "the atlas counted its own output as dirt")
        self.assertEqual(st["dirtyFiles"], 0)

    def test_uncommitted_edit_marks_dirty_while_head_matches(self):
        """HEAD-equality is not freshness: the tree can move without a commit.

        Reporting stale=False on an edited tree is the exact silent answer
        the atlas exists to prevent.
        """
        _write(self.repo, "src/App.jsx", "export const App = () => null;\n")
        atlas = code_atlas.load_atlas(self.repo)
        st = atlas.is_stale()
        self.assertFalse(st["stale"])          # HEAD genuinely unchanged
        self.assertTrue(st["dirty"])
        self.assertGreaterEqual(st["dirtyFiles"], 1)

    def test_untracked_file_marks_dirty(self):
        _write(self.repo, "src/Untracked.jsx", "export const U = () => null;\n")
        st = code_atlas.load_atlas(self.repo).is_stale()
        self.assertTrue(st["dirty"])

    def test_dirty_flag_is_never_served_from_the_staleness_cache(self):
        """STALENESS_CACHE keys on builtAtHead; dirtiness changes underneath it.

        Without this, the first stale verdict freezes `dirty` for the life
        of the process — a cached lie about the working tree.
        """
        _git(self.repo, "commit", "-q", "--allow-empty", "-m", "second")
        atlas = code_atlas.load_atlas(self.repo)
        first = atlas.is_stale()
        self.assertTrue(first["stale"])
        self.assertFalse(first["dirty"])
        _write(self.repo, "src/App.jsx", "export const App = () => null;\n")
        second = atlas.is_stale()          # same cached staleness verdict
        self.assertTrue(second["stale"])
        self.assertTrue(second["dirty"])

    def test_missing_head_marks_unverifiable(self):
        atlas = code_atlas.load_atlas(self.repo)
        forged = dict(atlas._payload)  # noqa: SLF001 — test internals
        forged["builtAtHead"] = "deadbeef" * 5
        st = code_atlas.CodeAtlas(forged).is_stale(self.repo)
        self.assertTrue(st["stale"])
        self.assertTrue(st["unverifiable"])


class TestAtlasRebuildEntryPoint(unittest.TestCase):
    """`scripts/atlas_rebuild.py` — what the post-commit hook backgrounds.

    A stamped-stale atlas still degrades honestly, but the dominant real
    failure is nobody rebuilding it. This is the entry point that closes
    that loop; it must be runnable from any cwd against any repo root.
    """

    SCRIPT = os.path.join(PROJECT_ROOT, "scripts", "atlas_rebuild.py")

    def setUp(self):
        self.repo = _make_fixture_repo()
        built = code_atlas.build_atlas(self.repo)
        assert built["ok"], built

    def tearDown(self):
        shutil.rmtree(self.repo, ignore_errors=True)

    def _run(self, *args):
        proc = subprocess.run(
            ["python3", self.SCRIPT, "--root", self.repo, *args],
            cwd=tempfile.gettempdir(), capture_output=True, text=True,
        )
        return proc, json.loads(proc.stdout or "{}")

    def test_rebuilds_after_a_commit_and_restamps_head(self):
        _write(self.repo, "src/New.jsx", "export const New = () => null;\n")
        _git(self.repo, "add", "-A")
        _git(self.repo, "commit", "-q", "-m", "second")
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo,
                              capture_output=True, text=True).stdout.strip()

        proc, verdict = self._run()

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(verdict["action"], "rebuilt")
        atlas = code_atlas.load_atlas(self.repo)
        self.assertEqual(atlas.meta["builtAtHead"], head)
        self.assertFalse(atlas.is_stale(self.repo)["stale"])

    def test_fresh_atlas_is_left_alone(self):
        proc, verdict = self._run()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(verdict["action"], "fresh")

    def test_reports_error_without_pretending_to_succeed(self):
        proc = subprocess.run(
            ["python3", self.SCRIPT, "--root",
             os.path.join(self.repo, "not-a-repo")],
            cwd=tempfile.gettempdir(), capture_output=True, text=True)
        self.assertNotEqual(proc.returncode, 0)


class TestAtlasOnRealRepo(unittest.TestCase):
    """Ground-truth probes against the live repo (atlas may be absent)."""

    def test_real_repo_refs_if_atlas_present(self):
        atlas = code_atlas.load_atlas(PROJECT_ROOT)
        if atlas is None:
            self.skipTest("atlas not built for the live repo yet")
        hits = atlas.refs("buildExtrapolationSlate")
        # The old walker missed scripts/ entirely; the atlas must not.
        self.assertIn("codex/core/constellation/grimoire/extrapolation-simulation.js", hits)
        self.assertIn("scripts/cyclotron-extrapolation-simulation.mjs", hits)
        for h in hits:
            self.assertFalse(h.startswith("nlp_chatbot/"))


if __name__ == "__main__":
    unittest.main()
