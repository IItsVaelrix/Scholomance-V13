# PREREGISTRATION — Fission Reactor vs Random Valence

**Written 2026-08-11, BEFORE the run. Nothing below was chosen after seeing the result.**

## Motivating pilot (already observed — this is the hypothesis, not the evidence)

The 240-task benchmark (`2026-08-11-semantic-fission-reactor-benchmark.json`) reported:

| method | correct | acc |
|---|---|---|
| fission_reactor | 181/240 | 75.42% |
| current_cyclotron | 181/240 | 75.42% |
| random_valence | 172/240 | 71.67% |
| human_reference | 177/240 | 73.75% |

`fission_reactor vs random_valence`: 20 wins / 11 losses / 209 ties, **+3.75pp, p = 0.1496**.
Underpowered, direction positive, unresolved. That is the entire basis for this run.

A post-hoc "+5.00pp with antonym dropped" figure was computed during analysis and is
**disavowed**: it was the maximum of four drop-one subsets, selected after seeing which
relation was flat. It plays no role here.

## Hypothesis

H1: `fission_reactor` selects the correct WordNet relation target more often than
`random_valence` on blind tasks drawn from sources disjoint from training.

H0: no difference.

## Primary endpoint — ONE test, declared now

- **Comparison:** `fission_reactor` vs `random_valence`
- **Statistic:** exact two-sided sign test over discordant task pairs
- **α = 0.05**
- **Population:** ALL generalization-test tasks pooled across all four relations
- **Decision rule:** p < 0.05 AND positive direction → H1 supported. Anything else → not supported.

## Sample size and the forced cap

Power target was ~700 tasks (≈91 discordant pairs at the pilot's 12.9% discordant rate
and 64.5% win share, 80% power, α = 0.05).

`similar` cannot reach its share. The substrate contains **432 feasible `similar` sources**
(4-decoy-eligible). The pilot reservation excludes 206/relation and train+val consume
140 more, leaving **86**. This cap is a property of Open English WordNet, not a choice.

Declared allocation, total **701 tasks**:

| relation | test tasks | limited by |
|---|---|---|
| hypernym | 205 | design |
| antonym | 205 | design |
| mero_part | 205 | design |
| similar | **84** | substrate ceiling |

Training (100/relation) and validation (40/relation) are unchanged from the pilot.

### AMENDMENT 2026-08-11, before any result was observed

The first launch aborted in `sampleFreshGloballyDisjoint` with
`Unable to select 226 fresh disjoint similar tasks` — the estimated cap of 86 was wrong.
The estimate (432 feasible sources − 206 reserved) did not account for the sampler
choosing a different truth edge per source under its own hash ordering, which changes
decoy eligibility at the margin.

Measured directly by instrumenting the sampler to report achieved supply instead of
throwing:

    ACHIEVED SUPPLY (train+val+test per relation):
    {"hypernym":345,"antonym":345,"mero_part":345,"similar":224}

`similar` supplies 224; train+val consume 140; **test ceiling is 84**. Total n = **699**.

This amendment was made **before any comparison result was computed** — the run aborted
during task sampling, prior to reactor training or scoring. It is the shortfall path
anticipated in "Committed in advance" clause 4. The primary endpoint, statistic, α, and
decision rule are unchanged.

## Independence from the pilot

`deterministicSplit` re-orders the whole sampled pool by `hashUint('reactor-split|'+taskId)`
and slices train[0:100] / val[100:140] / test[140:...]. Enlarging the test draw changes the
sampled pool, so train/validation membership changes too. **This is therefore an independent
replication, not an extension of the 240-task run — the pilot tasks are not nested inside it,
and the reactor is retrained.** Reported split checksums must differ from the pilot's.

## Secondary, reported but NOT decisive

Recorded for completeness; none may override the primary endpoint, none carry multiplicity
correction, and none may be promoted to a headline:

- `fission_reactor` vs `current_cyclotron`
- `fission_reactor` vs `human_reference`
- per-relation accuracy tables for all four methods

## Committed in advance

1. Whatever the primary endpoint returns is the reported result. A null is published as a null.
2. No relation will be dropped, added, or reweighted after seeing results.
3. No alternative statistic will be substituted if the sign test disappoints.
4. If the run fails to produce 701 tasks, the shortfall is reported and the achieved n is used.
5. Reactor configuration is unchanged from the pilot: `populationSize: 96`, `generations: 60`,
   4 islands, `seed: 0x72656163`, same `FEATURE_NAMES`, same `HUMAN_WEIGHTS`.

## CHEMISTRY PROVENANCE — added retroactively 2026-08-11

The recorded result (520/699, +3.86pp, p = 0.000898) was produced under **Concept
Chemistry v1** (`chemweights1:84e6c8fbbc8ba850`), before the three repairs of the same
day. The repairs changed the `chemistry` channel this benchmark consumes — measured on
an unchanged task, feasibility moved **0.2430 → 0.2018**.

**Re-running the script today will therefore NOT reproduce the recorded numbers.** The
recorded result is not invalidated; it is correctly sealed against the code and substrate
of its time. But it is no longer reproducible from HEAD, and the reason is a scoring
change rather than a substrate change.

Runs from this point forward embed `protocol.chemistry` (via `chemistryProvenance()`), so
the distinction is machine-checkable rather than a note in a document. This paragraph
exists because the run predates that stamp.

## Repro

    node scripts/benchmark-fission-vs-random-prereg.mjs
    # NOTE: now runs under chemistry v2 (chemweights1:52ed14ac0c46ee82).
    # To reproduce the recorded numbers, pin synthesize() to WEIGHTS_V1.
