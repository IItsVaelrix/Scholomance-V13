"""Code Atlas — telemetry steroid for the telescope/microscope lenses.

A disk-backed index answering the questions the structural lenses cannot:
what a file IS (Bible glossary: layer, bytecodes, pathogens), whether it
is ALIVE (git vitality: last commit, commit count, churn), and where a
token occurs repo-wide (exhaustive posting lists instead of the capped,
alphabetically-biased _cross_reference walk).

Provenance — 2026-08-12 accuracy ruling
----------------------------------------
Measured against uncapped exhaustive grep, the old walker returned
0.1%–81.5% recall on 12 probes and ended walkFinished=False on all of
them: MAX_REF_FILES_SCANNED=4000 is exhausted inside nlp_chatbot
(~44k files) before the alphabetical walk ever reaches scripts/, src/,
tests/ or steamdeck_brain/. A one-pass token index reproduced the
exhaustive ground truth 12/12 at 0.01–2.6ms per lookup (median 0.02ms,
worst 111ms), vs 1.47s median for the walker. Break-even: 53 queries.

Design laws
-----------
  * DECLARED blind spots, never silent: content is excluded three ways —
    by DIRECTORY (ATLAS_BLIND_SPOTS), by EXTENSION (_INDEX_EXTENSIONS)
    and by SIZE (MAX_INDEX_FILE_BYTES) — and all three are recorded in
    meta (declaredBlindSpots / skippedByExtension / skippedForSize).
    Excluding content is a governance decision; hiding the decision is
    not, and the class of exclusion does not change that.
  * Stamped freshness: meta.builtAtHead records the git HEAD the atlas
    was built from. is_stale() compares it to the live HEAD and reports
    commitsBehind; a lens must surface this, never answer silently.
    HEAD-equality alone is NOT freshness — the atlas indexes files but
    is stamped with a commit, so is_stale() also probes the working tree
    and reports `dirty`/`dirtyFiles`. That probe is never cached, and it
    ignores the atlas's own artifact (see _is_atlas_artifact).
  * Rebuilt, not merely lamented: scripts/atlas_rebuild.py + the
    scripts/git-hooks/post-commit-atlas hook refresh the index after a
    commit, so honest staleness reporting is a backstop and not the
    steady state.
  * Self-integrity: sha256 over the canonical payload (builtAt excluded
    so identical repo state => identical checksum). verify() recomputes.
  * Atomic swap: written via tmp file + os.replace.
  * Determinism: sorted traversal, sorted posting lists, canonical JSON.
  * subprocess is used ONLY for git (build + staleness probes). Nothing
    else spawns; nothing touches the network.

Storage: <project_root>/.atlas/code-atlas.json  (dot-dir => invisible
to every lens walk, so the atlas can never index itself).
"""

from __future__ import annotations

import bisect
import hashlib
import json
import os
import re
import subprocess
import tempfile
from typing import Any

SCHEMA = "CODE-ATLAS-v1"
ATLAS_REL_PATH = os.path.join(".atlas", "code-atlas.json")
BIBLE_JSON_REL_PATH = os.path.join("docs", "scholomance-bible", "bible.json")

# Governance decision (2026-08-12): vendored corpus, not first-party code.
# Indexing it would cost ~85% of the build budget and drown first-party
# signals. Removal from this tuple requires a deliberate re-decision.
ATLAS_BLIND_SPOTS = ("nlp_chatbot",)

# Mirrors code_lens walk hygiene (dot-dirs are skipped by construction).
_IGNORED_DIR_NAMES = {
    "node_modules", ".git", "dist", "dist-ssr", "build", "out", "coverage",
    "__pycache__", ".next", ".cache", ".tmp", ".pytest_cache",
    ".ruff_cache", ".wrangler", ".worktrees", ".claude",
    ".aider.tags.cache.v4", "squashfs-root", ".venv", ".venv-align",
    ".antigravitycli", ".blackboxcli", ".codex", ".cursor", ".grok",
    ".qwen", ".superpowers", ".vscode", ".github", ".atlas",
    ".perturbation-full",
}

_INDEX_EXTENSIONS = {
    ".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
    ".lua", ".sh", ".md", ".json",
}
MAX_INDEX_FILE_BYTES = 1_000_000
MAX_REF_FILES = 200          # per single refs() lookup (bounded output)
MAX_PREFIX_RESULTS = 25
STALENESS_CACHE: dict[str, dict] = {}   # head -> staleness verdict

