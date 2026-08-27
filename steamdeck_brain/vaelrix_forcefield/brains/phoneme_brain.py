"""
Vaelrix Cortex ForceField — Phoneme Brain.

Pronunciation and sound-domain specialist. Breaks input text into
phoneme approximations, analyzes vowel/consonant distributions,
and surfaces sound-quality observations — all deterministic.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from . import _scholomance_dict as sdict
from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


PHONEME_BRAIN = AmplifierBrain(
    id="PHONEME_BRAIN",
    domain=["phoneme", "pronunciation", "syllable", "sound"],
    activationSignals=["phoneme", "pronunciation", "syllable", "sound", "vowel", "consonant"],
    allowedTools=["codebase_search"],
    defaultSearchBudget=2,
)

_VOWELS = set("aeiou")
_CONSONANTS = set("bcdfghjklmnpqrstvwxyz")
_SONORANTS = set("lmnrwy")
_PLOSIVES = set("pbtdkg")
_FRICATIVES = set("fvszh")
_SIBILANTS = set("sz")

_HARSH_WORDS = {"crack", "snap", "grind", "slash", "rend", "tear", "break", "rip", "crush", "smash", "shard", "thorn"}
_SOFT_WORDS = {"whisper", "hush", "murmur", "soft", "gentle", "drift", "float", "lull", "soothe", "calm", "still"}
_RESONANT_WORDS = {"ring", "sing", "chime", "echo", "hum", "vibrate", "resonate", "tone", "bell", "chord"}
_PERCUSSIVE_WORDS = {"bang", "clap", "snap", "pop", "click", "tap", "knock", "strike", "pound", "drum"}


def _extract_words(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z]+", text.lower())


def _project_root() -> Path:
    here = Path(__file__).resolve()
    for _ in range(8):
        if here == here.parent:
            break
        if any((here / marker).exists() for marker in (".git", "package.json", "pyproject.toml")):
            return here
        here = here.parent
    return Path.cwd()


def _real_arpabet_data(root: Path, words: list[str]) -> tuple[dict[str, str], int, int, list[str]]:
    """Real ARPAbet transcriptions + phone counts for words found in the dictionary.

    Returns (transcriptions_by_word, vowel_phone_total, consonant_phone_total,
    out_of_vocabulary_words).
    """
    transcriptions: dict[str, str] = {}
    vowel_total = 0
    consonant_total = 0
    oov: list[str] = []
    for word in dict.fromkeys(words):  # de-duplicate, preserve first-seen order
        ipa = sdict.ipa_for_word(root, word)
        if ipa:
            transcriptions[word] = ipa
            v, c = sdict.count_arpabet_phones(ipa)
            vowel_total += v
            consonant_total += c
        else:
            oov.append(word)
    return transcriptions, vowel_total, consonant_total, oov


def _phoneme_profile(words: list[str]) -> dict:
    all_chars = "".join(words)
    if not all_chars:
        return {}
    total = len(all_chars)
    vowel_count = sum(1 for c in all_chars if c in _VOWELS)
    consonant_count = sum(1 for c in all_chars if c in _CONSONANTS)
    sonorant_count = sum(1 for c in all_chars if c in _SONORANTS)
    plosive_count = sum(1 for c in all_chars if c in _PLOSIVES)
    fricative_count = sum(1 for c in all_chars if c in _FRICATIVES)
    sibilant_count = sum(1 for c in all_chars if c in _SIBILANTS)
    return {
        "totalChars": total, "wordCount": len(words),
        "vowelRatio": vowel_count / total,
        "consonantRatio": consonant_count / total,
        "sonorantRatio": sonorant_count / max(consonant_count, 1),
        "plosiveRatio": plosive_count / max(consonant_count, 1),
        "fricativeRatio": fricative_count / max(consonant_count, 1),
        "sibilantRatio": sibilant_count / max(consonant_count, 1),
    }


def _detect_sound_palette(words: list[str]) -> dict[str, int]:
    word_set = set(words)
    return {
        "harsh": len(word_set & _HARSH_WORDS),
        "soft": len(word_set & _SOFT_WORDS),
        "resonant": len(word_set & _RESONANT_WORDS),
        "percussive": len(word_set & _PERCUSSIVE_WORDS),
    }


def run_phoneme_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = query or field.task.rawUserRequest
    findings: list[str] = []
    words = _extract_words(text)

    if len(words) < 3:
        findings.append("Too few words for meaningful phoneme analysis. Provide richer text.")
        return AmplifierResult(
            brainId=PHONEME_BRAIN.id,
            summary="Insufficient text for phoneme analysis.",
            findings=findings,
            recommendedAction="Provide more text with varied phonemes.",
            resonance=ResonanceScore(
                intentMatch=0.3, evidenceStrength=0.1, novelty=0.3, actionability=0.2,
            ),
        )

    root = _project_root()
    transcriptions, real_vowels, real_consonants, oov = _real_arpabet_data(root, words)

    if transcriptions:
        real_total = real_vowels + real_consonants
        vr = real_vowels / real_total if real_total else 0.0
        cr = real_consonants / real_total if real_total else 0.0
        findings.append(
            f"Real ARPAbet vowel/consonant phone ratio: {vr:.0%}/{cr:.0%} "
            f"({len(transcriptions)}/{len(set(words))} unique word(s) found in the dictionary)"
        )
        sample = list(transcriptions.items())[:3]
        findings.append(
            "Real transcriptions: " + "; ".join(f'"{w}" = {ipa}' for w, ipa in sample)
        )
        if vr > 0.45:
            findings.append("High vowel density — text may sound open and melodic.")
        elif vr < 0.32:
            findings.append("Low vowel density — text may feel clipped or consonant-heavy.")
        if oov:
            findings.append(
                f"{len(oov)} word(s) not in the dictionary (e.g. {', '.join(oov[:3])}) — "
                "excluded from the real ratio above."
            )
    else:
        profile = _phoneme_profile(words)
        vr = profile["vowelRatio"]
        cr = profile["consonantRatio"]
        findings.append(
            f"Approximate (letter-based) vowel/consonant ratio: {vr:.0%}/{cr:.0%} — "
            "no words found in the dictionary; real ARPAbet data unavailable for this text."
        )
        if vr > 0.45:
            findings.append("High vowel density — text may sound open and melodic.")
        elif vr < 0.32:
            findings.append("Low vowel density — text may feel clipped or consonant-heavy.")

    profile = _phoneme_profile(words)
    son = profile["sonorantRatio"]
    plo = profile["plosiveRatio"]
    if son > 0.35:
        findings.append(f"Approximate: rich in sonorants ({son:.0%} of consonants) — flowing, lyrical quality.")
    if plo > 0.30:
        findings.append(f"Approximate: high plosive count ({plo:.0%} of consonants) — percussive, punchy delivery.")

    sib = profile["sibilantRatio"]
    if sib > 0.15:
        findings.append(f"Approximate: elevated sibilance ({sib:.0%}) — may cause recording harshness; consider de-essing.")

    palette = _detect_sound_palette(words)
    active_palettes = [k for k, v in palette.items() if v > 0]
    if active_palettes:
        findings.append(f"Sound texture palette: {', '.join(active_palettes)} ({sum(palette.values())} markers)")

    long_words = [w for w in words if len(w) > 7]
    if long_words:
        findings.append(
            f"{len(long_words)} polysyllabic word(s) detected "
            f"(e.g. {', '.join(long_words[:3])}) — check stress patterns."
        )

    first_letters = [w[0] for w in words if w]
    alliteration = Counter(first_letters)
    heavy_allit = [(ltr, cnt) for ltr, cnt in alliteration.items() if cnt >= 3]
    if heavy_allit:
        findings.append(
            f"Alliteration detected: {', '.join(f'{ltr}\u00d7{cnt}' for ltr, cnt in heavy_allit[:3])}"
        )

    if not findings:
        findings.append("Phoneme profile is neutral. No particular sound-quality flags.")

    return AmplifierResult(
        brainId=PHONEME_BRAIN.id,
        summary=f"Phoneme analysis: {len(words)} words, {profile['totalChars']} chars.",
        findings=findings,
        recommendedAction="Review phoneme balance for the intended vocal delivery style.",
        resonance=ResonanceScore(
            intentMatch=0.8, evidenceStrength=0.7, novelty=0.5,
            conflictRisk=0.05, actionability=0.6,
        ),
    )
