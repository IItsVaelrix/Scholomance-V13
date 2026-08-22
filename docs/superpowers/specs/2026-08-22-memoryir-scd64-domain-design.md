# MemoryIR as an SCD64 Domain — L1 Conformance

**Status:** L1 implemented and green. L2 deliberately out of scope.
**Date:** 2026-08-22

## The problem

Persistent AI memory is stored as prose, and prose loses distinctions under
compression with nothing to detect the loss. Two measured instances:

- `"prefer modular edits"` → `"avoid major refactors"` → `"never refactor"`.
  A preference became a mandate across three compressions.
- `"door and head-rule were measured together"` → `"the pair is the fix"`.
  A conjunction became a causal claim. This one cost an hour on 2026-08-22
  before measurement broke it (`2026-08-22-nominal-root-answer.md`).

Both are modality/predicate collapses. Neither is detectable in prose.

## Why not a new IR

An earlier draft proposed inventing a ten-opcode intermediate representation.
It was wrong on two counts. SCD64 already provides the substrate: a fixed
eight-slot wire contract (`SCD64_SLOT_NAMES`), a versioned glossary whose 48
entries are all `fixedForever`, and `parseSCD64` / `decodeSCD64Hover` /
`compareSCD64ByBlocks` / `generateSCD64`. And "ten" was a made-up number — the
wire says eight.

The vocabulary-budget constraint that amortization implies (encoded memory only
beats prose while the decoder vocabulary stays small) is already **enforced** by
SCD64 rather than merely recommended: the wire is fixed, and a new domain reuses
the same eight slots instead of adding to them. `ART_SLOT_ALIASES` set the
precedent; MEMORY is the third domain, not a new system.

## The mapping

Each alias inherits its slot's structural role.

| # | wire slot | MEMORY alias | holds |
|---|---|---|---|
| 0 | BUGCLASS | `CLAIM_KIND` | RULE / PREF / REFUTED — what kind of claim |
| 1 | COORDSYS | `SCOPE` | the frame it was measured in |
| 2 | INVARIANT | `MODALITY` | preferred / mandatory / forbidden |
| 3 | MAGNITUDE | `EVIDENCE` | count + confidence band |
| 4 | MASKING | `EXCEPTION` | declared carve-outs |
| 5 | GATE | `ADMISSION` | experimental / stable / retired |
| 6 | PROPAGATE | `TARGETS` | what it points at |
| 7 | VERDICT | `UNBINDS_IF` | the pre-registered falsifier |

Slot 2 carries the preference/mandate distinction; slot 0 carries the
claim-kind distinction. The two drift cases above land in different blocks, so
`compareSCD64ByBlocks` reports them **by name** instead of absorbing them.

Slot 7 is `UNBINDS_IF` because the VERDICT slot is the natural home for the
condition that would overturn the verdict — the field added to Mnemosyne §4.3
the same day, itself borrowed from `denials.jsonl`.

## Three families

One SCD64 encodes one memory record; a family names the claim's SHAPE, exactly
as a bug family names a bug's shape.

- `MEM_RULE_MANDATORY` (`B1`) — binding rule; violation is an error
- `MEM_PREF_DEFEASIBLE` (`B2`) — preference with declared exceptions
- `MEM_CLAIM_REFUTED` (`B3`) — measured and did not hold; retained, not deleted

Version bytes `B1–B3` / predicted `C1–C3`; `01–06` (bug) and `A1–A3` (art) were
taken, and a collision test asserts it.

## L1 vs L2

**L1 (this work)** — structural. Encode → `SCD64_REGEX` → `parseSCD64` → 8
blocks → `compareSCD64ByBlocks`. Deterministic, offline, no model in the loop.
A green L1 says the IR is well-formed. It does **not** say meaning transports.

**L2 (not built)** — transport. `canonical → prose (model A) → slots (model B)
→ SCD64`, pass iff `compareSCD64ByBlocks` returns `IDENTICAL`; failures name the
drifted slots. Still judge-free — the comparator is arithmetic over hex blocks.
Deferred until the eight slots have settled.

## Changes

- `src/core/scd64/constants.ts` — `MEMORY_SLOT_ALIASES`
- `src/core/scd64/glossary.ts` — `MEMORY_FAMILIES` + emit loop (24 entries)
- `src/core/scd64/generateSCD64FromSlots.ts` — resolve across all three
  registries. It previously searched `BUG_FAMILIES` only, so ART was never
  generatable either; bug families are searched first, so their output is
  unchanged.
- `tests/src/core/scd64/memory-family.test.ts` — 16 tests
- `tests/src/core/scd64/art-family.test.ts` — corrected a filter that read
  `!e.domain || e.domain !== 'ART'` ("not ART") and silently absorbed any new
  domain into the bug-family count

## Standing limits

- **L1 proves well-formedness only.** No claim about cross-model meaning is
  supported by a green run here.
- **Nothing consumes this yet.** Mnemosyne does not emit MEMORY SCD64s; the
  domain exists and is verified, and is not wired to memory writes.
- `tools/scd64-vscode/data/scd64-glossary.v1.json` holds 48 entries and predates
  ART. It was already stale before this work and is not regenerated here.
- Three families is enough to exercise the slots and the two drift cases. It is
  not a claim that three shapes cover memory.
