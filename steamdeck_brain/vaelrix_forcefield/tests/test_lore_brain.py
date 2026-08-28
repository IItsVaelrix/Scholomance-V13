"""LORE_BRAIN must quote the actual encyclopedia content that defines a
canon term, not just report a matched filename.

Root cause: _scan_lore_files matched a term against candidate.name.lower()
(the FILENAME) and never opened the file, so a term genuinely defined
inside a file whose name doesn't contain that term was invisible, and the
brain never surfaced what the definition actually says.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains import lore_brain
from vaelrix_forcefield.brains._evidence_errors import EvidenceLookupError
from vaelrix_forcefield.brains.lore_brain import run_lore_brain
from vaelrix_forcefield.forcefield import create_force_field


def _encyclopedia_present() -> bool:
    here = Path(__file__).resolve()
    for _ in range(10):
        if (here / "docs" / "scholomance-encyclopedia").is_dir():
            return True
        here = here.parent
    return False


class TestLoreBrainRealContent(unittest.TestCase):
    def test_quotes_real_encyclopedia_text_for_a_canon_term(self):
        if not _encyclopedia_present():
            self.skipTest("docs/scholomance-encyclopedia not present in this checkout")
        field = create_force_field("how does mirrorborne integration work")
        result = run_lore_brain(field, query="how does mirrorborne integration work")
        joined = " ".join(result.findings)
        # A real quoted line from the actual encyclopedia, not just a matched
        # filename — the exact file rglob() surfaces first isn't guaranteed,
        # but the quote must come from inside docs/scholomance-encyclopedia
        # and must actually contain the term (proving a file was opened).
        self.assertIn("docs/scholomance-encyclopedia", joined)
        self.assertIn("mirrorborne", joined.lower())
        self.assertIn('"', joined)  # a quoted line, not a bare filename list

    def test_all_files_unreadable_raises_evidence_lookup_error_not_none(self):
        """When every candidate file fails to read, that's not the same as
        genuinely searching and finding no mention — the caller must be
        able to tell the difference."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            encyclopedia = root / "docs" / "scholomance-encyclopedia"
            encyclopedia.mkdir(parents=True)
            (encyclopedia / "one.md").write_text("mirrorborne is mentioned here")

            with patch.object(Path, "read_text", side_effect=OSError("simulated: permission denied")):
                with self.assertRaises(EvidenceLookupError):
                    lore_brain._quote_term_definition(root, "mirrorborne")

    def test_one_bad_file_among_many_good_ones_still_finds_the_real_match(self):
        """A single unreadable file must not abort a search that would
        otherwise succeed against the other files."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            encyclopedia = root / "docs" / "scholomance-encyclopedia"
            encyclopedia.mkdir(parents=True)
            (encyclopedia / "bad.md").write_text("irrelevant")
            (encyclopedia / "good.md").write_text("mirrorborne is the central concept")

            real_read_text = Path.read_text

            def flaky_read_text(self, *a, **kw):
                if self.name == "bad.md":
                    raise OSError("simulated: permission denied")
                return real_read_text(self, *a, **kw)

            with patch.object(Path, "read_text", flaky_read_text):
                result = lore_brain._quote_term_definition(root, "mirrorborne")
            self.assertIsNotNone(result)
            self.assertIn("good.md", result[0])


if __name__ == "__main__":
    unittest.main()
