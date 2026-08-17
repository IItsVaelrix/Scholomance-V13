# PREREG — Phase 8: complement COMPAT registry (OBSERVE-only)

**Frozen before implementation.** Parent prereg:
`2026-08-17-PREREG-semantic-competition-coverage.md`. Design:
`docs/superpowers/specs/2026-08-17-phase-8-complement-compat-design.md`.
Baseline (post-3B, do not overwrite):
`2026-08-17-compat-waterfall-census.{md,json}`.
Prior walls: `2026-08-17-PREREG-phase-3b-complement-lexical.md` (values),
`2026-08-17-phase3a-result.md` (relations).

SCORE is not run. TEST is not opened. The forest is not touched.
No lexical material. No new dimensions. No projection changes.
No composition-score changes. No grammar changes.

## Question

Phase 3A named the complement relations. Phase 3B lit the participants.
When both exist, does a **relation-keyed** COMPAT table (governor class ×
complement class) move only `compatMappingAvailable` and
`actualCompatFire`, fire on complement edges, and abstain on
UNKNOWN / forbidden pairs — without making an illegal parse legal?

One variable at a time: this act authors **complement mappings only**.

## Chamber (inherited, unchanged)

- EWT DEV, sentences ≤ 28 tokens: 1,824 analysed
- Same token limit, same decision-competitive cell definition
- Same glue exclusions, same stable forest
- TRAIN is the only authorship source
- TEST sealed. OBSERVE only. SCORE not licensed by this prereg
- `semanticParticles.mode = 'observe'`
- Provider: `EXPERIMENTAL_FEATURE_PROVIDER` v1.2.0 (lattice unchanged)

## Frozen 3B baseline (digit-identical protection)

From `2026-08-17-compat-waterfall-census.json` at commit `15d34ce8`:

| Quantity | Value |
|---|---|
| analysed / parsed / threw | 1,824 / 585 / 0 |
| eventsMean | 77.11677631578948 |
| fingerprints | 8/8 |
| decision-bearing edges | 57,012 |
| decision-competitive cells | 35,558 |
| relationAvailable | 29,570 |
| leftValueAvailable | 11,568 |
| rightValueAvailable | 10,989 |
| compatMappingAvailable | 946 |
| actualCompatFire | 827 |
| namedComplete | 44,546 |
| silent | 12,348 |
| C1 / C2 / C3 | 12,466 / 22,542 / 21,295 |
| bothNamed / bothT1 | 15,063 / 147 |
| complement-relation fires | 0 / 0 |
| TRAIN analysed | 10,763 |
| testFileOpened / scored | false / false |

Non-complement fires = 827. Complement fires = 0. That split is the
control surface.

## Relations in scope

Exactly two:

- `INFINITIVAL_COMPLEMENT`
- `PROPOSITIONAL_COMPLEMENT`

PARTICLE stays on live `particle-of`. CLAUSAL stays reserved. No new
relation keys.

## Class inventory (closed)

Governor classes, projected from positive `event.*` only:

`cognition`, `communication`, `perception`, `creation`, `state`,
`motion`, `possession`, `change`.

Complement classes, projected from structural 3B features only:

- `infinitival-event` ← `function.infinitival:true`
- `abstract-proposition` ← `entity.abstract:true` on a
  `PROPOSITIONAL_COMPLEMENT` right end

`UNKNOWN` is abstention. `entity.abstract` is never a governor class.
Desire and permission are not in the inventory.

## Allow-list / forbid-list (frozen before the TRAIN census)

May be authored if TRAIN complement decision edges of that pair ≥ 30:

| Relation | Governor class | Complement class |
|---|---|---|
| INFINITIVAL_COMPLEMENT | cognition | infinitival-event |
| INFINITIVAL_COMPLEMENT | communication | infinitival-event |
| INFINITIVAL_COMPLEMENT | creation | infinitival-event |
| INFINITIVAL_COMPLEMENT | perception | infinitival-event |
| INFINITIVAL_COMPLEMENT | state | infinitival-event |
| PROPOSITIONAL_COMPLEMENT | cognition | abstract-proposition |
| PROPOSITIONAL_COMPLEMENT | communication | abstract-proposition |
| PROPOSITIONAL_COMPLEMENT | perception | abstract-proposition |

Forbidden even if TRAIN mass exceeds the cutoff:

| Pair | Reason |
|---|---|
| motion × either | `going to` is constructional |
| possession × either | `have to` is constructional |
| change × either | not a complement attitude |
| state × abstract-proposition | physical-state taking a proposition |
| entity.abstract × anything | S/SBAR structural trap |
| any lemma-specific row | writes answers, not classes |
| any non-complement relation | out of scope |

The forbid-list wins. Weights: 2 (cognition, communication), 1.5
(perception, creation, state). `illegal` is always false.

