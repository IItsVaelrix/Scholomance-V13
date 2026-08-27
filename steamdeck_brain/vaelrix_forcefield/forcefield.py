"""
Vaelrix Cortex ForceField — creation and update utilities.
"""

from __future__ import annotations

import hashlib
import uuid
from copy import deepcopy
from typing import Any

from .types import (
    ContextField,
    DeterminismField,
    MemoryField,
    OutputField,
    RiskField,
    RoutingField,
    SearchField,
    TaskField,
    ToolCallField,
    VaelrixCortexForceField,
)


def _stable_seed(task_id: str) -> int:
    """Derive a reproducible seed from the task id.

    A random seed would make determinism.seed non-null but still not
    reproducible across a re-run with the same task_id — the auditor's actual
    concern. Hashing the task_id makes "same task, same seed" true by
    construction.
    """
    return int(hashlib.sha256(task_id.encode("utf-8")).hexdigest()[:8], 16)


def create_force_field(
    raw_request: str,
    *,
    task_id: str | None = None,
    normalized_goal: str = "",
    classification: str = "diagnostic",
    priority: str = "safety",
    success_criteria: list[str] | None = None,
    forbidden_drift: list[str] | None = None,
) -> VaelrixCortexForceField:
    """Create a fresh ForceField for a new user request."""
    resolved_task_id = task_id or uuid.uuid4().hex[:12]
    task = TaskField(
        taskId=resolved_task_id,
        rawUserRequest=raw_request,
        normalizedGoal=normalized_goal or raw_request,
        classification=classification,  # type: ignore[arg-type]
        successCriteria=success_criteria or [],
        forbiddenDrift=forbidden_drift or [],
        priority=priority,  # type: ignore[arg-type]
    )
    determinism = DeterminismField(seed=_stable_seed(resolved_task_id))
    return VaelrixCortexForceField(task=task, determinism=determinism)


def update_force_field(
    field: VaelrixCortexForceField,
    **updates: Any,
) -> VaelrixCortexForceField:
    """
    Return a new ForceField with shallow-updated top-level fields.

    Updates are deep-copied so the original field is not mutated.
    """
    new_field = deepcopy(field)
    valid_fields = {
        "task",
        "context",
        "routing",
        "memory",
        "search",
        "tools",
        "risks",
        "output",
        "determinism",
    }
    for key, value in updates.items():
        if key in valid_fields:
            setattr(new_field, key, value)
    return new_field


def reset_phase_counters(field: VaelrixCortexForceField) -> VaelrixCortexForceField:
    """Reset per-phase counters (search, tools) while preserving memory."""
    new_field = deepcopy(field)
    new_field.search.searchCount = 0
    new_field.tools.callsThisPhase = 0
    return new_field
