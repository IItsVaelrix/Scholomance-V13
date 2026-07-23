"""Boon 3: golden characterization of ToolService.execute_tool routing.

Locks the god-module's dispatch behaviour BEFORE the strangler-fig extraction so
the refactor is provably behaviour-preserving: every tool_name still routes to
its `_<tool>` handler, and unknown tools still fall through to "Tool not found."
Also pins the module-level bridge cluster that gets lifted into
tui/services/bridge_dispatch.py.
"""
from __future__ import annotations

import os

import pytest

from tui.services.tool_service import ToolService


def _recorder(name: str, log: list):
    def handler(self, kwargs, callback=None):  # noqa: ANN001
        log.append(name)
        return f"called:{name}"

    return handler


# A representative slice spanning the whole if/elif chain (head, middle, tail).
ROUTED_TOOLS = [
    "read_file",
    "search_code",
    "list_directory",
    "find_file",
    "run_command",
    "replace_file_content",
    "cleri_probe",
    "phenotypic_ideal",
    "diagnostic_scan",
    "exec_reset",
]


def test_execute_tool_routes_each_tool_to_its_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    log: list = []
    for tool in ROUTED_TOOLS:
        method = f"_{tool}"
        assert hasattr(ToolService, method), f"missing handler {method}"
        monkeypatch.setattr(ToolService, method, _recorder(method, log), raising=True)

    svc = ToolService.__new__(ToolService)  # bypass heavy __init__
    for tool in ROUTED_TOOLS:
        assert svc.execute_tool(tool, {}) == f"called:_{tool}"

    assert log == [f"_{t}" for t in ROUTED_TOOLS]


def test_execute_tool_unknown_tool_falls_through() -> None:
    svc = ToolService.__new__(ToolService)
    assert svc.execute_tool("definitely_not_a_real_tool", {}) == "Tool not found."


def test_bridge_cluster_is_exposed_on_tool_service() -> None:
    # The module-level bridge helpers must remain importable from tool_service
    # (handlers across the god-module call them by bare name).
    import tui.services.tool_service as ts

    for name in ("PROJECT_ROOT", "BRIDGE_SCRIPT", "_run_bridge", "_safe_path",
                 "_node_bin", "_extract_bridge_json"):
        assert hasattr(ts, name), f"tool_service lost module-level {name}"

    # PROJECT_ROOT is the repo root; BRIDGE_SCRIPT lives under the harness.
    assert ts.PROJECT_ROOT.endswith("Scholomance-V12-main") or os.path.isdir(
        os.path.join(ts.PROJECT_ROOT, "divtube_downloader")
    )
    assert ts.BRIDGE_SCRIPT.endswith(os.path.join("scripts", "scholomance-bridge.mjs"))


def test_safe_path_confines_to_project_root() -> None:
    import tui.services.tool_service as ts

    assert ts._safe_path("divtube_downloader/run.sh") is not None
    # Escaping the root must be refused.
    assert ts._safe_path("../../../../etc/passwd") is None
