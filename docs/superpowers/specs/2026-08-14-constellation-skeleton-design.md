# ConstellationOS Routing Skeleton — Design

**Date:** 2026-08-14
**Status:** Approved for planning
**Scope:** A derived, SCD64-stamped routing graph for the ConstellationOS engine, plus a
three-arm pilot that can refute it.

---

## 1. Problem

Answering "where does this live" in ConstellationOS currently costs a full read. The engine is
**67 files** across `codex/core/constellation` and `codex/server/services/constellation`
(~11,500 lines; ~160–200k tokens to read exhaustively). The directory tree carries almost no
routing information — `codex/core/constellation` is 22 loose `.js` files plus `audition/` and
`grimoire/`. There is no cheaper addressable structure to consult first.

The Atlas does not supply one. `.atlas/code-atlas.json` (schema `CODE-ATLAS-v1`, 12.6MB) holds a
flat `files` list (`path`, `layer`, `commits`, `churn`, `lastCommit`) and a 170,870-entry
token→file inverted index. **It has no symbols and no edges.** Telescope derives symbols per
call; microscope resolves references through the postings.

## 2. Goal and non-goals

**Goal.** Emit a derived artifact that answers routing questions — *who imports X*, *what does X
import*, *where is symbol S exported*, *am I upstream or downstream of X* — accurately enough
that the source files need not be opened, and measure whether having it actually reduces context
burn.

**Non-goals.** Not contracts, not behaviour, not dataflow, not types. The skeleton records
structure only. Behavioural questions remain the job of `evaluate` and the cleri-probe Babel
facts adapter.

## 3. Measured facts this design rests on

Established by direct probe on 2026-08-14, not assumed:

| Fact | Value |
|---|---|
| Engine files (`.js`/`.mjs`, tests excluded) | 67 |
| Internal import edges | 105 |
| **Cycles in the import graph** | **0** |
| Entry points (no inbound edge) | 20 |
| Files with no edges either direction | 4 |
| Distinct external packages imported | 7 |
| Runtime dynamic `import(` | **0** (all `import(...)` hits are erased JSDoc types) |
| `require(` | **0** — pure ESM |
| Highest fan-in | `grimoire/schemas.js` (18), `compose.js` (7), `compose-packed.js` (5), `cue-arbiter.js` (4) |
| Atlas `layer` distribution over these files | Core 59, Server 8 |
| Atlas `churn` over these files | min 6, median 136, max 1356 |

A prefix match for `codex/server/services/constellation` against the Atlas returns 69 entries, not
67. The difference is one `.md` file and **`codex/server/services/constellationPage.service.js`** —
a *sibling* of the scope directory rather than a member, and the file that terminates the UI's HTTP
seam. It is out of scope under §4's directory roots. See §8.1.

Two findings shaped the design:

**The graph is acyclic**, so strata are well-defined with no tie-breaking rule.

**`src/pages/Constellation` imports zero files from `codex/`.** The UI reaches the engine through
`src/hooks/useConstellationPage.js` and `src/core/compose/*.ts` over HTTP, served by
`codex/server/services/constellationPage.service.js`. ConstellationOS is therefore not one import
graph. The UI is excluded from scope and the seam is a declared blind spot (§8).

## 4. Sectioning: distance from entry point

Sections are strata of the import graph. The obvious stratification is rejected on measurement:

- **Longest-path-to-leaf** yields 9 sections sized 24, 32, 9, 3, 3, 5, 1, 1, 1 — 71% of the tree
  in two sections and three sections holding one file each.
- **Shortest distance from the nearest entry point** yields **3 sections sized 20 / 22 / 25**,
  with all 67 files reachable and none stranded.

The second is adopted. `stratum(f)` = length of the shortest directed path from any entry point
to `f`, where entry points are the 20 files with no inbound internal edge. It is the measure that
answers the question strata were chosen for — upstream or downstream of the thing being changed.

Determinism: entry points are sorted by path before BFS; ties in distance are impossible since
BFS assigns the minimum. Two builds on the same tree produce byte-identical output (§9).

## 5. Artifact

Written to `.atlas/constellation-skeleton.json`. Sidecar to the Atlas, never merged into
`code-atlas.json` — a pilot must not change a schema that the lenses and the post-commit hook
depend on.

