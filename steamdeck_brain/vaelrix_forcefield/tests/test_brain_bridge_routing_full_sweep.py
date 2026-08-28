"""Systemic activation-signal audit: every brain, not just the two already
verified (UI_BRAIN, ARCHITECTURE_BRAIN in test_brain_bridge_routing.py).

Root cause pattern (same one already fixed twice): each brain's internal
domain vocabulary (pattern dicts, canon terms, ARPAbet/rhyme lookups) is
richer than the activationSignals keyword gate in front of it, so a
realistic query using the brain's own domain language never reaches it.
These are natural phrasings a real user would plausibly type, not
adversarial edge cases.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield import BrainBridge


class _CapturingLLM:
    def __call__(self, prompt: str) -> str:
        return prompt


class TestFullBrainRoutingSweep(unittest.TestCase):
    def _active_brains(self, query: str) -> set[str]:
        result = BrainBridge(llm_client=_CapturingLLM()).ask(query, max_workers=1)
        return {brain.brainId for brain in result["raw_results"]}

    def test_determinism_query_without_literal_keyword(self):
        active = self._active_brains("why does this give different output every time I run it")
        self.assertIn("DETERMINISM_BRAIN", active)

    def test_code_query_without_literal_keyword(self):
        active = self._active_brains("why is this crashing on startup")
        self.assertIn("CODE_BRAIN", active)

    def test_critique_query_without_literal_keyword(self):
        active = self._active_brains("what's wrong with this approach")
        self.assertIn("CRITIQUE_BRAIN", active)

    def test_architecture_pattern_name_not_in_activation_signals(self):
        active = self._active_brains("should I use microservices for this")
        self.assertIn("ARCHITECTURE_BRAIN", active)

    def test_audio_query_without_literal_keyword(self):
        active = self._active_brains("set the tempo to 140 BPM")
        self.assertIn("AUDIO_BRAIN", active)

    def test_memory_query_without_literal_keyword(self):
        active = self._active_brains("what did we already try for this")
        self.assertIn("MEMORY_BRAIN", active)

    def test_pixel_query_without_literal_keyword(self):
        active = self._active_brains("verify the checksum on this asset packet")
        self.assertIn("PIXEL_BRAIN", active)

    def test_risk_query_without_literal_keyword(self):
        active = self._active_brains("will this break something downstream")
        self.assertIn("RISK_BRAIN", active)

    def test_rhyme_query_without_literal_keyword(self):
        active = self._active_brains("does this couplet scan well")
        self.assertIn("RHYME_BRAIN", active)

    def test_phoneme_query_without_literal_keyword(self):
        active = self._active_brains("check the ARPAbet transcription for this word")
        self.assertIn("PHONEME_BRAIN", active)

    def test_lore_query_without_literal_keyword(self):
        active = self._active_brains("what does the encyclopedia say about resonance")
        self.assertIn("LORE_BRAIN", active)

    def test_test_brain_query_without_literal_keyword(self):
        active = self._active_brains("make sure this doesn't break anything")
        self.assertIn("TEST_BRAIN", active)

    def test_seo_query_without_literal_keyword(self):
        active = self._active_brains("will this thumbnail text get clicks")
        self.assertIn("SEO_BRAIN", active)


if __name__ == "__main__":
    unittest.main()
