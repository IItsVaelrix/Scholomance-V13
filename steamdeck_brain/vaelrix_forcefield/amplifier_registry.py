"""
Vaelrix Cortex ForceField — Amplifier Registry.

Specialist brains and their default configurations.

This module used to hand-duplicate every brain's AmplifierBrain definition
independently of brains/*.py's own XXX_BRAIN constants. That let the two
copies silently diverge: a fix to a brain's activationSignals (or
allowedTools, or defaultSearchBudget) in brains/*.py had no effect on real
routing, because BrainBridge/apply_routing consult get_registry() here, and
here held its own separate, stale copy. Found via three independent
routing-fix passes in one session, the last two of which edited the wrong
copy. The registry now IS brains/*.py's constants, not a redeclaration of
them, so there is exactly one place per brain to edit.
"""

from __future__ import annotations

from .brains import (
    ARCHITECTURE_BRAIN,
    AUDIO_BRAIN,
    CODE_BRAIN,
    CRITIQUE_BRAIN,
    DETERMINISM_BRAIN,
    LORE_BRAIN,
    MEMORY_BRAIN,
    PHONEME_BRAIN,
    PIXEL_BRAIN,
    RHYME_BRAIN,
    RISK_BRAIN,
    SEO_BRAIN,
    TEST_BRAIN,
    UI_BRAIN,
)
from .types import AmplifierBrain

DEFAULT_AMPLIFIER_REGISTRY: list[AmplifierBrain] = [
    CODE_BRAIN,
    TEST_BRAIN,
    MEMORY_BRAIN,
    RISK_BRAIN,
    PIXEL_BRAIN,
    RHYME_BRAIN,
    PHONEME_BRAIN,
    LORE_BRAIN,
    CRITIQUE_BRAIN,
    SEO_BRAIN,
    AUDIO_BRAIN,
    UI_BRAIN,
    DETERMINISM_BRAIN,
    ARCHITECTURE_BRAIN,
]


def get_registry() -> list[AmplifierBrain]:
    """Return the default Amplifier registry."""
    return list(DEFAULT_AMPLIFIER_REGISTRY)


def get_brain_by_id(brain_id: str) -> AmplifierBrain | None:
    for brain in DEFAULT_AMPLIFIER_REGISTRY:
        if brain.id == brain_id:
            return brain
    return None
