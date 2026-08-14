"""Parse a Kaikki / wiktextract JSONL dump and fill entry.etymology."""

from __future__ import annotations

import gzip
import json
import sqlite3
from dataclasses import dataclass
from typing import Iterable, Optional

POS_ALIASES = {
    "n": "n",
    "noun": "n",
    "v": "v",
    "verb": "v",
    "a": "a",
    "adj": "a",
    "adjective": "a",
    "s": "a",
    "r": "r",
    "adv": "r",
    "adverb": "r",
}

ETYMOLOGY_MAX_CHARS = 400


@dataclass(frozen=True)
class EtymologyParseResult:
    by_key: dict[tuple[str, str], str]
    parsed_count: int
    kept_count: int
    skipped_line_count: int


@dataclass(frozen=True)
class EtymologyApplyResult:
    updated_count: int
    skipped_existing_count: int
    unmatched_count: int


def normalize_pos(pos: Optional[str]) -> str:
    if pos is None:
        return ""
    key = str(pos).strip().casefold()
    if not key:
        return ""
    return POS_ALIASES.get(key, key)


def normalize_etymology(text: str) -> str:
    collapsed = " ".join(text.split())
    if len(collapsed) <= ETYMOLOGY_MAX_CHARS:
        return collapsed
    return collapsed[: ETYMOLOGY_MAX_CHARS - 3].rstrip() + "..."


def _open_jsonl(path: str):
    with open(path, "rb") as probe:
        head = probe.read(2)
    if head == b"\x1f\x8b":
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return open(path, "rt", encoding="utf-8", errors="replace")


def _is_english(record: dict) -> bool:
    lang_code = record.get("lang_code")
    if isinstance(lang_code, str) and lang_code.strip():
        return lang_code.strip().casefold() == "en"
    lang = record.get("lang")
    if isinstance(lang, str) and lang.strip():
        return lang.strip().casefold() in {"en", "english"}
    return True


def _lemma_of(record: dict) -> str:
    word = record.get("word")
    if not isinstance(word, str):
        return ""
    return word.strip().casefold()


def _etymology_of(record: dict) -> str:
    text = record.get("etymology_text")
    if not isinstance(text, str) or not text.strip():
        return ""
    return normalize_etymology(text)


def parse_kaikki_etymology(
    path: str,
    wanted_lemmas: Optional[Iterable[str]] = None,
) -> EtymologyParseResult:
    wanted = None
    if wanted_lemmas is not None:
        wanted = {str(lemma).strip().casefold() for lemma in wanted_lemmas if str(lemma).strip()}

    by_key: dict[tuple[str, str], str] = {}
    parsed_count = 0
    skipped_line_count = 0

    with _open_jsonl(path) as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                skipped_line_count += 1
                continue
            if not isinstance(record, dict):
                skipped_line_count += 1
                continue
            if not _is_english(record):
                skipped_line_count += 1
                continue
            lemma = _lemma_of(record)
            etymology = _etymology_of(record)
            pos = normalize_pos(record.get("pos"))
            if not lemma or not etymology or not pos:
                skipped_line_count += 1
                continue
            parsed_count += 1
            if wanted is not None and lemma not in wanted:
                continue
            key = (lemma, pos)
            if key not in by_key:
                by_key[key] = etymology

    return EtymologyParseResult(
        by_key=by_key,
        parsed_count=parsed_count,
        kept_count=len(by_key),
        skipped_line_count=skipped_line_count,
    )


def apply_etymology(
    conn: sqlite3.Connection,
    parsed: EtymologyParseResult,
    *,
    source_path: str,
    source_sha256: str,
) -> EtymologyApplyResult:
    by_lemma: dict[str, dict[str, str]] = {}
    for (lemma, pos), text in parsed.by_key.items():
        by_lemma.setdefault(lemma, {})[pos] = text

    updates: list[tuple[str, int]] = []
    skipped_existing = 0
    unmatched = 0

    rows = conn.execute(
        "SELECT id, headword_lower, pos, etymology FROM entry"
    ).fetchall()
    for entry_id, headword_lower, pos, existing in rows:
        if existing:
            skipped_existing += 1
            continue
        lemma_map = by_lemma.get(headword_lower)
        if not lemma_map:
            unmatched += 1
            continue
        pos_key = normalize_pos(pos)
        text = None
        if pos_key:
            text = lemma_map.get(pos_key)
        elif len(set(lemma_map.values())) == 1:
            text = next(iter(lemma_map.values()))
        if not text:
            unmatched += 1
            continue
        updates.append((text, entry_id))

    if updates:
        conn.executemany("UPDATE entry SET etymology = ? WHERE id = ?", updates)

    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
        ("etymology_source", source_path),
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
        ("etymology_source_sha256", source_sha256),
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
        ("etymology_updated_count", str(len(updates))),
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)",
        ("etymology_kept_count", str(parsed.kept_count)),
    )
    conn.commit()

    return EtymologyApplyResult(
        updated_count=len(updates),
        skipped_existing_count=skipped_existing,
        unmatched_count=unmatched,
    )
