"""
Vaelrix Cortex ForceField — Rhyme Brain.

Lyrics/verse domain specialist. Analyzes text for rhyme schemes,
cadence patterns, syllable structure, and verse quality — all via
deterministic heuristics (no LLM).
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from . import _scholomance_dict as sdict
from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


RHYME_BRAIN = AmplifierBrain(
    id="RHYME_BRAIN",
    domain=["lyrics", "rhyme", "cadence", "verse"],
    activationSignals=[
        "lyric", "verse", "rhyme", "cadence", "poem", "song",
        "couplet", "scans well", "scansion", "meter", "stanza", "bars",
    ],
    allowedTools=["codebase_search"],
    defaultSearchBudget=2,
)

_RHYME_GROUPS: dict[str, set[str]] = {
    "AY": {"ay", "ey", "ae", "ei", "eigh", "aigh"},
    "EE": {"ee", "ea", "ie", "ei", "y"},
    "OH": {"oh", "ow", "oa", "oe", "ough"},
    "OO": {"oo", "ue", "ew", "ou", "ui"},
    "AH": {"ah", "a", "uh", "u"},
    "IGHT": {"ight", "ite", "yte"},
    "AIN": {"ain", "ane", "ein", "eyn"},
    "AIR": {"air", "are", "ear", "ere", "eir"},
    "EED": {"eed", "ead", "ede"},
    "OW": {"ow", "ough", "au"},
    "OR": {"or", "ore", "oar", "our", "oor"},
    "ER": {"er", "ir", "ur", "ear", "or"},
}

_CADENCE_MARKERS: dict[str, set[str]] = {
    "fast": {"quick", "sharp", "snap", "crack", "whip", "dash", "flash", "zip"},
    "slow": {"slow", "drift", "fall", "sink", "fade", "mourn", "linger", "hollow"},
    "march": {"march", "step", "beat", "drum", "pound", "strike", "rise", "stand"},
    "flow": {"flow", "stream", "river", "wind", "glide", "wave", "current", "drift"},
}


def _extract_lines(text: str) -> list[str]:
    lines = [line.strip() for line in text.splitlines()]
    return [line for line in lines if line and len(line) > 2]


def _last_word(text: str) -> str:
    words = re.findall(r"[a-zA-Z]+", text)
    return words[-1].lower() if words else ""


def _last_syllable_group(word: str) -> str:
    word_lower = word.lower()
    for group, endings in _RHYME_GROUPS.items():
        for end in endings:
            if word_lower.endswith(end):
                return group
    return word_lower[-2:] if len(word_lower) >= 2 else word_lower


def _project_root() -> Path:
    here = Path(__file__).resolve()
    for _ in range(8):
        if here == here.parent:
            break
        if any((here / marker).exists() for marker in (".git", "package.json", "pyproject.toml")):
            return here
        here = here.parent
    return Path.cwd()


def _rhyme_group(root: Path, word: str, dict_available: bool = True) -> tuple[str, bool]:
    """(group_label, is_real) — real rhyme_family from the dictionary when
    the word is known, else the suffix-heuristic fallback.

    dict_available=False (set once by the caller after ensure_available()
    raises) skips the dictionary entirely rather than raising once per line.
    """
    if dict_available:
        rhyme = sdict.rhyme_for_word(root, word)
        if rhyme and rhyme.get("rhyme_family"):
            return rhyme["rhyme_family"], True
    return _last_syllable_group(word), False


def _count_syllables(word: str) -> int:
    word = word.lower().strip(",.!?;:()[]{}'\"")
    if not word:
        return 0
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def _detect_rhyme_scheme(root: Path, lines: list[str], dict_available: bool = True) -> tuple[str, float]:
    if len(lines) < 2:
        return "N/A", 0.0
    endings = [_rhyme_group(root, _last_word(line), dict_available)[0] for line in lines]
    letter_map: dict[str, str] = {}
    next_letter = ord("A")
    scheme: list[str] = []
    for end in endings:
        if end not in letter_map:
            letter_map[end] = chr(next_letter)
            next_letter += 1
        scheme.append(letter_map[end])
    pairs = 0
    total_possible = len(lines) - 1
    for i in range(0, len(lines) - 1, 2):
        if i + 1 < len(lines) and endings[i] == endings[i + 1]:
            pairs += 1
    consistency = pairs / max(total_possible, 1) if total_possible > 0 else 0.0
    return "".join(scheme), consistency


def _detect_cadence(text: str) -> list[str]:
    text_lower = text.lower()
    found: dict[str, int] = {}
    for style, markers in _CADENCE_MARKERS.items():
        for word in markers:
            if word in text_lower:
                found[style] = found.get(style, 0) + 1
    return [s for s, _ in sorted(found.items(), key=lambda x: -x[1])]


def run_rhyme_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = query or field.task.rawUserRequest
    findings: list[str] = []
    lines = _extract_lines(text)

    if not lines:
        findings.append("No verse lines detected in the input. Provide multi-line text for rhyme analysis.")
        return AmplifierResult(
            brainId=RHYME_BRAIN.id,
            summary="No verse content to analyze.",
            findings=findings,
            recommendedAction="Supply lyric or verse text for rhyme/cadence analysis.",
            resonance=ResonanceScore(
                intentMatch=0.3, evidenceStrength=0.1, novelty=0.3,
                conflictRisk=0.0, actionability=0.2,
            ),
        )

    root = _project_root()
    dict_available = True
    try:
        sdict.ensure_available(root)
    except sdict.DictionaryUnavailable as exc:
        dict_available = False
        findings.append(
            f"Real rhyme dictionary unavailable ({exc}) — falling back to "
            "suffix-heuristic rhyme grouping. This is an infrastructure "
            "failure, not a statement about the input verse."
        )

    scheme, consistency = _detect_rhyme_scheme(root, lines, dict_available)
    findings.append(f"Rhyme scheme: {scheme} (consistency: {consistency:.0%})")

    real_hits = [
        (word, group, is_real)
        for word, (group, is_real) in (
            (_last_word(line), _rhyme_group(root, _last_word(line), dict_available)) for line in lines
        )
        if is_real
    ]
    if real_hits:
        sample = ", ".join(f'"{w}"={g}' for w, g, _ in real_hits[:4])
        findings.append(f"Real dictionary rhyme_family for {len(real_hits)}/{len(lines)} line ending(s): {sample}")

    syllable_counts = [_count_syllables(_last_word(line)) for line in lines]
    avg_syl = sum(syllable_counts) / len(syllable_counts) if syllable_counts else 0
    min_syl, max_syl = (min(syllable_counts), max(syllable_counts)) if syllable_counts else (0, 0)
    findings.append(f"Syllables per line-ending: avg {avg_syl:.1f}, range {min_syl}–{max_syl}")

    if max_syl - min_syl > 2 and len(lines) >= 4:
        findings.append("Line-ending syllable variance > 2; meter may feel inconsistent.")
    elif max_syl - min_syl <= 1 and len(lines) >= 4:
        findings.append("Tight syllable consistency — strong metrical discipline.")

    cadence_styles = _detect_cadence(text)
    if cadence_styles:
        findings.append(f"Detected cadence style(s): {', '.join(cadence_styles)}")
    else:
        findings.append("No strong cadence markers detected; consider adding rhythmic anchor words.")

    rhyme_groups = Counter(_rhyme_group(root, _last_word(line), dict_available)[0] for line in lines)
    unique_rhymes = len(rhyme_groups)
    rhyme_density = (len(lines) - unique_rhymes) / max(len(lines), 1)
    if rhyme_density > 0.6:
        findings.append(f"High rhyme density ({rhyme_density:.0%}) — may feel sing-songy.")
    elif rhyme_density < 0.2 and len(lines) >= 4:
        findings.append(f"Low rhyme density ({rhyme_density:.0%}) — consider adding more rhyming pairs.")

    return AmplifierResult(
        brainId=RHYME_BRAIN.id,
        summary=f"Rhyme analysis: {len(lines)} lines, scheme {scheme}.",
        findings=findings,
        recommendedAction="Review rhyme scheme and syllable balance for the intended cadence style.",
        resonance=ResonanceScore(
            intentMatch=0.8, evidenceStrength=0.7, novelty=0.5,
            conflictRisk=0.05, actionability=0.7,
        ),
    )
