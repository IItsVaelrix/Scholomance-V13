# DERANGE — Phase 8 complement COMPAT values

SCORE was not opened. TEST was not opened. No TRAIN pass. Chamber is Task 7 DEV ≤ 28.
3B 29570 / 11568 / 10989 are not the preserve-targets.
Prereg: `2026-08-17-PREREG-phase-8-complement-compat.md`.

- commit `b4c07961d7df8403c6a81ca0eb0b932f4ccf4bbf`
- derange seed `0x50383031` (1345859633)
- instrument `derangeFeatureValues(EXPERIMENTAL_FEATURE_PROVIDER, 0x50383031)`
- DEV sentences ≤ 28 tokens: analysed 1824, parsed 510, threw 0
- eventsMean 68.61896929824562
- fingerprints identical on 8/8 observe-vs-off replay pairs
- testFileOpened: false; scored: false; scoreOpened: false
- durationMs: 173298

## Efficacy

- realHits (complement mappingFires): **666**
- derangeHits (complement mappingFires): **0**
- efficacyVerdict({ realHits, derangeHits }): **REAL_BEATS_CONTROLS**
- `derangeHits=0` is consistent with wiping `*::INF` / `*::S` / `*::SBAR` structural lights (`function.infinitival`, `entity.abstract`). This control does not isolate governor-class semantics.
- SCORE is not licensed. Task 7 failed P1–P20; Task 9 stays blocked.
- SCORE not opened. Task 9 was not started.

## Chamber (real arm vs Task 7)

| Quantity | Task 7 | This real arm | Match |
|---|---|---|---|
| analysed | 1824 | 1824 | true |
| parsed | 510 | 510 | true |
| threw | 0 | 0 | true |
| eventsMean | 68.61896929824562 | 68.61896929824562 | true |
| edges | 44634 | 44634 | true |
| relationAvailable | 21621 | 21621 | true |
| leftValueAvailable | 9460 | 9460 | true |
| rightValueAvailable | 8862 | 8862 | true |
| complement mappingFires | 666 | 666 | true |
| complement mappingAbstains | 2550 | 2550 | true |
| fingerprints | 8/8 | 8/8 | true |

## Preserve (real vs deranged)

- known-count per lemma: **held** (10774 pairs, 0 mismatches)
- relationAvailable: real 21621 / deranged 21621 — **held**
- leftValueAvailable: real 9460 / deranged 9460 — **held**
- rightValueAvailable: real 8862 / deranged 8862 — **held**
- forest fingerprints observe-vs-off: **8/8** (derange does not touch the chart)

## Complement mappingFires

- real: 666
- deranged: 0
- delta (deranged − real): -666
- complement mappingAbstains: real 2550 / deranged 3216
- firesByRelation INFINITIVAL_COMPLEMENT: real 503 / deranged 0
- firesByRelation PROPOSITIONAL_COMPLEMENT: real 163 / deranged 0
- paired disagree: 666 (real-only 666, derange-only 0, both 0)

## Non-complement actualCompatFire (reported, not preserved)

Existing T1 FEATURE_COMPAT rows are value-sensitive. Derange may move them.

- real: 829
- deranged: 359
- delta (deranged − real): -470
- moved: true
- paired disagree: 586 (real-only 528, derange-only 58)

## Governor classes / lemmas that fire

- governor classes real: cognition, communication, creation, perception, state
- governor classes deranged: (none)
- governor-class set moved: true
- lemmas fired: real 43 / deranged 0 (set moved: true)
- class pairs real: cognition|abstract-proposition|PROPOSITIONAL_COMPLEMENT, cognition|infinitival-event|INFINITIVAL_COMPLEMENT, communication|abstract-proposition|PROPOSITIONAL_COMPLEMENT, communication|infinitival-event|INFINITIVAL_COMPLEMENT, creation|infinitival-event|INFINITIVAL_COMPLEMENT, perception|abstract-proposition|PROPOSITIONAL_COMPLEMENT, perception|infinitival-event|INFINITIVAL_COMPLEMENT, state|infinitival-event|INFINITIVAL_COMPLEMENT
- class pairs deranged: (none)
- class-pair set moved: true

## Global funnel (real vs deranged)

- relationAvailable: real 21621 / deranged 21621
- leftValueAvailable: real 9460 / deranged 9460
- rightValueAvailable: real 8862 / deranged 8862
- compatMappingAvailable: real 1735 / deranged 1735
- actualCompatFire: real 1495 / deranged 359

Stay in OBSERVE. This census does not promote SCORE.

Reproduction: `node scripts/phase-8-complement-compat-derange.mjs`
