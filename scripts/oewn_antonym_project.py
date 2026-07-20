from __future__ import annotations

import gzip
import hashlib
import math
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass

PINNED_OEWN_URLS = {
    "2024": "https://en-word.net/static/english-wordnet-2024.xml.gz",
}


def strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def open_maybe_gzip(path: str):
    with open(path, "rb") as probe:
        head = probe.read(4)

    if head.startswith(b"\x1f\x8b"):
        return gzip.open(path, "rb")

    if path.endswith(".gz") and head.lstrip().startswith(b"<"):
        print(
            f"Warning: {path} ends with .gz but appears to be plain XML; reading without decompression.",
            file=sys.stderr,
        )
        return open(path, "rb")

    if path.endswith(".gz"):
        preview = head.decode("utf-8", errors="replace").replace("\n", "\\n").replace("\r", "\\r")
        raise SystemExit(
            f"Expected a gzip-compressed XML file at '{path}', but it is not gzip. "
            f"File starts with: {preview!r}. "
            "This often means the download failed (for example: a 'Not Found' response)."
        )

    return open(path, "rb")


def file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass
class ParseResult:
    release: str
    sense_to_synset: dict[str, str]
    asserted: list[tuple[str, str, str]]


@dataclass
class ProjectionResult:
    asserted_count: int
    resolved_asserted_count: int
    unresolved_asserted_count: int
    resolution_ratio: float
    unresolved_ratio: float
    projected_pairs: set[tuple[str, str]]
    projected_count_after_closure: int


@dataclass
class ApplyResult:
    asserted_count: int
    resolved_asserted_count: int
    unresolved_asserted_count: int
    resolution_ratio: float
    unresolved_ratio: float
    projected_count_after_closure: int
    inserted_count: int
    skipped_existing_count: int


def parse_oewn_antonyms(path: str) -> ParseResult:
    """Parse an LMF file in two streaming passes without retaining its tree."""
    release = ""
    sense_to_synset: dict[str, str] = {}

    with open_maybe_gzip(path) as source:
        for _, elem in ET.iterparse(source, events=("end",)):
            tag = strip_ns(elem.tag)
            if tag == "Sense":
                sense_id = elem.get("id")
                synset_id = elem.get("synset")
                if sense_id and synset_id:
                    sense_to_synset[sense_id] = synset_id
            elif tag == "Lexicon":
                release = elem.get("version", release)
            if tag in {"Sense", "LexicalEntry", "Lexicon"}:
                elem.clear()

    asserted: list[tuple[str, str, str]] = []
    with open_maybe_gzip(path) as source:
        for _, elem in ET.iterparse(source, events=("end",)):
            tag = strip_ns(elem.tag)
            if tag == "Sense":
                source_id = elem.get("id")
                if source_id:
                    for child in elem:
                        if strip_ns(child.tag) == "SenseRelation" and child.get("relType") == "antonym":
                            target_id = child.get("target")
                            if target_id:
                                asserted.append(("sense", source_id, target_id))
            elif tag == "Synset":
                source_id = elem.get("id")
                if source_id:
                    for child in elem:
                        if strip_ns(child.tag) == "SynsetRelation" and child.get("relType") == "antonym":
                            target_id = child.get("target")
                            if target_id:
                                asserted.append(("synset", source_id, target_id))
            if tag in {"Sense", "Synset", "LexicalEntry", "Lexicon"}:
                elem.clear()

    return ParseResult(release, sense_to_synset, asserted)


