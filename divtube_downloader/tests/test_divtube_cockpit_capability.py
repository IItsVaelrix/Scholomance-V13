"""Boon 1: the curated divtube-cockpit SCDNA capability packet.

Asserts the packet is curated (checksum validates, so it was committed via the
capability_compiler, not hand-edited), that it loads cleanly alongside the
existing phonology packet, and that its surface globs match harness paths while
correctly rejecting out-of-scope collab paths. This is the archaeology that
Phenotypic Idealism scope=divtube relies on (Boon 2).
"""
from __future__ import annotations

import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STEAMDECK = os.path.join(ROOT, "steamdeck_brain")
if STEAMDECK not in sys.path:
    sys.path.insert(0, STEAMDECK)

from vaelrix_forcefield.scdna.capability_store import (  # noqa: E402
    load_packets,
    packets_for_path,
)
from vaelrix_forcefield.scdna.capability_types import checksum  # noqa: E402


@pytest.fixture(scope="module")
def packets():
    loaded, errors = load_packets()
    assert errors == [], f"capability packets failed to load: {errors}"
    return loaded


def _by_domain(packets):
    return {str(p.get("domain")): p for p in packets}


def test_divtube_cockpit_packet_loads(packets):
    domains = _by_domain(packets)
    assert "divtube-cockpit" in domains
    # The pre-existing packet must still load — curation is additive.
    assert "phonology" in domains


def test_checksum_validates_not_hand_edited(packets):
    packet = _by_domain(packets)["divtube-cockpit"]
    # load_packets already refuses checksum mismatches; recompute to be explicit.
    assert packet.get("checksum") == checksum(packet)
    assert str(packet["checksum"]).startswith("scd64:")


def test_surfaces_match_harness_paths(packets):
    harness_paths = [
        "divtube_downloader/tui/services/tool_service.py",
        "divtube_downloader/tui/ui/app.py",
        "divtube_downloader/turbovec.js",
        "divtube_downloader/turboquant_plugin.js",
        "divtube_downloader/scripts/scholomance-bridge.mjs",
    ]
    for hp in harness_paths:
        matched = [p["domain"] for p in packets_for_path(hp, packets)]
        assert "divtube-cockpit" in matched, f"{hp} did not match divtube-cockpit"


def test_surfaces_reject_out_of_scope_paths(packets):
    out_of_scope = [
        "codex/server/collab/oauth.py",
        "codex/server/collab/mcp-bridge.js",
        "scripts/align_lyrics.py",
    ]
    for op in out_of_scope:
        matched = [p["domain"] for p in packets_for_path(op, packets)]
        assert "divtube-cockpit" not in matched, f"{op} falsely matched divtube-cockpit"


def test_canonical_capabilities_are_documented(packets):
    packet = _by_domain(packets)["divtube-cockpit"]
    needs = " ".join(c.get("need", "") for c in packet["capabilities"]).lower()
    # The headline harness capabilities must be curated, not omitted.
    assert "tool dispatch" in needs
    assert "vector" in needs
    assert "scoring" in needs
    # Every capability names an existing path (compiler enforces this too).
    for cap in packet["capabilities"]:
        assert cap.get("path"), f"capability {cap.get('need')!r} missing path"
        assert os.path.exists(os.path.join(ROOT, cap["path"])), cap["path"]
