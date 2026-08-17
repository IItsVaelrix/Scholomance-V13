# RESULT — Compatibility waterfall + silent-competitor census

SCORE was not run. TEST was not opened. No relations or COMPAT rows authored.
Prereg: `2026-08-17-PREREG-semantic-competition-coverage.md`.

- commit `8495daa2103bf5c00ac65360244fbd79aa20e828`
- DEV sentences ≤ 28 tokens: analysed 1824, parsed 585, threw 0
- fingerprints identical on 8/8 replay pairs
- TRAIN pass (gold-independent bond frequencies): 10763 sentences analysed

## Frozen metrics (this OBSERVE run)

- silentCompetitorRate **34.0%** (19390/57012)
- t1DecisionCouldFireRate **0.6%** (342/57012)
- namedCompleteRate **65.8%** (37506/57012)
- bothAlternativesNamedRate **35.2%** (12525/35558)
- bothAlternativesT1Rate **0.2%** (85/35558)
- filledStableRootRate 14.5% (cited from frozen 2026-08-16 census; not recomputed here)

## Where the 0.6% starves (cumulative funnel over decision-bearing edges)

- relationAvailable: 23209 (40.7%)
- leftValueAvailable: 7037 (12.3%)
- rightValueAvailable: 1967 (3.5%)
- compatMappingAvailable: 390 (0.7%)
- actualCompatFire: 342 (0.6%)

## Silence taxonomy

- C1-composition-missing: 19506
- C2-lexical-missing: 22024
- C3-feature-missing: 15256

## Top silent bonds, ranked by decision cells affected

| bond | family | silent edges | cells affected | sentences | named alt present | TRAIN freq |
|---|---|---|---|---|---|---|
| `S+SBAR->S` | complement | 2034 | 322 | 135 | 1188 | 21934 |
| `VP+SBAR->VP` | complement | 882 | 272 | 121 | 622 | 9904 |
| `VP+INF->VP` | complement | 1305 | 247 | 199 | 1081 | 10840 |
| `PP+S->S` | clause-attachment | 2359 | 246 | 207 | 263 | 26784 |
| `NPCOMMA+NP->NP` | apposition | 1268 | 195 | 103 | 715 | 11448 |
| `SBAR+S->S` | complement | 1245 | 186 | 114 | 940 | 12648 |
| `INV+NP->S` | argument | 1311 | 169 | 306 | 188 | 11656 |
| `FRONTED+S->S` | clause-attachment | 509 | 168 | 106 | 231 | 6103 |
| `AUX+NP->INV` | argument | 886 | 164 | 321 | 0 | 10439 |
| `COP+NP->INV` | argument | 886 | 164 | 321 | 0 | 6223 |
| `INV+VP->S` | argument | 810 | 163 | 221 | 176 | 7375 |
| `NP+PART->NP` | complement | 903 | 163 | 188 | 870 | 8483 |
| `V+SBAR->VP` | complement | 316 | 159 | 83 | 110 | 3141 |
| `VP+PRT->VP` | complement | 679 | 156 | 327 | 382 | 7598 |
| `V+INF->VP` | complement | 579 | 154 | 154 | 373 | 4536 |
| `NPCOMMA+NP->APPOS` | apposition | 731 | 146 | 23 | 0 | 11527 |
| `INV+ADJ->S` | argument | 264 | 103 | 136 | 25 | 1785 |
| `V+ADJ->VP` | unclassified | 524 | 97 | 332 | 508 | 4394 |
| `PROPN+N->N` | modifier | 592 | 89 | 237 | 398 | 10064 |
| `N+PROPN->N` | modifier | 627 | 86 | 222 | 424 | 8005 |
| `GEN+N->NP` | unclassified | 156 | 70 | 46 | 46 | 1447 |
| `ADJ+INF->ADJ` | unclassified | 110 | 66 | 24 | 82 | 2866 |
| `VP+THANP->VP` | unclassified | 34 | 33 | 9 | 25 | 327 |
| `ADJ+S->S` | unclassified | 319 | 17 | 94 | 313 | 1830 |

Ranking is decision cells affected, then sentences, then TRAIN frequency —
never raw DEV bond frequency. A relation earns authorship by how many
genuine competitions it would make two-sided.

Stay in OBSERVE. This census does not promote SCORE.

Reproduction: `node scripts/compat-waterfall-census.mjs`

## Interpretation (where the 0.6% starves)

Chamber reproduced the frozen reference exactly: 1,824 analysed, 585 parsed,
throws 0, fingerprints 8/8, 35,558 decision-competitive cells, 57,012
decision-bearing edges, 342 could-fire, named-complete 65.8%.

The cumulative funnel over those 57,012 edges:

| stage | share | loss to next stage |
|---|---|---|
| relationAvailable | 40.7% | **−28.4 pts** |
| leftValueAvailable | 12.3% | −8.9 pts |
| rightValueAvailable | 3.5% | −2.8 pts |
| compatMappingAvailable | 0.68% | −0.08 pts |
| actualCompatFire | 0.60% | — |

Two starvation points dominate, in order:

1. **Relation projection (59.3% of edges never pass stage 1).**
   `projectRelation` covers basic nominal/verbal/function pairs only.
   The high-mass decision families — SBAR complements, INV inversion,
   PP+S attachment, NPCOMMA apposition, particles — project no relation
   at all. Track B cannot start on them until Track A names the relation.
2. **Right-end features (12.3% → 3.5%).** Where a relation exists, the
   oriented right end is dark three times out of four. Demand-driven
   TRAIN class expansion belongs here, keyed by relation family.

The mapping→fire gap is tiny (0.68% → 0.60%): when both kinds are lit
under an authored relation, the authored values almost always match.
**The authored COMPAT table is not the bottleneck; the inventory is.**
Weight-tuning before inventory growth would be rearranging deck chairs.

Silence split of the 56,786 non-live edges: C1 composition-missing
19,506 · C2 lexical-missing 22,024 · C3 feature-missing 15,256 (named
AND complete but T1-dark). Track A owns C1+C2 (41,530 edges); Track B
owns C3 plus stage-1 recovery.

`namedAlternateSilentEdges` is the map of weak distinguishability:
S+SBAR (1,188), VP+INF (1,081), SBAR+S (940), NPCOMMA+NP→NP (715) are
the cells where ONE alternative already has music — giving the silent
sibling any named factor flips the cell from weak to strong. AUX/COP
inversions show 0: both alternatives of inversion cells are silent, so
inversion semantics must arrive before those cells can be heard at all.

## Instrument honesty log

- First draft read `rec.id` (undefined) for sentence identity — caught
  against `parseConllu`'s actual `sentId` field BEFORE trusting output;
  rerun after fix.
- First draft checked the named-sibling flag on derivation shapes
  instead of diagnosis rows (always-0 column) — caught on inspection of
  the first completed output; rerun after fix. This result is the
  post-fix run.
- `actualCompatFire` is pinned by test to equal `diagnoseT1Edge`
  could-fire; the census's 342 fires equal the frozen reference.

