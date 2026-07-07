"""
Vaelrix Cortex ForceField — Diagnostic Memory Submitter.

Automatically submits BytecodeHealth signals (PB-OK-v1, PB-RED-v1,
PB-YELLOW-v1) and SCDNA tiered signals to a persistent diagnostic
memory store.  This is the "automatic submission to diagnostic memory /
immune system" required by the Vaelrix Cortex PDR (§24).

The store is SQLite-backed, checksum-verified, and keyed by signal
content so that duplicate signals across sessions are de-duplicated.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from .pixelbrain.bytecode_health import parse_health
from .scdna.pixelbrain_router import parse_scdna_health_signal


def _default_db_path() -> str:
    return os.environ.get(
        "VAELRIX_DIAGNOSTIC_MEMORY_DB",
        os.path.expanduser("~/.vaelrix/diagnostic_memory.sqlite"),
    )


DEFAULT_DB_PATH = _default_db_path()
SCHEMA_VERSION = 1

MIGRATIONS = [
    {
        "version": 1,
        "name": "create_diagnostic_memory_table",
        "sql": """
            CREATE TABLE IF NOT EXISTS diagnostic_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signal_hex TEXT NOT NULL,
                code TEXT NOT NULL,
                cell_id TEXT NOT NULL,
                check_id TEXT NOT NULL,
                module_id TEXT,
                severity TEXT NOT NULL,
                context_json TEXT NOT NULL DEFAULT '{}',
                checksum TEXT,
                checksum_verified INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'unknown',
                session_id TEXT,
                created_at REAL NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnostic_memory_signal
                ON diagnostic_memory(signal_hex);
            CREATE INDEX IF NOT EXISTS idx_diagnostic_memory_session
                ON diagnostic_memory(session_id);
            CREATE INDEX IF NOT EXISTS idx_diagnostic_memory_severity
                ON diagnostic_memory(severity);
            CREATE INDEX IF NOT EXISTS idx_diagnostic_memory_created
                ON diagnostic_memory(created_at DESC);
        """,
    },
]


def _ensure_db(db_path: str | None = None) -> sqlite3.Connection:
    """Open (or create) the diagnostic memory database with migrations applied."""
    path = db_path or _default_db_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at REAL NOT NULL
        )
    """)

    applied = {
        row[0] for row in conn.execute("SELECT version FROM _migrations")
    }
    for migration in MIGRATIONS:
        if migration["version"] not in applied:
            conn.executescript(migration["sql"])
            conn.execute(
                "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (migration["version"], migration["name"], time.time()),
            )
            conn.commit()

    return conn


# ---------------------------------------------------------------------------
# Signal classification helpers
# ---------------------------------------------------------------------------

def _classify_severity(code: str) -> str:
    """Classify a health bytecode into a simple severity bucket."""
    if "PB-RED" in code:
        return "RED"
    if "PB-YELLOW" in code:
        return "YELLOW"
    if "PB-ERR" in code:
        return "ERR"
    return "OK"


def _classify_source(signal: str) -> str:
    """Infer the source subsystem from signal structure."""
    if ":SCDNA:" in signal:
        return "scdna"
    return "brain"


# ---------------------------------------------------------------------------
# Core submission API
# ---------------------------------------------------------------------------

