"""Durable episodes in the MCP's own SQLite database.

Opens scholomance_collab.sqlite DIRECTLY rather than through
scholomance-bridge.mjs: _run_bridge spawns a fresh node process per call
(bridge_dispatch.py), and that cost cannot sit in the hot path of a lens whose
whole virtue is being in-process. Safe because the DB already runs WAL with a
busy_timeout (codex/server/db/sqlite.migrations.js) — but ONLY when the collab
layer is actually pointed at that local file. If TURSO_COLLAB_DB_URL is set,
collab.persistence.js talks to a REMOTE Turso database instead
(collab.persistence.js:360-366) and a local sqlite3 connection here would be
reading and writing a disconnected, split-brain copy. The constructor checks
for that env var and disables itself rather than risk it — Turso support is
an explicit non-goal (see PDR §2 item 9).

This module NEVER creates the table. Schema authority stays with the JS
migration list; a missing table means the ledger is disabled, not that Python
should invent one.
"""

import hashlib
import json
import os
import sqlite3
import threading
import uuid

MAX_RESULT_BYTES = 32768   # a UTF-8 BYTE budget — see _truncate_utf8
SOFT_PRUNE_ROWS = 50_000    # bodies nulled past this row count
HARD_PRUNE_ROWS = 500_000   # rows actually DELETED past this count — the
                             # real disk bound; SOFT_PRUNE alone does not
                             # bound row count, only body size (Codex review).
_PRUNE_ODDS = 256

MODE_OFF = "off"
MODE_SHADOW = "shadow"
MODE_ON = "on"


def current_mode():
    mode = (os.environ.get("DIVTUBE_EPISODE_LEDGER") or MODE_OFF).strip().lower()
    return mode if mode in (MODE_OFF, MODE_SHADOW, MODE_ON) else MODE_OFF


