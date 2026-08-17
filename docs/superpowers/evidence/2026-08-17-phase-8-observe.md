# OBSERVE — Phase 8 complement mapping waterfall

SCORE was not run. TEST was not opened. COMPAT rows were authored in a prior task; this script only measures.
Does not overwrite `2026-08-17-compat-waterfall-census.{md,json}`.
Prereg: `2026-08-17-PREREG-phase-8-complement-compat.md`.

- commit `66c9ee25ff6e477d2be71375e62d2245a8147d47`
- DEV sentences ≤ 28 tokens: analysed 1824, parsed 510, threw 0
- fingerprints identical on 8/8 replay pairs
- TRAIN pass (gold-independent bond frequencies): 10763 sentences analysed
- testFileOpened: false; scored: false

## Frozen metrics (this OBSERVE run)

- silentCompetitorRate **24.1%** (10771/44634)
- t1DecisionCouldFireRate **3.3%** (1495/44634)
- namedCompleteRate **75.6%** (33734/44634)
- bothAlternativesNamedRate **53.0%** (11412/21512)
- bothAlternativesT1Rate **2.0%** (422/21512)

## Global waterfall (cumulative funnel over decision-bearing edges)

- relationAvailable: 21621 (48.4%)
- leftValueAvailable: 9460 (21.2%)
- rightValueAvailable: 8862 (19.9%)
- compatMappingAvailable: 1735 (3.9%)
- actualCompatFire: 1495 (3.3%)

## Complement mapping waterfall

- complementEdges: 4799
- complementRelationExists: 4799
- complementBothValuesExist: 3216
- complementMappingExists: 4799
- complementMappingFires: 666
- complementMappingAbstains: 2550
- firesByRelation.INFINITIVAL_COMPLEMENT: 503
- firesByRelation.PROPOSITIONAL_COMPLEMENT: 163
- nonComplementFires: 829

## Silence taxonomy

- C1-composition-missing: 10900
- C2-lexical-missing: 17054
- C3-feature-missing: 15314

## Top silent bonds, ranked by decision cells affected

| bond | family | silent edges | cells affected | sentences | named alt present | TRAIN freq |
|---|---|---|---|---|---|---|
| `PP+S->S` | clause-attachment | 1967 | 230 | 186 | 307 | 22287 |
| `NPCOMMA+NP->NP` | apposition | 1123 | 187 | 102 | 593 | 9737 |
| `INV+NP->S` | argument | 1099 | 157 | 299 | 154 | 10710 |
| `NP+PART->NP` | complement | 699 | 155 | 148 | 662 | 7536 |
| `AUX+NP->INV` | argument | 851 | 154 | 320 | 0 | 19848 |
| `COP+NP->INV` | argument | 851 | 154 | 320 | 0 | 12056 |
| `INV+VP->S` | argument | 675 | 149 | 210 | 180 | 6566 |
| `FRONTED+S->S` | clause-attachment | 329 | 133 | 79 | 157 | 4925 |
| `NPCOMMA+NP->APPOS` | apposition | 641 | 133 | 23 | 0 | 9796 |
| `INV+ADJ->S` | argument | 236 | 98 | 132 | 27 | 1684 |
| `PROPN+N->N` | modifier | 620 | 91 | 251 | 385 | 19498 |
| `N+PROPN->N` | modifier | 632 | 85 | 228 | 423 | 8997 |
| `V+ADJ->VP` | unclassified | 472 | 79 | 306 | 459 | 7738 |
| `GEN+N->NP` | unclassified | 131 | 70 | 32 | 49 | 1402 |
| `ADJ+INF->ADJ` | unclassified | 78 | 56 | 19 | 72 | 4820 |
| `VP+THANP->VP` | unclassified | 34 | 33 | 9 | 25 | 290 |
| `ADJ+S->S` | unclassified | 276 | 17 | 87 | 271 | 2716 |
| `P+NPO->PP` | unclassified | 39 | 16 | 38 | 39 | 1086 |
| `COP+SBAR->VP` | complement | 10 | 10 | 3 | 10 | 246 |
| `POSS+N->N` | unclassified | 7 | 6 | 5 | 0 | 1262 |
| `COP+INF->VP` | unclassified | 1 | 1 | 1 | 1 | 248 |

Ranking is decision cells affected, then sentences, then TRAIN frequency —
never raw DEV bond frequency.

Stay in OBSERVE. This census does not promote SCORE.

Reproduction: `node scripts/phase-8-complement-compat-observe.mjs`
