"""
Vaelrix Cortex ForceField — Audio Brain.

Music/sound/beat domain specialist. Analyzes the task for audio-related
concerns: BPM, beat structure, sound design, audio file references,
and music theory heuristics.

Its genre, instrument, and production-term lists are unvalidated heuristics,
not measurements from audio files, BPM analysis, or listener data. Treat
findings as review prompts, never as measured audio facts.
"""

from __future__ import annotations

import re

from ..types import AmplifierBrain, AmplifierResult, ResonanceScore, VaelrixCortexForceField


AUDIO_BRAIN = AmplifierBrain(
    id="AUDIO_BRAIN",
    domain=["audio", "music", "sound", "beat"],
    activationSignals=["audio", "music", "sound", "beat", "song", "track"],
    allowedTools=["read_file"],
    defaultSearchBudget=1,
)

_BPM_PATTERN = re.compile(r"(\d{2,3})\s*(?:bpm|BPM|beats?\s*per\s*minute)")

_TIME_SIG_PATTERN = re.compile(r"(\d+)\s*/\s*(\d+)\s*(?:time|signature)")

_KEY_WORDS = {
    "c major": "C Major (no sharps/flats) — bright, pure",
    "c minor": "C Minor — somber, dramatic",
    "g major": "G Major — warm, resonant",
    "d minor": "D Minor — melancholic, the 'saddest key'",
    "a minor": "A Minor — natural minor, versatile",
    "e minor": "E Minor — dark, driving (common in rock/electronic)",
}

_GENRE_MARKERS: dict[str, set[str]] = {
    "electronic": {"synth", "bass", "drop", "wobble", "sidechain", "filter"},
    "orchestral": {"strings", "brass", "woodwind", "orchestra", "crescendo", "timpani"},
    "rock": {"guitar", "distortion", "riff", "power chord", "drum fill"},
    "ambient": {"pad", "drone", "texture", "soundscape", "atmosphere", "reverb"},
    "lo-fi": {"lofi", "vinyl", "crackle", "chill", "study beats"},
    "phonk": {"phonk", "cowbell", "memphis", "drift"},
}

_AUDIO_FILE_EXTS = {".wav", ".mp3", ".ogg", ".flac", ".aiff", ".m4a", ".opus"}


def run_audio_brain(
    field: VaelrixCortexForceField,
    query: str | None = None,
) -> AmplifierResult:
    text = query or field.task.rawUserRequest
    findings: list[str] = []

    # BPM detection
    bpm_match = _BPM_PATTERN.search(text)
    if bpm_match:
        bpm = int(bpm_match.group(1))
        if bpm < 60:
            findings.append(f"BPM {bpm}: very slow (largo/adagio) — meditative or doom-laden.")
        elif bpm < 90:
            findings.append(f"BPM {bpm}: moderate-slow — groove/ballad territory.")
        elif bpm < 120:
            findings.append(f"BPM {bpm}: mid-tempo — pop/rock sweet spot.")
        elif bpm < 150:
            findings.append(f"BPM {bpm}: upbeat — dance/energetic.")
        elif bpm < 180:
            findings.append(f"BPM {bpm}: fast — drum & bass / speed metal range.")
        else:
            findings.append(f"BPM {bpm}: extreme tempo — consider listenability.")
    else:
        findings.append("No BPM specified. Define tempo before composing/editing.")

    # Time signature
    ts_match = _TIME_SIG_PATTERN.search(text)
    if ts_match:
        findings.append(f"Time signature: {ts_match.group(1)}/{ts_match.group(2)}")
    elif any(w in text.lower() for w in {"waltz", "3/4", "triple"}):
        findings.append("Possible triple meter (waltz/3/4) — check time signature intent.")

    # Key detection
    text_lower = text.lower()
    for key, desc in _KEY_WORDS.items():
        if key in text_lower:
            findings.append(f"Key: {desc}")
            break
    else:
        if any(w in text_lower for w in {"key", "scale", "tonic", "major", "minor"}):
            findings.append("Key referenced but not identified — specify the tonal center.")

    # Genre detection
    active_genres: list[str] = []
    for genre, markers in _GENRE_MARKERS.items():
        if any(m in text_lower for m in markers):
            active_genres.append(genre)
    if active_genres:
        findings.append(f"Genre signals: {', '.join(active_genres)}")

    # Audio file references
    if any(ext in text for ext in _AUDIO_FILE_EXTS):
        findings.append("Audio file references detected — verify source files exist.")

    # Sound design terms
    fx_terms = {"reverb", "delay", "eq", "compressor", "limiter", "distortion",
                "chorus", "flanger", "phaser", "filter"}
    fx_hits = [t for t in fx_terms if t in text_lower]
    if fx_hits:
        findings.append(f"Audio effects referenced: {', '.join(fx_hits)}")

    if not findings:
        findings.append("No strong audio signals detected. Audio Brain standing by.")

    return AmplifierResult(
        brainId=AUDIO_BRAIN.id,
        summary="Audio/music heuristic analysis.",
        findings=findings,
        recommendedAction="Define BPM, key, and time signature before composition. Verify audio assets exist.",
        resonance=ResonanceScore(
            intentMatch=0.7, evidenceStrength=0.5, novelty=0.5,
            conflictRisk=0.05, actionability=0.7,
        ),
    )
