# Tool-Call Episodic Ledger — PDR

**File:** `docs/scholomance-encyclopedia/PDR-archive/2026-08-26-toolcall-episodic-ledger-pdr.md`
**Date:** 2026-08-26
**Status:** Proposed — not yet implemented

## Owner(s)

- **Codex:** SCD64 `NAV` domain (`src/core/scd64/constants.ts`, `src/core/scd64/glossary.ts`), the `TOOLCALL` source kind added to `BYTECODE_XP_SOURCE_KINDS`, and the shape of migration v17. Codex approves the schema; Codex does not write the migration body.
- **Claude:** Nothing in this PDR. No UI surface is created or changed. (The AETHER RESERVE cache readout shipped separately on 2026-08-26 and is out of scope here.)
- **Gemini:** Migration v17 body in `codex/server/collab/collab.persistence.js`, the `encodeBytecodeXPVaccineFromToolCall` implementation, all Vitest suites, and all Pytest suites.
- **Unassigned — see §6 ESCALATION-1:** everything under `divtube_downloader/`. That subtree appears in no jurisdiction table in `VAELRIX_LAW.md`, and this PDR writes five files into it.
- **Escalation owner** (cross-domain conflicts): Angel (Vaelrix).

## Context (seed — not the Executive Summary)

The DivTube Cockpit agent re-reads files it already read, because every tool result is discarded when a turn-loop ends. Only the final text reply survives to the next turn. This PDR gives tool calls a durable home in the MCP's existing SQLite database so a second look at an unchanged file can be answered from the record instead of re-executed.

## Target Integration Area

- `codex/server/collab/collab.persistence.js` — new migration, new table, new accessor group.
- `codex/core/diagnostic/BytecodeXPVaccine.js` — one new source kind.
- `src/core/scd64/` — new `NAV` domain on the existing eight-slot wire.
- `divtube_downloader/tui/services/` — the episode store and the recall path inside `ToolService`.

## Core Concept

Every call the cockpit agent makes to a code-navigation tool is an **episode**: a thing that happened, at a time, for a reason, against a target that had a specific content at that moment. Today those episodes exist only inside one `messages` array and evaporate with it. This PDR writes each episode as a row in the MCP's existing `scholomance_collab.sqlite` — the same database that already backs `memory_get`/`memory_set` — carrying a `BytecodeXPVaccine` bytecode for tamper-evident identity, an SCD64 `NAV` family code for *why the tool was called*, and a staleness key recording what the target looked like when the answer was computed. When the same question is asked again and the staleness key still matches, the stored answer is served without re-execution. This is Mnemosyne's episodic stratum (`MNEMOSYNE_SKILL.md` §4.1) given a physical table. It is deliberately **only** the episodic stratum; the semantic and mnemonic strata are named as non-goals in §2.

## Implementation Philosophy

Treat this as a real engineering handoff. Prefer small composable edits, deterministic behavior, adapter layers where existing contracts are uncertain, and no unnecessary rewrites. Preserve existing behavior unless a change is explicitly justified. Every mechanism here must degrade to today's behavior when its dependency is absent — a missing database, a locked database, or a disabled flag must produce exactly the pre-PDR code path, never an error.

## Ownership & Law Compliance

Every file this PDR writes appears in §7 with its owning agent. The `divtube_downloader/` ownership gap is not resolved unilaterally; it is escalated in §6 in the `ESCALATION:` format from `VAELRIX_LAW.md` §12.

---

## 1. Executive Summary

The DivTube Cockpit's agent loop (`divtube_downloader/tui/services/prompt_service.py`) discards every tool call and tool result when a turn-loop completes — `_load_history` admits only `role in ("user", "assistant")` entries, so the record of *what the agent looked at* never survives to the next user message. The agent therefore re-runs `telescope`, `microscope`, and `read_file` against files it examined moments earlier, because from its position that examination never happened. This PDR adds `collab_toolcall_episodes`, a new table in the MCP's existing `scholomance_collab.sqlite`, recording each navigation tool call with a `BytecodeXPVaccine` identity, an SCD64 `NAV` family code naming why it was called, and a staleness key describing the target's state at call time. A recall check inside `ToolService` serves a stored result when the target provably has not changed. Blast radius is moderate but well-fenced: four existing files gain additive changes, five new files are created, and two existing Vitest assertions that pin `SCD64_GLOSSARY.length` must be updated (§13). Everything is behind `DIVTUBE_EPISODE_LEDGER`, which defaults to `off`. Current status: proposed, no code written.

The measured motivation, from `divtube_downloader/.aether_meter.json` on 2026-08-26: 7,751 API calls, 487.7M prompt tokens against 5.1M completion tokens — a 95:1 ratio. That ratio is dominated by within-turn context resend, which prompt caching addresses and which this PDR does **not** address (§2). What this PDR addresses is the orthogonal failure: the agent asking a question it already has the answer to.

## 2. Out of Scope / Non-Goals

This PDR explicitly does **not** build:

1. **The navigation roadmap.** Mining episodes into reusable navigation patterns is the stated end goal and is deferred entirely. The taxonomy for that mining must be designed against real accumulated episodes, not guessed in advance.
2. **Mnemosyne's semantic, mnemonic, or procedural strata** (`MNEMOSYNE_SKILL.md` §4.2–§4.4). No `semantic_pattern`, no `mnemonic`, no `procedure` records are written. This PDR is §4.1 only.
3. **Wiring `collab_experience_ledger`.** That dormant table promotes a pattern to `active` on corroboration by ≥2 *distinct* `agent_id`s and explicitly dedupes repeat evidence from the same agent (`collab.persistence.js:1207–1233`). A single divtube worker generating its own repeat evidence can never satisfy that rule. Reusing it would require changing its promotion semantics, which would affect any future consumer. Deferred to the phase-2 PDR.
4. **Any change to token-per-turn cost.** The 95:1 prompt:completion ratio comes from `messages` growing within a turn-loop and being resent whole. This PDR does not touch `_call_api`, `messages`, or `MAX_TURNS`. A cached recall still returns a tool result that still enters `messages` and is still resent on subsequent turns of that loop.
5. **Caching `evaluate`.** `code_eval` runs code in a subprocess, executes top-level side effects, and its own module docstring states it is not deterministic. Episodes for `evaluate` are **logged** (they are navigation evidence) but never **served** from cache. See §11 Q4.
6. **Any new agent-facing tool.** No `recall_episode` tool is added. A memory the model must remember to consult is the same failure this PDR exists to fix.
7. **Cross-machine or cross-repo episode sharing.** Episodes are local to one `scholomance_collab.sqlite`.
8. **Retroactive backfill.** No attempt is made to reconstruct episodes from `.tui_prompt_history.json`; that file contains no tool records to reconstruct from.

## 3. Spec Sheet

### 3.1 Functional spec

**F1 — Episode write.** When a navigation tool executes in `ToolService`, an episode row is written to `collab_toolcall_episodes`.

*Acceptance:* after `telescope(path='codex/core/scd64')` executes with the flag in `shadow` or `on`, exactly one row exists with `tool_name='telescope'`, `target_path='codex/core/scd64'`, a non-null `bytecode` matching `/^PB-XP-v1-TCL-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$/`, and a non-null `why_hex` of 8 hex chars.

**F2 — Deterministic argument identity.** Two calls with the same tool and semantically identical arguments produce the same `args_hash`, regardless of key insertion order.

*Acceptance:* `args_hash_for('microscope', {'path': 'a.py', 'refs': True})` equals `args_hash_for('microscope', {'refs': True, 'path': 'a.py'})`.

**F3 — Deterministic why-classification.** The `NAV` family assigned to a call is a pure function of `(tool_name, args, recently_written)`.

*Acceptance:* `classify_nav('microscope', {'path': 'x.py', 'refs': True}, frozenset())` returns `'NAV_VERIFY_USAGE'` on every invocation, in every process.

**F4 — Recall on unchanged target.** With the flag `on`, a repeat call whose `args_hash` matches a stored episode AND whose recomputed staleness key equals the stored `staleness_key` returns the stored `result_text` without executing the underlying lens.

*Acceptance:* call `microscope` twice on an untouched file; the second call returns byte-identical text and `code_lens.microscope` is invoked exactly once (assert via monkeypatched call counter).

**F5 — Recall refusal on changed target.** If the recomputed staleness key differs, the lens executes normally and the row is updated.

*Acceptance:* call `microscope`, append a byte to the file, call again; the lens is invoked twice and the second result reflects the new content.

**F6 — Repeat accounting.** Each episode records `repeat_index`: the count of prior episodes sharing the same `args_hash`, at write time.

*Acceptance:* three identical calls produce `repeat_index` values 0, 1, 2.

**F7 — Total degradation safety.** With the database absent, unreadable, locked beyond `busy_timeout`, or missing the table, every tool behaves exactly as it does today.

*Acceptance:* point `COLLAB_DB_PATH` at `/nonexistent/x.sqlite`; the full `divtube_downloader/tests/` suite passes unchanged.

**F8 — Flag default.** With `DIVTUBE_EPISODE_LEDGER` unset, no row is written and no recall is attempted.

*Acceptance:* with the variable unset, a `telescope` call leaves `SELECT COUNT(*) FROM collab_toolcall_episodes` unchanged.

**F9 — `evaluate` is logged, never served.** Episodes are written for `evaluate`; recall never returns a stored `evaluate` result even on an exact staleness match.

*Acceptance:* call `evaluate` twice identically with the flag `on`; two rows exist and `code_eval.evaluate` is invoked twice.

### 3.2 Non-functional spec

