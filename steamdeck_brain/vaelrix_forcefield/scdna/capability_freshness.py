"""SCDNA — freshness: does this packet still describe the code it claims to?

`capability_store` answers two questions already: was this packet hand-edited
(checksum), and does this path belong to it (matches_surface). Neither answers
the third one, and the third is what makes a document living rather than merely
intact.

INTEGRITY IS NOT FRESHNESS. A packet can verify perfectly and be a year out of
date; nothing about a correct checksum implies the described code still looks
that way. `code_atlas` states the same law in its own header — HEAD-equality
alone is not freshness, so it also probes the worktree — and this module holds
to it: a commit-log check ALONE would miss uncommitted drift, so the worktree is
probed too, and that probe is never cached.

Never answers silently
----------------------
Every verdict carries `reason`, and "no git" returns `unverifiable` rather than
`fresh`. Unknown served as fresh is how a stale document keeps its badge.

The bounded-reconciliation law
------------------------------
When a packet drifts, only DERIVED facts may be rewritten mechanically — does
this path still exist, which surfaces moved. The AUTHORED fields (`canonical`,
`evidence`, `forbidden`) encode human intent that no diff contains. An agent
that rewrites those from the changed code is guessing and calling it the user's
design, which is exactly what SEMANTIC_KIND_THEORY_UNBOUND ("do not resolve an
unbound concept to a plausible default") and SEMANTIC_KIND_CLARIFY_UNDERSPECIFIED
("do not resolve a missing slot to a default and emit Do — the soft Do is the
failure this whole architecture exists to prevent") forbid.

So `reconciliation_plan` emits:
  * DO      — mechanical, derived, safe to apply
  * CLARIFY — an authored claim whose subject moved; names the field, and
              deliberately carries NO proposed value. A CLARIFY that suggests
              the answer has become a fabricated Do.
"""

from __future__ import annotations

import fnmatch
import os
import subprocess
from pathlib import Path

AUTHORED_FIELDS = ("canonical", "evidence", "forbidden", "need")
_TIMEOUT = 20


def _git(root: str, *args: str) -> str | None:
    """None means the question could not be asked — never conflated with 'no'."""
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True,
                           text=True, timeout=_TIMEOUT)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    return r.stdout


def _surface_base(surface: str) -> str:
    """The longest literal prefix of a glob — what git can be asked about.

    `git log -- <path>` takes pathspecs, not fnmatch globs, so a surface like
    `a/b/**` is narrowed to `a/b`. Widening beyond the literal prefix would
    make unrelated commits look like drift.
    """
    out = []
    for part in Path(surface).parts:
        if any(ch in part for ch in "*?["):
            break
        out.append(part)
    return str(Path(*out)) if out else ""


def _is_git_repo(root: str) -> bool:
    return _git(root, "rev-parse", "--git-dir") is not None


