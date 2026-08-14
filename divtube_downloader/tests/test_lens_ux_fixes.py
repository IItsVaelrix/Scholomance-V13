"""Failing-first tests for the 2026-08-14 lens UX fixes.

Each class names the production change that would make it fail.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

from tui.services import code_atlas, code_lens

HERE = os.path.dirname(os.path.abspath(__file__))
DIVTUBE_ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROJECT_ROOT = os.path.abspath(os.path.join(DIVTUBE_ROOT, ".."))
LENS_CLI = os.path.join(PROJECT_ROOT, "scripts", "lens_cli.py")


def _write(root: str, rel: str, content: str) -> None:
    full = os.path.join(root, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as fh:
        fh.write(content)


class TestJsSymbolExtractor(unittest.TestCase):
    """JS extractor must index export-const data and ignore `const t = (` locals."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        _write(
            self.root,
            "mod.js",
            "export const PAIR_OPERATIONS = Object.freeze({ a: 1 });\n"
            "export const PROJECTION_TRANSITIONS = Object.freeze([]);\n"
            "const t = (y - headTopY) / Math.max(1, headBotY - headTopY);\n"
            "export const add = (a, b) => a + b;\n"
            "export const boxed = (\n"
            "  x\n"
            ") => x;\n"
            "export function keep() { return 1; }\n"
            "const localData = { n: 1 };\n",
        )

    def tearDown(self):
        self.tmp.cleanup()

    def test_export_const_data_bindings_are_indexed(self):
        result = code_lens.microscope(self.root, "mod.js")
        names = [s["name"] for s in result["symbols"]]
        self.assertIn("PAIR_OPERATIONS", names)
        self.assertIn("PROJECTION_TRANSITIONS", names)

    def test_local_const_paren_expression_is_not_a_symbol(self):
        result = code_lens.microscope(self.root, "mod.js")
        names = [s["name"] for s in result["symbols"]]
        self.assertNotIn("t", names)
        self.assertNotIn("localData", names)

    def test_arrow_and_function_bindings_are_kept(self):
        result = code_lens.microscope(self.root, "mod.js")
        names = [s["name"] for s in result["symbols"]]
        self.assertIn("add", names)
        self.assertIn("boxed", names)
        self.assertIn("keep", names)


class TestBakFilter(unittest.TestCase):
    """Telescope children must omit healer/consolidation backups."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        _write(self.root, "real.py", "def keep():\n    return 1\n")
        _write(self.root, "real.py.bak", "def stale():\n    return 0\n")
        _write(self.root, "real.py.healer.bak", "def healer():\n    return 0\n")
        _write(self.root, "tool_service.py.consolidation-backup", "x = 1\n")
        _write(self.root, "db.sqlite.bak-shm", "x")
        _write(self.root, "db.sqlite.bak-wal", "x")

    def tearDown(self):
        self.tmp.cleanup()

    def test_backup_suffixes_are_absent_from_the_tree(self):
        result = code_lens.telescope(self.root, ".", max_depth=1)
        serialized = json.dumps(result)
        self.assertIn("real.py", serialized)
        self.assertNotIn(".bak", serialized)
        self.assertNotIn("consolidation-backup", serialized)


class TestSymbolBudgetPrefersAskedDirectory(unittest.TestCase):
    """Current-directory files spend the symbol budget before children."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        _write(self.root, "hub.py", "def hub():\n    return 1\n")
        for i in range(code_lens.MAX_SYMBOLIZED_FILES + 5):
            _write(
                self.root,
                f"aaa/child_{i:03d}.py",
                f"def child_{i}():\n    return {i}\n",
            )

    def tearDown(self):
        self.tmp.cleanup()

    def test_hub_in_asked_dir_is_symbolized_when_children_would_exhaust_budget(self):
        result = code_lens.telescope(self.root, ".", max_depth=2)
        hub = next(
            c for c in result["tree"]["children"]
            if c.get("path", "").endswith("hub.py")
        )
        names = [s["name"] for s in hub.get("symbols") or []]
        self.assertIn("hub", names, hub)


class TestRescueMode(unittest.TestCase):
    """Wrong-file + refs that find a definition is a rescue, not a failure."""

    @classmethod
    def setUpClass(cls):
        from tests.test_code_atlas import _make_fixture_repo
        cls.repo = _make_fixture_repo()
        built = code_atlas.build_atlas(cls.repo)
        assert built["ok"], built

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.repo, ignore_errors=True)

    def test_refs_finding_a_foreign_definition_is_rescue(self):
        result = code_lens.microscope(
            self.repo,
            "src/App.jsx",
            symbol="buildExtrapolationSlate",
            refs=True,
        )
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["mode"], "rescue")
        self.assertIn("codex/core/thing.js", result["definedIn"])
        self.assertGreater(len(result.get("refs") or []), 0)

    def test_true_miss_stays_a_failure(self):
        result = code_lens.microscope(
            self.repo,
            "src/App.jsx",
            symbol="DefinitelyNotARealSymbolXYZ",
            refs=True,
        )
        self.assertFalse(result["ok"])
        self.assertNotEqual(result.get("mode"), "rescue")


