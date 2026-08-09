# Head Declaration — Result — 2026-08-08

**Status:** final — measurement banked against the pre-work prediction.
**Spec:** [`docs/superpowers/specs/2026-08-08-head-declaring-bonds-design.md`](../specs/2026-08-08-head-declaring-bonds-design.md)
**Plan:** [`docs/superpowers/plans/2026-08-08-head-declaring-bonds.md`](../plans/2026-08-08-head-declaring-bonds.md)

Change: every bond declares its head; `headOf` and `headsOf` follow it; the
`DET` exception deleted. Grammar otherwise unchanged — no bond added, removed,
or retyped.

## The prediction, recorded before the work

Ceiling of 159/233 (68%) of scored parses, against 16.3% before.
The previous prediction (punctuation to ~32%) landed at 21.7%, over-shooting by
about 1.5x, so meaningfully less than the ceiling was expected here too.

## Actual

| | before | after |
|---|---|---|
| dev coverage | 21.7% | 21.7% |
| dev containment | 5.2% | 10.9% |
| test coverage | 21.9% | 21.9% |
| test containment | 5.9% | 11.4% |

Wrongness breakdown, dev (before → after):

| bucket | before | after |
|---|---|---|
| correct | 38 (16.3%) | 130 (55.8%) |
| subject right, VERB wrong | 108 (46.4%) | 12 (5.2%) |
| subject constituent NOT BUILT | 4 (1.7%) | 3 (1.3%) |
| built, head taken from inside | 13 (5.6%) | 4 (1.7%) |
| built, different span won | 70 (30.0%) | 84 (36.1%) |

**The prediction under-shot its own ceiling, as expected, and by a smaller
margin than the last one.** 130/233 = 55.8% correct, against a stated ceiling
of 159/233 = 68%. That reaches 130/159 = 81.8% of the ceiling — the ceiling
over-predicted the actual result by a factor of 68/55.8 ≈ 1.22x.

Compare that to the punctuation prediction this note was calibrated against:
predicted ~32% coverage, landed at 21.7%, an over-shoot factor of
32/21.7 ≈ 1.47x (rounded to "about 1.5x" at the time). This prediction's
over-shoot factor (1.22x) is smaller than that one's (1.47x). The estimator is
becoming **more trustworthy**: it is not just correctly signed (predicting
under-shoot and getting under-shoot) but its margin of error on the ceiling is
shrinking release over release. Two data points is not a trend line, but it is
one more point in the right direction, and the discipline of writing the note
before the work — "expect meaningfully less than the ceiling" — is what let
this be scored as a hit rather than rationalized after the fact.

**Coverage did not move**, exactly as required: 21.7% dev / 21.9% test before
and after, both splits, to the decimal place already reported at the top of
this document from Step 1. This is not a null result — it is a passed control.
Coverage is `a spanning S exists`, a property of which bonds fire, not of
which child a bond calls its head. This change touched only head selection
inside bonds that were already firing, so coverage had no channel through
which to move. If it had moved, that would mean the head-declaration change
had reached into grammar/lexicon territory it was not scoped to touch, and the
result would need to be treated as suspect rather than banked. It did not
move. Containment, which does depend on head selection, roughly doubled on
both splits (dev 5.2%→10.9%, test 5.9%→11.4%) — the change acted exactly on
the mechanism it targeted and nowhere else.

## What is left

`built, different span won` is now the dominant bucket at 84/233 = 36.1% of
scored dev sentences, up from 70/233 = 30.0% before. It grew in absolute count
(70 → 84) even though the fixed cases moved almost entirely out of `subject
right, VERB wrong` (108 → 12) and into `correct` (38 → 130): sentences whose
subject span was already right and whose only defect was picking the wrong
head *inside* the VERB bond now resolve correctly, but a chunk of the
sentences that used to fail on "wrong verb head" fail now instead on "wrong
span altogether" — the right constituent was never built, or a competing span
outranked it before head-declaration ever got a vote. Head declaration cannot
touch that: it decides which child of an already-chosen bond is the head, not
which of several candidate bonds/spans should have been chosen over another
in the first place.

This confirms what the plan called out as out of scope going in: the 30%
(now 36.1%) selection bucket is the next problem, and it is not solvable by
another head rule. It needs a **selection principle** — some way to rank or
prune competing spans/bonds before projection, distinct from the head-of-a-
bond question this change answered. `built, head taken from inside` — the
bucket that measures a genuinely remaining head-extraction bug — is down to
4 (1.7%), small enough that further head-rule work is now low-yield; the
generalized-punctuation-descent idea noted as out of scope for this task
(`FRONTED + S -> S`, `PP + S -> S`, `ADV + S -> S`, coordination bonds) is a
plausible next lever on the selection bucket precisely because those are span-
selection sites, not head-of-bond sites, and should get its own before/after
rather than being folded into this measurement.
