# Capability Packets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo's existing tools reachable by keying retrieval on the *files being edited* instead of the *words being typed*, so we stop rebuilding things like `cmudict` that already exist.

**Architecture:** A `PreToolUse(Write|Edit)` hook matches `tool_input.file_path` against globs that each capability packet declares about itself, and injects that packet via `hookSpecificOutput.additionalContext`. Packets are curated JSON in the `PB-SCDNA-GENE-v1` contract shape (frozen, canonically sorted, checksummed). A verifier asserts every path a packet names still exists; a replay harness proves the packet would have fired before a known duplication.

**Tech Stack:** Python 3.13 (stdlib only — no new deps), Claude Code hooks, pytest (via `.venv`), npm scripts.

**Spec:** `docs/superpowers/specs/2026-07-17-tool-substrate-design.md`

## Global Constraints

- **No new dependencies.** Everything is Python stdlib. The hook runs on every `Write|Edit`; it must not import torch, numpy, or anything heavy.
- **The PDR's curation law is untouched.** `docs/scholomance-encyclopedia/PDR-archive/SCDNA.pdr.md` §7.1: genes/packets are manually curated, never auto-generated; the compiler may reject/warn/emit but **may not commit without human approval**. Nothing in this plan generates a packet from observed behaviour.
- **`distill_query` and `detector.py` scoring are OUT OF SCOPE** (spec §4.1). Do not "fix" them. They serve five agents and are being replaced in role, not repaired.
- **The hook may never cost work.** It never denies, never blocks, always exits 0, and is bounded. A failure degrades to serving nothing.
- **The hook may never fail silently.** A crash must be distinguishable from "no packet applies". This is the direct inversion of the bug in `inject.py`.
- **Tests run via `.venv`, not system python:** `cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest <path> -q`. System python3 has no pytest.
- **Python module path:** all scdna code lives under `steamdeck_brain/vaelrix_forcefield/scdna/`, imported as `vaelrix_forcefield.scdna.<mod>` with `PYTHONPATH=steamdeck_brain`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
| --- | --- |
| `steamdeck_brain/vaelrix_forcefield/scdna/capability_types.py` | CREATE — the `CapabilityPacket`/`Capability` data model and checksum. Pure data + hashing, no I/O. |
| `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py` | CREATE — load packets from disk, verify checksums, glob-match a path to a packet. No hook logic. |
| `steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py` | CREATE — the `PreToolUse` entrypoint: read stdin, match, dedupe, render, emit. |
| `steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py` | CREATE — human-gated authoring CLI (validate → checksum → commit). Mirrors `compiler.py`. |
| `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/phonology.capability.json` | CREATE — the seed packet, from today's measured evidence. |
| `steamdeck_brain/vaelrix_forcefield/scdna/inject.py` | MODIFY — Layer A: `main(argv)`, inert threshold, silent swallow. |
| `scripts/scdna-capability-inject.sh` | CREATE — hook shim, mirrors `scdna-gene-inject.sh`. |
| `scripts/verify_capabilities.py` | CREATE — CI gate: every `path` a packet names must resolve. |
| `scripts/replay_capabilities.py` | CREATE — acceptance harness over a session transcript. |
| `steamdeck_brain/vaelrix_forcefield/tests/test_capability_*.py` | CREATE — pytest suites, one per module. |
| `package.json` | MODIFY — add `verify:capabilities`. |
| `.claude/settings.json` | MODIFY — register the `PreToolUse` hook (last task, after everything is proven). |

---

### Task 1: Layer A — repair `inject.py`'s three real defects

Fixes a test that has never passed, plus two documented-dead pieces of code. Independent of everything else; do it first so the module is testable.

**Files:**
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/inject.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `main(argv: list[str] | None = None) -> int` — the signature the module's own 2026-06-28 plan specified and the implementation never shipped.

- [ ] **Step 1: Run the existing suite and see the failure**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_inject.py -q
```

Expected: `1 failed, 14 passed`. The failure is `test_main_survives_stdin_read_error`, failing at `args = parser.parse_args()` — under pytest, `sys.argv` holds pytest's args and argparse consumes them. This is a real defect, not an environment quirk.

- [ ] **Step 2: Give `main` an argv parameter**

In `inject.py`, change the signature and the parse call:

```python
def main(argv: list[str] | None = None) -> int:
    """UserPromptSubmit hook entrypoint or CLI. Never raises.

    argv is injected for testability: the module's callers pass None (argparse
    then reads sys.argv), but a test harness must be able to hand in its own
    list. Without this, pytest's own argv leaks into parse_args.
    """
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", type=str, default=None, help="Direct prompt string for CLI use")
    parser.add_argument("--agent", type=str, default=None, help="Target agent for context formatting (grok, codex, gemini, opencode)")
    args = parser.parse_args(argv)
```

Leave the rest of `main` unchanged.

- [ ] **Step 3: Run the test to verify it passes**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_inject.py -q
```

Expected: `15 passed`.

- [ ] **Step 4: Write the failing test for the silent swallow**

Append to `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py`:

```python
def test_build_injection_failure_is_reported_not_swallowed(monkeypatch, capsys):
    """A crashed retriever must not be indistinguishable from an empty corpus.

    Before this fix, `except Exception: block = ""` made both produce identical
    output on exit 0 — the reason nobody noticed SCDNA was unreachable.
    """
    import json as _json
    from vaelrix_forcefield.scdna import inject

    def _boom(_task):
        raise RuntimeError("registry exploded")

    monkeypatch.setattr(inject, "build_injection", _boom)
    monkeypatch.setattr("sys.stdin", io.StringIO(_json.dumps({"prompt": "render the sprite"})))
    rc = inject.main([])
    assert rc == 0, "the hook must never break the user's turn"
    err = capsys.readouterr().err
    assert "registry exploded" in err, "the failure must be visible somewhere"
```

Add `import io` to the test file's imports if absent.

- [ ] **Step 5: Run it and verify it fails**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_inject.py::test_build_injection_failure_is_reported_not_swallowed -q
```

Expected: FAIL — `assert "registry exploded" in err` fails because the exception is swallowed and stderr is empty.

- [ ] **Step 6: Report instead of swallowing**

In `inject.py`, both `try/except` blocks around `build_injection` (the CLI path and the hook path) become:

```python
    try:
        block = build_injection(task)
    except Exception as exc:  # never raise into the user's turn...
        # ...but never pretend a crash is an empty corpus either. Both used to
        # print nothing and exit 0, so an unreachable retriever looked exactly
        # like a quiet one.
        print(f"[scdna] injection failed: {exc!r}", file=sys.stderr)
        block = ""
```

- [ ] **Step 7: Run the full suite**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_inject.py -q
```

Expected: `16 passed`.

- [ ] **Step 8: Make the inert threshold real (do NOT delete the constant)**

`select_genes` passes `INJECT_SCORE_THRESHOLD` to `detect_gene_matches`; removing it breaks the call. Keep the name, fix the value.

`INJECT_SCORE_THRESHOLD = 0.35` is dominated by the detector's hardcoded `_BASE_SCORE_MINIMUM = 0.5` (`detector.py:14`), so any value `<= 0.5` changes nothing. Its own comment says so. Replace the constant and its comment block in `inject.py` with:

```python
# Passed to detect_gene_matches as the final_score floor. It MUST stay above the
# detector's own _BASE_SCORE_MINIMUM (detector.py: 0.5) or it is inert — a knob
# that does nothing is worse than no knob, because it invites tuning that has no
# effect. Raise this to tighten matching; lowering it below 0.5 does nothing.
INJECT_SCORE_THRESHOLD = 0.5
```

