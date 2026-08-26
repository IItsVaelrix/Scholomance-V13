#!/usr/bin/env python3
"""Capability falsifier — does every claim a packet makes still hold?

A capability packet is a machine for producing confident wrong answers if it is
allowed to age. A packet that says cmudict.0.7a after someone moves that file is
worse than no packet at all. This is the gate that keeps the toolbox honest.

Three independent claims are checked, because a packet can rot in three ways:

  1. PATHS      — every capabilities[].path resolves.
  2. SURFACES   — every surfaces[] glob still matches at least one real file.
                  This one is the quiet killer: a surface glob is the packet's
                  only trigger, so a renamed directory does not produce a wrong
                  answer, it produces SILENCE — the hook simply stops firing,
                  which is indistinguishable from "no packet applies here".
                  A gate written to enforce "never fail silently" that cannot
                  see its own trigger rot is not enforcing it.
  3. SYMBOLS    — the packet tells the reader to use `CmuPhonemeEngine`, not
                  merely to open a file. Delete the function and keep the file
                  and a path-only gate stays green while the packet lies.

Usage:
  python scripts/verify_capabilities.py          # all packets
  npm run verify:capabilities

Exit code is non-zero if any of those claims has stopped being true.
"""
from __future__ import annotations

import fnmatch
import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "steamdeck_brain"))

from vaelrix_forcefield.scdna.capability_store import (  # noqa: E402
    REPO_ROOT, load_packets, matches_surface,
)

# Directories a surface glob will never legitimately point into, skipped so the
# walk stays cheap enough to run on every commit.
# "worktrees" earns its place: .claude/worktrees holds full repo copies, so a
# surface can otherwise "resolve" against a checkout that is not this tree.
_WALK_SKIP = {".git", "node_modules", "__pycache__", ".venv", "dist", "build",
              "worktrees"}

_WILDCARD = re.compile(r"[*?\[]")


def check_packets(packets: list[dict]) -> list[str]:
    """Dead-path errors, human-readable. Empty list means every claim resolves."""
    errors: list[str] = []
    for packet in packets:
        for cap in packet.get("capabilities", []):
            path = cap.get("path")
            if not path:
                continue
            if not (REPO_ROOT / path).exists():
                errors.append(
                    f"{packet['domain']}: '{cap['need']}' names {path!r}, which does not exist. "
                    f"The packet is claiming something untrue."
                )
    return errors


def _surface_base(surface: str) -> str:
    """The literal directory prefix before the first wildcard, so a surface can
    be resolved by walking a subtree instead of the whole repo."""
    parts = surface.split("/")
    literal = []
    for part in parts[:-1]:
        if _WILDCARD.search(part):
            break
        literal.append(part)
    return "/".join(literal)


def _surface_resolves(surface: str) -> bool:
    """Does this glob match at least one real file?

    Deliberately answered with matches_surface — the SAME predicate the live
    hook uses — rather than a second globber written for the gate. Two globbers
    can disagree, and if they do, this gate goes green for a surface that never
    fires: the exact silent failure it exists to catch.
    """
    if not _WILDCARD.search(surface):
        return (REPO_ROOT / surface).exists()

    base = REPO_ROOT / _surface_base(surface)
    if not base.is_dir():
        return False
    probe = {"surfaces": [surface]}
    for path in base.rglob("*"):
        if any(part in _WALK_SKIP for part in path.parts):
            continue
        if not path.is_file():
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        if matches_surface(rel, probe):
            return True
    return False


def check_surfaces(packets: list[dict]) -> list[str]:
    """Surface globs that match nothing. A packet whose surfaces have rotted is
    not a wrong packet — it is an ABSENT one, which is strictly harder to
    notice, because silence is what a correctly-scoped packet also produces."""
    errors: list[str] = []
    for packet in packets:
        for surface in packet.get("surfaces", []):
            if not _surface_resolves(surface):
                errors.append(
                    f"{packet.get('domain', '?')}: surface {surface!r} matches no file in "
                    f"the repo. The packet cannot fire — and a packet that never fires is "
                    f"indistinguishable from one that does not apply."
                )
    return errors


