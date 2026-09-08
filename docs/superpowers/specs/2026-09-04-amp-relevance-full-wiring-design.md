# Design: Wiring All 39 PixelBrain AMPs Into Data-Driven Activation

**Date:** 2026-09-04
**Status:** Design — approved for Phase 1 implementation planning
**Builds on:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md`
(PB-AMP-RELEVANCE-v1: schema, SQLite store, selector, CLI, 5 item-pipeline pilots)

## 1. Problem

All 39 `codex/core/pixelbrain/*-amp.js` modules already run in production — verified
against `EFFECT_CATALOG.md`'s import graph, not assumed. What's missing is *why* each
one runs on a given asset: today that's a hardcoded `if` scattered across whichever
factory imports the AMP. `item-foundry.js` alone decides activation for 16 AMPs via
per-part conditionals mixed into ~800 lines of forging logic. The relevance registry
built earlier today (PB-AMP-RELEVANCE-v1) can express these gates as data, but only 5
of 39 AMPs are registered, and nothing consuming a real spec calls `selectActiveAmps`
yet — the registry is correct but inert.

This design wires all 39 AMPs into the registry and replaces each pipeline's hardcoded
activation logic with a call to the selector, so an AMP's gate becomes a queryable,
checksummed record instead of an `if` buried in a factory.

## 2. What was considered and rejected

- **A universal predicate grammar spanning all 4 originally-assumed pipelines.**
  Measurement (tracing real non-test importers of all 39 modules, not guessing)
  found not 4 pipelines but ~8, with real call sites in `item-foundry.js`,
  `chestplate-fidelity-pipeline.js`, `render-fidelity-pipeline.js`,
  `chunked-world-volume.js`/`qbit-world-game-loop.js`, `character-foundry.js`,
  `image-lattice-compiler.js`, `wand-seed-lift.js`, `inject-hair.js`, plus
  cross-cutting callers (`nl-compile.js`, `scdl/passes/expand-symmetry.pass.js`).
  Two AMPs have no spec to gate on at all (`gear-glide-amp` runs off animation BPM
  ticks; `shadow-perception-amp`'s real caller is unverified — no non-test static
  importer found despite `EFFECT_CATALOG.md` marking it WIRED, likely a string-id
  microprocessor dispatch not yet traced).
- **Reusing `codex/core/semantic-calculus/`** to derive per-pipeline normalizer
  "blueprints." Rejected on inspection of its own PDR: it's an intent compiler
  (utterance → sealed, LAW-permissioned `SemanticAct`), not a spec-shape
  transform, and its own scope explicitly excludes becoming a general ontology.
  Normalizers are plain deterministic functions instead.
- **An 8-ary octree** (mirroring `codex/core/weave-intent-octree.js`) for
  pipeline/AMP organization. That octree's branching factor is a deliberate game-
  design constant (5 intent classes × 8 manner families × 8 leaves = a closed
  64-token vocabulary), which doesn't describe an open-ended, growing AMP catalog.
  A flat `pipeline` partition column serves the same "organize by category" need
  without inventing a branching factor nothing in this domain justifies.
- **A dependency graph for AMP execution order.** The real requirement (preserve
  the sequential order `item-foundry.js` already calls its 16 AMPs in) is fully
  served by a per-record `order` integer — a "conveyor belt," not a DAG. No AMP in
  the current 16-item pipeline needs multi-parent ordering; if one ever does, that's
  a schema version bump, not a redesign.
- **A bespoke discovery/lookup mechanism.** `divtube_downloader/tui/services/code_atlas.py`
  already crawls the whole repo (postings + git vitality + declared blind spots,
  rebuilt on every commit) for exactly "where is X / what's connected to X."
  Building a second one would repeat `amp-registry.js`'s own mistake — a lookup
  nobody routes through. The requirement here is just: keep every relevance
  record's real content in tracked source files the atlas already crawls, not
  only inside the SQLite database (which is data, correctly outside the atlas).

## 3. Scope

All 39 AMPs, one registry, contract version bumped to **PB-AMP-RELEVANCE-v2** (v1's
shape — `ampId` as sole primary key, no `pipeline`/`order`/`description`/`concept` —
can't express what this design needs; v1 is used by nothing yet, so this is a clean
break, not a migration of live data).

This document designs the schema, selector, and process end-to-end, but **only
specifies Phase 1 (the `item` pipeline, 16 AMPs) in implementation-ready detail.**
Phases 2+ (chestplate-fidelity, render-fidelity, voxel-world, character,
image-lattice, one-offs) get their own follow-up spec once Phase 1's pattern is
proven — each is a materially different spec shape and real-gate-measurement effort,
consistent with treating this as several sub-projects rather than one undifferentiated
39-AMP change. Their pipeline names and measured call sites are recorded here (§7) so
that follow-up work starts from measurement, not rediscovery.

## 4. Schema (PB-AMP-RELEVANCE-v2)

Extends the existing predicate grammar (`appliesTo`/`requires`, `eq`/`includes`/
`matches`, one level of `anyOf`) unchanged — only the record envelope changes.

```
{
  contract: 'PB-AMP-RELEVANCE-v2',
  schemaVersion: 'PB-AMP-RELEVANCE-v2',
  pipeline: string,        // 'item' | 'chestplate-fidelity' | 'render-fidelity' |
                            // 'voxel-world' | 'character' | 'image-lattice' |
                            // 'runtime' | 'cross-cutting'   (§7)
  ampId: string,
  order: integer,          // conveyor-belt position, unique within (pipeline)
  description: string,     // required non-empty; what the AMP does + what real
                            // gate this predicate mirrors (file:line cited)
  concept: string,         // required non-empty short tag, e.g. 'material-fx',
                            // 'structural', 'outline', 'lighting'
  version: string,
  appliesTo: Clause[],
  requires: string[],
  checksum: string,        // sha256 over the full record incl. pipeline/order/
                            // description/concept — meaning change = new identity
}
```

**Identity key becomes `(pipeline, ampId)`**, not `ampId` alone — the same AMP module
could in principle be relevant under two pipelines with different gates (none do
today, but the key should be correct now rather than retrofitted). `order` must be
unique within a `pipeline`; validation rejects a collision the same way a checksum
mismatch is rejected today (hard error, not silently renumbered).

`description` and `concept` are enforced non-empty at `createAmpRelevanceRecord()` —
same enforcement point as the checksum — because an optional documentation field is
how `amp-registry.js` ended up write-only. This makes populating the remaining 34
records real work: each needs a description grounded in that AMP's actual header
comment and real call site, not invented copy.

## 5. Database migration

`amp_relevance`'s primary key changes from `amp_id TEXT PRIMARY KEY` to a composite
`PRIMARY KEY (pipeline, amp_id)`, with `pipeline`, `order_index`, `description`,
`concept` columns added. Migration v2, applied the same way v1 was — one DDL
statement at a time through `createDbWrapper().execute()`, per this repo's
governance rule (`.eslintrc.json` ~line 143-165: no raw `better-sqlite3`
`.exec()`/`prepare().run()` outside the allowlist). Since nothing in the tree
consumes v1 records yet (§3), this migration drops and recreates rather than
transforming existing rows — the 5 pilots get re-registered as v2 records with
`pipeline: 'item'` and `order` set from the real call sequence measured in §6.

## 6. Phase 1: the `item` pipeline (implementation-ready)

### 6.1 Measured call order

Read directly from `item-foundry.js`'s `forgeItemAsset()` (not assumed):

| order | ampId | already piloted? |
|---|---|---|
| 1 | `holyfire-motif-amp` | yes |
| 2 | `sketch-amp` | no |
| 3 | `sdf-shape-amp` | no |
| 4 | `shield-rim-amp` | yes |
| 5 | `shield-volume-amp` | yes |
| 6 | `heraldry-amp` | no |
| 7 | `jewelry-amp` | no |
| 8 | `chestplate-amp` | yes |
| 9 | `geometry-amp` | no |
| 10 | `region-fill-amp` | no |
| 11 | `noise-fill-amp` | no |
| 12 | `selout-amp` | no |
| 13 | `pixel-aa-amp` | no |
| 14 | `facet-amp` | no |
| 15 | `square-sharpness-contrast-amp` | no |
| 16 | `volume-lift-amp` | no |

12 new records need real predicates measured from their current hardcoded gate in
`item-foundry.js` (mirroring how the 5 pilots were done — read the actual `if`, do
not invent a plausible one). `jewelry-amp`'s gate was previously flagged as "half a
derived `hasGems` condition" — this phase needs to either find its real top-level
condition or record it honestly as `appliesTo: []` with a `requires` clause that
matches what actually gates it, not a fabricated `class`/`archetype` clause.

### 6.2 Selector change

```js
export function selectActiveAmps(pipeline, spec, records) {
  const scoped = records.filter(r => r.pipeline === pipeline);
  // ...existing per-record evaluation, unchanged...
  activated.sort((a, b) => orderOf(a) - orderOf(b)); // conveyor belt, not ampId
  return { activated, skipped, specChecksum, selectorVersion, pipeline };
}
```

Skip-reason evaluation order can stay `ampId`-sorted internally for deterministic
logs; the returned `activated` array — the thing a caller actually iterates to run
AMPs — must be `order`-sorted, since that ordering is load-bearing (e.g.
`noise-fill-amp` must run after `region-fill-amp` has committed base colors).

### 6.3 Normalizer

`item-foundry.js` already passes `spec` (`ITEM-SPEC-v1`) directly today — no
transform needed for Phase 1. `normalizeSpec()` only becomes real work starting
Phase 2, where a character/VRI/voxel-world spec's shape first needs flattening into
something `appliesTo` clauses can read.

### 6.4 Cutover safety: per-AMP differential gate

Because `item-foundry.js`'s current hardcoded conditionals are what real forged
assets go through today, no AMP's hardcoded check is deleted on faith. For each of
the 16 AMPs:

1. Collect a spec corpus: existing test fixtures + real `specs/*.json` in the repo.
2. For each spec, compute both (a) whether the *current* hardcoded condition would
   call this AMP, and (b) whether `selectActiveAmps('item', spec, records).activated`
   includes it.
3. Require exact agreement across the whole corpus before that AMP's hardcoded
   `if` is replaced with a lookup into the selector's result.
4. A mismatch blocks that AMP's cutover — fix the predicate, not the test corpus —
   and the hardcoded code stays authoritative until it passes.

This makes the migration falsifiable per-AMP rather than a single 16-AMP leap of
faith, matching this project's existing baseline-must-fail-first discipline. AMPs
land the cutover independently as their differential test passes — this is not a
single atomic PR replacing all 16 at once.

### 6.5 Discovery

Relevance records (predicate + description + concept + order) are authored as
literal JS (extending the existing pattern in `scripts/amp-substrate-cli.mjs`'s
pilot registrations, or a dedicated `amp-substrate/item-pipeline-records.js` if the
CLI file gets unwieldy at 16+ records) — real tracked source, not values that only
exist as SQLite rows. `code_atlas.py`'s whole-repo crawl picks these up on its next
post-commit rebuild with no additional wiring.

## 7. Phases 2+ (named, not designed)

Recorded here so follow-up specs start from this measurement instead of repeating it:

| Pipeline | Real caller(s) | AMPs |
|---|---|---|
| `chestplate-fidelity` | `chestplate-fidelity-pipeline.js` | chestplate-bevel, chestplate-surface-texture, crystal-core, palette-quantization |
| `render-fidelity` | `render-fidelity-pipeline.js` | flame-tip, shadow, tonation, vector, volume |
| `voxel-world` | `chunked-world-volume.js`, `qbit-world-game-loop.js` | biome-coherence, hollowness, chunks-seam, school-tag |
| `character` | `character-foundry.js` | pixel-scale (+ `scholomance-character-motif-amp` — caller needs confirming; `amp-registry.js`'s header claims a side-effect import from `character-foundry.js` that a static-import grep did not turn up) |
| `image-lattice` | `image-lattice-compiler.js` | image-segmentation, neighbor-extrapolation |
| `cross-cutting` | `nl-compile.js`, `scdl/passes/expand-symmetry.pass.js`, `scene-graph-renderer.js`, `lattice-grid-engine.js`, `pixelbrain.adapter.js` | symmetry-amp (already piloted — genuinely `appliesTo: []`), coord-symmetry-amp |
| `runtime` (no forge-time spec) | `wand-seed-lift.js`, `inject-hair.js`, combat/animation (`CombatArenaScene.js`, `AnimationProcessor.js`) | gravity, hair-flow, gear-glide — these get `appliesTo: []` (always-relevant, like symmetry-amp) rather than a fabricated spec predicate, since there is no per-asset spec gating them today |
| unresolved | unverified | shadow-perception-amp — `EFFECT_CATALOG.md` marks it WIRED but no non-test static importer was found; likely dispatched by string id through `verseIRMicroprocessors`. Needs its real caller traced before Phase 2 can write a truthful record for it. |

## 8. Testing

- Schema/selector unit tests extended for `pipeline` scoping, `order` sorting, and
  the `(pipeline, ampId)` composite key (mirrors the 45 existing tests' structure).
- Per-AMP differential tests (§6.4) as the cutover gate, not a one-time check.
- `npm run amps -- list --pipeline=item` exercised in CLI tests, matching the
  existing CLI test file's pattern.

## 9. Non-goals (this document)

- Character/VRI/voxel-world/image-lattice pipeline wiring (Phase 2+, separate spec).
- Multi-parent AMP dependencies (no current AMP needs it; `order` covers the real
  case).
- Any semantic-similarity or intent-compiler-driven activation (rejected, §2).
- Promoting `amp-registry.js` to a real registry, or removing it — out of scope,
  unrelated to this substrate.