- [ ] **Step 9: Run the full suite to confirm no behaviour change**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/ -q
```

Expected: all pass. Setting the constant to 0.5 is behaviour-preserving — the effective floor was already 0.5.

- [ ] **Step 10: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/inject.py steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
git commit -m "$(cat <<'EOF'
fix(scdna): main(argv), report injection failures, retire the inert threshold

Three real defects in the gene injector, found while designing around it.

main() parsed sys.argv unconditionally, so pytest's own argv leaked into
argparse and test_main_survives_stdin_read_error has never passed. The module's
2026-06-28 plan specified main(argv=None); the implementation shipped without it.

`except Exception: block = ""` made a crashed retriever byte-identical to an
empty corpus, both exit 0. That is why nobody noticed SCDNA was unreachable.
It now reports to stderr and still never raises into the user's turn.

INJECT_SCORE_THRESHOLD = 0.35 was inert: the detector's hardcoded
_BASE_SCORE_MINIMUM (0.5) dominates it, as its own comment noted. Set to 0.5 —
behaviour-preserving, and no longer invites tuning that cannot do anything.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Capability packet data model + checksum

**Files:**
- Create: `steamdeck_brain/vaelrix_forcefield/scdna/capability_types.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_capability_types.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CONTRACT = "SCDNA-CAPABILITY-v1"`
  - `stable_stringify(value: object) -> str`
  - `checksum(packet: dict) -> str` — returns `"scd64:<64 chars>"`; computed over the packet **minus** its own `checksum` key.
  - `validate_packet(packet: dict) -> list[str]` — returns human-readable errors; empty list means valid.

- [ ] **Step 1: Write the failing tests**

Create `steamdeck_brain/vaelrix_forcefield/tests/test_capability_types.py`:

```python
import copy

from vaelrix_forcefield.scdna.capability_types import (
    CONTRACT, checksum, stable_stringify, validate_packet,
)

VALID = {
    "contract": CONTRACT,
    "version": "1.0.0",
    "domain": "phonology",
    "surfaces": ["scripts/align_lyrics.py"],
    "capabilities": [
        {
            "need": "word duration",
            "canonical": "CmuPhonemeEngine",
            "path": "node_modules/cmudict/lib/cmu/cmudict.0.7a",
            "forbidden": ["hand-rolled vowel-group counters"],
        }
    ],
}


def test_stable_stringify_is_key_order_independent():
    a = stable_stringify({"b": 1, "a": [2, {"d": 3, "c": 4}]})
    b = stable_stringify({"a": [2, {"c": 4, "d": 3}], "b": 1})
    assert a == b


def test_checksum_ignores_the_checksum_field():
    p = copy.deepcopy(VALID)
    bare = checksum(p)
    p["checksum"] = "scd64:" + "0" * 64
    assert checksum(p) == bare, "a packet's checksum must not depend on itself"


def test_checksum_changes_when_content_changes():
    p = copy.deepcopy(VALID)
    q = copy.deepcopy(VALID)
    q["capabilities"][0]["path"] = "somewhere/else"
    assert checksum(p) != checksum(q)


def test_valid_packet_has_no_errors():
    assert validate_packet(VALID) == []


def test_missing_required_field_is_an_error():
    p = copy.deepcopy(VALID)
    del p["surfaces"]
    assert any("surfaces" in e for e in validate_packet(p))


def test_capability_without_a_path_is_rejected():
    """A capability that names no path cannot be verified, and an unverifiable
    claim is exactly the confident-wrong-answer this design exists to prevent."""
    p = copy.deepcopy(VALID)
    del p["capabilities"][0]["path"]
    assert any("path" in e for e in validate_packet(p))


def test_wrong_contract_is_rejected():
    p = copy.deepcopy(VALID)
    p["contract"] = "SOMETHING-ELSE-v9"
    assert any("contract" in e for e in validate_packet(p))
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_types.py -q
```

Expected: collection error — `No module named 'vaelrix_forcefield.scdna.capability_types'`.

- [ ] **Step 3: Implement the module**

Create `steamdeck_brain/vaelrix_forcefield/scdna/capability_types.py`:

```python
"""SCDNA — capability packet data model.

A capability packet answers "what already does this, and what must I not
rebuild?" for one domain. Modelled on codex/core/pixelbrain/scdna-gene-packet.js
(PB-SCDNA-GENE-v1): a named contract, canonical ordering, and a checksum over a
stable stringification, so a hand-edited packet is detectable.

Every capability MUST name a `path`. A claim that cannot be checked against the
repo is worse than no claim — it is a confident wrong answer that ages into a
lie. See docs/superpowers/specs/2026-07-17-tool-substrate-design.md §7.
"""
from __future__ import annotations

import hashlib
import json

CONTRACT = "SCDNA-CAPABILITY-v1"
_REQUIRED_PACKET = ("contract", "version", "domain", "surfaces", "capabilities")
_REQUIRED_CAPABILITY = ("need", "canonical", "path")