# An identifier we are CONFIDENT is a code symbol rather than an English word.
# `canonical` is prose ("CmuPhonemeEngine (codex/core/...) reads this file;
# align_lyrics.py _span_weight reads it directly"), so extraction must be
# conservative: a false alarm trains people to ignore the gate, which is worse
# than a miss. Only four unambiguously code-shaped forms qualify:
#   _span_weight   leading-underscore snake_case
#   MMS_FA         ALL_CAPS containing an underscore
#   runG2PJury     an internal capital AFTER a lowercase run
#   Syllabifier    a single Capitalised word of 3+ letters, not a known noun
# Plain lowercase words ("reads", "demucs", "grid") never qualify, so ordinary
# prose contributes no candidates at all.
#
# The camelCase run is `[a-z0-9]+`, NOT `*`. With `*` the lowercase run could
# match empty, so every all-caps acronym satisfied the pattern -- "ONCE" parsed
# as O + "" + N + "CE". Measured against the shipped packets that admitted
# ONCE, JSON, HMM, IDF, OOV, BT, ET and PB as symbol candidates, and the gate
# duly reported "ONCE" as a dead symbol in turboquant_service.py. A gate that
# cries wolf is a gate nobody reads, so the run is mandatory. The cost is that
# a genuinely all-caps identifier without an underscore is no longer a
# candidate; ALL_CAPS_WITH_UNDERSCORE still is, and that is the shape the real
# constants in this repo use (ART_FAMILIES, MMS_FA, IMAGE_ONLY_PDF).
_SYMBOL_PATTERNS = [
    re.compile(r"\b_[a-z][A-Za-z0-9_]*\b"),
    re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b"),
    re.compile(r"\b[A-Za-z][a-z0-9]+[A-Z][A-Za-z0-9]*\b"),
    re.compile(r"\b[A-Z][a-z]{2,}\b"),
]

# A single Capitalised word is the weakest of the four shapes: a class name and
# a technology proper noun are identical in form, and architectural prose is
# full of the latter. Measured on the shipped packets, this pattern yielded
# Node, Python and Rayleigh (prose) alongside Sigil and Syllabifier (symbols) --
# under 50% precision, which does not meet "only a confident miss is an error".
#
# The exclusion is a DECLARED list rather than a silent heuristic, for the same
# reason code_atlas declares its blind spots: excluding content is a governance
# decision, and hiding the decision is not. Adding a name here is a deliberate
# act, and the list is exported so a test can audit it.
PROSE_NOUNS = frozenset({
    # languages / runtimes / formats
    "Node", "Python", "Java", "Rust", "Bash", "Shell", "Regex", "Unicode",
    # libraries and products named in prose
    "React", "Redis", "Fastify", "Vite", "Playwright", "Vitest", "Pytest",
    "Textual", "Phaser", "Blender", "Godot", "Chrome", "Firefox",
    # maths / stats named after people or concepts
    "Rayleigh", "Gaussian", "Markov", "Viterbi", "Bayes", "Fourier",
    # ordinary capitalised prose that is not a symbol
    "The", "This", "That", "These", "Those", "When", "Where", "While",
    "Every", "Only", "Never", "Always", "Both", "Each", "None", "Note",
    "Uses", "Used", "Reads", "Writes", "Keeps", "Talks", "Spawns",
})
# Path-ish tokens named in the prose: `CmuPhonemeEngine` lives in the .js file
# the prose points at, NOT in the packet's `path` (which is a cmudict data
# file). Searching only `path` would fire on every capability of that shape.
_PATH_TOKEN = re.compile(r"\b[\w./-]+\.(?:py|js|mjs|cjs|ts|tsx|jsx)\b")
# Prose also names sibling modules WITHOUT an extension: the career-ats packet
# says "build-suggestions produces requiresUserApproval:true objects", and
# build-suggestions.ts is a real file next to the packet's own path. Because a
# bare name does not match _PATH_TOKEN, the gate searched only the packet path
# and reported a live symbol dead. A kebab/snake name of two or more segments is
# specific enough to resolve without dragging in ordinary prose words.
_BARE_MODULE = re.compile(r"\b[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+\b")
_TEXT_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"}


def _candidate_symbols(canonical: str) -> set[str]:
    prose = _PATH_TOKEN.sub(" ", canonical)      # drop filenames before matching
    found: set[str] = set()
    for pattern in _SYMBOL_PATTERNS:
        found.update(pattern.findall(prose))
    return {s for s in found if s not in PROSE_NOUNS}


