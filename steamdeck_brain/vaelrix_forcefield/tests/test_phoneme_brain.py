"""PHONEME_BRAIN must report real CMU-dictionary ARPAbet transcriptions,
not letters guessed to be vowels/consonants.

Root cause: run_phoneme_brain counted characters in {a,e,i,o,u} as "vowels"
directly against the raw query text, ignoring the real phoneme dictionary
(scholomance_dict.sqlite) already used elsewhere in this project for the
exact same purpose.
"""

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.brains import _scholomance_dict as sd
from vaelrix_forcefield.brains.phoneme_brain import run_phoneme_brain
from vaelrix_forcefield.forcefield import create_force_field


def _dict_present() -> bool:
    here = Path(__file__).resolve()
    for _ in range(10):
        if (here / "scholomance_dict.sqlite").exists():
            return True
        here = here.parent
    return False


class TestPhonemeBrainRealDictionary(unittest.TestCase):
    def test_reports_a_real_arpabet_transcription(self):
        if not _dict_present():
            self.skipTest("scholomance_dict.sqlite not present in this checkout")
        field = create_force_field("crack the shard and let it break")
        result = run_phoneme_brain(field, query="crack the shard and let it break")
        joined = " ".join(result.findings)
        # "crack" -> real ARPAbet "K R AE1 K" per CMU dict; letter-counting
        # could never produce this string.
        self.assertIn("K R AE1 K", joined)

    def test_broken_dictionary_is_reported_distinctly_not_as_oov_text(self):
        """A broken dictionary connection must not produce the sentence
        'real ARPAbet data unavailable for this text' — that blames the
        input for an infrastructure failure that has nothing to do with it."""
        if not _dict_present():
            self.skipTest("scholomance_dict.sqlite not present in this checkout")

        class _BrokenConnection:
            def execute(self, *a, **kw):
                raise sd.sqlite3.DatabaseError("simulated: database disk image is malformed")

        here = Path(__file__).resolve()
        for _ in range(10):
            if (here / "scholomance_dict.sqlite").exists():
                break
            here = here.parent
        path = sd._dict_path(here)
        sd._connection_cache[path] = _BrokenConnection()
        try:
            text = "crack the shard and let it break"
            field = create_force_field(text)
            result = run_phoneme_brain(field, query=text)
            joined = " ".join(result.findings)
            self.assertNotIn("unavailable for this text", joined)
            self.assertIn("dictionary", joined.lower())
            self.assertIn("unavailable", joined.lower())
        finally:
            del sd._connection_cache[path]


if __name__ == "__main__":
    unittest.main()