def stable_stringify(value: object) -> str:
    """Deterministic JSON: keys sorted at every depth, no incidental whitespace."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def checksum(packet: dict) -> str:
    """scd64 checksum over the packet MINUS its own checksum field."""
    bare = {k: v for k, v in packet.items() if k != "checksum"}
    digest = hashlib.sha256(stable_stringify(bare).encode("utf-8")).hexdigest()
    return f"scd64:{digest[:64]}"


def validate_packet(packet: dict) -> list[str]:
    """Structural errors, human-readable. Empty list means valid."""
    errors: list[str] = []
    if not isinstance(packet, dict):
        return ["packet is not an object"]

    for field in _REQUIRED_PACKET:
        if field not in packet:
            errors.append(f"missing required field: {field}")

    if packet.get("contract") != CONTRACT:
        errors.append(f"contract must be {CONTRACT!r}, got {packet.get('contract')!r}")

    surfaces = packet.get("surfaces")
    if not isinstance(surfaces, list) or not surfaces:
        errors.append("surfaces must be a non-empty list of globs")
    elif not all(isinstance(s, str) and s for s in surfaces):
        errors.append("every surface must be a non-empty string")

    caps = packet.get("capabilities")
    if not isinstance(caps, list) or not caps:
        errors.append("capabilities must be a non-empty list")
    else:
        for i, cap in enumerate(caps):
            if not isinstance(cap, dict):
                errors.append(f"capabilities[{i}] is not an object")
                continue
            for field in _REQUIRED_CAPABILITY:
                if not cap.get(field):
                    errors.append(f"capabilities[{i}] missing required field: {field}")
    return errors
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_types.py -q
```

Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/capability_types.py steamdeck_brain/vaelrix_forcefield/tests/test_capability_types.py
git commit -m "$(cat <<'EOF'
feat(scdna): capability packet data model (SCDNA-CAPABILITY-v1)

Modelled on createSCDNAGenePacket: named contract, canonical ordering,
deterministic checksum over a stable stringification, so a hand-edited packet
is detectable rather than silently trusted.

Every capability must name a path. An unverifiable claim ages into a confident
wrong answer, which is the failure class this whole design exists to prevent.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Packet store — load, verify, glob-match

**Files:**
- Create: `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_capability_store.py`

**Interfaces:**
- Consumes: `capability_types.{CONTRACT, checksum, validate_packet}`.
- Produces:
  - `CAPABILITY_DIR: Path` — `steamdeck_brain/vaelrix_forcefield/scdna/capabilities`
  - `REPO_ROOT: Path`
  - `load_packets(directory: Path | None = None) -> tuple[list[dict], list[str]]` — `(packets, errors)`. A packet failing checksum or validation is **excluded** and reported in `errors`.
  - `matches_surface(rel_path: str, packet: dict) -> bool`
  - `packets_for_path(abs_or_rel_path: str, packets: list[dict]) -> list[dict]`

- [ ] **Step 1: Write the failing tests**

Create `steamdeck_brain/vaelrix_forcefield/tests/test_capability_store.py`:

```python
import json

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum
from vaelrix_forcefield.scdna.capability_store import (
    load_packets, matches_surface, packets_for_path,
)


def _packet(domain="phonology", surfaces=None):
    p = {
        "contract": CONTRACT,
        "version": "1.0.0",
        "domain": domain,
        "surfaces": surfaces or ["scripts/align_lyrics.py", "codex/core/phonology/**"],
        "capabilities": [
            {"need": "word duration", "canonical": "CmuPhonemeEngine",
             "path": "node_modules/cmudict/lib/cmu/cmudict.0.7a",
             "forbidden": ["hand-rolled vowel-group counters"]},
        ],
    }
    p["checksum"] = checksum(p)
    return p


def _write(tmp_path, packet):
    f = tmp_path / f"{packet['domain']}.capability.json"
    f.write_text(json.dumps(packet), encoding="utf-8")
    return f


def test_exact_surface_matches():
    assert matches_surface("scripts/align_lyrics.py", _packet())


def test_glob_surface_matches_nested():
    assert matches_surface("codex/core/phonology/syllabifier.js", _packet())


def test_unrelated_path_does_not_match():
    """The anti-wallpaper test. A packet that fires on everything is furniture."""
    assert not matches_surface("src/pages/Watch/WatchPage.css", _packet())


def test_load_packets_reads_a_valid_packet(tmp_path):
    _write(tmp_path, _packet())
    packets, errors = load_packets(tmp_path)
    assert errors == []
    assert len(packets) == 1
    assert packets[0]["domain"] == "phonology"


def test_tampered_packet_is_refused_and_reported(tmp_path):
    p = _packet()
    p["capabilities"][0]["path"] = "somewhere/i/edited/by/hand"   # checksum now stale
    _write(tmp_path, p)
    packets, errors = load_packets(tmp_path)
    assert packets == [], "a packet failing its checksum must not be served"
    assert any("checksum" in e for e in errors)


def test_invalid_packet_is_refused_and_reported(tmp_path):
    p = _packet()
    del p["capabilities"][0]["path"]
    p["checksum"] = checksum(p)      # honestly re-checksummed, but still invalid
    _write(tmp_path, p)
    packets, errors = load_packets(tmp_path)
    assert packets == []
    assert any("path" in e for e in errors)


def test_packets_for_path_accepts_absolute_paths(tmp_path):
    packets = [_packet()]
    hits = packets_for_path("/home/deck/Downloads/Scholomance-V12-main/scripts/align_lyrics.py", packets)
    assert len(hits) == 1


def test_packets_for_path_returns_empty_for_unrelated(tmp_path):
    assert packets_for_path("/tmp/whatever.txt", [_packet()]) == []
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_store.py -q
```

Expected: collection error — `No module named 'vaelrix_forcefield.scdna.capability_store'`.

- [ ] **Step 3: Implement the module**

Create `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py`:

```python
"""SCDNA — capability packet store: load, verify, and match paths to packets.

The match is a glob against globs the packet declares about itself, so there is
no separate file->domain map to drift out of sync. A glob is true or false: it
cannot fire on an incidental token the way the word-based retriever fires on
"pixelbrain" appearing in a path (spec §2).
"""
from __future__ import annotations

import fnmatch
import json
from pathlib import Path

from .capability_types import checksum, validate_packet

_HERE = Path(__file__).resolve()
CAPABILITY_DIR = _HERE.parent / "capabilities"
# steamdeck_brain/vaelrix_forcefield/scdna/x.py -> repo root
REPO_ROOT = _HERE.parents[3]


def load_packets(directory: Path | None = None) -> tuple[list[dict], list[str]]:
    """Load every *.capability.json. Returns (valid_packets, errors).

    A packet that fails its checksum was hand-edited outside the compiler: it is
    uncurated content wearing a curated badge, so it is excluded, not served.
    """
    directory = directory or CAPABILITY_DIR
    packets: list[dict] = []
    errors: list[str] = []
    if not directory.is_dir():
        return packets, errors

    for path in sorted(directory.glob("*.capability.json")):
        try:
            packet = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"{path.name}: unreadable ({exc!r})")
            continue

        problems = validate_packet(packet)
        if problems:
            errors.append(f"{path.name}: invalid — {'; '.join(problems)}")
            continue

        declared = packet.get("checksum")
        actual = checksum(packet)
        if declared != actual:
            errors.append(
                f"{path.name}: checksum mismatch (declared {declared}, computed {actual}) "
                f"— hand-edited outside the compiler; refusing to serve it"
            )
            continue

        packets.append(packet)
    return packets, errors


def _relativize(path: str) -> str:
    p = Path(path)
    if p.is_absolute():
        try:
            return str(p.relative_to(REPO_ROOT))
        except ValueError:
            return str(p)
    return str(p)


def matches_surface(rel_path: str, packet: dict) -> bool:
    rel = _relativize(rel_path)
    for surface in packet.get("surfaces", []):
        if fnmatch.fnmatch(rel, surface):
            return True
        # fnmatch's * crosses separators, but "a/**" should also match "a/b/c".
        if surface.endswith("/**") and rel.startswith(surface[:-3] + "/"):
            return True
    return False


def packets_for_path(path: str, packets: list[dict]) -> list[dict]:
    return [p for p in packets if matches_surface(path, p)]
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_store.py -q
```

Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py steamdeck_brain/vaelrix_forcefield/tests/test_capability_store.py
git commit -m "$(cat <<'EOF'
feat(scdna): capability packet store — load, checksum-verify, glob-match

Packets declare their own surfaces, so there is no separate file->domain map to
rot. A glob match is true or false; it cannot fire on an incidental token the
way the word retriever fires on "pixelbrain" appearing in a file path.

A packet failing its checksum is excluded and reported, never served: it is
uncurated content wearing a curated badge.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The seed phonology packet + the verifier

The packet is the payload; the verifier is what stops it becoming a lie. They ship together because neither is meaningful alone.

**Files:**
- Create: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/phonology.capability.json`
- Create: `scripts/verify_capabilities.py`
- Modify: `package.json`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_verify_capabilities.py`

**Interfaces:**
- Consumes: `capability_store.{load_packets, REPO_ROOT}`, `capability_types.checksum`.
- Produces: `verify_capabilities.check_packets(packets: list[dict]) -> list[str]` — returns dead-path errors; empty means all paths resolve. `main(argv=None) -> int` exits 1 if any error.

- [ ] **Step 1: Write the failing test**

Create `steamdeck_brain/vaelrix_forcefield/tests/test_verify_capabilities.py`:

```python
import importlib.util
from pathlib import Path

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum

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
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_verify_capabilities.py -q
```

Expected: FAIL — `scripts/verify_capabilities.py` does not exist.

- [ ] **Step 3: Write the verifier**

Create `scripts/verify_capabilities.py`:

```python
#!/usr/bin/env python3
"""Capability falsifier — does every path a packet names still exist?

A capability packet is a machine for producing confident wrong answers if it is
allowed to age. A packet that says cmudict.0.7a after someone moves that file is
worse than no packet at all. This is the gate that keeps the toolbox honest.

Usage:
  python scripts/verify_capabilities.py          # all packets
  npm run verify:capabilities

