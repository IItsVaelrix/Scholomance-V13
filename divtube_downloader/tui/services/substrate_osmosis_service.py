"""Substrate Osmosis Service — bridges Python memory cells into the JS osmosis engine.

Converts MemoryService cells into vector observations, shells out to the
scholomance-bridge.mjs `osmosis-scan` command, and persists anomaly state
back into SQLite so the TUI grid can reflect it.

Anomaly kinds (from memory-cell-osmosis.js):
  • none             — cell is healthy, silent
  • baseline_drift   — vector drifted beyond membrane tolerance
  • antigen_match    — antigen pattern matched (known-bad signature)
  • concentration    — concentration exceeded membrane limit
"""

import hashlib
import json
import os
import sqlite3
import subprocess
import threading
from datetime import datetime


# ── Scholomance palette ──────────────────────────────────────────────
GOLD    = "#FFD700"
PURPLE  = "#B388FF"
SUCCESS = "#7CFF8B"
WARNING = "#FFD166"
ERROR   = "#FF5C7A"
MUTED   = "#6A5A6A"
CYAN    = "#00E5FF"

# ── Anomaly severity colors ──────────────────────────────────────────
ANOMALY_COLORS = {
    "none":              MUTED,
    "baseline_drift":    WARNING,
    "antigen_match":     ERROR,
    "concentration":     "#FF6F00",  # Deep orange
}

ANOMALY_GLYPHS = {
    "none":              "◇",
    "baseline_drift":    "⚠",
    "antigen_match":     "☣",
    "concentration":     "◉",
}

# Ceiling for the derived concentration metric, and therefore the only value on
# which the `concentration` anomaly can ever fire — _derive_concentration clamps
# to it and the scan tests `>=` against it. Changing one side without the other
# silently disables the anomaly: raise the clamp and nothing fires, lower the
# test and everything fires. Held as one constant for exactly that reason.
#
# Verified against exact decimal arithmetic (decimal.Decimal) over value lengths
# 0..20020: the float clamp and the float `>=` agree with the decimal intent on
# every input, so no drift is currently observable. Keep that property if the
# divisor or the temporal pressure is ever tuned.
CONCENTRATION_CEILING = 0.99


def _node_bin():
    n = "/home/deck/.nvm/versions/node/v20.20.2/bin/node"
    if os.path.exists(n):
        return n
    return "node"


def _bridge_script():
    d = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(d, "scripts", "scholomance-bridge.mjs")