The TRAIN census writes the intersecting row set into
`docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.md`
**before** T1 is wired. That file freezes the implemented table.

## Frozen predictions

Exact (any miss is a failed implementation):

- **P1** `relationAvailable` = 29,570
- **P2** `leftValueAvailable` = 11,568
- **P3** `rightValueAvailable` = 10,989
- **P4** `namedComplete` = 44,546
- **P5** `silent` = 12,348
- **P6** C1 = 12,466
- **P7** C2 = 22,542
- **P8** non-complement `actualCompatFire` = 827
- **P9** `FEATURE_COMPAT` contains 0 rows for the two complement relations
- **P10** complement composition scores ≡ 0 on the 3A pair set
- **P11** protection: 1,824 / 585 / 0 / eventsMean identical / fingerprints 8/8 / TEST sealed / SCORE off
- **P12** `EXPERIMENTAL_FEATURE_SCHEMA_VERSION` remains `1.2.0`
- **P13** `actualCompatFire` ≡ (`diagnoseT1Edge` status === `could-fire`)

Directional, with floors:

- **P14** complement `actualCompatFire` > 0
- **P15** global `compatMappingAvailable` > 946, and the entire increase
  decomposes onto the two complement relations
- **P16** global `actualCompatFire` = 827 + complementFires
- **P17** C3 = 21,295 − complementFires
- **P18** C1+C2+C3 = 56,303 − complementFires
- **P19** `bothNamed` = 15,063
- **P20** `bothT1` ≥ 147, and any increase decomposes onto cells that
  gained a complement-relation fire

Spillover rule: any fire, mapping, or C3 movement that cannot be
attributed to an authored complement-relation pair is a falsification
and triggers rollback.

## Complement mapping waterfall (new instrument)

On every decision-bearing edge whose projected relation is in scope,
count:

| Flag | Definition |
|---|---|
| `relationExists` | relation ∈ {INFINITIVAL_COMPLEMENT, PROPOSITIONAL_COMPLEMENT} |
| `bothValuesExist` | oriented left and right each have ≥1 known feature |
| `mappingExists` | registry has ≥1 row for that relation |
| `mappingFires` | at least one projected class pair hits a row |
| `mappingAbstains` | bothValuesExist ∧ mappingExists ∧ ¬mappingFires |

Success requires `mappingExists` on the in-scope relations, `mappingFires`
> 0, and `mappingAbstains` > 0 (S-governed / forbidden / UNKNOWN
remainder must remain visible). A table that never reaches an edge
fails even if unit tests pass.

## Derangement control (before any SCORE)

Seed frozen now: `0x50383031`.

Instrument: `derangeFeatureValues(EXPERIMENTAL_FEATURE_PROVIDER, 0x50383031)`.

Preserved: known-count per lemma, relation counts, left/right value
counts, non-complement fires, forest fingerprints.

Must move: complement `mappingFires`, and the set of lemmas / governor
classes that fire.

Verdict uses `efficacyVerdict({ realHits, derangeHits })` from
`exposure-gate.js` over complement `mappingFires` (and, if computed,
complement-cell rank disagreements).

- realHits === derangeHits → `FALSIFIED_OR_NONDISCRIMINATIVE`. Stop.
  Do not open SCORE. Phase 8 has not demonstrated semantics.
- realHits > derangeHits → `REAL_BEATS_CONTROLS`. SCORE may be
  *considered*, under a separate prereg, complement-cells only.

## What this act forbids

- No lexical bags, no new dimensions, no VP/S/SBAR/INF seed edits
- No desire / permission classes
- No clause-head event inheritance onto S / SBAR
- No `FEATURE_COMPAT` rows for complement relations
- No composition score ≠ 0 on complement rules
- No grammar, emission, projection, or orientation changes
- No inversion (Phase 4)
- No TEST, no global T1 SCORE
- No default “both known ⇒ compatible”

## Success criteria

Phase 8 OBSERVE succeeds if P1–P13 hold exactly, P14–P20 hold, the
complement mapping waterfall shows fires and abstentions, and every
movement decomposes onto the two complement relations.

Derangement is a separate gate. Passing OBSERVE does not license SCORE.
Passing derangement does not license global T1. The first SCORE
experiment, if any, is complement-only and needs its own prereg.

## Next expected wall (post-Phase-8)

If the table fires and derangement discriminates: the first
complement-only SCORE (syntax vs composition vs real COMPAT vs
deranged COMPAT) on cells where two legal complement parses compete.

If S-governed propositional edges remain UNKNOWN: that is demand for a
later, separately reviewed clause-head inheritance act — not a license
to treat `entity.abstract` as a predicate class.

Inversion (Phase 4) waits until this vertical slice is closed.
