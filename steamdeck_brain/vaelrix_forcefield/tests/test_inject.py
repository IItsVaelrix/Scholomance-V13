import json
import subprocess
import sys
from pathlib import Path

from vaelrix_forcefield.scdna.inject import distill_query, build_injection, format_context
from vaelrix_forcefield.scdna.compiler import compile_gene
from vaelrix_forcefield.scdna.inject import select_genes, MAX_GENES

_PKG_DIR = Path(__file__).resolve().parents[2]  # steamdeck_brain/


def test_distill_keeps_pixel_domain_tokens():
    q = distill_query("Please render the PixelBrain sprite from coordinates")
    tokens = q.split()
    assert "pixel" in tokens or "pixelbrain" in tokens
    assert "sprite" in tokens
    assert "render" in tokens
    # stopwords / filler removed
    assert "please" not in tokens
    assert "from" not in tokens


def test_distill_empty_for_no_domain_signal():
    assert distill_query("write a short haiku about the quiet moon") == ""


def test_distill_dedupes_and_preserves_order():
    q = distill_query("sprite sprite palette sprite")
    assert q.split() == ["sprite", "palette"]


def _pixel_gene(stable_id, confidence=90, freshness=0.9):
    gene, _compact, _warn = compile_gene(
        stable_id=stable_id,
        source_kind="sprite",
        domain="pixel",
        action="recall",
        activation_brains=["PIXEL_BRAIN"],
        imperative="Render the pixel sprite skeleton from its coordinates.",
        short_meaning="pixel sprite skeleton render",
        confidence=confidence,
        freshness=freshness,
        required_checks=["Verify checksum before use."],
        registry={},
        accept_checklist=True,
    )
    return gene


def test_select_returns_matching_pixel_gene():
    g = _pixel_gene("test.pixel.sprite.v1")
    registry = {g.identity.stableId: g}
    out = select_genes("render the pixel sprite", registry=registry)
    assert [x.identity.stableId for x in out] == ["test.pixel.sprite.v1"]


def test_select_empty_when_no_domain_signal():
    g = _pixel_gene("test.pixel.sprite.v2")
    registry = {g.identity.stableId: g}
    assert select_genes("write a haiku about the moon", registry=registry) == []


def test_select_gates_low_freshness():
    g = _pixel_gene("test.pixel.sprite.v3", freshness=0.2)
    registry = {g.identity.stableId: g}
    assert select_genes("render the pixel sprite", registry=registry) == []


def test_select_caps_results():
    registry = {}
    for i in range(MAX_GENES + 2):
        g = _pixel_gene(f"test.pixel.sprite.cap{i}")
        registry[g.identity.stableId] = g
    assert len(select_genes("render the pixel sprite", registry=registry)) == MAX_GENES


def test_format_empty_is_empty_string():
    assert format_context([]) == ""


def test_build_injection_includes_directive_fields():
    g = _pixel_gene("test.pixel.sprite.fmt")
    registry = {g.identity.stableId: g}
    block = build_injection("render the pixel sprite", registry=registry)
    assert "test.pixel.sprite.fmt" in block
    assert "Render the pixel sprite skeleton from its coordinates." in block
    assert "Required checks:" in block
    assert "Verify checksum before use." in block


def test_build_injection_empty_when_no_match():
    g = _pixel_gene("test.pixel.sprite.nomatch")
    registry = {g.identity.stableId: g}
    assert build_injection("write a haiku about the moon", registry=registry) == ""


def _run_hook(stdin_text):
    proc = subprocess.run(
        [sys.executable, "-m", "vaelrix_forcefield.scdna.inject"],
        input=stdin_text, capture_output=True, text=True, cwd=_PKG_DIR,
    )
    return proc


def test_hook_emits_additional_context_for_matching_prompt():
    # uses the committed registry; a void/ice claymore prompt should match a real gene
    proc = _run_hook(json.dumps({"prompt": "render the void ice claymore sprite from coordinates"}))
    assert proc.returncode == 0
    out = proc.stdout.strip()
    assert out, "expected non-empty stdout"
    payload = json.loads(out)
    assert payload["hookSpecificOutput"]["hookEventName"] == "UserPromptSubmit"
    assert "claymore" in payload["hookSpecificOutput"]["additionalContext"].lower()


def test_hook_silent_for_unrelated_prompt():
    proc = _run_hook(json.dumps({"prompt": "write a haiku about the quiet moon"}))
    assert proc.returncode == 0
    assert proc.stdout.strip() == ""


def test_hook_survives_malformed_stdin():
    proc = _run_hook("this is not json{{{")
    assert proc.returncode == 0
    assert proc.stdout.strip() == ""


def test_main_survives_stdin_read_error(monkeypatch, capsys):
    import io
    from vaelrix_forcefield.scdna import inject

    class _Boom(io.IOBase):
        def read(self, *a, **k):
            raise OSError("stdin exploded")

    monkeypatch.setattr("sys.stdin", _Boom())
    rc = inject.main()
    assert rc == 0
    assert capsys.readouterr().out.strip() == ""


def test_hook_survives_non_object_json():
    for body in ("123", "[1, 2, 3]", "\"just a string\""):
        proc = _run_hook(body)
        assert proc.returncode == 0, f"non-zero for {body!r}"
        assert proc.stdout.strip() == "", f"unexpected output for {body!r}"
