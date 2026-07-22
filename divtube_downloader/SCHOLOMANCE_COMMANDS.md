# Scholomance Integration — Command Reference

**DivTube Cockpit** · Clerical RAID · Archive of Dominance · BytecodeHealth

---

## Table of Contents

1. [Overview](#1-overview)
1a. [Phenotypic Idealism](#1a-phenotypic-idealism)
2. [Clerical RAID Commands](#2-clerical-raid-commands)
   - [/cleri-scan](#cleri-scan-text)
   - [/cleri-diagnose](#cleri-diagnose-filejson)
   - [/cleri-train](#cleri-train-filejson)
   - [/cleri-stats](#cleri-stats)
   - [/cleri-probe](#cleri-probe-text)
   - [/cleri-query](#cleri-query-agent-filejson)
   - [/cleri-ingest](#cleri-ingest-filejson)
   - [/cleri-cluster](#cleri-cluster)
   - [/cleri-dupes](#cleri-dupes)
   - [/cleri-maint](#cleri-maint)
   - [/cleri-feedback](#cleri-feedback-patternid---confirm---reject)
   - [/cleri-rebuild](#cleri-rebuild)
3. [Archive of Dominance Commands](#3-archive-of-dominance-commands)
   - [/archive](#archive--archive-files)
   - [/archive-search](#archive-search-query)
   - [/archive-neighbors](#archive-neighbors-filepath)
4. [BytecodeHealth Commands](#4-bytecodehealth-commands)
   - [/health](#health)
   - [/health-emit](#health-emit-cellid-checkid)
   - [/health-verify](#health-verify-cellid-checkid)
5. [Architecture](#5-architecture)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Overview

The Scholomance integration embeds three systems from the Scholomance determinism engine directly into the DivTube Cockpit:

| System | Purpose |
|---|---|
| **Clerical RAID** | Semantic pattern-matching engine for bug diagnosis. Maintains a corpus of ~51 seed patterns (antigens) that it matches against symptom descriptions to identify known bug categories, assign confidence scores, and recommend fixes. |
| **Archive of Dominance** | Full filesystem explorer for the ~34K+ source files in the Scholomance project. Provides file listing, path/content search, and neighbor-file discovery. |
| **BytecodeHealth** | Green-path diagnostic signal system. Produces deterministic, checksummed health payloads (`PB-OK-v1-*`) that AI agents can consume to verify system integrity. |

All three are accessed via a **Node.js bridge** (`scripts/scholomance-bridge.mjs`) that imports the Scholomance codex modules directly — no external server required.

---

## 1a. Phenotypic Idealism

Force multiplier: compose a `PHENOTYPIC-IDEAL-v1` packet (TurboQuant neighbors + SCDNA capability/gene evidence + `boonSeeds`). The AI conceptualizes ranked boons from the packet — it must cite `evidenceRefs` and must not invent capabilities.

### Headless

```bash
npm run phenotypic:ideal -- "phoneme duration"
npm run phenotypic:ideal -- "cockpit tools" --scope divtube
# offline / CI:
npm run phenotypic:ideal -- "phoneme duration" --hits-json tests/qa/features/fixtures/phenotypic-hits.json
```

### Cockpit

| Command | Behavior |
|---------|----------|
| `/phenotypic <query>` | Compose packet; print ranked seed table |
| `/phenotypic last` | Re-show last packet in session |
| `/phenotypic <query> --scope divtube` | Prefer `divtube_downloader/` hits |

Agent tool (Cockpit): `phenotypic_ideal` · skill: `tui/skills/phenotypic_idealism.md`  
MCP (stdio + HTTP `/mcp`): `mcp_scholomance_collab_phenotypic_ideal`  
Aliases: `phenotypic_ideal`, `phenotypic`  

| MCP arg | Meaning |
|---------|---------|
| `query` | Intent / disparity hypothesis (required) |
| `scope` | `repo` \| `divtube` (default `repo`) |
| `hits_json` | Optional path to injected hits (offline/CI) |
| `allow_empty_index` | Allow compose when TurboQuant index is empty |

Design: `docs/superpowers/specs/2026-07-19-phenotypic-idealism-design.md`

---

## 2. Clerical RAID Commands

### `/cleri-scan <text>`

Scans a natural-language symptom description against the RAID pattern corpus. Returns the **best-matching pattern**, confidence score, verdict, and recommended fix path.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<text>` | Yes | Symptom description — free-form text |

**Output:**

```
❖ SCAN ❖
{
  "verdict": "MATCH" | "NEEDS_MERLIN" | "NOVEL",
  "confidence": 0.0–1.0,
  "matchedPattern": {
    "id": "PAT-008",
    "name": "TypeScript Strict Null",
    "confidence": 1.0,
    "fixPath": "Codex: Add null guards, use optional chaining..."
  }
}
```

**Verdict meanings:**

| Verdict | Meaning |
|---|---|
| `MATCH` | Strong match found — fix is actionable |
| `NEEDS_MERLIN` | Partial match — may need human/Merlin review |
| `NOVEL` | No close match — potential new bug category |

**Example:**
```
/cleri-scan "null pointer dereference in combat update loop"
```

---

### `/cleri-diagnose <file.json>`

Loads a structured bug report JSON file and runs the full diagnostic pipeline against it. More precise than `/cleri-scan` because it can match against file paths, error messages, and layer hints.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<file.json>` | Yes | Path to a bug report JSON file |

**Expected JSON structure:**
```json
{
  "symptoms": ["component fails to render", "state not updating"],
  "filePaths": ["src/pages/Combat/CombatPage.jsx"],
  "errorMessages": ["TypeError: Cannot read properties of undefined"],
  "layer": "ui"
}
```

**Output:**
Full raid query result — pattern match, confidence, vector details.

**Example:**
```
/cleri-diagnose reports/bug-2026-06-22.json
```

---

### `/cleri-train <file.json>`

Trains a new pattern into the RAID corpus from a pattern definition JSON file. The pattern is immediately available for future scans.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<file.json>` | Yes | Path to a pattern definition JSON file |

**Expected JSON structure:**
```json
{
  "id": "PAT-052",
  "name": "WebSocket Reconnect Loop",
  "symptoms": ["websocket reconnecting", "ws close code 1006", "infinite reconnect"],
  "filePaths": ["src/services/socket.js"],
  "errorMessages": ["WebSocket is already in CLOSING or CLOSED state"],
  "owner": "codex",
  "fixPath": "Implement exponential backoff with max retry limit",
  "confidence": 0.85
}
```

**Output:**
```
{ "ok": true, "id": "PAT-052", "patternCount": 52 }
```

**Owner aliases:** `codex`, `claude`, `gemini`, `merlin`, `blackbox`, `unknown`

**Example:**
```
/cleri-train patterns/new-websocket-antigen.json
```

---

### `/cleri-stats`

Displays RAID engine statistics — total pattern count, query history, memory footprint, and confirm/deny ratios.

**Arguments:** None

**Output:**
```
❖ STATS ❖
{
  "queries": 0,
  "confirmed": 0,
  "denied": 0,
  "needsMerlin": 0,
  "novel": 0,
  "patternCount": 51,
  "deprecatedPatternCount": 0,
  "memoryBytes": 3264,
  "avgMemoryPerQuery": 3264
}
```

| Field | Meaning |
|---|---|
| `patternCount` | Total active patterns |
| `deprecatedPatternCount` | Patterns retired by maintenance |
| `queries` | Lifetime query counter |
| `memoryBytes` | Vector index memory usage |
| `avgMemoryPerQuery` | Average memory per query |

**Example:**
```
/cleri-stats
```

---

### `/cleri-probe <text>`

Runs a **structural prion scan** against the codebase. Instead of matching symptom text against known patterns (like `/cleri-scan`), it walks source files looking for code-level structural misfolds.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<text>` | Yes | Hypothesis or code smell description |

**Output:**
```
❖ PROBE ❖
{
  "raw": "Resonance: 0.834\nFile: src/core/combat/state.js\nLine: 142\nPattern: unseeded random"
}
```

The probe engine scans file contents for structural patterns matching your hypothesis.

**Example:**
```
/cleri-probe "unseeded Math.random in combat logic"
/cleri-probe "mutable state shared across threads"
```

---

### `/cleri-query <agent> <file.json>`

**Agent-hooked RAID query.** Runs a bug report through the RAID engine and then routes the result through a specific agent's playbook for context-aware interpretation.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<agent>` | Yes | Agent key — `codex`, `claude`, `gemini`, or `merlin` |
| `<file.json>` | Yes | Path to a bug report JSON file |

**Output:**
Agent-specific interpretation of the RAID query result, including whether the agent's charter applies and any recommended actions.

**Example:**
```
/cleri-query codex reports/ui-glitch.json
/cleri-query gemini reports/audio-drift.json
```

---

### `/cleri-ingest <file.json>`

**Merlin report auto-ingest.** Loads a Merlin-format bug report and automatically trains a new pattern if the verdict is `NOVEL`. This is the machine-learning feedback loop — each novel bug becomes a new antigen.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<file.json>` | Yes | Path to a Merlin bug report JSON |
| `--no-train` | No | Suppress auto-training (only analyze) |

**Output:**
```
❖ MERLIN-INGEST ❖
{
  "trained": true,
  "patternId": "PAT-052",
  "verdict": "NOVEL",
  "vectorPreview16": [0.12, -0.45, 0.78, ...]
}
```

**Example:**
```
/cleri-ingest reports/merlin-sqlite-busy.json
/cleri-ingest reports/merlin-sqlite-busy.json --no-train
```

---

### `/cleri-cluster`

Groups similar patterns together by vector similarity. Useful for identifying redundant patterns or finding patterns that cover the same bug family.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `--min-sim=N` | No | Minimum similarity threshold (default: `0.92`) |

**Output:**
```
❖ CLUSTER ❖
{
  "clusterCount": 3,
  "clusters": [
    ["PAT-001", "PAT-012", "PAT-045"],
    ["PAT-008", "PAT-023"],
    ["PAT-015"]
  ]
}
```

**Example:**
```
/cleri-cluster
/cleri-cluster --min-sim=0.85
```

---

### `/cleri-dupes`

Finds near-identical pattern pairs that may be duplicates. Helps clean up the corpus after many auto-ingests.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `--min-sim=N` | No | Minimum similarity for duplicate detection (default: `0.97`) |

**Output:**
```
❖ DUPLICATES ❖
{
  "pairCount": 1,
  "pairs": [
    { "a": "PAT-008", "b": "PAT-008b", "similarity": 0.985 }
  ]
}
```

**Example:**
```
/cleri-dupes
/cleri-dupes --min-sim=0.99
```

---

### `/cleri-maint`

Runs pattern maintenance — deprecates stale patterns (low feedback/effectiveness) and scores remaining patterns. This keeps the corpus healthy.

**Arguments:** None

**Output:**
```
❖ MAINTENANCE ❖
{
  "deprecatedIds": ["PAT-003", "PAT-019"],
  "stats": { "patternCount": 49, ... },
  "effectiveness": [
    { "id": "PAT-001", "effectiveness": 0.92, "hits": 5, "misses": 0 },
    { "id": "PAT-002", "effectiveness": 0.45, "hits": 1, "misses": 3 }
  ]
}
```

**Example:**
```
/cleri-maint
```

---

### `/cleri-feedback <patternId> --confirm | --reject`

Provides feedback on a pattern match — confirms it was correct (increases confidence) or rejects it (decreases confidence). This trains the engine over time.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<patternId>` | Yes | Pattern ID (e.g. `PAT-008`) |
| `--confirm` | One required | Mark the pattern match as correct |
| `--reject` | One required | Mark the pattern match as incorrect |

**Output:**
```
❖ FEEDBACK ❖
{
  "ok": true,
  "patternId": "PAT-008",
  "confidence": 0.85,
  "hitCount": 3,
  "missCount": 1,
  "effectiveness": 0.625
}
```

**Example:**
```
/cleri-feedback PAT-008 --confirm
/cleri-feedback PAT-019 --reject
```

---

### `/cleri-rebuild`

Re-quantizes the entire pattern vector index. Useful after training many patterns to ensure similarity search accuracy remains high.

**Arguments:** None

**Output:**
```
{ "ok": true, "patternCount": 51, ... }
```

**Example:**
```
/cleri-rebuild
```

---

## 3. Archive of Dominance Commands

### `/archive` / `/archive-files`

Lists all indexed source files in the Scholomance project. Shows up to 200 files inline with total count.

**Arguments:** None

**Output:**
```
❖ ARCHIVE — 34276 FILES ❖
  📜 AGENTS.md
  📜 ARCHIVE REFERENCE DOCS/ARCH.md
  📜 src/pages/Combat/CombatPage.jsx
  📜 codex/core/immunity/clerical-raid.core.js
  ...
```

Ignores `node_modules`, `.git`, `dist`, `build`, `.cache`, `coverage`, `__pycache__`, `.gradle`, `.venv`, and dotfiles.

**Example:**
```
/archive
```

---

### `/archive-search <query>`

Searches the codebase for files matching a query string. First searches file paths, then falls back to file contents if fewer than 20 path matches are found.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<query>` | Yes | Search term — case-insensitive |

**Output:**
```
❖ SEARCH — "combat" (50 matches) ❖
  📄 src/pages/Combat/CombatPage.jsx (path)
  📄 codex/core/combat.balance.js (path)
  🔍 src/lib/CombatEngine.ts (content)
  🔍 tests/combat/unit/combat.test.ts (content)
```

**Match types:**

| Icon | Match Type | Meaning |
|---|---|---|
| `📄` | path | Query matched the file path |
| `🔍` | content | Query matched inside file contents |

**Example:**
```
/archive-search quantum resonance
/archive-search BytecodeHealth
/archive-search cleri
```

---

### `/archive-neighbors <filePath>`

Finds files near a given file — first checks sibling files in the same directory, then falls back to name-based matching.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<filePath>` | Yes | Path relative to project root |

**Output:**
```
❖ NEIGHBORS — 12 files near src/pages/Combat/CombatPage.jsx ❖
  📎 src/pages/Combat/BattleArena.jsx (sibling)
  📎 src/pages/Combat/CombatLog.css (sibling)
  🔗 src/pages/Combat/hooks/useCombatState.js (name_match)
```

**Relation types:**

| Icon | Relation | Meaning |
|---|---|---|
| `📎` | sibling | Same directory |
| `🔗` | name_match | Name-based match in another directory |

**Example:**
```
/archive-neighbors codex/core/immunity/clerical-raid.core.js
/archive-neighbors src/pages/Collab/ArchiveOfDominance.jsx
```

---

## 4. BytecodeHealth Commands

### `/health`

Shows BytecodeHealth bridge status — whether the bridge is online, how many signals have been emitted, and the most recent signal details.

**Arguments:** None

**Output:**
```
❖ BYTECODE HEALTH STATUS ❖
  ● Last Signal: PB-OK-v1-IMMUNE-PASS-COORD
     Bytecode: PB-OK-v1-IMMUNE-PASS-COORD-IMMUNE_CELL-BRIDGE_INIT-e30-d28061c9
  ● Signal Count: 1
  ● Bridge: ONLINE
```

**Example:**
```
/health
```

---

### `/health-emit <cellId> <checkId>`

Emits a green-path `PB-OK-v1` BytecodeHealth signal. Creates a deterministic, checksummed health payload that can be logged, stored, or consumed by AI agents.

**Arguments:**

| Arg | Required | Description |
|---|---|---|
| `<cellId>` | Yes | Diagnostic cell that produced this signal |
| `<checkId>` | Yes | Specific check that passed |
| `--module <mod>` | No | Affected module path |

**Output:**
```
❖ BYTECODE HEALTH ❖
  ● Code: PB-OK-v1-IMMUNE-PASS-COORD
  ● Cell: IMMUNE_CELL  Check: PASS_COORD
  ● Bytecode: PB-OK-v1-IMMUNE-PASS-COORD-IMMUNE_CELL-PASS_COORD-e30-d28061c9
  ● Checksum: d28061c9
```

**Bytecode format:** `PB-OK-v1-{CODE}-{CELL}-{CHECK}-{BASE64_CONTEXT}-{CHECKSUM_8}`

**Determinism contract:** Same input always produces the same bytecode (timestamp excluded from checksum). Verified by 100-iteration test.

**Example:**
```
/health-emit IMMUNE_CELL PASS_COORD
/health-emit ARCHIVE_SCAN FILES_LISTED --module codex/core
/health-emit CLERI_BRIDGE PATTERN_LOADED
```

---

### `/health-verify [cellId] [checkId]`

Runs the 100-iteration determinism verification test. Creates 100 identical health signals and confirms they all produce identical checksums.

**Arguments:**

| Arg | Required | Default | Description |
|---|---|---|---|
| `<cellId>` | No | `IMMUNE_CELL` | Cell ID to test |
| `<checkId>` | No | `VERIFY` | Check ID to test |

**Output:**
```
❖ BYTECODE DETERMINISM ❖
  ● Deterministic: YES
  ● Iterations: 100
  ● Checksum Drift: 0
  ● Sample: d28061c9
```

All 100 iterations must produce identical checksums. Any drift indicates a non-deterministic code path and violates **VAELRIX_LAW §6**.

**Example:**
```
/health-verify
/health-verify COMBAT_CELL UPDATE_LOOP
```

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   DivTube Cockpit (Python TUI)               │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  Sidebar     │  │  Chat Log        │  │  Inspector    │  │
│  │  (commands)  │  │  (output)        │  │  (status)     │  │
│  └──────┬───────┘  └────────┬─────────┘  └───────┬───────┘  │
│         │                   │                     │         │
│         └─────────┬─────────┴──────────┬──────────┘         │
│                   │                    │                    │
│          ┌────────▼────────┐  ┌────────▼────────┐           │
│          │  Command        │  │  Service Layer  │           │
│          │  Registry       │  │  (Python)       │           │
│          └────────┬────────┘  └────────┬────────┘           │
│                   │                    │                    │
└───────────────────┼────────────────────┼────────────────────┘
                    │ subprocess         │ subprocess
                    ▼                    ▼
         ┌──────────────────────────────────────┐
         │   scholomance-bridge.mjs (Node.js)    │
         │                                       │
         │   ┌──────────────────────────────┐   │
         │   │  Clerical RAID               │   │
         │   │  (clerical-raid.bootstrap.js) │   │
         │   ├──────────────────────────────┤   │
         │   │  BytecodeHealth              │   │
         │   │  (BytecodeHealth.js)         │   │
         │   ├──────────────────────────────┤   │
         │   │  Archive (fs.walk)           │   │
         │   └──────────────────────────────┘   │
         └──────────────────────────────────────┘
                         │
                         ▼
         ┌──────────────────────────────────────┐
         │   Scholomance Codex (codex/core/)    │
         │   - immunity/clerical-raid.*.js      │
         │   - diagnostic/BytecodeHealth.js     │
         │   - quantization/turboquant.js       │
         └──────────────────────────────────────┘
```

The bridge script runs as a Node.js subprocess. Each command invocation spawns a fresh process (warm-start from module cache). The Python services handle parsing, formatting, and threading so the TUI remains responsive.

**No external server or API is required** — the bridge imports the Scholomance codex modules directly via relative path.

---

## 6. Troubleshooting

### "Bridge OFFLINE" in Inspector

The bridge checks availability by running `/cleri-stats` on init. If it fails:

1. Verify Node.js is accessible:
   ```
   which node
   node --version   # should be >= 18
   ```
2. Check the bridge script exists:
   ```
   ls divtube_downloader/scripts/scholomance-bridge.mjs
   ```
3. Run the bridge directly to see errors:
   ```
   node divtube_downloader/scripts/scholomance-bridge.mjs stats
   ```

### "Command timed out"

Large operations (full archive listing, content-based search) may exceed the 30s default timeout. Retry or narrow the query scope.

### Pattern training fails

Ensure the pattern JSON includes all required fields: `id`, `name`, `symptoms`, `owner`. The `owner` field accepts string aliases (`codex`, `claude`, `gemini`, `merlin`, `blackbox`).

### BytecodeHealth checksum drift

If `/health-verify` reports `deterministic: false` or `checksumDrift > 0`, there is non-deterministic behavior in the health signal pipeline. This violates Vaelrix Law §6. Check that `Date.now()` is excluded from the checksum computation (it is in BytecodeHealth.js by design).

### Duplicate pattern IDs

Training a pattern with an existing ID overwrites the old one. To preserve history, use unique IDs (`PAT-052`, `PAT-053`, ...).
