# RESULT — Phase 3B: complement lexical values

OBSERVE-only. SCORE not run. TEST not opened. Forest untouched.
Prereg (frozen before implementation): `2026-08-17-PREREG-phase-3b-complement-lexical.md`.
Implementation commit: `15d34ce8`. Demand census: `2026-08-17-complement-dark-ends.md`.

## Headline

Wall two (lexical values) removed on the complement pipeline. Value stages
moved massively; relation coverage, named coverage, and silence totals held
digit-for-digit; **zero** fires on complement relations (no mappings exist
yet — that is wall three, Phase 8).

## Prereg scorecard

Exact falsifiers:

| # | Prediction | Outcome | Verdict |
|---|---|---|---|
| P1 | relationAvailable = 29,570 | **29,570** | ✅ exact |
| P2 | namedComplete = 44,546 | **44,546** | ✅ exact |
| P3 | silent = 12,350 | **12,348** (−2) | ✅ decomposed: exactly the 2 pre-existing silent edges that gained could-fire via the declared spillover channel (silent = !(named&&complete) && !couldFire) |
| P4 | complement-relation fires = 0 | **0 / 0** (INFINITIVAL / PROPOSITIONAL) | ✅ exact |
| P9 | C1 = 12,466 | **12,466** | ✅ exact |
| P10-sum | C1+C2+C3 = 56,786 | 56,303 (−483) | ✅ decomposed: 483 edges left the taxonomy through C3→live (named+complete+could-fire = null class). 56,786 − 483 exits = 56,303. All exits are new fires on pre-existing relations |
| P12 | protection identical | analysed 1824 / parsed 585 / threw 0 / **eventsMean 77.11677631578948 digit-identical to 3A** / fingerprints 8/8 | ✅ exact |

Directional:

| # | Prediction | Outcome | Verdict |
|---|---|---|---|
| P6 | rightValue ≥ 7,967 | **10,989** (+9,022) | ✅ floor met, spillover decomposed below |
| P7 | leftValue ≥ 10,700 | **11,568** (+4,263) | ✅ |
| P8 | C2 ≤ 24,700 | **22,542** (−5,235) | ✅ |
| P10 | C3 ≥ 19,500 | **21,295** (+4,752) | ✅ |
| P11 | bothNamed = 15,063; bothT1 = 85 (spillover rule) | bothNamed **15,063** exact; bothT1 **147** (+62) | ✅ bothT1 movement rides the same decomposed fire channel |
| P5 | fire = 342 unless decomposed | **827** (+485), fully decomposed | ✅ see attribution |

## Attribution (scripts/phase-3b-attribution-probe.mjs)

Method: DEV chamber run twice — with the 3B provider, and with an exact
key-by-key reconstruction of the pre-3B seed (310 VP aliases, 3 clause
defaults, 16 governor entries subtracted, union-membership law applied).

- Reconstruction fires: **342 — digit-identical to the frozen 3A baseline.**
- Post-3B fires: **827** (+485). Decomposition:

| channel | relation | pre → post | cause |
|---|---|---|---|
| VP alias | adverbial | 0 → 290 | VP verb ends of ADV+VP/VP+ADV edges gain event.* values; `function.adverbial × event.*` mappings already existed |
| VP alias | auxiliates | 0 → 124 | AUX+VP edges: VP verbs gain event.motion/cognition |
| VP alias | particle-of | 0 → 69 | VP+PRT edges: VP verbs gain event.motion |
| union shadow | compound | 147 → 149 | 2 edges, one signature class: `wants` typed PROPN (dictionary ambiguity) enters the lemma union via the COGNITION addition; the pre-existing PROPN human heuristic meets ABSTRACT nouns (help/way) under the pre-existing `human × abstract` compound rows |

All movement flows through the two declared channels. No fires on
complement relations (P4). No movement on subject-like/object-like,
modifies/modified-by, determines, copular, infinitival-mark,
adposition-of beyond the reconstruction baseline.

## The funnel, before and after

| stage | 3A | 3B | Δ |
|---|---|---|---|
| relationAvailable | 29,570 (51.9%) | 29,570 (51.9%) | — |
| leftValueAvailable | 7,305 (12.8%) | **11,568 (20.3%)** | +4,263 |
| rightValueAvailable | 1,967 (3.5%) | **10,989 (19.3%)** | +9,022 |
| compatMappingAvailable | 390 (0.7%) | 946 (1.7%) | +556 (all on pre-existing relations) |
| actualCompatFire | 342 (0.6%) | 827 (1.5%) | +485 (decomposed above) |
| silent competitor rate | 21.7% | 21.7% | — |
| namedCompleteRate | 78.1% | 78.1% | — |

Silence reclassification (the C2→C3 flow the prereg predicted):
C2 27,777 → 22,542 (−5,235) · C3 16,543 → 21,295 (+4,752) · C1 exact.

## What the reactor says now

On complement-relation edges, values are substantially lit while
compatMappingAvailable stays near zero: 6,361 edges now have named
relations, most have both ends carrying values, and **no authored mapping
exists for INFINITIVAL_COMPLEMENT or PROPOSITIONAL_COMPLEMENT**. That is
the exact signature of wall three:

> "I know the relation. I increasingly know both participants. You still
> haven't told me which semantic values matter to this relation."

Next move per the roadmap reassessment: **Phase 8 — the relation-keyed
COMPAT registry** for the complement relations (governor event class ×
complement content class), authored under the same TRAIN-demand
discipline. Inversion (Phase 4) waits until the complement vertical slice
is complete end-to-end.

## Honesty log

1. First probe draft mis-scoped the strip (inflected forms entering the
   lemma union left phantom PROPN-heuristic entries in the
   reconstruction: fires 344 instead of 342). Caught by the digit
   comparison against the frozen baseline; union-membership law added;
   reconstruction now exact at 342.
2. The +2 compound movement was not predicted by name; it was decomposed
   post hoc to the union-shadow channel and reported here rather than
   smoothed over.
3. Census artifacts were overwritten by the 3B run; the 3A state is
   preserved as `2026-08-17-compat-waterfall-census-3a-baseline.{md,json}`.

Stay in OBSERVE. This result does not license SCORE.