Exit code is non-zero if any capability names a path that no longer resolves.
"""
from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "steamdeck_brain"))

from vaelrix_forcefield.scdna.capability_store import REPO_ROOT, load_packets  # noqa: E402


def check_packets(packets: list[dict]) -> list[str]:
    """Dead-path errors, human-readable. Empty list means every claim resolves."""
    errors: list[str] = []
    for packet in packets:
        for cap in packet.get("capabilities", []):
            path = cap.get("path")
            if not path:
                continue
            if not (REPO_ROOT / path).exists():
                errors.append(
                    f"{packet['domain']}: '{cap['need']}' names {path!r}, which does not exist. "
                    f"The packet is claiming something untrue."
                )
    return errors


def main(argv: list[str] | None = None) -> int:
    packets, load_errors = load_packets()
    for err in load_errors:
        print(f"  LOAD  {err}")
    dead = check_packets(packets)
    for err in dead:
        print(f"  DEAD  {err}")
    print(f"\n{len(packets)} packet(s) loaded, "
          f"{sum(len(p['capabilities']) for p in packets)} capabilities, "
          f"{len(dead)} dead path(s), {len(load_errors)} load error(s)")
    return 1 if (dead or load_errors) else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Write the seed packet**

Create `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/phonology.capability.json`. Every claim below was measured on 2026-07-17; do not add claims you have not verified.

```json
{
  "contract": "SCDNA-CAPABILITY-v1",
  "version": "1.0.0",
  "domain": "phonology",
  "surfaces": [
    "scripts/align_lyrics.py",
    "scripts/scan_bpm.py",
    "codex/core/phonology/**",
    "src/pages/Visualiser/AlbumLyrics.tsx",
    "src/pages/Visualiser/BytecodeVisualiserPage.tsx",
    "src/kits/scholomance-visualizer-kit/utils/lyricAlignment.ts"
  ],
  "capabilities": [
    {
      "need": "word duration / syllable weight / how long a word occupies the voice",
      "canonical": "CmuPhonemeEngine (codex/core/phonology/cmu.phoneme.engine.js) reads this file; align_lyrics.py _span_weight reads it directly",
      "path": "node_modules/cmudict/lib/cmu/cmudict.0.7a",
      "coverage": "95-99% of lyric words; fall back to letter count, the next best proxy measured",
      "evidence": "phoneme-weighted interpolation cut mean placement error 46-63% on 12-word runs across three tracks vs equal shares; beat character-length at nearly every run length; vowel-nuclei (plain syllable count) was worst of the three",
      "forbidden": [
        "hand-rolling a vowel-group syllable counter — 'strength' is 1 syllable and 7 phonemes",
        "melismaBonus as a model of sung stretch: it matches /([aeiou])\\1{2,}/ in the SPELLING and returned 0 for all 577 words of a real lyric",
        "spreading interpolated words evenly across a gap — 'I' and 'unfathomably' do not take the same time"
      ]
    },
    {
      "need": "syllabification",
      "canonical": "Syllabifier",
      "path": "codex/core/phonology/syllabifier.js",
      "forbidden": ["graphemic vowel-group heuristics outside a documented pre-init fallback"]
    },
    {
      "need": "grapheme-to-phoneme for words absent from cmudict",
      "canonical": "runG2PJury",
      "path": "codex/core/phonology/g2p/g2p.adapter.js",
      "forbidden": ["guessing a pronunciation inline"]
    },
    {
      "need": "lyric timing / forced alignment",
      "canonical": "align_lyrics.py (MMS_FA + demucs) — produces alignment-v1 artifacts the frontend consumes",
      "path": "scripts/align_lyrics.py",
      "evidence": "NOTE: scripts/align-track.mts is a SECOND, WhisperX-based aligner producing a different sidecar format. Which one wins has never been decided; align_lyrics.py is the one wired to public/data/alignment and the visualiser.",
      "forbidden": ["adding a third aligner", "assuming align-track.mts output is interchangeable"]
    },
    {
      "need": "is a declared bpm real, or a DEFAULT_PACING placeholder?",
      "canonical": "scan_bpm.py — Rayleigh lock of confident word onsets against a 16th grid, judged against a shuffled-gap noise ceiling",
      "path": "scripts/scan_bpm.py",
      "evidence": "caught a fabricated bpm 120 on Sonic Thaumaturgy (audio says 90.00, later confirmed); bpm seeds computeFingerprint, so a wrong tempo renders the wrong visual silently",
      "forbidden": ["writing a bpm with no stated provenance", "treating DEFAULT_PACING's 120 as measured"]
    }
  ]
}
```

- [ ] **Step 5: Checksum the packet**

The packet above has no `checksum` field yet, so `load_packets` will refuse it. Compute and insert it:

```bash
cd /home/deck/Downloads/Scholomance-V12-main/steamdeck_brain
PYTHONPATH=. ../.venv/bin/python - <<'EOF'
import json
from pathlib import Path
from vaelrix_forcefield.scdna.capability_types import checksum, validate_packet
p = Path("vaelrix_forcefield/scdna/capabilities/phonology.capability.json")
packet = json.loads(p.read_text())
errs = validate_packet(packet)
assert not errs, errs
packet["checksum"] = checksum(packet)
p.write_text(json.dumps(packet, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("checksum:", packet["checksum"])
EOF
```

Expected: prints an `scd64:` checksum.

- [ ] **Step 6: Run the tests**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_verify_capabilities.py -q
```

Expected: `3 passed`. If `test_the_real_shipped_packets_all_resolve` fails, a path in the seed packet is wrong — fix the packet, not the test.

- [ ] **Step 7: Add the npm script**

In `package.json`, immediately after the `"verify:bpm"` line:

```json
    "verify:capabilities": "python3 scripts/verify_capabilities.py",
```

- [ ] **Step 8: Run it**

```bash
cd /home/deck/Downloads/Scholomance-V12-main && npm run verify:capabilities --silent; echo "exit=$?"
```

Expected: `1 packet(s) loaded, 5 capabilities, 0 dead path(s), 0 load error(s)` and `exit=0`.

- [ ] **Step 9: Prove the gate can fail**

```bash
cd /home/deck/Downloads/Scholomance-V12-main
mv node_modules/cmudict/lib/cmu/cmudict.0.7a /tmp/cmudict.moved
npm run verify:capabilities --silent > /dev/null 2>&1; echo "with the file moved: exit=$? (want 1)"
mv /tmp/cmudict.moved node_modules/cmudict/lib/cmu/cmudict.0.7a
npm run verify:capabilities --silent > /dev/null 2>&1; echo "restored: exit=$? (want 0)"
```

Expected: `exit=1` then `exit=0`. A gate that cannot fail is not a gate.

- [ ] **Step 10: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/capabilities/phonology.capability.json scripts/verify_capabilities.py package.json steamdeck_brain/vaelrix_forcefield/tests/test_verify_capabilities.py
git commit -m "$(cat <<'EOF'
feat(scdna): seed phonology packet + verify:capabilities gate

The packet records what 2026-07-17 cost us to rediscover: word duration comes
from cmudict via CmuPhonemeEngine; melismaBonus is orthographic and returned 0
for all 577 words of a real lyric; there are two aligners and nobody has decided
which wins; a declared bpm may be DEFAULT_PACING's 120 wearing a measurement's
clothes.

The verifier is what stops the packet becoming a lie: every path it names must
resolve, or the build fails. Proven to fail by moving cmudict.0.7a away.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The trigger — PreToolUse hook

**Files:**
- Create: `steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py`
- Create: `scripts/scdna-capability-inject.sh`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_capability_inject.py`

**Interfaces:**
- Consumes: `capability_store.{load_packets, packets_for_path, REPO_ROOT}`.
- Produces:
  - `RE_ARM_EDITS: int` (= 10)
  - `render_packet(packet: dict, stale: set[str]) -> str`
  - `should_serve(session_id: str, domain: str) -> bool` — True on first sight, or once `RE_ARM_EDITS` matching edits have passed since the last serve. Increments the counter as a side effect.
  - `build_block(file_path: str, session_id: str, packets: list[dict] | None = None) -> str`
  - `main(argv: list[str] | None = None) -> int`

**Verified hook contract (spike 2026-07-17):** `PreToolUse` **can** inject via `hookSpecificOutput.additionalContext`; `systemMessage` does **not** reach the model. stdin carries `tool_name`, `tool_input.file_path`, `session_id`, `transcript_path`, `cwd`.

**Cadence is measured, not chosen.** Replay of session `56188e89` (2026-07-17):
the first `align_lyrics.py` edit is **#14**; the `_span_weight` duplication is
**#51** — a 37-edit gap. So **fire-once is refuted**: it would have served during
a task about anchor rules, 37 edits before the mistake it exists to prevent.
Fire-always lands on #51 but serves 14 times in a 74-edit session. A re-arm
window of 10 serves at **#14, #33, #51** — three times, and it lands exactly on
the duplication. That is the best coverage-to-noise the data supports.

- [ ] **Step 1: Write the failing tests**

Create `steamdeck_brain/vaelrix_forcefield/tests/test_capability_inject.py`:

```python
import io
import json

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum
from vaelrix_forcefield.scdna import capability_inject


def _packet(path="package.json"):
    p = {
        "contract": CONTRACT, "version": "1.0.0", "domain": "phonology",
        "surfaces": ["scripts/align_lyrics.py"],
        "capabilities": [{"need": "word duration", "canonical": "CmuPhonemeEngine",
                          "path": path, "forbidden": ["hand-rolled vowel counters"]}],
    }
    p["checksum"] = checksum(p)
    return p


def test_matching_path_produces_a_block(tmp_path, monkeypatch):
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    block = capability_inject.build_block("scripts/align_lyrics.py", "sess-1", [_packet()])
    assert "CmuPhonemeEngine" in block
    assert "hand-rolled vowel counters" in block


def test_unrelated_path_produces_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    assert capability_inject.build_block("src/pages/Watch/WatchPage.css", "sess-1", [_packet()]) == ""


def test_the_very_next_edit_is_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    first = capability_inject.build_block("scripts/align_lyrics.py", "sess-2", [_packet()])
    second = capability_inject.build_block("scripts/align_lyrics.py", "sess-2", [_packet()])
    assert first != ""
    assert second == "", "a packet must not nag on consecutive edits"


def test_it_re_arms_after_the_window(tmp_path, monkeypatch):
    """Fire-once is REFUTED by replay: on 2026-07-17 it would have served at
    edit #14 and the _span_weight duplication happened at #51 — 37 edits later,
    long stale. The packet must come back."""
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    packets = [_packet()]
    served = 0
    for _ in range(capability_inject.RE_ARM_EDITS + 1):
        if capability_inject.build_block("scripts/align_lyrics.py", "sess-3", packets):
            served += 1
    assert served == 2, f"expected a re-arm within the window, served {served}"


def test_a_different_session_gets_it_again(tmp_path, monkeypatch):
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    capability_inject.build_block("scripts/align_lyrics.py", "sess-4", [_packet()])
    assert capability_inject.build_block("scripts/align_lyrics.py", "sess-5", [_packet()]) != ""


def test_dead_path_is_marked_stale_not_served_as_fact(tmp_path, monkeypatch):
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    block = capability_inject.build_block("scripts/align_lyrics.py", "sess-5",
                                          [_packet(path="node_modules/GONE_AWAY")])
    assert "STALE" in block, "a dead path must not be recommended as if it were live"


def test_main_emits_additionalContext(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    monkeypatch.setattr(capability_inject, "load_packets", lambda *a, **k: ([_packet()], []))
    payload = {"tool_name": "Edit", "session_id": "sess-6",
               "tool_input": {"file_path": "scripts/align_lyrics.py"}}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(payload)))
    rc = capability_inject.main([])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["hookSpecificOutput"]["hookEventName"] == "PreToolUse"
    assert "CmuPhonemeEngine" in out["hookSpecificOutput"]["additionalContext"]


def test_main_never_denies(tmp_path, monkeypatch, capsys):
    """The hook must never cost the user work, whatever happens."""
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)
    monkeypatch.setattr("sys.stdin", io.StringIO("not json at all"))
    rc = capability_inject.main([])
    assert rc == 0
    assert "permissionDecision" not in capsys.readouterr().out


def test_internal_failure_is_reported_not_swallowed(tmp_path, monkeypatch, capsys):
    """The inverse of inject.py's `except Exception: block = ''`."""
    monkeypatch.setattr(capability_inject, "_STATE_DIR", tmp_path)

    def _boom(*a, **k):
        raise RuntimeError("store exploded")

    monkeypatch.setattr(capability_inject, "load_packets", _boom)
    payload = {"tool_name": "Edit", "session_id": "s", "tool_input": {"file_path": "scripts/align_lyrics.py"}}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(payload)))
    rc = capability_inject.main([])
    assert rc == 0
    captured = capsys.readouterr()
    assert "store exploded" in (captured.out + captured.err)
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_inject.py -q
```

Expected: collection error — `No module named 'vaelrix_forcefield.scdna.capability_inject'`.

- [ ] **Step 3: Implement the module**

Create `steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py`:

```python
"""SCDNA — capability injection on PreToolUse(Write|Edit).

The inversion: the query is the FILE BEING EDITED, not the words being typed.
You cannot name what you do not know exists — that is what made the word-based
retriever unable to reduce repeated search (spec §2.1) — but you do touch files.

Verified contract (spike 2026-07-17): PreToolUse CAN inject via
hookSpecificOutput.additionalContext. systemMessage does NOT reach the model.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

from .capability_store import REPO_ROOT, load_packets, packets_for_path

_STATE_DIR = Path(tempfile.gettempdir()) / "scdna-capability-served"

# Edits on a domain's surface that must pass before the packet may speak again.
# MEASURED, not chosen: replaying session 56188e89 (2026-07-17), the first
# align_lyrics.py edit was #14 and the _span_weight duplication was #51 — so
# fire-once is refuted, it misses by 37 edits. Fire-always serves 14 times in a
# 74-edit session (wallpaper: the existing genes fired 4x and were heeded 0x).
# A window of 10 serves at #14/#33/#51 — three times, and it lands on the
# duplication. Re-measure with scripts/replay_capabilities.py before changing.
RE_ARM_EDITS = 10


def _state_file(session_id: str, domain: str) -> Path:
    safe = "".join(c for c in f"{session_id}-{domain}" if c.isalnum() or c in "-_")
    return _STATE_DIR / safe


def should_serve(session_id: str, domain: str) -> bool:
    """True on first sight, then once every RE_ARM_EDITS matching edits.

    Counts edits, not wall-clock: the risk is going stale across a long task, and
    edits are what measure that distance.
    """
    path = _state_file(session_id, domain)
    _STATE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        since = int(path.read_text(encoding="utf-8").strip())
    except Exception:
        path.write_text("0", encoding="utf-8")   # first sight -> serve, reset
        return True
    if since + 1 >= RE_ARM_EDITS:
        path.write_text("0", encoding="utf-8")
        return True
    path.write_text(str(since + 1), encoding="utf-8")
    return False


def render_packet(packet: dict, stale: set[str]) -> str:
    """A table, not an essay. Long directives become wallpaper: the existing
    genes are paragraphs, and WAND_CHEMICAL_STROKE_PROPAGATION fired four times
    in one session and was acted on zero times."""
    lines = [f"## Canonical tools for `{packet['domain']}` — already in this repo",
             "_Matched because the file you are editing is this domain's surface._", ""]
    for cap in packet["capabilities"]:
        mark = "  **[STALE — path missing, do not trust]**" if cap["path"] in stale else ""
        lines.append(f"- **{cap['need']}** → `{cap['canonical']}`{mark}")
        lines.append(f"  - path: `{cap['path']}`")
        if cap.get("coverage"):
            lines.append(f"  - coverage: {cap['coverage']}")
        if cap.get("evidence"):
            lines.append(f"  - evidence: {cap['evidence']}")
        for f in cap.get("forbidden", []):
            lines.append(f"  - DO NOT: {f}")
    return "\n".join(lines)


def build_block(file_path: str, session_id: str, packets: list[dict] | None = None) -> str:
    if packets is None:
        packets, _ = load_packets()
    hits = packets_for_path(file_path, packets)
    blocks: list[str] = []
    for packet in hits:
        if not should_serve(session_id, packet["domain"]):
            continue
        # stat() the path we are about to recommend, every single time. The
        # packet carries the means of its own refutation and checks it at the
        # only moment that matters — a dead path is marked, never asserted.
        stale = {c["path"] for c in packet["capabilities"]
                 if not (REPO_ROOT / c["path"]).exists()}
        blocks.append(render_packet(packet, stale))
    return "\n\n".join(blocks)


def main(argv: list[str] | None = None) -> int:
    """PreToolUse entrypoint. Never raises, never denies, always exits 0."""
    try:
        raw = sys.stdin.read()
    except Exception as exc:
        # Report, never swallow — shipping inject.py's bug inside the module
        # built to invert it would be indefensible. stderr keeps it out of the
        # hook's JSON contract while still leaving a trace.
        print(f"[scdna] stdin unreadable: {exc!r}", file=sys.stderr)
        raw = ""
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        print(f"[scdna] hook payload was not JSON: {exc!r}", file=sys.stderr)
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    file_path = str((payload.get("tool_input") or {}).get("file_path", "") or "")
    session_id = str(payload.get("session_id", "") or "nosession")
    if not file_path:
        return 0

    try:
        block = build_block(file_path, session_id)
    except Exception as exc:
        # Never swallow. A broken toolbox says it is broken rather than
        # impersonating an empty one — the exact inversion of inject.py's
        # `except Exception: block = ""`.
        block = f"**capability retrieval failed:** `{exc!r}` — the toolbox is broken, not empty."

    if block.strip():
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "additionalContext": block,
            }
        }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_inject.py -q
```

Expected: `8 passed`.

- [ ] **Step 5: Create the hook shim**

Create `scripts/scdna-capability-inject.sh` (mirrors `scdna-gene-inject.sh`):

```bash
#!/usr/bin/env bash
# SCDNA capability injection — PreToolUse(Write|Edit) hook.
# Serves the canonical-tools table for the domain whose surface is being edited.
# Never denies, never blocks, always exits 0.
cd "$(dirname "$0")/../steamdeck_brain" 2>/dev/null || exit 0
PYTHONPATH=. timeout 5 python3 -m vaelrix_forcefield.scdna.capability_inject
exit 0
```

Then: `chmod +x scripts/scdna-capability-inject.sh`

- [ ] **Step 6: Prove the shim works end to end**

```bash
cd /home/deck/Downloads/Scholomance-V12-main
echo '{"tool_name":"Edit","session_id":"manual-test-1","tool_input":{"file_path":"scripts/align_lyrics.py"}}' \
  | bash scripts/scdna-capability-inject.sh
```

Expected: JSON containing `"hookEventName": "PreToolUse"` and `CmuPhonemeEngine`.

```bash
echo '{"tool_name":"Edit","session_id":"manual-test-1","tool_input":{"file_path":"src/pages/Watch/WatchPage.css"}}' \
  | bash scripts/scdna-capability-inject.sh
```

Expected: no output (correct — that file is nobody's surface).

- [ ] **Step 7: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py scripts/scdna-capability-inject.sh steamdeck_brain/vaelrix_forcefield/tests/test_capability_inject.py
chmod +x scripts/scdna-capability-inject.sh
git commit -m "$(cat <<'EOF'
feat(scdna): PreToolUse capability injection — the artifact-keyed trigger

The query becomes the file being edited. Nobody has to type "phoneme" to be told
cmudict exists — not knowing that word WAS the failure.

Verified by spike: PreToolUse can inject via hookSpecificOutput.additionalContext;
systemMessage does not reach the model. Designing on the latter would have failed
silently.

Never denies, never blocks, bounded by timeout. On internal failure it SAYS it
failed rather than serving silence — the inversion of inject.py's swallow.
Dead paths are marked STALE at serve time, so the packet carries the means of
its own refutation and checks it every time it speaks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Replay harness — would it have fired in time?

The acceptance test for the whole design, run against the real 2026-07-17 transcript.

**Files:**
- Create: `scripts/replay_capabilities.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_replay_capabilities.py`

**Interfaces:**
- Consumes: `capability_store.load_packets`, `capability_inject.{packets_for_path}`.
- Produces: `replay_capabilities.edits_from_transcript(path: Path) -> list[dict]` (each `{"file_path": str, "index": int}`); `first_hit(edits, packets, domain) -> int | None`; `main(argv=None) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `steamdeck_brain/vaelrix_forcefield/tests/test_replay_capabilities.py`:

```python
import importlib.util
import json
from pathlib import Path

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum

_ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location("replay_capabilities", _ROOT / "scripts/replay_capabilities.py")
replay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(replay)


def _packet():
    p = {"contract": CONTRACT, "version": "1.0.0", "domain": "phonology",
         "surfaces": ["scripts/align_lyrics.py"],
         "capabilities": [{"need": "n", "canonical": "c", "path": "package.json"}]}
    p["checksum"] = checksum(p)
    return p


def _transcript(tmp_path, paths):
    f = tmp_path / "t.jsonl"
    lines = []
    for i, p in enumerate(paths):
        lines.append(json.dumps({
            "type": "assistant",
            "message": {"content": [{"type": "tool_use", "name": "Edit",
                                     "input": {"file_path": p}}]},
        }))
    f.write_text("\n".join(lines), encoding="utf-8")
    return f


def test_extracts_edits_in_order(tmp_path):
    t = _transcript(tmp_path, ["a.py", "scripts/align_lyrics.py", "b.css"])
    edits = replay.edits_from_transcript(t)
    assert [e["file_path"] for e in edits] == ["a.py", "scripts/align_lyrics.py", "b.css"]


def test_first_hit_finds_the_matching_edit(tmp_path):
    t = _transcript(tmp_path, ["a.py", "scripts/align_lyrics.py", "b.css"])
    edits = replay.edits_from_transcript(t)
    assert replay.first_hit(edits, [_packet()], "phonology") == 1


def test_first_hit_is_none_when_never_touched(tmp_path):
    t = _transcript(tmp_path, ["a.py", "b.css"])
    edits = replay.edits_from_transcript(t)
    assert replay.first_hit(edits, [_packet()], "phonology") is None
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_replay_capabilities.py -q
```

Expected: FAIL — `scripts/replay_capabilities.py` does not exist.

- [ ] **Step 3: Implement the harness**

Create `scripts/replay_capabilities.py`:

```python
#!/usr/bin/env python3
"""Replay: would a capability packet have fired BEFORE a known duplication?

