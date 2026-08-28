"""The registry must be the SAME objects as brains/*.py's own XXX_BRAIN
constants, not a hand-duplicated second copy.

Root cause found while auditing routing signals for S-tier remediation:
amplifier_registry.py re-declared every AmplifierBrain independently from
brains/*.py. Editing a brain's activationSignals in brains/pixel_brain.py
(the file every other brain-level fix this session touched) had NO effect
on real routing, because BrainBridge/apply_routing consult
amplifier_registry.get_registry(), which held a completely separate,
silently-diverging copy. This is exactly the class of bug a single source
of truth prevents.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield.amplifier_registry import get_brain_by_id
from vaelrix_forcefield.brains import (
    ARCHITECTURE_BRAIN, AUDIO_BRAIN, CODE_BRAIN, CRITIQUE_BRAIN,
    DETERMINISM_BRAIN, LORE_BRAIN, MEMORY_BRAIN, PHONEME_BRAIN,
    PIXEL_BRAIN, RHYME_BRAIN, RISK_BRAIN, SEO_BRAIN, TEST_BRAIN, UI_BRAIN,
)


class TestRegistryIsSingleSourceOfTruth(unittest.TestCase):
    def test_registry_brains_are_identical_objects_to_brains_module_constants(self):
        pairs = [
            ("CODE_BRAIN", CODE_BRAIN), ("TEST_BRAIN", TEST_BRAIN),
            ("MEMORY_BRAIN", MEMORY_BRAIN), ("RISK_BRAIN", RISK_BRAIN),
            ("PIXEL_BRAIN", PIXEL_BRAIN), ("RHYME_BRAIN", RHYME_BRAIN),
            ("PHONEME_BRAIN", PHONEME_BRAIN), ("LORE_BRAIN", LORE_BRAIN),
            ("CRITIQUE_BRAIN", CRITIQUE_BRAIN), ("SEO_BRAIN", SEO_BRAIN),
            ("AUDIO_BRAIN", AUDIO_BRAIN), ("UI_BRAIN", UI_BRAIN),
            ("DETERMINISM_BRAIN", DETERMINISM_BRAIN),
            ("ARCHITECTURE_BRAIN", ARCHITECTURE_BRAIN),
        ]
        for brain_id, brain_module_const in pairs:
            with self.subTest(brain_id=brain_id):
                registry_brain = get_brain_by_id(brain_id)
                self.assertIsNotNone(registry_brain)
                self.assertIs(
                    registry_brain, brain_module_const,
                    f"{brain_id}: registry holds a DIFFERENT object than brains/*.py's "
                    "own constant — editing one will not affect the other.",
                )

    def test_risk_brain_weight_preserved_after_dedup(self):
        self.assertEqual(get_brain_by_id("RISK_BRAIN").weight, 1.1)

    def test_memory_brain_weight_preserved_after_dedup(self):
        self.assertEqual(get_brain_by_id("MEMORY_BRAIN").weight, 0.9)

    def test_determinism_brain_weight_preserved_after_dedup(self):
        self.assertEqual(get_brain_by_id("DETERMINISM_BRAIN").weight, 0.9)


if __name__ == "__main__":
    unittest.main()
