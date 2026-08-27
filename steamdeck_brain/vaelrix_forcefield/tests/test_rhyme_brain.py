"""RHYME_BRAIN must classify rhyme scheme using the real dictionary's
rhyme_family, not a suffix-string guess.

Root cause: _last_syllable_group matched a word's ending against a small
hand-written suffix table (e.g. "ight"->"IGHT"), so words that rhyme in
reality but don't share a spelled suffix (e.g. "break"/"ache" vs a word
spelled differently) were scored as non-rhyming, and vice versa.
"""

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains.rhyme_brain import run_rhyme_brain
from vaelrix_forcefield.forcefield import create_force_field


def _dict_present() -> bool:
    here = Path(__file__).resolve()
    for _ in range(10):
        if (here / "scholomance_dict.sqlite").exists():
            return True
        here = here.parent
    return False


class TestRhymeBrainRealDictionary(unittest.TestCase):
    def test_reports_real_rhyme_family_for_a_known_word(self):
        if not _dict_present():
            self.skipTest("scholomance_dict.sqlite not present in this checkout")
        text = "the sword began to crack\nechoes rolled across the black"
        field = create_force_field(text)
        result = run_rhyme_brain(field, query=text)
        joined = " ".join(result.findings)
        # "crack" and "black" share the real rhyme_family "AE" per the
        # dictionary; a suffix heuristic ("ack") happens to also catch this
        # pair, so assert on the real rhyme_family label appearing, which
        # only a dictionary-backed implementation would surface.
        self.assertIn("AE", joined)


if __name__ == "__main__":
    unittest.main()
