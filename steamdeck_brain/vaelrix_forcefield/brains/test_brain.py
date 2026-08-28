"""
Vaelrix Cortex ForceField — Test Brain.

Suggests test strategies and retest requirements based on the task.
"""

from __future__ import annotations

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


TEST_BRAIN = AmplifierBrain(
    id="TEST_BRAIN",
    domain=["testing", "validation", "regression"],
    activationSignals=[
        "test", "regression", "validate", "verify", "coverage", "qa",
        "doesn't break", "don't break", "won't break", "make sure this works", "sanity check",
    ],
    allowedTools=["run_tests", "search_code", "read_file"],
    defaultSearchBudget=3,
)


def run_test_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    q = (query or field.task.rawUserRequest).lower()
    findings: list[str] = []

    if "test" in q or "tests" in q:
        findings.append("Add or update unit tests for the changed behavior.")
    if "regression" in q or "risk" in q:
        findings.append("Run the existing regression suite before finalizing.")
    if "refactor" in q:
        findings.append("Run all tests touching the refactored module.")
    if not findings:
        findings.append("Consider a smoke test to confirm no unintended breakage.")

    return AmplifierResult(
        brainId=TEST_BRAIN.id,
        summary="Test strategy derived from task keywords.",
        findings=findings,
        recommendedAction="Run targeted tests and verify the change does not break existing behavior.",
        resonance=ResonanceScore(
            intentMatch=0.7,
            evidenceStrength=0.5,
            novelty=0.4,
            conflictRisk=0.1,
            actionability=0.8,
        ),
    )