def submit_health_signal(
    signal: str,
    source: str = "brain",
    session_id: str | None = None,
    db_path: str | None = None,
) -> dict[str, Any]:
    """
    Submit a single health signal to diagnostic memory.

    Returns a dict with the submission result.
    """
    conn = _ensure_db(db_path)
    now = time.time()

    # Try to parse as a standard PixelBrain health bytecode first.
    try:
        parsed = parse_health(signal)
        code = parsed["code"]
        cell_id = parsed["cellId"]
        check_id = parsed["checkId"]
        module_id = parsed.get("moduleId")
        severity = _classify_severity(code)
        context = parsed.get("context", {})
        checksum = parsed.get("checksum", "")
        checksum_verified = 1 if parsed.get("checksumVerified") else 0
    except (ValueError, KeyError):
        # Fall back to SCDNA signal parsing.
        try:
            parsed_scdna = parse_scdna_health_signal(signal)
            code = parsed_scdna["prefix"]
            cell_id = "SCDNA"
            check_id = f"{parsed_scdna['component']}:{parsed_scdna['stableId']}"
            module_id = None
            severity = "YELLOW" if parsed_scdna["severity"] == "yellow" else "RED"
            context = parsed_scdna.get("context", {})
            checksum = None
            checksum_verified = 1  # SCDNA signals are canonical
        except (ValueError, KeyError):
            # Store as a raw/unparsed signal.
            code = "UNKNOWN"
            cell_id = "UNKNOWN"
            check_id = "UNKNOWN"
            module_id = None
            severity = "UNKNOWN"
            context = {"rawSignal": signal}
            checksum = None
            checksum_verified = 0

    context_json = json.dumps(context, ensure_ascii=False, separators=(",", ":"))

    # Upsert: INSERT OR IGNORE so duplicate signals are de-duplicated.
    conn.execute(
        """
        INSERT OR IGNORE INTO diagnostic_memory
            (signal_hex, code, cell_id, check_id, module_id, severity,
             context_json, checksum, checksum_verified, source, session_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            signal,
            code,
            cell_id,
            check_id,
            module_id,
            severity,
            context_json,
            checksum,
            checksum_verified,
            source,
            session_id,
            now,
        ),
    )
    conn.commit()

    # Determine if it was actually inserted or ignored as duplicate.
    cursor = conn.execute("SELECT changes()")
    inserted = cursor.fetchone()[0] > 0
    conn.close()

    return {
        "signal": signal[:120],
        "code": code,
        "cellId": cell_id,
        "checkId": check_id,
        "severity": severity,
        "inserted": inserted,
        "duplicate": not inserted,
        "source": source,
        "sessionId": session_id,
    }


def submit_to_diagnostic_memory(
    health_signals: list[str] | None = None,
    scdna_signals: list[str] | None = None,
    tiered_signals: list[str] | None = None,
    session_id: str | None = None,
    db_path: str | None = None,
) -> dict[str, Any]:
    """
    Automatically submit all health signals to diagnostic memory.

    Accepts three categories of signals:
    - ``health_signals``: PB-OK-v1 / PB-RED-v1 from the PixelBrain Router
    - ``scdna_signals``: SCDNA tiered signals (PB-YELLOW-v1 / PB-RED-v1)
    - ``tiered_signals``: Additional tiered signals from Tool Governor, etc.

    Returns a summary report.
    """
    all_submissions: list[dict[str, Any]] = []
    inserted = 0
    duplicates = 0
    failed = 0

    # Map of (signal_list, source_label)
    batches: list[tuple[list[str], str]] = []
    if health_signals:
        batches.append((health_signals, "brain"))
    if scdna_signals:
        batches.append((scdna_signals, "scdna"))
    if tiered_signals:
        batches.append((tiered_signals, "tiered"))

    for signals, source in batches:
        for signal in signals:
            try:
                result = submit_health_signal(
                    signal,
                    source=source,
                    session_id=session_id,
                    db_path=db_path,
                )
                all_submissions.append(result)
                if result["inserted"]:
                    inserted += 1
                else:
                    duplicates += 1
            except Exception:
                failed += 1

    return {
        "total": len(all_submissions),
        "inserted": inserted,
        "duplicates": duplicates,
        "failed": failed,
        "sessionId": session_id,
        "submissions": all_submissions,
    }


# ---------------------------------------------------------------------------
# Query API (for immune system / diagnostic consumers)
# ---------------------------------------------------------------------------

def query_diagnostic_memory(
    session_id: str | None = None,
    severity: str | None = None,
    cell_id: str | None = None,
    limit: int = 100,
    db_path: str | None = None,
) -> list[dict[str, Any]]:
    """
    Query the diagnostic memory store.

    Filters are AND-combined. Returns the most recent signals first.
    """
    conn = _ensure_db(db_path)
    clauses = ["1=1"]
    params: list[Any] = []

    if session_id:
        clauses.append("session_id = ?")
        params.append(session_id)
    if severity:
        clauses.append("severity = ?")
        params.append(severity.upper())
    if cell_id:
        clauses.append("cell_id = ?")
        params.append(cell_id)

    where = " AND ".join(clauses)
    rows = conn.execute(
        f"""
        SELECT signal_hex, code, cell_id, check_id, module_id, severity,
               context_json, checksum, checksum_verified, source, session_id, created_at
        FROM diagnostic_memory
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (*params, limit),
    ).fetchall()

    conn.close()

    return [
        {
            "signal": row[0],
            "code": row[1],
            "cellId": row[2],
            "checkId": row[3],
            "moduleId": row[4],
            "severity": row[5],
            "context": json.loads(row[6]) if row[6] else {},
            "checksum": row[7],
            "checksumVerified": bool(row[8]),
            "source": row[9],
            "sessionId": row[10],
            "createdAt": row[11],
        }
        for row in rows
    ]


def get_diagnostic_memory_stats(db_path: str | None = None) -> dict[str, Any]:
    """Return aggregate statistics about the diagnostic memory store."""
    conn = _ensure_db(db_path)
    total = conn.execute("SELECT COUNT(*) FROM diagnostic_memory").fetchone()[0]
    by_severity = {
        row[0]: row[1]
        for row in conn.execute(
            "SELECT severity, COUNT(*) FROM diagnostic_memory GROUP BY severity"
        ).fetchall()
    }
    by_source = {
        row[0]: row[1]
        for row in conn.execute(
            "SELECT source, COUNT(*) FROM diagnostic_memory GROUP BY source"
        ).fetchall()
    }
    recent_red = conn.execute(
        "SELECT COUNT(*) FROM diagnostic_memory WHERE severity = 'RED' AND created_at > ?",
        (time.time() - 3600,),
    ).fetchone()[0]
    conn.close()

    return {
        "totalSignals": total,
        "bySeverity": by_severity,
        "bySource": by_source,
        "recentRedHour": recent_red,
        "dbPath": db_path or _default_db_path(),
    }
