"""
Vaelrix Cortex ForceField — Critique Brain.

Provides lightweight structural critique of the task itself: is it well-scoped?
Does it contradict declared goals? Is there enough evidence to act?
"""

from __future__ import annotations

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


CRITIQUE_BRAIN = AmplifierBrain(
    id="CRITIQUE_BRAIN",
    domain=["critique", "review", "weakness", "improvement"],
    activationSignals=[
        "critique", "review", "weakness", "improve", "grade", "score",
        "what's wrong with", "wrong with this", "flaws", "shortcomings", "how could this be better",
    ],
    allowedTools=["read_file", "critique"],
    defaultSearchBudget=2,
)


def run_critique_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    q = query or field.task.rawUserRequest
    findings: list[str] = []

    if len(q.strip()) < 15:
        findings.append("Request is very short; clarify scope before acting.")
    if not field.task.successCriteria:
        findings.append("No success criteria defined; add at least one acceptance check.")
    if field.search.searchCount >= field.search.maxSearchesPerPhase:
        findings.append("Search budget exhausted; consider escalating to synthesis.")
    if not findings:
        findings.append("Task appears sufficiently scoped; proceed with active brains.")

    return AmplifierResult(
        brainId=CRITIQUE_BRAIN.id,
        summary="Structural critique of task readiness.",
        findings=findings,
        recommendedAction="Address any readiness gaps before editing code.",
        resonance=ResonanceScore(
            intentMatch=0.7,
            evidenceStrength=0.5,
            novelty=0.5,
            conflictRisk=0.1,
            actionability=0.7,
        ),
    )
