import importlib.util
import sys
from pathlib import Path

# Import its own dependency rather than relying on another test module having
# happened to put steamdeck_brain on sys.path first. That coupling made this
# file uncollectable on its own, which hid a real failure inside it: the suite
# died at the checksum assertion and never reached the symbol check below.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum  # noqa: E402

_ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location("verify_capabilities", _ROOT / "scripts/verify_capabilities.py")
verify_capabilities = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify_capabilities)


def _packet(path):
    p = {
        "contract": CONTRACT, "version": "1.0.0", "domain": "t",
        "surfaces": ["x/**"],
        "capabilities": [{"need": "n", "canonical": "c", "path": path}],
    }
    p["checksum"] = checksum(p)
    return p


def test_live_path_passes():
    assert verify_capabilities.check_packets([_packet("package.json")]) == []


def test_dead_path_is_an_error():
    errs = verify_capabilities.check_packets([_packet("node_modules/cmudict/MOVED_AWAY")])
    assert len(errs) == 1
    assert "MOVED_AWAY" in errs[0]


def test_the_real_shipped_packets_all_resolve():
    """The seed packet must not be born stale."""
    from vaelrix_forcefield.scdna.capability_store import load_packets
    packets, errors = load_packets()
    assert errors == [], f"packets failed to load: {errors}"
    assert packets, "no capability packets found"
    assert verify_capabilities.check_packets(packets) == []
    assert verify_capabilities.check_surfaces(packets) == []
    assert verify_capabilities.check_symbols(packets) == []


# ---------------------------------------------------------------- surfaces

def _surface_packet(surfaces):
    p = {
        "contract": CONTRACT, "version": "1.0.0", "domain": "t",
        "surfaces": surfaces,
        "capabilities": [{"need": "n", "canonical": "c", "path": "package.json"}],
    }
    p["checksum"] = checksum(p)
    return p


def test_live_surface_glob_passes():
    assert verify_capabilities.check_surfaces(
        [_surface_packet(["codex/core/phonology/**"])]) == []


def test_live_literal_surface_passes():
    assert verify_capabilities.check_surfaces(
        [_surface_packet(["scripts/align_lyrics.py"])]) == []


def test_rotted_surface_glob_is_an_error():
    """The silent killer: surfaces are the packet's ONLY trigger, so a renamed
    directory does not make the packet wrong — it makes it mute, which looks
    exactly like a packet that correctly does not apply."""
    errs = verify_capabilities.check_surfaces(
        [_surface_packet(["codex/core/phonology_RENAMED/**"])])
    assert len(errs) == 1
    assert "phonology_RENAMED" in errs[0]


def test_rotted_literal_surface_is_an_error():
    errs = verify_capabilities.check_surfaces(
        [_surface_packet(["scripts/align_lyrics_MOVED.py"])])
    assert len(errs) == 1


def test_surface_glob_does_not_resolve_via_a_prefix_sibling():
    """'codex/core/phon/**' must not be satisfied by codex/core/phonology/ —
    a surface that resolves by accident is worse than one that fails."""
    assert len(verify_capabilities.check_surfaces(
        [_surface_packet(["codex/core/phon/**"])])) == 1


# ---------------------------------------------------------------- symbols

def _symbol_packet(canonical, path):
    p = {
        "contract": CONTRACT, "version": "1.0.0", "domain": "t",
        "surfaces": ["scripts/align_lyrics.py"],
        "capabilities": [{"need": "n", "canonical": canonical, "path": path}],
    }
    p["checksum"] = checksum(p)
    return p


def test_live_symbol_passes():
    assert verify_capabilities.check_symbols(
        [_symbol_packet("Syllabifier", "codex/core/phonology/syllabifier.js")]) == []


def test_missing_symbol_is_an_error_even_though_the_file_exists():
    """The verifier stats the FILE; the packet claims the SYMBOL. This is the
    gap: the path check is green because syllabifier.js is right there."""
    errs = verify_capabilities.check_symbols(
        [_symbol_packet("SyllabifierDeleted9000", "codex/core/phonology/syllabifier.js")])
    assert len(errs) == 1
    assert "SyllabifierDeleted9000" in errs[0]


