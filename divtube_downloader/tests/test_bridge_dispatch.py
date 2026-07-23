"""Boon 3: unit coverage for the extracted bridge_dispatch module.

Locks the strangler-fig contract: the bridge cluster lives in bridge_dispatch.py
and tool_service.py re-exports the SAME objects (not copies), so the ~50 handlers
that call these by bare name keep working unchanged.
"""
from __future__ import annotations

import os

import tui.services.bridge_dispatch as bd
import tui.services.tool_service as ts


def test_extract_bridge_json_pure_and_noisy():
    assert bd._extract_bridge_json('{"ok": true}') == {"ok": True}
    noisy = 'log noise {"a": 1} trailing'
    assert bd._extract_bridge_json(noisy) == {"a": 1}
    assert bd._extract_bridge_json("") is None
    assert bd._extract_bridge_json(None) is None


def test_safe_path_confines_to_root():
    assert bd._safe_path("divtube_downloader/run.sh") is not None
    assert bd._safe_path("../../../../etc/passwd") is None


def test_node_bin_returns_a_string():
    node = bd._node_bin()
    assert isinstance(node, str) and node  # absolute path or bare "node"


def test_paths_are_well_formed():
    assert os.path.isdir(bd.PROJECT_ROOT)
    assert bd.BRIDGE_SCRIPT == os.path.join(
        bd.PROJECT_ROOT, "divtube_downloader", "scripts", "scholomance-bridge.mjs"
    )


def test_tool_service_reexports_the_same_objects():
    # The whole point of the re-import: identical objects, zero duplication.
    for name in ("PROJECT_ROOT", "BRIDGE_SCRIPT", "_node_bin",
                 "_extract_bridge_json", "_run_bridge", "_safe_path"):
        assert getattr(ts, name) is getattr(bd, name), name