_TOKEN_RE = re.compile(r"[A-Za-z0-9_$]+")
_HYPHEN_QUERY_RE = re.compile(r"^[A-Za-z0-9_$]+(?:-[A-Za-z0-9_$]+)*$")


# --------------------------------------------------------------------------
# Git probes (the ONLY subprocess use in this module)
# --------------------------------------------------------------------------

def _git(project_root: str, *args: str) -> str | None:
    try:
        proc = subprocess.run(
            ["git", *args], cwd=project_root, capture_output=True,
            text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout


def live_head(project_root: str) -> str | None:
    out = _git(project_root, "rev-parse", "HEAD")
    return out.strip() if out and out.strip() else None


def worktree_dirt(project_root: str) -> tuple[bool, int]:
    """(dirty, changed file count) for the working tree.

    HEAD-equality is not freshness. The atlas is built from FILES, but
    stamped with a COMMIT, so an edited-but-uncommitted tree reports
    commitsBehind=0 while the index no longer matches what is on disk.
    Never cached: dirt changes continuously under a long-lived process.
    """
    out = _git(project_root, "status", "--porcelain")
    if out is None:
        return False, 0
    lines = [ln for ln in out.splitlines()
             if ln.strip() and not _is_atlas_artifact(ln)]
    return bool(lines), len(lines)


def _is_atlas_artifact(status_line: str) -> bool:
    """The atlas must never report ITSELF as working-tree drift.

    .atlas/ is gitignored in this repo, but relying on that would make a
    correct dirt verdict depend on a file the atlas does not own: any repo
    without that ignore rule would read as permanently dirty after a build.
    """
    path = status_line[3:].strip() if len(status_line) > 3 else ""
    if " -> " in path:                       # rename: judge the destination
        path = path.split(" -> ", 1)[1]
    path = path.strip('"')
    if path.startswith("./"):        # NOT lstrip("./") — that eats .atlas's dot
        path = path[2:]
    return path.startswith(".atlas")


def _git_vitality(project_root: str) -> dict[str, dict]:
    """Single-pass whole-history scan: commits, lastCommit, churn per file.

    ~2,700x faster than per-file `git log` (measured 1.6s vs 73min on the
    live repo). Renames are resolved to the NEW path; binary entries (-)
    contribute commit presence but no churn.
    """
    out = _git(project_root, "log", "--pretty=format:@@@%ct", "--numstat")
    vitals: dict[str, dict] = {}
    if out is None:
        return vitals
    current_ts: int | None = None
    touched_this_commit: set[str] = set()
    for line in out.splitlines():
        if line.startswith("@@@"):
            current_ts = int(line[3:] or 0)
            touched_this_commit = set()
            continue
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) != 3 or current_ts is None:
            continue
        adds, dels, rel = parts
        rel = _resolve_numstat_path(rel)
        if rel is None:
            continue
        v = vitals.setdefault(rel, {"commits": 0, "lastCommit": 0, "churn": 0})
        if rel not in touched_this_commit:
            touched_this_commit.add(rel)
            v["commits"] += 1
        if current_ts > v["lastCommit"]:
            v["lastCommit"] = current_ts
        if adds.isdigit() and dels.isdigit():
            v["churn"] += int(adds) + int(dels)
    return vitals


def _resolve_numstat_path(rel: str) -> str | None:
    """Handle git numstat rename notations; return the NEW path."""
    if " => " in rel:
        # form: prefix/{old => new}/suffix  OR  old => new
        if "{" in rel and "}" in rel:
            pre, rest = rel.split("{", 1)
            inner, post = rest.split("}", 1)
            _old, new = inner.split(" => ", 1)
            rel = (pre + new + post).replace("//", "/")
        else:
            _old, rel = rel.split(" => ", 1)
    return rel.strip() or None


# --------------------------------------------------------------------------
# Tokenizer
# --------------------------------------------------------------------------

def _tokens_of(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(text))


