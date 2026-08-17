# RESULT — Phase 8: complement COMPAT registry (OBSERVE)

OBSERVE-only. SCORE not run. TEST not opened. Forest not touched by this
act. Prereg (frozen before implementation):
`2026-08-17-PREREG-phase-8-complement-compat.md`.
Instrument: `scripts/phase-8-complement-compat-observe.mjs`.
Implementation HEAD: `66c9ee25`.
Census artifacts: `2026-08-17-phase-8-observe.{json,md}`.
3B baseline left untouched: `2026-08-17-compat-waterfall-census.{md,json}`.

**Act verdict: FAIL.** Exact predictors P1–P8 and P11 miss. The DEV
chamber is not the frozen 3B forest. Directional complement instruments
did fire and abstain, but they cannot be scored as a complement-only
movement on this parse. Task 5 is not rolled back in this commit.
SCORE is not licensed.

## Headline (predicted signature vs this run)

Predicted (prereg success signature):

```
relationAvailable        flat
leftValueAvailable       flat
rightValueAvailable      flat
compatMappingAvailable   up   (complement only)
actualCompatFire         up   (complement only)
complement mappingFires  > 0
complement mappingAbstains > 0
forest fingerprints      8/8
TEST                     sealed
SCORE                    off
```

Measured:

```
relationAvailable        down  29,570 → 21,621   NOT flat
leftValueAvailable       down  11,568 → 9,460    NOT flat
rightValueAvailable      down  10,989 → 8,862    NOT flat
compatMappingAvailable   up    946 → 1,735       cannot claim complement-only
actualCompatFire         up    827 → 1,495       cannot claim complement-only
complement mappingFires  666 > 0
complement mappingAbstains 2,550 > 0
forest fingerprints      8/8 (observe vs off)
protection               FAIL parsed 510≠585, eventsMean 68.61896929824562≠77.11677631578948
TEST                     sealed
SCORE                    off
```

Raw integers are the script's `counts` / `funnel` / `complementMapping`
fields, not rate×edges rounding.

## Chamber vs frozen 3B baseline

| Quantity | 3B (`15d34ce8`) | This run (`66c9ee25`) |
|---|---|---|
| analysed / parsed / threw | 1,824 / 585 / 0 | 1,824 / **510** / 0 |
| eventsMean | 77.11677631578948 | **68.61896929824562** |
| fingerprints (observe vs off) | 8/8 | 8/8 |
| decision-bearing edges | 57,012 | **44,634** |
| decision-competitive cells | 35,558 | **21,512** |
| TRAIN analysed | 10,763 | 10,763 |
| testFileOpened / scored | false / false | false / false |

`composePacked` does not import semantic-particles. Observe-vs-off
fingerprints are 8/8, so the complement registry did not change the
forest. `compose-packed.js` in this worktree is byte-identical to
`15d34ce8`. The primary checkout's working tree still has a dirty
`compose-packed.js` (640 lines vs this committed 421). 3A/3B recorded
that their census ran against that in-flight parser. This run used the
committed parser, as the Phase 8 plan required. That is a chamber
mismatch, not a COMPAT side-effect.

## Exact predictors (P1–P13)

Any miss fails the act. Misses are not repaired.

| # | Predicted | Measured | Verdict |
|---|---|---|---|
| P1 | `relationAvailable` = 29,570 | **21,621** | ❌ miss |
| P2 | `leftValueAvailable` = 11,568 | **9,460** | ❌ miss |
| P3 | `rightValueAvailable` = 10,989 | **8,862** | ❌ miss |
| P4 | `namedComplete` = 44,546 | **33,734** | ❌ miss |
| P5 | `silent` = 12,348 | **10,771** | ❌ miss |
| P6 | C1 = 12,466 | **10,900** | ❌ miss |
| P7 | C2 = 22,542 | **17,054** | ❌ miss |
| P8 | non-complement `actualCompatFire` = 827 | **829** | ❌ miss (+2) |
| P9 | `FEATURE_COMPAT` contains 0 rows for the two complement relations | **0 / 36** (live `FEATURE_COMPAT`; no `INFINITIVAL_COMPLEMENT` or `PROPOSITIONAL_COMPLEMENT`) | ✅ exact |
| P10 | complement composition scores ≡ 0 on the 3A pair set | **0** on VP+SBAR, V+SBAR, S+SBAR, SBAR+S, VP+INF, VP+PRT | ✅ exact |
| P11 | 1,824 / 585 / 0 / eventsMean identical / fingerprints 8/8 / TEST sealed / SCORE off | 1,824 / **510** / 0 / **68.61896929824562** / 8/8 / sealed / off | ❌ miss |
| P12 | `EXPERIMENTAL_FEATURE_SCHEMA_VERSION` = `1.2.0` | **1.2.0** | ✅ exact |
| P13 | `actualCompatFire` ≡ (`diagnoseT1Edge` status === `could-fire`) | census `couldFire` = `funnel.actualCompatFire` = **1,495**; unit pin in `compat-waterfall.test.js` holds | ✅ exact |

