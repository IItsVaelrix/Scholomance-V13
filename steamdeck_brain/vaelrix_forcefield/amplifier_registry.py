"""
Vaelrix Cortex ForceField — Amplifier Registry.

Specialist brains and their default configurations.
"""

from __future__ import annotations

from .types import AmplifierBrain


DEFAULT_AMPLIFIER_REGISTRY: list[AmplifierBrain] = [
    AmplifierBrain(
        id="CODE_BRAIN",
        domain=["code", "engineering", "refactor", "debug"],
        activationSignals=["code", "bug", "fix", "refactor", "test", "error", "function", "class", "import"],
        allowedTools=["search_code", "read_file", "replace_file_content", "run_tests"],
        defaultSearchBudget=5,
        weight=1.0,
    ),
    AmplifierBrain(
        id="TEST_BRAIN",
        domain=["testing", "validation", "regression"],
        activationSignals=["test", "regression", "validate", "verify", "coverage", "qa"],
        allowedTools=["run_tests", "search_code", "read_file"],
        defaultSearchBudget=3,
        weight=1.0,
    ),
    AmplifierBrain(
        id="MEMORY_BRAIN",
        domain=["memory", "history", "patterns", "prior"],
        activationSignals=["memory", "history", "pattern", "prior", "remember", "known", "before"],
        allowedTools=["memory_get", "memory_set", "codebase_search"],
        defaultSearchBudget=2,
        weight=0.9,
    ),
    AmplifierBrain(
        id="RISK_BRAIN",
        domain=["risk", "safety", "regression", "dependencies"],
        activationSignals=["risk", "safe", "regression", "dependency", "blast radius", "dangerous"],
        allowedTools=["search_code", "read_file", "diagnostic_scan"],
        defaultSearchBudget=3,
        weight=1.1,
    ),
    AmplifierBrain(
        id="PIXEL_BRAIN",
        domain=["visual", "pixel", "art", "sprite", "palette"],
        activationSignals=["pixel", "sprite", "art", "visual", "palette", "silhouette", "thumbnail"],
        allowedTools=["read_file", "thumbnail"],
        defaultSearchBudget=1,
        weight=1.0,
    ),
    AmplifierBrain(
        id="RHYME_BRAIN",
        domain=["lyrics", "rhyme", "cadence", "verse"],
        activationSignals=["lyric", "verse", "rhyme", "cadence", "poem", "song"],
        allowedTools=["codebase_search"],
        defaultSearchBudget=2,
        weight=1.0,
    ),
    AmplifierBrain(
        id="PHONEME_BRAIN",
        domain=["phoneme", "pronunciation", "syllable", "sound"],
        activationSignals=["phoneme", "pronunciation", "syllable", "sound", "vowel", "consonant"],
        allowedTools=["codebase_search"],
        defaultSearchBudget=2,
        weight=1.0,
    ),
    AmplifierBrain(
        id="LORE_BRAIN",
        domain=["lore", "canon", "mirrorborne", "symbolism", "myth"],
        activationSignals=["lore", "canon", "mirrorborne", "symbol", "myth", "vaelrix"],
        allowedTools=["codebase_search", "archive_search"],
        defaultSearchBudget=2,
        weight=1.0,
    ),
    AmplifierBrain(
        id="CRITIQUE_BRAIN",
        domain=["critique", "review", "weakness", "improvement"],
        activationSignals=["critique", "review", "weakness", "improve", "grade", "score"],
        allowedTools=["read_file", "critique"],
        defaultSearchBudget=2,
        weight=1.0,
    ),
    AmplifierBrain(
        id="SEO_BRAIN",
        domain=["seo", "title", "tags", "description", "keywords"],
        activationSignals=["seo", "title", "tag", "description", "keyword", "curve", "golden"],
        allowedTools=["score_title", "search_similar"],
        defaultSearchBudget=2,
        weight=1.0,
    ),
    AmplifierBrain(
        id="AUDIO_BRAIN",
        domain=["audio", "music", "sound", "beat"],
        activationSignals=["audio", "music", "sound", "beat", "song", "track"],
        allowedTools=["read_file"],
        defaultSearchBudget=1,
        weight=1.0,
    ),
    AmplifierBrain(
        id="UI_BRAIN",
        domain=["ui", "interface", "widget", "screen", "layout"],
        activationSignals=[
            "ui", "interface", "widget", "screen", "layout", "component", "theme",
            "typography", "font", "georgia", "serif", "truesight",
        ],
        allowedTools=["read_file", "replace_file_content"],
        defaultSearchBudget=3,
        weight=1.0,
    ),
    AmplifierBrain(
        id="DETERMINISM_BRAIN",
        domain=["determinism", "stability", "reproducibility"],
        activationSignals=["deterministic", "stable", "reproducible", "stasis", "regression test"],
        allowedTools=["diagnostic_scan", "run_tests"],
        defaultSearchBudget=2,
        weight=0.9,
    ),
    AmplifierBrain(
        id="ARCHITECTURE_BRAIN",
        domain=["architecture", "design", "structure", "pattern"],
        activationSignals=[
            "architecture", "design", "structure", "pattern", "system", "organize",
            "refactor", "layer", "contract", "boundary",
        ],
        allowedTools=["search_code", "read_file", "codebase_search"],
        defaultSearchBudget=4,
        weight=1.0,
    ),
]


def get_registry() -> list[AmplifierBrain]:
    """Return the default Amplifier registry."""
    return list(DEFAULT_AMPLIFIER_REGISTRY)


def get_brain_by_id(brain_id: str) -> AmplifierBrain | None:
    for brain in DEFAULT_AMPLIFIER_REGISTRY:
        if brain.id == brain_id:
            return brain
    return None
