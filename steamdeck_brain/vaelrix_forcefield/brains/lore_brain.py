"""
Vaelrix Cortex ForceField — Lore Brain.

Mirrorborne canon and symbolism specialist. Checks the task against
known lore terms, searches the project for canonical references,
and flags potential lore inconsistencies — via deterministic term
matching and file scanning.
"""

from __future__ import annotations

from pathlib import Path

from ._evidence_errors import EvidenceLookupError
from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


_CANON_TERMS: dict[str, str] = {
    "mirrorborne": "The central mythic concept: beings/places reflected across mirror-planes.",
    "vaelrix": "The Vaelrix — a primordial force or entity; namesake of laws and cortex subsystems.",
    "scholomance": "The Scholomance — the academy/methodology; this project's namesake.",
    "resonance": "Resonance — compile perception into deterministic memory (Resonance Law).",
    "truesight": "Truesight — overlay integrity contract; architectural truth layer.",
    "codex": "CODEx — the four-layer builder architecture (core/service/runtime/server).",
    "divtube": "DivTube — the application surface / world surface.",
    "forcefield": "ForceField — Vaelrix Cortex protective/amplification layer.",
    "clerical": "Clerical RAID — the debug pattern-matching engine.",
    "deeprhyme": "DeepRhyme — lyrical/verse engine.",
    "scd64": "SCD64 — architectural checksum system.",
    "immunity": "Immunity system — Innate + Adaptive layer pathogen defense.",
    "arbiter": "Council Arbiter — synthesizes amplifier brain outputs into a final judgment.",
    "nexus": "Nexus — interactive debug narratives (Cursor agent domain).",
    "stasis": "Stasis — deterministic stability state.",
}

LORE_BRAIN = AmplifierBrain(
    id="LORE_BRAIN",
    domain=["lore", "canon", "mirrorborne", "symbolism", "myth"],
    # Includes every canon term this brain can actually look up (_CANON_TERMS)
    # so the routing gate's vocabulary never lags behind the brain's own.
    activationSignals=[
        "lore", "canon", "symbol", "myth", "encyclopedia",
        *_CANON_TERMS.keys(),
    ],
    allowedTools=["codebase_search", "archive_search"],
    defaultSearchBudget=2,
)

_SYMBOL_MOTIFS: dict[str, set[str]] = {
    "mirror": {"mirror", "reflection", "looking-glass", "echo", "double", "twin", "shadow"},
    "light": {"light", "flame", "torch", "lantern", "beacon", "radiant", "luminous", "glow"},
    "dark": {"dark", "shadow", "void", "abyss", "night", "shroud", "veil", "obscure"},
    "threshold": {"threshold", "gate", "door", "portal", "bridge", "crossing", "liminal"},
    "memory": {"memory", "echo", "imprint", "record", "ledger", "archive", "relic"},
    "law": {"law", "rule", "contract", "oath", "binding", "pact", "covenant", "code"},
    "forge": {"forge", "hammer", "anvil", "temper", "shape", "mold", "craft", "smith"},
}


def _project_root() -> Path:
    here = Path(__file__).resolve()
    for _ in range(8):
        if here == here.parent:
            break
        if any((here / marker).exists() for marker in (".git", "package.json", "pyproject.toml")):
            return here
        here = here.parent
    return Path.cwd()


_ENCYCLOPEDIA_DIR = "docs/scholomance-encyclopedia"
_MAX_FILES_SCANNED_PER_TERM = 400


