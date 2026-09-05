# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260904-AMP-ACTIVATION-SUBSTRATE-V1
- **Feature / Fix Name:** PixelBrain AMP Activation Substrate v1
- **Author / Agent:** Codex
- **Date:** 2026-09-04
- **Related prompt:** Implement `2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md`
- **Classification:** Architectural
- **Priority:** High

---

## 2. Executive Summary

`PB-AMP-RELEVANCE-v1` now has a checksummed relevance-record contract, a
SQLite substrate using the shared migration/pragma lifecycle, a deterministic
selector with an append-only activation log, a five-verb CLI, and lazy
`pixelbrain.amp.*` microprocessor bridge registrations. No forge calls this
subsystem in v1; the existing item and character forge paths remain outside its
runtime path. The highest-risk seam was microprocessor dispatch, where generic
`(payload, context)` dispatch does not match the AMP functions' distinct
signatures; explicit packet adapters now call each real exported function.

Targeted verification is green: 66 tests across the new substrate, the existing
microprocessor suite, and SQLite migration regression suite. A broad `npx
vitest run` also reported failures outside the substrate boundary; it was not
made green as part of this PDR because its diagnostic search found no substrate
imports in the failing suites and repairing those unrelated systems would expand
the approved scope. Status is **implementation complete; repository-wide
baseline requires separate triage**.

---

## 3. Intent and Reasoning

### Problem Statement

PixelBrain had real AMP modules and direct factory-level gates but no durable,
auditable decision boundary for which AMP an asset needs.

### Why This Change Was Chosen

The implementation reuses the repository's `sha256Hex`, SQLite pragma/migration
helpers, and lazy microprocessor registry. Selection is predicate-only and
alphabetically ordered, so it introduces no learned state, RNG, floating-point
comparison, or priority scheme.

### Assumptions Made

- Relevance records are dormant data until a future wiring PDR consumes them.
- The five source-backed pilots are sufficient to prove storage, selection, CLI,
  logging, and execution registration without claiming all 39 AMPs are covered.
- `matches` is literal whole-value comparison, not a caller-supplied regular
  expression, so registration data cannot introduce regex backtracking work.

### Source-Truth Correction

The PDR pilot table named `hair-flow-amp` with a `hair.profile` requirement and
described holyfire through `materials`. The live `hair-flow-amp` takes a direct
configuration object, not a spec-shape gate, while `holyfire-motif-amp` is gated
by alternative `parts.profile` / `parts.id` conditions. The implemented pilot
set therefore uses the source-backed gates: chestplate, shield rim, shield
volume, holyfire motif, and symmetry. This preserves the PDR's no-dishonest-
predicate principle; `hair-flow-amp` remains for the follow-up population PDR.

### Escalation Resolutions for v1

1. The recommended `pixelbrain.amp.*` prefix was used. It avoids adding a third
   unrelated meaning to the existing `amp.*` namespace.
2. `amp-registry.js` remains untouched and is not deprecated. This substrate is
   a separate dormant capability until a future wiring PDR proves a consumer.

---

## 4. Scope of Change

### In Scope

- Frozen record validation and checksum enforcement.
- Dedicated SQLite relevance/log tables and idempotent migration.
- Deterministic selector, logging adapter, CLI, five source-backed pilot
  records, and lazy bridge registrations.
- Schema-contract registration, PDR archive indexing, and this PIR.

### Out of Scope

- Wiring `item-foundry.js`, `character-foundry.js`, or any factory to consume
  selection results.
- Editing any AMP module or `amp-registry.js`.
- Populating the remaining AMP records or designing priority/conflict handling.
- Repairing unrelated repository-wide test failures.

---

## 5. Files and Systems Touched

| Area | File / Module | Type of Change | Risk | Notes |
|---|---|---|---|---|
| Contract | `codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js` | New | High | Frozen checksummed record validation. |
| Persistence | `codex/core/pixelbrain/amp-substrate/amp-substrate.db.js` | New | High | Dedicated SQLite migration and audit log. |
| Logic | `codex/core/pixelbrain/amp-substrate/amp-selector.js` | New | High | Deterministic selection and logging seam. |
| Tooling | `scripts/amp-substrate-cli.mjs` / `package.json` | New / modified | Medium | Register, list, select, stats, and log. |
| Registry | `codex/core/microprocessors/index.js` | Modified | High | Additive lazy `pixelbrain.amp.*` adapters only. |
| Tests | `tests/codex/core/pixelbrain/amp-substrate/` | New | High | Contract, DB, selector, CLI, and bridge coverage. |

No code in `item-foundry.js`, `character-foundry.js`, `factory/*.js`, the AMP
modules, or `amp-registry.js` was changed for this PDR.

---

## 6. Pilot Records

| ampId | checksum |
|---|---|
| `chestplate-amp` | `a430ef268484c732fca2675acbdb82d7a64759c2c4185cb4bfa05aae80b4fa0d` |
| `holyfire-motif-amp` | `a5f541fba4f92f4157d110a82815f1cc76206af876e6e58626688bd361425116` |
| `shield-rim-amp` | `4d86a8820464252e1a2f7c69a1bf21aece1d64b47f9558fa81b745dd0708ce89` |
| `shield-volume-amp` | `5cbc9641febeeac1bc50d17595130e1799227aa554f2f1cf16d4788317e42afc` |
| `symmetry-amp` | `c8bbb673a36092195f086372357ef0deec5c68df1e278fc84f8faed9c5276893` |

## 7. Verification Evidence

Targeted regression command:

```text
npx vitest run tests/codex/core/pixelbrain/amp-substrate/ tests/core/microprocessors tests/server/persistence.adapter.migrations.test.js
Test Files  10 passed (10)
Tests  66 passed (66)
```

Manual CLI walkthrough, using a fresh temporary SQLite file:

```text
[AMP] 5/5 pilot records registered

[AMP] spec void-chestplate-arcane-v1.json  (9e18334610ba…)
  ACTIVATED (2):
    ✦ chestplate-amp
    ✦ symmetry-amp
  DORMANT (3):
    · holyfire-motif-amp         appliesTo did not match spec
    · shield-rim-amp             appliesTo did not match spec
    · shield-volume-amp          appliesTo did not match spec

[AMP] spec slime-staff.v1.json  (cbf439dbe6af…)
  ACTIVATED (1):
    ✦ symmetry-amp
  DORMANT (4):
    · chestplate-amp             appliesTo did not match spec
    · holyfire-motif-amp         appliesTo did not match spec
    · shield-rim-amp             appliesTo did not match spec
    · shield-volume-amp          appliesTo did not match spec

[AMP] registered records : 5
[AMP] activation entries : 2
[AMP] most activated     : symmetry-amp (2×)
```

The 100-iteration byte-identical selector regression and the idempotent
file-backed migration regression both pass. The bridge test independently
executes chestplate and holyfire through their registered adapters and confirms
that existing `amp.*` IDs remain present.

### Broader Suite Status

`npx vitest run` surfaced failures in Constellation, Truesight, determinism,
PixelBrain spec-intent, and phoneme-engine suites. The failing test files contain
no `amp-substrate`, `PB-AMP-RELEVANCE`, `PIXELBRAIN_AMP_IDS`, or CLI imports.
They require their own diagnosis; no change was made outside this PDR to mask or
repair them.

## 8. Follow-up

The next PDRs are: (1) empirical population of remaining AMP relevance records,
including deciding which runtime-only AMPs belong outside this substrate; and
(2) a reviewed forge-wiring design that adds conflict resolution before any
selector result can mutate a real lattice.
