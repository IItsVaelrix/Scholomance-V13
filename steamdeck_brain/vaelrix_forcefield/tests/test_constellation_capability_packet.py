from vaelrix_forcefield.scdna.capability_store import (
    REPO_ROOT,
    load_packets,
    matches_surface,
)
from vaelrix_forcefield.scdna.capability_types import checksum


def _packet():
    packets, errors = load_packets()
    assert not [error for error in errors if error.startswith("constellation-os")]
    matches = [packet for packet in packets if packet["domain"] == "constellation-os"]
    assert len(matches) == 1, "constellation-os must have one curated capability packet"
    return matches[0]


def test_constellation_packet_is_compiler_sealed_and_all_paths_exist():
    packet = _packet()
    assert packet["contract"] == "SCDNA-CAPABILITY-v1"
    assert packet["checksum"] == checksum(packet)
    for capability in packet["capabilities"]:
        assert (REPO_ROOT / capability["path"]).exists(), capability["path"]


def test_constellation_packet_names_all_five_backend_evaluation_seams():
    needs = "\n".join(capability["need"] for capability in _packet()["capabilities"])
    for expected in (
        "page orchestration",
        "runtime isolation",
        "packed structural parser",
        "treebank evaluation",
        "failure taxonomy",
        "evaluation evidence",
    ):
        assert expected in needs


def test_constellation_packet_triggers_on_backend_surfaces_not_the_ui_shell():
    packet = _packet()
    for path in (
        "codex/core/constellation/compose-packed.js",
        "codex/runtime/constellationRuntime.js",
        "codex/server/services/constellationPage.service.js",
        "tests/qa/features/constellation-treebank.test.js",
    ):
        assert matches_surface(path, packet), path

    assert not matches_surface("src/pages/Constellation/index.tsx", packet)
    assert not matches_surface("src/core/hmm.js", packet)


def test_constellation_packet_preserves_the_offline_request_path_boundary():
    packet = _packet()
    parts = []
    for capability in packet["capabilities"]:
        parts.append(capability["canonical"])
        parts.extend(capability.get("forbidden", []))
    flattened = "\n".join(parts)
    assert "buildConstellationPage" in flattened
    assert "composePacked" in flattened
    assert "request path" in flattened
    assert "coverage" in flattened
