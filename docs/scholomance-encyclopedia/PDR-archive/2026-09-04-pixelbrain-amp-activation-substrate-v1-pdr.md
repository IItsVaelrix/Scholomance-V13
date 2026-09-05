# PDR: PixelBrain AMP Activation Substrate v1
## A Checksummed, Deterministic Relevance Registry for 39 Dormant-by-Default AMPs

**Status:** Implemented 2026-09-04. See `PIR-20260904-AMP-ACTIVATION-SUBSTRATE-V1.md` for source-truth pilot corrections, verification evidence, and repository-wide baseline follow-up.
**Classification:** Architectural | PixelBrain | New Subsystem | New Frozen Contract (`PB-AMP-RELEVANCE-v1`)
**Priority:** High — the direct answer to a gap this session's own audit measured: 39 real, working AMPs with no place that decides which ones an asset needs, so 19 of 39 generator scripts each answer that question by hand.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-AMP-ACTIVATION-SUBSTRATE-V1-2026-09-04`

---

## Owner(s)
- **Codex:** the frozen `PB-AMP-RELEVANCE-v1` contract (record shape, predicate grammar) — schema-sovereign, same category as `PB-VRI-v1`/`PB-STROKE-v1` in `vri-schema.js`.
- **Gemini:** implementation — the SQLite substrate, the selector, the CLI, the microprocessor-registry bridge, all new tests.
- **Claude:** no v1 scope. No UI surface touched.
- **Escalation owner** (cross-domain conflicts): Angel (repository owner).

## Context (seed — not the Executive Summary)
An Emergent Disparity Reconciliation pass this session (2026-09-04) measured 39 PixelBrain AMP modules, all genuinely wired into real production code — and zero central place deciding which of them a given asset needs. 19 of the codebase's 39 generator scripts import effect passes directly and re-decide that question by hand, every time. Two candidate fixes were considered and rejected in conversation before this PDR: a trained/neural gate (breaks this codebase's zero-RNG determinism law) and reusing the existing `SCD64` checksum system (measured to be a linguistic bug-diagnostic index, unrelated to PixelBrain modules). This PDR builds the third option: a deterministic, checksummed, SQLite-backed relevance registry, modeled on a pattern that already exists and already works elsewhere in this codebase.

## Target Integration Area
- New: `codex/core/pixelbrain/amp-substrate/` (contract, SQLite adapter, selector, pilot relevance records).
- New: `scripts/amp-substrate-cli.mjs`.
- Additive only: `codex/core/microprocessors/index.js` gains new `pixelbrain.amp.<id>` registrations, alongside its existing `amp.symmetry`/`amp.coord-symmetry`/`amp.shadow-perception` entries, which are untouched.
- **Not modified:** any of the 39 AMP modules themselves, `item-foundry.js`, `character-foundry.js`, any `factory/*.js`, `amp-registry.js`, `scdna-art-gene.js`, or any of the 19 direct-wire generator scripts. This PDR makes the selection capability exist, checksummed and queryable. It does not turn it on anywhere that forges a real asset.

## Core Concept
Every one of the 39 AMPs already gates itself on something — `chestplate-amp.js`'s own header says so in plain English: "Gated on class:'armor' + archetype containing 'chestplate'." That gating logic is real, but it's informal, scattered one factory `if`-statement at a time, and invisible to anything outside the file that wrote it. This PDR formalizes exactly that existing pattern, not a new one: each AMP gets one small, checksummed `PB-AMP-RELEVANCE-v1` record declaring what it applies to, as a plain predicate over spec shape (class, archetype, materials, parts) — no runtime inspection, no learned weights. Records live in a `better-sqlite3` table, reusing this codebase's own existing migration/pragma helpers (`codex/server/db/sqlite.migrations.js`) rather than inventing new SQLite lifecycle code. A pure function, `selectActiveAmps(spec)`, loads the registered records and returns which ampIds match — the same "activate the ones whose predicate says yes, leave the rest dormant" behavior `codex/core/animation/amp/registry.ts`'s `ProcessorRegistry.selectForIntent()` already proves works in this exact codebase, generalized from an in-memory Map to a persistent, checksummed, auditable store. Every selection call is logged, so "why didn't hair-flow-amp activate on this asset" always has a queryable answer instead of requiring someone to read the right factory file.

