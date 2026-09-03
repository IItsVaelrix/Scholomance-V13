# PDR: Bridging the Amp/Effect Ecosystem into SCDL
## A Generic, Schema-Backed `apply` Statement, an Interactive Scaffolding CLI, and a Side-by-Side ANSI Confirm Loop

**Status:** Draft. Design approved by Vaelrix in conversation 2026-09-03; this PDR has not yet been implemented.
**Classification:** Architectural | PixelBrain/SCDL | Language Extension | CLI/UX
**Priority:** Medium — additive capability, not a fix; does not block or gate any in-flight work (Qwen's discoverability pass, `4cb9421a`, is independent and already shipped).
**Primary Goal:** Let an SCDL author reach the ~20 amp/effect modules the item-foundry (Door B) already uses internally, from SCDL text (Door A), through one generic grammar statement backed by a declared per-amp schema — proven with two real, honestly-bridgeable pilot amps, not a 44-amp migration.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-SCDL-AMP-BRIDGING-2026-09-03`

---

## Owner(s)
- **Codex:** the `apply` grammar shape (statement syntax, scope semantics), the per-amp schema *contract* (what a schema file must declare), new `SCDL-027`–`SCDL-031` error code definitions, sign-off on whether either counts as a `SCHEMA_CONTRACT.md` change (§6, ESCALATION 1).
- **Gemini:** grammar parser implementation (`scdl.grammar.js`), the new compiler pass (`apply-amps.pass.js`), the shared and bespoke adapters, `scdl.cli.js`'s `amps add` interactive command, the ANSI export target (`scdl.exporters.js`), `EFFECT_CATALOG.md` generator extension (`scripts/pixelbrain-effect-catalog.mjs`), all new tests, `npm run` wiring — following the precedent set in `2026-08-09-pressure-field-governor-pdr.md` §7, where `scripts/` implementation work was assigned to Gemini despite `VAELRIX_LAW.md`'s raw Domain Map table naming Codex as `scripts/`'s hard boundary owner; that table is a starting default, and per-PDR ownership assignment is established practice, not a deviation from law.
- **Claude:** no v1 scope. No UI surface is touched (`src/pages/`, `src/components/`, `*.css` are untouched); re-enters only if a graphical (non-terminal) amp preview is requested in a follow-up PDR.
- **Escalation owner** (cross-domain conflicts): Angel (repository owner).

## Context (seed — not the Executive Summary)
The 2026-09-03 PixelBrain UX savage-audit found `amp-registry.js` disclaiming itself as unusable and flagged it as a *discoverability* defect. Commit `4cb9421a` fixed discoverability the same day: `EFFECT_CATALOG.md` now accurately reports 44 of 53 amp modules as WIRED. That fix left the harder problem untouched — those 44 amps are wired into the item-foundry's JS-object pipeline (Door B) only. SCDL, the text language (Door A), cannot invoke any of them. SCDL was built as a language specifically so it could be extended; this PDR is the first deliberate extension of its grammar's expressive power, as opposed to repair work on what already existed.

## Target Integration Area
- Grammar: `codex/core/pixelbrain/scdl/scdl.grammar.js` (new `apply` statement, part-scoped and packet-scoped).
- Pipeline: `codex/core/pixelbrain/scdl/scdl.compiler.js` (new pass insertion point), new file `codex/core/pixelbrain/scdl/passes/apply-amps.pass.js`.
- Adapters: new directory `codex/core/pixelbrain/scdl/amp-bridge/` (shared adapter + per-amp bespoke adapters + per-amp schema files).
- Errors: `codex/core/pixelbrain/scdl/scdl.errors.js` (new codes `SCDL-027`–`SCDL-031`).
- Exporters: `codex/core/pixelbrain/scdl/scdl.exporters.js` (new `ansi` export target), new file `codex/core/pixelbrain/scdl/scdl.ansi-renderer.js`.
- CLI: `codex/core/pixelbrain/scdl/scdl.cli.js` (new `amps` subcommand family).
- Discovery: `scripts/pixelbrain-effect-catalog.mjs` (extend `EFFECT_CATALOG.md`'s table with a `Bridged` column), `package.json` (new `npm run scdl:amps` shortcut, following the existing `scdl:compile`/`scdl:preview`/`scdl:check` pattern from `4cb9421a`).
- Pilot amps (read-only dependencies, not modified): `codex/core/pixelbrain/heraldry-amp.js`, `codex/core/pixelbrain/hair-flow-amp.js`.
- **Not a dependency:** `codex/core/pixelbrain/crystal-core-amp.js`, `codex/core/pixelbrain/shield-rim-amp.js` — both are ITEM-SPEC-v1-coupled (§5.0) and explicitly excluded from this PDR's scope (§2).
- **Not modified:** `codex/core/pixelbrain/item-foundry.js`, `codex/core/pixelbrain/amp-registry.js` — Door B and the registry are read-only reference points; this PDR adds a parallel reachability path, it does not touch how Door B calls amps today.

## Core Concept
One new SCDL grammar statement, `apply <amp-id> { param: value, ... }`, lets an author invoke a Door-B amp from text. The statement's legal position (inside a `part { }` block, or at the file's top level) is declared per-amp by a schema file that also names the amp's tunable parameters — the same schema drives three consumers: the parser's validation (so a bad `apply` block gets an `SCDL-0xx` error with the exact field name, matching the quality bar the audit already measured for the rest of the language), the CLI's interactive scaffolding walkthrough, and `EFFECT_CATALOG.md`'s bridged-status column. A shared adapter translates SCDL's post-`expand-cells` packet into the `(fills, spec-slice, silhouette)` shape most bridgeable amps expect; amps whose signature doesn't fit that shape get a small bespoke adapter, written only when that specific amp is bridged. This PDR ships the mechanism plus two pilot amps — `heraldry` (shared-adapter path) and `hair-flow` (bespoke-adapter path) — chosen because neither requires fabricating fake ITEM-SPEC-v1 metadata to pass the amp's own internal gate (§5.0).

## Implementation Philosophy
Extend the SCDL compiler; do not build a parallel language or a second compiler entry point. Every new grammar construct reuses SCDL's existing diagnostic machinery (`scdlError`/`scdlWarn`, `SCDLError`) rather than inventing a second error format. No amp is bridged speculatively — a schema file is only written for an amp actually being bridged, so the cost of this PDR scales with amps actually reached, not with the full 44. Adapter code stays out of the amp modules themselves: no amp function signature changes, so Door B's existing 20+ call sites are provably unaffected (verified in QA, §12).

## Ownership & Law Compliance
Every file this PDR writes appears in §7 with its owning agent. The grammar/schema-contract split between Codex and Gemini follows the same shared-boundary pattern `VAELRIX_LAW.md`'s Domain Map already names for `codex/` (Codex: architecture; Gemini: impl). Determinism follows `VAELRIX_LAW.md` Law 6: the same `.scdl` source plus the same `apply` block must compile to the same packet bytes every time — no amp adapter may read wall-clock time, environment state, or unseeded randomness (heraldry and hair-flow's own `seededRng` usage is exempt: they're seeded from schema-declared `seed` params, already deterministic). Cross-domain conflicts go to Angel in the `ESCALATION:` format (§6), never resolved unilaterally.

---

# 1. Executive Summary

SCDL and the item-foundry are two independent doors into the same asset-compilation system. The item-foundry directly imports and calls roughly 20 of the codebase's 53 effect/amp modules; SCDL's own pass pipeline touches almost none of that vocabulary. This was flagged in the 2026-09-03 UX audit as a discoverability gap and partially fixed same-day (`4cb9421a`: `EFFECT_CATALOG.md`, MCP asset tools) — but discoverability and reachability are different problems, and the second one is still fully open: knowing an amp exists does not let an SCDL author use it.

This PDR closes the reachability gap with one generic grammar statement (`apply <amp-id> { params }`) backed by a required per-amp declared schema, rather than 44 individually hand-written grammar extensions. The schema is the single source of truth for parser validation, an interactive CLI scaffolding command (`scdl amps add`), and `EFFECT_CATALOG.md`'s bridged-status reporting. Grounding the design against real amp source code (not just their catalog entries) found that the two amps discussed as candidates in the original conversation — `crystal-core` and `shield-rim` — both hard-gate on ITEM-SPEC-v1-only fields (`spec.class`, `spec.archetype`) with no SCDL equivalent, and are not honestly bridgeable without either lying to the gate or refactoring Door B first. `heraldry` and `hair-flow` do not have this problem and are the pilots this PDR actually bridges.

Blast radius is deliberately minimal: new files, one new grammar statement, one new pass, one new export target, one new CLI subcommand family. No existing SCDL file's compiled output changes — `apply` is new syntax; files that don't use it are byte-identical before and after this PDR (verified by golden-diff, §12–13). Nothing in Door B (`item-foundry.js`, the 20+ existing amp call sites) is modified.

Current status: Draft. Requires §6 escalation answers before implementation begins on the schema-contract question; the ITEM-SPEC-v1-decoupling escalation can be answered later without blocking this PDR, since crystal-core/shield-rim are out of scope here regardless of its outcome.

# 2. Out of Scope / Non-Goals

- **`rotate`/`scale`/`translate`.** Separately inert placeholder ops in the grammar (`scdl.grammar.js:280`). Smaller, unrelated, explicitly deferred by Vaelrix in the conversation that produced this PDR.
- **Bridging all 44 amps.** This PDR bridges exactly two (`heraldry`, `hair-flow`) to prove the mechanism. Every other WIRED amp remains Door-B-only until a future PDR or ad-hoc change bridges it — the mechanism is designed so that's a small, isolated unit of work per amp, not a blocker to this PDR shipping.
- **Bridging `crystal-core` or `shield-rim`.** Both require either fabricated ITEM-SPEC-v1 metadata (dishonest — the SCDL author would be declaring a fake foundry archetype just to satisfy an internal gate) or a decoupling refactor of the amp itself (a Door-B change, §6 ESCALATION 2, explicitly deferred).
- **MCP exposure of the interactive flow.** The three MCP tools added in `4cb9421a` (`asset_scdl`, `asset_effects_list`, `asset_output_conventions`) are request/response. `scdl amps add`'s multi-turn interactive walkthrough does not map onto that shape without its own design (a follow-up PDR, if wanted).
- **A graphical (non-terminal) preview.** The ANSI renderer targets a terminal. No web view, no image-viewer integration.
- **Modifying Door B.** `item-foundry.js` and the 20+ existing amp call sites are read-only reference points for this PDR. Nothing about how Door B calls amps today changes.
- **Auto-migrating existing `.scdl` fixtures to use `apply`.** Bridging is opt-in per file, per author decision.

# 3. Spec Sheet

## 3.1 Functional Spec

**F1 — `apply` statement grammar.** New syntax: `apply IDENT '{' (IDENT ':' value)* '}'` — reuses the existing tokenizer's `IDENT`, `INT`, `FLOAT`, and string-literal token types for values; no new token types. Legal in two positions: inside `parsePart()`'s op loop (`scdl.grammar.js:452-457`) for part-scoped amps, and inside the file's top-level statement loop for packet-scoped amps. *Acceptance:* an `apply` block inside a `part {}` for a packet-scoped amp, or at top level for a part-scoped amp, produces `SCDL-027` (see F5) naming the amp's declared scope — never a generic parse error.

**F2 — Schema contract.** Every bridged amp has exactly one schema file (`codex/core/pixelbrain/scdl/amp-bridge/schemas/<amp-id>.schema.js`) exporting: `{ ampId, scope: 'part' | 'packet', params: [{ name, type: 'number' | 'string' | 'boolean', required, default, min?, max?, description }] }`. This is the single source of truth for F3 (validation), F6 (CLI), and F8 (catalog). *Acceptance:* a schema missing a required field (`ampId`, `scope`, or `params`) throws at module load time (fail fast, not at first use) — enforced by a schema-shape test (§12).

**F3 — Parse-time validation.** `apply` blocks are validated against the resolved amp's schema during parsing: unknown amp-id (`SCDL-027`), wrong scope (`SCDL-028`), missing required param (`SCDL-029`), param outside declared type/range (`SCDL-030`). Every error names the offending field/value and cites line:col, matching the existing `SCDL-006`/`SCDL-026` quality bar (audit S1). *Acceptance:* each of the four error codes has a dedicated test asserting the message contains the actual bad value, not just the error code.

**F4 — Compiler pass (`apply-amps.pass.js`).** Runs after `expandCellsPass`, before `emitPacketPass` (`scdl.compiler.js:239` inserts a new call between the two) — the earliest point SCDL's `ast`/packet-in-progress has a cell lattice comparable to what amps expect. For each validated `apply` node: resolve the amp-id to its adapter (shared or bespoke), invoke it, thread the result back into the part's (or packet's) cells. *Acceptance:* a `.scdl` fixture with `apply heraldry {...}` inside a `part` produces measurably different output cells than the same fixture without the `apply` block (not just "doesn't crash" — this project's standing scar tissue per `feedback-tests-that-assert-shape-not-value`).

**F5 — Adapter layer.** `amp-bridge/shared-adapter.js` builds `(fills, specSlice, silhouette)` from SCDL's packet-in-progress + the `apply` block's own declared params, for amps whose gate logic contains no ITEM-SPEC-v1-only vocabulary (checked manually per amp before writing its schema — this is the acceptance test from the design doc's §3 correction, not a mechanical check). `heraldry` uses the shared adapter (`specSlice.heraldry = [<one entry built from the apply block's params>]`, satisfying `heraldry-amp.js:131`'s real gate honestly). `hair-flow` gets its own tiny adapter (`amp-bridge/adapters/hair-flow.adapter.js`) that builds a `config` object directly from the `apply` block's params plus the packet's canvas dimensions — no `fills`/`spec`/`silhouette` synthesis needed at all, since `generateHairFlowCells(config)` (`hair-flow-amp.js:291`) doesn't take them.

**F6 — Interactive CLI (`scdl amps add <amp-id> <file.scdl>`).** Loads the amp's schema; if part-scoped, lists the parts already declared in the target file and prompts for a selection (no free-typed part names — typo-proof by construction); walks each schema param one at a time, showing type/range/default inline; on completion, compiles the file **in-memory** twice (with and without the tentative `apply` block) and renders both through the `ansi` export target **side by side** with `BEFORE`/`AFTER` labels (F7); offers keep / adjust-one-field / cancel; on keep, auto-inserts the `apply` block into the real file at the chosen location and runs one more real (on-disk, not in-memory) compile to confirm it still compiles clean.

**F7 — ANSI export target.** `scdl.exporters.js` gains `case 'ansi': results[target] = exportANSI(lattice, options); break;`, implemented in `scdl.ansi-renderer.js`. Renders each cell as a `\x1b[48;2;r;g;bm  \x1b[0m` truecolor block (2 chars wide per pixel — square-ish in most terminal fonts); degrades to a coarser character ramp (` .:-=+*#%@`) when `process.env.COLORTERM` doesn't advertise truecolor. Exposes a **compose-side-by-side** helper (`renderSideBySide(linesA, linesB, { labelA, labelB })`) that interleaves two rendered canvases row-by-row with a gap column, used by F6 — the single-canvas renderer and the side-by-side composer are separate functions so the renderer stays a normal `png`/`svg`-sibling export target on its own.

**F8 — `EFFECT_CATALOG.md` bridged column.** `scripts/pixelbrain-effect-catalog.mjs` gains a `Bridged` column, populated by checking for a matching file under `amp-bridge/schemas/`. Not a manual list — computed from the filesystem, matching the generator's existing "measured, not asserted" discipline (its own commit message, `4cb9421a`, records self-correcting a first draft that mismeasured liveness).

## 3.2 Non-Functional Spec

- **Determinism:** identical `.scdl` source + identical `apply` params → identical compiled packet bytes, every time. Verified by a 100-iteration repeat test, mirroring the BytecodeHealth/pressure-field determinism ritual already standard in this repo.
- **No existing-output regression:** any `.scdl` file with zero `apply` statements compiles to byte-identical output before and after this PDR. Golden-diff against the existing fixture corpus (`codex/core/pixelbrain/scdl/fixtures/*.scdl`).
- **CLI responsiveness:** the in-memory before/after compile-and-render in F6 completes in under 300ms for a 32×32 canvas on the dev machine (generous bound, matching the pressure-field PDR's perf-test style).
- **Terminal compatibility:** ANSI renderer must not throw or corrupt output on a non-truecolor terminal — falls back to the character ramp (F7), never crashes the CLI.
- **Failure mode:** an amp adapter throwing during F4's pass degrades to a compile error citing the amp-id and the underlying exception message — never a silent no-op, never a process crash.

## 3.3 Contracts

Schema file shape (F2), concrete example:

```js
// codex/core/pixelbrain/scdl/amp-bridge/schemas/heraldry.schema.js
export default {
  ampId: 'heraldry',
  scope: 'part',
  params: [
    { name: 'effect', type: 'string', required: false, default: 'emboss',
      description: "'emboss' | 'engrave' | 'flat'" },
    { name: 'cx', type: 'number', required: true,
      description: 'emblem center x, relative to the part silhouette' },
    { name: 'cy', type: 'number', required: true,
      description: 'emblem center y, relative to the part silhouette' },
  ],
};
```

`apply` AST node shape (emitted by the parser, consumed by F4):

```js
{
  kind: 'apply',
  ampId: 'heraldry',
  scope: 'part',        // resolved from the schema at parse time, not re-derived later
  partId: 'shield_face', // null for packet-scoped
  params: { effect: 'emboss', cx: 12, cy: 8 },
  loc: { line: 7, col: 3 },
}
```

**Deferred to a follow-up PDR:** bridging any amp beyond the two pilots; the crystal-core/shield-rim decoupling refactor (§6 ESCALATION 2); MCP exposure of the interactive flow.

# 4. Change Classification

- **architectural** — new grammar surface (a statement type SCDL didn't have), a new pipeline pass, a new adapter layer between two previously-disjoint subsystems (Door A and the amp ecosystem). This is the PDR's core contribution.
- **structural** — new files only (`amp-bridge/`, `apply-amps.pass.js`, `scdl.ansi-renderer.js`); no existing file's public shape changes except additive switch/case branches (`scdl.exporters.js`'s target switch, `scdl.compiler.js`'s pass sequence).
- **behavioral** — `scdl amps add`'s auto-insert writes to a user's `.scdl` file; this is new CLI behavior, opt-in per invocation, never triggered by `compile`/`preview`/`check`.
- Not **cosmetic** — no formatting changes to any existing output.

# 5. Assumptions and Unknowns

## 5.0 Grounds

Every justifying claim carries `measured | architectural | judgement`, per this repo's denial-ledger convention (`scripts/deny.mjs`) and the pressure-field PDR's precedent (§5.0 there).

| Claim | Grounds | Basis |
|---|---|---|
| 44/53 amp modules are WIRED, only into Door B | measured | `EFFECT_CATALOG.md` (generated, commit `4cb9421a`), cross-checked by grep: `item-foundry.js:35-76` imports ~20 amps directly; `grep -rl` for the same imports under `scdl/` returns only `lower-booleans.js`/`expand-symmetry.pass.js`, which are SCDL's own passes, not the shared amps |
| `crystal-core-amp.js` and `shield-rim-amp.js` gate on ITEM-SPEC-v1-only fields | measured | `crystal-core-amp.js:30` (`spec.class`, `spec.archetype`, `spec.parts[].profile`); `shield-rim-amp.js:6-8` (`spec.class`, `spec.archetype`, `spec.parts[].id`) — read directly, not inferred |
| `heraldry-amp.js` gates on author-declared intent, not a synthetic category tag | measured | `heraldry-amp.js:130-131`: `if (!spec.heraldry \|\| spec.heraldry.length === 0) return template;` — `spec.heraldry` is a real per-emblem array, not a class/archetype check |
| `hair-flow-amp.js` needs no `fills`/`spec`/`silhouette` | measured | `hair-flow-amp.js:291`: `generateHairFlowCells(config)` — single parameter, normalized by `normalizeHairFlowConfig` |
| SCDL error codes currently run `SCDL-001`–`SCDL-026` | measured | `grep -oE 'SCDL-[0-9]+' scdl.errors.js \| sort -u` — highest is `SCDL-026` |
| `expandCellsPass` runs before `emitPacketPass` in the compile pipeline | measured | `scdl.compiler.js:239` (`packet = emitPacketPass(ast, errors)`) preceded by the import order at `scdl.compiler.js:22-32` (validate → expandFrames → resolveColors → resolveMaterials → expandVector → buildSceneGraph → expandSymmetry → expandCells → emitPacket) |
| A generic schema-backed `apply` statement will feel natural inside SCDL's existing part-block grammar | **judgement** | SCDL's existing `part_op` loop (`parsePart()`, `scdl.grammar.js:438-459`) already parses an arbitrary sequence of ops per part; `apply` is designed to be one more op kind, but this is a design bet on ergonomics, not a measured fact |
| Two pilot amps are sufficient to prove the mechanism generalizes | **judgement** | One shared-adapter example and one bespoke-adapter example cover the two adapter paths named in the design, but two data points is a small sample; a third pilot from a different amp "family" (e.g. a packet-scoped amp) would strengthen this and is a candidate for the next bridging PDR |

## 5.1 Assumptions

- A1 *(measured)*: the schema file's declared `type`s (`number`/`string`/`boolean`) are sufficient to validate every pilot amp's params — checked against `heraldry`'s and `hair-flow`'s actual param shapes, neither needs a richer type (array, nested object) at pilot scope.
- A2 *(architectural)*: inserting the `apply` block via direct file-string manipulation (find the target part's closing brace, insert before it) is acceptable for v1, rather than a full AST-to-source pretty-printer. Simpler, but fragile against unusual formatting (e.g. a part block written entirely on one line) — flagged as a real limitation, not hidden.
- A3 *(measured)*: `process.env.COLORTERM` is a reliable-enough truecolor signal for the terminals this CLI is actually used from (the same assumption every mainstream truecolor-detecting CLI tool makes; no exotic terminal support claimed).

## 5.2 Unknowns

- U1: whether the file-string-insertion approach (A2) will need to become a real AST-aware rewriter once more than a couple of amps are bridged and part blocks get more complex. Resolve empirically after the third or fourth amp is bridged, not by speculation now.
- U2: whether `heraldry`'s and `hair-flow`'s adapters, once written, reveal a *third* common shape that the "shared vs. bespoke" binary from the design doc doesn't capture. Two pilots may not be enough to know; watch when the next amp is bridged.

# 6. Open Questions / Escalations

**ESCALATION:** Does the `apply` grammar shape (a new statement type) plus the per-amp schema contract format (F2) count as a `SCHEMA_CONTRACT.md`-governed schema change requiring Codex sign-off before Gemini implements, or is it engine-architecture Codex already approves by co-owning this PDR? The Domain Map draws the Codex/Gemini line at "schemas" vs. "impls" but both sit inside the same new subsystem here. Option A: treat this PDR's Owner(s) block as the sign-off (Codex is a named co-owner, §Owner(s)) and proceed. Option B: require a separate, narrower Codex review pass specifically on F1/F2 before Gemini starts F4-F8. Recommendation: Option A — the pressure-field PDR precedent (§6 there, ESCALATION 3) treated a comparable question the same way, naming Codex as a file owner rather than requiring a pre-implementation review gate. Owner: Codex.

**ESCALATION:** Should a future PDR decouple `crystal-core-amp.js` and `shield-rim-amp.js`'s "find the target cells" logic (currently entangled with ITEM-SPEC-v1's `class`/`archetype`/`profile` gate) from "apply the effect to given cells," so those two amps become bridgeable without fabricated metadata? This would modify functions Door B's `item-foundry.js` already depends on at 2+ call sites each — a Gemini-owned refactor with real regression surface on the foundry path, not something this PDR's mechanism can route around. Option A: defer indefinitely — those two amps simply stay Door-B-only. Option B: scope a follow-up PDR specifically for this decoupling, gated on this PDR shipping first so the bridging mechanism it would use already exists. Recommendation: Option B, but not urgent — heraldry and hair-flow already prove the mechanism; crystal-core/shield-rim are "nice to have reached eventually," not blocking. Owner: Gemini + Codex.

# 7. Architecture / File Map

```
codex/core/pixelbrain/scdl/
  scdl.grammar.js              MOD  Gemini  add apply-statement parsing (F1) inside parsePart()'s
                                             op loop and the top-level statement loop; schema
                                             lookup for scope validation is Codex-defined (F2 shape)
  scdl.compiler.js             MOD  Gemini  insert applyAmpsPass between expandCellsPass and
                                             emitPacketPass (F4)
  scdl.errors.js               MOD  Codex   new codes SCDL-027..SCDL-031 (F3)
  scdl.exporters.js            MOD  Gemini  new 'ansi' export target case (F7)
  scdl.ansi-renderer.js        NEW  Gemini  single-canvas + side-by-side ANSI rendering (F7)
  scdl.cli.js                  MOD  Gemini  new `amps` subcommand family: `amps list`, `amps add` (F6)
  passes/
    apply-amps.pass.js         NEW  Gemini  resolves apply nodes -> adapter -> mutates packet cells (F4)
  amp-bridge/
    shared-adapter.js          NEW  Gemini  (fills, specSlice, silhouette) builder (F5)
    adapters/
      hair-flow.adapter.js     NEW  Gemini  bespoke config-object builder for hair-flow (F5)
    schemas/
      heraldry.schema.js       NEW  Codex   schema contract for heraldry (F2)
      hair-flow.schema.js      NEW  Codex   schema contract for hair-flow (F2)
scripts/
  pixelbrain-effect-catalog.mjs MOD Gemini  add Bridged column, computed from amp-bridge/schemas/ (F8)
package.json                   MOD  Gemini  add `scdl:amps` npm shortcut, following the existing
                                             scdl:compile/scdl:preview/scdl:check pattern (4cb9421a)
tests/codex/core/pixelbrain/scdl/
  apply-statement.test.js      NEW  Gemini  F1 grammar: valid apply parses; wrong-scope errors;
                                             unknown amp-id errors
  apply-amps-pass.test.js      NEW  Gemini  F4: heraldry/hair-flow apply blocks produce measurably
                                             different output cells (value assertions, not shape)
  amp-schema-contract.test.js  NEW  Gemini  F2: malformed schema throws at load; both pilot schemas
                                             validate against their own real params
  scdl.ansi-renderer.test.js   NEW  Gemini  F7: truecolor + fallback-ramp output, side-by-side
                                             composition alignment
  scdl.cli.amps.test.js        NEW  Gemini  F6: interactive walkthrough (scripted stdin), auto-insert
                                             correctness, re-compile-after-insert succeeds
docs/scholomance-encyclopedia/Scholomance White Papers/
  SCDL_COMPILER_WHITE_PAPER.md MOD  Gemini  document `apply` statement + amps subcommand (§8-adjacent
                                             section, following the same manual Qwen already fixed
                                             for staleness in 4cb9421a's in-flight companion work)
codex/core/pixelbrain/
  EFFECT_CATALOG.md            GEN  (generated artifact — regenerate via npm run effects, not hand-edited)
```

Dependency direction: `scdl.grammar.js` → schema files (read-only lookup during parse, for scope validation) → `apply-amps.pass.js` → `shared-adapter.js` / bespoke adapters → the pilot amp modules (`heraldry-amp.js`, `hair-flow-amp.js`, unmodified). `scdl.cli.js`'s `amps add` command depends on `scdl.compiler.js` (in-memory compile), `scdl.ansi-renderer.js` (preview), and the schema files (param walkthrough) — no new dependency direction into `item-foundry.js` anywhere in this graph.

# 8. Step-by-Step Implementation Plan

**Phase 1 — Grammar + errors (Codex defines shape, Gemini implements, ~1 day).** Milestone: `apply` statement parses inside both part-scoped and top-level positions; `SCDL-027`–`SCDL-030` exist and fire correctly against a hand-written invalid fixture for each. Exit criteria: `apply-statement.test.js` green; golden-diff on existing fixtures (zero `apply` usage) still byte-identical.

**Phase 2 — Schema contract + pilot schemas (Codex, ~half a day).** Milestone: `heraldry.schema.js` and `hair-flow.schema.js` exist and match F3's contract. Exit criteria: `amp-schema-contract.test.js` green.

**Phase 3 — Adapters + pass (Gemini, ~1 day).** Milestone: `apply-amps.pass.js` wired into the compiler between `expandCellsPass` and `emitPacketPass`; both pilot adapters produce real, measurable cell changes. Exit criteria: `apply-amps-pass.test.js` green, including the value-not-shape assertion (F4 acceptance).

**Phase 4 — ANSI renderer (Gemini, ~1 day).** Milestone: `ansi` export target works standalone (`scdl.cli.js preview --export ansi` renders correctly in a truecolor terminal and falls back cleanly in a non-truecolor one); side-by-side composer works independently of the CLI's interactive flow. Exit criteria: `scdl.ansi-renderer.test.js` green.

**Phase 5 — Interactive CLI (Gemini, ~1.5 days). Requires Phases 1-4.** Milestone: `scdl amps add heraldry fixtures/void_chestplate.scdl` walks the full flow end to end — schema-driven prompts, side-by-side before/after render, auto-insert, re-compile confirmation. Exit criteria: `scdl.cli.amps.test.js` green (scripted stdin, no manual interaction required for CI); a manual live-terminal run confirms the side-by-side rendering is actually legible (not just structurally correct — this is a UX feature, so a human look is part of the exit criteria, matching this repo's `feedback-diffs-cannot-validate-aesthetics` norm).

**Phase 6 — Catalog + docs (Gemini, ~half a day).** Milestone: `EFFECT_CATALOG.md`'s `Bridged` column reports `heraldry`/`hair-flow` as bridged, everything else as not; white paper documents the `apply` statement and `amps` subcommand. Exit criteria: `npm run effects:check` (the existing CI gate from `4cb9421a`) still passes with the new column present.

Each phase is independently shippable and additive — none of them can regress existing `compile`/`preview`/`check` behavior for files without an `apply` statement, since the new pass, grammar branch, and export target are all reached only when that syntax is actually present.

# 9. Code Examples — Pivotal Changes

**9.1 Grammar — recognizing `apply` inside a part's op loop:**

```js
// scdl.grammar.js, inside parsePart()'s op loop (was: `const op = parseOp(partId, opIndex++);`)
while (!at(TOKEN_TYPES.RBRACE, TOKEN_TYPES.EOF)) {
  if (atValue('apply')) {
    ops.push(parseApply(partId, 'part'));
    continue;
  }
  const op = parseOp(partId, opIndex++);
  if (op) ops.push(op);
}
```

**9.2 Grammar — the shared `parseApply`, scope-validated against the schema at parse time:**

```js
// scdl.grammar.js
function parseApply(partId, positionScope) {
  const l = loc();
  consume(); // 'apply'
  const idTok = consume(TOKEN_TYPES.IDENT);
  const ampId = idTok?.value;
  const schema = lookupAmpSchema(ampId);           // amp-bridge/schemas/<ampId>.schema.js
  if (!schema) {
    errors.push(scdlError(`Unknown amp '${ampId}' — no bridged schema found`, 'SCDL-027', l));
    skipBalancedBraces();
    return null;
  }
  if (schema.scope !== positionScope) {
    errors.push(scdlError(
      `'${ampId}' is ${schema.scope}-scoped, cannot appear at ${positionScope} level`,
      'SCDL-028', l));
  }
  expect(TOKEN_TYPES.LBRACE, undefined, `Expected '{' after apply ${ampId}`);
  const params = parseApplyParams(schema, l);       // validates against schema.params (F3)
  consume(TOKEN_TYPES.RBRACE);
  return { kind: 'apply', ampId, scope: schema.scope, partId: schema.scope === 'part' ? partId : null, params, loc: l };
}
```

**9.3 Errors — the two new codes that fire from `parseApply`:**

```js
// scdl.errors.js — additions, same pattern as existing SCDL-006/SCDL-026
export const SCDL_ERROR_CODES = {
  ...existing,
  SCDL_027: 'SCDL-027', // unknown amp-id
  SCDL_028: 'SCDL-028', // wrong scope (part-scoped amp at packet level, or vice versa)
  SCDL_029: 'SCDL-029', // missing required param
  SCDL_030: 'SCDL-030', // param outside declared type/range
  SCDL_031: 'SCDL-031', // malformed schema (should never fire in practice — fail-fast is at module load)
};
```

**9.4 The compiler-pass insertion point:**

```js
// scdl.compiler.js — one new line between the existing expandCellsPass and emitPacketPass calls
ast = _runPass('expand-cells', ast, errors, expandCellsPass);
ast = _runPass('apply-amps', ast, errors, applyAmpsPass);   // NEW — F4
packet = emitPacketPass(ast, errors);
```

**9.5 The pass itself — resolving an `apply` node through the adapter layer:**

```js
// codex/core/pixelbrain/scdl/passes/apply-amps.pass.js
import { resolveAdapter } from '../amp-bridge/shared-adapter.js';

export function applyAmpsPass(ast, errors) {
  const parts = ast.parts.map((part) => {
    const applyOps = part.ops.filter((op) => op.kind === 'apply');
    if (!applyOps.length) return part;
    let coordinates = part.coordinates;
    for (const op of applyOps) {
      const adapter = resolveAdapter(op.ampId);          // shared or bespoke, by amp-id
      const result = adapter(coordinates, op.params, part, ast);
      coordinates = result ?? coordinates;                // an adapter that can't apply returns unchanged
    }
    return { ...part, coordinates };
  });
  return { ...ast, parts };
}
```

**9.6 Shared adapter — building `heraldry`'s real spec-slice honestly (no fabricated archetype):**

```js
// codex/core/pixelbrain/scdl/amp-bridge/shared-adapter.js
import { applyHeraldryFills } from '../../heraldry-amp.js';

export function heraldryAdapter(coordinates, params, part, ast) {
  const fills = { coordinates };
  const silhouette = buildSilhouetteFromPart(part);         // SCDL already has this shape post-expand-cells
  const specSlice = {
    heraldry: [{ id: part.id, cx: params.cx, cy: params.cy, style: { effect: params.effect ?? 'emboss' } }],
  };
  // No spec.class, no spec.archetype — heraldry-amp.js:130 never reads them.
  return applyHeraldryFills(fills, specSlice, silhouette).coordinates;
}
```

**9.7 Bespoke adapter — `hair-flow`, no spec/silhouette fabrication needed at all:**

```js
// codex/core/pixelbrain/scdl/amp-bridge/adapters/hair-flow.adapter.js
import { generateHairFlowCells } from '../../hair-flow-amp.js';

export function hairFlowAdapter(coordinates, params, part, ast) {
  const config = {
    seed: params.seed ?? 1,
    canvas: ast.canvas,
    taper: params.taper ?? 0.6,
    paletteRoles: params.paletteRoles ?? ['hair_base', 'hair_shadow'],
  };
  const hairCells = generateHairFlowCells(config);
  return [...coordinates, ...hairCells];
}
```

**9.8 ANSI export target + side-by-side composer:**

```js
// scdl.exporters.js — one new switch branch
case 'ansi': results[target] = exportANSI(lattice, options); break;
```

```js
// scdl.ansi-renderer.js
export function renderCanvasLines(lattice) {
  const rows = [];
  for (let y = 0; y < lattice.canvas.height; y++) {
    let row = '';
    for (let x = 0; x < lattice.canvas.width; x++) {
      const cell = lattice.cellAt(x, y);
      row += cell ? `\x1b[48;2;${cell.r};${cell.g};${cell.b}m  \x1b[0m` : '  ';
    }
    rows.push(row);
  }
  return rows;
}

export function renderSideBySide(linesA, linesB, { labelA = 'BEFORE', labelB = 'AFTER', gap = '   ' } = {}) {
  const height = Math.max(linesA.length, linesB.length);
  const out = [`${labelA}${' '.repeat(Math.max(0, linesA[0]?.length ?? 0))}${gap}${labelB}`];
  for (let i = 0; i < height; i++) {
    out.push((linesA[i] ?? '') + gap + (linesB[i] ?? ''));
  }
  return out.join('\n');
}
```

**9.9 Interactive CLI — the confirm loop's core (schematic, F6):**

```js
// scdl.cli.js — inside cmdAmpsAdd(args)
const before = compileSCDL(originalSource, {});
const tentative = insertApplyBlock(originalSource, ampId, partId, collectedParams);
const after = compileSCDL(tentative, {});
console.log(renderSideBySide(
  renderCanvasLines(before.packet),
  renderCanvasLines(after.packet),
));
const choice = await prompt('[k]eep / [a]djust / [c]ancel: ');
if (choice === 'k') {
  writeFileSync(filePath, tentative, 'utf8');
  const confirm = compileSCDL(readFileSync(filePath, 'utf8'), {});
  if (!confirm.ok) { /* roll back the write, report the error — never leave a broken file */ }
}
```

**9.10 `EFFECT_CATALOG.md` generator — the `Bridged` column, computed not asserted:**

```js
// scripts/pixelbrain-effect-catalog.mjs
import { readdirSync } from 'node:fs';
const bridgedIds = new Set(
  readdirSync(new URL('../codex/core/pixelbrain/scdl/amp-bridge/schemas/', import.meta.url))
    .map((f) => f.replace(/\.schema\.js$/, ''))
);
// ...in the row builder:
const bridged = bridgedIds.has(ampIdFor(modulePath)) ? 'YES' : '—';
```

# 10. Glossary

- **Door A / Door B** — this PDR's shorthand (inherited from the 2026-09-03 audit) for SCDL (the text DSL) vs. the item-foundry (the JS-object `forgeItemAsset` pipeline). Two independent ways to compile a PixelBrain asset.
- **Amp** — an effect/pass module under `codex/core/pixelbrain/*-amp.js` (bevel, crystal-core, hair-flow, heraldry, etc.); 53 exist, 44 are WIRED (imported somewhere real), currently only into Door B.
- **Bridging** — giving SCDL (Door A) the ability to invoke a specific amp via the `apply` statement. Per-amp, opt-in, incremental.
- **Schema contract (F2)** — the declared shape (`ampId`, `scope`, `params`) a bridged amp's schema file must provide; the single source of truth for validation, CLI scaffolding, and catalog reporting.
- **Shared adapter vs. bespoke adapter** — the shared adapter builds the common `(fills, specSlice, silhouette)` shape several amps expect; a bespoke adapter is hand-written for an amp whose signature doesn't fit that shape (e.g. hair-flow's bare `config`).
- **ITEM-SPEC-v1 coupling** — when an amp's own gate logic reads foundry-only fields (`spec.class`, `spec.archetype`, `spec.parts[].profile`) with no SCDL equivalent. Disqualifies an amp from honest bridging without either fake metadata or a Door-B refactor (§6 ESCALATION 2).
- **Side-by-side ANSI preview** — the interactive CLI's before/after terminal rendering of a tentative `apply` block's effect, composed as two canvases on the same lines rather than shown sequentially.
- **Grounds** — `measured | architectural | judgement` tag on a claim, borrowed from `scripts/deny.mjs`'s denial-ledger convention (§5.0).

# 11. Q&A — Top 10 Implementation Concerns

**Q1: Why a generic `apply` statement instead of bespoke grammar per amp (e.g. a real `heraldry { ... }` keyword)?** Bespoke grammar for 44 potential amps means 44 grammar extensions, 44 sets of hand-written parser code, and a much larger surface for SCDL's "compiles clean and predictable" property (audit S2) to regress on. The generic statement plus a declared schema gets the same parse-time validation quality (F3) without that multiplication — see the design doc's Option A/B fork, resolved toward the hybrid in conversation.

**Q2: Why not just let SCDL call any amp with any params (no schema)?** Tried this as "Option A" in the design conversation and rejected it: without a schema, bad params fail at runtime inside the amp function itself, with whatever error message that function happens to produce — not SCDL's own actionable, line:col-cited error format. That would be a real regression against the audit's S1 finding (the error system is SCDL's strongest asset).

**Q3: Why does bridging crystal-core/shield-rim require a Door-B refactor rather than just a cleverer adapter?** Because the coupling isn't in the data shape, it's in the amp's own control flow — `crystal-core-amp.js:30` returns early unless `spec.class === 'armor'` and `spec.archetype` contains `'chestplate'`. No adapter can supply those honestly from an SCDL author's actual intent; SCDL has no concept of "archetype." An adapter could lie (`specSlice.archetype = 'chestplate'` regardless of what's being authored), but that's exactly the kind of synthetic-metadata trap the design doc's §3 correction was written to avoid.

**Q4: What happens to an `apply` block if its target amp's schema is later deleted (someone "unbridges" an amp)?** Not handled in v1 — this is a real gap. A `.scdl` file with an `apply heraldry {...}` block would fail to compile with `SCDL-027` (unknown amp) if `heraldry.schema.js` were removed. Acceptable for v1 because nothing removes a schema automatically; flagged here so it's not a silent surprise later.

**Q5: Does the side-by-side ANSI preview need to match the final PNG export pixel-for-pixel?** No — it's a fast, in-terminal sanity check, not a proof of final fidelity. The `preview` command's PNG export (already in the CLI) remains the source of truth for exact visual fidelity; the ANSI view exists so an author doesn't have to leave the terminal and open an image viewer just to catch an obviously-wrong param before committing.

**Q6: Can the auto-insert (F6) corrupt a `.scdl` file?** A5 (§5.1) already flags the file-string-insertion approach as fragile against unusual formatting. Mitigation in v1: the CLI always re-compiles the file after writing (F6's last step) and, if that fails, the write is rolled back and reported — never leaves a broken file on disk. This is a mitigation, not a proof; U1 (§5.2) tracks whether this needs to become a real rewriter later.

**Q7: Why after `expandCellsPass` and not earlier, e.g. right after `resolveMaterialsPass`?** Because the amps being bridged operate on cell coordinates (`fills.coordinates`), which don't exist until `expandCellsPass` has run. Bridging a hypothetical amp that operates on pre-cell vector geometry instead would need a different pass insertion point — not needed for either pilot amp, noted as a design constraint for future bridging work, not a limitation of this PDR's own two pilots.

**Q8: How is determinism guaranteed for `hair-flow`, which uses `seededRng`?** The adapter (9.7) always supplies a `seed` from the `apply` block's own declared param (defaulting to `1` if unauthored) — never from wall-clock time or process state. Same `.scdl` source (same `apply` block) → same seed → same `seededRng` sequence → same output, every time. Covered by the 100-iteration determinism test (§3.2).

**Q9: What if two `apply` blocks on the same part conflict (e.g. both amps write the same cells)?** Applied in source order (9.5's loop), each amp's output feeding the next as input — same "later wins" semantics JS object literals already have elsewhere in this codebase (noted independently in the `4cb9421a` commit's own EFFECT_CATALOG generator work, re-used here as a familiar, already-precedented conflict rule rather than inventing a new one).

**Q10: Does this PDR change what Door B's existing 39 asset-generator scripts do?** No. Zero files under `item-foundry.js`'s dependency graph are modified (§Target Integration Area, "Not modified"). This PDR adds a new path into the amp ecosystem; it does not touch the existing one.

# 12. QA Plan

New tests (exact paths, from §7):
- `tests/codex/core/pixelbrain/scdl/apply-statement.test.js`
- `tests/codex/core/pixelbrain/scdl/apply-amps-pass.test.js`
- `tests/codex/core/pixelbrain/scdl/amp-schema-contract.test.js`
- `tests/codex/core/pixelbrain/scdl/scdl.ansi-renderer.test.js`
- `tests/codex/core/pixelbrain/scdl/scdl.cli.amps.test.js`

**Mutation protocol (required).** Per `feedback-fixtures-inherit-the-authors-blind-spots` and `project-mutation-testing-masked-rules` (this repo's own standing findings that green suites can hide dead guards): apply each mutation below, run the suite, record the failing test name and message, revert.

- MUTATION 1: in `parseApply`, delete the `schema.scope !== positionScope` check. `apply-statement.test.js`'s wrong-scope test must go red.
- MUTATION 2: in `applyAmpsPass`, replace `adapter(coordinates, ...)` with a no-op returning `coordinates` unchanged. `apply-amps-pass.test.js`'s value-assertion test (F4) must go red — this is the specific guard against the shape-not-value scar tissue named in §7.
- MUTATION 3: in the hair-flow adapter, hardcode `seed: 1` regardless of `params.seed`. The determinism/param-respecting test must go red.
- MUTATION 4: in `scdl.cli.js`'s auto-insert, remove the post-write re-compile check. A test asserting a malformed insert is rolled back must go red.

Commands (npm + vitest, project-standard, following `4cb9421a`'s established pattern):

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/apply-statement.test.js \
  tests/codex/core/pixelbrain/scdl/apply-amps-pass.test.js \
  tests/codex/core/pixelbrain/scdl/amp-schema-contract.test.js \
  tests/codex/core/pixelbrain/scdl/scdl.ansi-renderer.test.js \
  tests/codex/core/pixelbrain/scdl/scdl.cli.amps.test.js

npx vitest run tests/codex/core/pixelbrain/scdl/          # no regression in the existing SCDL suite
npm run effects:check                                     # EFFECT_CATALOG.md still matches the tree (4cb9421a's gate)
node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl --export json   # existing fixture, unaffected
node codex/core/pixelbrain/scdl/scdl.cli.js preview \
  codex/core/pixelbrain/scdl/fixtures/void_chestplate.scdl --export ansi --scale 1   # new target, manual look
```

Example runnable test (F4's value-not-shape acceptance, §9's MUTATION 2 target):

```js
// tests/codex/core/pixelbrain/scdl/apply-amps-pass.test.js
it('apply heraldry actually changes cell colors, not just packet shape', () => {
  const withApply = compileSCDL(FIXTURE_WITH_HERALDRY_APPLY, {});
  const withoutApply = compileSCDL(FIXTURE_WITHOUT_APPLY, {});
  const changedCells = diffCellColors(withApply.packet, withoutApply.packet);
  expect(changedCells.length).toBeGreaterThan(0);        // not just "compiled ok"
  expect(changedCells.some((c) => c.after !== c.before)).toBe(true);
});
```

# 13. Regression Risks and Specific Retest Checklist

| Risk | Retest |
|---|---|
| Existing `.scdl` fixtures compile differently now that a new pass exists in the pipeline | Golden-diff: every fixture under `codex/core/pixelbrain/scdl/fixtures/*.scdl`, byte-compared output before/after, `npx vitest run tests/codex/core/pixelbrain/scdl/` |
| `EFFECT_CATALOG.md`'s existing columns drift | `npm run effects:check` (the CI gate `4cb9421a` already added) still passes, and specifically its 8 existing catalog tests (`tests/codex/core/pixelbrain/effect-catalog.test.js`) stay green with the new `Bridged` column added |
| Door B (`item-foundry.js`) regresses | Not touched by this PDR (§Target Integration Area) — verify by running the existing foundry generator suite unchanged: `node scripts/generate-void-chestplate.mjs` produces the same output hash as before this PDR |
| `amp-registry-truth.test.js` (pinned EXPERIMENTAL marker from `4cb9421a`) breaks | `npx vitest run tests/codex/core/pixelbrain/amp-registry-truth.test.js` — this PDR doesn't touch `amp-registry.js` at all, so this is a pure regression check |
| New `apply` grammar accidentally matches something in existing SCDL syntax | Golden-diff (above) is the primary guard; additionally, grep the fixture corpus for any existing use of the bare word `apply` as an identifier or material name before merging — none currently found, but must be reconfirmed at implementation time since the corpus grows |
| CLI's auto-insert corrupts a real fixture during manual testing | Never run `scdl amps add` against a tracked fixture directly during development — copy to a scratch file first (per this session's own working norm) |

# 14. Rollout Plan

- **Incomplete-but-safe:** ships with exactly two bridged amps (heraldry, hair-flow). Every other amp stays exactly as reachable as it is today — Door-B-only, listed but not bridged in `EFFECT_CATALOG.md`. No existing workflow changes.
- **No feature flag needed, and this is a deliberate departure from the pressure-field PDR's pattern:** `apply` is new syntax. A `.scdl` file either uses it or doesn't; there's no "on by default" behavior to gate, because nothing is on by default — the mechanism is inert until an author writes an `apply` block, which requires deliberately running `scdl amps add` or hand-authoring the syntax after reading the docs.
- **Phased, each phase independently shippable** (§8) — Phase 1-2 (grammar+schema) can ship and sit unused if Phase 3 (adapters) slips; nothing downstream breaks.
- **Canary:** first use of `scdl amps add` in a real (non-fixture) `.scdl` file should be manually reviewed before that file is committed, matching this repo's `feedback-diffs-cannot-validate-aesthetics` norm — a passing test suite does not certify that a side-by-side ANSI render was actually legible or that the inserted block reads naturally in context.
- **Rollback:** revert the merge commit. No runtime state, no migration, no persisted schema beyond the new files themselves — a straightforward one-commit-in, one-commit-out revert, same as the pressure-field PDR's rollback plan.

# 15. Definition of Done

- [ ] `npx vitest run tests/codex/core/pixelbrain/scdl/` — all pass, including the five new test files.
- [ ] 100-iteration determinism test passes (byte-identical packets) for both pilot amps.
- [ ] Golden-diff: every existing `.scdl` fixture compiles to byte-identical output with this PDR's changes present, `apply` absent.
- [ ] **All four §12 mutations applied, confirmed red, and reverted**, with the failing test name/message recorded — a green suite is not sufficient until the guards have been shown capable of failing (`project-checks-that-cannot-fail`). This box may not be ticked by reading the tests.
- [ ] F4's acceptance test asserts actual cell-value changes, not just "compiled without error" (§9.5's `apply-amps-pass.test.js`, mutation 2 confirms this guard is real).
- [ ] `SCDL-027`–`SCDL-030` each have a dedicated test asserting the message names the actual bad amp-id/scope/param/value, not just the code.
- [ ] `npm run effects:check` passes with the new `Bridged` column present and computed (not hand-written) from `amp-bridge/schemas/`.
- [ ] `amp-registry-truth.test.js` still green, unmodified expectations (this PDR doesn't touch `amp-registry.js`).
- [ ] Manual live-terminal check: `scdl amps add heraldry <scratch-fixture>` produces a legible side-by-side render — human-verified, not just structurally asserted (Phase 5 exit criteria).
- [ ] `SCDL_COMPILER_WHITE_PAPER.md` documents the `apply` statement and `amps` subcommand.
- [ ] No modification to `item-foundry.js` or any of Door B's existing amp call sites (verified by `git diff` scope check at merge time).
- [ ] §6 ESCALATION 1 (schema sign-off) answered before Phase 1 begins.
- [ ] This PDR committed with its bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Complete with acceptable risk, within its stated scope.**

The mechanism (generic schema-backed `apply` statement, shared + bespoke adapter split, parse-time validation reusing SCDL's existing error system) is a coherent, minimally-invasive extension: no existing file's compiled output changes, Door B is untouched, and every phase ships independently. The two-pilot scope is a deliberate, stated non-goal boundary (§2) rather than an accident of running out of time — heraldry and hair-flow were specifically chosen, after checking real source rather than trusting the catalog, because they're the amps that don't require lying to get bridged.

The known real risk is A2/U1: file-string insertion for the CLI's auto-insert is simpler than a proper AST-aware rewriter but is genuinely fragile against unusual formatting, and this PDR ships it anyway with a re-compile-and-rollback safety net rather than solving it properly. That's a legitimate v1 trade, not a hidden one — U1 names exactly when it should be revisited (once more amps are bridged and part-block formatting gets more varied).

The larger, honest limitation is scope, not quality: this PDR reaches 2 of 44 wired amps. That is by design (§2), not a shortfall — the mechanism's whole value is that each additional amp is now a small, isolated, one-file-schema unit of work, and this PDR's job was to prove that unit of work is real and honest, not to do all of it at once.

# 17. References

- `divtube_downloader/DATA REPORTS/2026-09-03-pixelbrain-pipeline-ux-savage-audit.md` — the audit that first measured the amp-registry/discoverability gap this PDR's problem statement builds on.
- Commit `4cb9421a` (`fix(pixelbrain): repair the discoverability layer the 2026-09-03 UX audit found missing`) — `EFFECT_CATALOG.md`, MCP asset tools, `scdl.cli.js` diagnostic unification, `npm run scdl*` wiring. This PDR extends that work; does not duplicate it.
- `codex/core/pixelbrain/EFFECT_CATALOG.md` — generated inventory; source of the 44-WIRED / 3-ORPHAN measurement.
- `codex/core/pixelbrain/item-foundry.js:35-76` — Door B's existing amp imports; read-only reference, not modified.
- `codex/core/pixelbrain/crystal-core-amp.js:30`, `shield-rim-amp.js:6-8` — the ITEM-SPEC-v1-coupled amps excluded from this PDR's scope; cited directly, not from the catalog summary.
- `codex/core/pixelbrain/heraldry-amp.js:130-131`, `hair-flow-amp.js:291` — the two pilot amps this PDR bridges.
- `codex/core/pixelbrain/scdl/scdl.grammar.js:438-459` (`parsePart`), `:280-286` (inert `rotate`/`scale`/`translate` placeholders, out of scope per §2).
- `codex/core/pixelbrain/scdl/scdl.compiler.js:22-32,239` — pass import order and the `emitPacketPass` insertion point this PDR's new pass sits before.
- `codex/core/pixelbrain/scdl/scdl.errors.js:155-161` (`scdlError`/`scdlWarn`) — existing diagnostic constructors this PDR's new codes reuse rather than replace.
- `docs/superpowers/specs/2026-09-03-scdl-amp-bridging-design.md` — the brainstorming-skill design doc this PDR formalizes; carries the full decision trail and the §3 correction this PDR's Owner(s)/Target-Integration-Area sections already incorporate.
- `docs/scholomance-encyclopedia/PDR-archive/2026-08-09-pressure-field-governor-pdr.md` — house PDR precedent for grounds-tagging, mutation-testing discipline, and the `scripts/`-ownership-by-precedent pattern this PDR follows.
- `docs/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` — house PDR format this document follows.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — domain map, escalation format, determinism law, PDR/PIR mandates.

# 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260903-SCDL-AMP-BRIDGING.md`

The PIR must record:

- Final phase reached (all six, or where it stopped and why).
- The four §12 mutation results, each with the failing test name and message; any mutation that left the suite green recorded as a dead guard, with the resolution taken.
- The golden-diff result across the full fixture corpus (byte-identical count / total).
- Whether the manual live-terminal side-by-side check (Phase 5 exit criteria, DoD box) was actually legible, with a description or screenshot reference — not just "test passed."
- Resolution of §6 ESCALATION 1 (schema sign-off) and whether ESCALATION 2 (crystal-core/shield-rim decoupling) was scoped into a follow-up PDR or left open.
- Any amp bridged beyond the two pilots during implementation (if scope grew), with the same ITEM-SPEC-v1-coupling check from §5.0 applied and recorded for it.
- U1's status: did file-string insertion hold up, or did a formatting edge case force an early move toward a real rewriter.

A PDR that ships without this PIR is incomplete. A PIR that reports a mutation-testing box checked without the failure output pasted in is not evidence.
