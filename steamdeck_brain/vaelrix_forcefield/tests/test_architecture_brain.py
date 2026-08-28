"""ARCHITECTURE_BRAIN must see this project's REAL layer architecture
(codex/core, codex/services, codex/runtime, codex/server) and quote the
actual documented layer law, not just scan top-level repo directories
against a generic name whitelist.

Root cause: _scan_layer_dirs called root.iterdir() (repo root only, no
recursion), so the real CODEx layers living under codex/ were invisible —
the brain could only ever see a coincidental repo-root dir named "data".
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains import architecture_brain
from vaelrix_forcefield.brains._evidence_errors import EvidenceLookupError
from vaelrix_forcefield.brains.architecture_brain import run_architecture_brain
from vaelrix_forcefield.forcefield import create_force_field


def _codex_layers_present() -> bool:
    here = Path(__file__).resolve()
    for _ in range(10):
        if (here / "codex" / "core").is_dir() and (here / "codex" / "server").is_dir():
            return True
        here = here.parent
    return False


class TestArchitectureBrainRealLayers(unittest.TestCase):
    def test_sees_the_real_codex_layers_not_just_repo_root_dirs(self):
        if not _codex_layers_present():
            self.skipTest("codex/{core,server} not present in this checkout")
        text = "plan a refactor across layers"
        field = create_force_field(text)
        result = run_architecture_brain(field, query=text)
        joined = " ".join(result.findings)
        self.assertIn("codex/core", joined)
        self.assertIn("codex/server", joined)

    def test_refactor_finding_quotes_the_real_layer_law_not_a_bare_citation(self):
        if not _codex_layers_present():
            self.skipTest("codex/{core,server} not present in this checkout")
        text = "plan a refactor across layers"
        field = create_force_field(text)
        result = run_architecture_brain(field, query=text)
        joined = " ".join(result.findings)
        # The old citation was the bare phrase "per CODEx contract" with no
        # actual quoted rule text behind it. Assert real law-doc content
        # appears — the phrase this project's own CLAUDE.md uses.
        self.assertIn("four strict layers", joined.lower())

    def test_all_law_files_unreadable_raises_evidence_lookup_error_not_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            law_dir = root / "docs" / "scholomance-encyclopedia" / "Scholomance LAW"
            law_dir.mkdir(parents=True)
            (law_dir / "CLAUDE.md").write_text("four strict layers")

            with patch.object(Path, "read_text", side_effect=OSError("simulated: permission denied")):
                with self.assertRaises(EvidenceLookupError):
                    architecture_brain._quote_law(root, "four strict layers")


if __name__ == "__main__":
    unittest.main()
