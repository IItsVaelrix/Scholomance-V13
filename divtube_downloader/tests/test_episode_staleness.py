import os
import subprocess
import tempfile
import unittest

from tui.services import episode_staleness as es


def _git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def _init_repo(root):
    _git("init", "-q", cwd=root)
    _git("config", "user.email", "t@t.com", cwd=root)
    _git("config", "user.name", "t", cwd=root)


class TestIgnoredSubtreeRefusesRecall(unittest.TestCase):
    """The centerpiece regression test. Empirically confirmed during PDR
    review: `git status --porcelain` (no --ignored) gives byte-identical
    output before and after editing a gitignored file's content — so the
    OLD staleness_for design computed a STABLE key across the mutation,
    which is a stale hit waiting to happen, not a refusal. This test fails
    against that old design and passes against the revised one."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        _init_repo(self.root)
        with open(os.path.join(self.root, ".gitignore"), "w") as f:
            f.write("ignored/\n")
        _git("add", ".gitignore", cwd=self.root)
        _git("commit", "-q", "-m", "x", cwd=self.root)
        os.makedirs(os.path.join(self.root, "ignored"))
        with open(os.path.join(self.root, "ignored", "f.txt"), "w") as f:
            f.write("v1")

    def tearDown(self):
        self.tmp.cleanup()

    def test_key_is_none_before_and_after_the_ignored_mutation(self):
        kind1, key1 = es.staleness_for("telescope", {}, self.root, ".")
        with open(os.path.join(self.root, "ignored", "f.txt"), "w") as f:
            f.write("v2 — mutated, but git status --porcelain cannot see it")
        kind2, key2 = es.staleness_for("telescope", {}, self.root, ".")

        self.assertEqual(kind1, es.KIND_SUBTREE)
        self.assertEqual(kind2, es.KIND_SUBTREE)
        # The bug this guards against: key1 == key2 == <some stable hash>
        # would mean a recall could serve v1's answer after v2 shipped.
        self.assertIsNone(key1)
        self.assertIsNone(key2)

    def test_clean_subtree_without_ignored_paths_is_recallable(self):
        clean = os.path.join(self.root, "clean")
        os.makedirs(clean)
        with open(os.path.join(clean, "f.txt"), "w") as f:
            f.write("v1")
        _git("add", "clean", cwd=self.root)
        _git("commit", "-q", "-m", "y", cwd=self.root)
        kind, key = es.staleness_for("telescope", {}, self.root, "clean")
        self.assertEqual(kind, es.KIND_SUBTREE)
        self.assertIsNotNone(key)


class TestSymlinkRefusesRecall(unittest.TestCase):
    def test_symlink_target_present_under_subtree_refuses(self):
        with tempfile.TemporaryDirectory() as root:
            _init_repo(root)
            with open(os.path.join(root, "real.txt"), "w") as f:
                f.write("v1")
            _git("add", "real.txt", cwd=root)
            _git("commit", "-q", "-m", "x", cwd=root)
            sub = os.path.join(root, "sub")
            os.makedirs(sub)
            os.symlink(os.path.join(root, "real.txt"), os.path.join(sub, "link.txt"))
            kind, key = es.staleness_for("telescope", {}, root, "sub")
            self.assertEqual(kind, es.KIND_SUBTREE)
            self.assertIsNone(key)


class TestReadHeadSha(unittest.TestCase):
    def test_matches_git_rev_parse(self):
        with tempfile.TemporaryDirectory() as root:
            _init_repo(root)
            with open(os.path.join(root, "f.txt"), "w") as f:
                f.write("x")
            _git("add", "f.txt", cwd=root)
            _git("commit", "-q", "-m", "x", cwd=root)
            expected = subprocess.run(
                ["git", "rev-parse", "HEAD"], cwd=root,
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            self.assertEqual(es._read_head_sha(root), expected)


class TestRepoCleanGate(unittest.TestCase):
    """microscope(refs=true) staleness — Codex review, finding 4: refs
    cross-references the whole repo, so only a fully clean tree is sound."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        _init_repo(self.root)
        with open(os.path.join(self.root, "target.py"), "w") as f:
            f.write("def f(): pass\n")
        with open(os.path.join(self.root, "caller.py"), "w") as f:
            f.write("from target import f\nf()\n")
        _git("add", "-A", cwd=self.root)
        _git("commit", "-q", "-m", "x", cwd=self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_clean_tree_yields_repo_clean_key(self):
        kind, key = es.staleness_for(
            "microscope", {"path": "target.py", "refs": True}, self.root, "target.py")
        self.assertEqual(kind, es.KIND_REPO_CLEAN)
        self.assertIsNotNone(key)

    def test_dirt_in_an_UNRELATED_file_still_refuses(self):
        # The bug this guards against: a subtree key over target.py alone
        # would stay stable while caller.py (which actually references it)
        # changes underneath it.
        with open(os.path.join(self.root, "caller.py"), "a") as f:
            f.write("f()\n")
        kind, key = es.staleness_for(
            "microscope", {"path": "target.py", "refs": True}, self.root, "target.py")
        self.assertEqual(kind, es.KIND_REPO_CLEAN)
        self.assertIsNone(key)
