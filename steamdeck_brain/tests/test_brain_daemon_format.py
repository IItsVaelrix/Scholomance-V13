"""NoLLMBridge._format must surface for_agent_synthesis material.

direct_brain.forcefield_ask() (deterministic mode) now returns answer=None
and puts the real assembled evidence in for_agent_synthesis instead. Without
this fix, NoLLMBridge._format's `ans = result.get("answer") or {}` silently
degrades to an empty dict and the formatted text loses all content.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from brain_daemon import NoLLMBridge


class TestFormatSurfacesSynthesisMaterial(unittest.TestCase):
    def test_for_agent_synthesis_appears_in_formatted_output(self):
        result = {
            "answer": None,
            "for_agent_synthesis": "User query: check the pixel art color palette\nAccepted findings:\n- Found 14 colour-definition file(s)",
            "findings": ["Found 14 colour-definition file(s)"],
            "synthesized": False,
        }
        text = NoLLMBridge._format(result, show_context=False)
        self.assertIn("check the pixel art color palette", text)
        self.assertIn("Found 14 colour-definition file(s)", text)

    def test_structured_unsynthesized_material_is_visibly_not_an_answer(self):
        result = {
            "answer": None,
            "for_agent_synthesis": {
                "state": "CALLER_SYNTHESIS_REQUIRED",
                "synthesized": False,
                "consumerAction": "synthesize_from_evidence",
                "material": "User query: inspect the evidence",
            },
            "synthesized": False,
        }
        text = NoLLMBridge._format(result, show_context=False)
        self.assertIn("UNSYNTHESIZED EVIDENCE", text)
        self.assertIn("CALLER MUST SYNTHESIZE", text)
        self.assertIn("inspect the evidence", text)


if __name__ == "__main__":
    unittest.main()