```json
{
  "schema": "CONSTELLATION-SKELETON-v1",
  "domain": "TOPOLOGY",
  "family": "CONSTELLATION_SKELETON",
  "builtAtHead": "<git HEAD sha at build>",
  "builtAt": "<ISO-8601>",
  "scope": {
    "roots": ["codex/core/constellation", "codex/server/services/constellation"],
    "extensions": [".js", ".mjs"],
    "fileCount": 67
  },
  "meta": {
    "edgeCount": 105,
    "cycleCount": 0,
    "entryPoints": 20,
    "isolated": 4,
    "unresolved": []
  },
  "declaredBlindSpots": [ /* §8 */ ],
  "sections": [
    {
      "stratum": 0,
      "checksum64": "<64 uppercase hex>",
      "slots": [
      {
        "index": 0,
        "name": "STRATUM",
        "hex": "01000014",
        "decoded": { "versionByte": 1, "stratumIndex": 0, "nodeCount": 20 }
      }
    ],
      "nodes": [ /* node records */ ]
    }
  ]
}
```

### Node record

```json
{
  "path": "codex/core/constellation/compose.js",
  "stratum": 1,
  "imports": ["codex/core/constellation/grimoire/index.js"],
  "importedBy": ["codex/server/services/constellation/discovery.adapter.js"],
  "exports": ["composeConstellation", "guessPos"],
  "externals": ["node:crypto"],
  "layer": "Core",
  "commits": 12,
  "churn": 271,
  "lastCommit": 1786264366,
  "testedBy": ["tests/core/constellation/compose.test.js"]
}
```

`imports` and `importedBy` hold repo-relative resolved paths. `exports` holds exported binding
names — the field that answers "where does symbol S live" without a search. `externals` holds
unresolved package specifiers verbatim. `layer`, `commits`, `churn`, `lastCommit` are joined from
the Atlas by path; a file absent from the Atlas gets `null` for all four and is listed in
`meta.unresolved`. `testedBy` comes from scanning `tests/core/constellation` for imports of the
node (§7).

**Nodes carry no stamp.** A node's routing data is six short fields; hex-packing them makes them
less readable, not more. The stamp earns its place only at section level, where it compresses
20-odd files into 64 characters.

## 6. The SCD64 `TOPOLOGY` domain

New family `CONSTELLATION_SKELETON`, `domain: "TOPOLOGY"`, reusing the shape established by
`COLOR_DRAGON` in `codex/core/immunity/spatial-immune-orchestrator.js:496`: 8 slots × 32 bits,
each rendered as 8 uppercase hex characters, concatenated into `checksum64`.

It departs from that precedent in one deliberate way. `COLOR_DRAGON` derives every slot as
`SHA-256(canonical string)[0:8]`, making the stamp an **identity** — constant per family and
opaque without a glossary lookup. A section stamp is derived from **measured** facts, so slots 0–6
pack those measurements directly and are readable as hex byte pairs. Slot 7 preserves the hashing
convention and supplies staleness detection.

All fields are byte-aligned, big-endian.

| # | Slot | `[31:24]` | `[23:16]` | `[15:8]` | `[7:0]` |
|---|------|-----------|-----------|----------|---------|
| 0 | `STRATUM` | version byte `0x01` | stratum index | node count (u16) | |
| 1 | `FANIN` | max fan-in | median fan-in | hubs (fan-in ≥ 4) | entry points |
| 2 | `FANOUT` | max fan-out | median fan-out | outbound edges (u16) | |
| 3 | `EXPORTS` | total exports (u16) | | max exports in one file | files exporting nothing |
| 4 | `CHURN` | median churn band | max churn band | total commits (u16) | |
| 5 | `LAYER` | layer bitfield (u16) | | dominant layer code | files outside dominant |
| 6 | `COVERAGE` | files referenced by a test (u16) | | percent covered | test files touching section |
| 7 | `DIGEST` | `SHA-256(canonical)[0:8]`, uppercase | | | |

**Churn band** = `min(15, floor(log2(churn + 1)))`. Over the measured range (6…1356) this yields
bands 2…10, so no value saturates today.