def _walk_indexable(project_root: str) -> tuple[list[str], dict[str, Any]]:
    """(sorted relative paths, exclusion census). Blind spots excluded.

    The census exists because a file dropped for its EXTENSION or its SIZE
    is exactly as invisible to a query as one inside a blind-spot directory.
    Declaring only the directory exclusions applied the module's own law to
    one of its three exclusion classes; the other two answered silently.
    """
    root_abs = os.path.abspath(project_root)
    found: list[str] = []
    skipped_ext: dict[str, int] = {}
    skipped_size = 0

    def walk(dir_abs: str) -> None:
        nonlocal skipped_size
        try:
            entries = sorted(os.listdir(dir_abs))
        except OSError:
            return
        for name in entries:
            if name.startswith("."):
                continue
            full = os.path.join(dir_abs, name)
            if os.path.isdir(full):
                if name not in _IGNORED_DIR_NAMES and name not in ATLAS_BLIND_SPOTS:
                    walk(full)
            elif os.path.isfile(full):
                ext = os.path.splitext(name)[1].lower()
                if ext not in _INDEX_EXTENSIONS:
                    key = ext or "(no extension)"
                    skipped_ext[key] = skipped_ext.get(key, 0) + 1
                    continue
                try:
                    if os.path.getsize(full) > MAX_INDEX_FILE_BYTES:
                        skipped_size += 1
                        continue
                except OSError:
                    continue
                found.append(os.path.relpath(full, root_abs).replace(os.sep, "/"))

    walk(root_abs)
    found.sort()
    census = {
        "skippedByExtension": {k: skipped_ext[k] for k in sorted(skipped_ext)},
        "skippedForSize": skipped_size,
    }
    return found, census


# --------------------------------------------------------------------------
# Bible glossary
# --------------------------------------------------------------------------