def _quote_term_definition(root: Path, term: str) -> tuple[str, str] | None:
    """Find the first real line in the encyclopedia that actually mentions
    `term`, and return (relative_path, line_text) — evidence, not a guess.

    Raises EvidenceLookupError if every candidate file failed to read (a
    permission error, a corrupt file) — that is not the same claim as
    "searched and the term genuinely isn't mentioned anywhere," and a
    caller must not be told the two are the same thing.
    """
    encyclopedia = root / _ENCYCLOPEDIA_DIR
    if not encyclopedia.is_dir():
        return None
    scanned = 0
    read_failures = 0
    for path in encyclopedia.rglob("*.md"):
        if not path.is_file():
            continue
        scanned += 1
        if scanned > _MAX_FILES_SCANNED_PER_TERM:
            break
        try:
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if term in line.lower():
                    return str(path.relative_to(root)), line.strip()
        except Exception:
            read_failures += 1
            continue
    if scanned > 0 and read_failures == scanned:
        raise EvidenceLookupError(
            f"all {scanned} candidate file(s) for {term!r} failed to read"
        )
    return None


def _scan_lore_files(root: Path) -> list[str]:
    lore_dirs = {"knowledge", "encyclopedia", "lore", "canon", "myth", "symbolism", "mirrorborne"}
    lore_exts = {".md", ".pdr.md", ".txt", ".json"}
    results: list[str] = []
    for candidate in list(root.rglob("*"))[:2000]:
        if not candidate.is_file():
            continue
        parent_name = candidate.parent.name.lower() if candidate.parent != root else ""
        if parent_name in lore_dirs or candidate.suffix.lower() in lore_exts:
            name_lower = candidate.name.lower()
            if any(term in name_lower for term in _CANON_TERMS):
                results.append(str(candidate.relative_to(root)))
    return results


def run_lore_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = (query or field.task.rawUserRequest).lower()
    findings: list[str] = []
    root = _project_root()

    matched_terms: dict[str, str] = {}
    for term, meaning in _CANON_TERMS.items():
        if term in text:
            matched_terms[term] = meaning

    if matched_terms:
        term_list = ", ".join(matched_terms.keys())
        findings.append(f"Canonical terms detected: {term_list}")
        for term in matched_terms:
            try:
                quote = _quote_term_definition(root, term)
            except EvidenceLookupError as exc:
                findings.append(f'Encyclopedia lookup for "{term}" failed ({exc}) — not a claim the term is undocumented.')
                continue
            if quote:
                path, line = quote
                findings.append(f'"{term}" per {path}: "{line}"')
        if "mirrorborne" in matched_terms and "resonance" not in matched_terms:
            findings.append(
                "Mirrorborne referenced without Resonance — "
                "consider linking them per RESONANCE_LAW."
            )
    else:
        findings.append("No canonical Mirrorborne terms detected in the task text.")

    active_motifs: dict[str, int] = {}
    for motif, words in _SYMBOL_MOTIFS.items():
        count = sum(1 for w in words if w in text)
        if count > 0:
            active_motifs[motif] = count

    if active_motifs:
        motif_list = ", ".join(
            f"{m}\u00d7{c}" for m, c in sorted(active_motifs.items(), key=lambda x: -x[1])
        )
        findings.append(f"Symbolic motifs active: {motif_list}")
    else:
        findings.append("No symbolic motifs detected. The task may be purely technical or non-diegetic.")

    lore_files = _scan_lore_files(root)
    if lore_files:
        findings.append(
            f"Found {len(lore_files)} lore-relevant file(s): {', '.join(lore_files[:4])}"
        )
    else:
        findings.append("No dedicated lore files found in the project.")

    if matched_terms and not lore_files:
        findings.append(
            "WARNING: Canonical terms used but no lore files exist — "
            "lore may be defined only in-memory."
        )

    if not findings:
        findings.append("Lore Brain standing by — no lore-related concerns detected.")

    return AmplifierResult(
        brainId=LORE_BRAIN.id,
        summary=f"Lore analysis: {len(matched_terms)} canonical terms, {len(active_motifs)} motifs.",
        findings=findings,
        recommendedAction="Verify canonical consistency and consult the Scholomance encyclopedia for disputed terms.",
        resonance=ResonanceScore(
            intentMatch=0.8, evidenceStrength=0.6, novelty=0.5,
            conflictRisk=0.2, actionability=0.6,
        ),
    )
