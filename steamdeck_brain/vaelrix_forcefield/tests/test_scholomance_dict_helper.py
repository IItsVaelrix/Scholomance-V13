"""_scholomance_dict must return real CMU-dictionary data from the project's
actual scholomance_dict.sqlite, not a stub."""

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains import _scholomance_dict as sd


def _real_root() -> Path | None:
    here = Path(__file__).resolve()
    for _ in range(10):
        if (here / "scholomance_dict.sqlite").exists():
            return here
        here = here.parent
    return None


class TestScholomanceDictHelper(unittest.TestCase):
    def test_ipa_for_known_word(self):
        root = _real_root()
        if root is None:
            self.skipTest("scholomance_dict.sqlite not present in this checkout")
        self.assertEqual(sd.ipa_for_word(root, "crack"), "K R AE1 K")

    def test_rhyme_for_known_word(self):
        root = _real_root()
        if root is None:
            self.skipTest("scholomance_dict.sqlite not present in this checkout")
        rhyme = sd.rhyme_for_word(root, "crack")
        self.assertEqual(rhyme["rhyme_family"], "AE")

    def test_unknown_word_returns_none(self):
        root = _real_root()
        if root is None:
            self.skipTest("scholomance_dict.sqlite not present in this checkout")
        self.assertIsNone(sd.ipa_for_word(root, "zzznotaword999"))

    def test_count_arpabet_phones(self):
        self.assertEqual(sd.count_arpabet_phones("K R AE1 K"), (1, 3))


if __name__ == "__main__":
    unittest.main()
