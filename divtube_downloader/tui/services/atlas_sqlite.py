"""SQLite backend for the Code Atlas — same answers, without loading 14MB.

Why this exists
---------------
The JSON atlas is a 14MB index that must be deserialized in full before it
can answer a single question. Measured on this repo (6,778 files / 201,953
token postings): 345-890ms and ~151MB peak RSS per process, whether the
caller wants one token's refs or the whole rollup.

For the cockpit that cost is paid once — `load_atlas` caches per process.
The caller it actually hurts is the short-lived one: `scripts/lens_cli.py`
pays the full parse for every single invocation.

This backend keeps the JSON atlas as the source of truth and derives an
index from it. It answers `refs`, `prefix`, `file_info`, `dir_rollup` and
`meta` identically — enforced by differential test against the JSON
backend over the real repo atlas, not against hand-written expectations.

What is NOT traded away
-----------------------
`verify()` still RECOMPUTES the sha256 over the canonical payload, exactly
as the JSON backend does, and is memoized per instance the same way. A
checksum that merely compares two values both stored in the artifact it is
checking would be a check that cannot fail; this module does not ship one.
The cost of that honesty is real and is documented on `verify()` itself.

Ordering note: Python sorts str by code point and SQLite's default BINARY
collation compares UTF-8 bytes. UTF-8 preserves code-point order, so the
two agree and `prefix()` can use an index range scan.
"""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from typing import Any

from . import code_atlas
from .code_atlas import (
    MAX_PREFIX_RESULTS,
    MAX_REF_FILES,
    SCHEMA,
    _HYPHEN_QUERY_RE,
    iso_from_unix,
)

