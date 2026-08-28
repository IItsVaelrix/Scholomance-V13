"""
Vaelrix Cortex ForceField — Determinism Brain.

Specialist brain that audits the ForceField execution for reproducibility.
"""

from __future__ import annotations

from ..determinism_auditor import audit_determinism
from ..types import AmplifierBrain, AmplifierResult, VaelrixCortexForceField


DETERMINISM_BRAIN = AmplifierBrain(
    id="DETERMINISM_BRAIN",
    domain=["determinism", "stability", "reproducibility"],
    activationSignals=["deterministic", "stable", "reproducible", "stasis", "regression test"],
    allowedTools=["diagnostic_scan", "run_tests"],
    defaultSearchBudget=2,
    weight=0.9,
)


def run_determinism_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    """Run the Determinism Brain against the current ForceField.

    This brain does not search; it audits the execution state and any brain
    results already produced. Because it is invoked by the Amplifier Executor
    alongside other brains, it receives an empty result list by default. The
    BrainBridge runs a second audit pass after all brains complete.
    """
    return audit_determinism(field, [])
