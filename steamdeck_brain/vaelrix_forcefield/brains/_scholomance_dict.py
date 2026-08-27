"""Read-only access to the project's real dictionary (scholomance_dict.sqlite).

PHONEME_BRAIN and RHYME_BRAIN both need the same thing: a word's actual
CMU-dictionary ARPAbet transcription and rhyme-family data, instead of
approximating pronunciation from letters. This is the real engine
Scholomance's combat scoring runs on (see PLS_DICTIONARY_INTEGRATION.md) —
one connection, shared by both brains, rather than each brain guessing.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

ARPABET_VOWELS = {
    "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY",
    "IH", "IY", "OW", "OY", "UH", "UW",
}

_connection_cache: dict[Path, sqlite3.Connection | None] = {}


def _dict_path(root: Path) -> Path:
    return root / "scholomance_dict.sqlite"


def _connection(root: Path) -> sqlite3.Connection | None:
    path = _dict_path(root)
    if path in _connection_cache:
        return _connection_cache[path]
    if not path.exists():
        _connection_cache[path] = None
        return None
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
        _connection_cache[path] = con
        return con
    except Exception:
        _connection_cache[path] = None
        return None


def ipa_for_word(root: Path, word: str) -> str | None:
    """Real CMU-dictionary ARPAbet transcription, e.g. "crack" -> "K R AE1 K"."""
    con = _connection(root)
    if con is None:
        return None
    try:
        row = con.execute(
            "SELECT ipa FROM entry WHERE headword_lower = ? AND ipa IS NOT NULL LIMIT 1",
            (word.lower(),),
        ).fetchone()
        return row[0] if row else None
    except Exception:
        return None


def rhyme_for_word(root: Path, word: str) -> dict | None:
    """Real phonetic rhyme data: rhyme_family, coda, rhyme_key, corpus_freq."""
    con = _connection(root)
    if con is None:
        return None
    try:
        row = con.execute(
            "SELECT rhyme_family, coda, rhyme_key, corpus_freq FROM rhyme_index "
            "WHERE word_lower = ? LIMIT 1",
            (word.lower(),),
        ).fetchone()
        if not row:
            return None
        return {"rhyme_family": row[0], "coda": row[1], "rhyme_key": row[2], "corpus_freq": row[3]}
    except Exception:
        return None


def count_arpabet_phones(ipa: str) -> tuple[int, int]:
    """(vowel_phone_count, consonant_phone_count) from a CMU ARPAbet string."""
    vowels = 0
    consonants = 0
    for phone in ipa.split():
        base = phone.rstrip("012")
        if base in ARPABET_VOWELS:
            vowels += 1
        else:
            consonants += 1
    return vowels, consonants