SQLITE_REL_PATH = os.path.join(".atlas", "code-atlas.sqlite3")
USER_VERSION = 1


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def build_sqlite(payload: dict, db_path: str) -> dict:
    """Derive a sqlite index from a loaded JSON payload. Atomic swap.

    The payload stays authoritative: everything here is reconstructible
    from it, including the byte-exact file records, so `verify()` can
    recompute the original checksum without consulting the JSON again.
    """
    if payload.get("schema") != SCHEMA:
        raise ValueError(f"unknown atlas schema: {payload.get('schema')!r}")

    parent = os.path.dirname(os.path.abspath(db_path)) or "."
    os.makedirs(parent, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".atlas-sqlite-", dir=parent)
    os.close(fd)
    os.unlink(tmp_path)

    con = sqlite3.connect(tmp_path)
    try:
        con.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE files (
                idx    INTEGER PRIMARY KEY,
                path   TEXT NOT NULL UNIQUE,
                record TEXT NOT NULL
            );
            CREATE TABLE tokens (token TEXT PRIMARY KEY);
            CREATE TABLE postings (
                token TEXT NOT NULL,
                idx   INTEGER NOT NULL
            );
            """
        )

        # Records are stored with the SAME canonical separators the checksum
        # uses, so reconstruction is byte-identical rather than merely equal.
        con.executemany(
            "INSERT INTO files (idx, path, record) VALUES (?, ?, ?)",
            [
                (i, rec["path"], json.dumps(rec, sort_keys=True, separators=(",", ":")))
                for i, rec in enumerate(payload["files"])
            ],
        )

        postings: dict[str, list[int]] = payload["postings"]
        con.executemany(
            "INSERT INTO tokens (token) VALUES (?)",
            [(t,) for t in postings],
        )
        con.executemany(
            "INSERT INTO postings (token, idx) VALUES (?, ?)",
            ((tok, i) for tok, idxs in postings.items() for i in idxs),
        )
        con.execute("CREATE INDEX idx_postings_token ON postings (token, idx)")

        meta_rows = [
            ("schema", payload["schema"]),
            ("builtAtHead", payload["builtAtHead"]),
            ("checksum", payload.get("checksum") or ""),
            ("meta", json.dumps(payload.get("meta", {}), sort_keys=True,
                                separators=(",", ":"))),
        ]
        con.executemany("INSERT INTO meta (key, value) VALUES (?, ?)", meta_rows)
        con.execute(f"PRAGMA user_version = {USER_VERSION}")
        con.commit()
        con.execute("VACUUM")
        con.commit()
    finally:
        con.close()

    os.replace(tmp_path, db_path)
    return {
        "ok": True,
        "path": db_path,
        "files": len(payload["files"]),
        "tokens": len(payload["postings"]),
        "bytes": os.path.getsize(db_path),
    }


def build_from_json(project_root: str, *, db_path: str | None = None) -> dict:
    """Read the JSON atlas once and derive the sqlite index from it."""
    root_abs = os.path.abspath(project_root)
    json_path = os.path.join(root_abs, code_atlas.ATLAS_REL_PATH)
    if not os.path.exists(json_path):
        return {"ok": False, "error": "atlas-not-built", "path": json_path}
    with open(json_path, "r", encoding="utf-8") as fh:
        payload = json.load(fh)
    return build_sqlite(payload, db_path or os.path.join(root_abs, SQLITE_REL_PATH))


# --------------------------------------------------------------------------
# Read
# --------------------------------------------------------------------------

class SqliteAtlas:
    """Read-only view with the same surface as code_atlas.CodeAtlas."""

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        row = self._con.execute(
            "SELECT value FROM meta WHERE key = 'schema'").fetchone()
        if row is None or row[0] != SCHEMA:
            raise ValueError(f"unknown atlas schema: {row and row[0]!r}")
        self._meta_rows = {
            k: v for k, v in self._con.execute("SELECT key, value FROM meta")
        }

    # -- meta --------------------------------------------------------------
    @property
    def meta(self) -> dict:
        return {
            "schema": self._meta_rows["schema"],
            "builtAtHead": self._meta_rows["builtAtHead"],
            "checksum": self._meta_rows.get("checksum") or None,
            **json.loads(self._meta_rows.get("meta") or "{}"),
        }

    # -- integrity ---------------------------------------------------------
    def verify(self) -> bool:
        """Recompute the sha256 over the canonical payload. Memoized.

        This deliberately reads the whole index. Comparing a stored checksum
        against another stored value would always pass and would prove
        nothing; the guarantee the JSON backend makes is that the checksum
        is recomputed FROM the data, and that guarantee is kept here.

        Callers on a hot path should call this once per process, exactly as
        the JSON backend's own memoization assumes.
        """
        cached = getattr(self, "_verify_cache", None)
        if cached is not None:
            return cached
        stored = self._meta_rows.get("checksum") or None
        ok = stored == code_atlas._canonical(self._reconstruct_payload())
        self._verify_cache = ok
        return ok

    def _reconstruct_payload(self) -> dict:
        files = [
            json.loads(r[0])
            for r in self._con.execute("SELECT record FROM files ORDER BY idx")
        ]
        postings: dict[str, list[int]] = {}
        for tok, idx in self._con.execute(
                "SELECT token, idx FROM postings ORDER BY token, idx"):
            postings.setdefault(tok, []).append(idx)
        return {
            "schema": self._meta_rows["schema"],
            "builtAtHead": self._meta_rows["builtAtHead"],
            "files": files,
            "meta": json.loads(self._meta_rows.get("meta") or "{}"),
            "postings": postings,
        }

    # -- staleness ---------------------------------------------------------
    def is_stale(self, project_root: str | None = None) -> dict:
        """Identical semantics to the JSON backend, including the uncached
        worktree probe — freshness is not a thing to memoize."""
        built_head = self._meta_rows["builtAtHead"]
        root = project_root or getattr(self, "_project_root", None) or os.getcwd()
        head = code_atlas.live_head(root)
        dirty, dirty_files = code_atlas.worktree_dirt(root)
        if head is None or head == built_head:
            stale = head is not None and head != built_head
            return {"stale": stale, "unverifiable": head is None,
                    "builtAtHead": built_head, "head": head, "commitsBehind": 0,
                    "dirty": dirty, "dirtyFiles": dirty_files}
        cached = code_atlas.STALENESS_CACHE.get(built_head)
        if cached and cached["head"] == head:
            return {**cached, "dirty": dirty, "dirtyFiles": dirty_files}
        out = code_atlas._git(root, "rev-list", "--count", f"{built_head}..{head}")
        behind = int(out.strip()) if out and out.strip().isdigit() else -1
        verdict = {"stale": True, "unverifiable": behind < 0,
                   "builtAtHead": built_head, "head": head,
                   "commitsBehind": max(behind, 0)}
        code_atlas.STALENESS_CACHE[built_head] = verdict
        return {**verdict, "dirty": dirty, "dirtyFiles": dirty_files}

    # -- refs --------------------------------------------------------------
    def refs(self, token: str, *, max_files: int = MAX_REF_FILES) -> list[str]:
        token = token.strip()
        if not token or not _HYPHEN_QUERY_RE.match(token):
            return []
        runs = token.split("-") if "-" in token else [token]

        idxs: set[int] | None = None
        for run in runs:
            rows = self._con.execute(
                "SELECT idx FROM postings WHERE token = ?", (run,)).fetchall()
            if not rows:
                return []  # a run with no posting list kills the whole query
            got = {r[0] for r in rows}
            idxs = got if idxs is None else (idxs & got)
            if not idxs:
                return []

        ordered = sorted(idxs)
        candidates = [self._path_of(i) for i in ordered]
        candidates = [c for c in candidates if c is not None]
        if len(runs) > 1:
            candidates = [c for c in candidates if self._contains_literal(c, token)]
        return candidates[:max_files]

    def _path_of(self, idx: int) -> str | None:
        row = self._con.execute(
            "SELECT path FROM files WHERE idx = ?", (idx,)).fetchone()
        return row[0] if row else None

    def _contains_literal(self, rel_path: str, literal: str) -> bool:
        root = getattr(self, "_project_root", None)
        if root is None:
            return True
        try:
            with open(os.path.join(root, rel_path.replace("/", os.sep)),
                      "r", encoding="utf-8", errors="ignore") as fh:
                return literal in fh.read()
        except OSError:
            return False

    def prefix(self, pref: str, *, limit: int = MAX_PREFIX_RESULTS) -> list[str]:
        """Index range scan, stopping at the first non-match — the same walk
        the JSON backend does with bisect over its sorted token list."""
        pref = pref.strip()
        if not pref:
            return []
        out: list[str] = []
        cur = self._con.execute(
            "SELECT token FROM tokens WHERE token >= ? ORDER BY token", (pref,))
        for (tok,) in cur:
            if not tok.startswith(pref):
                break
            out.append(tok)
            if len(out) >= limit:
                break
        cur.close()
        return out

    # -- telemetry ---------------------------------------------------------
    def file_info(self, rel_path: str) -> dict | None:
        row = self._con.execute(
            "SELECT record FROM files WHERE path = ?",
            (rel_path.replace(os.sep, "/"),)).fetchone()
        if row is None:
            return None
        out = json.loads(row[0])
        iso = iso_from_unix(out.get("lastCommit"))
        if iso:
            out["lastCommitIso"] = iso
        return out

    def dir_rollup(self, rel_dir: str) -> dict | None:
        rel_dir = rel_dir.replace(os.sep, "/").strip("/")
        if rel_dir == ".":
            rel_dir = ""
        prefix = rel_dir + "/" if rel_dir else ""
        if prefix:
            cur = self._con.execute(
                "SELECT record FROM files WHERE substr(path, 1, ?) = ? ORDER BY idx",
                (len(prefix), prefix))
        else:
            cur = self._con.execute("SELECT record FROM files ORDER BY idx")

        by_layer: dict[str, int] = {}
        ages: list[int] = []
        pathogens = 0
        count = 0
        for (blob,) in cur:
            r = json.loads(blob)
            count += 1
            layer = r.get("layer", "Unknown")
            by_layer[layer] = by_layer.get(layer, 0) + 1
            if r.get("lastCommit"):
                ages.append(r["lastCommit"])
            pathogens += r.get("pathogens", 0)
        if not count:
            return None

        ages.sort()
        out: dict[str, Any] = {
            "files": count,
            "byLayer": {k: by_layer[k] for k in sorted(by_layer)},
            "pathogens": pathogens,
        }
        if ages:
            mid = ages[len(ages) // 2]
            out["medianLastCommit"] = mid
            out["oldestLastCommit"] = ages[0]
            out["newestLastCommit"] = ages[-1]
            out["medianLastCommitIso"] = iso_from_unix(mid)
            out["oldestLastCommitIso"] = iso_from_unix(ages[0])
            out["newestLastCommitIso"] = iso_from_unix(ages[-1])
        return out

    def close(self) -> None:
        self._con.close()


def load_sqlite_atlas(project_root: str) -> SqliteAtlas | None:
    """None when no sqlite index exists — callers fall back to JSON."""
    root_abs = os.path.abspath(project_root)
    db_path = os.path.join(root_abs, SQLITE_REL_PATH)
    if not os.path.exists(db_path):
        return None
    try:
        atlas = SqliteAtlas(db_path)
    except (sqlite3.Error, ValueError):
        return None
    atlas._project_root = root_abs
    return atlas
