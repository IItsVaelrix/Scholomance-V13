"""Locks the concentration clamp/threshold coupling in SubstrateOsmosisService.

Background: `_derive_concentration` clamps with `min(0.99, ...)` and the scan
tests `concentration >= 0.99`. Those are the same literal in two files' worth of
logic, and the anomaly can only ever fire on that one value. Edit one side and
the anomaly silently inverts:

  * raise the clamp, leave the test  -> nothing ever fires
  * lower the test, leave the clamp   -> everything fires

Both now read `CONCENTRATION_CEILING`, so the two cannot drift apart. These
tests fail loudly if someone reintroduces an inline literal on either side, and
they pin the exact-arithmetic equivalence that makes the float comparison safe
today.

This is deliberately NOT a claim that the old code was broken: it was verified
correct against `decimal.Decimal` over 20,001 value lengths before and after the
change, and `test_matches_exact_decimal_arithmetic` keeps that proof running.
"""
from __future__ import annotations

import inspect
from decimal import Decimal

from tui.services.substrate_osmosis_service import (
    CONCENTRATION_CEILING,
    SubstrateOsmosisService as S,
)

# 20 chars, contains T/Z/:/- so temporal_pressure contributes 0.3
TIMESTAMPISH = "2026-09-02T13:00:00:00Z"

_derive = S._derive_concentration


def _decimal_intent(value_len: int) -> Decimal:
    """What the author means, computed exactly: size_pressure + temporal."""
    return Decimal(value_len) / Decimal(10000) + Decimal("0.3")


def test_ceiling_is_the_expected_value():
    assert CONCENTRATION_CEILING == 0.99


def test_metric_is_clamped_at_the_ceiling():
    # 50,000 chars saturates size_pressure at 1.0, so the clamp must bind.
    huge = _derive("k", "9" * 50000 + TIMESTAMPISH)
    assert huge == CONCENTRATION_CEILING


def test_ordinary_cells_are_far_below_the_ceiling():
    # Guards against the clamp being applied unconditionally (an easy edit to
    # make while hoisting the constant): a small, non-temporal cell must score
    # low, not at the ceiling.
    assert _derive("k", "hello world") < CONCENTRATION_CEILING
    assert _derive("k", "") < CONCENTRATION_CEILING


def test_anomaly_fires_only_at_the_ceiling():
    fired = 0
    for length in range(0, 20001):
        value = "9" * length + TIMESTAMPISH
        if _derive("k", value) >= CONCENTRATION_CEILING:
            fired += 1
    # The ceiling is reachable but not the norm: it binds only for large values.
    assert 0 < fired < 20001


def test_matches_exact_decimal_arithmetic():
    """The float clamp + float `>=` must agree with decimal intent, always."""
    disagreements = []
    for length in range(0, 20001):
        value = "9" * length + TIMESTAMPISH
        n = len(value)
        should = min(Decimal("0.99"), _decimal_intent(n)) >= Decimal("0.99")
        fires = _derive("k", value) >= CONCENTRATION_CEILING
        if should != fires:
            disagreements.append(n)
    assert disagreements == [], f"float/decimal divergence at lengths {disagreements[:10]}"


def test_no_inline_literal_remains_on_either_side():
    """Both sides must read the constant, or the coupling can drift again.

    Scans the two functions' own source for the bare `0.99` rather than
    asserting behaviour, because the behaviour is identical either way — that
    is precisely what makes this defect invisible to a behavioural test.
    """
    for fn in (_derive, S._python_fallback_scan):
        body = inspect.getsource(fn)
        assert "0.99" not in body, (
            f"{fn.__name__} hard-codes the concentration ceiling again; "
            f"both sides must read CONCENTRATION_CEILING or the anomaly can "
            f"be silently disabled by editing only one of them."
        )
        assert "CONCENTRATION_CEILING" in body, (
            f"{fn.__name__} no longer references CONCENTRATION_CEILING"
        )