def _search_files(cap: dict) -> list[Path]:
    """Where a symbol named by this capability could legitimately live: the
    packet's own path, plus any source file the prose points at."""
    names = [cap.get("path", "")] + _PATH_TOKEN.findall(cap.get("canonical", ""))
    files: list[Path] = []
    for name in names:
        if not name:
            continue
        candidate = REPO_ROOT / name
        if candidate.is_file() and candidate.suffix in _TEXT_SUFFIXES:
            files.append(candidate)
            continue
        # Prose may name a file by basename alone ("align_lyrics.py _span_weight").
        # Search EVERY match, not just an unambiguous one: a symbol found in any
        # of them is a symbol that exists, and demanding uniqueness caused a real
        # false alarm here — a stale checkout under .claude/worktrees made
        # align_lyrics.py ambiguous, so _span_weight was reported missing while
        # sitting in the file two lines of prose away.
        if "/" not in name and Path(name).suffix in _TEXT_SUFFIXES:
            files.extend(p for p in REPO_ROOT.rglob(name)
                         if not any(part in _WALK_SKIP for part in p.parts))

    # Sibling modules the prose names without an extension. Resolved next to the
    # packet's own path first -- "build-suggestions" in a capability about
    # apply-suggestions.ts means the file beside it, not a same-named module in
    # some unrelated tree.
    own = cap.get("path", "")
    sibling_dir = (REPO_ROOT / own).parent if own else None
    for bare in _BARE_MODULE.findall(cap.get("canonical", "")):
        if sibling_dir is None or not sibling_dir.is_dir():
            break
        for suffix in _TEXT_SUFFIXES:
            candidate = sibling_dir / f"{bare}{suffix}"
            if candidate.is_file() and candidate not in files:
                files.append(candidate)
    return files


def check_symbols(packets: list[dict]) -> list[str]:
    """Symbols a packet names that no longer exist in any file it points at.

    The verifier stats the FILE; the packet claims the SYMBOL. Only a confident
    miss is an error: if no searchable source file can be identified, or no
    code-shaped candidate can be extracted, this says nothing rather than
    guessing — a gate that cries wolf is a gate nobody reads.
    """
    errors: list[str] = []
    for packet in packets:
        for cap in packet.get("capabilities", []):
            symbols = _candidate_symbols(cap.get("canonical", ""))
            if not symbols:
                continue
            files = _search_files(cap)
            if not files:
                continue
            blobs = []
            for f in files:
                try:
                    blobs.append(f.read_text(encoding="utf-8", errors="replace"))
                except OSError:
                    continue
            if not blobs:
                continue
            # Case-insensitive, because prose names a concept while code names
            # an identifier: the career-ats packet says "per-token logProb
            # signals" and index.js returns `perTokenLogProbByLine`. A miss that
            # a single capital would resolve is not a confident miss, and this
            # gate reports only confident misses.
            lowered = [b.lower() for b in blobs]
            for symbol in sorted(symbols):
                if not any(symbol.lower() in blob for blob in lowered):
                    where = ", ".join(str(f.relative_to(REPO_ROOT)) for f in files)
                    errors.append(
                        f"{packet.get('domain', '?')}: '{cap.get('need')}' tells the reader to "
                        f"use {symbol!r}, which appears in none of {where}. The file still "
                        f"exists, so the path check passes — but the packet is naming "
                        f"something that is gone."
                    )
    return errors


def main(argv: list[str] | None = None) -> int:
    packets, load_errors = load_packets()
    for err in load_errors:
        print(f"  LOAD  {err}")
    dead = check_packets(packets)
    for err in dead:
        print(f"  DEAD  {err}")
    rotted = check_surfaces(packets)
    for err in rotted:
        print(f"  MUTE  {err}")
    lying = check_symbols(packets)
    for err in lying:
        print(f"  GONE  {err}")
    print(f"\n{len(packets)} packet(s) loaded, "
          f"{sum(len(p['capabilities']) for p in packets)} capabilities, "
          f"{sum(len(p.get('surfaces', [])) for p in packets)} surfaces, "
          f"{len(dead)} dead path(s), {len(rotted)} mute surface(s), "
          f"{len(lying)} missing symbol(s), {len(load_errors)} load error(s)")
    return 1 if (dead or rotted or lying or load_errors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
