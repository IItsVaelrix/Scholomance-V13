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


# Passed to detect_gene_matches as the final_score floor. It MUST stay above the
# detector's own _BASE_SCORE_MINIMUM (detector.py: 0.5) or it is inert — a knob
# that does nothing is worse than no knob, because it invites tuning that has no
# effect. Raise this to tighten matching; lowering it below 0.5 does nothing.
INJECT_SCORE_THRESHOLD = 0.5
MIN_FRESHNESS = 0.5
MAX_GENES = 3


def load_injection_registry() -> GeneRegistry:
    """Committed JSON registry merged with the built-in defaults."""
    registry = _load_json_registry(DEFAULT_REGISTRY_PATH)
    registry.update(DEFAULT_GENE_REGISTRY)
    return registry


def passes_freshness(gene: RetrievalGene, *, repo_root: str | None = None,
                     stamp: str | None = None) -> bool:
    """Gate on the MEASURED value when the gene declares surfaces.

    A gene that declares no surfaces cannot be dated, and "undatable" must not
    become "blocked": that would mute every gene written before surfaces
    existed. It falls back to the declared literal, exactly as before, and
    `effective_freshness` reports `basis` so the difference stays visible.
    """
    from .gene_freshness import effective_freshness
    try:
        eff = effective_freshness(gene, repo_root, stamp=stamp)
    except Exception:
        return gene.retrieval.freshness >= MIN_FRESHNESS
    return eff["value"] >= MIN_FRESHNESS


def select_genes(task: str, registry: GeneRegistry | None = None, *,
                 repo_root: str | None = None,
                 stamp: str | None = None) -> list[RetrievalGene]:
    """Distill the task, match genes, and apply forcefield-equivalent gating.

    `repo_root`/`stamp` exist so the freshness gate can be exercised end to end
    against a fixture repo. Testing passes_freshness alone would leave the
    wiring here unguarded, and the wiring is the part that carries the fix.
    """
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
        if not passes_freshness(gene, repo_root=repo_root, stamp=stamp):
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


def main(argv: list[str] | None = None) -> int:
    """UserPromptSubmit hook entrypoint or CLI. Never raises.

    argv is injected for testability: the module's callers pass None (argparse
    then reads sys.argv), but a test harness must be able to hand in its own
    list. Without this, pytest's own argv leaks into parse_args.
    """
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", type=str, default=None, help="Direct prompt string for CLI use")
    parser.add_argument("--agent", type=str, default=None, help="Target agent for context formatting (grok, codex, gemini, opencode)")
    args = parser.parse_args(argv)

    if args.prompt:
        task = args.prompt
        try:
            block = build_injection(task)
        except Exception as exc:  # never raise into the user's turn...
            # ...but never pretend a crash is an empty corpus either. Both used to
            # print nothing and exit 0, so an unreachable retriever looked exactly
            # like a quiet one.
            print(f"[scdna] injection failed: {exc!r}", file=sys.stderr)
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
    except Exception as exc:  # never raise into the user's turn...
        # ...but never pretend a crash is an empty corpus either. Both used to
        # print nothing and exit 0, so an unreachable retriever looked exactly
        # like a quiet one.
        print(f"[scdna] injection failed: {exc!r}", file=sys.stderr)
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