def _project_root():
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class SubstrateOsmosisService:
    """Integrates Python memory cells with the JS memory-cell-osmosis substrate.

    Architecture:
      1. Python MemoryService stores key-value cells in SQLite.
      2. This service adds an `osmosis_state` table tracking per-cell anomaly
         results, similarity, drift, and last-scan timestamps.
      3. Scanning shells out to `scholomance-bridge.mjs osmosis-scan` which
         runs the JS `scanMemoryCells()` + `evaluateMemoryCellOsmosis()`.
      4. Results are persisted back and the MemoryCellWidget reads them.
    """

    def __init__(self, memory_service, db_path=None):
        self._memory = memory_service
        self._db_path = db_path or memory_service.db_path
        self._init_substrate_tables()

    # ── Schema ───────────────────────────────────────────────────────

    def _init_substrate_tables(self):
        """Create osmosis tracking tables if they don't exist."""
        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS osmosis_state (
                    cell_id       TEXT PRIMARY KEY,
                    key           TEXT,
                    family        TEXT DEFAULT 'runtime',
                    mode          TEXT DEFAULT 'baseline',
                    status        TEXT DEFAULT 'silent',
                    anomaly_kind  TEXT DEFAULT 'none',
                    similarity    REAL DEFAULT 1.0,
                    drift         REAL DEFAULT 0.0,
                    concentration REAL DEFAULT 0.0,
                    confidence    REAL DEFAULT 0.0,
                    last_scan     TEXT,
                    scan_count    INTEGER DEFAULT 0,
                    checksum      TEXT
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS osmosis_history (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    cell_id       TEXT,
                    timestamp     TEXT,
                    status        TEXT,
                    anomaly_kind  TEXT,
                    similarity    REAL,
                    drift         REAL,
                    confidence    REAL,
                    checksum      TEXT
                )
            """)
            conn.commit()

    # ── Cell → Vector Encoding ───────────────────────────────────────

    @staticmethod
    def _cell_to_vector(key, value):
        """Encode a key-value cell into a 128-dim float vector for osmosis.

        Uses a deterministic hash-spread encoding:
          - dims 0-7:  key character hash spread
          - dims 8-15: value length / entropy features
          - dims 16+:  value content hash cascade
        """
        vec = [0.0] * 128

        # Key features (dims 0-7)
        key_hash = hashlib.sha256(key.encode()).digest()
        for i in range(8):
            vec[i] = (key_hash[i] / 255.0) * 2 - 1  # Normalize to [-1, 1]

        # Value features (dims 8-15)
        val_str = str(value) if value else ""
        vec[8] = min(1.0, len(val_str) / 1000.0)
        vec[9] = min(1.0, len(set(val_str)) / 128.0)  # char entropy proxy

        val_hash = hashlib.sha256(val_str.encode()).digest()
        for i in range(6):
            vec[10 + i] = (val_hash[i] / 255.0) * 2 - 1

        # Value content cascade (dims 16-79)
        content_hash = hashlib.sha256((key + ":" + val_str).encode()).digest()
        for i in range(min(32, len(content_hash))):
            vec[16 + i] = (content_hash[i] / 255.0) * 2 - 1
            vec[48 + i] = ((content_hash[i] ^ 0xAA) / 255.0) * 2 - 1

        return vec

    @staticmethod
    def _derive_concentration(key, value):
        """Derive a concentration metric from cell volatility.

        High concentration = cell value changes frequently or is very large.
        """
        val_str = str(value) if value else ""
        size_pressure = min(1.0, len(val_str) / 10000.0)
        # Timestamp-like values have higher concentration (they change)
        temporal_pressure = 0.3 if any(c in val_str for c in ["T", "Z", ":", "-"]) else 0.0
        # The clamp and the `>= CONCENTRATION_CEILING` test in _scan_cell are the
        # same number and are only correct together: the anomaly can fire on no
        # other value. Both sides read the constant, so neither can drift alone.
        return min(CONCENTRATION_CEILING, size_pressure + temporal_pressure)

    # ── Bridge Calls ─────────────────────────────────────────────────

    def _run_bridge(self, command, *args, timeout=30):
        """Call scholomance-bridge.mjs with a command."""
        script = _bridge_script()
        node = _node_bin()
        cmd = [node, script, command] + list(args)
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout,
                cwd=_project_root()
            )
            if proc.returncode != 0:
                return {"error": proc.stderr.strip() or f"exit code {proc.returncode}"}
            return json.loads(proc.stdout)
        except subprocess.TimeoutExpired:
            return {"error": "Osmosis scan timed out"}
        except json.JSONDecodeError as e:
            return {"error": f"JSON parse error: {e}"}
        except Exception as e:
            return {"error": str(e)}

    # ── Scan ─────────────────────────────────────────────────────────

    def scan_all(self, callback=None):
        """Run osmosis scan on all memory cells.

        1. Read all cells from MemoryService
        2. Convert each to a vector observation
        3. Pass to JS bridge for osmosis evaluation
        4. Persist results
        5. Return anomaly summary
        """
        cells = self._memory.list_cells()
        if not cells:
            if callback:
                callback(f"[{MUTED}]No memory cells to scan.[/]")
            return {"anomalies": [], "scanned": 0}

        # Build the scan payload
        scan_payload = []
        for cell_data in cells:
            key = cell_data["key"]
            value = cell_data.get("preview", "")
            # Get full value for better vector encoding
            full_cell = self._memory.get_cell(key)
            full_value = full_cell["value"] if full_cell else value

            vec = self._cell_to_vector(key, full_value)
            concentration = self._derive_concentration(key, full_value)

            scan_payload.append({
                "cell_id": cell_data["cell_id"],
                "key": key,
                "vector": vec,
                "concentration": concentration,
                "reads": cell_data.get("reads", 0),
            })

        # Shell out to JS bridge
        payload_json = json.dumps(scan_payload)
        result = self._run_bridge(
            "osmosis-scan",
            "--payload", payload_json,
            timeout=60
        )

        if "error" in result:
            if callback:
                callback(f"[{ERROR}]Osmosis scan error:[/] {result['error']}")
            # Fall back to pure Python scan
            return self._python_fallback_scan(scan_payload, callback)

        # Persist results
        anomalies = self._persist_scan_results(result.get("results", []))

        if callback:
            self._format_scan_output(anomalies, len(scan_payload), callback)

        return {"anomalies": anomalies, "scanned": len(scan_payload)}

    def _python_fallback_scan(self, scan_payload, callback=None):
        """Pure Python fallback when JS bridge is unavailable.

        Performs a simplified osmosis check:
          - Baseline drift: compare current vector hash to stored hash
          - Concentration: check if value size exceeds threshold
        """
        anomalies = []
        now = datetime.now().isoformat()

        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()

            for cell in scan_payload:
                cell_id = cell["cell_id"]
                key = cell["key"]
                vec_hash = hashlib.sha256(
                    json.dumps(cell["vector"][:16], sort_keys=True).encode()
                ).hexdigest()[:12]

                # Check for existing baseline
                c.execute(
                    "SELECT checksum, similarity FROM osmosis_state WHERE cell_id = ?",
                    (cell_id,)
                )
                row = c.fetchone()

                if row and row[0]:
                    # Compare against stored baseline
                    old_hash = row[0]
                    if old_hash != vec_hash:
                        anomaly_kind = "baseline_drift"
                        similarity = 0.85  # Approximate
                        drift = 0.15
                        status = "anomaly"
                    else:
                        anomaly_kind = "none"
                        similarity = 1.0
                        drift = 0.0
                        status = "silent"
                else:
                    # First scan — establish baseline
                    anomaly_kind = "none"
                    similarity = 1.0
                    drift = 0.0
                    status = "silent"

                # Check concentration.
                # NOTE: this deliberately wins over baseline_drift — a cell is
                # reported as ONE anomaly_kind, and an oversized/temporal cell
                # is the more actionable finding. That also means a cell which
                # has genuinely drifted AND is oversized reports "concentration"
                # and its similarity=0.85/drift=0.15 are stored but not surfaced
                # in anomaly_kind. Pre-existing precedence; documented, not
                # changed, because the TUI grid keys off this single value.
                concentration = cell.get("concentration", 0)
                if concentration >= CONCENTRATION_CEILING:
                    anomaly_kind = "concentration"
                    status = "anomaly"

                confidence = drift if anomaly_kind == "baseline_drift" else concentration

                # Persist
                c.execute("""
                    INSERT INTO osmosis_state
                        (cell_id, key, status, anomaly_kind, similarity, drift,
                         concentration, confidence, last_scan, scan_count, checksum)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ON CONFLICT(cell_id) DO UPDATE SET
                        status       = excluded.status,
                        anomaly_kind = excluded.anomaly_kind,
                        similarity   = excluded.similarity,
                        drift        = excluded.drift,
                        concentration= excluded.concentration,
                        confidence   = excluded.confidence,
                        last_scan    = excluded.last_scan,
                        scan_count   = osmosis_state.scan_count + 1,
                        checksum     = excluded.checksum
                """, (cell_id, key, status, anomaly_kind, similarity, drift,
                      concentration, confidence, now, vec_hash))

                # Record history
                c.execute("""
                    INSERT INTO osmosis_history
                        (cell_id, timestamp, status, anomaly_kind, similarity, drift, confidence, checksum)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (cell_id, now, status, anomaly_kind, similarity, drift, confidence, vec_hash))

                if anomaly_kind != "none":
                    anomalies.append({
                        "cell_id": cell_id,
                        "key": key,
                        "anomaly_kind": anomaly_kind,
                        "similarity": similarity,
                        "drift": drift,
                        "concentration": concentration,
                        "confidence": confidence,
                    })

            conn.commit()

        if callback:
            self._format_scan_output(anomalies, len(scan_payload), callback)

        return {"anomalies": anomalies, "scanned": len(scan_payload)}

    def _persist_scan_results(self, results):
        """Write JS osmosis results back into SQLite."""
        now = datetime.now().isoformat()
        anomalies = []

        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()

            for r in results:
                cell_id = r.get("cellId", r.get("cell_id", ""))
                status = r.get("status", "silent")
                anomaly_kind = r.get("anomalyKind", r.get("anomaly_kind", "none"))
                similarity = r.get("similarity", 1.0)
                drift = r.get("drift", 0.0)
                concentration = r.get("concentration", 0.0)
                confidence = r.get("confidence", 0.0)
                checksum = r.get("checksum", "")

                c.execute("""
                    INSERT INTO osmosis_state
                        (cell_id, status, anomaly_kind, similarity, drift,
                         concentration, confidence, last_scan, scan_count, checksum)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ON CONFLICT(cell_id) DO UPDATE SET
                        status       = excluded.status,
                        anomaly_kind = excluded.anomaly_kind,
                        similarity   = excluded.similarity,
                        drift        = excluded.drift,
                        concentration= excluded.concentration,
                        confidence   = excluded.confidence,
                        last_scan    = excluded.last_scan,
                        scan_count   = osmosis_state.scan_count + 1,
                        checksum     = excluded.checksum
                """, (cell_id, status, anomaly_kind, similarity, drift,
                      concentration, confidence, now, checksum))

                c.execute("""
                    INSERT INTO osmosis_history
                        (cell_id, timestamp, status, anomaly_kind, similarity, drift, confidence, checksum)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (cell_id, now, status, anomaly_kind, similarity, drift, confidence, checksum))

                if status == "anomaly":
                    anomalies.append({
                        "cell_id": cell_id,
                        "anomaly_kind": anomaly_kind,
                        "similarity": similarity,
                        "drift": drift,
                        "concentration": concentration,
                        "confidence": confidence,
                    })

            conn.commit()

        return anomalies

    # ── Query ────────────────────────────────────────────────────────

    def get_cell_osmosis(self, cell_id):
        """Get osmosis state for a specific cell."""
        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()
            c.execute("""
                SELECT status, anomaly_kind, similarity, drift, concentration,
                       confidence, last_scan, scan_count, checksum
                FROM osmosis_state WHERE cell_id = ?
            """, (cell_id,))
            row = c.fetchone()
            if row:
                return {
                    "status": row[0],
                    "anomaly_kind": row[1],
                    "similarity": row[2],
                    "drift": row[3],
                    "concentration": row[4],
                    "confidence": row[5],
                    "last_scan": row[6],
                    "scan_count": row[7],
                    "checksum": row[8],
                }
            return None

    def get_all_osmosis_states(self):
        """Get osmosis state for all cells."""
        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()
            c.execute("""
                SELECT cell_id, key, status, anomaly_kind, similarity, drift,
                       concentration, confidence, last_scan, scan_count
                FROM osmosis_state
                ORDER BY confidence DESC
            """)
            return [
                {
                    "cell_id": r[0],
                    "key": r[1],
                    "status": r[2],
                    "anomaly_kind": r[3],
                    "similarity": r[4],
                    "drift": r[5],
                    "concentration": r[6],
                    "confidence": r[7],
                    "last_scan": r[8],
                    "scan_count": r[9],
                }
                for r in c.fetchall()
            ]

    def get_anomaly_history(self, cell_id, limit=10):
        """Get scan history for a specific cell."""
        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()
            c.execute("""
                SELECT timestamp, status, anomaly_kind, similarity, drift, confidence
                FROM osmosis_history WHERE cell_id = ?
                ORDER BY id DESC LIMIT ?
            """, (cell_id, limit))
            return [
                {
                    "timestamp": r[0],
                    "status": r[1],
                    "anomaly_kind": r[2],
                    "similarity": r[3],
                    "drift": r[4],
                    "confidence": r[5],
                }
                for r in c.fetchall()
            ]

    def anomaly_summary(self):
        """Summary stats for the substrate."""
        with sqlite3.connect(self._db_path) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM osmosis_state")
            total = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM osmosis_state WHERE status = 'anomaly'")
            anomalies = c.fetchone()[0]
            c.execute("SELECT COUNT(*) FROM osmosis_state WHERE status = 'silent'")
            silent = c.fetchone()[0]
            c.execute("SELECT COALESCE(SUM(scan_count), 0) FROM osmosis_state")
            total_scans = c.fetchone()[0]
            c.execute("SELECT COALESCE(MAX(last_scan), 'never') FROM osmosis_state")
            last_scan = c.fetchone()[0]
            return {
                "total_cells": total,
                "anomalies": anomalies,
                "silent": silent,
                "total_scans": total_scans,
                "last_scan": last_scan,
            }

    # ── Formatting ───────────────────────────────────────────────────

    def _format_scan_output(self, anomalies, scanned, callback):
        """Format scan results for TUI display."""
        lines = [
            f"\n[bold {CYAN}]⬡ SUBSTRATE OSMOSIS SCAN ⬡[/]",
            f"  [{SUCCESS}]●[/] Cells scanned: [{PURPLE}]{scanned}[/]",
        ]

        if not anomalies:
            lines.append(f"  [{SUCCESS}]●[/] Status: [{SUCCESS}]ALL SILENT[/] — no anomalies detected")
        else:
            lines.append(f"  [{ERROR}]●[/] Anomalies: [{ERROR}]{len(anomalies)}[/]")
            lines.append("")
            for a in anomalies:
                kind = a.get("anomaly_kind", "unknown")
                glyph = ANOMALY_GLYPHS.get(kind, "?")
                color = ANOMALY_COLORS.get(kind, WARNING)
                key = a.get("key", a.get("cell_id", "?"))
                sim = a.get("similarity", 0)
                drift_val = a.get("drift", 0)
                conf = a.get("confidence", 0)
                lines.append(
                    f"  [{color}]{glyph}[/] [{color}]{kind}[/] "
                    f"[{MUTED}]→[/] [{PURPLE}]{key}[/]  "
                    f"[{MUTED}]sim={sim:.3f} drift={drift_val:.3f} conf={conf:.3f}[/]"
                )

        summary = self.anomaly_summary()
        lines.append("")
        lines.append(
            f"  [{MUTED}]Substrate:[/] {summary['total_cells']} tracked  "
            f"| {summary['anomalies']} anomalous  "
            f"| {summary['total_scans']} total scans"
        )

        callback("\n".join(lines))

    # ── Async Wrappers ───────────────────────────────────────────────

    def scan_all_async(self, callback):
        """Run scan in a background thread."""
        def run():
            self.scan_all(callback=callback)
        threading.Thread(target=run, daemon=True).start()