**Layer bitfield**, one bit per Atlas `layer` value, set if any node in the section carries it:
`Core=1<<0, Server=1<<1, UI=1<<2, Test=1<<3, Services=1<<4, Runtime=1<<5, Script=1<<6, Doc=1<<7,
Unknown=1<<8`. **Dominant layer code** is the bit index (0–8) of the most common layer in the
section; ties break toward the lower index.

**Saturation.** u8 fields clamp at 255, u16 at 65535. No measured value approaches either bound:
the highest fan-in is 18, `codex/core/constellation` carries 171 `export` statements in total
across 59 files so no single file's export count nears 255, and no commit count approaches 65535.
The builder MUST record any clamp in `meta.saturatedFields` so a saturated slot is never mistaken
for a true reading.

**Canonical string for slot 7**, defined exactly so the digest is reproducible:

```
TOPOLOGY|CONSTELLATION_SKELETON|v1|stratum=<i>|<sorted node paths, comma-joined>|<sorted "src>dst" edges, comma-joined>
```

Each slot also carries a `decoded` object with the named field values, so reading the stamp never
*requires* bit arithmetic — the hex is a convenience for eyeballing, not the only access path.

## 7. Builder, oracle, and lens

**Builder** — `scripts/build_constellation_skeleton.py`. Pure-stdlib Python, matching the
`code_lens.py` house style (regex plus brace tracking, no third-party parser). It walks the two
scope roots, extracts static `import`/`export … from` specifiers, resolves relative specifiers
against the file set (trying `X`, `X.js`, `X/index.js` in that order), joins Atlas telemetry by
path, scans `tests/core/constellation` for the `testedBy` field, computes strata, encodes slots,
and writes the artifact.

The builder MUST fail loud, with a non-zero exit and the offending file and line, if it
encounters a runtime dynamic `import(` — one exists today only inside JSDoc `@typedef`
annotations, and that blind spot must not open silently later. Any relative specifier that
resolves to nothing is appended to `meta.unresolved` with its verbatim text and never dropped.

**Oracle** — `scripts/skeleton_oracle.mjs`. Emits the same graph using `@babel/parser` 7.29.7
(installed) via the existing `codex/services/cleri-probe/babel-facts.adapter.js`. A real AST, and
deliberately *not* sharing extraction code with the builder: if the builder and the oracle were
both regex over the same text they would agree and prove nothing.

**Lens** — `skeleton(root, section=None, path=None)` added to
`divtube_downloader/tui/services/code_lens.py`, following that module's existing optional-steroid
contract. Missing or corrupt artifact returns `{"available": false, "reason": …}` and never
raises; telescope and microscope are unaffected. A stale artifact (`builtAtHead` ≠ live HEAD)
returns its data **with** `{"stale": true, "commitsBehind": N}` — never silently fresh, matching
the Atlas's `is_stale()` convention.

**Not wired into the post-commit hook.** `scripts/git-hooks/post-commit-atlas` stays untouched; a
pilot artifact should not tax every commit. Built on demand.

## 8. Declared blind spots

Recorded in the artifact's `declaredBlindSpots`, following the Atlas precedent of declaring
`nlp_chatbot` rather than silently missing it. A blind spot that is written down is governance; one
that is not is a false claim of coverage.

1. **The UI↔engine HTTP seam.** `src/pages/Constellation` reaches the engine over HTTP through
   `src/hooks/useConstellationPage.js`, not by import. Structurally invisible to a static import
   graph. The UI is out of scope. The engine-side terminus,
   `codex/server/services/constellationPage.service.js`, is likewise out of scope: it sits beside
   the scope directory rather than inside it. Pulling that one file in would make the seam's server
   half visible; doing so is a scope change and is deferred rather than taken silently.
2. **Runtime dynamic imports.** None exist today. The builder hard-fails rather than skipping if
   one appears.
3. **Barrel provenance.** Re-exports through `grimoire/index.js` resolve to the barrel, not to the
   module that originally defined the symbol.
4. **Test files.** Excluded from the graph; used only to populate `testedBy` and the `COVERAGE`
   slot.

## 9. Testing

