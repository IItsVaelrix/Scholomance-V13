"""Smoke: bridge phenotypic-ideal path used by ToolService.phenotypic_ideal."""
from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRIDGE = os.path.join(ROOT, "divtube_downloader", "scripts", "scholomance-bridge.mjs")
HITS = os.path.join(ROOT, "tests/qa/features/fixtures/phenotypic-hits.json")


def _node():
    # Prefer nvm node when present (matches ToolService._node_bin)
    nvm = os.path.expanduser("~/.nvm/versions/node")
    if os.path.isdir(nvm):
        versions = sorted(os.listdir(nvm), reverse=True)
        for v in versions:
            candidate = os.path.join(nvm, v, "bin", "node")
            if os.path.exists(candidate):
                return candidate
    return "node"


def test_phenotypic_ideal_bridge_smoke():
    proc = subprocess.run(
        [
            _node(),
            BRIDGE,
            "phenotypic-ideal",
            "phoneme duration",
            "--hits-json",
            HITS,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    packet = json.loads(proc.stdout)
    assert packet.get("contract") == "PHENOTYPIC-IDEAL-v1"
    assert packet.get("boonSeeds")
    assert all(s.get("evidenceRefs") for s in packet["boonSeeds"])


def test_phenotypic_ideal_npm_script_smoke():
    proc = subprocess.run(
        [
            _node(),
            os.path.join(ROOT, "scripts/phenotypic-ideal.mjs"),
            "phoneme duration",
            "--hits-json",
            HITS,
            "--scope",
            "repo",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    packet = json.loads(proc.stdout)
    assert packet["contract"] == "PHENOTYPIC-IDEAL-v1"
