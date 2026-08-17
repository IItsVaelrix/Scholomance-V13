# OBSERVE — Phase 8 TRAIN class-pair demand

TEST sealed. SCORE off. No mappings authored by this script.

- TRAIN analysed: 10763, threw: 0, cutoff: 30

## Authored row set (allow-list ∩ mass ≥ 30 ∩ not forbidden)

| relation | governor | complement | weight | TRAIN edges |
|---|---|---|---|---|
| INFINITIVAL_COMPLEMENT | cognition | infinitival-event | 2 | 2026 |
| INFINITIVAL_COMPLEMENT | creation | infinitival-event | 1.5 | 959 |
| INFINITIVAL_COMPLEMENT | communication | infinitival-event | 2 | 880 |
| PROPOSITIONAL_COMPLEMENT | cognition | abstract-proposition | 2 | 843 |
| PROPOSITIONAL_COMPLEMENT | communication | abstract-proposition | 2 | 660 |
| INFINITIVAL_COMPLEMENT | perception | infinitival-event | 1.5 | 387 |
| PROPOSITIONAL_COMPLEMENT | perception | abstract-proposition | 1.5 | 333 |
| INFINITIVAL_COMPLEMENT | state | infinitival-event | 1.5 | 213 |

## All observed pairs

| pair | edges | allowed | forbidden |
|---|---|---|---|
| PROPOSITIONAL_COMPLEMENT|UNKNOWN|abstract-proposition | 29690 | false | true |
| INFINITIVAL_COMPLEMENT|UNKNOWN|infinitival-event | 6943 | false | true |
| INFINITIVAL_COMPLEMENT|cognition|infinitival-event | 2026 | true | false |
| INFINITIVAL_COMPLEMENT|motion|infinitival-event | 1079 | false | true |
| INFINITIVAL_COMPLEMENT|creation|infinitival-event | 959 | true | false |
| INFINITIVAL_COMPLEMENT|communication|infinitival-event | 880 | true | false |
| PROPOSITIONAL_COMPLEMENT|cognition|abstract-proposition | 843 | true | false |
| PROPOSITIONAL_COMPLEMENT|communication|abstract-proposition | 660 | true | false |
| INFINITIVAL_COMPLEMENT|possession|infinitival-event | 459 | false | true |
| INFINITIVAL_COMPLEMENT|perception|infinitival-event | 387 | true | false |
| PROPOSITIONAL_COMPLEMENT|motion|abstract-proposition | 367 | false | true |
| PROPOSITIONAL_COMPLEMENT|possession|abstract-proposition | 339 | false | true |
| PROPOSITIONAL_COMPLEMENT|perception|abstract-proposition | 333 | true | false |
| PROPOSITIONAL_COMPLEMENT|creation|abstract-proposition | 280 | false | false |
| INFINITIVAL_COMPLEMENT|state|infinitival-event | 213 | true | false |
| PROPOSITIONAL_COMPLEMENT|state|abstract-proposition | 135 | false | true |
| PROPOSITIONAL_COMPLEMENT|change|abstract-proposition | 48 | false | true |
| INFINITIVAL_COMPLEMENT|change|infinitival-event | 44 | false | true |

Stay in OBSERVE. Task 4 may author exactly `authoredRows`.
