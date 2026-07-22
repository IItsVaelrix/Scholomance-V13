import json

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum
from vaelrix_forcefield.scdna.phenotypic_evidence import attach_evidence, main


def _packet(domain="phonology", surfaces=None):
    p = {
        "contract": CONTRACT,
        "version": "1.0.0",
        "domain": domain,
        "surfaces": surfaces or ["scripts/align_lyrics.py", "codex/core/phonology/**"],
        "capabilities": [
            {
                "need": "word duration",
                "canonical": "CmuPhonemeEngine",
                "path": "node_modules/cmudict/lib/cmu/cmudict.0.7a",
                "forbidden": ["hand-rolled vowel-group counters"],
            },
        ],
    }
    p["checksum"] = checksum(p)
    return p


def test_attach_evidence_matches_capability_for_hit_path(tmp_path):
    f = tmp_path / "phonology.capability.json"
    f.write_text(json.dumps(_packet()), encoding="utf-8")

    out = attach_evidence(
        "phoneme duration",
        ["scripts/align_lyrics.py", "src/unrelated.js"],
        capability_dir=tmp_path,
    )
    assert out["packet_count_loaded"] == 1
    assert len(out["capabilities"]) == 1
    assert out["capabilities"][0]["domain"] == "phonology"
    assert isinstance(out["genes"], list)


def test_attach_evidence_empty_when_no_surface_match(tmp_path):
    f = tmp_path / "phonology.capability.json"
    f.write_text(json.dumps(_packet()), encoding="utf-8")

    out = attach_evidence("watch page", ["src/pages/Watch/WatchPage.jsx"], capability_dir=tmp_path)
    assert out["capabilities"] == []


def test_cli_emits_json(tmp_path, capsys):
    f = tmp_path / "phonology.capability.json"
    f.write_text(json.dumps(_packet()), encoding="utf-8")
    hits = json.dumps(["scripts/align_lyrics.py"])
    code = main([
        "--query", "phoneme",
        "--hits-json", hits,
        "--capability-dir", str(tmp_path),
    ])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["capabilities"][0]["domain"] == "phonology"