The acceptance test for the artifact-keyed trigger, run against a real session
transcript. On 2026-07-17 a char-length syllable heuristic was hand-rolled into
scripts/align_lyrics.py while cmudict sat in node_modules. This answers whether
the phonology packet would have landed before that edit.

It also settles the dedupe cadence with data instead of intuition: fire-once
lands early and may be stale by the moment that matters; fire-always risks the
wallpaper effect. Compare `--first-only` against the full hit list.

IMPORTANT: this proves PRESENCE, never ATTENTION. See spec §8.1 —
WAND_CHEMICAL_STROKE_PROPAGATION fired four times in that same session and was
acted on zero times.

Usage:
  python scripts/replay_capabilities.py --transcript <path.jsonl> [--domain phonology]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "steamdeck_brain"))

from vaelrix_forcefield.scdna.capability_store import load_packets, packets_for_path  # noqa: E402

_EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}


def edits_from_transcript(path: Path) -> list[dict]:
    """Ordered Write/Edit file_paths from a Claude Code transcript JSONL."""
    edits: list[dict] = []
    for line in Path(path).read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        content = ((row.get("message") or {}).get("content")) or []
        if not isinstance(content, list):
            continue
        for item in content:
            if not isinstance(item, dict) or item.get("type") != "tool_use":
                continue
            if item.get("name") not in _EDIT_TOOLS:
                continue
            fp = (item.get("input") or {}).get("file_path")
            if fp:
                edits.append({"file_path": str(fp), "index": len(edits)})
    return edits


