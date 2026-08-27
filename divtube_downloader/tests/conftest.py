"""Shared pytest fixtures for the divtube_downloader test suite."""
import pytest


@pytest.fixture(autouse=True)
def _reset_tool_gate():
    """GateKeeper (tui/core/gate_keeper.py) is a module-level singleton that
    tracks real cooldown timestamps per tool name — correct for a real
    cockpit session, but it means any test calling execute_tool() for a
    real tool name shares that state with every OTHER test in the same
    pytest process. Without a reset, an earlier test's call to e.g.
    search_code can leave a live cooldown that spuriously blocks a later,
    unrelated test's call to the same tool name (surfaced by
    test_tool_service_dispatch_golden.py failing only when run alongside
    other tests that also exercise search_code, never in isolation).

    Resetting before every test — not just the tests that know about the
    gate — is the root-cause fix: it isolates tests from each other without
    requiring every current and future test that touches execute_tool to
    remember to do this itself.
    """
    from tui.core.gate_keeper import gate
    gate.reset()
    yield