class TestHumanizedLastCommit(unittest.TestCase):
    """Vitality timestamps must carry an ISO companion next to the unix value."""

    @classmethod
    def setUpClass(cls):
        from tests.test_code_atlas import _make_fixture_repo
        cls.repo = _make_fixture_repo()
        built = code_atlas.build_atlas(cls.repo)
        assert built["ok"], built

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls.repo, ignore_errors=True)

    def test_file_info_includes_iso(self):
        atlas = code_atlas.load_atlas(self.repo)
        info = atlas.file_info("src/App.jsx")
        self.assertIsInstance(info["lastCommit"], int)
        self.assertRegex(info["lastCommitIso"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

    def test_rollup_includes_iso(self):
        atlas = code_atlas.load_atlas(self.repo)
        roll = atlas.dir_rollup("src")
        self.assertRegex(roll["medianLastCommitIso"], r"^\d{4}-\d{2}-\d{2}T")

    def test_telescope_file_telemetry_includes_iso(self):
        result = code_lens.telescope(self.repo, "src/App.jsx")
        iso = result["view"]["telemetry"]["lastCommitIso"]
        self.assertRegex(iso, r"^\d{4}-\d{2}-\d{2}T")


class TestSerializeForAgent(unittest.TestCase):
    """Cockpit payload must lead with summary/telemetry, not the tree."""

    def test_priority_keys_precede_tree(self):
        result = code_lens.telescope(
            PROJECT_ROOT, "divtube_downloader/tui/services", max_depth=1
        )
        payload = code_lens.serialize_for_agent(result)
        self.assertLess(payload.index('"summary"'), payload.index('"tree"'))
        self.assertLess(payload.index('"telemetry"'), payload.index('"tree"'))
        self.assertTrue(payload.startswith("{"))
        # Compact JSON — indent would waste the agent window.
        self.assertNotIn("\n  ", payload)

    def test_oversize_dir_keeps_summary_inside_cap(self):
        result = code_lens.telescope(PROJECT_ROOT, ".", max_depth=1, with_symbols=False)
        payload = code_lens.serialize_for_agent(result, cap=8000)
        self.assertLessEqual(len(payload), 8000)
        self.assertIn('"summary"', payload)
        self.assertIn('"telemetry"', payload)
        parsed = json.loads(payload)
        self.assertTrue(parsed.get("ok"))
        self.assertIn("dirs", parsed["summary"])


class TestCockpitToolSurface(unittest.TestCase):
    """Atlas and evaluate are first-class; telescope example is a scoped path."""

    @classmethod
    def setUpClass(cls):
        from tui.services.tool_service import ToolService

        orig = ToolService._init_persistence
        ToolService._init_persistence = lambda self: None  # noqa: ARG005
        try:
            cls.svc = ToolService()
        finally:
            ToolService._init_persistence = orig
        cls.by_name = {t["function"]["name"]: t["function"] for t in cls.svc.tools}

    def test_atlas_tool_registered(self):
        spec = self.by_name["atlas"]
        props = spec["parameters"]["properties"]
        self.assertIn("action", props)
        for action in ("rollup", "refs", "prefix", "stale"):
            self.assertIn(action, json.dumps(props["action"]))

    def test_evaluate_tool_registered(self):
        spec = self.by_name["evaluate"]
        props = spec["parameters"]["properties"]
        self.assertIn("path", props)
        self.assertIn("symbol", props)
        self.assertIn("args", props)

    def test_telescope_example_is_a_scoped_path(self):
        desc = json.dumps(self.by_name["telescope"])
        self.assertNotIn("or '.'", desc)
        self.assertIn("codex/core", desc)

    def test_microscope_schema_still_has_refs(self):
        props = self.by_name["microscope"]["parameters"]["properties"]
        self.assertIn("refs", props)

    def test_handlers_exist(self):
        from tui.services.tool_service import ToolService
        self.assertTrue(hasattr(ToolService, "_atlas"))
        self.assertTrue(hasattr(ToolService, "_evaluate"))


class TestLensCli(unittest.TestCase):
    """scripts/lens_cli.py is the Grok/MCP entrypoint for the four lenses."""

    def _run(self, *args):
        return subprocess.run(
            [sys.executable, LENS_CLI, *args],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def test_cli_exists(self):
        self.assertTrue(os.path.isfile(LENS_CLI), LENS_CLI)

    def test_telescope_via_cli(self):
        proc = self._run("telescope", "--path", "divtube_downloader/tui/services",
                         "--max-depth", "0")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["type"], "dir")

    def test_atlas_stale_via_cli(self):
        proc = self._run("atlas", "--action", "stale")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertIn("stale", payload)

    def test_evaluate_via_cli(self):
        proc = self._run(
            "evaluate",
            "--path", "codex/core/constellation/grimoire/projection-laws.js",
            "--symbol", "synthesizeByProjection",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        payload = json.loads(proc.stdout)
        self.assertTrue(payload["ok"], payload)
        self.assertEqual(payload["shape"]["length"], 79)


class TestMcpBridgeExposesLenses(unittest.TestCase):
    """The Grok harness MCP bridge must register the four lens tools + aliases."""

    def test_bridge_registers_lens_tools(self):
        path = os.path.join(PROJECT_ROOT, "codex", "server", "collab", "mcp-bridge.js")
        with open(path, encoding="utf-8") as fh:
            src = fh.read()
        for name in (
            "mcp_scholomance_collab_telescope",
            "mcp_scholomance_collab_microscope",
            "mcp_scholomance_collab_atlas",
            "mcp_scholomance_collab_evaluate",
        ):
            self.assertIn(name, src)
        self.assertIn("mcp_scholomance_collab_telescope: ['telescope']", src)
        self.assertIn("mcp_scholomance_collab_microscope: ['microscope']", src)
        self.assertIn("mcp_scholomance_collab_atlas: ['atlas']", src)
        self.assertIn("mcp_scholomance_collab_evaluate: ['evaluate']", src)


if __name__ == "__main__":
    unittest.main()
