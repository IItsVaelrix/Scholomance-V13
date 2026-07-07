# SCDNA Proactive Gene Injection Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user submits a prompt, automatically surface any SCDNA genes whose intent matches the task and inject their `imperative` + `requiredChecks` + `forbiddenDrift` into the model's context — closing the proactive retrieval loop without prompt bloat.

**Architecture:** A Claude Code `UserPromptSubmit` hook pipes the prompt to a new Python module `vaelrix_forcefield.scdna.inject`. The module distills the prompt to a compact intent query (because the detector scores `overlap / query_tokens`, raw prompts dilute to zero), runs the **existing** `detect_gene_matches` against the committed registry, applies forcefield-equivalent gating (active status, confidence ≥ minConfidence, freshness floor, result cap), and emits a markdown directive block as `hookSpecificOutput.additionalContext`. No match → no output.

**Tech Stack:** Python 3.13 stdlib only. Reuses `scdna/detector.py` (`detect_gene_matches`, `normalize_text`, `tokenize`), `scdna/compiler.py` (`_load_json_registry`, `DEFAULT_REGISTRY_PATH`), `scdna/registry.py` (`DEFAULT_GENE_REGISTRY`). pytest for tests. A bash wrapper bridges the hook to the module. Hook config in `.claude/settings.json`.

## Global Constraints

- **Python 3.13, standard library only.** No new dependencies.
- **Reuse, do not reimplement** `detect_gene_matches`, `normalize_text`, `tokenize` from `scdna/detector.py`.
- **Never block the prompt.** The hook script and `main()` MUST exit 0 on every path, including malformed stdin or any internal exception. On error or no match, emit **nothing**.
- **Registry source:** committed JSON registry `scdna/compiler.json` merged with `DEFAULT_GENE_REGISTRY` (committed file wins where ids collide via `dict.update(DEFAULT_GENE_REGISTRY)` order — defaults applied last, matching `compiler.py` `_cmd_*`).
- **Tuning constants (exact):** `INJECT_SCORE_THRESHOLD = 0.35`, `MIN_FRESHNESS = 0.5`, `MAX_GENES = 3`.
- **All commands run from** `steamdeck_brain/` so `python3 -m vaelrix_forcefield.scdna.inject` resolves the package.
- **Out of scope (do NOT build here):** collab_memory cross-agent sync (the on-disk registry already persists locally); subagent-dispatch injection; runtime `forbiddenDrift` enforcement. These are separate subsystems.

---

## File Structure

- Create `steamdeck_brain/vaelrix_forcefield/scdna/inject.py` — distiller, selector, formatter, hook `main()`. One responsibility: turn a task string into an injection block.
- Create `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py` — unit + integration tests.
- Create `scripts/scdna-gene-inject.sh` — hook wrapper (cd + `python -m`).
- Modify `.claude/settings.json` — add `hooks.UserPromptSubmit`.

---

### Task 1: Query distiller

**Files:**
- Create: `steamdeck_brain/vaelrix_forcefield/scdna/inject.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py`

**Interfaces:**
- Consumes: `normalize_text`, `tokenize` from `vaelrix_forcefield.scdna.detector`.
- Produces: `STOPWORDS: frozenset[str]`, `DOMAIN_LEXICON: dict[str, frozenset[str]]`, `distill_query(task: str) -> str` (space-joined, order-preserved, de-duplicated salient tokens; `""` when nothing salient).

- [ ] **Step 1: Write the failing test**

```python
# steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
from vaelrix_forcefield.scdna.inject import distill_query


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'vaelrix_forcefield.scdna.inject'`

- [ ] **Step 3: Write minimal implementation**

