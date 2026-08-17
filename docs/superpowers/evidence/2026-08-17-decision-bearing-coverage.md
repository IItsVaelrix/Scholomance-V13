# RESULT — Decision-bearing could-fire coverage

SCORE was not run. TEST was not opened. Punctuation semantics were not authored.
Prereg: `2026-08-17-PREREG-decision-bearing-coverage.md`.

- commit `8495daa2103bf5c00ac65360244fbd79aa20e828`
- DEV sentences ≤ 28 tokens: analysed 1824, parsed 585 (32.1%), threw 0
- fingerprints identical on 8/8 replay pairs
- packed cells 138016: competitive 42461, decision-competitive 35558, glue-only competitive 6903
- lift competitors inside those cells 29751 (unary promotions; not missing relations)
- **decisionBearingGroupRate** 24.3% (8648/35558)
- weakDistinguishRate 57.2% (20330/35558) — named-versus-silent; not the milestone
- decisionBearingEdgeCouldFireRate 0.6% (342/57012)
- named-complete on those same interfaces 65.8%
- raw T1 could-fire remains 4.2% on the frozen 2026-08-16 observe census; that is a different denominator

## What the milestone is

`decisionBearingGroupRate` is the share of packed cells that already have two
non-glue structural alternatives **and** have two non-silent, different
semantic factor keys. It is not T1 could-fire. It is not named-versus-silent.

Punctuation absorb is glue. `S+PUNCT` and leftover `SCOMMA+S` are out of the
denominator. Apposition and `FRONTED+S` stay in. Lifts can make a cell
competitive; they are not counted as missing relations.

The 24.3% is the “closer than 4.2% looks” number. Ranking that used named
composition could already hear two different songs in about a quarter of
real competitions. Ranking that used T1 correspondence still could not:
0.6% of those same interfaces could-fire.

The 57.2% weak rate is mostly one named alternative against a silent
competitor. That is not two songs. It is the map of where TRAIN authorship
would actually change a winner.

## Missing decision-bearing interfaces (TRAIN targets, not authored here)

- complement: 7957
- argument: 4157
- clause-attachment: 2868
- apposition: 1999
- modifier: 1219
- unclassified: 1190

Top silent bonds inside those cells:

- `PP+S->S` 2359
- `S+SBAR->S` 2034
- `INV+NP->S` 1311
- `VP+INF->VP` 1305
- `NPCOMMA+NP->NP` 1268
- `SBAR+S->S` 1245
- `NP+PART->NP` 903
- `AUX+NP->INV` 886
- `COP+NP->INV` 886
- `VP+SBAR->VP` 882
- `INV+VP->S` 810
- `NPCOMMA+NP->APPOS` 731
- `VP+PRT->VP` 679
- `N+PROPN->N` 627
- `PROPN+N->N` 592
- `V+INF->VP` 579

Do not fill `S+PUNCT`. The next authorship pass, if any, is TRAIN-only and
is those families: clause attachment, complement, inversion/argument,
infinitival, apposition, particle.

Stay in OBSERVE. This number does not promote SCORE.

Reproduction: `node scripts/decision-bearing-coverage-census.mjs`
