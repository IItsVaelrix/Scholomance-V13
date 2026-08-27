"""direct_brain.forcefield_ask must hand the calling agent real material to
reason over, not a placeholder string pretending to be a synthesized answer.

Root cause: forcefield_ask(deterministic=True) built a real, evidence-rich
synthesis prompt via BrainBridge._build_synthesis_prompt, fed it to a
throwaway llm_client, and discarded that client's (fake) output — while the
actual prompt text, containing the real accepted findings, was never
returned to the caller at all.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import direct_brain


class TestDirectBrainSynthesis(unittest.TestCase):
    def test_answer_is_not_a_noop_placeholder(self):
        result = direct_brain.forcefield_ask("check the pixel art color palette")
        self.assertNotIn("DIRECT-NO-LLM", str(result.get("answer")))
        self.assertNotIn("synthesis would be", str(result.get("answer")))

    def test_for_agent_synthesis_contains_the_real_query_and_findings(self):
        result = direct_brain.forcefield_ask("check the pixel art color palette")
        material = result.get("for_agent_synthesis")
        self.assertIsInstance(material, dict)
        self.assertFalse(material["synthesized"])
        self.assertEqual(material["state"], "CALLER_SYNTHESIS_REQUIRED")
        self.assertEqual(material["consumerAction"], "synthesize_from_evidence")
        self.assertIn("check the pixel art color palette", material["material"])
        self.assertIn("Accepted findings:", material["material"])

    def test_synthesized_flag_is_false_in_deterministic_mode(self):
        result = direct_brain.forcefield_ask("check the pixel art color palette")
        self.assertIn("synthesized", result)
        self.assertFalse(result["synthesized"])

    def test_answer_is_none_not_a_fabricated_dict(self):
        # The old code overwrote answer with {"direct": True, "summary": ...,
        # "key_findings": [...]} — a hand-built dict masquerading as synthesis
        # output. There is no synthesis in deterministic mode, so answer must
        # say so plainly rather than simulate one.
        result = direct_brain.forcefield_ask("check the pixel art color palette")
        self.assertIsNone(result.get("answer"))

    def test_ollama_used_still_false(self):
        result = direct_brain.forcefield_ask("check the pixel art color palette")
        self.assertFalse(result.get("ollama_used"))


if __name__ == "__main__":
    unittest.main()