| Property | Requirement | How it is met |
|---|---|---|
| Write latency | ≤ 5 ms added per tool call at p95, local SQLite | One prepared `INSERT`, WAL mode, no subprocess |
| Recall latency | ≤ 10 ms for a hit, including staleness recompute | Indexed lookup on `args_hash`; staleness is one `sha256` of one file |
| No subprocess | The hot path must not spawn a process | Python `sqlite3` opens the DB file directly; `_run_bridge` is **not** used |
| Concurrency | Safe with the Node MCP server writing concurrently | DB already runs `journal_mode=WAL`, `busy_timeout` (`codex/server/db/sqlite.migrations.js:38–41`) |
| Thread safety | The TUI calls tools from a background thread | One `sqlite3.Connection` per thread via `threading.local()` |
| Determinism | Same input → same output → same bytes | Canonical key-sorted JSON for `args_hash`; SHA-256 throughout; no timestamps in any hashed value |
| Memory | No unbounded growth | `result_text` capped at 32,768 bytes; retention prune in §3.3 |
| Disk | Bounded | Prune keeps ≤ 50,000 rows; digest and metadata survive body pruning |
| Accessibility | Not applicable | No UI surface |

### 3.3 Contracts

**Table `collab_toolcall_episodes`** (migration v17, `COLLAB_DB_NAMESPACE`):

| Column | Type | Meaning |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | Row identity |
| `session_id` | TEXT NOT NULL | One cockpit process run |
| `agent_id` | TEXT NOT NULL DEFAULT `''` | Which tab (`divtube`, `mother`) |
| `tool_name` | TEXT NOT NULL | `telescope` \| `microscope` \| `atlas` \| `evaluate` \| `read_file` |
| `target_path` | TEXT | Repo-relative path, or NULL |
| `target_symbol` | TEXT | Symbol argument, or NULL |
| `args_hash` | TEXT NOT NULL | SHA-256 of canonical args, 32 hex chars |
| `why_family` | TEXT NOT NULL | `NAV_*` family name |
| `why_hex` | TEXT NOT NULL | That family's slot-0 SCD64 hex, 8 chars |
| `staleness_kind` | TEXT NOT NULL | `file-sha256` \| `git-subtree` \| `none` |
| `staleness_key` | TEXT | The key, or NULL when `staleness_kind='none'` |
| `result_text` | TEXT | Stored result, ≤ 32,768 bytes, NULL once pruned |
| `result_digest` | TEXT NOT NULL | SHA-256 of the full result, survives pruning |
| `result_bytes` | INTEGER NOT NULL | Length before capping |
| `repeat_index` | INTEGER NOT NULL DEFAULT 0 | Prior episodes with this `args_hash` |
| `bytecode` | TEXT NOT NULL | `PB-XP-v1-TCL-…` vaccine bytecode |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Write time |

Indices: `(args_hash)`, `(tool_name, target_path)`, `(session_id, created_at)`, `(created_at)`.

**Bytecode contract.** `BYTECODE_XP_SOURCE_KINDS.TOOLCALL = 'toolcall'`, segment `TCL`. The existing `BYTECODE_PATTERN` regex gains `TCL` as a fourth alternative. All three existing source kinds and their emitted bytecodes are unchanged.

**SCD64 `NAV` contract.** A fourth domain on the unchanged eight-slot wire, with `NAV_SLOT_ALIASES` and five families. Version bytes `D1`–`D5` (confirmed) and `71`–`75` (predicted) — none collide with the allocated `01`–`06`, `A1`–`A3`, `B1`–`B3`, `C1`–`C3`, `E1`–`E6`, `F1`–`F3`.

**Public API preserved.** `checksumReport`, `encodeBytecodeXPVaccineFromError`, `encodeBytecodeXPVaccineFromHealth`, `encodeBytecodeXPVaccineFromCccb`, `generateSCD64`, `decodeSCD64Hover`, `code_lens.telescope/microscope`, `code_eval.evaluate`, and every `ToolService` handler signature are unchanged. No existing SCD64 hex value changes, because families are resolved by name and hexes derive from per-family canonical strings.

### 3.4 Deferred to a follow-up PDR

- Episode → semantic-pattern promotion (Mnemosyne §7 admission rules).
- Mnemonic generation with `unbindsIf` (Mnemosyne §4.3).
- The navigation roadmap and any harness-efficiency claim derived from it.
- Any change to `collab_experience_ledger` promotion semantics.

## 4. Change Classification

| Change | Class | Rationale |
|---|---|---|
| Migration v17 / new table | **structural** | Adds storage; alters no existing table, column, or row. |
| `TOOLCALL` source kind | **structural** | Additive enum + regex alternative; existing kinds emit identical bytecodes. |
| `NAV` SCD64 domain | **structural** | Fourth domain on an unchanged wire; no existing family's hex moves. |
| Episode write on tool call | **behavioral** | A tool call now has a durable side effect it did not have before. |
| Recall serving a stored result | **behavioral** | A tool may return without executing its lens — the point of the PDR, and the highest-risk change. |
| `episode_store.py`, `nav_classifier.py` | **structural** | New modules, no existing behavior altered. |
| Vitest glossary-count assertions | **structural** | Test-only; the assertions pin a total that a new domain necessarily changes. |
| Python reading the collab DB directly | **architectural** | A second process family becomes a first-class reader/writer of a database previously reached only through the Node bridge. See §6 ESCALATION-2. |

## 5. Assumptions and Unknowns

### Assumptions (each with how it was verified)

- **A1.** `scholomance_collab.sqlite` runs in WAL with a busy timeout, so a second process may safely read and write it. *Verified:* `codex/server/db/sqlite.migrations.js:38–41` sets `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout`.
- **A2.** The cockpit's `memory_get`/`memory_set` already terminate in this database. *Verified:* `tool_service.py:2702–2732` → `_run_bridge("memory-get")` → `collab.service.js` `getMemory`/`setMemory` → `collabPersistence.memories` → `collab_memories` (migration v8).
- **A3.** Tool results are already capped at 32,000 chars before entering `messages`. *Verified:* `prompt_service.py:431`, `result_str = str(tool_result)[:32000]`.
- **A4.** SCD64 families are hand-authored and frozen, not runtime-derived. *Verified:* `glossary.ts` — every family is an `Object.freeze` literal with `fixedForever: true`; `generateSCD64FromSlots.ts:12–19` resolves by name across three registries.
- **A5.** `code_lens` is pure stdlib with no subprocess and is deterministic; `code_eval` is neither. *Verified:* module docstrings in `code_lens.py` and `code_eval.py`, and `reference-divtube-code-lenses.md`.
- **A6.** Adding a domain to `SCD64_GLOSSARY` breaks two existing assertions. *Verified:* `tests/src/core/scd64/art-family.test.ts` asserts `SCD64_GLOSSARY.length === 48 + 24 + memoryEntries.length`; `tests/src/core/scd64/memory-family.test.ts` asserts `SCD64_GLOSSARY.length - memory.length === 72`.

### Unknowns (each with how to resolve it before the phase it blocks)

- **U1 — Real hit rate is unmeasured.** Nobody knows what fraction of navigation calls are exact repeats against unchanged targets. It could be 40% or 2%. *Resolution:* Phase 4 runs in `shadow` for one week and reports `would_have_hit` counts. This is why `shadow` exists and why Phase 5 is gated on it.
- **U2 — Staleness for `telescope` on a directory.** A per-file hash does not generalize to a subtree cheaply. *Resolution:* Phase 3 uses `staleness_kind='git-subtree'`: the key is `sha256(HEAD_sha + '\n' + sorted dirty paths under the subtree)`, from one `git status --porcelain -- <path>` call. If the subtree is dirty in any way, the key changes and recall refuses. Conservative by construction.
- **U3 — Session identity.** No cockpit session id exists today. *Resolution:* Phase 1 mints one `uuid4` per `ToolService` instance. It is used only for grouping and pruning, never in a hash.
- **U4 — Prune cadence.** Whether pruning on every write is too costly is unmeasured. *Resolution:* Phase 3 prunes probabilistically (1-in-256 writes) and Phase 4 reports prune duration.

## 6. Open Questions / Escalations

```
ESCALATION: DIVTUBE_JURISDICTION_GAP
- Clause: VAELRIX_LAW.md §"Ownership table" (lines 1175-1177)
- Current Text: "UI surface, components, CSS, animations | Claude | src/pages/, src/components/, *.css" /
  "Backend coding, debugging, tests, CI, encyclopedia | Gemini | codex/server/, codex/runtime/,
  codex/services/, codex/core/ (impls), tests/, .github/workflows/, docs/scholomance-encyclopedia/" /
  "Schemas, layer law, engine architecture | Codex | SCHEMA_CONTRACT.md, codex/ (architecture + schemas),
  src/lib/ (contracts), src/hooks/ (logic contracts), src/data/, scripts/"
- Proposed Text: add a fourth row — "DivTube Cockpit (TUI, agent loop, lenses) | <owner TBD by Angel> |
  divtube_downloader/"
- Rationale: divtube_downloader/ appears in NO jurisdiction row, yet this PDR writes five files into it
  and it already contains an autonomous agent loop with full read/write and shell privileges
  (prompt_service.py:154-156). An unowned subtree with those privileges is a governance hole
  independent of this PDR.
- Critical Nature: MEDIUM
- Structural Impact: ARCHITECTURE
- Needs: Angel's approval
```