def args_hash_for(tool_name, args):
    """Canonical, key-order-independent identity for one call.

    sort_keys is the whole contract: {'path':x,'refs':1} and
    {'refs':1,'path':x} are the same question and must hash identically.
    """
    payload = json.dumps(
        {"tool": tool_name, "args": args or {}},
        sort_keys=True, separators=(",", ":"), default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _truncate_utf8(text, max_bytes):
    """Cap by BYTES, not Python characters. A naive text[:N] slices code
    points — for multi-byte UTF-8 content the encoded length can exceed N
    despite the name MAX_RESULT_BYTES promising otherwise. Trims any partial
    trailing multi-byte sequence on the way back out."""
    encoded = text.encode("utf-8", "replace")
    if len(encoded) <= max_bytes:
        return text, False
    return encoded[:max_bytes].decode("utf-8", "ignore"), True


class EpisodeStore:
    """Per-thread connections; every public method is failure-swallowing.

    An episode ledger that can break a tool call is worse than no ledger.
    """

    def __init__(self, db_path, session_id=None):
        self.db_path = db_path
        self.session_id = session_id or str(uuid.uuid4())
        self._local = threading.local()
        # Split-brain guard (Codex review, finding 5): a local file is only
        # authoritative when the collab layer isn't configured for Turso.
        turso_configured = bool(os.environ.get("TURSO_COLLAB_DB_URL"))
        self._disabled = turso_configured or not os.path.isfile(db_path)

    def _conn(self):
        if self._disabled:
            return None
        conn = getattr(self._local, "conn", None)
        if conn is None:
            try:
                conn = sqlite3.connect(self.db_path, timeout=5.0)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA busy_timeout = 5000")
                # Confirm the JS migration has run. If not, stay disabled
                # rather than creating a divergent table.
                conn.execute("SELECT 1 FROM collab_toolcall_episodes LIMIT 1")
                self._local.conn = conn
            except sqlite3.Error:
                self._disabled = True
                return None
        return conn

    def lookup(self, args_hash, staleness_kind, staleness_key):
        """Most recent episode for this exact question against an unchanged
        target. Returns None whenever recall would be unsound OR the stored
        text fails its own digest — a corrupted row is a miss, not a hit."""
        if staleness_key is None or staleness_kind == "none":
            return None
        conn = self._conn()
        if conn is None:
            return None
        try:
            row = conn.execute(
                """
                SELECT result_text, result_digest, truncated, created_at, bytecode
                  FROM collab_toolcall_episodes
                 WHERE args_hash = ? AND staleness_kind = ? AND staleness_key = ?
                   AND result_text IS NOT NULL
                 ORDER BY id DESC LIMIT 1
                """,
                (args_hash, staleness_kind, staleness_key),
            ).fetchone()
        except sqlite3.Error:
            return None
        if row is None:
            return None
        # Integrity gate: the digest exists to be CHECKED, not merely stored.
        # A truncated body's digest covers the full original text, not the
        # stored slice, so truncated rows are never served — a partial
        # answer masquerading as a complete one is worse than a fresh call.
        if row["truncated"]:
            return None
        if hashlib.sha256(row["result_text"].encode("utf-8")).hexdigest() != row["result_digest"]:
            return None
        return dict(row)

    def record(self, *, tool_name, target_path, target_symbol, args_hash,
               why_family, why_hex, staleness_kind, staleness_key,
               result_text, bytecode, agent_id=""):
        conn = self._conn()
        if conn is None:
            return None
        full = result_text or ""
        digest = hashlib.sha256(full.encode("utf-8", "replace")).hexdigest()
        stored, truncated = _truncate_utf8(full, MAX_RESULT_BYTES)
        try:
            # BEGIN IMMEDIATE takes the write lock before the read, so the
            # count-then-insert is atomic against other threads/connections
            # (Codex review, finding 6 — COUNT and INSERT were previously two
            # statements, and two threads could read the same count before
            # either inserted, duplicating repeat_index).
            conn.execute("BEGIN IMMEDIATE")
            repeat_index = conn.execute(
                "SELECT COUNT(*) FROM collab_toolcall_episodes WHERE args_hash = ?",
                (args_hash,),
            ).fetchone()[0]
            conn.execute(
                """
                INSERT INTO collab_toolcall_episodes
                  (session_id, agent_id, tool_name, target_path, target_symbol,
                   args_hash, why_family, why_hex, staleness_kind, staleness_key,
                   result_text, result_digest, result_bytes, truncated,
                   repeat_index, bytecode)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (self.session_id, agent_id, tool_name, target_path, target_symbol,
                 args_hash, why_family, why_hex, staleness_kind, staleness_key,
                 stored, digest, len(full.encode("utf-8")), int(truncated),
                 repeat_index, bytecode),
            )
            conn.commit()
            if hash((args_hash, repeat_index)) % _PRUNE_ODDS == 0:
                self._prune(conn)
            return repeat_index
        except sqlite3.Error:
            conn.rollback()
            return None

    def _prune(self, conn):
        """Two tiers, because metadata and bodies have different costs.

        SOFT: null bodies past SOFT_PRUNE_ROWS. digest/why/repeat_index
        survive — that's what the phase-2 roadmap mining needs, and it costs
        bytes, not kilobytes.

        HARD: actually DELETE rows past HARD_PRUNE_ROWS. Without this the
        table grows forever even with bodies nulled (Codex review, finding
        3 — the original _prune only ever nulled text, so 'Disk: Bounded'
        was not true of the implementation it described).
        """
        try:
            with conn:
                conn.execute(
                    """
                    UPDATE collab_toolcall_episodes SET result_text = NULL
                     WHERE result_text IS NOT NULL AND id NOT IN (
                       SELECT id FROM collab_toolcall_episodes
                        ORDER BY id DESC LIMIT ?
                     )
                    """,
                    (SOFT_PRUNE_ROWS,),
                )
                conn.execute(
                    """
                    DELETE FROM collab_toolcall_episodes
                     WHERE id NOT IN (
                       SELECT id FROM collab_toolcall_episodes
                        ORDER BY id DESC LIMIT ?
                     )
                    """,
                    (HARD_PRUNE_ROWS,),
                )
        except sqlite3.Error:
            pass