- **Fixture graph.** A synthetic tree exercising cycles, `index.js` barrels, extensionless
  specifiers, and an unresolvable import, with the expected graph asserted by hand.
- **Determinism.** Two consecutive builds on an unchanged tree produce byte-identical output.
- **Slot round-trip.** Encode → hex → decode returns the input for every slot, including at the
  saturation bounds.
- **Lens degradation.** A truncated and a syntactically invalid artifact each yield
  `available: false`, and telescope and microscope still answer normally.
- **Staleness.** An artifact built at an older HEAD reports `stale: true` with the correct
  `commitsBehind`.

## 10. The pilot

### 10.1 Fidelity gate

Runs before any burn claim. A skeleton that is small *and wrong* saves tokens by lying.

Compare `.atlas/constellation-skeleton.json` against the Babel oracle:

- **Internal edge set: exact set equality required.** Not a ratio. A routing artifact that is 98%
  right sends you to the wrong file once in fifty and gives you no way to know which time.
- **Exported binding names: exact set equality required.**

**Contingency, fixed in advance so it is not an ad-hoc call later.** If the regex builder cannot
reach exact equality, the builder is replaced with a Babel-based extractor and a new independent
oracle is used: Node's own resolution algorithm plus `es-module-lexer` (installed). Oracle
independence is preserved either way; loosening the threshold is not an option.

### 10.2 Three-arm A/B

**Question set.** 60 questions fixed before any arm runs: 30 *"which modules import X"* and 30
*"what does X import"*. Each class draws its 30 targets uniformly without replacement from the 67
files under a recorded seed; the two classes are drawn independently, so a file may appear in
both. Ground truth from the Babel oracle. `n` is fixed in advance and is not extended after
inspecting results.

**Arms**, each a fresh agent with no prior context, all three receiving the identical question set:

| Arm | Given | Purpose |
|---|---|---|
| `skeleton` | the artifact; barred from reading constellation sources | the treatment |
| `files` | normal tools, no artifact | the status quo |
| `shuffled` | an artifact whose edges are randomly permuted with the degree distribution preserved | **the null control** |

**Preregistered thresholds:**

- **Primary.** `skeleton` correctness must exceed `shuffled` correctness, binomial test,
  p < 0.05, n = 60. If it does not, **the pilot is refuted regardless of token savings** — a
  favourable token count with no correctness advantage measures only the cost of being confidently
  wrong.
- **Secondary (the burn claim).** Median tokens per *correct* answer for `skeleton` versus
  `files`, both raw figures reported. This number is reported only if the primary passes.
- Both thresholds are written into the plan before the harness runs.

### 10.3 Ledger emission

The harness writes one `PB-EXP-v1` row per (arm, question) into the existing, currently empty
`collab_experience_ledger` table. **No schema change** — the table already has the needed columns:

| Column | Value |
|---|---|
| `skeleton_hash` | `SHA-256(sectionChecksum64 \| questionClass \| arm \| routeSignature)[0:32]` |
| `bytecode_prefix` | `PB-EXP-v1` (the table default) |
| `raw_trace_ref` | path to the run's JSONL trace |
| `corroboration_count` | 1 on insert; incremented when an independent run measures the same key |
| `corroborating_agent_ids` | JSON array of contributing agent ids |
| `ledger_status` | `pending` until ≥ 2 independent corroborations, then `corroborated` |

A row records a **measured outcome** — question class, route taken, tokens spent, correct against
the oracle — never advice. Efficiency is derived by sorting the ledger, never asserted by an
agent, and `corroboration_count` means *N independent agents measured the same route at the same
cost*, not *N agents found the claim plausible*. This is the property that lets the ledger improve
without drifting into folklore.

## 11. Out of scope, named for the follow-on spec

Activating the ledger as a navigation system is a **separate spec**, written after this pilot
produces real rows rather than against guesses about what a packet should hold. It will need:

- A navigation source kind added to `codex/core/diagnostic/BytecodeXPVaccine.js`, whose current
  kinds are `error`, `health`, and `cccb` only — there is no traversal kind today.
- A reader that turns corroborated ledger rows into route recommendations.
- Generalisation of the skeleton builder beyond ConstellationOS.

None of it is built here.