```
ESCALATION: PYTHON_DIRECT_DB_ACCESS
- Clause: VAELRIX_LAW.md §"Schema authority" (line 26) — "No agent may create a parallel schema."
- Current Text: "SCHEMA_CONTRACT.md defines all data shapes. If a shape you need doesn't exist,
  request it — do not invent it."
- Proposed Text: no text change requested. Ruling requested instead.
- Rationale: this PDR has Python open scholomance_collab.sqlite directly rather than through
  scholomance-bridge.mjs, because _run_bridge spawns a fresh Node process per call
  (bridge_dispatch.py:65-92) and that cost cannot sit in the hot path of a lens whose whole
  virtue is being in-process and sub-millisecond. The PDR does NOT create a parallel schema —
  table creation stays in the JS migration list and Python treats a missing table as
  "ledger disabled". But a second language becoming a first-class writer to a DB previously
  reached only through the bridge is an architecture decision above this PDR's authority.
- Critical Nature: MEDIUM
- Structural Impact: ARCHITECTURE
- Needs: Angel's approval, or Codex's ruling with Angel's awareness
```

```
ESCALATION: RECALL_CORRECTNESS_AUTHORITY
- Clause: VAELRIX_LAW.md §"Determinism" (line 35) — "Same input → same output."
- Current Text: "Same input → same output. No hidden randomness in scoring pipelines."
- Proposed Text: no text change requested. Confirmation requested.
- Rationale: recall makes a tool return a result computed at an EARLIER time. This is
  determinism-preserving only if the staleness key is sound. For single files (sha256 of bytes)
  the argument is airtight. For git-subtree keys (U2) it rests on git seeing every mutation —
  which is false for files matched by .gitignore. The PDR's mitigation is that telescope over an
  ignored subtree simply never recalls, because such paths never appear in git status and the
  key cannot distinguish them. Requesting confirmation that "refuse to recall" is the accepted
  resolution rather than "do not cache directories at all".
- Critical Nature: HIGH
- Structural Impact: DETERMINISM
- Needs: Angel's approval
```

## 7. Architecture / File Map

```
codex/
  core/diagnostic/
    BytecodeXPVaccine.js              MODIFIED  +TOOLCALL kind, +encodeBytecodeXPVaccineFromToolCall
  server/collab/
    collab.persistence.js             MODIFIED  +migration v17, +collabPersistence.episodes accessors

src/core/scd64/
  constants.ts                        MODIFIED  +NAV_SLOT_ALIASES
  glossary.ts                         MODIFIED  +NAV_FAMILIES, +NAV loop in buildSCD64Glossary

divtube_downloader/
  tui/services/
    episode_store.py                  NEW       sqlite3 reader/writer, degrade-safe
    nav_classifier.py                 NEW       pure (tool, args, recently_written) -> NAV family
    episode_staleness.py              NEW       per-tool-kind staleness key computation
    tool_service.py                   MODIFIED  recall+record wrapper in 5 handlers
  tests/
    test_episode_store.py             NEW
    test_nav_classifier.py            NEW
    test_episode_recall.py            NEW

tests/
  diagnostic/
    bytecodeXPVaccine.test.js         MODIFIED  +TOOLCALL cases
  collab/
    collab.episodes.test.js           NEW
  src/core/scd64/
    nav-family.test.ts                NEW
    art-family.test.ts                MODIFIED  glossary-count assertion (§13 R1)
    memory-family.test.ts             MODIFIED  glossary-count assertion (§13 R1)

docs/scholomance-encyclopedia/
  PDR-archive/2026-08-26-toolcall-episodic-ledger-pdr.md    NEW (this file)
```

### Ownership table

| Path | Owner | Note |
|---|---|---|
| `codex/core/diagnostic/BytecodeXPVaccine.js` | **Codex** defines the source kind + segment; **Gemini** implements the encoder | Schema constant vs. impl — split per law lines 1176–1177 |
| `codex/server/collab/collab.persistence.js` | **Codex** approves migration shape; **Gemini** writes the body | Same split |
| `src/core/scd64/constants.ts` | **Codex** | Schema / wire contract |
| `src/core/scd64/glossary.ts` | **Codex** | Schema / wire contract |
| `divtube_downloader/tui/services/episode_store.py` | **UNASSIGNED — ESCALATION-1** | |
| `divtube_downloader/tui/services/nav_classifier.py` | **UNASSIGNED — ESCALATION-1** | |
| `divtube_downloader/tui/services/episode_staleness.py` | **UNASSIGNED — ESCALATION-1** | |
| `divtube_downloader/tui/services/tool_service.py` | **UNASSIGNED — ESCALATION-1** | |
| `divtube_downloader/tests/**` | **UNASSIGNED — ESCALATION-1** | |
| `tests/diagnostic/**`, `tests/collab/**`, `tests/src/core/scd64/**` | **Gemini** | Law line 1176 |
| `docs/scholomance-encyclopedia/**` | **Gemini** | Law line 1176 |

### Dependency graph

```
tool_service.py (5 handlers)
    -> nav_classifier.py        (pure, no deps)
    -> episode_staleness.py     (hashlib, subprocess for git only)
    -> episode_store.py         (sqlite3 only — NOT bridge_dispatch)
            -> scholomance_collab.sqlite  [table created by JS migration v17]

collab.persistence.js (migration v17)  -> same file, schema authority
BytecodeXPVaccine.js (TOOLCALL)        -> consumed by episode_store via precomputed constant (§11 Q7)
glossary.ts (NAV_FAMILIES)             -> consumed by nav_classifier via generated JSON (§11 Q7)
```

## 8. Step-by-Step Implementation Plan

Each phase is independently shippable and leaves the system in a working state.

### Phase 1 — Schema and identity (Codex + Gemini, ~3h)

Add `NAV_SLOT_ALIASES` and `NAV_FAMILIES`; extend `buildSCD64Glossary` with the NAV loop; add `TOOLCALL` to `BYTECODE_XP_SOURCE_KINDS`, `BYTECODE_SOURCE_SEGMENTS`, and `BYTECODE_PATTERN`; add `encodeBytecodeXPVaccineFromToolCall`. Update the two glossary-count assertions (§13 R1).

*Milestone:* `npx vitest run tests/src/core/scd64 tests/diagnostic/bytecodeXPVaccine.test.js` green.
*Exit criteria:* every pre-existing SCD64 hex is byte-identical to its value before the change (asserted by the golden test in §12); `npx vitest run tests/diagnostic tests/collab` green.

### Phase 2 — Storage (Gemini, ~2h)

Migration v17 and the `collabPersistence.episodes` accessor group.

*Milestone:* `npx vitest run tests/collab/collab.episodes.test.js` green.
*Exit criteria:* migration is idempotent (running twice is a no-op); `collab.persistence.test.js` still green; no existing table altered.

### Phase 3 — Python store, classifier, staleness (owner per ESCALATION-1, ~5h)

`episode_store.py`, `nav_classifier.py`, `episode_staleness.py`, with the flag read but no `tool_service.py` call sites yet.

*Milestone:* `divtube_downloader/.venv/bin/python -m pytest tests/test_episode_store.py tests/test_nav_classifier.py -q` green.
*Exit criteria:* store returns `None`/no-op for every operation when the DB is absent, when the table is missing, and when the flag is `off`; connections are per-thread; no `_run_bridge` import.

### Phase 4 — Shadow mode (owner per ESCALATION-1, ~3h)

Wire record-only into the five handlers. `DIVTUBE_EPISODE_LEDGER=shadow` writes episodes and computes what recall *would* have returned, comparing it to the freshly executed result, but always returns the fresh result.

*Milestone:* one week of real cockpit use; report hit rate, mismatch count, and p95 write latency.
*Exit criteria (gates Phase 5):* zero recall/fresh mismatches over ≥ 500 shadow evaluations, and a measured hit rate. **If any mismatch occurs, Phase 5 does not ship** — a mismatch means the staleness key is unsound, which is exactly what shadow exists to catch (U1, ESCALATION-3).

### Phase 5 — Live recall (owner per ESCALATION-1, ~2h)

`DIVTUBE_EPISODE_LEDGER=on` serves recalls.

*Milestone:* `divtube_downloader/.venv/bin/python -m pytest tests/test_episode_recall.py -q` green.
*Exit criteria:* §15 fully checked; §13 retest checklist executed and recorded.

## 9. Code Examples for the Pivotal Changes

### 9.1 Migration v17 — `codex/server/collab/collab.persistence.js`

Append to the `COLLAB_MIGRATIONS` array, after the `version: 16` entry:

```javascript
    {
        version: 17,
        name: 'create_toolcall_episodes',
        up(database) {
            database.exec(`
                CREATE TABLE IF NOT EXISTS collab_toolcall_episodes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    agent_id TEXT NOT NULL DEFAULT '',
                    tool_name TEXT NOT NULL,
                    target_path TEXT,
                    target_symbol TEXT,
                    args_hash TEXT NOT NULL,
                    why_family TEXT NOT NULL,
                    why_hex TEXT NOT NULL,
                    staleness_kind TEXT NOT NULL DEFAULT 'none',
                    staleness_key TEXT,
                    result_text TEXT,
                    result_digest TEXT NOT NULL,
                    result_bytes INTEGER NOT NULL DEFAULT 0,
                    repeat_index INTEGER NOT NULL DEFAULT 0,
                    bytecode TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_episodes_args ON collab_toolcall_episodes(args_hash);
                CREATE INDEX IF NOT EXISTS idx_episodes_tool_path ON collab_toolcall_episodes(tool_name, target_path);
                CREATE INDEX IF NOT EXISTS idx_episodes_session ON collab_toolcall_episodes(session_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_episodes_created ON collab_toolcall_episodes(created_at);
            `);
        },
    },
```

### 9.2 `TOOLCALL` source kind — `codex/core/diagnostic/BytecodeXPVaccine.js`

Three edits to existing constants, then one new export:

```javascript
export const BYTECODE_XP_SOURCE_KINDS = Object.freeze({
  ERROR: 'error',
  HEALTH: 'health',
  CCCB: 'cccb',
  TOOLCALL: 'toolcall',
});

const BYTECODE_SOURCE_SEGMENTS = Object.freeze({
  error: 'ERR',
  health: 'HLTH',
  cccb: 'CCCB',
  toolcall: 'TCL',
});

const BYTECODE_PATTERN = /^PB-XP-v1-(ERR|HLTH|CCCB|TCL)-([A-Z0-9]{4,8})-([0-9a-f]{12})-([0-9a-f]{12})$/;
```

```javascript
/**
 * A navigation tool call is an EPISODE, not a diagnosis: it records that the
 * agent looked, at what, and why. The vaccine gives that record a tamper-evident
 * identity on the same wire as errors and health checks.
 *
 * `createdAt` is deliberately NOT in stableContext. Two identical looks at an
 * identical target must produce an identical fingerprint, or repeat detection
 * (the whole point) cannot work.
 */
export function encodeBytecodeXPVaccineFromToolCall(episode, options = {}) {
  const title = options.title || [
    'toolcall',
    episode?.toolName || 'tool',
    episode?.whyFamily || 'NAV',
    episode?.targetPath || '',
    episode?.targetSymbol || '',
  ].join(' ');

  return new BytecodeXPVaccine({
    sourceKind: BYTECODE_XP_SOURCE_KINDS.TOOLCALL,
    sourceBytecode: null,
    semanticSlug: options.semanticSlug || safeSemanticSlug(title),
    recoveryKey: options.recoveryKey || episode?.whyFamily || null,
    stableContext: pickStableKeys({
      toolName: episode?.toolName || null,
      targetPath: episode?.targetPath || null,
      targetSymbol: episode?.targetSymbol || null,
      argsHash: episode?.argsHash || null,
      whyFamily: episode?.whyFamily || null,
      whyHex: episode?.whyHex || null,
      stalenessKind: episode?.stalenessKind || null,
      stalenessKey: episode?.stalenessKey || null,
      ...options.stableContext,
    }),
  });
}
```

### 9.3 `NAV` domain — `src/core/scd64/constants.ts`

Append after `MEMORY_SLOT_ALIASES`:

```typescript
// ─── NAV Domain (Tool-Call Episodic Ledger) ─────────────────────────────────
// The fourth domain on the eight-slot wire. A NAV record encodes one act of
// LOOKING — which tool, at what, why, and what the target looked like at the
// time. Each alias inherits its slot's structural role, exactly as MEMORY's do:
//   BUGCLASS  names WHAT KIND of thing this is    -> NAV_INTENT
//   COORDSYS  names the frame it was measured in  -> NAV_SCOPE
//   INVARIANT names what must hold                -> NAV_FRESHNESS
//   MAGNITUDE names how much                      -> NAV_BREADTH
//   MASKING   names what is excluded / hidden     -> NAV_BLINDSPOT
//   GATE      names the admission decision        -> NAV_ADMISSION
//   PROPAGATE names how it reaches other things   -> NAV_FEEDS
//   VERDICT   names the call, and what undoes it  -> NAV_INVALIDATES_IF

export const NAV_SLOT_ALIASES = Object.freeze({
  BUGCLASS:  "NAV_INTENT",
  COORDSYS:  "NAV_SCOPE",
  INVARIANT: "NAV_FRESHNESS",
  MAGNITUDE: "NAV_BREADTH",
  MASKING:   "NAV_BLINDSPOT",
  GATE:      "NAV_ADMISSION",
  PROPAGATE: "NAV_FEEDS",
  VERDICT:   "NAV_INVALIDATES_IF",
} as const);

export type NavSlotAlias = typeof NAV_SLOT_ALIASES[keyof typeof NAV_SLOT_ALIASES];
```

### 9.4 `NAV_FAMILIES` — `src/core/scd64/glossary.ts`

Two of the five families shown; the remaining three (`NAV_VERIFY_USAGE` `D3`/`73`, `NAV_RUNTIME_PROOF` `D4`/`74`, `NAV_EDIT_VERIFY` `D5`/`75`) follow the identical shape.

```typescript
/**
 * NAV families — one SCD64 encodes one act of looking.
 *
 * A family names WHY a navigation tool was called. The set is deliberately
 * small and hand-authored, exactly like BUG/ART/MEMORY: SCD64 hexes are
 * precomputed from canonical strings and frozen, so an intent that is not
 * authored here has no address and cannot be encoded. That is the constraint,
 * not a limitation — an unbounded intent space would make decodeSCD64Hover
 * unable to explain its own output.
 */
export const NAV_FAMILIES = Object.freeze({
  NAV_ORIENT: Object.freeze({
    versionByte: 'D1',
    predictedVersionByte: '71',
    domain: 'NAV',
    description: 'Cold orientation: build a map of an area the agent has no position in yet.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'NAV_INTENT:ORIENT' },
      { slot: 'COORDSYS',  canonical: 'NAV_SCOPE:subtree' },
      { slot: 'INVARIANT', canonical: 'NAV_FRESHNESS:git-subtree-clean' },
      { slot: 'MAGNITUDE', canonical: 'NAV_BREADTH:many-files' },
      { slot: 'MASKING',   canonical: 'NAV_BLINDSPOT:depth-and-symbol-caps' },
      { slot: 'GATE',      canonical: 'NAV_ADMISSION:recallable' },
      { slot: 'PROPAGATE', canonical: 'NAV_FEEDS:source-episodes' },
      { slot: 'VERDICT',   canonical: 'NAV_INVALIDATES_IF:subtree-dirty-or-head-moved' },
    ]),
  }),
  NAV_LOCATE_DEFINITION: Object.freeze({
    versionByte: 'D2',
    predictedVersionByte: '72',
    domain: 'NAV',
    description: 'Locate one definition by name or line inside one known file.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'NAV_INTENT:LOCATE_DEFINITION' },
      { slot: 'COORDSYS',  canonical: 'NAV_SCOPE:single-file' },
      { slot: 'INVARIANT', canonical: 'NAV_FRESHNESS:file-sha256-match' },
      { slot: 'MAGNITUDE', canonical: 'NAV_BREADTH:one-symbol' },
      { slot: 'MASKING',   canonical: 'NAV_BLINDSPOT:body-line-cap' },
      { slot: 'GATE',      canonical: 'NAV_ADMISSION:recallable' },
      { slot: 'PROPAGATE', canonical: 'NAV_FEEDS:source-episodes' },
      { slot: 'VERDICT',   canonical: 'NAV_INVALIDATES_IF:file-bytes-changed' },
    ]),
  }),
});
```

And the generation loop, appended inside `buildSCD64Glossary()` before `return Object.freeze(out)` — structurally identical to the MEMORY loop:

```typescript
  // NAV families — same wire contract, navigation-domain interpretation
  for (const [familyName, family] of Object.entries(NAV_FAMILIES)) {
    const deriveHex = (canonical: string, isNavIntent: boolean) => {
      const hash = crypto.createHash('sha256').update(canonical).digest('hex').toUpperCase();
      if (isNavIntent) {
        return family.versionByte + hash.slice(0, 6);
      }
      return hash.slice(0, 8);
    };

    for (let i = 0; i < family.canonicals.length; i += 1) {
      const entry = family.canonicals[i];
      const isNavIntent = entry.slot === 'BUGCLASS'; // NAV_INTENT maps to BUGCLASS slot
      const hex = deriveHex(entry.canonical, isNavIntent);
      const navAlias = NAV_SLOT_ALIASES[entry.slot as keyof typeof NAV_SLOT_ALIASES] ?? entry.slot;

      const glossaryEntry = {
        schema: 'SCD64_GLOSSARY_ENTRY',
        schemaVersion: 1,
        family: familyName,
        domain: 'NAV' as const,
        slotIndex: isNavIntent ? 0 : i,
        slotName: entry.slot,
        navSlotAlias: navAlias,
        hexCode: hex,
        versionByte: isNavIntent ? family.versionByte : undefined,
        predictedVersionByte: isNavIntent ? family.predictedVersionByte : undefined,
        category: familyName,
        canonicalMeaning: entry.canonical.split(':').slice(1).join(':'),
        canonicalDerivationString: entry.canonical,
        humanMeaning: _humanMeaningForSlot(familyName, entry.slot),
        jsonFormulaTemplate: { name: navAlias.toLowerCase() },
        fixedForever: true,
        categoryChecksum: ""
      };
      glossaryEntry.categoryChecksum = crypto.createHash('sha256')
        .update(JSON.stringify({
          family: familyName,
          slotName: entry.slot,
          hexCode: hex,
          canonical: entry.canonical,
        }))
        .digest('hex')
        .slice(0, 16)
        .toUpperCase();
      out.push(Object.freeze(glossaryEntry));
    }
  }
```

### 9.5 The why-classifier — `divtube_downloader/tui/services/nav_classifier.py`

```python
"""Deterministic classification of WHY a navigation tool was called.

Pure by construction: the answer is a function of (tool_name, args,
recently_written) and nothing else — no clock, no database, no filesystem.
That is what makes it testable and what keeps two runs over the same
transcript in agreement.

The families are NOT invented here. They mirror NAV_FAMILIES in
src/core/scd64/glossary.ts, whose hexes are frozen; this module only
picks which authored family applies.
"""

NAV_ORIENT = "NAV_ORIENT"
NAV_LOCATE_DEFINITION = "NAV_LOCATE_DEFINITION"
NAV_VERIFY_USAGE = "NAV_VERIFY_USAGE"
NAV_RUNTIME_PROOF = "NAV_RUNTIME_PROOF"
NAV_EDIT_VERIFY = "NAV_EDIT_VERIFY"


def classify_nav(tool_name, args, recently_written=frozenset()):
    """Return the NAV family for one tool call.

    `recently_written` is the set of repo-relative paths this session has
    written. A look at a path we just edited is a DIFFERENT act from a cold
    look at the same path — it is checking our own work — and collapsing the
    two would erase the distinction the roadmap most wants to see.
    """
    args = args or {}
    path = args.get("path") or args.get("entry") or ""

    # Running code to prove behaviour is its own intent regardless of target.
    if tool_name == "evaluate":
        return NAV_RUNTIME_PROOF

    # Verifying our own edit outranks the shape of the query: the reason for
    # the look is the edit, not the symbol.
    if path and path in recently_written:
        return NAV_EDIT_VERIFY

    if tool_name == "microscope":
        if args.get("refs"):
            return NAV_VERIFY_USAGE
        if args.get("symbol") or args.get("line") is not None:
            return NAV_LOCATE_DEFINITION
        return NAV_ORIENT

    if tool_name == "atlas":
        # refs/prefix are usage questions; rollup/stale are orientation.
        return NAV_VERIFY_USAGE if args.get("action") in ("refs", "prefix") else NAV_ORIENT

    if tool_name == "read_file":
        return NAV_LOCATE_DEFINITION

    # telescope, and anything not otherwise classified.
    return NAV_ORIENT
```

### 9.6 Staleness keys — `divtube_downloader/tui/services/episode_staleness.py`

```python
"""What the target looked like when an answer was computed.

A recall is only sound if this key is unchanged. Each tool kind gets the
strongest key that is cheap enough to recompute on every call:

  single file -> sha256 of the bytes. Airtight. mtime is NOT used: two writes
                 inside one filesystem timestamp tick are indistinguishable by
                 mtime, and a stale hit is worse than a miss.
  subtree     -> HEAD sha + the sorted dirty set under that path. Conservative:
                 ANY dirt in the subtree changes the key and refuses recall.
  none        -> not recallable at all (see NOT_RECALLABLE).
"""

import hashlib
import os
import subprocess

KIND_FILE = "file-sha256"
KIND_SUBTREE = "git-subtree"
KIND_NONE = "none"

# `evaluate` RUNS code — code_eval's own docstring says it is not
# deterministic and executes top-level side effects. A stored return value is
# a record of what happened once, never a prediction of what happens next.
NOT_RECALLABLE = frozenset({"evaluate"})


def _sha256_file(abs_path):
    h = hashlib.sha256()
    try:
        with open(abs_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                h.update(chunk)
    except OSError:
        return None
    return h.hexdigest()


def _git_subtree_key(project_root, rel_path):
    """HEAD plus the dirty set under rel_path.

    A path that git cannot see (ignored, untracked-and-excluded) never appears
    in --porcelain output, so its mutations cannot move this key. That is why
    dirt anywhere in the subtree refuses the recall outright rather than trying
    to reason about which files matter.
    """
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=project_root,
            capture_output=True, text=True, timeout=5,
        )
        if head.returncode != 0:
            return None
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--", rel_path], cwd=project_root,
            capture_output=True, text=True, timeout=10,
        )
        if dirty.returncode != 0:
            return None
    except (OSError, subprocess.SubprocessError):
        return None

    lines = sorted(ln.strip() for ln in dirty.stdout.splitlines() if ln.strip())
    payload = head.stdout.strip() + "\n" + "\n".join(lines)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def staleness_for(tool_name, project_root, rel_path):
    """Return (kind, key). key is None when no sound key can be computed,
    which callers MUST treat as 'do not recall'."""
    if tool_name in NOT_RECALLABLE or not rel_path:
        return KIND_NONE, None

    abs_path = os.path.normpath(os.path.join(project_root, rel_path))
    if not abs_path.startswith(project_root):
        return KIND_NONE, None

    if os.path.isfile(abs_path):
        return KIND_FILE, _sha256_file(abs_path)
    if os.path.isdir(abs_path):
        return KIND_SUBTREE, _git_subtree_key(project_root, rel_path)
    return KIND_NONE, None
```

### 9.7 The episode store — `divtube_downloader/tui/services/episode_store.py`

```python
"""Durable episodes in the MCP's own SQLite database.

Opens scholomance_collab.sqlite DIRECTLY rather than through
scholomance-bridge.mjs: _run_bridge spawns a fresh node process per call
(bridge_dispatch.py), and that cost cannot sit in the hot path of a lens whose
whole virtue is being in-process. Safe because the DB already runs WAL with a
busy_timeout (codex/server/db/sqlite.migrations.js).

This module NEVER creates the table. Schema authority stays with the JS
migration list; a missing table means the ledger is disabled, not that Python
should invent one.
"""

import hashlib
import json
import os
import random
import sqlite3
import threading
import uuid

MAX_RESULT_BYTES = 32768
MAX_ROWS = 50_000
_PRUNE_ODDS = 256

MODE_OFF = "off"
MODE_SHADOW = "shadow"
MODE_ON = "on"


def current_mode():
    mode = (os.environ.get("DIVTUBE_EPISODE_LEDGER") or MODE_OFF).strip().lower()
    return mode if mode in (MODE_OFF, MODE_SHADOW, MODE_ON) else MODE_OFF


def args_hash_for(tool_name, args):
    """Canonical, key-order-independent identity for one call.

    sort_keys is the whole contract: {'path':x,'refs':1} and
    {'refs':1,'path':x} are the same question and must hash identically.
    """
    payload = json.dumps(
        {"tool": tool_name, "args": args or {}},
        sort_keys=True, separators=(",", ":"), default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


class EpisodeStore:
    """Per-thread connections; every public method is failure-swallowing.

    An episode ledger that can break a tool call is worse than no ledger.
    """

    def __init__(self, db_path, session_id=None):
        self.db_path = db_path
        self.session_id = session_id or str(uuid.uuid4())
        self._local = threading.local()
        self._disabled = not os.path.isfile(db_path)

    def _conn(self):
        if self._disabled:
            return None
        conn = getattr(self._local, "conn", None)
        if conn is None:
            try:
                conn = sqlite3.connect(self.db_path, timeout=5.0)
                conn.row_factory = sqlite3.Row
                conn.execute("PRAGMA busy_timeout = 5000")
                # Confirm the JS migration has run. If not, stay disabled
                # rather than creating a divergent table.
                conn.execute("SELECT 1 FROM collab_toolcall_episodes LIMIT 1")
                self._local.conn = conn
            except sqlite3.Error:
                self._disabled = True
                return None
        return conn

    def lookup(self, args_hash, staleness_kind, staleness_key):
        """Most recent episode for this exact question against an unchanged
        target. Returns None whenever recall would be unsound."""
        if staleness_key is None or staleness_kind == "none":
            return None
        conn = self._conn()
        if conn is None:
            return None
        try:
            row = conn.execute(
                """
                SELECT result_text, result_digest, created_at, bytecode
                  FROM collab_toolcall_episodes
                 WHERE args_hash = ? AND staleness_kind = ? AND staleness_key = ?
                   AND result_text IS NOT NULL
                 ORDER BY id DESC LIMIT 1
                """,
                (args_hash, staleness_kind, staleness_key),
            ).fetchone()
        except sqlite3.Error:
            return None
        return dict(row) if row else None

    def record(self, *, tool_name, target_path, target_symbol, args_hash,
               why_family, why_hex, staleness_kind, staleness_key,
               result_text, bytecode, agent_id=""):
        conn = self._conn()
        if conn is None:
            return None
        full = result_text or ""
        digest = hashlib.sha256(full.encode("utf-8", "replace")).hexdigest()
        stored = full[:MAX_RESULT_BYTES]
        try:
            repeat_index = conn.execute(
                "SELECT COUNT(*) FROM collab_toolcall_episodes WHERE args_hash = ?",
                (args_hash,),
            ).fetchone()[0]
            with conn:
                conn.execute(
                    """
                    INSERT INTO collab_toolcall_episodes
                      (session_id, agent_id, tool_name, target_path, target_symbol,
                       args_hash, why_family, why_hex, staleness_kind, staleness_key,
                       result_text, result_digest, result_bytes, repeat_index, bytecode)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (self.session_id, agent_id, tool_name, target_path, target_symbol,
                     args_hash, why_family, why_hex, staleness_kind, staleness_key,
                     stored, digest, len(full), repeat_index, bytecode),
                )
            if random.randrange(_PRUNE_ODDS) == 0:
                self._prune(conn)
            return repeat_index
        except sqlite3.Error:
            return None

    def _prune(self, conn):
        """Drop bodies from the oldest rows past MAX_ROWS. The row survives —
        digest, why, and repeat history are what the roadmap needs, and they
        cost bytes, not kilobytes."""
        try:
            with conn:
                conn.execute(
                    """
                    UPDATE collab_toolcall_episodes SET result_text = NULL
                     WHERE result_text IS NOT NULL AND id NOT IN (
                       SELECT id FROM collab_toolcall_episodes
                        ORDER BY id DESC LIMIT ?
                     )
                    """,
                    (MAX_ROWS,),
                )
        except sqlite3.Error:
            pass
```

### 9.8 The recall wrapper — `divtube_downloader/tui/services/tool_service.py`

One helper plus a five-line change at the top of each wrapped handler. `_microscope` shown; `_telescope`, `_atlas`, `_read_file` are identical in shape. `_evaluate` calls `_episode_record` only — never `_episode_recall`.

```python
    def _episode_recall(self, tool_name, kwargs, callback):
        """Return (hit_text, record_fn). hit_text is None unless a sound recall
        exists. record_fn(result) stores the episode; it is a no-op when the
        ledger is off or unavailable.

        Never raises. A ledger failure must be invisible to the tool.
        """
        from tui.services import episode_staleness, episode_store
        from tui.services.nav_classifier import classify_nav

        noop = (None, lambda _result: None)
        try:
            mode = episode_store.current_mode()
            if mode == episode_store.MODE_OFF or self._episodes is None:
                return noop

            rel_path = kwargs.get("path") or kwargs.get("entry") or ""
            args_hash = episode_store.args_hash_for(tool_name, kwargs)
            why = classify_nav(tool_name, kwargs, self._recently_written())
            kind, key = episode_staleness.staleness_for(tool_name, PROJECT_ROOT, rel_path)

            def record(result):
                try:
                    self._episodes.record(
                        tool_name=tool_name, target_path=rel_path or None,
                        target_symbol=kwargs.get("symbol"), args_hash=args_hash,
                        why_family=why, why_hex=NAV_HEX[why],
                        staleness_kind=kind, staleness_key=key,
                        result_text=str(result),
                        bytecode=_toolcall_bytecode(tool_name, rel_path, args_hash, why, kind, key),
                    )
                except Exception:
                    pass

            if mode == episode_store.MODE_ON:
                hit = self._episodes.lookup(args_hash, kind, key)
                if hit:
                    if callback:
                        callback(f"  [#7CFF8B]✓[/] {tool_name}: recalled (unchanged since {hit['created_at']})")
                    return hit["result_text"], lambda _r: None
            return None, record
        except Exception:
            return noop

    def _microscope(self, kwargs, callback):
        hit, record = self._episode_recall("microscope", kwargs, callback)
        if hit is not None:
            return hit
        result = self._microscope_uncached(kwargs, callback)   # the existing body, renamed
        record(result)
        return result
```

## 10. Glossary

| Term | One-line meaning |
|---|---|
| **Episode** | One recorded act of looking: a tool call with its target, reason, result, and the target's state at that moment. Mnemosyne §4.1. |
| **Staleness key** | A hash of what the target looked like when the answer was computed; recall is sound only while it still matches. |
| **`args_hash`** | SHA-256 of canonical key-sorted JSON of `(tool, args)` — the identity of "this exact question". |
| **NAV family** | One of five authored SCD64 shapes naming *why* a tool was called (`NAV_ORIENT`, `NAV_LOCATE_DEFINITION`, `NAV_VERIFY_USAGE`, `NAV_RUNTIME_PROOF`, `NAV_EDIT_VERIFY`). |
| **SCD64** | A 64-hex-char address: eight 8-char slots, each a frozen hash of a hand-authored canonical string. An address, never a payload. |
| **Version byte** | The first two hex chars of slot 0, identifying the family's domain and kind. |
| **BytecodeXPVaccine** | The repo's tamper-evident identity format, `PB-XP-v1-<SEG>-<SLUG>-<FINGERPRINT>-<CHECKSUM>`. |
| **`stableContext`** | The frozen, key-sorted subset of a vaccine's inputs that its fingerprint is computed over. |
| **Shadow mode** | The ledger records and computes what recall *would* return, but always serves the freshly executed result. |
| **Mnemosyne** | The repo's metamemory law (`Scholomance LAW/MNEMOSYNE_SKILL.md`); this PDR implements its episodic stratum only. |
| **`unbindsIf`** | Mnemosyne's pre-registered, observable condition that withdraws trust in a mnemonic. Not used here — no mnemonics are created (§2.2). |
| **Telescope / Microscope / Atlas / Evaluate** | The cockpit's four code lenses: structural map, single-file detail, inverted index, and runtime execution. |
| **WAL** | SQLite write-ahead logging; permits one writer concurrently with readers across processes. |
| **`_run_bridge`** | The cockpit's per-call Node subprocess dispatcher. Deliberately not used by this PDR's hot path. |

## 11. Q&A — Top 10 Implementation Concerns

**Q1. Why not just reuse `collab_memories`?**
It is a key/value store with `PRIMARY KEY (agent_id, key)` — one value per key, overwritten on write. Episodes are an append-only series where the repeats *are* the signal. Storing them in a KV table would require synthesizing unique keys and JSON-packing the fields, which forfeits every index and makes the phase-2 mining query a full-table JSON scan.

**Q2. Why not `collab_activity`, which already logs actions?**
Considered and rejected with the user in design. Its `details` column is opaque JSON; mining by tool, path, and why would require scanning and parsing every row, including all unrelated collab actions. Tool calls will outnumber the 7,751 recorded LLM calls several times over.

**Q3. Doesn't `_FileCache` in `tool_service.py:212` already solve this?**
No. It caches file *bytes* to avoid disk I/O within one process, keyed on mtime, lost at exit. It does not prevent the agent from *deciding* to look again, does not survive a restart, and does not record why anything was read. It is a disk optimization; this is a memory.

**Q4. Why is `evaluate` logged but never recalled?**
`code_eval` executes the target in a subprocess including top-level side effects, and its own docstring states it is not deterministic. A stored return value is a record of what happened once, not a prediction of what happens next. Serving it would be the "checks that cannot fail" pathology in a new place. Its episodes are still valuable as navigation evidence.

**Q5. What happens when the Node MCP server is writing while Python reads?**
WAL permits concurrent readers with one writer, and `busy_timeout` makes a contended write wait rather than fail. If it times out anyway, `sqlite3.Error` is caught and the operation returns `None` — the tool executes normally. A lock contention degrades to today's behavior.

**Q6. Could a recall return a result computed against a file that has since changed?**
For `staleness_kind='file-sha256'`, only if SHA-256 collides. For `git-subtree`, only if a mutation is invisible to `git status` — which is why any dirt in the subtree refuses recall outright, and why gitignored subtrees never produce a recallable key at all. This is the risk ESCALATION-3 asks Angel to confirm, and Phase 4's shadow gate exists to catch it empirically before Phase 5 ships.

**Q7. `episode_store.py` is Python but `NAV_FAMILIES` and the vaccine encoder are JS. How does Python get the hexes without spawning Node?**
It does not compute them. Phase 1 adds an `npm run scd64:nav-export` script emitting `divtube_downloader/tui/services/nav_hex.json` — a frozen `{family: hex}` map generated from `SCD64_GLOSSARY`, committed to the repo, and asserted equal to the live glossary by a Vitest test (§12). The bytecode is built in Python from the same documented format string, with a JS-vs-Python golden test asserting byte-identical output for fixed inputs. Generation stays in JS; Python consumes a checked-in artifact that CI proves is current.

**Q8. Does this reduce token cost?**
Not per turn, and §2.4 says so explicitly. A recalled result still enters `messages` and is still resent on later turns of the same loop. What it removes is the *second* execution and the tokens of the *second* result across turn boundaries. The 95:1 ratio is a separate problem addressed by prompt caching, shipped separately.

**Q9. Why five NAV families rather than a richer taxonomy?**
Because SCD64 addresses are hand-authored and frozen, and because a taxonomy invented before the data exists is a guess. Five covers the observed tool surface with no overlap. Phase-2 mining over real episodes is what should propose a sixth.

**Q10. What if the JS migration has not run when Python first opens the DB?**
`_conn()` probes with `SELECT 1 FROM collab_toolcall_episodes LIMIT 1` and marks itself permanently disabled on failure. Python never runs DDL. The ledger simply stays off until the MCP server starts once and applies v17.

## 12. QA Plan

### New test files

| Path | Runner | Covers |
|---|---|---|
| `tests/src/core/scd64/nav-family.test.ts` | Vitest | NAV family structure, alias completeness, hex format, version-byte non-collision, `nav_hex.json` currency |
| `tests/diagnostic/bytecodeXPVaccine.test.js` (extended) | Vitest | `TOOLCALL` encode/parse, timestamp-independence, existing-kind non-regression |
| `tests/collab/collab.episodes.test.js` | Vitest | Migration v17 idempotence, insert/lookup, index presence |
| `divtube_downloader/tests/test_nav_classifier.py` | Pytest | Every classification branch, purity |
| `divtube_downloader/tests/test_episode_store.py` | Pytest | `args_hash` key-order independence, degrade-safety, repeat_index, prune |
| `divtube_downloader/tests/test_episode_recall.py` | Pytest | Hit on unchanged, miss on changed, `evaluate` never recalled, flag gating |

### Commands

```bash
# Vitest (repo root) — Phase 1 and 2
npx vitest run tests/src/core/scd64 tests/diagnostic/bytecodeXPVaccine.test.js tests/collab

# Pytest (divtube) — Phases 3-5. Throttled per repo convention.
cd divtube_downloader
nice -n 19 .venv/bin/python -m pytest tests/test_nav_classifier.py tests/test_episode_store.py tests/test_episode_recall.py -q

# Full divtube suite — regression gate (449 tests green as of 2026-08-26)
nice -n 19 .venv/bin/python -m pytest tests/ -q
```

### Runnable test examples

`tests/src/core/scd64/nav-family.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NAV_FAMILIES, MEMORY_FAMILIES, ART_FAMILIES, BUG_FAMILIES, SCD64_GLOSSARY } from '../../../../src/core/scd64/glossary';
import { NAV_SLOT_ALIASES, SCD64_SLOT_NAMES } from '../../../../src/core/scd64/constants';
import navHex from '../../../../divtube_downloader/tui/services/nav_hex.json';

describe('NAV families', () => {
  it('every family fills all eight slots in wire order', () => {
    for (const [name, family] of Object.entries(NAV_FAMILIES)) {
      const slots = family.canonicals.map((c: any) => c.slot);
      expect(slots, name).toEqual([...SCD64_SLOT_NAMES]);
    }
  });

  it('aliases cover every slot', () => {
    expect(Object.keys(NAV_SLOT_ALIASES).sort()).toEqual([...SCD64_SLOT_NAMES].sort());
  });

  it('version bytes collide with no other domain', () => {
    const others = [BUG_FAMILIES, ART_FAMILIES, MEMORY_FAMILIES].flatMap(
      (reg) => Object.values(reg).flatMap((f: any) => [f.versionByte, f.predictedVersionByte]),
    );
    for (const [name, f] of Object.entries(NAV_FAMILIES)) {
      expect(others, `${name} versionByte`).not.toContain((f as any).versionByte);
      expect(others, `${name} predictedVersionByte`).not.toContain((f as any).predictedVersionByte);
    }
  });

  it('nav_hex.json is current — the Python side reads THIS artifact', () => {
    // Without this, Python can silently tag episodes with a stale hex and the
    // decoder would explain them as the wrong intent.
    const live: Record<string, string> = {};
    for (const e of SCD64_GLOSSARY) {
      if ((e as any).domain === 'NAV' && e.slotIndex === 0) live[e.family] = e.hexCode;
    }
    expect(navHex).toEqual(live);
  });
});
```

`divtube_downloader/tests/test_episode_store.py`:

```python
import os
import sqlite3
import tempfile
import unittest

from tui.services import episode_store


def _make_db(path):
    """Mirror of migration v17. Test-only: production Python never runs DDL."""
    conn = sqlite3.connect(path)
    conn.execute("""
        CREATE TABLE collab_toolcall_episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
            agent_id TEXT NOT NULL DEFAULT '', tool_name TEXT NOT NULL,
            target_path TEXT, target_symbol TEXT, args_hash TEXT NOT NULL,
            why_family TEXT NOT NULL, why_hex TEXT NOT NULL,
            staleness_kind TEXT NOT NULL DEFAULT 'none', staleness_key TEXT,
            result_text TEXT, result_digest TEXT NOT NULL,
            result_bytes INTEGER NOT NULL DEFAULT 0,
            repeat_index INTEGER NOT NULL DEFAULT 0, bytecode TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
    conn.commit()
    conn.close()


class TestArgsHash(unittest.TestCase):
    def test_key_order_does_not_change_identity(self):
        a = episode_store.args_hash_for("microscope", {"path": "a.py", "refs": True})
        b = episode_store.args_hash_for("microscope", {"refs": True, "path": "a.py"})
        self.assertEqual(a, b)

    def test_different_args_differ(self):
        a = episode_store.args_hash_for("microscope", {"path": "a.py"})
        b = episode_store.args_hash_for("microscope", {"path": "b.py"})
        self.assertNotEqual(a, b)


class TestDegradation(unittest.TestCase):
    def test_missing_database_is_silent(self):
        store = episode_store.EpisodeStore("/nonexistent/nope.sqlite")
        self.assertIsNone(store.lookup("h", "file-sha256", "k"))
        self.assertIsNone(store.record(
            tool_name="microscope", target_path="a.py", target_symbol=None,
            args_hash="h", why_family="NAV_ORIENT", why_hex="D1AAAAAA",
            staleness_kind="file-sha256", staleness_key="k",
            result_text="x", bytecode="PB-XP-v1-TCL-AAAA-0-0"))

    def test_present_file_without_table_stays_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "empty.sqlite")
            sqlite3.connect(path).close()   # a real DB with no episode table
            store = episode_store.EpisodeStore(path)
            self.assertIsNone(store.lookup("h", "file-sha256", "k"))


class TestRecordAndLookup(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "collab.sqlite")
        _make_db(self.path)
        self.store = episode_store.EpisodeStore(self.path, session_id="s1")

    def tearDown(self):
        self.tmp.cleanup()

    def _record(self, key="k1", text="hello"):
        return self.store.record(
            tool_name="microscope", target_path="a.py", target_symbol="f",
            args_hash="h1", why_family="NAV_LOCATE_DEFINITION", why_hex="D2BBBBBB",
            staleness_kind="file-sha256", staleness_key=key,
            result_text=text, bytecode="PB-XP-v1-TCL-AAAA-0-0")

    def test_repeat_index_counts_priors(self):
        self.assertEqual(self._record(), 0)
        self.assertEqual(self._record(), 1)
        self.assertEqual(self._record(), 2)

    def test_lookup_hits_on_matching_key(self):
        self._record()
        self.assertEqual(self.store.lookup("h1", "file-sha256", "k1")["result_text"], "hello")

    def test_lookup_misses_on_changed_key(self):
        self._record(key="k1")
        self.assertIsNone(self.store.lookup("h1", "file-sha256", "CHANGED"))

    def test_none_key_never_recalls(self):
        self._record()
        self.assertIsNone(self.store.lookup("h1", "none", None))
```

`divtube_downloader/tests/test_nav_classifier.py`:

```python
import unittest

from tui.services.nav_classifier import (
    classify_nav, NAV_ORIENT, NAV_LOCATE_DEFINITION,
    NAV_VERIFY_USAGE, NAV_RUNTIME_PROOF, NAV_EDIT_VERIFY,
)


class TestClassification(unittest.TestCase):
    def test_evaluate_is_runtime_proof_even_after_an_edit(self):
        # Running code outranks the edit context: the intent is proof, not review.
        self.assertEqual(
            classify_nav("evaluate", {"path": "a.js", "symbol": "f"}, frozenset({"a.js"})),
            NAV_RUNTIME_PROOF)

    def test_refs_is_usage_verification(self):
        self.assertEqual(classify_nav("microscope", {"path": "a.py", "refs": True}), NAV_VERIFY_USAGE)

    def test_symbol_without_refs_locates(self):
        self.assertEqual(classify_nav("microscope", {"path": "a.py", "symbol": "g"}), NAV_LOCATE_DEFINITION)

    def test_line_zero_still_locates(self):
        # `line: 0` is falsy — a truthiness check here would misclassify it.
        self.assertEqual(classify_nav("microscope", {"path": "a.py", "line": 0}), NAV_LOCATE_DEFINITION)

    def test_bare_microscope_orients(self):
        self.assertEqual(classify_nav("microscope", {"path": "a.py"}), NAV_ORIENT)

    def test_recently_written_path_is_edit_verify(self):
        self.assertEqual(
            classify_nav("microscope", {"path": "a.py", "symbol": "g"}, frozenset({"a.py"})),
            NAV_EDIT_VERIFY)

    def test_atlas_action_splits_usage_from_orientation(self):
        self.assertEqual(classify_nav("atlas", {"action": "refs", "token": "t"}), NAV_VERIFY_USAGE)
        self.assertEqual(classify_nav("atlas", {"action": "rollup", "path": "p"}), NAV_ORIENT)

    def test_is_pure(self):
        args = {"path": "a.py", "refs": True}
        first = classify_nav("microscope", args)
        for _ in range(50):
            self.assertEqual(classify_nav("microscope", args), first)
        self.assertEqual(args, {"path": "a.py", "refs": True})  # not mutated
```

## 13. Regression Risks and Specific Retest Checklist

**R1 — Two Vitest assertions pin `SCD64_GLOSSARY.length` and will fail.** *Confirmed by reading the files, not predicted.*
- `tests/src/core/scd64/art-family.test.ts` asserts `SCD64_GLOSSARY.length === 48 + 24 + memoryEntries.length`.
- `tests/src/core/scd64/memory-family.test.ts` asserts `SCD64_GLOSSARY.length - memory.length === 72`.

Both must become domain-relative, matching the pattern already introduced for MEMORY on 2026-08-26 (commit `e8cd5ee9`), which chose exactly this shape so a new family would not force an edit. Fix:

```typescript
// art-family.test.ts
const memoryEntries = SCD64_GLOSSARY.filter((e) => e.domain === 'MEMORY');
const navEntries = SCD64_GLOSSARY.filter((e) => e.domain === 'NAV');
expect(navEntries.length).toBe(Object.keys(NAV_FAMILIES).length * 8);
expect(SCD64_GLOSSARY.length).toBe(48 + 24 + memoryEntries.length + navEntries.length);

// memory-family.test.ts — the invariant is "MEMORY leaves BUG and ART alone",
// so subtract NAV as well rather than re-pinning a grand total.
const nav = SCD64_GLOSSARY.filter((e) => e.domain === 'NAV');
expect(SCD64_GLOSSARY.length - memory.length - nav.length).toBe(72);
```

Retest: `npx vitest run tests/src/core/scd64`

**R2 — Existing bytecodes must not move.** Adding `TOOLCALL` to two frozen maps and a regex could alter existing output if done carelessly. Add a golden assertion:

```javascript
// tests/diagnostic/bytecodeXPVaccine.test.js
it('adding TOOLCALL does not move any existing bytecode', () => {
  const v = encodeBytecodeXPVaccineFromHealth(
    { cellId: 'c1', checkId: 'k1', code: 'X', moduleId: 'm', context: {} });
  expect(v.bytecode).toMatch(/^PB-XP-v1-HLTH-/);
  expect(parseBytecodeXPVaccineBytecode(v.bytecode).valid).toBe(true);
});
```
Retest: `npx vitest run tests/diagnostic/bytecodeXPVaccine.test.js`

**R3 — Migration v17 must not disturb v1–v16.** Retest: `npx vitest run tests/collab` and confirm `collab.persistence.test.js` reports the expected `currentVersion`.

**R4 — The five wrapped handlers must behave identically with the flag off.** The rename to `_microscope_uncached` etc. is where a signature could silently drift. Retest: `cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/ -q` — expect the 449-test baseline green with `DIVTUBE_EPISODE_LEDGER` unset.

**R5 — Lens golden output must be byte-identical through the wrapper.** Retest: `nice -n 19 .venv/bin/python -m pytest tests/test_code_eval.py tests/test_lens_ux_fixes.py -q`

**R6 — `tool_service.py` is ~3,269 lines and already carries two stale backups** (`.consolidation-backup`, `.healer.bak`). Do not edit those. Retest: `git status --short divtube_downloader/tui/services/` must show only `tool_service.py` modified.

**R7 — Thread safety.** The TUI runs tools on a background thread (`prompt_service.py:503`). A shared connection would raise `ProgrammingError`. Retest: a Pytest case driving `EpisodeStore.record` from four `threading.Thread`s concurrently, asserting 4 rows and no exception.

## 14. Rollout Plan

### Flag

`DIVTUBE_EPISODE_LEDGER` — `off` (default, absent) | `shadow` | `on`. Read per call via `episode_store.current_mode()`, so a mode change takes effect without a cockpit restart.

### How the system runs while incomplete (mandatory clause)

Every intermediate state is a working cockpit:

- **Phases 1–2 shipped, 3–5 not:** the table and the NAV domain exist; nothing writes to them. The cockpit is byte-for-byte unchanged. This state is indefinitely safe.
- **Phase 3 shipped, 4–5 not:** three new Python modules exist and are imported by nothing. Unchanged behavior.
- **Phase 4 shipped (`shadow`):** episodes are written and would-be recalls are computed and compared, but the freshly executed result is always what the agent receives. A wrong staleness key in this state produces a logged mismatch, never a wrong answer. This is the state the system should sit in for a week.
- **Phase 5 shipped but flag left at `shadow`:** identical to the above. The flag, not the deploy, is what turns recall on.

### Canary

Enable `on` for the `mother` tab only first (`agent_id == 'mother'`), which is read-only by system prompt (`prompt_service.py:141–144`) and therefore has the smallest blast radius if a recall is wrong. Promote to `divtube` after 48h clean.

### Rollback

1. **Immediate, no deploy:** `unset DIVTUBE_EPISODE_LEDGER` (or set `off`) and restart the cockpit. All recall and all writing stop. This is the complete rollback for every behavioral risk.
2. **Code rollback:** revert the `tool_service.py` commit. The three new Python modules become unreferenced and inert.
3. **Schema rollback:** *do not* write a down-migration. The table is additive and inert when unread; `runSqliteMigrations` tracks applied versions in `schema_migrations` and dropping v17 would desynchronize that ledger. Leave the table.
4. **Data purge (only if required):** `DELETE FROM collab_toolcall_episodes;` — affects no other table, no foreign keys point at it.

## 15. Definition of Done

Every box is mechanically checkable.

- [ ] `npx vitest run tests/src/core/scd64` — green, including `nav-family.test.ts` and the two R1-updated assertions.
- [ ] `npx vitest run tests/diagnostic tests/collab` — green, including R2's golden and `collab.episodes.test.js`.
- [ ] `cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/ -q` — green, ≥ 449 passed, with `DIVTUBE_EPISODE_LEDGER` unset.
- [ ] The same command green with `DIVTUBE_EPISODE_LEDGER=on` and a real `scholomance_collab.sqlite` present.
- [ ] The same command green with `COLLAB_DB_PATH=/nonexistent/x.sqlite` (F7).
- [ ] `nav_hex.json` equals the live glossary (asserted by `nav-family.test.ts`).
- [ ] `grep -n "_run_bridge" divtube_downloader/tui/services/episode_store.py` returns nothing.
- [ ] `grep -nE "CREATE TABLE|ALTER TABLE" divtube_downloader/tui/services/episode_store.py` returns nothing (Q10).
- [ ] `git status --short divtube_downloader/tui/services/` lists no `.bak` or `.backup` file as modified (R6).
- [ ] Phase 4 shadow report recorded: ≥ 500 evaluations, **0 recall/fresh mismatches**, hit rate stated as a number, p95 write latency ≤ 5 ms.
- [ ] All three §6 escalations have a recorded ruling from Angel.
- [ ] `npm run lint` passes with `--max-warnings=0` on the changed JS/TS.
- [ ] The PIR named in §18 exists and is filled in.

## 16. Final Architectural Verdict

**Partial implementation** — and deliberately so, because the thing that was asked for cannot be honestly delivered in one PDR.

The stated goal was a navigation roadmap that makes the harness worker more efficient. This PDR builds only the substrate that goal requires: durable, well-typed, checksummed episodes. It does not build the roadmap, and §2 says so in the first line. That is not scope-shaving — the taxonomy for mining a roadmap has to be derived from real episodes, and none exist yet. Designing it now would produce a category system fitted to my guesses about how the agent navigates rather than to how it actually does, which is the "fixtures inherit the author's blind spots" failure this repo has already measured once.

Three things a reader should not be sold on. **First, the token claim is narrower than it sounds:** this eliminates duplicate *executions* and their duplicate results across turns; it does nothing about the 95:1 prompt:completion ratio, which is within-turn context resend and a different problem. **Second, the hit rate is unmeasured** — U1 is real, and it is entirely possible that shadow mode reveals the agent rarely asks a byte-identical question against a byte-identical target, in which case Phase 5 should not ship and this PDR will have bought a well-instrumented episode log and an honest negative result. That outcome is why shadow mode gates Phase 5 rather than merely preceding it. **Third, recall correctness rests on the staleness key**, and the subtree variant is genuinely weaker than the single-file variant; ESCALATION-3 exists because that weakness deserves an owner's ruling rather than my assurance.

What the PDR does have going for it is that every failure mode degrades to today's behavior, the default is `off`, and the rollback is an environment variable.

## 17. References

| Path | Purpose |
|---|---|
| `codex/server/collab/collab.persistence.js` | Migration list (v1–v16), `collabPersistence` accessors, DB init. Migration v17 goes here. |
| `codex/server/collab/collab.service.js` | `setMemory`/`getMemory` — proof the cockpit's memory tools terminate in this DB. |
| `codex/server/db/sqlite.migrations.js` | `applySqlitePragmas` — the WAL + `busy_timeout` guarantee (A1). |
| `codex/core/diagnostic/BytecodeXPVaccine.js` | Vaccine format; gains the `TOOLCALL` source kind. |
| `src/core/scd64/constants.ts` | Slot names, domain aliases, closed vocabularies. Gains `NAV_SLOT_ALIASES`. |
| `src/core/scd64/glossary.ts` | Frozen family registries and `buildSCD64Glossary`. Gains `NAV_FAMILIES`. |
| `src/core/scd64/generateSCD64FromSlots.ts` | `resolveFamily` across registries — the pattern NAV must join. |
| `src/core/scd64/decodeSCD64.ts` | `decodeSCD64Hover` — why families must be pre-authored to be explainable. |
| `divtube_downloader/tui/services/tool_service.py` | The five handlers wrapped; `_FileCache`; `_UNDO_STACK`. |
| `divtube_downloader/tui/services/prompt_service.py` | The agent loop; where tool history is discarded (`_load_history`). |
| `divtube_downloader/tui/services/bridge_dispatch.py` | `_run_bridge` — the per-call subprocess cost this PDR avoids. |
| `divtube_downloader/tui/services/code_lens.py` | Telescope/microscope; pure stdlib, deterministic (A5). |
| `divtube_downloader/tui/services/code_eval.py` | Evaluate; explicitly non-deterministic (§2.5, Q4). |
| `divtube_downloader/tui/services/code_atlas.py` | `load_atlas` mtime cache and `is_stale` — the degrade-safe precedent this PDR copies. |
| `divtube_downloader/.aether_meter.json` | The 7,751-call / 487.7M-token measurement in §1. |
| `docs/scholomance-encyclopedia/Scholomance LAW/MNEMOSYNE_SKILL.md` | The governing law. §4.1 is implemented; §4.2–4.4 are non-goals. |
| `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` | Jurisdiction table, determinism law, `ESCALATION:` format. |
| `docs/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` | The template this document follows. |
| `tests/src/core/scd64/art-family.test.ts` | Carries an R1 assertion that this PDR must update. |
| `tests/src/core/scd64/memory-family.test.ts` | Carries the second R1 assertion. |
| `tests/collab/collab.persistence.test.js` | Migration regression gate (R3). |

## 18. Post-Implementation Report Handoff

**Required PIR:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260826-TOOLCALL-EPISODIC-LEDGER.md`

The PIR must report, as measured numbers rather than claims:

1. Shadow-mode hit rate over ≥ 500 evaluations — the resolution of U1.
2. Recall/fresh mismatch count. Any value above zero means Phase 5 did not ship, and the PIR must say so.
3. p95 episode write latency and p95 recall latency.
4. Row count and database growth after one week.
5. Distribution of episodes across the five NAV families — the first real evidence about whether the taxonomy carves at the joints, and the input to the phase-2 roadmap PDR.
6. `repeat_index` distribution — the direct measurement of how often the agent asks the same question twice, which is the premise this entire PDR rests on.

A PDR that ships without its PIR is incomplete. If the shadow gate fails and Phase 5 never ships, the PIR is still required and should record the negative result.
