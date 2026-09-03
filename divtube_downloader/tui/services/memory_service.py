import os
import sqlite3
import hashlib
from datetime import datetime


def _default_db_path():
    # Anchored to the module root (divtube_downloader/), same convention as
    # token_meter.py's _state_path(). A bare relative default meant the TUI
    # wrote to a different file depending on the launch cwd (repo root vs.
    # divtube_downloader/), and the resulting runtime DB was tracked in git.
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, "divtube_memory.db")


class MemoryService:
    """Persistent memory with two layers:

    1. CRITIQUES (legacy) — unstructured critique blobs keyed by file path.
    2. MEMORY CELLS  — deterministic key-value cells (max 64) with metadata
       (reads, status, timestamps). Visualised as a grid in the TUI.
    """

    def __init__(self, db_path=None):
        self.db_path = db_path if db_path is not None else _default_db_path()
        self._init_db()
        self.seed_default_cells()

    # ── Schema ──────────────────────────────────────────────────────

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS critiques (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp  TEXT,
                    file_path  TEXT,
                    content    TEXT,
                    critique   TEXT
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS memory_cells (
                    cell_id    TEXT PRIMARY KEY,
                    key        TEXT UNIQUE,
                    value      TEXT,
                    created_at TEXT,
                    last_read  TEXT,
                    reads      INTEGER DEFAULT 0,
                    status     TEXT DEFAULT 'occupied'
                )
            """)
            conn.commit()

    # ── CRITIQUES (legacy) ──────────────────────────────────────────

    def save_critique(self, file_path, content, critique):
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute(
                "INSERT INTO critiques (timestamp, file_path, content, critique) "
                "VALUES (?, ?, ?, ?)",
                (datetime.now().isoformat(), file_path, content, critique),
            )
            conn.commit()

    def get_recent_critiques(self, limit=2):
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute(
                "SELECT file_path, critique FROM critiques ORDER BY id DESC LIMIT ?",
                (limit,),
            )
            rows = c.fetchall()
            if not rows:
                return "No previous critiques in memory."

            history = (
                "PAST CRITIQUES MEMORY CONTEXT "
                "(Use this to compare against the user's past work):\n"
            )
            for row in reversed(rows):
                history += (
                    f"- Past File: {row[0]}\n"
                    f"  Past Critique Summary: {row[1][:300]}...\n\n"
                )
            return history

    def critique_count(self):
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM critiques")
            return c.fetchone()[0]

    # ── MEMORY CELLS  (key-value persistent storage) ────────────────

    @staticmethod
    def _cell_id_for(key):
        """Deterministic 13-char cell ID from the key."""
        h = hashlib.md5(key.encode()).hexdigest()[:8].upper()
        return f"CELL-{h}"

    def set_cell(self, key, value):
        """Write a value into a memory cell.  Creates or updates."""
        now = datetime.now().isoformat()
        cell_id = self._cell_id_for(key)
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO memory_cells (cell_id, key, value, created_at, last_read, reads, status)
                VALUES (?, ?, ?, ?, ?, 0, 'occupied')
                ON CONFLICT(key) DO UPDATE SET
                    value     = excluded.value,
                    last_read = excluded.last_read,
                    status    = 'occupied'
                """,
                (cell_id, key, value, now, now),
            )
            conn.commit()
        return cell_id

    def get_cell(self, key):
        """Read a memory cell.  Returns dict or None."""
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute(
                "UPDATE memory_cells SET reads = reads + 1, last_read = ? WHERE key = ?",
                (datetime.now().isoformat(), key),
            )
            conn.commit()
            c.execute(
                "SELECT value, cell_id, reads, created_at, status FROM memory_cells WHERE key = ?",
                (key,),
            )
            row = c.fetchone()
            if row:
                return {
                    "value": row[0],
                    "cell_id": row[1],
                    "reads": row[2],
                    "created_at": row[3],
                    "status": row[4],
                }
            return None

    def delete_cell(self, key):
        """Remove a memory cell.  Returns True if anything was deleted."""
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute("DELETE FROM memory_cells WHERE key = ?", (key,))
            conn.commit()
            return c.rowcount > 0

    def list_cells(self):
        """Return all memory-cell rows with metadata."""
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT cell_id, key, substr(value, 1, 80), reads, status,
                       created_at, last_read
                FROM memory_cells
                ORDER BY last_read DESC
                """
            )
            return [
                {
                    "cell_id": r[0],
                    "key": r[1],
                    "preview": r[2],
                    "reads": r[3],
                    "status": r[4],
                    "created_at": r[5],
                    "last_read": r[6],
                }
                for r in c.fetchall()
            ]

    def all_cells_raw(self):
        """Return all memory cells as a list of dicts for the grid widget."""
        return self.list_cells()

    @property
    def total_cells(self):
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM memory_cells")
            return c.fetchone()[0]

    def cell_stats(self):
        """Return a dict of summary stats for the inspector panel."""
        with sqlite3.connect(self.db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM memory_cells")
            total = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM memory_cells WHERE status = 'occupied'")
            occupied = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM memory_cells WHERE status = 'dormant'")
            dormant = c.fetchone()[0]
            c.execute("SELECT COALESCE(SUM(reads), 0) FROM memory_cells")
            total_reads = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM critiques")
            critiques = c.fetchone()[0]
            return {
                "total": total,
                "occupied": occupied,
                "dormant": dormant,
                "total_reads": total_reads,
                "critiques": critiques,
                "capacity": 64,
            }

    def seed_default_cells(self):
        """Pre-populate default cells on first run."""
        defaults = {
            "app:version": "DivTube Cockpit V1",
            "app:theme": "scholomance",
            "app:last_session": datetime.now().isoformat(),
            "memory:description": "Persistent key-value cells for DivTube data",
        }
        for k, v in defaults.items():
            if self.get_cell(k) is None:
                self.set_cell(k, v)
