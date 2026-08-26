"""SCDNA — dating a gene against the code it declares.

`registry.py` sets `retrieval.freshness` to a literal (0.9, 0.95, 0.9) and
`inject.py` refuses to inject a gene below `MIN_FRESHNESS`. Until a gene named
code, nothing that happened in the repo could move that number: the gate was
arithmetic on a constant and could not fire. Declaring `domain.surfaces` is what
turns it into a measurement.

The rules are the ones `capability_freshness` already follows, for the same
reasons:

  * Commit log AND worktree. HEAD-equality alone is not freshness, so
    uncommitted drift under a surface counts and is never cached.
  * Never silent. A gene with no surfaces reports `declared`, never `fresh` --
    silence served as freshness is how a stale directive keeps its authority.
    And a gene that DOES name code but could not be dated reports
    `unverifiable`, which is a third state, not a synonym for the first: the
    literal must not carry it past the gate. See DECLARED/MEASURED/
    UNVERIFIABLE below.
  * No invented precision. A measured gene is stale or it is not; there is no
    per-commit decay curve, because nobody measured one. One commit behind and
    forty read the same, and `commitsBehind` is reported separately for anyone
    who wants to rank.

Proposing surfaces is a separate act from setting them. `propose_surfaces` finds
files that MENTION a gene id -- evidence that they are related -- and returns
them as THEORY. Which code a gene actually governs is intent; a mention is not a
decision, and writing these into the registry automatically would be the machine
choosing what a rule means. See SEMANTIC_KIND_THEORY_UNBOUND.
"""

from __future__ import annotations

import fnmatch
import os
import re
import subprocess
from pathlib import Path

_HERE = Path(__file__).resolve()
REPO_ROOT = _HERE.parents[3]

# Stale means stale. Anything else would be a decay curve nobody measured.
STALE_FRESHNESS = 0.0

# Mirrors code_atlas's walk hygiene. `.claude` matters as much as `.worktrees`:
# it holds worktree CHECKOUTS, so without it the proposer offers the same file
# twice under two paths -- the exact pollution that put 18,395 `.worktrees`
# entries into the Bible.
_SKIP_DIRS = {
    ".git", "node_modules", ".venv", ".venv-align", ".worktrees", "dist",
    "build", "__pycache__", ".pytest_cache", ".atlas", "cache",
    "nlp_chatbot", "squashfs-root", ".claude", ".superpowers", "coverage",
}
_TEXT_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".md", ".json"}
_TIMEOUT = 20

# Where genes are asserted. BOTH files: `load_injection_registry` merges the
# committed JSON registry with the Python defaults, and 10 of the 13 genes it
# yields are named only in compiler.json. Dating those against registry.py
# alone would report "no assertion point" for a gene that has one.
_SCDNA_REL = os.path.join("steamdeck_brain", "vaelrix_forcefield", "scdna")
GENE_REGISTRY_REL = os.path.join(_SCDNA_REL, "registry.py")
GENE_JSON_REL = os.path.join(_SCDNA_REL, "compiler.json")
GENE_SOURCES = (GENE_REGISTRY_REL, GENE_JSON_REL)

# The three states a gate has to keep apart.
#   DECLARED     -- no surfaces, so the gene cannot be dated by design. The
#                   literal stands and the gate passes; blocking here would
#                   mute every gene written before surfaces existed.
#   MEASURED     -- every probe ran. Trust the number.
#   UNVERIFIABLE -- the gene NAMES code but the measurement could not be
#                   completed. Not the same as DECLARED: this gene is claiming
#                   authority over code nobody could date, so its literal must
#                   not carry it past the gate.
DECLARED = "declared"
MEASURED = "measured"
UNVERIFIABLE = "unverifiable"


def _git(root: str, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True,
                           text=True, timeout=_TIMEOUT)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def _surface_base(surface: str) -> str:
    out = []
    for part in Path(surface).parts:
        if any(ch in part for ch in "*?["):
            break
        out.append(part)
    return str(Path(*out)) if out else ""


def _default_stamp(root: str, gene_id: str) -> str | None:
    """The commit where THIS gene was last asserted.

    Not registry.py's last commit. All the genes share that file, so a shared
    stamp launders staleness: edit gene B for any reason and gene A's baseline
    jumps forward past drift that already happened under gene A's surfaces.
    The drift is still there; the measurement just goes blind to it, and gene A
    reads fresh again. `-G` scopes the log to commits whose diff text mentions
    this gene's id, so each gene is dated from its own last edit.

    A gene the registry never mentions has no assertion point at all, and the
    honest answer is that it cannot be dated -- not that it is fine.
    """
    if not gene_id:
        return None
    out = _git(root, "log", "-1", "--format=%H", f"-G{re.escape(gene_id)}",
               "--", *GENE_SOURCES)
    return (out or "").strip() or None


