"""Pure, side-effect-free roadmap compiler prototype.

Step 1 of the Delivery Sequence in
docs/superpowers/specs/2026-08-28-opt-in-brain-protocol-execution-design.md.
Deliberately NOT wired into steamdeck_brain/vaelrix_forcefield/ (that
integration is deferred behind this prototype's efficacy result). Consumes a
hand-constructed task/evidence fixture; produces an immutable contract. No
persistence, no MCP, no skill.

`auto`/unclassified is never resolved by keyword matching — see
TaskFraming.state. Keyword-routed brains (active_brains) are accepted only as
which specialists fired, never as proof of task class or phase necessity.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TaskFraming:
    """state: 'declared' (user said so), 'evidence_confirmed' (derived from
    verified evidence, not keywords), or 'unclassified' (neither — the
    honest default, never guessed from word overlap)."""

    state: str
    task_class: str | None = None
    priority: str | None = None
    reason: str = ""


@dataclass(frozen=True)
class Phase:
    phase_id: str
    goal: str
    evidence_refs: tuple[str, ...] = ()
    allowed_tool_classes: tuple[str, ...] = ()
    intended_changes: tuple[str, ...] = ()
    completion_checks: tuple[str, ...] = ()
    requires_replan: bool = False


@dataclass(frozen=True)
class BrainProtocolContract:
    contract_version: str
    protocol_id: str
    task: str
    evidence: tuple[str, ...]
    active_brains: tuple[str, ...]
    phases: tuple[Phase, ...]
    blocked_questions: tuple[str, ...] = ()
    stop_conditions: tuple[str, ...] = ()
    verification_receipt_template: dict = field(default_factory=dict)


_CONTRACT_VERSION = "brain-protocol-prototype-v1"

# A "boundary classifier" task shape: the request names 3+ discrete ALL-CAPS
# outcome labels (underscore-joined or single-word) — a mechanical,
# generalizable signal (grading tiers, shipping-rate tiers, any
# threshold-based classifier would match the same way), not hardcoded to
# interval classification. Must be 2+ letters so a lone capital initial
# doesn't match.
_LABEL_TOKEN = re.compile(r"\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)*\b")

# The real citation shape LORE_BRAIN/ARCHITECTURE_BRAIN/UI_BRAIN already
# produce: `"<term>" per <path>: "<quote>"` or `law states: "<quote>"`.
_CITATION_QUOTE = re.compile(r'states:\s*"([^"]+)"|per\s+\S+:\s*"([^"]+)"')

# A "new exception-fallback around a lookup" task shape — the measured,
# personal blind spot in feedback-silence-vs-failure-blind-spot.md (14 such
# blocks added in one real session, 12 collapsing "confirmed absent" and
# "the lookup mechanism broke" into the same return value). General signal:
# the request names both a lookup/query-shaped operation AND new
# exception/fallback handling around it — not tied to any specific domain.
_LOOKUP_VERB = re.compile(
    r"\blook(?:s|ed|ing)?\s+up\b|\blookups?\b|\bquer(?:y|ies|ied|ying)\b|"
    r"\bfetch\w*\b|\bretriev\w*\b|\bconnect\w*\b|\bcach\w*\b",
    re.I,
)
_EXCEPTION_FALLBACK_SIGNAL = re.compile(r"\b(except\w*|catch\w*|fallback|falls?\s+back)\b", re.I)


def _detect_boundary_classifier_labels(raw_request: str) -> list[str]:
    labels = _LABEL_TOKEN.findall(raw_request)
    # Require 3+ distinct labels to count as a genuine multi-category
    # classifier shape, not a single flag or a coincidental match.
    seen = list(dict.fromkeys(labels))
    return seen if len(seen) >= 3 else []


def _is_lookup_exception_fallback_task(raw_request: str) -> bool:
    return bool(_LOOKUP_VERB.search(raw_request)) and bool(
        _EXCEPTION_FALLBACK_SIGNAL.search(raw_request)
    )


def _extract_citation_quotes(accepted_findings: list[str]) -> list[str]:
    quotes = []
    for finding in accepted_findings:
        for match in _CITATION_QUOTE.finditer(finding):
            quote = match.group(1) or match.group(2)
            if quote:
                quotes.append(quote)
    return quotes


def compile_roadmap(
    raw_request: str,
    task_framing: TaskFraming,
    active_brains: list[str],
    accepted_findings: list[str],
    contradictions: list[str],
    protocol_id: str,
) -> BrainProtocolContract:
    if task_framing.state == "unclassified":
        phases = (
            Phase(
                phase_id="EVIDENCE_RECON",
                goal="Gather class-neutral evidence before assuming what kind of task this is.",
                completion_checks=("Confirm what evidence exists regardless of task class.",),
            ),
            Phase(
                phase_id="SCOPE_CONFIRMATION",
                goal="Ask the user to confirm task class/priority before planning further phases.",
                completion_checks=("User has confirmed or the evidence has confirmed a task class.",),
            ),
            Phase(
                phase_id="HANDOFF_RECEIPT",
                goal="Report what was found and what remains unclassified.",
            ),
        )
        return BrainProtocolContract(
            contract_version=_CONTRACT_VERSION,
            protocol_id=protocol_id,
            task=raw_request,
            evidence=tuple(accepted_findings),
            active_brains=tuple(active_brains),
            phases=phases,
            blocked_questions=("What class of task is this (implementation/review/architecture/diagnostic)?",),
        )

    verification_checks: list[str] = ["Run the relevant test suite before finalizing."]

    boundary_labels = _detect_boundary_classifier_labels(raw_request)
    if boundary_labels:
        verification_checks.append(
            "Test boundary-equality cases (compared values exactly equal, not "
            "just ordered) for every pair of adjacent/boundary-sharing "
            f"categories among: {', '.join(boundary_labels)}."
        )

    if _is_lookup_exception_fallback_task(raw_request):
        verification_checks.append(
            "Add a test that simulates the underlying lookup/connection "
            "mechanism itself failing (not just the item being absent), and "
            "assert this failure path is distinguishable from the "
            "confirmed-absent path — do not let both collapse to the same "
            "None/empty result."
        )

    citation_quotes = _extract_citation_quotes(accepted_findings)
    for quote in citation_quotes:
        verification_checks.append(
            f'Verify the implementation against the quoted constraint: "{quote}" '
            "(not a generic \"consult the docs\" check)."
        )

    phases_list = []
    if not accepted_findings:
        phases_list.append(
            Phase(
                phase_id="RECONNAISSANCE",
                goal="No confirmed evidence yet; establish real targets before implementing.",
            )
        )

    is_architectural = bool(re.search(r"\barchitectur|\brefactor|\binterface\b", raw_request, re.I))
    if is_architectural:
        phases_list.append(
            Phase(
                phase_id="DESIGN",
                goal="Architectural/interface-changing work requires a design pass before implementation.",
                evidence_refs=tuple(citation_quotes),
            )
        )

    phases_list.append(
        Phase(
            phase_id="IMPLEMENTATION",
            goal="Carry out the change the original request authorizes.",
        )
    )
    phases_list.append(
        Phase(
            phase_id="VERIFICATION",
            goal="Verify the change against the completion checks derived from the task and evidence.",
            completion_checks=tuple(verification_checks),
        )
    )
    phases_list.append(
        Phase(
            phase_id="HANDOFF_RECEIPT",
            goal="Produce a receipt distinguishing verified completion from proposal/blocked/unverified.",
        )
    )

    return BrainProtocolContract(
        contract_version=_CONTRACT_VERSION,
        protocol_id=protocol_id,
        task=raw_request,
        evidence=tuple(accepted_findings),
        active_brains=tuple(active_brains),
        phases=tuple(phases_list),
    )