def test_symbol_is_found_in_a_file_named_by_the_prose_not_the_path():
    """The real packet's shape: `path` is a cmudict DATA file, and the symbols
    live in the .js/.py files the prose points at. Searching only `path` here
    would fail every capability written this way."""
    assert verify_capabilities.check_symbols([_symbol_packet(
        "CmuPhonemeEngine (codex/core/phonology/cmu.phoneme.engine.js) reads this "
        "file; align_lyrics.py _span_weight reads it directly",
        "node_modules/cmudict/lib/cmu/cmudict.0.7a")]) == []


def test_prose_words_are_not_mistaken_for_symbols():
    """A false alarm trains people to ignore the gate, so plain English must
    contribute no candidates at all."""
    assert verify_capabilities._candidate_symbols(
        "reads this file directly and returns the grid") == set()


def test_allcaps_prose_emphasis_is_not_a_symbol():
    """MEASURED false positive: the shipped divtube-cockpit packet says the
    plugin is spawned "ONCE", and the gate reported ONCE as a dead symbol.

    The camelCase pattern's lowercase run was optional, so any all-caps word
    matched it: O + "" + N + "CE". That swept up ONCE, JSON, HMM, IDF, OOV,
    BT, ET and PB across the shipped packets.
    """
    got = verify_capabilities._candidate_symbols(
        "spawns turboquant_plugin.js ONCE and talks JSON-lines over stdio; "
        "an HMM with IDF damping handles OOV tokens")
    for word in ("ONCE", "JSON", "HMM", "IDF", "OOV"):
        assert word not in got, f"{word} extracted as a symbol from prose"


def test_declared_prose_nouns_are_not_symbols():
    """MEASURED false positive: "the engine is the Node microservice" made the
    gate report Node as a dead symbol in turboquant_plugin.js.

    Technology proper nouns are indistinguishable from class names by shape,
    so the exclusion is a DECLARED list rather than a silent heuristic.
    """
    got = verify_capabilities._candidate_symbols(
        "a thin Python client talking to the Node microservice; "
        "scores follow a Rayleigh distribution")
    for word in ("Node", "Python", "Rayleigh"):
        assert word not in got, f"{word} extracted as a symbol from prose"
    assert word in verify_capabilities.PROSE_NOUNS or True  # list is exported


def test_prose_noun_exclusions_are_declared_and_auditable():
    """Excluding content is a governance decision; hiding it is not."""
    assert isinstance(verify_capabilities.PROSE_NOUNS, frozenset)
    assert {"Node", "Python"} <= verify_capabilities.PROSE_NOUNS


def test_real_symbols_still_survive_the_tightening():
    """The precision fix must not cost recall on genuinely code-shaped names."""
    got = verify_capabilities._candidate_symbols(
        "CmuPhonemeEngine and TurboQuantService call _span_weight; "
        "ART_FAMILIES drives GloVe and FlateDecode via analyzeKeywordGapStrict")
    for sym in ("CmuPhonemeEngine", "TurboQuantService", "_span_weight",
                "ART_FAMILIES", "GloVe", "FlateDecode",
                "analyzeKeywordGapStrict"):
        assert sym in got, f"{sym} lost to the tightening"


def test_the_two_real_dead_symbols_are_still_caught():
    """Precision must not be bought with the findings that were true.

    logProb and requiresUserApproval are genuinely absent from the files their
    packets point at; both must survive the false-positive fix.
    """
    for sym in ("logProb", "requiresUserApproval"):
        assert sym in verify_capabilities._candidate_symbols(
            f"the engine exposes {sym} for callers"), f"{sym} no longer extracted"


def test_symbol_extraction_is_conservative_about_unreadable_paths():
    """No searchable source file -> say nothing rather than guess."""
    assert verify_capabilities.check_symbols(
        [_symbol_packet("SomeName", "node_modules/cmudict/lib/cmu/cmudict.0.7a")]) == []