```python
# steamdeck_brain/vaelrix_forcefield/scdna/inject.py
"""
SCDNA — proactive gene injection.

Distills a task prompt to a compact intent query, matches it against the
gene registry via the existing detector, gates the results, and renders a
directive block for a Claude Code UserPromptSubmit hook.

The detector scores token overlap as ``overlap / len(query_tokens)``, so a
raw multi-sentence prompt dilutes every score below threshold. distill_query
shrinks the prompt to domain-salient tokens first.
"""

from __future__ import annotations

from .detector import normalize_text, tokenize

STOPWORDS: frozenset[str] = frozenset({
    "the", "and", "for", "with", "this", "that", "you", "your", "our", "can",
    "will", "please", "make", "made", "from", "into", "onto", "have", "has",
    "are", "was", "were", "any", "all", "but", "not", "use", "used", "using",
    "get", "got", "let", "now", "then", "than", "out", "off", "via", "per",
    "should", "would", "could", "about", "again", "also", "just", "like",
    "want", "need", "needs", "able", "easily", "turn", "turned",
})

DOMAIN_LEXICON: dict[str, frozenset[str]] = {
    "code": frozenset({"code", "function", "refactor", "bug", "debug", "compile",
                       "module", "import", "export", "lint", "runtime"}),
    "rhyme": frozenset({"rhyme", "lyric", "lyrics", "verse", "cadence", "chorus", "hook"}),
    "phoneme": frozenset({"phoneme", "syllable", "pronounce", "pronunciation", "sound", "ipa"}),
    "pixel": frozenset({"pixel", "pixelbrain", "sprite", "palette", "render", "color",
                        "colour", "voxel", "art", "claymore", "sword", "weapon", "shield",
                        "asset", "skeleton", "morph", "foundry", "pbrain", "pommel", "blade"}),
    "lore": frozenset({"lore", "canon", "myth", "symbolism", "mirrorborne", "story", "character"}),
    "audio": frozenset({"audio", "music", "beat", "synth", "mix", "ambience"}),
    "seo": frozenset({"seo", "title", "tags", "keywords", "description", "metadata"}),
    "memory": frozenset({"memory", "recall", "remember", "history", "prior", "gene"}),
    "testing": frozenset({"test", "tests", "regression", "assert", "coverage", "spec"}),
    "architecture": frozenset({"architecture", "design", "structure", "pattern", "schema",
                               "contract", "boundary"}),
    "risk": frozenset({"risk", "safety", "security", "dependency", "blast", "hazard"}),
}

_LEXICON_ALL: frozenset[str] = frozenset().union(*DOMAIN_LEXICON.values())


def distill_query(task: str) -> str:
    """Reduce a task prompt to de-duplicated, order-preserved salient tokens."""
    seen: set[str] = set()
    out: list[str] = []
    for token in tokenize(normalize_text(task)):
        if token in STOPWORDS or token not in _LEXICON_ALL:
            continue
        if token not in seen:
            seen.add(token)
            out.append(token)
    return " ".join(out)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/inject.py steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
git commit -m "feat(scdna): query distiller for proactive gene injection"
```

---

### Task 2: Gene selection + gating

**Files:**
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/inject.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py`

**Interfaces:**
- Consumes: `distill_query` (Task 1); `detect_gene_matches` from `.detector`; `_load_json_registry`, `DEFAULT_REGISTRY_PATH` from `.compiler`; `DEFAULT_GENE_REGISTRY` from `.registry`; `compile_gene` from `.compiler` (test only).
- Produces: `INJECT_SCORE_THRESHOLD: float`, `MIN_FRESHNESS: float`, `MAX_GENES: int`, `load_injection_registry() -> GeneRegistry`, `select_genes(task: str, registry: GeneRegistry | None = None) -> list[RetrievalGene]` (gated, ranked, capped).

- [ ] **Step 1: Write the failing test**

```python
# append to steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
from vaelrix_forcefield.scdna.compiler import compile_gene
from vaelrix_forcefield.scdna.inject import select_genes, MAX_GENES


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: FAIL with `ImportError: cannot import name 'select_genes'`

- [ ] **Step 3: Write minimal implementation**

```python
# append to steamdeck_brain/vaelrix_forcefield/scdna/inject.py
from .compiler import DEFAULT_REGISTRY_PATH, _load_json_registry
from .detector import detect_gene_matches
from .registry import DEFAULT_GENE_REGISTRY, GeneRegistry
from .types import RetrievalGene

INJECT_SCORE_THRESHOLD = 0.35
MIN_FRESHNESS = 0.5
MAX_GENES = 3


def load_injection_registry() -> GeneRegistry:
    """Committed JSON registry merged with the built-in defaults."""
    registry = _load_json_registry(DEFAULT_REGISTRY_PATH)
    registry.update(DEFAULT_GENE_REGISTRY)
    return registry


def select_genes(task: str, registry: GeneRegistry | None = None) -> list[RetrievalGene]:
    """Distill the task, match genes, and apply forcefield-equivalent gating."""
    if registry is None:
        registry = load_injection_registry()

    query = distill_query(task)
    if not query:
        return []

    matches = detect_gene_matches(query, registry, score_threshold=INJECT_SCORE_THRESHOLD)

    gated: list[RetrievalGene] = []
    for gene in matches:
        if gene.lifecycle.status != "active":
            continue
        if gene.retrieval.confidence < gene.retrieval.minConfidence:
            continue
        if gene.retrieval.freshness < MIN_FRESHNESS:
            continue
        gated.append(gene)
        if len(gated) >= MAX_GENES:
            break
    return gated
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/inject.py steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
git commit -m "feat(scdna): gated gene selection for injection"
```

