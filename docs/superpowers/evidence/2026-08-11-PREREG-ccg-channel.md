# PREREGISTRATION — Does a CCG channel carry information the existing five do not?

**Written 2026-08-11, BEFORE the comparison run. No comparison result has been observed.**

## Background

The 699-task preregistered run established that the fission reactor beats random valence
(+3.86pp, p=0.000898) but ties the hand-tuned `human_reference` (520 vs 521) and does not
significantly beat `current_cyclotron` (+1.14pp, p=0.33). See
`2026-08-11-PREREG-fission-vs-random.md`.

Diagnosis: the reactor searches weights over ten features that are five primitives
(`lexical, vector, chemistry, containment, polarity`) plus five of their pairwise
products. Sixty generations converged to hand-typed weights because there was nothing
further to extract from five channels. The constraint is the authored feature table, not
the search.

## What is being added

`codex/core/semantic/ccg-channel.js` — a CKY chart over real CCG categories using forward
application, backward application, and forward composition, with a closed-class lexicon
and `N`/`N\N` ambiguity for open-class words. It extracts the head of a gloss's leading
NP (the genus term of a genus–differentia definition) and the heads of `of`-complement
NPs (the holonym seam for meronymy). 18 unit tests in
`tests/core/semantic/ccg-channel.test.js`.

It is **not** a CCGbank supertagger: no statistical category model, no type-raising, no
coordination, no verb categories. Relative and participial clauses deliberately fail to
derive — that failure is what bounds the leading NP.

### Observed before this preregistration (channel-alone diagnostic, not a comparison)

| relation | ccg alone | chance | flat tasks |
|---|---|---|---|
| hypernym | 39.5% | 20% | 137/205 |
| antonym | 33.7% | 20% | 111/205 |
| mero_part | 31.7% | 20% | 169/205 |
| similar | 23.8% | 20% | 43/84 |

This is a property of the channel in isolation. It does **not** establish that the channel
adds anything to a reactor that already has five others — a new channel can be
individually predictive and still be fully redundant. That is the question below.

## Hypothesis

H1: a fission reactor trained with the CCG channel selects correct targets more often on
blind tasks than an otherwise identical reactor trained without it.

H0: no difference — the CCG signal is redundant with the existing five channels.

## Primary endpoint — ONE test, declared now

- **Comparison:** `fission_reactor_ccg` (11 features) vs `fission_reactor_base` (10 features)
- **Statistic:** exact two-sided sign test over discordant task pairs
- **α = 0.05**
- **Population:** all 699 generalization-test tasks, pooled across all four relations
- **Decision rule:** p < 0.05 AND positive direction → H1 supported. Anything else → not supported.

Both arms are trained in the same process on **identical splits**, with identical reactor
configuration (`populationSize: 96`, `generations: 60`, 4 islands, `seed: 0x72656163`),
identical task sampling, and identical allocation (hypernym/antonym/mero_part 205 each,
`similar` 84 — capped by substrate). The only difference is the presence of an eleventh
feature.

The eleventh feature is the raw CCG channel min-max normalized across each task's
candidates, exactly as `normalizeChannels` treats the other five. No interaction terms
are added: the existing five product features bought nothing (human_reference, which uses
no products, tied the reactor), so adding more is unwarranted.

## Secondary, reported but NOT decisive

- `fission_reactor_ccg` vs `random_valence`, `current_cyclotron`, `human_reference`
- per-relation accuracy for both arms
- learned weight on the `ccg` gene per island

`random_valence`, `current_cyclotron`, and `human_reference` are computed by the shared
discovery module and do **not** receive the CCG channel. They are unchanged baselines.

## Committed in advance

1. Whatever the primary endpoint returns is the reported result. A null is published as a null.
2. No relation will be dropped, added, or reweighted after seeing results. No subgroup
   analysis may become the headline — see the disavowed `antonym` subset in the prior
   preregistration.
3. No alternative statistic will be substituted if the sign test disappoints.
4. If the CCG channel is found to be redundant, that is a finding about the channel, not a
   reason to tune it and re-run. Any retuning starts a new preregistration.

## CHEMISTRY PROVENANCE — added retroactively 2026-08-11

The recorded result (519 vs 520, p = 1, H1 not supported) was produced under **Concept
Chemistry v1** (`chemweights1:84e6c8fbbc8ba850`). The same-day repairs changed the
`chemistry` channel both arms consume, so re-running will not reproduce these numbers.

The conclusion is unaffected either way: both arms shared the identical chemistry
channel, so the v1→v2 change cannot explain a null between them. Runs from here embed
`protocol.chemistry` automatically.

## Repro

    node scripts/benchmark-ccg-channel-prereg.mjs
    # NOTE: now runs under chemistry v2 (chemweights1:52ed14ac0c46ee82).
