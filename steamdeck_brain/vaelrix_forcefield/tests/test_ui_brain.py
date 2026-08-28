"""UI_BRAIN must recognize and quote this project's OWN documented design
system (Georgia serif combat text, JetBrains Mono for data, school-themed
CSS variables, Truesight overlay) rather than only generic web-dev
vocabulary (flexbox/modal/carousel) that has nothing to do with how this
project's UI actually works.

Root cause: _LAYOUT_TERMS/_COMPONENT_TERMS/_THEME_TERMS were textbook
web-UI glossaries with zero connection to this project's real, already
-documented design system (Scholomance LAW/CLAUDE.md's Design System table),
so a query about this project's actual typography or theming got generic
Bootstrap-vocabulary noise instead of the real rule.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains import ui_brain
from vaelrix_forcefield.brains._evidence_errors import EvidenceLookupError
from vaelrix_forcefield.brains.ui_brain import run_ui_brain
from vaelrix_forcefield.forcefield import create_force_field


def _law_doc_present() -> bool:
    here = Path(__file__).resolve()
    for _ in range(10):
        candidate = here / "docs" / "scholomance-encyclopedia" / "Scholomance LAW" / "CLAUDE.md"
        if candidate.exists():
            return True
        here = here.parent
    return False


class TestUiBrainRealDesignSystem(unittest.TestCase):
    def test_quotes_the_real_project_typography_rule(self):
        if not _law_doc_present():
            self.skipTest("Scholomance LAW/CLAUDE.md not present in this checkout")
        text = "what typography should the scroll editor use"
        field = create_force_field(text)
        result = run_ui_brain(field, query=text)
        joined = " ".join(result.findings)
        self.assertIn("Georgia", joined)

    def test_unreadable_design_doc_raises_evidence_lookup_error_not_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            law_dir = root / "docs" / "scholomance-encyclopedia" / "Scholomance LAW"
            law_dir.mkdir(parents=True)
            (law_dir / "CLAUDE.md").write_text("Georgia, serif")

            with patch.object(Path, "read_text", side_effect=OSError("simulated: permission denied")):
                with self.assertRaises(EvidenceLookupError):
                    ui_brain._quote_design_system(root, "typography")


if __name__ == "__main__":
    unittest.main()