---

### Task 3: Context formatter

**Files:**
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/inject.py`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py`

**Interfaces:**
- Consumes: `select_genes` (Task 2); `RetrievalGene`.
- Produces: `format_context(genes: list[RetrievalGene]) -> str` (`""` for empty list); `build_injection(task: str, registry: GeneRegistry | None = None) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# append to steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
from vaelrix_forcefield.scdna.inject import build_injection, format_context


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_injection'`

- [ ] **Step 3: Write minimal implementation**

```python
# append to steamdeck_brain/vaelrix_forcefield/scdna/inject.py
def format_context(genes: list[RetrievalGene]) -> str:
    """Render gated genes as a markdown directive block (empty string if none)."""
    if not genes:
        return ""

    lines = [
        "## SCDNA genes active for this task",
        "_Retrieved by intent match — treat as canonical directives for the components named._",
        "",
    ]
    for gene in genes:
        lines.append(
            f"### {gene.identity.stableId}  "
            f"({gene.domain.primary} · conf {gene.retrieval.confidence:.2f})"
        )
        lines.append(f"**Do:** {gene.instruction.imperative}")
        if gene.instruction.requiredChecks:
            lines.append("**Required checks:**")
            lines.extend(f"- {check}" for check in gene.instruction.requiredChecks)
        if gene.instruction.forbiddenDrift:
            lines.append("**Forbidden drift:**")
            lines.extend(f"- {drift}" for drift in gene.instruction.forbiddenDrift)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def build_injection(task: str, registry: GeneRegistry | None = None) -> str:
    """Full pipeline: task string -> directive block (empty when no genes apply)."""
    return format_context(select_genes(task, registry=registry))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: PASS (10 passed)

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/inject.py steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
git commit -m "feat(scdna): directive-block formatter for injection"
```

---

### Task 4: Hook CLI entrypoint + wrapper script

**Files:**
- Modify: `steamdeck_brain/vaelrix_forcefield/scdna/inject.py`
- Create: `scripts/scdna-gene-inject.sh`
- Test: `steamdeck_brain/vaelrix_forcefield/tests/test_inject.py`

**Interfaces:**
- Consumes: `build_injection` (Task 3).
- Produces: `main(argv: list[str] | None = None) -> int` (reads hook JSON from stdin, prints `hookSpecificOutput.additionalContext` JSON only when a non-empty block exists, returns 0 on every path); module `__main__` guard; executable `scripts/scdna-gene-inject.sh`.

- [ ] **Step 1: Write the failing test**

```python
# append to steamdeck_brain/vaelrix_forcefield/tests/test_inject.py
import json
import subprocess
import sys
from pathlib import Path

_PKG_DIR = Path(__file__).resolve().parents[2]  # steamdeck_brain/


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -k hook -v`
Expected: FAIL — module has no `__main__`, so `python -m` errors / stdout empty assertion on the matching-prompt test fails.

- [ ] **Step 3a: Write minimal implementation (module main)**

