"""
Phase 0 of the Pressure Field Governor PDR — emitter + instrumentation tests.

The load-bearing assertion in this file is DECISION PARITY: the governors'
allow/block outcomes must be byte-identical with the steer emitter live,
stubbed, or actively crashing. Phase 0 is emit-only by law (PDR §7); these
tests are what enforce that word.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest

from vaelrix_forcefield.search_governor import record_search, should_allow_search
from vaelrix_forcefield.steer_emitter import emit_deflection, phase0_field_checksum
from vaelrix_forcefield.tool_governor import record_tool_call, should_allow_tool_call
from vaelrix_forcefield.types import TaskField, VaelrixCortexForceField

# steamdeck_brain/vaelrix_forcefield/tests/ -> repo root is parents[3].
REPO_ROOT = Path(__file__).resolve().parents[3]
PYTHON_FIXTURE = REPO_ROOT / "tests/semantic-calculus/fixtures/steer-row-from-python.jsonl"

FIXTURE_CAPTURED_AT = "2026-08-09T00:00:00.000Z"


@pytest.fixture()
def ledger(tmp_path, monkeypatch):
    path = tmp_path / "steer-receipts.jsonl"
    monkeypatch.setenv("SCHOLO_STEER_LEDGER_PATH", str(path))
    return path


@pytest.fixture()
def fresh_field() -> VaelrixCortexForceField:
    return VaelrixCortexForceField(
        task=TaskField(taskId="phase0-test", rawUserRequest="phase 0 ledger test")
    )


def _blocked_search_field(field: VaelrixCortexForceField) -> VaelrixCortexForceField:
    """A field in which the next search for the same query is a repeat."""
    return record_search(field, "where is the parser", "first legitimate search")


# ── emitter basics ──────────────────────────────────────────────────────────


def test_emit_writes_a_schema_valid_row(ledger):
    steer_id = emit_deflection(
        governor="search",
        category="REPEATED_SEARCH",
        tier="Y2",
        utterance="where is the parser",
        candidate_key="search:where is the parser",
        suggested_alternative="Use the prior result or read a confirmed target",
        path=ledger,
        captured_at=FIXTURE_CAPTURED_AT,
    )
    assert steer_id == "steer-000001"

    row = json.loads(ledger.read_text(encoding="utf-8").strip())
    assert row["schema"] == "PB-STEER-v1"
    assert row["verdict"] == "STALLED"
    assert row["selected_trajectory"] is None
    assert row["outcome"] is None
    assert row["field_checksum"] == phase0_field_checksum()
    assert row["checksum"].startswith("steer1:")

    candidate = row["candidates"][0]
    assert candidate["pressure"] == {"regression": 1.0}
    assert candidate["dominant_source"] == "regression"
    assert candidate["result"] == "DEFLECTED"
    assert candidate["governor"] == "search"
    assert candidate["category"] == "REPEATED_SEARCH"


def test_ids_are_monotonic_across_emits(ledger):
    first = emit_deflection(
        governor="tool", category="REPEATED_TOOL_CALL", tier="Y2",
        utterance="read_file:{}", candidate_key="tool:read_file:{}", path=ledger,
    )
    second = emit_deflection(
        governor="tool", category="TOOL_BUDGET_EXHAUSTED", tier="Y3",
        utterance="run_tests:{}", candidate_key="tool:run_tests:{}", path=ledger,
    )
    assert first == "steer-000001"
    assert second == "steer-000002"


def test_unknown_category_is_swallowed_not_raised(ledger):
    # The swallow discipline: an emitter bug must never surface as a
    # governor crash. Unknown category -> KeyError -> swallowed -> None.
    result = emit_deflection(
        governor="search", category="NOT_A_REAL_CATEGORY", tier="Y1",
        utterance="q", candidate_key="search:q", path=ledger,
    )
    assert result is None
    assert not ledger.exists() or ledger.read_text() == ""


def test_write_failure_is_swallowed(tmp_path, monkeypatch):
    # Point the ledger at a directory: appending to it must fail, and the
    # emitter must return None instead of raising.
    bad = tmp_path / "not-a-file"
    bad.mkdir()
    monkeypatch.setenv("SCHOLO_STEER_LEDGER_PATH", str(bad))
    result = emit_deflection(
        governor="search", category="REPEATED_SEARCH", tier="Y2",
        utterance="q", candidate_key="search:q",
    )
    assert result is None


def test_float_repr_survives_the_canonical_form(ledger):
    # Python json.dumps must write 1.0, not 1 — the TS checksum recomputation
    # depends on the float lexeme (canonical-json.js contract).
    emit_deflection(
        governor="search", category="REPEATED_SEARCH", tier="Y2",
        utterance="q", candidate_key="search:q", path=ledger,
    )
    raw = ledger.read_text(encoding="utf-8")
    assert '"regression":1.0' in raw
    assert '"regression":1,' not in raw


# ── cross-language fixture drift alarm ──────────────────────────────────────


def test_committed_fixture_matches_the_current_emitter(tmp_path):
    """
    Regenerate the canonical sample and byte-compare with the committed
    fixture. A mismatch means the key order, float repr, or escaping drifted
    between the Python writer and the TypeScript verifier — exactly the
    breakage the fixture exists to catch.
    """
    regen = tmp_path / "regen.jsonl"
    emit_deflection(
        governor="search",
        category="REPEATED_SEARCH",
        tier="Y2",
        utterance="where is the parser",
        candidate_key="search:where is the parser",
        suggested_alternative="Use the prior result or read a confirmed target",
        path=regen,
        captured_at=FIXTURE_CAPTURED_AT,
    )
    assert regen.read_bytes() == PYTHON_FIXTURE.read_bytes(), (
        "steer fixture drifted: regenerate with the emitter and review the "
        "TS-side contract in steer-ledger.ts before committing"
    )


# ── decision parity: the emit-only law ──────────────────────────────────────


def test_search_decisions_identical_with_emitter_live(fresh_field, ledger):
    field = _blocked_search_field(fresh_field)
    decision = should_allow_search(field, "where is the parser", "repeat attempt")
    assert decision.allowed is False
    assert "already searched" in decision.reason
    # The deflection was recorded exactly once.
    lines = ledger.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["candidates"][0]["category"] == "REPEATED_SEARCH"


def test_search_instrumentation_is_wired_at_the_block_site(
    fresh_field, ledger, monkeypatch
):
    """Mutation detector: if the emit call is ever deleted from the block
    site, this recorder never fires and the test goes red."""
    import vaelrix_forcefield.search_governor as governor_mod

    calls: list[tuple] = []
    monkeypatch.setattr(
        governor_mod, "_emit_search_deflection",
        lambda category, tier, query, decision: calls.append((category, tier)),
    )
    field = _blocked_search_field(fresh_field)
    should_allow_search(field, "where is the parser", "repeat attempt")
    assert calls == [("REPEATED_SEARCH", "Y2")]


def test_search_decision_survives_an_emitter_crash(fresh_field, ledger, monkeypatch):
    """PDR §3.2/§7: telemetry failure must never surface as a governor crash.
    Break the file open() underneath emit_deflection; the decision must come
    back unchanged and unraised."""
    import vaelrix_forcefield.steer_emitter as emitter_mod

    def _broken_open(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(emitter_mod.Path, "open", _broken_open)
    field = _blocked_search_field(fresh_field)
    decision = should_allow_search(field, "where is the parser", "repeat attempt")
    assert decision.allowed is False
    assert "already searched" in decision.reason


def test_search_decision_identical_with_emitter_stubbed(fresh_field, ledger, monkeypatch):
    """PDR §7: decisions byte-identical with the emitter stubbed out."""
    import vaelrix_forcefield.search_governor as governor_mod

    field = _blocked_search_field(fresh_field)
    live = should_allow_search(field, "where is the parser", "repeat attempt")

    monkeypatch.setattr(governor_mod, "_emit_search_deflection", lambda *a, **k: None)
    stubbed = should_allow_search(field, "where is the parser", "repeat attempt")

    assert live.allowed == stubbed.allowed
    assert live.reason == stubbed.reason
    assert live.suggestedAlternative == stubbed.suggestedAlternative


def test_allowed_search_writes_nothing(fresh_field, ledger):
    decision = should_allow_search(fresh_field, "a brand new unknown", "genuine gap")
    assert decision.allowed is True
    assert not ledger.exists() or ledger.read_text() == ""


def test_tool_decisions_identical_with_and_without_emitter(fresh_field, ledger, monkeypatch):
    # First call passes and is recorded in the field; the identical second
    # call is the deflection under test.
    field = record_tool_call(fresh_field, "read_file", {"path": "a.py"}, "initial read")

    baseline = should_allow_tool_call(field, "read_file", {"path": "a.py"}, "repeat")
    assert baseline.allowed is False

    # Same input, emitter disabled entirely: identical decision.
    import vaelrix_forcefield.tool_governor as tool_mod

    monkeypatch.setattr(tool_mod, "_emit_tool_deflection", lambda *a, **k: None)
    stubbed = should_allow_tool_call(field, "read_file", {"path": "a.py"}, "repeat")

    assert replace(baseline, tieredSignals=[]) == replace(stubbed, tieredSignals=[])
    assert baseline.allowed == stubbed.allowed
    assert baseline.reason == stubbed.reason
    assert baseline.suggestedAlternative == stubbed.suggestedAlternative
    assert baseline.riskLevel == stubbed.riskLevel

    # And the live run wrote exactly one receipt for the block.
    lines = ledger.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["candidates"][0]["category"] == "REPEATED_TOOL_CALL"
    assert row["candidates"][0]["pressure"] == {"regression": 1.0}


def test_allowed_tool_call_writes_nothing(fresh_field, ledger):
    decision = should_allow_tool_call(fresh_field, "read_file", {"path": "b.py"}, "first read")
    assert decision.allowed is True
    assert not ledger.exists() or ledger.read_text() == ""
