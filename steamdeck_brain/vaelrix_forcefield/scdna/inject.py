"""
SCDNA — proactive gene injection.

Distills a task prompt to a compact intent query, matches it against the
gene registry via the existing detector, gates the results, and renders a
directive block for a Claude Code UserPromptSubmit hook.

The detector scores token overlap as ``overlap / len(query_tokens)``, so a
raw multi-sentence prompt dilutes every score below threshold. distill_query
shrinks the prompt to domain-salient tokens first.
"""

from __future__ import annotations

import json
import sys

from .compiler import DEFAULT_REGISTRY_PATH, _load_json_registry
from .detector import detect_gene_matches, normalize_text, tokenize
from .registry import DEFAULT_GENE_REGISTRY, GeneRegistry
from .types import RetrievalGene

STOPWORDS: frozenset[str] = frozenset({
    "the", "and", "for", "with", "this", "that", "you", "your", "our", "can",
    "will", "please", "make", "made", "from", "into", "onto", "have", "has",
    "are", "was", "were", "any", "all", "but", "not", "use", "used", "using",
    "get", "got", "let", "now", "then", "than", "out", "off", "via", "per",
    "should", "would", "could", "about", "again", "also", "just", "like",
    "want", "need", "needs", "able", "easily", "turn", "turned",
})

DOMAIN_LEXICON: dict[str, frozenset[str]] = {
    "code": frozenset({"code", "function", "refactor", "bug", "debug", "compile",
                       "module", "import", "export", "lint", "runtime"}),
    "rhyme": frozenset({"rhyme", "lyric", "lyrics", "verse", "cadence", "chorus", "hook"}),
    "phoneme": frozenset({"phoneme", "syllable", "pronounce", "pronunciation", "sound", "ipa"}),
    "pixel": frozenset({"pixel", "pixelbrain", "sprite", "palette", "render", "color",
                        "colour", "voxel", "art", "claymore", "sword", "weapon", "shield",
                        "asset", "skeleton", "morph", "foundry", "pbrain", "pommel", "blade"}),
    "lore": frozenset({"lore", "canon", "myth", "symbolism", "mirrorborne", "story", "character"}),
    "audio": frozenset({"audio", "music", "beat", "synth", "mix", "ambience"}),
    "seo": frozenset({"seo", "title", "tags", "keywords", "description", "metadata"}),
    "memory": frozenset({"memory", "recall", "remember", "history", "prior", "gene"}),
    "testing": frozenset({"test", "tests", "regression", "assert", "coverage", "spec"}),
    "architecture": frozenset({"architecture", "design", "structure", "pattern", "schema",
                               "contract", "boundary"}),
    "risk": frozenset({"risk", "safety", "security", "dependency", "blast", "hazard"}),
}

_LEXICON_ALL: frozenset[str] = frozenset().union(*DOMAIN_LEXICON.values())


def distill_query(task: str) -> str:
    """Reduce a task prompt to de-duplicated, order-preserved salient tokens."""
    seen: set[str] = set()
    out: list[str] = []
    for token in tokenize(normalize_text(task)):
        if token in STOPWORDS or token not in _LEXICON_ALL:
            continue
        if token not in seen:
            seen.add(token)
            out.append(token)
    return " ".join(out)


# Tuning knob passed to detect_gene_matches. NOTE: the detector also enforces an
# internal floor (_BASE_SCORE_MINIMUM = 0.5 on the raw overlap ratio), which
# dominates this value — so the *effective* match floor is 0.5, not 0.35.
# This constant only binds if that internal floor is ever lowered. Kept as the
# documented loosen-matching surface; raising it above 0.5 would tighten matching.
INJECT_SCORE_THRESHOLD = 0.35  # NOTE: effective floor is detector's hardcoded _BASE_SCORE_MINIMUM (0.5); this only further filters final_score, so values <=0.5 are inert
MIN_FRESHNESS = 0.5
MAX_GENES = 3


def load_injection_registry() -> GeneRegistry:
    """Committed JSON registry merged with the built-in defaults."""
    registry = _load_json_registry(DEFAULT_REGISTRY_PATH)
    registry.update(DEFAULT_GENE_REGISTRY)
    return registry


def select_genes(task: str, registry: GeneRegistry | None = None) -> list[RetrievalGene]:
    """Distill the task, match genes, and apply forcefield-equivalent gating."""
    if registry is None:
        registry = load_injection_registry()

    query = distill_query(task)
    if not query:
        return []

    matches = detect_gene_matches(query, registry, score_threshold=INJECT_SCORE_THRESHOLD)

    gated: list[RetrievalGene] = []
    for gene in matches:
        if gene.lifecycle.status != "active":
            continue
        if gene.retrieval.confidence < gene.retrieval.minConfidence:
            continue
        if gene.retrieval.freshness < MIN_FRESHNESS:
            continue
        gated.append(gene)
        if len(gated) >= MAX_GENES:
            break
    return gated


def format_context(genes: list[RetrievalGene]) -> str:
    """Render gated genes as a markdown directive block (empty string if none)."""
    if not genes:
        return ""

    lines = [
        "## SCDNA genes active for this task",
        "_Retrieved by intent match — treat as canonical directives for the components named._",
        "",
    ]
    for gene in genes:
        lines.append(
            f"### {gene.identity.stableId}  "
            f"({gene.domain.primary} · conf {gene.retrieval.confidence:.2f})"
        )
        lines.append(f"**Do:** {gene.instruction.imperative}")
        if gene.instruction.requiredChecks:
            lines.append("**Required checks:**")
            lines.extend(f"- {check}" for check in gene.instruction.requiredChecks)
        if gene.instruction.forbiddenDrift:
            lines.append("**Forbidden drift:**")
            lines.extend(f"- {drift}" for drift in gene.instruction.forbiddenDrift)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def build_injection(task: str, registry: GeneRegistry | None = None) -> str:
    """Full pipeline: task string -> directive block (empty when no genes apply)."""
    return format_context(select_genes(task, registry=registry))


def main() -> int:
    """UserPromptSubmit hook entrypoint or CLI. Never raises.

    Usage as hook: pipe JSON {"prompt": "..."}
    Usage as CLI: python -m ... --prompt "your task here" [--agent grok|codex|gemini|opencode]
    """
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", type=str, default=None, help="Direct prompt string for CLI use")
    parser.add_argument("--agent", type=str, default=None, help="Target agent for context formatting (grok, codex, gemini, opencode)")
    args = parser.parse_args()

    if args.prompt:
        task = args.prompt
        try:
            block = build_injection(task)
        except Exception:
            block = ""
        if block.strip():
            if args.agent:
                print(f"## SCDNA Genes for {args.agent}\n{block}")
            else:
                print(block)
        return 0

    # Hook mode (stdin JSON)
    try:
        raw = sys.stdin.read()
    except Exception:
        raw = ""
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    task = str(payload.get("prompt", "") or "")
    try:
        block = build_injection(task)
    except Exception:
        block = ""

    if block.strip():
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": block,
            }
        }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
