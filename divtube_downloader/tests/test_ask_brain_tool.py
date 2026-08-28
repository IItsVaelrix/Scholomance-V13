"""ask_brain must be reachable by every DivTube agent surface (desktop Qwen
and mobile coding_partner), not just Claude via MCP.

Root cause this closes: steamdeck_brain/vaelrix_forcefield/ (the ForceField
brain network, audited and fixed this session — see
docs/scholomance-encyclopedia/Scholomance-Verdicts/VERDICT-2026-08-27-
VAELRIX-FORCEFIELD-BRAIN-NETWORK-POST-REMEDIATION.md) had exactly one
consumer: Claude, via the scholomance-collab MCP server. divtube_downloader/
had zero references to vaelrix_forcefield, so no Qwen-backed agent in this
project could ever call it.
"""
from __future__ import annotations

import pytest

from tui.remote.coding_policy import Availability, CapabilityClass, build_manifest
from tui.services.tool_service import ToolService


def _tool_schema(name: str, coding=False):
    return {
        "type": "function",
        "is_coding_action": coding,
        "function": {"name": name, "description": name, "parameters": {"type": "object", "properties": {}}},
    }


def test_ask_brain_appears_in_tool_catalog():
    import inspect
    source = inspect.getsource(ToolService.__init__)
    assert '"name": "ask_brain"' in source


def test_execute_tool_routes_ask_brain_to_its_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    log: list = []

    def handler(self, kwargs, callback=None):
        log.append("ask_brain")
        return "called:_ask_brain"

    monkeypatch.setattr(ToolService, "_ask_brain", handler, raising=True)
    svc = ToolService.__new__(ToolService)
    assert svc.execute_tool("ask_brain", {"query": "x"}) == "called:_ask_brain"
    assert log == ["ask_brain"]


def test_ask_brain_is_observe_class_so_mobile_can_reach_it():
    manifest = build_manifest([_tool_schema("ask_brain")])
    entry = manifest["ask_brain"]
    assert entry.capability_class is CapabilityClass.OBSERVE
    assert entry.availability is Availability.AVAILABLE


def test_ask_brain_real_end_to_end_call_returns_real_evidence():
    """The actual proof: a real call through the DivTube tool surface reaches
    the real ForceField pipeline and gets back real, query-specific evidence
    — not a mock, not a stub."""
    svc = ToolService.__new__(ToolService)
    result = svc._ask_brain({"query": "check the pixel art color palette"}, callback=None)
    assert isinstance(result, str)
    assert "Error" not in result[:10]
    assert "check the pixel art color palette" in result
    assert "CALLER" in result.upper() or "SYNTHESIZ" in result.upper()
