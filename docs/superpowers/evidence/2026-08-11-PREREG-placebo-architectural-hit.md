# PREREG: Placebo architectural hit-rate trial

**Contract intent:** `PB-PLACEBO-HIT-RATE-v1`  
**Date:** 2026-08-11  
**Status:** preregistered before placebo identities are fixed in the sealed pick file  

This document freezes failure criteria and matching rules **before** implementation
of placebo arms. The treatment arm (`process-sensor + valence-compiler`) is already
selected and partially built; placebos must receive equal budget and equal mercy.

## Claim under test

Do codebase-grounded Cyclotron utility-selected nuclei survive the implementation
gate more often than nuisance-matched random controls drawn from non-selected
candidates?

Metric:

```
implementation_survival_rate_treatment =
  I(treatment survived all gates)

implementation_survival_rate_placebo =
  (# placebos survived all gates) / 3

architectural_hit_delta =
  treatment_rate - placebo_rate
```

With n_treatment=1 and n_placebo=3 this is **descriptive**, not confirmatory.
Still: a treatment that dies while placebos live falsifies the soft claim;
treatment alive and all placebos dead is the strongest descriptive signal
this budget can produce.

## Treatment (already fixed)

| field | value |
|---|---|
| topology | `process-sensor\|valence-compiler` |
| size | 2 |
| source | utility-ranked codebase mine; selected for implementation |

## Matching protocol (nuisance variables)

Each placebo must match the treatment on:

| nuisance | match rule |
|---|---|
| molecule size | **hard** equality |
| closed port count | within ±1 |
| open port count | within ±2 (soft) |
| extension-atom count | prefer equality; if impossible in pool, document mismatch |
| chemistry / finalScore | within ±0.12 of treatment |
| evidence realized | ≥ 0.8 (same floor as mine proposals) |
| build budget | identical (see Effort ceiling) |
| implementation effort ceiling | identical |

### Sampling

1. Rebuild the baseline mine arm (trials=8000, seed=`0x5c4010`, entropy on).
2. Collapse shortlist by topology; utility-rank top 12 with extension requirement.
3. **Exclude** every utility-selected topology and the treatment topology.
4. Among remaining size-matched candidates satisfying chemistry and closed-port bands,
   sort by nuisance distance, then **seeded shuffle** (`seed = 0x504c4342` / `PLCB`)
   and draw **3** without replacement.
5. Seal the pick to `docs/superpowers/evidence/2026-08-11-placebo-pick.json`
   before any placebo implementation begins.

### Known pool limitation (declared before pick seal)

At size=2, the non-selected pool in the baseline arm contains **zero** candidates
with `extensionCount = 1`. Treatment has extensionCount=1. Therefore extension
match is **impossible** under hard size equality. The trial proceeds with size
hard-match and extension mismatch documented — not silently ignored.

## Effort ceiling (identical for all arms)

| resource | ceiling |
|---|---|
| pure core module | ≤ 120 lines of implementation logic |
| test file | ≤ 120 lines; must include the adversarial suite below |
| shell / I/O wiring | optional; if present, ≤ 40 lines; pure core must not do I/O |
| wall time to implement | one focused pass; no multi-day polish |
| new dependencies | **forbidden** unless already an open port of the molecule |
| invented atoms | **forbidden** |

If a coherent contract cannot be formed inside this ceiling → fail gate 1.

## Gates (same order, all arms)

```
G1 design coherence
G2 implementation (within ceiling)
G3 tests (meaningful behavioral contract)
G4 adversarial perturbation
```

An arm **survives** only if it passes G1–G4.
An arm that fails any gate is a **corpse**. Record the gate and criterion.

## Failure criteria (defined before implementation)

An arm **fails** if **any** of the following hold:

| id | criterion |
|---|---|
| F1 | **No coherent implementation contract** — ports cannot be mapped to named pure functions without inventing behavior not implied by offers/seeks |
| F2 | **Duplicates existing functionality without additional capability** — the module is a rename/re-export of an already-shipped path (A2 harness stages, C-sensor stages, etc.) and adds no new observable behavior |
| F3 | **Invented dependencies** — implementation requires modules/ports not present in the molecule's offers, seeks, or already-shared pure utilities (`sha256Hex` / `stableStringify` allowed as house seal tools) |
| F4 | **No meaningful behavioral contract in tests** — tests only check constants/types; no input→output law that could fail |
| F5 | **Adversarial impotence** — no allowed perturbation makes the mechanism detect failure or throw; a check that cannot fail is worthless |
| F6 | **Net architectural regression** — adding the module creates a second competing authority for the same verdict without a compose law, or breaks an existing sealed contract |

## Adversarial suite (minimum, all arms)

Every arm's tests must include:

1. **Happy path** — valid input produces stamped contract + deterministic output.
2. **Determinism** — twice ⇒ byte-identical seal or deep-equal result.
3. **Refusal / detection** — at least one corrupt or incomplete input is refused or flagged.
4. **Perturbation** — change one load-bearing field; mechanism must not report success-as-before.
5. **Immutability** — baseline/input objects passed in are not mutated.

## Blinding (as much as practical)

- Placebos are labeled `PLACEBO-A`, `PLACEBO-B`, `PLACEBO-C` in implementation
  notes until autopsy.
- Evaluation against F1–F6 uses the criteria table above, not “does this feel useful.”
- Treatment receives **no** extra lines of budget after placebos start.
- No sabotage: placebos get the same helper imports and test harness patterns.

## What is not allowed

- Replacing a placebo mid-trial because it “looks too weak.”
- Giving treatment new features while placebos are under test.
- Counting a placebo as survived if G4 was skipped.
- Claiming statistical significance at n=4.

## Autopsy requirement

Every corpse is recorded with:

- arm id and topology (unblinded at autopsy)
- gate of death (G1–G4)
- failure id (F1–F6)
- one-paragraph evidence

Survivors are recorded with the same fields (`survived: true`, failure id null).

## Repro

```bash
node scripts/sample-placebo-controls.mjs --trials=8000 --seed=0x5c4010
# then implement arms under the effort ceiling; run:
npx vitest run tests/codex/core/pixelbrain/process-sensor-valence-wire.test.js \
  tests/codex/core/pixelbrain/placebo-*.test.js
```
