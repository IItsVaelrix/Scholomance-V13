"""
SCDNA — compiler CLI.

A manual, review-driven tool for authoring, validating, and committing
genes to the registry. Genes are curated, not auto-generated.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Sequence

from .decoder import (
    DecodedGene,
    _flags_from_record,
    decode_retrieval_gene,
    encode_gene_from_record,
)
from .detector import detect_gene_matches
from .health import emit_health_signal
from .registry import DEFAULT_GENE_REGISTRY, GeneRegistry
from .translator import KNOWN_FLAGS, translate_gene_to_english
from .types import (
    GeneDomain,
    GeneEnglish,
    GeneIdentity,
    GeneInstruction,
    GeneLifecycle,
    GeneRetrieval,
    GeneRisk,
    RetrievalGene,
)
from .validator import validate_gene

DEFAULT_REGISTRY_PATH = Path(__file__).with_suffix(".json")
DEFAULT_HISTORY_PATH = Path(__file__).with_suffix(".history.jsonl")

_ACCEPTANCE_CHECKLIST = [
    "This pattern recurs.",
    "The instruction is falsifiable.",
    "The gene activates the minimum necessary brains (fewer than 5 unless justified).",
    "The English translation is unambiguous.",
    "Confidence and freshness are justified by evidence.",
    "No existing gene already covers this case.",
    "The author accepts responsibility for future maintenance.",
]


class CompilationError(Exception):
    """Raised when a gene fails compiler validation."""


class AcceptanceChecklistError(CompilationError):
    """Raised when the acceptance checklist is not confirmed."""


def _generate_content_hash(gene: RetrievalGene) -> str:
    """Generate a deterministic content hash for a gene."""
    canonical = json.dumps(
        {
            "stableId": gene.identity.stableId,
            "sourceKind": gene.identity.sourceKind,
            "domain": gene.domain.primary,
            "secondary": sorted(gene.domain.secondary),
            "action": gene.instruction.action,
            "imperative": gene.instruction.imperative,
            "brains": sorted(gene.domain.activationBrains),
            "confidence": gene.retrieval.confidence,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return "scdna-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:24]


def compile_gene(
    stable_id: str,
    source_kind: str,
    domain: str,
    action: str,
    activation_brains: list[str],
    imperative: str,
    short_meaning: str,
    confidence: int,
    secondary: list[str] | None = None,
    flags: list[str] | None = None,
    forbidden_drift: list[str] | None = None,
    required_checks: list[str] | None = None,
    expanded_meaning: str | None = None,
    operator_instruction: str | None = None,
    priority: float = 0.5,
    freshness: float = 0.5,
    canonical: bool = True,
    risk_class: str = "low",
    blast_radius: str = "local",
    stale_risk: float = 0.0,
    misuse_risk: float = 0.0,
    registry: GeneRegistry | None = None,
    accept_checklist: bool = False,
    allow_new_flags: bool = False,
    supersede_id: str | None = None,
) -> tuple[RetrievalGene, str, list[str]]:
    """
    Compile raw gene fields into a validated RetrievalGene and compact string.

    Returns:
        (gene, compact_string, warnings)

    Raises:
        CompilationError if validation fails.
        AcceptanceChecklistError if the checklist is required but not confirmed.
    """
    if registry is None:
        registry = DEFAULT_GENE_REGISTRY

    if not accept_checklist:
        raise AcceptanceChecklistError(
            "Acceptance checklist must be explicitly confirmed. "
            "Pass --accept-checklist or confirm each item interactively."
        )

    if stable_id in registry and supersede_id is None:
        raise CompilationError(
            f"Duplicate stableId: {stable_id}. Use --supersede to replace an existing gene."
        )

    if supersede_id is not None and supersede_id not in registry:
        raise CompilationError(
            f"Cannot supersede unknown gene: {supersede_id}."
        )

    # Lazy import: amplifier_registry now re-exports brains/*.py's own
    # constants (single source of truth, see amplifier_registry.py's
    # docstring), and brains/determinism_brain.py transitively imports this
    # scdna package — a module-level import here would be circular.
    from ..amplifier_registry import get_registry

    known_brain_ids = {brain.id for brain in get_registry()}
    unknown_brains = [b for b in activation_brains if b not in known_brain_ids]
    if unknown_brains:
        raise CompilationError(
            f"Unknown brain references: {', '.join(unknown_brains)}. "
            "Add them to the Amplifier registry first."
        )

    flags = flags or []
    if not allow_new_flags:
        unknown_flags = [f for f in flags if f not in KNOWN_FLAGS]
        if unknown_flags:
            raise CompilationError(
                f"Unknown flags: {', '.join(unknown_flags)}. "
                "Acknowledge with --allow-new-flags or add to KNOWN_FLAGS."
            )

    if len(activation_brains) >= 5:
        raise CompilationError(
            "Gene activates 5+ brains. Reduce activation or justify with --override-brain-limit."
        )

    gene = RetrievalGene(
        version="SCDNA-v1",
        identity=GeneIdentity(
            stableId=stable_id,
            contentHash="",
            sourceKind=source_kind,  # type: ignore[arg-type]
        ),
        domain=GeneDomain(
            primary=domain,  # type: ignore[arg-type]
            secondary=list(secondary or []),
            activationBrains=list(activation_brains),
        ),
        retrieval=GeneRetrieval(
            lookupMode="hybrid",
            priority=priority,
            confidence=confidence / 100.0,
            originalConfidence=confidence / 100.0,
            freshness=freshness,
            canonical=canonical,
            minConfidence=0.45,
        ),
        instruction=GeneInstruction(
            action=action,  # type: ignore[arg-type]
            imperative=imperative,
            forbiddenDrift=list(forbidden_drift or []),
            requiredChecks=list(required_checks or []),
        ),
        risk=GeneRisk(
            riskClass=risk_class,  # type: ignore[arg-type]
            blastRadius=blast_radius,  # type: ignore[arg-type]
            staleRisk=stale_risk,
            misuseRisk=misuse_risk,
        ),
        english=GeneEnglish(
            shortMeaning=short_meaning,
            expandedMeaning=expanded_meaning or short_meaning,
            operatorInstruction=operator_instruction or imperative,
        ),
        lifecycle=GeneLifecycle(),
    )

    gene.identity.contentHash = _generate_content_hash(gene)

    errors = validate_gene(gene)
    if errors:
        raise CompilationError("Validation failed:\n" + "\n".join(f"- {e}" for e in errors))

    # Near-duplicate detection: same contentHash or strongly overlapping meaning
    warnings: list[str] = []
    for existing in registry.values():
        if existing.identity.contentHash == gene.identity.contentHash:
            raise CompilationError(
                f"Near-duplicate detected: {existing.identity.stableId} has the same contentHash."
            )

    compact = encode_gene_from_record(gene)

    # Verify compact round-trips
    decoded = decode_retrieval_gene(compact)
    if decoded.activationBrains != tuple(gene.domain.activationBrains):
        raise CompilationError("Compact gene round-trip failed for activationBrains.")

    return gene, compact, warnings


def _load_json_registry(path: Path) -> GeneRegistry:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return {
        stable_id: RetrievalGene.from_dict(record)
        for stable_id, record in data.get("genes", {}).items()
    }


def _save_json_registry(path: Path, registry: GeneRegistry) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "SCDNA-v1",
                "genes": {
                    stable_id: gene.to_dict() for stable_id, gene in registry.items()
                },
            },
            f,
            indent=2,
        )


def _append_history(path: Path, action: str, gene: RetrievalGene, metadata: dict | None = None) -> None:
    """Append an immutable audit entry to the registry history log."""
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": time.time(),
        "action": action,
        "stableId": gene.identity.stableId,
        "contentHash": gene.identity.contentHash,
        "gene": gene.to_dict(),
        "metadata": metadata or {},
    }
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, sort_keys=True) + "\n")


def _cmd_add(args: argparse.Namespace) -> int:
    registry = _load_json_registry(args.registry_path)
    registry.update(DEFAULT_GENE_REGISTRY)

    try:
        gene, compact, warnings = compile_gene(
            stable_id=args.id,
            source_kind=args.source,
            domain=args.domain,
            action=args.action,
            activation_brains=[b.strip() for b in args.brains.split(",") if b.strip()],
            imperative=args.imperative,
            short_meaning=args.short_meaning,
            confidence=args.confidence,
            secondary=[s.strip() for s in (args.secondary or "").split(",") if s.strip()],
            flags=[f.strip() for f in (args.flags or "").split(",") if f.strip()] or None,
            forbidden_drift=[s.strip() for s in args.forbidden_drift if s.strip()] or None,
            required_checks=[s.strip() for s in args.required_checks if s.strip()] or None,
            expanded_meaning=args.expanded_meaning,
            operator_instruction=args.operator_instruction,
            priority=args.priority,
            freshness=args.freshness,
            canonical=not args.non_canonical,
            risk_class=args.risk_class,
            blast_radius=args.blast_radius,
            stale_risk=args.stale_risk,
            misuse_risk=args.misuse_risk,
            registry=registry,
            accept_checklist=args.accept_checklist,
            allow_new_flags=args.allow_new_flags,
            supersede_id=args.supersede,
        )
    except CompilationError as exc:
        print(f"COMPILATION FAILED\n{exc}", file=sys.stderr)
        return 1

    print("COMPILATION ACCEPTED")
    print(f"stableId: {gene.identity.stableId}")
    print(f"contentHash: {gene.identity.contentHash}")
    print(f"compact: {compact}")
    if warnings:
        print("WARNINGS:")
        for warning in warnings:
            print(f"  - {warning}")
    print()
    print("REGISTRY ENTRY (Python dict):")
    print(f"  \"{gene.identity.stableId}\": {gene.to_dict()!r},")
    print()
    print("DECODED ENGLISH:")
    english = translate_gene_to_english(
        source_kind=gene.identity.sourceKind,
        domain=gene.domain.primary,
        action=gene.instruction.action,
        activation_brains=gene.domain.activationBrains,
        confidence=gene.retrieval.confidence,
        flags=_flags_from_record(gene),
    )
    print(f"  {english}")

    if args.commit:
        history_path = args.history_path or DEFAULT_HISTORY_PATH
        if args.supersede:
            old_gene = registry[args.supersede]
            old_gene.lifecycle.status = "deprecated"
            old_gene.lifecycle.supersededBy = gene.identity.stableId
            _append_history(
                history_path,
                "supersede",
                old_gene,
                {"supersededBy": gene.identity.stableId},
            )
            registry[args.supersede] = old_gene

        registry[gene.identity.stableId] = gene
        _save_json_registry(args.registry_path, registry)
        _append_history(history_path, "commit", gene)

        signals = [
            emit_health_signal(
                severity="yellow",
                component="GENE_ACCEPTED",
                stable_id=gene.identity.stableId,
                tier="Y1",
                confidence=gene.retrieval.confidence,
            )
        ]
        if args.supersede:
            signals.append(
                emit_health_signal(
                    severity="red",
                    component="GENE_SUPERSEDED",
                    stable_id=args.supersede,
                    tier="R1",
                    supersededBy=gene.identity.stableId,
                )
            )
        print()
        print(f"COMMITTED to {args.registry_path}")
        for signal in signals:
            print(signal)
    else:
        print()
        print("DRY RUN — pass --commit to write to registry.")

    return 0


def _cmd_validate(args: argparse.Namespace) -> int:
    registry = _load_json_registry(args.registry_path)
    registry.update(DEFAULT_GENE_REGISTRY)

    gene = registry.get(args.id)
    if gene is None:
        print(f"Gene not found: {args.id}", file=sys.stderr)
        return 1

    errors = validate_gene(gene)
    if errors:
        print("VALIDATION FAILED")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("VALIDATION PASSED")
    print(f"contentHash: {gene.identity.contentHash}")
    print(f"compact: {encode_gene_from_record(gene)}")
    return 0


def _cmd_decode(args: argparse.Namespace) -> int:
    try:
        decoded = decode_retrieval_gene(args.gene)
    except ValueError as exc:
        print(f"DECODE FAILED: {exc}", file=sys.stderr)
        return 1

    print("DECODED GENE")
    print(f"  version: {decoded.version}")
    print(f"  sourceKind: {decoded.sourceKind}")
    print(f"  domain: {decoded.domain}")
    print(f"  action: {decoded.action}")
    print(f"  activationBrains: {', '.join(decoded.activationBrains)}")
    print(f"  confidence: {decoded.confidence:.2f}")
    print(f"  flags: {', '.join(decoded.flags) if decoded.flags else 'NONE'}")
    print(f"  english: {decoded.englishInstruction}")
    return 0


def _cmd_detect(args: argparse.Namespace) -> int:
    registry = _load_json_registry(args.registry_path)
    registry.update(DEFAULT_GENE_REGISTRY)

    matches = detect_gene_matches(args.query, registry)
    if not matches:
        print("No matching genes.")
        return 0

    print(f"MATCHES for query: {args.query}")
    for gene in matches:
        print(f"  - {gene.identity.stableId} ({gene.domain.primary}, conf={gene.retrieval.confidence:.2f})")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m vaelrix_forcefield.scdna.compiler",
        description="SCDNA compiler: author, validate, and commit retrieval genes.",
    )
    parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the JSON gene registry (default: scdna/registry.json).",
    )
    parser.add_argument(
        "--history-path",
        type=Path,
        default=DEFAULT_HISTORY_PATH,
        help="Path to the registry audit history JSONL (default: scdna/registry.history.jsonl).",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    add = subparsers.add_parser("add", help="Compile and optionally commit a new gene.")
    add.add_argument("--id", required=True, help="Gene stableId.")
    add.add_argument("--source", required=True, help="Source kind (bug, rule, architecture, ...).")
    add.add_argument("--domain", required=True, help="Primary domain.")
    add.add_argument("--secondary", help="Comma-separated secondary domains.")
    add.add_argument("--brains", required=True, help="Comma-separated brain IDs.")
    add.add_argument("--action", required=True, help="Gene action.")
    add.add_argument("--imperative", required=True, help="Imperative instruction.")
    add.add_argument("--short-meaning", required=True, help="Short English meaning.")
    add.add_argument("--expanded-meaning", help="Expanded English meaning.")
    add.add_argument("--operator-instruction", help="Operator instruction.")
    add.add_argument("--confidence", type=int, required=True, help="Confidence integer 0-100.")
    add.add_argument("--flags", help="Comma-separated compact flags.")
    add.add_argument("--forbidden-drift", action="append", default=[], help="Forbidden drift item.")
    add.add_argument("--required-checks", action="append", default=[], help="Required check item.")
    add.add_argument("--priority", type=float, default=0.5, help="Retrieval priority.")
    add.add_argument("--freshness", type=float, default=0.9, help="Freshness 0-1.")
    add.add_argument("--non-canonical", action="store_true", help="Mark gene as non-canonical.")
    add.add_argument("--risk-class", default="low", help="low|medium|high|critical")
    add.add_argument("--blast-radius", default="local", help="local|module|cross_system|global")
    add.add_argument("--stale-risk", type=float, default=0.0, help="Stale risk 0-1.")
    add.add_argument("--misuse-risk", type=float, default=0.0, help="Misuse risk 0-1.")
    add.add_argument("--commit", action="store_true", help="Write gene to registry.")
    add.add_argument(
        "--supersede",
        help="StableId of an existing gene to mark as deprecated and replaced by this gene.",
    )
    add.add_argument(
        "--accept-checklist",
        action="store_true",
        help="Confirm the gene acceptance checklist.",
    )
    add.add_argument(
        "--allow-new-flags",
        action="store_true",
        help="Allow flags not yet in KNOWN_FLAGS.",
    )
    add.set_defaults(func=_cmd_add)

    validate = subparsers.add_parser("validate", help="Validate an existing gene.")
    validate.add_argument("--id", required=True, help="Gene stableId.")
    validate.set_defaults(func=_cmd_validate)

    decode = subparsers.add_parser("decode", help="Decode a compact gene string.")
    decode.add_argument("gene", help="Compact SCDNA gene string.")
    decode.set_defaults(func=_cmd_decode)

    detect = subparsers.add_parser("detect", help="Detect matching genes for a query.")
    detect.add_argument("query", help="User query.")
    detect.set_defaults(func=_cmd_detect)

    return parser


def compiler_cli_main(argv: Sequence[str] | None = None) -> int:
    """Entry point for the SCDNA compiler CLI."""
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(compiler_cli_main())