## Implementation Philosophy
Reuse before inventing: `sqlite.migrations.js`'s pragma/migration helpers for SQLite lifecycle, `codex/core/pixelbrain/sha256.js`'s isomorphic `sha256Hex` for checksums (already proven this session — it's the same function now powering every `PB-XP-v1` bytecode identity in the Craft Gate), `codex/core/animation/amp/registry.ts`'s predicate-filter shape for selection semantics. Deliberately do not reuse `SCD64` (measured: a linguistic bug-diagnostic system, not a module-identity system) or `scdna-art-gene.js`'s packet shape (measured: correct domain, wrong granularity — per-asset lighting hints, not per-module relevance declarations). No trained or learned gating of any kind, permanently — this is a hard determinism requirement, not a v1 simplification to revisit later. No existing AMP module, factory, or forge call path is touched; this PDR proves the substrate standalone before any follow-up PDR wires a real caller into it.

## Ownership & Law Compliance
Every file this PDR writes appears in §7 with its owning agent. Determinism per `VAELRIX_LAW.md` Law 6: `selectActiveAmps` is a pure predicate filter — same spec in, same `activated` array out, byte-identical, zero RNG, zero floating-point comparisons in the matching logic. `PB-AMP-RELEVANCE-v1` is a new frozen contract in the same category as `PB-VRI-v1`/`PB-STROKE-v1`; §6 escalates its `SCHEMA_CONTRACT.md` registration up front rather than deferring it the way `PB-VRI-v1` was (twice) before being caught by a Verdict.

---

# 1. Executive Summary

This session's own disparity audit measured 39 real, wired PixelBrain AMP modules and zero central registry deciding which ones an asset needs — the actual decision is currently re-made by hand inside 19 of the codebase's 39 generator scripts, and informally, one `if` statement at a time, inside whichever factory file happens to import a given AMP. Two mechanisms considered in conversation for "how would activation actually decide" were rejected with evidence: a trained neural gate (breaks the zero-RNG determinism law every other layer of this pipeline enforces) and the existing `SCD64` checksum system (read directly this session — it fingerprints symptoms of NLP color/rhyme bugs, not PixelBrain modules).

This PDR builds the alternative that was designed in conversation and is grounded in patterns that already exist and already work in this codebase: a frozen `PB-AMP-RELEVANCE-v1` contract, a `better-sqlite3`-backed registry reusing this codebase's own migration helpers, a pure deterministic selector modeled on the Animation AMP registry's already-proven `selectForIntent()`, and a CLI mirroring `scd64-queue.mjs`'s existing verb style. Five pilot AMPs are registered end-to-end to prove the pattern. Blast radius: one new directory, one new CLI script, and additive-only registrations in `codex/core/microprocessors/index.js`. Nothing that forges a real asset today calls any of this — that wiring is explicitly deferred to a follow-up PDR (§2).

# 2. Out of Scope / Non-Goals

- **Populating relevance records for all 39 AMPs.** Only 5 pilots ship in v1 (§7). Populating the rest is real, mechanical, low-risk work — a natural, explicitly named follow-up PDR, not this one.
- **Rewiring `item-foundry.js`, `character-foundry.js`, or any `factory/*.js` to call `selectActiveAmps` instead of their own hardcoded AMP calls.** High blast radius, touches dozens of call sites, and this PDR's job is to prove the substrate is correct and safe standalone first — same discipline this session already applied to Door B and Door C before either touched a real caller.
- **Any trained, learned, or neural activation mechanism**, permanently. Not a v1 simplification — a hard rejection, with the reasoning recorded in §5.
- **Reusing `SCD64` for checksums or identity.** Rejected with evidence in §5 — it is a different domain (linguistic bug diagnostics), not a stylistic choice.
- **Reusing `scdna-art-gene.js`'s packet shape for relevance records.** Right neighborhood (checksummed PixelBrain art-direction data), wrong granularity (per-asset lighting hints vs. per-module relevance) — see §5.
- **Wiring Doors A, B, or C to read from this substrate.** The eventual payoff, not v1's job.
- **Migrating any of the 19 direct-wire generator scripts.**
- **Deprecating, removing, or modifying `amp-registry.js`.** Left exactly as it is — a separate, already-documented, already-write-only system. See Escalation 2 (§6).
- **Any UI surface.**
- **Activation priority or conflict resolution** — what happens if two simultaneously-activated AMPs would both want to touch the same cell. Cannot occur in v1 because nothing consumes `selectActiveAmps`'s output against a real lattice yet (flagged as U2, §5.2) — must be resolved before the follow-up wiring PDR, not before this one.

# 3. Spec Sheet

## 3.1 Functional Spec

**F1 — Frozen `PB-AMP-RELEVANCE-v1` contract.** A record is:
```
{
  contract: 'PB-AMP-RELEVANCE-v1',
  ampId: string,               // matches the module's own *_AMP_ID export where one exists, else its file basename
  version: string,             // semver of the AMP module this record describes
  appliesTo: Array<{ field: 'class'|'archetype'|'materials'|'parts', op: 'eq'|'includes'|'matches', value: string }>,
  requires: string[],          // dotted-path spec fields that must be present, e.g. 'hair.profile'
  schemaVersion: 'PB-AMP-RELEVANCE-v1',
  checksum: string,            // sha256Hex over the canonical JSON of every field above, in this exact order
}
```
An empty `appliesTo` array means "always relevant" (the correct shape for a universal pass like `symmetry-amp`, not a special case). *Acceptance:* a schema-shape test asserts every field name, that `appliesTo`/`requires` default to `[]`, and that a record with an empty `appliesTo` is treated as always-matching by F4.

**F2 — SQLite substrate.** Two tables, migrated via `runSqliteMigrations(db, { namespace: 'amp_substrate', migrations })` from the existing `codex/server/db/sqlite.migrations.js`:
- `amp_relevance(amp_id TEXT PRIMARY KEY, version TEXT, applies_to_json TEXT, requires_json TEXT, checksum TEXT NOT NULL, registered_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
- `amp_activation_log(id INTEGER PRIMARY KEY AUTOINCREMENT, spec_checksum TEXT NOT NULL, activated_json TEXT NOT NULL, skipped_json TEXT NOT NULL, selector_version TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`

*Acceptance:* migrating twice against the same file is a no-op (idempotent, matching `runSqliteMigrations`'s own contract); `applySqlitePragmas` is called once at connection open (WAL, `foreign_keys=ON`, 5s busy timeout — the project's existing defaults).

**F3 — `registerAmpRelevance(record)`.** Validates against F1, recomputes the checksum from the record's own content, and throws a `BytecodeError` (`ERROR_CATEGORIES.VALUE`) if the caller's declared checksum doesn't match — a record cannot be silently accepted with a stale or fabricated checksum. Upserts by `amp_id`. *Acceptance:* a record with a hand-edited field but an un-recomputed checksum is rejected, not silently corrected.

**F4 — `selectActiveAmps(spec) → { activated: string[], skipped: {ampId, reason}[], specChecksum, selectorVersion }`.** Pure, deterministic. Loads every registered record, evaluates its `appliesTo` predicate against `spec` (plain field comparison — no regex backtracking risk, no floating point, no ordering-dependent state), and returns matching `ampId`s sorted alphabetically (a fixed, arbitrary-but-stable tie-break, not an attempt at priority). Every call appends one row to `amp_activation_log`. *Acceptance:* (a) calling twice with the same spec produces byte-identical `activated` arrays, 100-iteration repeat test; (b) a spec matching zero records returns `{ activated: [], skipped: [...all], ... }`, never throws; (c) an AMP with an empty `appliesTo` array appears in `activated` for every spec tested.

**F5 — CLI, `scripts/amp-substrate-cli.mjs`, `npm run amps -- <verb>`.** Mirrors `scd64-queue.mjs`'s verb style:
- `register <file.json>` — reads a `PB-AMP-RELEVANCE-v1` record, calls F3.
- `list` — prints every registered record's `ampId`, `version`, `checksum` (8-char prefix).
- `select <spec.json>` — calls F4 against a real spec file, prints the result.
- `stats` — counts: registered records, activation log rows, most-frequently-activated ampId.
- `log [--limit N]` — prints the last N `amp_activation_log` rows.

**F6 — Bridge registration.** For each registered relevance record, register a lazy-loaded microprocessor id `pixelbrain.amp.<ampId>` into `verseIRMicroprocessors` (`codex/core/microprocessors/index.js`), wrapping a dynamic `import()` of the AMP module's real exported function — additive, appended after the existing `amp.*` block, never replacing `amp.symmetry`/`amp.coord-symmetry`/`amp.shadow-perception`/`amp.run` (a deliberately different concept — Animation AMP running-state, not this substrate; see this session's own naming-collision note). *Acceptance:* after registration, `verseIRMicroprocessors.execute('pixelbrain.amp.chestplate-amp', ...)` resolves to `applyChestplateTemplate`; none of the pre-existing `amp.*` ids change behavior (regression test, F6-r).

## 3.2 Non-Functional Spec

- **Determinism:** F4's 100-iteration repeat test, matching this project's standard determinism ritual.
- **No existing-behavior regression:** nothing in `item-foundry.js`, `character-foundry.js`, any `factory/*.js`, any of the 39 AMP modules, or `amp-registry.js` changes byte for byte — provable because none of those files are edited by this PDR (§7 is exhaustive).
- **SQLite:** WAL journal mode, `foreign_keys=ON`, 5s busy timeout — the project's existing `applySqlitePragmas` defaults, not new ones.
- **Failure mode:** `registerAmpRelevance` on a checksum mismatch or malformed record throws (`BytecodeError`), never silently drops or auto-corrects a field. `selectActiveAmps` never throws on a spec that matches nothing — an empty result is a legitimate, expected answer, not an error.

## 3.3 Contracts

Real example (`hollowness-amp` deliberately excluded — its gating is runtime-energy-based, not spec-shape-based, and is correctly left ungated at this layer; see §5 A2). Pilot record for `chestplate-amp`, whose own header already documents this exact gate in English:

```json
{
  "contract": "PB-AMP-RELEVANCE-v1",
  "ampId": "chestplate-amp",
  "version": "1.0.0",
  "appliesTo": [
    { "field": "class", "op": "eq", "value": "armor" },
    { "field": "archetype", "op": "includes", "value": "chestplate" }
  ],
  "requires": [],
  "schemaVersion": "PB-AMP-RELEVANCE-v1",
  "checksum": "<sha256Hex of the six fields above, canonical order>"
}
```

**Deferred to a follow-up PDR:** the remaining 34 relevance records; a richer predicate grammar if the follow-up population finds `eq`/`includes`/`matches` insufficient (U1, §5.2); activation-priority/conflict resolution (U2, §5.2); wiring any real forge call to consume `selectActiveAmps`'s output.

# 4. Change Classification

- **architectural** — new subsystem (SQLite-backed relevance registry + deterministic selector), new frozen contract (`PB-AMP-RELEVANCE-v1`). Full PDR treatment because it establishes a permanent activation-decision boundary future AMP work will build on.
- **structural** — one new directory, one new CLI script, one new npm script entry.
- Not **behavioral** for any existing path — nothing that forges a real asset calls any new code in v1.
- Not **cosmetic**.

# 5. Assumptions and Unknowns

## 5.0 Grounds

| Claim | Grounds | Basis |
|---|---|---|
| 39 PixelBrain AMP modules exist and are all genuinely wired (imported by real, non-test production code) | measured | `codex/core/pixelbrain/EFFECT_CATALOG.md`, generated from the live import graph, cross-checked by directly reading a sample of the modules and their real callers |
| 19 of 39 generator scripts import effect passes and the rasterizer directly, bypassing both Door A and Door B | measured | `EFFECT_CATALOG.md`'s own generator table and summary line |
| `SCD64` fingerprints symptoms of NLP/rhyme-coloring bugs (`COLOR_DRAGON` bug family), not PixelBrain module identity | measured | `scripts/scd64-queue.mjs` read directly — every checksum entry carries `bugFamily`, `raid.verdictText`, `runtimeEvidence.hypothesis`; `scd64-index.json` confirms the `SCD64_DIAGNOSTIC` / `COLOR` domain schema |
| `scdna-art-gene.js` is a real, checksummed, human-approval-gated contract, scoped to per-asset lighting/value-ramp hints, not per-module relevance | measured | `scdna-art-gene.js`/`scdna-art-gene-store.js`/`scdna-art-gene-compiler.js` read directly — `PB-SCDNA-GENE-v1`, `OPERATIONAL_HINT_KEYS` (`lightDir`, `valueRamp`, `contourFollow`, ...), ledger keyed by `{assetId, geneId, ...}` |
| `codex/core/animation/amp/registry.ts`'s `ProcessorRegistry.selectForIntent()` already implements deterministic, predicate-based sparse activation in this codebase | measured | file read directly — `filter(p => p.supports(intent))`, stage-ordered, no RNG |
| `codex/server/db/sqlite.migrations.js` already provides a proven, project-standard migration/pragma pattern | measured | file read directly — `runSqliteMigrations`, `applySqlitePragmas`, `better-sqlite3` already a project dependency |
| `codex/core/pixelbrain/sha256.js`'s `sha256Hex` is isomorphic and byte-identical to `node:crypto`'s SHA-256 | measured | verified directly this session (4 sample strings, byte-identical output) while fixing `BytecodeXPVaccine.js`'s browser-compat bug |
| `codex/core/microprocessors/index.js`'s `amp.*` namespace already mixes two unrelated meanings of "AMP" (PixelBrain effect passes vs. Animation AMP running-state) | measured | file read directly — `amp.symmetry`/`amp.coord-symmetry`/`amp.shadow-perception` delegate to PixelBrain amp modules; `amp.run`/`amp.status`/`amp.getActive` delegate to `runAnimationAmp.ts`, a different subsystem |
| Predicate-only activation is sufficient for at least the 5 pilot AMPs' real, documented gating logic | measured | each pilot's own header comment already states its gate as a plain class/archetype/field condition (§7) |
| A predicate grammar of `eq`/`includes`/`matches` is sufficient for all 39 AMPs, not just the 5 pilots | **not yet measured** | flagged as U1 (§5.2) |

## 5.1 Assumptions

- A1 *(measured)*: an AMP's relevance is expressible as a static predicate over spec shape, not runtime output — every pilot AMP's own header already states its gate this way (e.g., `chestplate-amp.js`: "Gated on class:'armor' + archetype containing 'chestplate'"). This PDR formalizes an existing pattern; it does not invent a new gating philosophy.
- A2 *(architectural)*: some AMPs — `hollowness-amp` is the clearest example, gated on a runtime energy field rather than spec shape — are not well-described by a spec-shape predicate at all, and should NOT get a relevance record that pretends otherwise. `hollowness-amp` is deliberately excluded from the 5 pilots (§7) rather than given a dishonest always-true or guessed predicate. Which AMPs fall into this category is itself an output of the follow-up population PDR, not a decision made here.

## 5.2 Unknowns

- U1: whether `eq`/`includes`/`matches` covers all 39 AMPs' real gating logic, or whether some (like the excluded `hollowness-amp`, or AMPs gated on combinations the grammar can't express) need a richer predicate language or the A2 exclusion path. Resolve empirically during the follow-up population PDR — not by pre-emptively designing a grammar against AMPs nobody has read yet.
- U2: activation-conflict resolution when two selected AMPs would both claim the same cell in a real forge. Cannot be tested in v1 because nothing consumes `selectActiveAmps`'s output against a real lattice (§2). Must be designed before, not during, the follow-up wiring PDR.

# 6. Open Questions / Escalations

**ESCALATION 1:** the new microprocessor ids in F6 use the `pixelbrain.amp.*` prefix specifically to avoid colliding with `amp.run`/`amp.status`/`amp.getActive` (Animation AMP running-state, a different concept already living at `amp.*`). This is the fourth AMP/Vixel/motherboard/SCDNA-class naming collision found in this codebase this session. Option A: adopt `pixelbrain.amp.*` as proposed. Option B: a different prefix Angel prefers. Recommendation: Option A, but flagged explicitly rather than assumed, given how many prior sessions this exact class of naming collision has cost. Owner: Angel.

**ESCALATION 2:** does this substrate eventually replace `amp-registry.js` (documented write-only, 2 of 53 modules registered), or does it stay a permanently separate, parallel system? Recommendation: leave `amp-registry.js` alone for now (out of scope, §2) and revisit once this substrate has real callers — deprecating a thing before its replacement is proven would repeat the exact mistake `amp-registry.js` itself represents. Owner: Angel, at the follow-up wiring PDR.

# 7. Architecture / File Map

```
codex/core/pixelbrain/amp-substrate/
  amp-relevance.schema.js        NEW  Codex   PB-AMP-RELEVANCE-v1 contract, validation (F1)
  amp-substrate.db.js            NEW  Gemini  SQLite adapter: migrations, registerAmpRelevance,
                                               listAmpRelevance, appendActivationLog (F2, F3)
  amp-selector.js                 NEW  Gemini  selectActiveAmps(spec) — pure, deterministic (F4)
  pilot-relevance/                NEW  Gemini  5 pilot PB-AMP-RELEVANCE-v1 JSON records:
    chestplate-amp.json                        class:armor + archetype includes chestplate
    shield-rim-amp.json                        class:shield
    hair-flow-amp.json                         requires: ['hair.profile'] (character-only)
    holyfire-motif-amp.json                    requires: ['materials'] includes a holy_fire-family id
    symmetry-amp.json                          appliesTo: [] — always relevant (universal-pass case)
scripts/
  amp-substrate-cli.mjs           NEW  Gemini  register/list/select/stats/log verbs (F5)
codex/core/microprocessors/
  index.js                        MOD  Gemini  additive pixelbrain.amp.<id> registrations (F6).
                                               Existing amp.* entries untouched, unmoved.
package.json                      MOD  Gemini  "amps": "node scripts/amp-substrate-cli.mjs"
tests/codex/core/pixelbrain/amp-substrate/
  amp-relevance.schema.test.js         NEW  Gemini  F1: shape, empty-array defaults, checksum
  amp-substrate.db.test.js             NEW  Gemini  F2/F3: migration idempotency, pragma defaults,
                                                       checksum-mismatch rejection
  amp-selector.test.js                 NEW  Gemini  F4: determinism (100-iter), zero-match spec,
                                                       always-true empty-appliesTo case
  amp-substrate-cli.test.js            NEW  Gemini  F5: all five verbs against a temp SQLite file
  microprocessor-bridge.test.js        NEW  Gemini  F6: pixelbrain.amp.* resolves correctly;
                                                       existing amp.* ids provably unchanged
```

Dependency direction: `amp-relevance.schema.js` (pure, zero imports) ← `amp-substrate.db.js` (imports the schema + `sqlite.migrations.js` + `sha256.js`) ← `amp-selector.js` (imports the db adapter, otherwise pure) ← `amp-substrate-cli.mjs` (imports the selector + db adapter) and, separately, `codex/core/microprocessors/index.js` (imports the db adapter to list registered ids at startup, dynamically imports each real AMP module only on `execute()`).

# 8. Step-by-Step Implementation Plan

**Phase 1 — Frozen contract (Codex defines, Gemini implements, ~1 hour).** Milestone: `amp-relevance.schema.js` carries the `PB-AMP-RELEVANCE-v1` shape and a `validateAmpRelevance(record)` function. Exit criteria: `amp-relevance.schema.test.js` green.

**Phase 2 — SQLite substrate (Gemini, ~2 hours). Requires Phase 1.** Milestone: `amp-substrate.db.js` migrates cleanly via `runSqliteMigrations`, `registerAmpRelevance`/`listAmpRelevance` work against a temp file, checksum mismatches are rejected. Exit criteria: `amp-substrate.db.test.js` green.

**Phase 3 — Selector (Gemini, ~1.5 hours). Requires Phase 2.** Milestone: `selectActiveAmps` implemented and logs every call. Exit criteria: `amp-selector.test.js` green, including the 100-iteration determinism test.

**Phase 4 — CLI (Gemini, ~1.5 hours). Requires Phase 3.** Milestone: all five verbs work against a real temp SQLite file. Exit criteria: `amp-substrate-cli.test.js` green; `npm run amps -- list` prints a real result by hand.

**Phase 5 — Pilot population + bridge registration (Gemini, ~2 hours). Requires Phase 4.** Milestone: the 5 pilot records (§7) registered via the CLI; `codex/core/microprocessors/index.js` gains the additive `pixelbrain.amp.*` block. Exit criteria: `microprocessor-bridge.test.js` green; manual `npm run amps -- select <a real chestplate item spec>` returns `chestplate-amp` in `activated` and not `hair-flow-amp`.

**Phase 6 — Full regression + review (Gemini + Vaelrix, ~30 min).** Run every existing `codex/core/microprocessors` and `codex/server/db` test (must stay green — nothing existing is touched). Then a human review of the 5 pilot records against their source AMPs' own header comments, confirming each predicate actually matches what the AMP's own documentation already claimed.

# 9. Code Examples — Pivotal Changes

**9.1 Frozen contract:**

```js
// codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js
import { sha256Hex } from '../sha256.js';

export const AMP_RELEVANCE_CONTRACT = 'PB-AMP-RELEVANCE-v1';
const VALID_FIELDS = new Set(['class', 'archetype', 'materials', 'parts']);
const VALID_OPS = new Set(['eq', 'includes', 'matches']);

export function canonicalAmpRelevanceJSON(record) {
  // Field order is fixed and part of the contract — this is what gets checksummed.
  return JSON.stringify({
    contract: AMP_RELEVANCE_CONTRACT,
    ampId: record.ampId,
    version: record.version,
    appliesTo: record.appliesTo ?? [],
    requires: record.requires ?? [],
    schemaVersion: AMP_RELEVANCE_CONTRACT,
  });
}

export function validateAmpRelevance(record) {
  const errors = [];
  if (typeof record?.ampId !== 'string' || !record.ampId) errors.push('ampId: required string');
  if (typeof record?.version !== 'string' || !record.version) errors.push('version: required string');
  for (const clause of record?.appliesTo ?? []) {
    if (!VALID_FIELDS.has(clause.field)) errors.push(`appliesTo.field: unknown '${clause.field}'`);
    if (!VALID_OPS.has(clause.op)) errors.push(`appliesTo.op: unknown '${clause.op}'`);
  }
  const expectedChecksum = sha256Hex(canonicalAmpRelevanceJSON(record));
  if (record?.checksum !== expectedChecksum) {
    errors.push(`checksum mismatch: declared '${record?.checksum}', computed '${expectedChecksum}'`);
  }
  return { ok: errors.length === 0, errors };
}
```

**9.2 Migration, reusing the existing shared helper:**

```js
// codex/core/pixelbrain/amp-substrate/amp-substrate.db.js
import Database from 'better-sqlite3';
import { applySqlitePragmas, runSqliteMigrations } from '../../../server/db/sqlite.migrations.js';

const MIGRATIONS = [
  {
    version: 1,
    name: 'create_amp_relevance_and_activation_log',
    up(db) {
      db.exec(`
        CREATE TABLE amp_relevance (
          amp_id TEXT PRIMARY KEY,
          version TEXT NOT NULL,
          applies_to_json TEXT NOT NULL,
          requires_json TEXT NOT NULL,
          checksum TEXT NOT NULL,
          registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE amp_activation_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          spec_checksum TEXT NOT NULL,
          activated_json TEXT NOT NULL,
          skipped_json TEXT NOT NULL,
          selector_version TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
];

export function openAmpSubstrate(dbPath) {
  const db = new Database(dbPath);
  applySqlitePragmas(db);
  runSqliteMigrations(db, { namespace: 'amp_substrate', migrations: MIGRATIONS });
  return db;
}
```

**9.3 Register, with checksum enforcement:**

```js
// amp-substrate.db.js (cont.)
import { validateAmpRelevance } from './amp-relevance.schema.js';
import { BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES } from '../bytecode-error.js';

// No dedicated MODULE_IDS entry exists for this subsystem yet — MODULE_IDS.CORE
// is the correct generic choice today; registering a real 'AMPSUB' id is a
// one-line, low-risk addition Phase 1 should make alongside the schema, not a
// blocker to this PDR.
export function registerAmpRelevance(db, record) {
  const { ok, errors } = validateAmpRelevance(record);
  if (!ok) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MODULE_IDS.CORE,
      ERROR_CODES.INVALID_VALUE,
      { ampId: record?.ampId, errors },
    );
  }
  db.prepare(`
    INSERT INTO amp_relevance (amp_id, version, applies_to_json, requires_json, checksum)
    VALUES (@ampId, @version, @appliesToJson, @requiresJson, @checksum)
    ON CONFLICT(amp_id) DO UPDATE SET
      version = excluded.version, applies_to_json = excluded.applies_to_json,
      requires_json = excluded.requires_json, checksum = excluded.checksum,
      registered_at = CURRENT_TIMESTAMP
  `).run({
    ampId: record.ampId, version: record.version,
    appliesToJson: JSON.stringify(record.appliesTo ?? []),
    requiresJson: JSON.stringify(record.requires ?? []),
    checksum: record.checksum,
  });
}
```

**9.4 The selector — pure, deterministic, the actual "sparse activation":**

```js
// codex/core/pixelbrain/amp-substrate/amp-selector.js
import { sha256Hex } from '../sha256.js';

const SELECTOR_VERSION = '1.0.0';

function matchesClause(spec, clause) {
  const actual = spec[clause.field];
  if (clause.op === 'eq') return actual === clause.value;
  if (clause.op === 'includes') return Array.isArray(actual)
    ? actual.includes(clause.value)
    : String(actual ?? '').includes(clause.value);
  if (clause.op === 'matches') return new RegExp(clause.value).test(String(actual ?? ''));
  return false; // unknown op never matches — refuse, don't guess
}

export function selectActiveAmps(spec, records) {
  const activated = [];
  const skipped = [];
  for (const record of [...records].sort((a, b) => a.ampId.localeCompare(b.ampId))) {
    const clauses = JSON.parse(record.appliesToJson || '[]');
    const matched = clauses.length === 0 || clauses.every((c) => matchesClause(spec, c));
    if (matched) activated.push(record.ampId);
    else skipped.push({ ampId: record.ampId, reason: 'appliesTo did not match spec' });
  }
  return {
    activated,
    skipped,
    specChecksum: sha256Hex(JSON.stringify(spec)),
    selectorVersion: SELECTOR_VERSION,
  };
}
```

**9.5 Bridge registration — additive, alongside the existing `amp.*` block:**

```js
// codex/core/microprocessors/index.js — appended, existing amp.* entries above are untouched
import { listAmpRelevance } from '../pixelbrain/amp-substrate/amp-substrate.db.js';

for (const record of listAmpRelevance()) {
  verseIRMicroprocessors.register(`pixelbrain.amp.${record.ampId}`, async (payload, context) => {
    const mod = await import(`../pixelbrain/${record.ampId}.js`);
    const fn = mod[Object.keys(mod).find((k) => typeof mod[k] === 'function')];
    return fn(payload, context);
  });
}
```

# 10. Glossary

- **Relevance record** — a `PB-AMP-RELEVANCE-v1` packet declaring which specs one AMP applies to.
- **Activation** — the result of `selectActiveAmps`: the list of AMP ids whose predicate matched a given spec.
- **Dormant** — an AMP whose relevance record exists but did not match the current spec; appears in `skipped`, not `activated`.
- **Selector** — `selectActiveAmps`, the pure function that turns a spec + the registered records into an activation decision.
- **Substrate** — the SQLite-backed store of relevance records and the activation log, as a whole.
- **Bridge registration** — registering an already-relevance-registered AMP's real implementation into `verseIRMicroprocessors` under `pixelbrain.amp.*`, so an activation decision can actually be executed.
- **Pilot record** — one of the 5 relevance records shipped in v1, proving the pattern before the remaining 34 are populated.

# 11. Q&A — Implementation Concerns

**Q1: Why SQLite instead of extending `amp-registry.js`?** `amp-registry.js` is an in-memory `Map` with zero persistence, zero checksums, and — by its own header comment — zero real callers. This substrate needs to be queryable after the fact ("why didn't hair-flow-amp activate on this asset, six weeks ago"), which an in-memory registry structurally cannot answer.

**Q2: Why not `SCD64`?** Measured, not assumed: `SCD64` fingerprints symptoms of NLP/rhyme-coloring bugs (`COLOR_DRAGON` bug family) — `bugFamily`, `raid.verdictText`, `runtimeEvidence.hypothesis`. There is no natural checksum a PixelBrain module would produce in that system.

**Q3: Why not reuse `scdna-art-gene.js` directly?** Right domain, wrong shape. It answers "how should this one asset's this one part be lit" (`lightDir`, `valueRamp`, per-`assetId`). This substrate answers "does this AMP module apply to this class of asset at all" — a question about the module, not about any one asset's instance.

**Q4: Why not wire this into `item-foundry.js` right now, since that's the actual point?** Blast radius. `item-foundry.js` and its factories have dozens of existing AMP call sites; rewiring them is real, valuable, and risky work that deserves its own PDR, reviewed once this substrate's correctness is proven standalone — the same order Door B and Door C were built and proven in this session before either touched a real caller.

**Q5: Why a predicate language instead of a literal `canHandle(spec)` function per AMP, like `ProcessorRegistry.selectForIntent()` uses?** Two reasons: a data-only predicate is checksummable, diffable, and queryable by plain SQL (`SELECT * FROM amp_relevance WHERE applies_to_json LIKE '%chestplate%'`), where a function is not; and it matches what every pilot AMP's own header already documents its gate as — plain English conditions, not code.

**Q6: What stops someone from registering a wrong or fabricated relevance record?** F3's checksum recomputation. A record's checksum is derived from its own content; a caller cannot declare a checksum that doesn't match what they're actually registering. Drift after the fact is detectable by recomputing.

**Q7: Does this replace or deprecate `amp-registry.js`?** No — explicitly out of scope (§2), escalated (§6, Escalation 2) rather than decided unilaterally.

**Q8: Why the `pixelbrain.amp.*` prefix and not just `amp.*`?** `amp.*` is already partially claimed by Animation AMP (`amp.run`/`amp.status`/`amp.getActive`, a running-animation-state concept, not a PixelBrain effect pass). Using the same prefix for this substrate would be a fifth instance of the exact naming collision this session already found four of. Escalated anyway (§6, Escalation 1) rather than assumed correct.

**Q9: What if `chestplate-amp` and `shield-rim-amp` both matched the same spec — is that a bug?** No — both would legitimately activate for an item that's both class:armor/chestplate and class:shield, if such an item existed. v1 never acts on the activation result against a real lattice, so no actual conflict can occur yet (U2, §5.2); it's the follow-up wiring PDR's job to decide what happens when two activated AMPs would touch the same cell.

**Q10: Is any part of this machine learning?** No, deliberately and permanently. `matchesClause` is three `if` branches over plain values. This was an explicit, named rejection in the conversation this PDR formalizes, not an oversight.

# 12. QA Plan

```bash
npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-relevance.schema.test.js \
  tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js \
  tests/codex/core/pixelbrain/amp-substrate/amp-selector.test.js \
  tests/codex/core/pixelbrain/amp-substrate/amp-substrate-cli.test.js \
  tests/codex/core/pixelbrain/amp-substrate/microprocessor-bridge.test.js

# Existing suites this PDR must not move:
npx vitest run tests/codex/server/db tests/core/microprocessors 2>/dev/null || true

# Manual CLI walkthrough against a real temp DB:
AMP_SUBSTRATE_DB=/tmp/amp-substrate-smoke.sqlite node scripts/amp-substrate-cli.mjs register \
  codex/core/pixelbrain/amp-substrate/pilot-relevance/chestplate-amp.json
AMP_SUBSTRATE_DB=/tmp/amp-substrate-smoke.sqlite node scripts/amp-substrate-cli.mjs list
AMP_SUBSTRATE_DB=/tmp/amp-substrate-smoke.sqlite node scripts/amp-substrate-cli.mjs select \
  specs/loot-chest.v1.json   # a real, non-chestplate spec — chestplate-amp must NOT appear in activated
```

# 13. Regression Risks and Specific Retest Checklist

| Risk | Retest |
|---|---|
| New `pixelbrain.amp.*` ids collide with an existing `verseIRMicroprocessors` id | `microprocessor-bridge.test.js` asserts no `EXT_ALREADY_REGISTERED` `BytecodeError` WARN fires during registration |
| Existing `amp.symmetry`/`amp.coord-symmetry`/`amp.shadow-perception`/`amp.run` behavior changes | Same test file asserts each still resolves to its original implementation, byte-identical call behavior |
| `applySqlitePragmas`/`runSqliteMigrations` misused, corrupting an unrelated `.sqlite` file | New substrate uses its own dedicated file (`amp-substrate.sqlite`), never opens an existing project database |
| Non-determinism in `selectActiveAmps` (Map iteration order, object key order) | F4's 100-iteration byte-identical test |

# 14. Rollout Plan

- **Incomplete-but-safe:** ships with the substrate populated by exactly 5 pilot records, reachable only via the CLI and the new `pixelbrain.amp.*` microprocessor ids — nothing that forges a real asset calls any of it.
- **No feature flag needed** — the substrate has no consumers in v1, so there is nothing to flag off.
- **Rollback:** delete the new SQLite file and the new directory/script; revert the additive block in `codex/core/microprocessors/index.js`. No migration, no other caller depends on any of this existing.
- **Next step after this ships:** the follow-up population PDR (remaining 34 AMPs) and the follow-up wiring PDR (a real factory consulting `selectActiveAmps`) — named, not vague, in §2 and §5.2.

# 15. Definition of Done

- [ ] `npx vitest run tests/codex/core/pixelbrain/amp-substrate/` — all five new test files pass.
- [ ] F4's 100-iteration determinism test passes.
- [ ] `microprocessor-bridge.test.js` proves the four pre-existing `amp.*` ids are unchanged.
- [ ] All 5 pilot records registered via the CLI, each checksum-verified.
- [ ] Manual QA (§12): `select` against a real non-matching spec correctly omits `chestplate-amp` from `activated`.
- [ ] §6's two escalations answered by Angel.
- [ ] This PDR committed with its bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Functionally complete but needs follow-up.**

The substrate, contract, selector, and CLI are a complete, safe, standalone unit: checksummed, deterministic, reusing three already-proven patterns from elsewhere in this codebase (`sqlite.migrations.js`, `sha256.js`, `ProcessorRegistry.selectForIntent()`) rather than inventing new machinery where existing machinery already works. The honest limitation, named rather than hidden: only 5 of 39 AMPs have relevance records, and nothing that forges a real asset consumes a selection decision yet. That's the correct scope for this PDR, not a shortfall — populating all 39 and rewiring real factories are each real, separate, reviewable pieces of work, and bundling them into one PDR would have meant shipping something far riskier before this substrate's own correctness was ever proven.

# 17. References

- This session's Emergent Disparity Reconciliation Report (2026-09-04, conversation) — the audit that measured the 39-AMP / 19-script gap this PDR responds to.
- `codex/core/pixelbrain/EFFECT_CATALOG.md` — the generated, measured source for the 39-AMP and 19-script figures.
- `scripts/scd64-queue.mjs`, `scd64-index.json` — read directly to verify (and reject) `SCD64` as a checksum source.
- `codex/core/pixelbrain/scdna-art-gene.js`, `scdna-art-gene-store.js`, `scdna-art-gene-compiler.js` — read directly to verify (and reject, for this purpose) the existing SCDNA art-gene system as a direct fit.
- `codex/core/animation/amp/registry.ts` — `ProcessorRegistry.selectForIntent()`, the proven predicate-filter pattern this PDR's selector is modeled on.
- `codex/core/microprocessors/index.js`, `factory.js` — the live, real `verseIRMicroprocessors` dispatch registry this PDR registers into.
- `codex/server/db/sqlite.migrations.js` — the existing migration/pragma helpers this PDR reuses rather than reimplementing.
- `codex/core/pixelbrain/sha256.js` — the isomorphic checksum function, verified byte-identical to `node:crypto` this session.
- `codex/core/diagnostic/BytecodeXPVaccine.js` — this session's own fix (swapping `node:crypto` for `sha256Hex`), direct precedent for using this checksum function project-wide.
- `codex/core/pixelbrain/amp-registry.js` — the existing write-only registry this PDR deliberately does not touch or replace (Escalation 2).
- `docs/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` — house PDR format this document follows.
- `docs/scholomance-encyclopedia/PDR-archive/2026-09-03-vixel-stroke-ir-v1-pdr.md` — structural template and precedent for scoping a PDR to "prove the subsystem standalone, defer wiring to a follow-up."
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — domain map, escalation format, determinism law (Law 6).

# 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260904-AMP-ACTIVATION-SUBSTRATE-V1.md`

The PIR must record:
- Full test results for all five new test files, plus confirmation the existing `microprocessors`/`server/db` suites are unmoved.
- The 5 pilot records' actual registered checksums.
- A worked example: the real `activated`/`skipped` output of `selectActiveAmps` against at least two real specs (one that should match `chestplate-amp`, one that shouldn't), with the CLI output pasted in, not paraphrased.
- §6's two escalations' resolutions.
- Whether A2's exclusion boundary (`hollowness-amp` and anything like it) held up as the pilot set was built, or needs revisiting.
- Explicit confirmation that no existing test suite outside `amp-substrate/` changed status.

A PDR that ships without this PIR is incomplete.
