# Placebo architectural hit-rate — Autopsy

**Contract:** `PB-PLACEBO-HIT-RATE-v1`  
**Prereg:** `2026-08-11-PREREG-placebo-architectural-hit.md`  
**Pick seal:** `2026-08-11-placebo-pick.json` (`placebopick1:6d19adf0…`)  
**Date:** 2026-08-11  

No mercy for the Cyclotron candidate. No sabotage of the placebos.
Failure criteria were frozen before the pick was sealed.

## Matching honesty

| nuisance | treatment | placebos | matched? |
|---|---|---|---|
| size | 2 | 2, 2, 2 | **yes** (hard) |
| closed ports | 1 | 1, 1, 1 | **yes** |
| open ports | 4 | 2, 1, 2 | soft (within protocol) |
| extension count | 1 | 0, 0, 0 | **NO** — impossible in size=2 non-selected pool |
| chemistry band | 0.719 | 0.696 / 0.736 / 0.780 | **yes** (±0.12) |
| evidence realized | 1.0 | 1.0 | **yes** |
| effort ceiling | ≤120 core / ≤120 test | all under except treatment tests 123 (pre-ceiling build) | mostly |

Extension mismatch is a real threat to fairness. It is recorded, not papered over.
Every size-matched non-selected candidate in the pool had `extensionCount=0`.

## Arms (unblinded)

| arm | topology | module |
|---|---|---|
| **TREATMENT** | `process-sensor + valence-compiler` | `process-sensor-valence-wire.js` |
| **PLACEBO-A** | `canonical-serializer + immutable-packet` | `placebo-a-serialize-packet.js` |
| **PLACEBO-B** | `canonical-serializer + schema-verifier` | `placebo-b-serialize-verify.js` |
| **PLACEBO-C** | `schema-verifier + server-authority` | `placebo-c-schema-authority.js` |

## Gate results

| arm | G1 design | G2 implement | G3 tests | G4 adversarial | F-criteria | **outcome** |
|---|---|---|---|---|---|---|
| TREATMENT | pass | pass | pass (8) | pass | none | **SURVIVED** |
| PLACEBO-A | pass | pass | pass (5) | pass | **F2** | **CORPSE** |
| PLACEBO-B | pass | pass | pass (5) | pass | **F2** | **CORPSE** |
| PLACEBO-C | pass | pass | pass (6) | pass | none | **SURVIVED** |

All four produced green vitest suites (24 tests). Green tests are not survival.
Survival requires F1–F6 clear.

## Corpses

### PLACEBO-A — died on F2

**Topology:** `canonical-serializer + immutable-packet`  
**Gate of death:** post-G4 criterion scan  
**Failure:** F2 — duplicates existing functionality without additional capability  

`sealStructure` is the house seal path already shipped as:

- A2 harness `canonicalize` + `seal`
- C-sensor `sealReceipt`
- cleri-probe `stableStringify` + `sha256Hex`

The module is a competent re-composition of an already-authoritative path. It adds no
new observable class of behavior (no process fingerprint, no domain gate beyond
hash-the-object). Adversarial detection works — a check that can fail — but F2 still kills.

### PLACEBO-B — died on F2

**Topology:** `canonical-serializer + schema-verifier`  
**Gate of death:** post-G4 criterion scan  
**Failure:** F2 — duplicates existing functionality without additional capability  

`serializeAndVerify` findings (`NO_CONTRACT`, `NO_SCHEMA_VERSION`) are the same schema
stage A2 already runs on evidence artifacts (`verifySchema`). No self-seal, no drift
detection, no new verdict class. Thin and correct; not additional architecture.

### PLACEBO-C — survived

**Topology:** `schema-verifier + server-authority`  
**Failure:** none  

`authorize({ artifact, diagnosticEvent })` is not a rename of an existing pure export.
It composes schema-verdict with a required diagnostic-event into an authoritative
verdict (`AUTHORITATIVE` | `REFUSED`). server-authority's evidence path is a directory
(`codex/server`); the implementation stayed inside the port contract without importing
server runtime (no F3). Adversarial suite forces REFUSED on stripped schema and missing
events (G4 pass). Not glamorous. Alive.

### TREATMENT — survived

**Topology:** `process-sensor + valence-compiler`  
**Failure:** none  

`senseValenceCompile(report, baseline)` wires valence shortlist (candidate-frontier)
into C-sensor process assessment. New capability: process-drift verdicts on compiler
outputs. Does not re-export A2. Adversarial: STABLE / DEVIATION / ABSTAIN / refuse /
immutability all hold.

## Rates

```
treatment_survival_rate = 1 / 1 = 1.000
placebo_survival_rate   = 1 / 3 = 0.333
architectural_hit_delta = 1.000 - 0.333 = +0.667
```

### What this does **not** prove

- Not significant. n=1 treatment, n=3 placebos.
- Extension count unmatched — placebos were legacy seal/schema pairs by pool necessity.
  A critic can say: "you compared a sensor wire to seal rediscoveries; of course F2 kills them."
  That critic is partly right. The matching protocol *required* size=2; the pool offered
  no extension-bearing alternatives. The fix is a larger shortlist or soft size±1 for
  extension-matched controls in the next trial — not silent re-picking mid-stream.
- PLACEBO-C survival shows random non-selected molecules can still form real contracts.
  The Cyclotron is not the only path to a survivor.

### What it **does** support (descriptive)

- Utility-selected treatment survived the same gate placebos faced.
- 2/3 placebos died on **F2** (duplicate of shipped architecture), not on test incompetence
  or sabotage — they were implemented cleanly and still failed the pre-registered criterion.
- Green tests ≠ architectural hit. All four were green; only two survived F-criteria.

## Corpse register (ledger form)

| id | topology | survived | death_gate | failure | one-line |
|---|---|---|---|---|---|
| TREATMENT | process-sensor\|valence-compiler | true | — | — | process drift on valence reports |
| PLACEBO-A | canonical-serializer\|immutable-packet | false | F2 | F2 | re-composition of existing seal path |
| PLACEBO-B | canonical-serializer\|schema-verifier | false | F2 | F2 | re-composition of A2 schema stage |
| PLACEBO-C | schema-verifier\|server-authority | true | — | — | schema + diagnostic → authority |

## Repro

```bash
node scripts/sample-placebo-controls.mjs --trials=8000 --seed=0x5c4010
npx vitest run \
  tests/codex/core/pixelbrain/process-sensor-valence-wire.test.js \
  tests/codex/core/pixelbrain/placebo-a-serialize-packet.test.js \
  tests/codex/core/pixelbrain/placebo-b-serialize-verify.test.js \
  tests/codex/core/pixelbrain/placebo-c-schema-authority.test.js
```