def gene_freshness(gene, repo_root: str | None = None, *,
                   stamp: str | None = None) -> dict:
    """Date one gene against its declared surfaces.

    `stamp` is the commit the gene was last asserted true at. Genes share two
    files rather than getting one apiece, so the caller may supply it; absent
    one it is derived per gene from those files' history -- see
    `_default_stamp` for why per gene and not per file.
    """
    root = os.path.abspath(repo_root or REPO_ROOT)
    surfaces = list(getattr(gene.domain, "surfaces", []) or [])
    declared = float(gene.retrieval.freshness)

    v = {
        "geneId": gene.identity.stableId,
        "basis": DECLARED,
        "declared": declared,
        "measured": declared,
        "stale": False,
        "unverifiable": True,
        "surfaces": surfaces,
        "changedSurfaces": [],
        "commitsBehind": 0,
        "dirty": False,
        "dirtyFiles": [],
        "stampedAt": stamp,
        "reason": "",
    }

    if not surfaces:
        v["reason"] = (
            "gene declares no surfaces, so it cannot be dated; freshness is "
            "the literal it was written with and nothing in the repo can "
            "lower it"
        )
        return v

    # From here the gene NAMES code. Anything that stops the measurement is
    # `unverifiable`, never `declared` -- see the state comment above.
    if _git(root, "rev-parse", "--git-dir") is None:
        v["basis"] = UNVERIFIABLE
        v["reason"] = ("not a git repository: the gene declares surfaces but "
                       "freshness cannot be established")
        return v

    if stamp is None:
        stamp = _default_stamp(root, gene.identity.stableId)
        v["stampedAt"] = stamp
    if stamp is None:
        v["basis"] = UNVERIFIABLE
        v["reason"] = (
            f"no commit in {' or '.join(GENE_SOURCES)} mentions "
            f"{gene.identity.stableId}, so there is no stamp to date it from"
        )
        return v

    unverifiable = False
    behind = 0
    for surface in surfaces:
        base = _surface_base(surface)
        if not base:
            continue
        out = _git(root, "log", "--format=%H", f"{stamp}..HEAD", "--", base)
        if out is None:
            unverifiable = True
            continue
        hits = [h for h in out.splitlines() if h.strip()]
        if hits:
            v["changedSurfaces"].append(surface)
            behind += len(hits)
    v["commitsBehind"] = behind

    # Uncommitted drift the log cannot see. Never cached.
    out = _git(root, "status", "--porcelain")
    if out is None:
        unverifiable = True
    else:
        for line in out.splitlines():
            if len(line) < 4:
                continue
            rel = line[3:].strip().strip('"')
            if " -> " in rel:
                rel = rel.split(" -> ", 1)[1]
            if any(fnmatch.fnmatch(rel, s) for s in surfaces):
                v["dirtyFiles"].append(rel)
        v["dirty"] = bool(v["dirtyFiles"])

    # A probe that failed leaves a hole in the answer. Reporting the surviving
    # probes as a MEASURED result would present a partial check as a complete
    # one, which is the same fail-open in a smaller frame.
    v["basis"] = UNVERIFIABLE if unverifiable else MEASURED
    v["unverifiable"] = unverifiable
    v["stale"] = bool(v["changedSurfaces"] or v["dirty"])
    v["measured"] = STALE_FRESHNESS if v["stale"] else declared

    bits = []
    if v["changedSurfaces"]:
        bits.append(f"{len(v['changedSurfaces'])} surface(s) changed in "
                    f"{behind} commit(s) since the gene was stamped")
    if v["dirtyFiles"]:
        bits.append(f"{len(v['dirtyFiles'])} uncommitted file(s) under a surface")
    if unverifiable:
        bits.append("some probes could not be run")
    v["reason"] = "; ".join(bits) or "no drift under any declared surface"
    return v


def propose_surfaces(gene_id: str, repo_root: str | None = None, *,
                     limit: int = 40) -> dict:
    """Files that MENTION this gene id, as THEORY candidates.

    A mention is evidence of a relationship, not a decision about one. A gene
    named in a test governs the code under test, not the test; a gene named in
    a doc governs neither. Choosing the globs is the author's act, so this
    returns candidates and writes nothing.
    """
    root = Path(os.path.abspath(repo_root or REPO_ROOT))
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{3,}", gene_id or ""):
        return {"geneId": gene_id, "kind": "THEORY", "candidates": [],
                "reason": "not a gene-id shape; nothing searched"}

    hits: list[dict] = []
    for path in root.rglob("*"):
        if len(hits) >= limit:
            break
        if not path.is_file() or path.suffix not in _TEXT_SUFFIXES:
            continue
        if any(part in _SKIP_DIRS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if gene_id not in text:
            continue
        rel = path.relative_to(root).as_posix()
        line = next((i + 1 for i, l in enumerate(text.splitlines())
                     if gene_id in l), None)
        gene_surfaces_written = True
        hits.append({
            "path": rel,
            "evidence": f"names {gene_id} at line {line}",
            "isTest": "test" in rel.lower() or rel.startswith("tests/"),
        })

    return {
        "geneId": gene_id,
        "kind": "THEORY",
        "candidates": hits,
        "requiresAuthor": ["surfaces"],
        "reason": (
            f"{len(hits)} file(s) mention {gene_id}; a mention is evidence of a "
            "relationship, not a decision about which code the gene governs — "
            "an author must choose the globs"
        ) if hits else f"no file mentions {gene_id}",
    }


def effective_freshness(gene, repo_root: str | None = None, *,
                        stamp: str | None = None) -> dict:
    """The number a gate should use: measured where possible, declared where not.

    Kept separate from `gene_freshness` so the caller can always see WHICH it
    got. A gate that cannot tell a measurement from a literal is back to the
    original defect with extra machinery bolted beside it.

    `gateable` is the part a caller cannot reconstruct from `value`: an
    UNVERIFIABLE gene still carries a declared literal, and a gate that reads
    only the number will happily wave it through.
    """
    v = gene_freshness(gene, repo_root, stamp=stamp)
    return {
        "value": v["measured"] if v["basis"] == MEASURED else v["declared"],
        "basis": v["basis"],
        "gateable": v["basis"] in (MEASURED, DECLARED),
        "stale": v["stale"],
        "unverifiable": v["unverifiable"],
        "reason": v["reason"],
    }
