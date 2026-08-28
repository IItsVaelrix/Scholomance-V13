"""
Vaelrix Cortex ForceField — Memory Brain.

Reads the ForceField's own confirmed facts and substrate context to surface
relevant prior knowledge without performing new searches.
"""

from __future__ import annotations

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


MEMORY_BRAIN = AmplifierBrain(
    id="MEMORY_BRAIN",
    domain=["memory", "history", "patterns", "prior"],
    activationSignals=[
        "memory", "history", "pattern", "prior", "remember", "known", "before",
        "already tried", "already try", "we tried", "what did we try", "previously", "last time", "context ledger",
    ],
    allowedTools=["memory_get", "memory_set", "codebase_search"],
    defaultSearchBudget=2,
    weight=0.9,
)


def run_memory_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    findings: list[str] = []

    if field.context.confirmedFacts:
        findings.append(f"{len(field.context.confirmedFacts)} confirmed fact(s) in Context Ledger.")
    if field.context.confirmedFiles:
        labels = ", ".join(list(field.context.confirmedFiles.keys())[:5])
        findings.append(f"Known files: {labels}")
    if field.context.confirmedSymbols:
        symbols = ", ".join(list(field.context.confirmedSymbols.keys())[:5])
        findings.append(f"Known symbols: {symbols}")
    if field.context.rejectedPaths:
        findings.append(f"{len(field.context.rejectedPaths)} path(s) already rejected.")

    if not findings:
        findings.append("No prior context recorded for this task yet.")

    return AmplifierResult(
        brainId=MEMORY_BRAIN.id,
        summary="Summarized ForceField working memory.",
        findings=findings,
        recommendedAction="Use confirmed files/symbols before searching again.",
        resonance=ResonanceScore(
            intentMatch=0.6,
            evidenceStrength=0.7,
            novelty=0.3,
            conflictRisk=0.1,
            actionability=0.6,
        ),
    )
