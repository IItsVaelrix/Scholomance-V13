# PREREGISTRATION — The Null-Substrate Attack

**Written 2026-08-11 BEFORE the run. Predictions below are declared, not fitted.**

## The question

Does the Semantic Valence Cyclotron's output depend on the semantic *content* of its
atom bank, or only on the bank's structural statistics?

## The attack

Permute `label` and `evidence` across atoms under a seeded **derangement** (no atom keeps
its own label). Hold `id`, `domain`, `offers`, `seeks`, `traits`, `inhibits` fixed.
`grounding` is recomputed from the permuted label by `attest(groundingIndex, label)` —
the same call the real bank uses, so the null bank is built by the identical pipeline.

After permutation, `turboquant` may be labelled "Vaelrix law gate" while still offering
`ranked-frontier`. Every atom is a real repository capability wearing another's name.

### What this preserves exactly

- adjacency (derived from `offers`/`seeks` port matching) — **identical**
- `linkStrength` (0.40 of energy, from `BRIDGE_RULES`) — **identical**
- `valenceSatisfaction` (0.25 of energy, pure topology) — **identical**
- the multiset of grounding scores — **identical** (values are permuted, not changed)

### What this attacks

- `grounding` (0.20 of energy) — reassigned across atoms
- `novelty` (0.15 of energy) — label enters `generateSemantotopographicVector`
- **the entire Concept Chemistry layer**, which scores the molecule's prose label

So 35% of the energy formula plus all of the chemistry stage can see the scramble.
This is not a strawman: the system has a real channel through which to detect it.

## Declared predictions

| # | Prediction | Expected | Rationale |
|---|---|---|---|
| P1 | Unique/duplicate molecule counts **identical** | PASS | topology is label-blind; confirms the permutation is surgical, not destructive |
| P2 | \|Δ mean energy\| < 0.01 | **FAIL (no detection)** | 65% of energy is label-blind, and grounding's multiset is preserved — only its assignment moves |
| P3 | \|Δ mean finalScore\| < 0.02; nuclei stay 0; hypotheses within ±15% | **FAIL (no detection)** | Concept Chemistry already failed its negative control on 2026-07-31 (`absent/incremental-stamp-index`, a cache that does not exist, outscored every true statement) |
| P4 | Occupancy entropy's unique-yield gain replicates on the null bank | PASS | the mechanism is structural; if this fails the test is malformed, not the system |

**I predict the system fails P2 and P3.** I expect a bank of deliberately mislabelled
capabilities to produce approximately the same energies, the same scores, the same verdict
mix, and the same "0 nuclei" story as the true bank.

## What would surprise me

Any of:

- mean `finalScore` drops by **> 0.05** on the permuted bank, or
- the verdict mix shifts materially toward `REFUSED`, or
- mean energy moves by **> 0.03**

That would mean the grounding/chemistry layer reads the *correspondence* between an atom's
name and its structural role — a capability nothing in this repository has demonstrated and
which the 2026-07-31 negative control actively denies. If it happens, it is a real finding
about architecture robustness and I will report it as one.

## Committed in advance

1. Both arms run with identical `trialCount`, `seed`, and every threshold. One variable changes.
2. The permutation seed is declared here: **`0x4E554C4C`**. It is not searched over.
3. If the result contradicts my predictions, the predictions were wrong and the report says so.
4. No threshold in the cyclotron is touched. Tuning anything to produce separation after the
   fact would be the failure this whole session has been about.

## Repro

    node scripts/null-substrate-attack.mjs
