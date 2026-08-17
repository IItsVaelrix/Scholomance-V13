# PREREGISTRATION — Observe conduction milestone

**Written 2026-08-16 BEFORE the post-enrichment observe census is read.**
SCORE is not run. TEST is not opened. Emission is not changed.

## Question

Can TRAIN-only class senses and a small set of named composition rules
make meaning conduct through a frozen packed forest, or do they only
light isolated words?

## Why this is not SCORE

The last observe census found:

- T1 could-fire **3.1%**
- no-relation **68.5%**
- sense coverage **0.4%**
- stable roots filled **0 / 585**
- starved derivations **74% compositional / 26% lexical**

Ranking on that substrate would be ranking with silence.

## Treatments (observe only)

1. **Lexical.** Novel-B class assignment on TRAIN-authored bags.
   `sensesFor` may mint one default sense from `classifyLemma` when no
   authored polysemy exists. Function type defaults only for types that
   already participate in `FEATURE_COMPAT`. No C keys receive particles.
2. **Compositional.** Named logic rules for high-frequency bond families
   that currently compose as `uninterpreted-bond`. Unknownness follows
   the **head**, so a dark modifier cannot unfill a known predicate.

No `ADMIT_BOND`. Forest fingerprints must stay identical.

## Frozen milestone (all must hold before SCORE is considered)

| Gate | Threshold |
|---|---|
| lexical sense rate on ambiguous readings | ≥ 15% (above seed 0.4%) |
| T1 no-relation rate | ≤ 50% (from 68.5%) |
| T1 could-fire rate | ≥ 15% (from 3.1%) |
| stable roots semantically filled | ≥ 10% (from 0/585) |
| derangement still moves some relational scores | standing test |
| forest fingerprints identical | 8/8 |
| throws | 0 |
| TEST sealed | yes |

If any gate fails: stay in OBSERVE. Do not interpret ranking.

## Reproduction

```
node scripts/observe-coverage-census.mjs
```
