"""
Vaelrix Cortex ForceField — Risk Brain.

Heuristic risk analysis over the WORDING of a request. This brain cannot see the
command, the diff, or the blast radius — only the sentence. Everything here is
scoped to that limit, deliberately and loudly.

WHY THIS WAS REWRITTEN (2026-07-16)
-----------------------------------
The previous version returned hardcoded literals::

    resonance=ResonanceScore(intentMatch=0.7, evidenceStrength=0.5,
                             novelty=0.5, conflictRisk=0.2, actionability=0.7)

Measured: byte-identical output for "lint the code" and for
"rm -rf / --no-preserve-root and force push to main", including the finding
"No obvious high-risk patterns detected; proceed with normal caution."

Three defects, all load-bearing:

1. conflictRisk was a CONSTANT presented as a scan result. council_arbiter.py
   subtracts it from a brain's score (line 30) and flags contradictions above a
   threshold (line 67). A permanent 0.2 meant this brain could never trip its own
   safety gate, for any input, ever.

2. evidenceStrength=0.5 was reported alongside `evidence: []` — half-strength
   evidence derived from no evidence.

3. "No obvious high-risk patterns detected" reads as an ALL-CLEAR and never was
   one: it meant "none of my four keywords appeared". An agent trusting it on an
   `rm -rf` got a green light from the component whose whole job is to say no.

determinism_auditor.py already computes its score honestly
(`conflictRisk=0.8 if bytecodes else 0.0`), so a derived score was the house
pattern and this brain was the outlier.

THE HONEST LIMIT
----------------
Keyword matching over wording cannot enumerate danger — "nuke the repo", "start
fresh", "clean it all out" are destructive and match nothing. So the fix is NOT a
longer keyword list pretending to be a scan. It is: scores computed from what
actually matched, silence reported as silence rather than safety, and an explicit
statement of what this brain cannot see.

Risk that must be correct belongs where the facts are — classify the COMMAND, not
the sentence. This is a wording heuristic, and it now says so in its own output.
"""

from __future__ import annotations

import re

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


RISK_BRAIN = AmplifierBrain(
    id="RISK_BRAIN",
    domain=["risk", "safety", "regression", "dependencies"],
    activationSignals=[
        "risk", "safe", "regression", "dependency", "blast radius", "dangerous",
        "break something", "break anything", "will this break", "downstream", "side effect",
    ],
    allowedTools=["search_code", "read_file", "diagnostic_scan"],
    defaultSearchBudget=3,
    weight=1.1,
)

# (pattern, severity 0..1, finding). Severity drives conflictRisk, which the
# arbiter both subtracts and thresholds on — these numbers are load-bearing.
_PATTERNS: list[tuple[str, float, str]] = [
    # ── irreversible: leaves the machine or destroys history ──────────────
    (r"\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b|--no-preserve-root",
     0.95, "IRREVERSIBLE: recursive force-delete. There is no undo; verify the path before running."),
    (r"\bforce[- ]?push\b|\bpush\s+--force\b|\bpush\s+-f\b",
     0.90, "IRREVERSIBLE: force-push rewrites published history and can destroy others' commits."),
    (r"\breset\s+--hard\b|\bclean\s+-[a-z]*f",
     0.85, "IRREVERSIBLE: discards uncommitted work with no recovery path."),
    (r"\bdrop\s+(table|database|schema)\b|\btruncate\b",
     0.95, "IRREVERSIBLE: destroys stored data."),
    (r"\bdeploy\b|\bpublish\b|\brelease\b|\bship it\b",
     0.80, "OUTWARD-FACING: leaves this machine and cannot be recalled once others have it."),
    # ── credentials and privacy ──────────────────────────────────────────
    (r"\bsecret\b|\btoken\b|\bcredential|\bapi[- ]?key\b|\bpassword\b|\.env\b",
     0.85, "CREDENTIALS: may expose or rotate secrets; confirm blast radius before proceeding."),
    (r"\bexport\b.*\buser\b|\bdump\b.*\b(data|db|database)\b",
     0.80, "PRIVACY: bulk data egress; confirm authority and scope."),
    (r"\bdisable\b.*\b(auth|law|check|guard|validation)\b|\bbypass\b|\bskip\b.*\bconfirm",
     0.90, "CONTROL REMOVAL: disabling a guard is the change most likely to be regretted."),
    # ── regression-prone (the original four, preserved) ───────────────────
    (r"\bdelete\b|\bremove\b",
     0.45, "Removing code may break downstream callers; verify with search before deleting."),
    (r"\bglobal\b|\beverywhere\b|\ball files\b|\bacross the (repo|codebase)\b",
     0.50, "Broad changes increase regression risk; apply in small, testable batches."),
    (r"\brefactor\b",
     0.35, "Refactors should preserve public behavior; add characterization tests if absent."),
    (r"\bsearch\b(?=.*\b(loop|again|repeated)\b)",
     0.30, "Repeated search is often a working-memory anti-pattern; use a Context Ledger."),
    (r"\bmigrat|\bschema change\b|\balter table\b",
     0.60, "Schema migrations are hard to reverse; confirm a rollback path exists."),
]

