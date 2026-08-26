"""SCDNA coverage — what has canon, what does not, and NOTHING invented.

Coverage is where a documentation system usually starts lying. The obvious move
is to generate a capability packet for every uncovered file so the number turns
green. That move would be a disaster here, because these packets are injected
into agent context as directives: a generated `canonical` is not a harmless
placeholder, it is a fabricated instruction wearing the system's authority. It
would manufacture hallucination rather than prevent it.

So this module measures and proposes, and never authors.

Three canon states, not two
---------------------------
  capabilityCovered  a capability packet declares a surface covering the file
  bibleClassified    the Bible assigns it a real layer (not "Unknown")
  noCanonAtAll       neither

Collapsing the middle state is what makes a coverage report misleading: a file
the Bible already describes is not undocumented, it is documented somewhere the
resolver cannot reach yet. Being canonically aware means saying which.

Candidates are THEORY, structurally
-----------------------------------
A candidate carries `contract: SCDNA-COVERAGE-CANDIDATE-v1` and `kind: THEORY`,
and deliberately omits `need`/`canonical`/`path`-triple required by
SCDNA-CAPABILITY-v1. That is not a naming convention -- it means
`validate_packet` REJECTS a candidate, so a candidate dropped into
capabilities/ is excluded by the existing loader rather than served. Uncurated
content must not be able to wear a curated badge, which is the rule
capability_store already states about hand-edited packets.

Every field on a candidate is DERIVED and checkable: the path exists, the
atlas's telemetry, the Bible's own classification. A human or agent supplies
the canon afterwards, and the resolver keeps returning THEORY until they do.

Denominator
-----------
The atlas's file list, not the Bible's. The Bible indexes .venv, .worktrees and
a vendored corpus (92.8% of its 227,565 entries carry no layer); a ratio over
that denominator would be arithmetic about nothing.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .capability_store import CAPABILITY_DIR, load_packets, matches_surface

_HERE = Path(__file__).resolve()
REPO_ROOT = _HERE.parents[3]

ATLAS_REL = os.path.join(".atlas", "code-atlas.json")
BIBLE_REL = os.path.join("docs", "scholomance-bible", "bible.json")

CANDIDATE_CONTRACT = "SCDNA-COVERAGE-CANDIDATE-v1"


def _load_atlas_files(repo_root: str) -> tuple[list[dict] | None, str]:
    path = os.path.join(repo_root, ATLAS_REL)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except OSError:
        return None, f"atlas index not found at {path} (npm run atlas:rebuild)"
    except ValueError as exc:
        return None, f"atlas index unreadable: {exc}"
    files = payload.get("files")
    if not isinstance(files, list):
        return None, "atlas index has no files list"
    return files, ""


def _load_bible(repo_root: str) -> tuple[dict[str, dict] | None, str]:
    path = os.path.join(repo_root, BIBLE_REL)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except OSError:
        return None, "bible.json not present"
    except ValueError as exc:
        return None, f"bible.json unreadable: {exc}"
    out: dict[str, dict] = {}
    for e in payload.get("files", []) or []:
        p = e.get("path")
        if p:
            out[p] = e
    return out, ""


def _bible_view(entry: dict | None) -> dict:
    """What the Bible already asserts. `null` layer means it says nothing."""
    if entry is None:
        return {"known": False, "layer": None, "errorCodes": [], "healthCodes": []}
    layer = entry.get("layer")
    if layer == "Unknown":
        layer = None
    return {
        "known": layer is not None,
        "layer": layer,
        "errorCodes": list(entry.get("errorCodes") or []),
        "healthCodes": list(entry.get("healthCodes") or []),
    }


def coverage_report(repo_root: str | None = None, *,
                    capability_dir: str | None = None,
                    limit_candidates: int = 200) -> dict:
    """Measure canon coverage. Proposes candidates; authors nothing."""
    root = os.path.abspath(repo_root or REPO_ROOT)
    directory = Path(capability_dir) if capability_dir else CAPABILITY_DIR

    summary = {
        "files": 0,
        "capabilityCovered": 0,
        "bibleClassified": 0,
        "noCanonAtAll": 0,
        "bibleAvailable": False,
        "unverifiable": False,
    }
    sources: dict[str, str] = {}
    notes: list[str] = []

    atlas_files, atlas_err = _load_atlas_files(root)
    if atlas_files is None:
        summary["unverifiable"] = True
        notes.append(atlas_err)
        return {
            "summary": summary,
            "sources": sources,
            "byDomain": {},
            "coveredSample": [],
            "candidates": [],
            "reason": "; ".join(notes),
        }
    sources["atlas"] = os.path.join(root, ATLAS_REL)

    bible, bible_err = _load_bible(root)
    if bible is None:
        notes.append(bible_err)
        summary["unverifiable"] = True
    else:
        summary["bibleAvailable"] = True
        sources["bible"] = os.path.join(root, BIBLE_REL)

    packets, pkt_errors = load_packets(directory)
    sources["capabilities"] = str(directory)
    if pkt_errors:
        summary["unverifiable"] = True
        notes.append(f"{len(pkt_errors)} capability packet(s) failed to load")

    by_domain: dict[str, int] = {p.get("domain", "?"): 0 for p in packets}
    covered_sample: list[str] = []
    candidates: list[dict] = []

    for rec in atlas_files:
        rel = rec.get("path")
        if not rel:
            continue
        summary["files"] += 1

        owning = [p for p in packets if matches_surface(rel, p)]
        b = _bible_view(bible.get(rel) if bible else None)
        if b["known"]:
            summary["bibleClassified"] += 1

        if owning:
            summary["capabilityCovered"] += 1
            for p in owning:
                by_domain[p.get("domain", "?")] = by_domain.get(p.get("domain", "?"), 0) + 1
            if len(covered_sample) < 200:
                covered_sample.append(rel)
            continue

        if not b["known"]:
            summary["noCanonAtAll"] += 1

        if len(candidates) < limit_candidates:
            # DERIVED ONLY. No need/canonical/evidence/forbidden: those are
            # intent, and intent is not in the filesystem.
            candidates.append({
                "contract": CANDIDATE_CONTRACT,
                "kind": "THEORY",
                "path": rel,
                "derived": {
                    "lang": rec.get("lang"),
                    "lines": rec.get("lines"),
                    "lastCommit": rec.get("lastCommit"),
                    "commits": rec.get("commits"),
                    "pathogens": rec.get("pathogens", 0),
                },
                "bible": b,
                "reason": ("no capability packet declares a surface covering this "
                           "path" + ("" if not b["known"] else
                                     f"; the Bible classifies it as {b['layer']}")),
                "requiresAuthor": ["need", "canonical", "evidence", "forbidden"],
            })

    pct = (100.0 * summary["capabilityCovered"] / summary["files"]) if summary["files"] else 0.0
    notes.insert(0, (
        f"{summary['capabilityCovered']}/{summary['files']} files "
        f"({pct:.1f}%) covered by a capability packet; "
        f"{summary['bibleClassified']} classified by the Bible; "
        f"{summary['noCanonAtAll']} have no canon at all"
    ))

    return {
        "summary": summary,
        "sources": sources,
        "byDomain": dict(sorted(by_domain.items())),
        "coveredSample": covered_sample,
        "candidates": candidates,
        "reason": "; ".join(notes),
    }
