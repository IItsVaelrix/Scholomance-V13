"""
Vaelrix Cortex ForceField — Phase 0 Steer Ledger Emitter.

PHASE 0 of the Pressure Field Governor PDR
(docs/scholomance-encyclopedia/PDR-archive/2026-08-09-pressure-field-governor-pdr.md).

Writes PB-STEER-v1 deflection receipts to the append-only steer ledger when
the search or tool governor blocks a candidate. EMIT ONLY: this module never
influences an allow/block decision, and every failure is swallowed — a
telemetry outage must never break governance (PDR §3.2 failure mode).

The ledger is the experiment, not the field. If resolved receipts cannot
separate good trajectories from bad, the pressure field is refuted and this
ledger is the deliverable (PDR §8 Phase 0 exit criteria).

CROSS-LANGUAGE CONTRACT with codex/core/semantic-calculus/steer-ledger.ts:

  - Key order is canonical and must match RECEIPT_KEYS / CANDIDATE_KEYS:
      schema, id, utterance, candidates, selected_trajectory, verdict,
      outcome, field_checksum   [+ checksum, capturedAt]
      candidate: key, pressure, result, dominant_source, gate_considered,
                 governor, category, tier
                 (+ suggested_alternative, optional, appended last)
  - Checksum = 'steer1:' + sha256(compact canonical payload)[:16], where the
    payload is json.dumps(..., separators=(",", ":"), ensure_ascii=True) of
    everything EXCEPT checksum and capturedAt. This byte form is what
    canonical-json.js (Python-compatible serialization) recomputes on the
    TypeScript side, so rows written here verify there.
  - Phase 0 records exactly ONE measured pressure source per deflection at
    magnitude 1.0 (which source fired IS the signal; invented magnitudes
    would be self-scored pressure, F10). CATEGORY_PRESSURE is mirrored by
    CATEGORY_PRESSURE in steer-ledger.ts — moving one moves both, plus the
    cross-language fixture at tests/semantic-calculus/fixtures/.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = "PB-STEER-v1"

PRESSURE_SOURCES = (
    "law", "authorization", "destructive",
    "scope", "regression", "dependency",
    "evidence", "uncertainty",
    "goal",
)

# Governor block category -> the single pressure source it measures.
CATEGORY_PRESSURE = {
    "MISSING_REASON": "evidence",
    "REPEATED_SEARCH": "regression",
    "SEARCH_BUDGET_EXHAUSTED": "scope",
    "KNOWN_TARGET": "evidence",
    "SCDNA_BYPASS": "evidence",
    "TOOL_NOT_ALLOWED": "authorization",
    "TOOL_MISSING_REASON": "evidence",
    "TOOL_BUDGET_EXHAUSTED": "scope",
    "REPEATED_TOOL_CALL": "regression",
}

_FIELD_CHECKSUM_PAYLOAD = '{"ridges":[],"corridors":[],"gates":[]}'


def ledger_path() -> Path:
    """Ledger location. Env override exists so tests never touch the corpus."""
    override = os.environ.get("SCHOLO_STEER_LEDGER_PATH")
    if override:
        return Path(override)
    repo_root = Path(__file__).resolve().parents[2]
    return repo_root / "bench/semantic-calculus/corpus/steer-receipts.jsonl"


def phase0_field_checksum() -> str:
    """Checksum of the empty field — Phase 0 has no ridges/corridors/gates."""
    return hashlib.sha256(_FIELD_CHECKSUM_PAYLOAD.encode("utf-8")).hexdigest()[:12]


def _canonical(payload: dict) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def _checksum(payload: dict) -> str:
    return "steer1:" + hashlib.sha256(_canonical(payload).encode("utf-8")).hexdigest()[:16]


def _next_steer_id(path: Path) -> str:
    highest = 0
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except ValueError:
                continue  # tolerate foreign/corrupt rows when counting ids
            if row.get("schema") != SCHEMA:
                continue
            steer_id = str(row.get("id", ""))
            if steer_id.startswith("steer-") and steer_id[6:].isdigit():
                highest = max(highest, int(steer_id[6:]))
    return f"steer-{highest + 1:06d}"


def emit_deflection(
    *,
    governor: str,
    category: str,
    tier: str,
    utterance: str,
    candidate_key: str,
    suggested_alternative: str | None = None,
    path: Path | None = None,
    captured_at: str | None = None,
) -> str | None:
    """
    Append one PB-STEER-v1 deflection receipt. Returns the steer id, or None
    when the write failed. NEVER raises: telemetry must not break governance.

    `captured_at` is injectable for deterministic tests; it is excluded from
    the checksum either way.
    """
    try:
        source = CATEGORY_PRESSURE[category]
        target = path or ledger_path()
        target.parent.mkdir(parents=True, exist_ok=True)

        candidate = {
            "key": candidate_key,
            "pressure": {source: 1.0},
            "result": "DEFLECTED",
            "dominant_source": source,
            "gate_considered": None,
            "governor": governor,
            "category": category,
            "tier": tier,
        }
        # Provenance: the prose alternative the governor offered. It is NOT
        # selected_trajectory — §3.3 restricts that field to a corridor id or
        # candidate key, and Phase 0 has no corridors yet ("No field, no
        # tiers, no ridges"). So the deflection stalls the formal flow and
        # the suggestion rides along as provenance for canary review.
        if suggested_alternative is not None:
            candidate["suggested_alternative"] = suggested_alternative
        payload = {
            "schema": SCHEMA,
            "id": _next_steer_id(target),
            "utterance": utterance,
            "candidates": [candidate],
            "selected_trajectory": None,
            "verdict": "STALLED",
            "outcome": None,
            "field_checksum": phase0_field_checksum(),
        }
        row = dict(payload)
        row["checksum"] = _checksum(payload)
        if captured_at is None:
            now = datetime.now(timezone.utc)
            captured_at = now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
        row["capturedAt"] = captured_at

        with target.open("a", encoding="utf-8") as fh:
            fh.write(_canonical(row) + "\n")
        return str(payload["id"])
    except Exception:
        # Deliberate swallow (PDR §3.2). A blocked append, a missing
        # permission, a full disk — none of it may turn into a governor
        # crash. The absence of a row is visible in the ledger itself.
        return None