## Directional predictors (P14–P20)

Complement fire = total fire − non-complement fire = 1,495 − 829 = **666**,
matching `complementMapping.complementMappingFires`. The frozen control
surface of 827 is not this chamber's non-complement fire (829), so P16–P18
cannot be evaluated against the prereg identities.

| # | Predicted | Measured | Verdict |
|---|---|---|---|
| P14 | complement `actualCompatFire` > 0 | **666** (INF 503 + PROP 163) | ✅ floor met on this chamber |
| P15 | `compatMappingAvailable` > 946, increase only on the two complement relations | **1,735** (+789). Chamber shrank; non-complement mapping is not isolated | ❌ cannot decompose |
| P16 | `actualCompatFire` = 827 + complementFires | 827 + 666 = 1,493; measured **1,495** (= 829 + 666) | ❌ miss |
| P17 | C3 = 21,295 − complementFires | 21,295 − 666 = 20,629; measured **15,314** | ❌ miss |
| P18 | C1+C2+C3 = 56,303 − complementFires | 56,303 − 666 = 55,637; measured **43,268** | ❌ miss |
| P19 | `bothNamed` = 15,063 | **11,412** | ❌ miss |
| P20 | `bothT1` ≥ 147, increase only on cells that gained a complement fire | **422** meets the floor; increase (+275) is not attributed | ❌ cannot decompose |

Spillover rule: fire / mapping / C3 movement that cannot be attributed to
an authored complement pair is a falsification. On this parse the global
funnel moved with the forest. Attribution is not available.

## Complement mapping waterfall

On decision-bearing edges whose projected relation is in scope:

| Flag | Count |
|---|---|
| complementEdges / relationExists | 4,799 / 4,799 |
| bothValuesExist | 3,216 |
| mappingExists | 4,799 |
| mappingFires | **666** |
| mappingAbstains | **2,550** |
| firesByRelation.INFINITIVAL_COMPLEMENT | 503 |
| firesByRelation.PROPOSITIONAL_COMPLEMENT | 163 |
| nonComplementFires | 829 |

The table reached real edges and left UNKNOWN / forbidden remainder
visible (`mappingFires` > 0 and `mappingAbstains` > 0). That local
instrument is not enough to pass the act while P1–P13 fail.

## What this run does not license

- No SCORE. Derangement is a later gate and is not opened here.
- No more COMPAT rows. P14 did not miss; the allow-list is not widened.
- No “fix” of the prediction to match this forest.
- No rollback commit in this act. The plan's prescribed response to a
  P1–P13 miss is to roll back Task 5. Rolling back T1 wiring would not
  restore parsed = 585 or eventsMean = 77.11677631578948, because those
  numbers never come from the complement registry.

## Honesty log

1. Preferred raw JSON integers over rate×edges. `counts.couldFire` and
   `funnel.actualCompatFire` are the same 1,495.
2. P8 uses the script's `nonComplementFires` (829), not 1,495 − 827.
3. 3B baseline files were not written. Their git hashes match `HEAD`.
4. TEST path exists on disk and was not read (`testFileOpened: false`).
5. P9 / P10 / P12 rechecked live from modules after the census, not
   inferred from earlier task reports.

Stay in OBSERVE. This result does not license SCORE.
