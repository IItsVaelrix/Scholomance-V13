# RESULT — Compatibility waterfall + silent-competitor census

SCORE was not run. TEST was not opened. No relations or COMPAT rows authored.
Prereg: `2026-08-17-PREREG-semantic-competition-coverage.md`.

- commit `74e30d33d5893d9df2d3bf01486d3ad5c51c3b56`
- DEV sentences ≤ 28 tokens: analysed 1824, parsed 585, threw 0
- fingerprints identical on 8/8 replay pairs
- TRAIN pass (gold-independent bond frequencies): 10763 sentences analysed

## Frozen metrics (this OBSERVE run)

- silentCompetitorRate **21.7%** (12350/57012)
- t1DecisionCouldFireRate **0.6%** (342/57012)
- namedCompleteRate **78.1%** (44546/57012)
- bothAlternativesNamedRate **42.4%** (15063/35558)
- bothAlternativesT1Rate **0.2%** (85/35558)
- filledStableRootRate 14.5% (cited from frozen 2026-08-16 census; not recomputed here)

## Where the 0.6% starves (cumulative funnel over decision-bearing edges)

- relationAvailable: 29570 (51.9%)
- leftValueAvailable: 7305 (12.8%)
- rightValueAvailable: 1967 (3.5%)
- compatMappingAvailable: 390 (0.7%)
- actualCompatFire: 342 (0.6%)

## Silence taxonomy

- C1-composition-missing: 12466
- C2-lexical-missing: 27777
- C3-feature-missing: 16543

## Top silent bonds, ranked by decision cells affected

| bond | family | silent edges | cells affected | sentences | named alt present | TRAIN freq |
|---|---|---|---|---|---|---|
| `PP+S->S` | clause-attachment | 2359 | 246 | 207 | 502 | 26784 |
| `NPCOMMA+NP->NP` | apposition | 1268 | 195 | 103 | 715 | 11448 |
| `INV+NP->S` | argument | 1311 | 169 | 306 | 277 | 11656 |
| `FRONTED+S->S` | clause-attachment | 509 | 168 | 106 | 295 | 6103 |
| `AUX+NP->INV` | argument | 886 | 164 | 321 | 0 | 10439 |
| `COP+NP->INV` | argument | 886 | 164 | 321 | 0 | 6223 |
| `INV+VP->S` | argument | 810 | 163 | 221 | 245 | 7375 |
| `NP+PART->NP` | complement | 903 | 163 | 188 | 870 | 8483 |
| `NPCOMMA+NP->APPOS` | apposition | 731 | 146 | 23 | 0 | 11527 |
| `INV+ADJ->S` | argument | 264 | 103 | 136 | 41 | 1785 |
| `V+ADJ->VP` | unclassified | 524 | 97 | 332 | 511 | 4394 |
| `PROPN+N->N` | modifier | 592 | 89 | 237 | 398 | 10064 |
| `N+PROPN->N` | modifier | 627 | 86 | 222 | 424 | 8005 |
| `GEN+N->NP` | unclassified | 156 | 70 | 46 | 46 | 1447 |
| `ADJ+INF->ADJ` | unclassified | 110 | 66 | 24 | 82 | 2866 |
| `VP+THANP->VP` | unclassified | 34 | 33 | 9 | 25 | 327 |
| `ADJ+S->S` | unclassified | 319 | 17 | 94 | 313 | 1830 |
| `P+NPO->PP` | unclassified | 39 | 16 | 38 | 39 | 543 |
| `COP+SBAR->VP` | complement | 14 | 14 | 4 | 14 | 165 |
| `POSS+N->N` | unclassified | 7 | 6 | 5 | 0 | 625 |
| `COP+INF->VP` | unclassified | 1 | 1 | 1 | 1 | 138 |

Ranking is decision cells affected, then sentences, then TRAIN frequency —
never raw DEV bond frequency. A relation earns authorship by how many
genuine competitions it would make two-sided.

Stay in OBSERVE. This census does not promote SCORE.

Reproduction: `node scripts/compat-waterfall-census.mjs`
