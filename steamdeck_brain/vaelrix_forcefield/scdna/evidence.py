"""
SCDNA — gene confidence fed by evidence instead of declaration.

Every gene already carries the machinery for this:

    contradictionCount   0
    degradationFactor    0.85     lose 15% of confidence when contradicted
    recoveryIncrement    0.02     earn it back slowly when confirmed
    deprecationThreshold 0.45     below this, retire

and nothing has ever filled it. All thirteen genes sit at contradictionCount 0,
because `detect_contradictions` only compares genes against OTHER GENES — they
argue with each other and never with the repository.

The consequence, measured 2026-08-13: BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK
held confidence 0.98 while the bug it names was live and undetected, and held
0.98 after it was fixed. The number was a declaration, not a measurement.

This closes the loop. `scripts/gene-evidence-sweep.mjs` counts how often each
gene's pattern actually occurs in the tree; this applies that count through
`degrade_gene` and `recover_gene`, which were written for it and never called
by anything else.

    pattern present   -> CONFIRMED    -> recover_gene, confidence rises
    pattern absent    -> CONTRADICTED -> degrade_gene, confidence falls
    pattern returns   -> CONFIRMED    -> the gene comes back on its own

── WHAT "CONTRADICTED" MEANS HERE, PRECISELY ──────────────────────────────────

Not "the gene is wrong". A gene warning about a pattern that no longer occurs is
UNEMPLOYED, not false. Decay is how the system stops shouting about a fixed bug
while remaining able to shout again the moment it returns. That is why decay is
slow, bounded by minConfidence, and reversible.

── WHAT THIS REFUSES TO SCORE ─────────────────────────────────────────────────

Only genes whose claim a deterministic check can COUNT. `SEMANTIC_KIND_PROBE_
READONLY` is a policy about intent, not a shape with an occurrence count.
Scoring it would be inventing a measurement, which is the failure the Gutenberg
Tribunal was convened for. Unscored genes are left untouched and reported as
unscored — never as zero, because absent evidence is not evidence of absence.
"""

from __future__ import annotations

import json
import subprocess
from copy import deepcopy
from pathlib import Path
from typing import Any

from .lifecycle import degrade_gene, recover_gene
from .types import RetrievalGene

REPO_ROOT = Path(__file__).resolve().parents[3]
SWEEP_SCRIPT = "scripts/gene-evidence-sweep.mjs"
REGISTRY_PATH = Path(__file__).resolve().parent / "compiler.json"


class EvidenceUnavailable(RuntimeError):
    """The sweep could not run. Raised rather than treated as zero occurrences.

    A failed sweep and a clean tree are the same silence, and silence must not
    move a gene's confidence in either direction.
    """


def collect_evidence(root: Path = REPO_ROOT) -> dict[str, Any]:
    """Run the sweep and return its report. Never substitutes a default."""
    result = subprocess.run(
        ["node", SWEEP_SCRIPT, "--json"],
        cwd=root,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise EvidenceUnavailable(
            f"gene evidence sweep failed: {result.stderr.decode('utf-8', 'replace').strip()[:300]}"
        )
    try:
        return json.loads(result.stdout.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise EvidenceUnavailable(f"sweep emitted unreadable JSON: {error}") from error


def apply_evidence_to_gene(
    gene: RetrievalGene,
    verdict: str,
    index: int,
    reason: str,
) -> RetrievalGene:
    """Move one gene's confidence according to one verdict."""
    if verdict == "CONFIRMED":
        return recover_gene(gene)
    if verdict == "CONTRADICTED":
        return degrade_gene(gene, contradiction_index=index, reason=reason)
    return deepcopy(gene)


def apply_evidence(
    registry: dict[str, RetrievalGene],
    report: dict[str, Any],
    index: int = 0,
) -> tuple[dict[str, RetrievalGene], list[dict[str, Any]]]:
    """Apply a sweep report to a registry.

    Returns the updated registry and a per-gene changelog, so a caller can print
    what moved and why rather than diffing two blobs of JSON.
    """
    updated = dict(registry)
    changes: list[dict[str, Any]] = []

    for gene_id, finding in (report.get("genes") or {}).items():
        gene = registry.get(gene_id)
        if gene is None:
            changes.append({"gene": gene_id, "action": "skipped", "why": "not in registry"})
            continue

        before = gene.retrieval.confidence
        verdict = finding.get("verdict", "UNSCORED")
        reason = (
            f"{', '.join(finding.get('rules', []))} found "
            f"{finding.get('occurrences', 0)} occurrence(s) of: {finding.get('claim', '')}"
        )
        new_gene = apply_evidence_to_gene(gene, verdict, index, reason)
        updated[gene_id] = new_gene

        changes.append({
            "gene": gene_id,
            "verdict": verdict,
            "occurrences": finding.get("occurrences"),
            "confidenceBefore": round(before, 4),
            "confidenceAfter": round(new_gene.retrieval.confidence, 4),
            "status": new_gene.lifecycle.status,
            "contradictionCount": new_gene.lifecycle.contradictionCount,
            "reason": reason,
        })

    return updated, changes


def write_registry(registry: dict[str, RetrievalGene], path: Path = REGISTRY_PATH) -> None:
    """Persist genes, preserving every field the compiler wrote.

    Only the lifecycle and retrieval blocks are rewritten; the rest of each
    record is carried through untouched, so a scoring run can never quietly
    rewrite an instruction.
    """
    with path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)

    for gene_id, gene in registry.items():
        record = document.get("genes", {}).get(gene_id)
        if record is None:
            continue
        record["retrieval"]["confidence"] = gene.retrieval.confidence
        record["lifecycle"]["status"] = gene.lifecycle.status
        record["lifecycle"]["contradictionCount"] = gene.lifecycle.contradictionCount
        record["lifecycle"]["lastContradictionAtIndex"] = gene.lifecycle.lastContradictionAtIndex

    tmp = path.with_suffix(".json.partial")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")
    tmp.replace(path)