def freshness(packet: dict, repo_root: str, *, packet_path: str | None = None) -> dict:
    """Verdict on whether `packet` still describes the code under its surfaces.

    The stamp is the packet file's own last commit: the moment someone last
    asserted this description was true. Anything committed under a declared
    surface after that moment is undescribed drift.
    """
    root = os.path.abspath(repo_root)
    verdict = {
        "domain": packet.get("domain"),
        "stale": False,
        "unverifiable": False,
        "stampedAt": None,
        "changedSurfaces": [],
        "commitsBehind": 0,
        "dirty": False,
        "dirtyFiles": [],
        "missingPaths": [],
        "reason": "",
    }

    # -- derived facts need no git; a vanished path is drift on any machine ---
    for cap in packet.get("capabilities", []) or []:
        p = cap.get("path")
        if p and not os.path.exists(os.path.join(root, p)):
            verdict["missingPaths"].append(p)

    if not _is_git_repo(root):
        verdict["unverifiable"] = True
        verdict["stale"] = bool(verdict["missingPaths"])
        verdict["reason"] = (
            "not a git repository: commit-log freshness cannot be established"
            + (f"; {len(verdict['missingPaths'])} declared path(s) missing"
               if verdict["missingPaths"] else "")
        )
        return verdict

    stamp = None
    if packet_path:
        rel = packet_path
        if os.path.isabs(rel):
            try:
                rel = str(Path(rel).resolve().relative_to(Path(root).resolve()))
            except ValueError:
                rel = packet_path
        out = _git(root, "log", "-1", "--format=%H", "--", rel)
        stamp = (out or "").strip() or None
    verdict["stampedAt"] = stamp

    surfaces = packet.get("surfaces", []) or []
    if stamp:
        behind = 0
        for surface in surfaces:
            base = _surface_base(surface)
            if not base:
                continue
            out = _git(root, "log", "--format=%H", f"{stamp}..HEAD", "--", base)
            if out is None:
                verdict["unverifiable"] = True
                continue
            hits = [h for h in out.splitlines() if h.strip()]
            if hits:
                verdict["changedSurfaces"].append(surface)
                behind += len(hits)
        verdict["commitsBehind"] = behind
    else:
        verdict["unverifiable"] = True

    # -- worktree probe: uncommitted drift the log cannot see. Never cached. --
    out = _git(root, "status", "--porcelain")
    if out is None:
        verdict["unverifiable"] = True
    else:
        for line in out.splitlines():
            if len(line) < 4:
                continue
            rel = line[3:].strip().strip('"')
            if " -> " in rel:                      # rename: the destination drifts
                rel = rel.split(" -> ", 1)[1]
            if any(fnmatch.fnmatch(rel, s) for s in surfaces):
                verdict["dirtyFiles"].append(rel)
        verdict["dirty"] = bool(verdict["dirtyFiles"])

    verdict["stale"] = bool(
        verdict["changedSurfaces"] or verdict["missingPaths"] or verdict["dirty"]
    )

    bits = []
    if verdict["changedSurfaces"]:
        bits.append(
            f"{len(verdict['changedSurfaces'])} surface(s) changed in "
            f"{verdict['commitsBehind']} commit(s) since the packet was stamped"
        )
    if verdict["dirtyFiles"]:
        bits.append(f"{len(verdict['dirtyFiles'])} uncommitted file(s) under a surface")
    if verdict["missingPaths"]:
        bits.append(f"{len(verdict['missingPaths'])} declared path(s) no longer exist")
    if verdict["unverifiable"]:
        bits.append("some probes could not be run")
    verdict["reason"] = "; ".join(bits) or "no drift detected under any declared surface"
    return verdict


def reconciliation_plan(packet: dict, repo_root: str, *,
                        packet_path: str | None = None) -> dict:
    """What must happen for this packet to be true again.

    DO      = derived and mechanical.
    CLARIFY = an authored claim whose subject moved. It names the field and
              carries NO proposed value, deliberately: the agent has not read
              the new code yet, and a suggestion at this point would be the
              machine inventing intent and attributing it to the author.
    """
    v = freshness(packet, repo_root, packet_path=packet_path)
    actions: list[dict] = []

    for missing in v["missingPaths"]:
        actions.append({
            "kind": "DO",
            "derived": True,
            "target": missing,
            "instruction": (
                "declared path does not exist; locate the moved file or remove "
                "the capability entry"
            ),
        })

    if v["changedSurfaces"] or v["dirty"]:
        root = os.path.abspath(repo_root)
        stamp = v.get("stampedAt")
        dirty = set(v.get("dirtyFiles") or [])

        for cap in packet.get("capabilities", []) or []:
            cap_path = cap.get("path")
            if not cap_path:
                continue
            # Scope the question to the capability whose OWN subject moved.
            # Asking about a file that never changed trains the reader to
            # dismiss the whole report, which costs more than it catches.
            why = None
            if cap_path in dirty:
                why = "uncommitted changes"
            elif stamp:
                out = _git(root, "log", "--format=%H", f"{stamp}..HEAD", "--", cap_path)
                if out is None:
                    why = "could not be probed"
                elif [h for h in out.splitlines() if h.strip()]:
                    why = f"{len([h for h in out.splitlines() if h.strip()])} commit(s)"
            if not why:
                continue

            for field in AUTHORED_FIELDS:
                if cap.get(field) in (None, "", []):
                    continue
                actions.append({
                    "kind": "CLARIFY",
                    "derived": False,
                    "field": field,
                    "capability": cap.get("need"),
                    "path": cap_path,
                    "question": (
                        f"{cap_path} changed ({why}) since this packet was "
                        f"stamped — read it and confirm whether '{field}' is "
                        f"still true"
                    ),
                })

    return {
        "domain": packet.get("domain"),
        "freshness": v,
        "actions": actions,
        "bounded": True,
    }
