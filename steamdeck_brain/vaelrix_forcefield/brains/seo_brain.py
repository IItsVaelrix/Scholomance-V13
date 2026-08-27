"""
Vaelrix Cortex ForceField — SEO Brain.

Title, tag, description, and keyword domain specialist. Scores titles
against YouTube best-practice heuristics: length, power words, keyword
placement, emotional curve, and golden-curve compliance.

Its power-word and emotional-language lists are unvalidated heuristics, not
measured SEO-performance signals. Treat findings as prompts for review, never
as evidence of discoverability or conversion.
"""

from __future__ import annotations

import re

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


SEO_BRAIN = AmplifierBrain(
    id="SEO_BRAIN",
    domain=["seo", "title", "tags", "description", "keywords"],
    activationSignals=["seo", "title", "tag", "description", "keyword", "curve", "golden"],
    allowedTools=["score_title", "search_similar"],
    defaultSearchBudget=2,
)

_POWER_WORDS = {
    "ultimate", "proven", "secret", "instant", "unlock", "master",
    "hidden", "exclusive", "revealed", "shocking", "insane",
    "breakthrough", "essential", "viral", "legendary", "forbidden",
    "devastating", "unstoppable", "unbelievable", "mind-blowing",
    "definitive", "complete", "absolute", "perfect",
}

_EMOTION_WORDS = {
    "love", "hate", "fear", "rage", "joy", "pain", "death",
    "alive", "insane", "crazy", "beautiful", "ugly", "dark",
    "light", "broken", "rise", "fall", "destroy", "create",
}

_CLICKBAIT_PENALTY = {
    "you won't believe", "doctors hate", "this one trick",
    "what happens next", "number 7 will shock",
}

_GOLDEN_CURVE_TEMPLATE = re.compile(
    r"^.{0,5}(\b[a-zA-Z]{3,8}\b).{5,15}(\b[a-zA-Z]{3,8}\b).{5,20}$"
)


def _title_score(title: str) -> dict:
    clean = title.strip()
    words = re.findall(r"[a-zA-Z]+", clean.lower())
    char_count = len(clean)
    scores: dict[str, float] = {}

    if 40 <= char_count <= 70:
        scores["length"] = 1.0
    elif 30 <= char_count <= 80:
        scores["length"] = 0.7
    elif char_count < 20:
        scores["length"] = 0.3
    elif char_count > 100:
        scores["length"] = 0.4
    else:
        scores["length"] = 0.5

    power_hits = sum(1 for w in words if w in _POWER_WORDS)
    scores["powerWords"] = min(power_hits / max(len(words), 1) * 5, 1.0)

    emotion_hits = sum(1 for w in words if w in _EMOTION_WORDS)
    scores["emotionWords"] = min(emotion_hits / max(len(words), 1) * 5, 1.0)

    has_clickbait = any(phrase in clean.lower() for phrase in _CLICKBAIT_PENALTY)
    scores["clickbait"] = 0.0 if has_clickbait else 1.0

    front_words = words[:3]
    scores["frontLoad"] = 0.6
    if len(front_words) >= 2 and any(w in _POWER_WORDS for w in front_words):
        scores["frontLoad"] = 1.0

    scores["goldenCurve"] = 0.5
    if _GOLDEN_CURVE_TEMPLATE.match(clean):
        scores["goldenCurve"] = 0.8
    if ":" in clean or " - " in clean or " | " in clean:
        scores["goldenCurve"] = max(scores["goldenCurve"], 0.85)

    weights = {
        "length": 0.15, "powerWords": 0.25, "emotionWords": 0.15,
        "clickbait": 0.20, "frontLoad": 0.15, "goldenCurve": 0.10,
    }
    composite = sum(scores[k] * weights[k] for k in weights)
    scores["composite"] = composite
    return scores


def _extract_title(text: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and len(stripped) > 10:
            return stripped
    return None


def run_seo_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = query or field.task.rawUserRequest
    findings: list[str] = []

    title = _extract_title(text)
    if not title:
        findings.append("No recognizable title found in the task. Provide explicit title text.")
        return AmplifierResult(
            brainId=SEO_BRAIN.id,
            summary="No title to score.",
            findings=findings,
            recommendedAction="Supply a title or description for SEO analysis.",
            resonance=ResonanceScore(
                intentMatch=0.3, evidenceStrength=0.1, novelty=0.3, actionability=0.2,
            ),
        )

    scores = _title_score(title)

    findings.append(f"Title length: {len(title.strip())} chars (ideal: 40-70)")
    findings.append(f"Composite SEO score: {scores['composite']:.0%}")

    if scores["powerWords"] < 0.2:
        findings.append("Low power-word density — consider adding urgency/curiosity words.")
    if scores["emotionWords"] < 0.2:
        findings.append("Low emotion-word density — emotional triggers improve CTR.")
    if scores["clickbait"] == 0.0:
        findings.append("Clickbait phrase detected — this may harm credibility and CTR.")
    if scores["frontLoad"] < 0.8:
        findings.append("Keyword not front-loaded; lead with your strongest term.")
    if scores["goldenCurve"] < 0.7:
        findings.append("Title doesn't follow the golden curve; try a two-part structure (e.g. 'Hook: Promise').")
    if scores["length"] < 0.5:
        findings.append("Title length outside optimal range; YouTube truncates at ~70 chars.")

    if scores["composite"] >= 0.7:
        findings.append("Overall: strong title composition. Minor tweaks only.")

    return AmplifierResult(
        brainId=SEO_BRAIN.id,
        summary=f"SEO title analysis: composite score {scores['composite']:.0%}.",
        findings=findings,
        recommendedAction="Optimize title per flagged dimensions before publishing.",
        resonance=ResonanceScore(
            intentMatch=0.8, evidenceStrength=0.7, novelty=0.5,
            conflictRisk=0.1, actionability=0.8,
        ),
    )
