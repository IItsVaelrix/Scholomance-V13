"""The full BrainBridge pipeline must reach repaired specialist brains.

Directly calling a mini-brain is not evidence that its routing gate works.
These tests invoke BrainBridge.ask() so removing the relevant activation
signals is an observable product failure.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from vaelrix_forcefield import BrainBridge


class _CapturingLLM:
    def __call__(self, prompt: str) -> str:
        return prompt


class TestBrainBridgeRouting(unittest.TestCase):
    def _active_brains(self, query: str) -> set[str]:
        result = BrainBridge(llm_client=_CapturingLLM()).ask(query, max_workers=1)
        return {brain.brainId for brain in result["raw_results"]}

    def test_typography_query_reaches_ui_brain(self):
        active = self._active_brains("what typography should the scroll editor use")
        self.assertIn("UI_BRAIN", active)

    def test_refactor_layers_query_reaches_architecture_brain(self):
        active = self._active_brains("plan a refactor across layers")
        self.assertIn("ARCHITECTURE_BRAIN", active)


if __name__ == "__main__":
    unittest.main()
