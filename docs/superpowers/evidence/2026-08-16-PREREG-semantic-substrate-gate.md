# PREREGISTRATION — Semantic Substrate Gate

**Written 2026-08-16 BEFORE the substrate-gate accuracy numbers are read.**
The previous chamber run is not reused as a fitted baseline. T3–T10
efficacy is not in scope.

## Question

Can ConstellationOS emit typed semantic evidence that is dense enough to
disagree with a deranged copy of itself, and does the real alignment then
outrank the deranged one?

## Frozen exposure thresholds

Declared before accuracy:

| Gate | Threshold |
|---|---|
| ambiguous items scored | ≥ 300 |
| items receiving semantic evidence | ≥ 60% |
| real-vs-deranged score disagreements | ≥ 10% |
| real-vs-deranged rank disagreements | ≥ 30 cases |
| all-UNKNOWN items | ≤ 40% |

If any threshold fails: verdict `INSUFFICIENT_EXPOSURE`. Do not interpret
accuracy. The previous T1 result (0 discordant picks) is the motivating
example of this gate.

If exposure holds and real ranks equal deranged: `FALSIFIED_OR_NONDISCRIMINATIVE`.

Only then: evaluate T1 efficacy (real vs derange vs null) and T2 tribunal
(unigram vs forward vs inverse vs bidirectional vs role-shuffle).

## Arms

**T1.** Experimental inventory (not the twelve-lemma smoke seed).
Controls: within-dimension derange; all-UNKNOWN / emission-order.

**T2.** Document-disjoint gold role counts from EWT DEV+TRAIN documents
held out from eval. TEST is sealed and is not opened. After the three
gate-chamber losses are autopsied, a repair may be frozen here:

- if losses are sparse-count explosions: `minSupport = 3`, `scoreCap = 1.5`
- if inverse-only: drop inverse
- if role-projection: do not treat that flip as semantic evidence

The autopsy is logged before the large T2 tribunal.

## Chamber

Ambiguous spanning sentences from EWT DEV, supplemented from EWT TRAIN
only if DEV cannot supply 300 items. An item must:

- span as a stable root
- have ≥ 2 distinct projected answers **or** ≥ 2 emitted types on a
  gold-scored token
- disagree on a gold-relevant head or UPOS

`maxTokens` declared at run time and hashed. TEST file is not read.

## Protection

Forest fingerprint identical across T1/T2 observe arms. Coverage,
containment, recursive-preservative firings must not move. No ADMIT_BOND.

## Reproduction

```
node scripts/semantic-substrate-gate.mjs
```
