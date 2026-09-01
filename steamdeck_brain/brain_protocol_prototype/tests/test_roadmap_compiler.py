"""Pure roadmap compiler prototype tests. No persistence, no MCP, no
production vaelrix_forcefield/ changes — matches the Delivery Sequence's
Step 1 in docs/superpowers/specs/2026-08-28-opt-in-brain-protocol-execution-design.md.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from roadmap_compiler import TaskFraming, compile_roadmap


class TestUnclassifiedTaskFraming(unittest.TestCase):
    def test_unclassified_task_gets_class_neutral_phases_only(self):
        framing = TaskFraming(state="unclassified")
        contract = compile_roadmap(
            raw_request="do something",
            task_framing=framing,
            active_brains=[],
            accepted_findings=[],
            contradictions=[],
            protocol_id="p1",
        )
        phase_ids = [p.phase_id for p in contract.phases]
        self.assertIn("EVIDENCE_RECON", phase_ids)
        self.assertIn("SCOPE_CONFIRMATION", phase_ids)
        self.assertNotIn("IMPLEMENTATION", phase_ids)
        self.assertNotIn("DESIGN", phase_ids)
        self.assertTrue(contract.blocked_questions)

    def test_unclassified_task_still_gets_handoff_phase(self):
        framing = TaskFraming(state="unclassified")
        contract = compile_roadmap(
            raw_request="do something", task_framing=framing, active_brains=[],
            accepted_findings=[], contradictions=[], protocol_id="p1",
        )
        self.assertIn("HANDOFF_RECEIPT", [p.phase_id for p in contract.phases])


class TestBoundaryClassifierRule(unittest.TestCase):
    """Arm A's compiler rule, pre-registered in PREREGISTRATION.md."""

    def test_boundary_classifier_task_requires_boundary_equality_check(self):
        framing = TaskFraming(state="declared", task_class="implementation")
        request = (
            "write classify_intervals and its tests, classifying into one of "
            "DISJOINT_BEFORE, DISJOINT_AFTER, TOUCHING_BEFORE, TOUCHING_AFTER, "
            "EQUAL, CONTAINS, CONTAINED_BY, OVERLAPPING_LEFT, OVERLAPPING_RIGHT"
        )
        contract = compile_roadmap(
            raw_request=request, task_framing=framing, active_brains=[],
            accepted_findings=[], contradictions=[], protocol_id="p2",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks)
        self.assertIn("boundary-equality", joined.lower())

    def test_single_word_all_caps_labels_are_not_silently_dropped(self):
        """Found while running the real efficacy corpus: EQUAL and CONTAINS
        (no underscore) were silently missing from the generated label list
        even though the check itself still fired correctly."""
        framing = TaskFraming(state="declared", task_class="implementation")
        request = (
            "classify into one of DISJOINT_BEFORE, DISJOINT_AFTER, EQUAL, "
            "CONTAINS, CONTAINED_BY"
        )
        contract = compile_roadmap(
            raw_request=request, task_framing=framing, active_brains=[],
            accepted_findings=[], contradictions=[], protocol_id="p2b",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks)
        self.assertIn("EQUAL", joined)
        self.assertIn("CONTAINS", joined)

    def test_non_classifier_task_does_not_get_boundary_equality_check(self):
        """Negative control: the rule must not fire on every task."""
        framing = TaskFraming(state="declared", task_class="implementation")
        contract = compile_roadmap(
            raw_request="fix the typo in the README file",
            task_framing=framing, active_brains=[], accepted_findings=[],
            contradictions=[], protocol_id="p3",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks)
        self.assertNotIn("boundary-equality", joined.lower())


class TestSilenceVsFailureRule(unittest.TestCase):
    """Arm C's compiler rule, pre-registered in PREREGISTRATION.md as a probe
    against my own measured blind spot (14 except-blocks added in one real
    session, 12 collapsing confirmed-absent and could-not-confirm)."""

    def test_lookup_with_exception_fallback_requires_distinguishability_check(self):
        framing = TaskFraming(state="declared", task_class="implementation")
        request = (
            "Add a new helper function that looks up cached user profile "
            "data from a local store; if the store connection fails or the "
            "profile isn't cached, catch the exception and return None so "
            "the caller can fall back to a default."
        )
        contract = compile_roadmap(
            raw_request=request, task_framing=framing, active_brains=[],
            accepted_findings=[], contradictions=[], protocol_id="p6",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks).lower()
        self.assertIn("confirmed-absent", joined)
        self.assertIn("distinguish", joined)

    def test_task_without_lookup_or_exception_language_does_not_get_check(self):
        """Negative control: the rule must not fire on every task."""
        framing = TaskFraming(state="declared", task_class="implementation")
        contract = compile_roadmap(
            raw_request="write a function that adds two numbers and returns the sum",
            task_framing=framing, active_brains=[], accepted_findings=[],
            contradictions=[], protocol_id="p7",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks).lower()
        self.assertNotIn("confirmed-absent", joined)


class TestQuotedCitationRule(unittest.TestCase):
    """Arm B's compiler rule, pre-registered in PREREGISTRATION.md."""

    def test_quoted_law_citation_requires_specific_verification_check(self):
        framing = TaskFraming(state="declared", task_class="implementation")
        finding = (
            'Multi-layer project — this project\'s own law states: '
            '"CODEx has four strict layers (no layer may skip)"'
        )
        contract = compile_roadmap(
            raw_request="plan a refactor across architecture layers",
            task_framing=framing, active_brains=["ARCHITECTURE_BRAIN"],
            accepted_findings=[finding], contradictions=[], protocol_id="p4",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks)
        self.assertIn("four strict layers", joined)

    def test_no_citation_finding_does_not_get_citation_check(self):
        """Negative control."""
        framing = TaskFraming(state="declared", task_class="implementation")
        contract = compile_roadmap(
            raw_request="plan a refactor across architecture layers",
            task_framing=framing, active_brains=["ARCHITECTURE_BRAIN"],
            accepted_findings=["No explicit architectural pattern detected."],
            contradictions=[], protocol_id="p5",
        )
        verification = next(p for p in contract.phases if p.phase_id == "VERIFICATION")
        joined = " ".join(verification.completion_checks)
        self.assertNotIn("per docs/", joined)
        self.assertEqual(
            sum(1 for c in verification.completion_checks if "quoted constraint" in c.lower()),
            0,
        )


if __name__ == "__main__":
    unittest.main()