def first_hit(edits: list[dict], packets: list[dict], domain: str) -> int | None:
    """Index of the first edit that would have served `domain`, or None."""
    for edit in edits:
        for packet in packets_for_path(edit["file_path"], packets):
            if packet["domain"] == domain:
                return edit["index"]
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--transcript", required=True)
    ap.add_argument("--domain", default="phonology")
    args = ap.parse_args(argv)

    packets, errors = load_packets()
    for e in errors:
        print(f"  LOAD ERROR {e}")
    edits = edits_from_transcript(Path(args.transcript))
    hits = [e for e in edits
            if any(p["domain"] == args.domain for p in packets_for_path(e["file_path"], packets))]

    print(f"edits in transcript      : {len(edits)}")
    print(f"edits on {args.domain!r} surfaces: {len(hits)}")
    if hits:
        print(f"first hit                : edit #{hits[0]['index']} -> {hits[0]['file_path']}")
        print(f"fire-once would serve    : 1 time")
        print(f"fire-always would serve  : {len(hits)} times  <- noise budget")
        for h in hits[:12]:
            print(f"    #{h['index']:>3}  {h['file_path']}")
    else:
        print("NO HIT — the packet would never have fired. The surfaces are wrong.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_replay_capabilities.py -q
```

Expected: `3 passed`.

- [ ] **Step 5: Run the real acceptance test**

Use **this exact transcript** — it is the 2026-07-17 session in which the
duplication happened. Do NOT "pick the most recent/largest": the largest
transcript in that directory is a different session with 190 edits and **zero**
`align_lyrics.py` touches, and it will produce a confident, meaningless NO HIT.

```bash
cd /home/deck/Downloads/Scholomance-V12-main
python3 scripts/replay_capabilities.py \
  --transcript /home/deck/.claude/projects/-home-deck-Downloads-Scholomance-V12-main/56188e89-2074-4484-91e8-aab8ec192179.jsonl \
  --domain phonology
```

**The corpus is LIVE — the totals will drift and that is not a bug.** This
transcript is the session doing the work: every edit made while executing this
plan appends to it (measured: 74 edits at 07:0x, 83 by 07:29, as the packet's
surfaces also widened in Task 4). Do not "fix" a drifting total.

The stable, load-bearing numbers are the ones in the past: **first hit #14**,
**`_span_weight` at #51**, a **37-edit gap** — those cannot move unless someone
edits `align_lyrics.py` again. Judge the harness on those, not on the totals:

Expected (measured while writing this plan; totals are a snapshot, the gap is the
acceptance criterion):

```
edits in transcript      : 74
edits on 'phonology' surfaces: 14
first hit                : edit #14 -> .../scripts/align_lyrics.py
fire-once would serve    : 1 time
fire-always would serve  : 14 times  <- noise budget
```

The `_span_weight` duplication is at edit **#51**. Confirm the harness agrees:

```bash
python3 - <<'EOF'
import json
T="/home/deck/.claude/projects/-home-deck-Downloads-Scholomance-V12-main/56188e89-2074-4484-91e8-aab8ec192179.jsonl"
i=0
for line in open(T, errors="replace"):
    line=line.strip()
    if not line: continue
    try: row=json.loads(line)
    except Exception: continue
    for it in ((row.get("message") or {}).get("content")) or []:
        if isinstance(it,dict) and it.get("type")=="tool_use" and it.get("name") in {"Edit","Write","MultiEdit"}:
            inp=it.get("input") or {}
            if not inp.get("file_path"): continue
            if "_span_weight" in json.dumps(inp): print("duplication at edit #", i)
            i+=1
EOF
```

Expected: `duplication at edit # 51` (and two later edits refining it).

**This is the finding that set `RE_ARM_EDITS = 10`**: first hit #14 vs duplication
#51 is a 37-edit gap, so fire-once is refuted by its own acceptance test.

- [ ] **Step 6: Commit**

```bash
git add scripts/replay_capabilities.py steamdeck_brain/vaelrix_forcefield/tests/test_replay_capabilities.py
git commit -m "$(cat <<'EOF'
feat(scdna): replay harness — would the packet have fired in time?

The acceptance test for the artifact-keyed trigger, run against the real
2026-07-17 transcript where a char-length syllable heuristic was hand-rolled
into align_lyrics.py while cmudict sat in node_modules.

Also settles the dedupe cadence with data: fire-once vs fire-always, measured
as coverage against noise on a real session, rather than by my intuition.

Proves PRESENCE, never ATTENTION (spec 8.1).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Human-gated authoring CLI

**Files:**
- Create: `steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_capability_compiler.py`

**Interfaces:**
- Consumes: `capability_types.{checksum, validate_packet, CONTRACT}`, `capability_store.CAPABILITY_DIR`.
- Produces: `compile_packet(packet: dict) -> tuple[dict, list[str]]`; `commit_packet(packet: dict, directory: Path | None = None) -> Path`; `main(argv=None) -> int`.

- [ ] **Step 1: Write the failing tests**

Create `steamdeck_brain/vaelrix_forcefield/tests/test_capability_compiler.py`:

```python
import json

import pytest

from vaelrix_forcefield.scdna.capability_types import CONTRACT, checksum
from vaelrix_forcefield.scdna import capability_compiler as cc


def _draft():
    return {
        "contract": CONTRACT, "version": "1.0.0", "domain": "testdomain",
        "surfaces": ["scripts/**"],
        "capabilities": [{"need": "n", "canonical": "c", "path": "package.json"}],
    }


def test_compile_adds_a_checksum():
    packet, errors = cc.compile_packet(_draft())
    assert errors == []
    assert packet["checksum"] == checksum(packet)


def test_compile_rejects_an_invalid_draft():
    d = _draft()
    del d["surfaces"]
    _, errors = cc.compile_packet(d)
    assert errors


def test_compile_rejects_a_capability_naming_a_dead_path():
    """The compiler will not let you author a claim that is already false."""
    d = _draft()
    d["capabilities"][0]["path"] = "node_modules/DEFINITELY_NOT_HERE"
    _, errors = cc.compile_packet(d)
    assert any("does not exist" in e for e in errors)


def test_commit_writes_a_loadable_packet(tmp_path):
    packet, _ = cc.compile_packet(_draft())
    out = cc.commit_packet(packet, tmp_path)
    from vaelrix_forcefield.scdna.capability_store import load_packets
    packets, errors = load_packets(tmp_path)
    assert errors == []
    assert len(packets) == 1


def test_commit_refuses_an_invalid_packet(tmp_path):
    d = _draft()
    del d["capabilities"]
    with pytest.raises(ValueError):
        cc.commit_packet(d, tmp_path)
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_compiler.py -q
```

Expected: collection error — module does not exist.

- [ ] **Step 3: Implement**

Create `steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py`:

```python
"""SCDNA — capability packet compiler.

A manual, review-driven tool for authoring, validating, and committing capability
packets. Packets are curated, not auto-generated (PDR 7.1: "detection assists,
curation decides"). This tool may reject, warn, or emit — it may not decide that
a memory deserves to be a packet. A human does that.

It refuses to compile a capability whose path does not already exist: you cannot
author a claim that is false at the moment you write it.

Usage:
  python -m vaelrix_forcefield.scdna.capability_compiler --draft <draft.json> [--commit]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .capability_store import CAPABILITY_DIR, REPO_ROOT
from .capability_types import CONTRACT, checksum, validate_packet


def compile_packet(draft: dict) -> tuple[dict, list[str]]:
    """Validate a draft and stamp its checksum. Returns (packet, errors)."""
    errors = list(validate_packet(draft))
    for cap in draft.get("capabilities", []) or []:
        path = cap.get("path") if isinstance(cap, dict) else None
        if path and not (REPO_ROOT / path).exists():
            errors.append(f"capability {cap.get('need')!r} names {path!r}, which does not exist")
    if errors:
        return draft, errors
    packet = {k: v for k, v in draft.items() if k != "checksum"}
    packet["checksum"] = checksum(packet)
    return packet, []


def commit_packet(packet: dict, directory: Path | None = None) -> Path:
    """Write a compiled packet. Raises ValueError if it is not valid."""
    packet, errors = compile_packet(packet)
    if errors:
        raise ValueError("; ".join(errors))
    directory = directory or CAPABILITY_DIR
    directory.mkdir(parents=True, exist_ok=True)
    out = directory / f"{packet['domain']}.capability.json"
    out.write_text(json.dumps(packet, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--draft", required=True, help="path to a draft packet JSON")
    ap.add_argument("--commit", action="store_true",
                    help="write it into the registry (a human decides this, not the tool)")
    args = ap.parse_args(argv)

    draft = json.loads(Path(args.draft).read_text(encoding="utf-8"))
    packet, errors = compile_packet(draft)
    if errors:
        for e in errors:
            print(f"  REJECT  {e}")
        return 1
    print(f"  OK  {packet['domain']}  checksum={packet['checksum']}")
    if not args.commit:
        print("  (dry run — pass --commit to register it)")
        return 0
    out = commit_packet(packet)
    print(f"  committed -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run to verify they pass**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/test_capability_compiler.py -q
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py steamdeck_brain/vaelrix_forcefield/tests/test_capability_compiler.py
git commit -m "$(cat <<'EOF'
feat(scdna): human-gated capability compiler

Mirrors compiler.py and the PDR's curation law: the tool may reject, warn, or
emit, but a human decides whether a memory deserves to be a packet. Nothing here
generates a packet from observed behaviour (PDR 7 non-goal).

It refuses to compile a capability whose path does not already exist — you
cannot author a claim that is false at the moment you write it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Register the hook and measure it live

Last, because it changes the environment for every session. Everything must be proven before this.

**Files:**
- Modify: `.claude/settings.json`

**Interfaces:**
- Consumes: `scripts/scdna-capability-inject.sh`.
- Produces: a live `PreToolUse` hook.

- [ ] **Step 1: Run the whole suite first**

```bash
cd steamdeck_brain && PYTHONPATH=. ../.venv/bin/python -m pytest vaelrix_forcefield/tests/ -q
cd .. && npm run verify:capabilities --silent; echo "exit=$?"
```

Expected: all pass; `exit=0`.

- [ ] **Step 2: Back up settings**

```bash
cp .claude/settings.json /tmp/settings.json.bak
cat .claude/settings.json
```

- [ ] **Step 3: Add the PreToolUse hook**

`.claude/settings.json` currently registers only `UserPromptSubmit`. Add `PreToolUse` alongside it — do not replace it:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/scdna-gene-inject.sh\"" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/scdna-capability-inject.sh\"" }
        ]
      }
    ]
  }
}
```

Preserve any other existing keys in the file verbatim.

- [ ] **Step 4: Verify it fires on a surface**

Edit `scripts/align_lyrics.py` (add and then remove a trailing comment). Expected: a `PreToolUse:Edit hook additional context` system-reminder naming `CmuPhonemeEngine`.

- [ ] **Step 5: Verify it stays silent off-surface**

Edit any file not in a packet's surfaces (e.g. `README.md`). Expected: no capability context. Silence off-surface is the anti-wallpaper property; if this fires, the globs are too broad.

- [ ] **Step 6: Verify it does not fire twice**

Edit `scripts/align_lyrics.py` again in the same session. Expected: no second injection (dedupe).

- [ ] **Step 7: Commit**

```bash
git add .claude/settings.json
git commit -m "$(cat <<'EOF'
feat(scdna): register the PreToolUse capability hook

Fires on Write|Edit|MultiEdit; serves the canonical-tools table for the domain
whose surface is being edited; deduped per session; silent off-surface.

Verified live: fires on scripts/align_lyrics.py, silent on README.md, does not
repeat within a session.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Record the honest limit**

Append to `docs/superpowers/specs/2026-07-17-tool-substrate-design.md` under §10 a line recording the replay numbers from Task 6 (first-hit index, fire-always count) and the cadence chosen. If fire-once landed far before the duplication it was meant to prevent, say so — that is a known weakness, not a solved problem.

```bash
git add docs/superpowers/specs/2026-07-17-tool-substrate-design.md
git commit -m "docs(scdna): record measured replay numbers and the cadence decision

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §2.3 inert threshold, silent swallow | Task 1 |
| §4.1 `distill_query` NOT repaired | Task 1 (explicitly out of scope) |
| §5.1 capability packet | Tasks 2, 4 |
| §5.2 capability compiler | Task 7 |
| §5.3 verifier + npm script | Task 4 |
| §5.4 trigger hook | Tasks 5, 8 |
| §5.5 plumbing repair | Task 1 |
| §5.6 replay harness | Task 6 |
| §6 data flow (author/verify/retrieve/replay) | Tasks 7 / 4 / 5 / 6 |
| §7 never denies, never silent, checksum refused, STALE marking | Task 5 (all four tested) |
| §8 selftests: glob, dedupe, checksum, stale, anti-swallow, never-denies | Tasks 3, 5 |
| §8.1 presence ≠ attention | Task 6 docstring, Task 8 Step 8 |
| §9 out of scope | honoured — no aligner reconciliation, no gene renaming, no auto-generation |
| §10 open Q1 (cadence) | Task 6 Step 5 measures it; Task 8 Step 8 records it |

§10 open Q2 (which domains next) and Q3 (block vs warn) are deliberately left for after the seed packet proves the mechanism. Q3 defaults to blocking (exit 1) in Task 4 — the gate fails the build; revisit if it proves too brittle.

**Placeholder scan:** no TBD/TODO. Every code step contains complete code. Every command has expected output. Task 4 Step 5's checksum is computed by a script rather than written by hand, because a hand-typed checksum would be wrong.

**Type consistency:** `checksum(packet: dict) -> str` and `validate_packet(packet: dict) -> list[str]` (Task 2) are used with those exact signatures in Tasks 3, 4, 5, 7. `load_packets(directory=None) -> tuple[list[dict], list[str]]` (Task 3) is consumed with tuple-unpacking in Tasks 4, 5, 6. `packets_for_path(path, packets) -> list[dict]` (Task 3) is used in Tasks 5 and 6. `main(argv=None) -> int` is uniform across `inject.py`, `capability_inject`, `verify_capabilities`, `replay_capabilities`, `capability_compiler`. `_STATE_DIR` is monkeypatched by name in Task 5's tests and defined as a module-level `Path` in the implementation.