def _load_glossary(project_root: str) -> tuple[dict[str, dict], dict[str, int]]:
    """(path -> bible record, path -> pathogen count). Empty when absent."""
    glossary: dict[str, dict] = {}
    pathogen_counts: dict[str, int] = {}
    bible_path = os.path.join(project_root, BIBLE_JSON_REL_PATH)
    try:
        with open(bible_path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except (OSError, ValueError):
        return glossary, pathogen_counts
    if not isinstance(payload, dict) or payload.get("schema") != "BIBLE-JSON-v1":
        return glossary, pathogen_counts
    for rec in payload.get("files", []):
        p = rec.get("path")
        if isinstance(p, str):
            glossary[p] = {
                "layer": rec.get("layer", "Unknown"),
                "errorCodes": list(rec.get("errorCodes", [])),
                "healthCodes": list(rec.get("healthCodes", [])),
            }
    for pat in payload.get("pathogens", []):
        p = pat.get("file")
        if isinstance(p, str):
            pathogen_counts[p] = pathogen_counts.get(p, 0) + 1
    return glossary, pathogen_counts


# --------------------------------------------------------------------------
# Canonical checksum
# --------------------------------------------------------------------------

def _canonical(payload: dict) -> str:
    clone = {k: v for k, v in payload.items() if k not in ("checksum",)}
    blob = json.dumps(clone, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def build_atlas(project_root: str, *, out_path: str | None = None) -> dict:
    """Rebuild the atlas from live repo state. Atomic swap at the end.

    Returns a summary dict; {"ok": False, "error": ...} on failure.
    Never raises on repo oddities — an atlas build must not be able to
    break the lenses that depend on it.
    """
    root_abs = os.path.abspath(project_root)
    head = live_head(root_abs)
    if head is None:
        return {"ok": False, "error": "git HEAD unavailable; refusing to build an unstamped atlas."}

    try:
        rel_paths, census = _walk_indexable(root_abs)
        postings: dict[str, list[int]] = {}
        files_out: list[dict] = []
        vitals = _git_vitality(root_abs)
        glossary, pathogen_counts = _load_glossary(root_abs)

        for idx, rel in enumerate(rel_paths):
            full = os.path.join(root_abs, rel.replace("/", os.sep))
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as fh:
                    text = fh.read()
            except OSError:
                continue
            for tok in _tokens_of(text):
                postings.setdefault(tok, []).append(idx)

            rec: dict[str, Any] = {"path": rel}
            g = glossary.get(rel)
            if g:
                rec["layer"] = g["layer"]
                if g["errorCodes"]:
                    rec["errorCodes"] = g["errorCodes"]
                if g["healthCodes"]:
                    rec["healthCodes"] = g["healthCodes"]
            if pathogen_counts.get(rel):
                rec["pathogens"] = pathogen_counts[rel]
            v = vitals.get(rel)
            if v:
                rec["commits"] = v["commits"]
                rec["lastCommit"] = v["lastCommit"]
                rec["churn"] = v["churn"]
            files_out.append(rec)

        files_out.sort(key=lambda r: r["path"])
        path_index = {r["path"]: i for i, r in enumerate(files_out)}
        # Re-map postings onto the sorted file list; drop skipped files.
        sorted_postings: dict[str, list[int]] = {}
        for tok, idxs in postings.items():
            mapped = sorted(path_index[rel_paths[i]] for i in idxs
                            if rel_paths[i] in path_index)
            if mapped:
                sorted_postings[tok] = mapped

        payload = {
            "schema": SCHEMA,
            "builtAtHead": head,
            "files": files_out,
            "postings": {t: sorted_postings[t] for t in sorted(sorted_postings)},
            "meta": {
                "declaredBlindSpots": list(ATLAS_BLIND_SPOTS),
                "indexedExtensions": sorted(_INDEX_EXTENSIONS),
                "maxIndexFileBytes": MAX_INDEX_FILE_BYTES,
                "fileCount": len(files_out),
                "tokenCount": len(sorted_postings),
                **census,
            },
        }
        payload["checksum"] = _canonical(payload)

        dest = out_path or os.path.join(root_abs, ATLAS_REL_PATH)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        fd, tmp = tempfile.mkstemp(
            prefix=".tmp-atlas", dir=os.path.dirname(dest))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, separators=(",", ":"), sort_keys=True)
            os.replace(tmp, dest)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

        return {
            "ok": True,
            "head": head,
            "files": len(files_out),
            "tokens": len(sorted_postings),
            "bytes": os.path.getsize(dest),
            "checksum": payload["checksum"],
            "path": os.path.relpath(dest, root_abs),
        }
    except Exception as exc:  # noqa: BLE001 — build must never raise upward
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


# --------------------------------------------------------------------------
# Read side
# --------------------------------------------------------------------------

_LOAD_CACHE: dict[str, tuple[float, "CodeAtlas"]] = {}


class CodeAtlas:
    """Read-only view over a loaded atlas payload."""

    def __init__(self, payload: dict):
        if payload.get("schema") != SCHEMA:
            raise ValueError(f"unknown atlas schema: {payload.get('schema')!r}")
        self._payload = payload
        self._paths = [r["path"] for r in payload["files"]]
        self._by_path = {r["path"]: r for r in payload["files"]}
        self._tokens = list(payload["postings"].keys())  # already sorted
        self._postings = payload["postings"]

    @property
    def meta(self) -> dict:
        return {
            "schema": self._payload["schema"],
            "builtAtHead": self._payload["builtAtHead"],
            "checksum": self._payload.get("checksum"),
            **self._payload.get("meta", {}),
        }

    # -- integrity ---------------------------------------------------------
    def verify(self) -> bool:
        # Memoized: the payload is immutable once loaded, and lenses call
        # verify() on every invocation.
        cached = getattr(self, "_verify_cache", None)
        if cached is not None:
            return cached
        ok = self._payload.get("checksum") == _canonical(self._payload)
        self._verify_cache = ok  # noqa: SLF001 — instance cache
        return ok

    # -- staleness ---------------------------------------------------------
    def is_stale(self, project_root: str | None = None) -> dict:
        """Compare builtAtHead to the live HEAD. Never answers silently."""
        built_head = self._payload["builtAtHead"]
        root = project_root or getattr(self, "_project_root", None) or os.getcwd()
        head = live_head(root)
        # Probed on every call and never cached — see worktree_dirt().
        dirty, dirty_files = worktree_dirt(root)
        if head is None or head == built_head:
            stale = head is not None and head != built_head
            return {"stale": stale, "unverifiable": head is None,
                    "builtAtHead": built_head, "head": head, "commitsBehind": 0,
                    "dirty": dirty, "dirtyFiles": dirty_files}
        cached = STALENESS_CACHE.get(built_head)
        if cached and cached["head"] == head:
            return {**cached, "dirty": dirty, "dirtyFiles": dirty_files}
        out = _git(root, "rev-list", "--count", f"{built_head}..{head}")
        behind = int(out.strip()) if out and out.strip().isdigit() else -1
        verdict = {"stale": True, "unverifiable": behind < 0,
                   "builtAtHead": built_head, "head": head,
                   "commitsBehind": max(behind, 0)}
        STALENESS_CACHE[built_head] = verdict
        return {**verdict, "dirty": dirty, "dirtyFiles": dirty_files}

    # -- refs --------------------------------------------------------------
    def refs(self, token: str, *, max_files: int = MAX_REF_FILES) -> list[str]:
        """Exhaustive file list for a token (word-boundary semantics).

        Hyphenated queries intersect their runs then verify the literal
        in-file — postings alone cannot prove the hyphenated form exists.
        """
        token = token.strip()
        if not token or not _HYPHEN_QUERY_RE.match(token):
            return []
        runs = token.split("-") if "-" in token else [token]
        posting_lists = [self._postings.get(r) for r in runs]
        if any(p is None for p in posting_lists):
            return []
        idxs = set(posting_lists[0])
        for p in posting_lists[1:]:
            idxs &= set(p)
            if not idxs:
                return []
        candidates = [self._paths[i] for i in sorted(idxs)]
        if len(runs) > 1:
            candidates = [c for c in candidates if self._contains_literal(c, token)]
        return candidates[:max_files]

    def _contains_literal(self, rel_path: str, literal: str) -> bool:
        root = getattr(self, "_project_root", None)
        if root is None:
            return True  # cannot verify without a root; keep the candidate
        try:
            with open(os.path.join(root, rel_path.replace("/", os.sep)),
                      "r", encoding="utf-8", errors="ignore") as fh:
                return literal in fh.read()
        except OSError:
            return False

    def prefix(self, pref: str, *, limit: int = MAX_PREFIX_RESULTS) -> list[str]:
        """Tokens beginning with pref (sorted, bisect-bounded)."""
        pref = pref.strip()
        if not pref:
            return []
        lo = bisect.bisect_left(self._tokens, pref)
        out: list[str] = []
        for i in range(lo, min(lo + limit * 4, len(self._tokens))):
            tok = self._tokens[i]
            if not tok.startswith(pref):
                break
            out.append(tok)
            if len(out) >= limit:
                break
        return out

    # -- telemetry ---------------------------------------------------------
    def file_info(self, rel_path: str) -> dict | None:
        rec = self._by_path.get(rel_path.replace(os.sep, "/"))
        return dict(rec) if rec else None

    def dir_rollup(self, rel_dir: str) -> dict | None:
        """Aggregate telemetry for one subtree: files, layers, age span."""
        rel_dir = rel_dir.replace(os.sep, "/").strip("/")
        if rel_dir == ".":
            rel_dir = ""
        prefix = rel_dir + "/" if rel_dir else ""
        rows = [r for r in self._payload["files"]
                if prefix == "" or r["path"].startswith(prefix)]
        if not rows:
            return None
        by_layer: dict[str, int] = {}
        ages: list[int] = []
        pathogens = 0
        for r in rows:
            by_layer[r.get("layer", "Unknown")] = by_layer.get(r.get("layer", "Unknown"), 0) + 1
            if r.get("lastCommit"):
                ages.append(r["lastCommit"])
            pathogens += r.get("pathogens", 0)
        ages.sort()
        out: dict[str, Any] = {
            "files": len(rows),
            "byLayer": {k: by_layer[k] for k in sorted(by_layer)},
            "pathogens": pathogens,
        }
        if ages:
            mid = ages[len(ages) // 2]
            out["medianLastCommit"] = mid
            out["oldestLastCommit"] = ages[0]
            out["newestLastCommit"] = ages[-1]
        return out


def load_atlas(project_root: str) -> CodeAtlas | None:
    """Lazy load with an mtime cache; None when no atlas exists.

    The cache is keyed on (path, mtime): an atomic rebuild swap invalidates
    it automatically, so a stale process can never serve a superseded atlas.
    """
    root_abs = os.path.abspath(project_root)
    atlas_path = os.path.join(root_abs, ATLAS_REL_PATH)
    try:
        mtime = os.path.getmtime(atlas_path)
    except OSError:
        return None
    cached = _LOAD_CACHE.get(atlas_path)
    if cached and cached[0] == mtime:
        atlas = cached[1]
    else:
        try:
            with open(atlas_path, "r", encoding="utf-8") as fh:
                payload = json.load(fh)
            atlas = CodeAtlas(payload)
        except (OSError, ValueError):
            return None
        _LOAD_CACHE[atlas_path] = (mtime, atlas)
    atlas._project_root = root_abs  # noqa: SLF001 — runtime context stamp
    return atlas


def rebuild_if_stale(project_root: str, *, max_commits_behind: int = 0) -> dict:
    """Convenience: rebuild when the atlas lags the live HEAD.

    Returns {"action": "fresh"|"rebuilt"|"built"|"error", ...}. Bounded:
    refuses to rebuild when the live HEAD itself is unreadable.
    """
    atlas = load_atlas(project_root)
    if atlas is None:
        result = build_atlas(project_root)
        return {"action": "built" if result["ok"] else "error", **result}
    st = atlas.is_stale(project_root)
    if not st["stale"] or st["commitsBehind"] <= max_commits_behind:
        return {"action": "fresh", "commitsBehind": st["commitsBehind"]}
    result = build_atlas(project_root)
    return {"action": "rebuilt" if result["ok"] else "error", **result}