def project_antonyms(parsed: ParseResult, existing_synsets: set[str]) -> ProjectionResult:
    """Resolve asserted edges, then add reciprocal pairs without affecting metrics."""
    projected_pairs: set[tuple[str, str]] = set()
    resolved_count = 0

    for endpoint_kind, source_id, target_id in parsed.asserted:
        if endpoint_kind == "sense":
            source_synset = parsed.sense_to_synset.get(source_id)
            target_synset = parsed.sense_to_synset.get(target_id)
        else:
            source_synset = source_id
            target_synset = target_id

        if (
            source_synset is None
            or target_synset is None
            or source_synset not in existing_synsets
            or target_synset not in existing_synsets
        ):
            continue

        resolved_count += 1
        projected_pairs.add((source_synset, target_synset))
        projected_pairs.add((target_synset, source_synset))

    asserted_count = len(parsed.asserted)
    unresolved_count = asserted_count - resolved_count
    resolution_ratio = resolved_count / asserted_count if asserted_count else 0.0
    unresolved_ratio = unresolved_count / asserted_count if asserted_count else 0.0

    return ProjectionResult(
        asserted_count=asserted_count,
        resolved_asserted_count=resolved_count,
        unresolved_asserted_count=unresolved_count,
        resolution_ratio=resolution_ratio,
        unresolved_ratio=unresolved_ratio,
        projected_pairs=projected_pairs,
        projected_count_after_closure=len(projected_pairs),
    )


def apply_oewn_antonyms(
    conn,
    proj: ProjectionResult,
    *,
    release: str,
    source_url: str,
    source_sha256: str,
    timestamp: str,
    max_unresolved_ratio: float = 0.02,
) -> ApplyResult:
    """Replace OEWN antonyms while preserving manual relations and provenance."""
    if not timestamp:
        raise ValueError("timestamp is required")
    if (
        not math.isfinite(max_unresolved_ratio)
        or not 0 <= max_unresolved_ratio <= 1
    ):
        raise ValueError("max_unresolved_ratio must be finite and between 0 and 1")
    if proj.unresolved_ratio > max_unresolved_ratio:
        raise ValueError(
            f"unresolved_ratio {proj.unresolved_ratio} exceeds {max_unresolved_ratio}"
        )

    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "DELETE FROM wordnet_rel WHERE rel = 'antonym' AND source = 'oewn'"
        )
        existing_non_oewn = {
            (row[0], row[1])
            for row in conn.execute(
                "SELECT synset_id, target_synset_id FROM wordnet_rel "
                "WHERE rel = 'antonym' AND source != 'oewn'"
            )
        }
        inserted = 0
        skipped = 0
        for source_synset, target_synset in sorted(proj.projected_pairs):
            if (source_synset, target_synset) in existing_non_oewn:
                skipped += 1
                continue
            conn.execute(
                "INSERT INTO wordnet_rel(synset_id, rel, target_synset_id, source, source_url) "
                "VALUES (?, 'antonym', ?, 'oewn', ?)",
                (source_synset, target_synset, source_url),
            )
            inserted += 1

        meta = {
            "oewn_antonym_release": release,
            "oewn_antonym_source_url": source_url,
            "oewn_antonym_source_sha256": source_sha256,
            "oewn_antonym_asserted_count": str(proj.asserted_count),
            "oewn_antonym_resolved_asserted_count": str(proj.resolved_asserted_count),
            "oewn_antonym_unresolved_asserted_count": str(proj.unresolved_asserted_count),
            "oewn_antonym_resolution_ratio": repr(proj.resolution_ratio),
            "oewn_antonym_unresolved_ratio": repr(proj.unresolved_ratio),
            "oewn_antonym_projected_count": str(proj.projected_count_after_closure),
            "oewn_antonym_inserted_count": str(inserted),
            "oewn_antonym_skipped_existing_count": str(skipped),
            "oewn_antonym_ingested_at": timestamp,
        }
        for key, value in meta.items():
            conn.execute(
                "INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", (key, value)
            )
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

    return ApplyResult(
        asserted_count=proj.asserted_count,
        resolved_asserted_count=proj.resolved_asserted_count,
        unresolved_asserted_count=proj.unresolved_asserted_count,
        resolution_ratio=proj.resolution_ratio,
        unresolved_ratio=proj.unresolved_ratio,
        projected_count_after_closure=proj.projected_count_after_closure,
        inserted_count=inserted,
        skipped_existing_count=skipped,
    )