```python
# append to steamdeck_brain/vaelrix_forcefield/scdna/inject.py
import json
import sys


def main(argv: list[str] | None = None) -> int:
    """UserPromptSubmit hook entrypoint. Never raises; never blocks the prompt."""
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}

    task = str(payload.get("prompt", "") or "")
    try:
        block = build_injection(task)
    except Exception:
        block = ""

    if block.strip():
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": block,
            }
        }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3b: Create the wrapper script**

```bash
# scripts/scdna-gene-inject.sh
#!/usr/bin/env bash
# SCDNA proactive gene injection — Claude Code UserPromptSubmit hook.
# Reads the hook JSON on stdin; emits hookSpecificOutput.additionalContext JSON,
# or nothing. Always exits 0 so it can never block a prompt submission.
cd "$(dirname "$0")/../steamdeck_brain" 2>/dev/null || exit 0
exec python3 -m vaelrix_forcefield.scdna.inject
```

Then make it executable:

```bash
chmod +x scripts/scdna-gene-inject.sh
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd steamdeck_brain && python3 -m pytest vaelrix_forcefield/tests/test_inject.py -v`
Expected: PASS (13 passed)

Also smoke-test the wrapper end to end:

Run: `echo '{"prompt":"render the void ice claymore sprite"}' | bash scripts/scdna-gene-inject.sh`
Expected: a single JSON line containing `"hookEventName": "UserPromptSubmit"` and `claymore`.

- [ ] **Step 5: Commit**

```bash
git add steamdeck_brain/vaelrix_forcefield/scdna/inject.py steamdeck_brain/vaelrix_forcefield/tests/test_inject.py scripts/scdna-gene-inject.sh
git commit -m "feat(scdna): UserPromptSubmit hook entrypoint + wrapper"
```

---

### Task 5: Wire the hook into `.claude/settings.json`

**Files:**
- Modify: `.claude/settings.json`

**Interfaces:**
- Consumes: `scripts/scdna-gene-inject.sh` (Task 4).
- Produces: a registered `UserPromptSubmit` hook. No code symbols.

- [ ] **Step 1: Read the current settings**

Run: `cat .claude/settings.json`
Expected: an object with keys `permissions` and `enableAllProjectMcpServers` and **no** `hooks` key.

- [ ] **Step 2: Add the hooks block**

Edit `.claude/settings.json` to add a top-level `hooks` key alongside the existing keys (do not remove `permissions` or `enableAllProjectMcpServers`):

```json
{
  "permissions": { "...": "LEAVE EXISTING CONTENT UNCHANGED" },
  "enableAllProjectMcpServers": true,
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/scripts/scdna-gene-inject.sh\""
          }
        ]
      }
    ]
  }
}
```

> The wrapper resolves its own path via `dirname`, so `$CLAUDE_PROJECT_DIR` only needs to locate the script. If `$CLAUDE_PROJECT_DIR` is unavailable in your Claude Code version, substitute the absolute path `/home/deck/Downloads/Scholomance-V12-main/scripts/scdna-gene-inject.sh`.

- [ ] **Step 3: Validate the JSON**

Run: `python3 -c "import json; json.load(open('.claude/settings.json')); print('valid')"`
Expected: `valid`

- [ ] **Step 4: Manual end-to-end verification**

1. Start a fresh Claude Code session in this repo.
2. Submit the prompt: `render the void ice claymore sprite`.
3. Confirm the model's context now contains the `## SCDNA genes active for this task` block naming `sprite.void_ice_claymore.v1` with its required checks (e.g. via the model echoing the checksum directive, or `claude --debug` hook output).
4. Submit an unrelated prompt (`write a haiku about the moon`) and confirm **no** SCDNA block is injected.

- [ ] **Step 5: Commit**

```bash
git add .claude/settings.json
git commit -m "chore(scdna): register proactive gene-injection UserPromptSubmit hook"
```

---

## Self-Review

**1. Spec coverage**
- Distill task → compact query (detector dilution fix): Task 1. ✓
- Match via existing `detect_gene_matches`: Task 2. ✓
- Forcefield-equivalent gating (active / confidence ≥ minConfidence / freshness floor / cap): Task 2. ✓
- Inject `imperative` + `requiredChecks` + `forbiddenDrift`: Task 3. ✓
- Hook entrypoint, never-block contract, no-match silence: Task 4. ✓
- Registered hook + manual verification: Task 5. ✓
- Out-of-scope items (collab_memory, subagent dispatch, drift enforcement) explicitly excluded in Global Constraints. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✓

**3. Type consistency:** `distill_query(str)->str`, `select_genes(str, registry?)->list[RetrievalGene]`, `format_context(list[RetrievalGene])->str`, `build_injection(str, registry?)->str`, `main(list|None)->int`, `load_injection_registry()->GeneRegistry`, constants `INJECT_SCORE_THRESHOLD/MIN_FRESHNESS/MAX_GENES` — names identical across Tasks 1-4. Registry merge order matches `compiler.py`. ✓

**Note for the implementer:** the `UserPromptSubmit` `additionalContext` field is the stable documented contract, but confirm it against the installed Claude Code version during Task 5 Step 4. If the field name differs, only `main()` (Task 4) and the manual step change — the detector/selector/formatter are harness-agnostic.