#: Below this, a request carries too little text to scan at all.
_MIN_SCANNABLE = 4


def run_risk_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    q = (query or field.task.rawUserRequest or "").lower()

    if len(q.strip()) < _MIN_SCANNABLE:
        # No text is not a safe request; it is an unscannable one. conflictRisk is
        # high so the arbiter FLAGS it rather than silently accepting it.
        return AmplifierResult(
            brainId=RISK_BRAIN.id,
            summary="Risk scan could not run: insufficient text.",
            findings=["UNSCANNABLE: request too short to analyse. This is NOT an all-clear."],
            recommendedAction="Obtain the actual request before proceeding.",
            resonance=ResonanceScore(
                intentMatch=0.0, evidenceStrength=0.0, novelty=0.0,
                conflictRisk=0.80, actionability=0.0,
            ),
        )

    matched = [(sev, msg) for pattern, sev, msg in _PATTERNS if re.search(pattern, q)]

    if not matched:
        # THE IMPORTANT CASE. Silence is not safety. The old wording here was read
        # as an all-clear and never was one — it meant only that four keywords did
        # not appear.
        return AmplifierResult(
            brainId=RISK_BRAIN.id,
            summary="Wording scan found no known risk phrases (absence of evidence, not evidence of absence).",
            findings=[
                "NO KEYWORD MATCH — this is NOT an all-clear. This brain matches wording only; "
                "it cannot see the command, the diff, or the blast radius. A destructive request "
                "phrased in words not on its list scans clean.",
            ],
            recommendedAction="Classify the actual command; do not treat this scan as a safety signal.",
            resonance=ResonanceScore(
                intentMatch=0.30,
                # No evidence gathered, so evidence strength is zero. The old 0.5
                # sat next to an empty `evidence: []`.
                evidenceStrength=0.0,
                novelty=0.0,
                # Not 0.0: unmatched means unknown, not safe. Below a typical flag
                # threshold so it does not cry wolf, non-zero so it never reads as
                # a clean bill of health.
                conflictRisk=0.25,
                actionability=0.20,
            ),
        )

    findings = [msg for _, msg in sorted(matched, key=lambda m: -m[0])]
    peak = max(sev for sev, _ in matched)
    high = peak >= 0.80

    return AmplifierResult(
        brainId=RISK_BRAIN.id,
        summary=(
            f"Wording scan matched {len(matched)} risk pattern(s); peak severity {peak:.2f}."
            + (" Contains irreversible or outward-facing operations." if high else "")
        ),
        findings=findings,
        recommendedAction=(
            "STOP. Escalate to a human with authority before running this."
            if high else
            "Review the flagged risks before editing files."
        ),
        resonance=ResonanceScore(
            intentMatch=min(1.0, 0.5 + 0.1 * len(matched)),
            # Derived from what actually matched, not asserted.
            evidenceStrength=min(1.0, 0.2 * len(matched)),
            novelty=0.0,
            # THE load-bearing number: council_arbiter subtracts it and thresholds on it.
            conflictRisk=peak,
            actionability=0.90 if high else 0.60,
        ),
    )
