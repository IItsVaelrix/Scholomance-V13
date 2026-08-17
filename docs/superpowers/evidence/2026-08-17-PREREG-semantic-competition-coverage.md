# PREREGISTRATION — Semantic competition coverage program

**Written 2026-08-17, BEFORE the waterfall census is run and BEFORE any
new composition or COMPAT authorship.** SCORE is not run. TEST is not
opened. The forest is not touched. No emission changes.

This prereg freezes the chamber, the metrics, the gate proposals, the
waterfall stage labels, and the silence taxonomy for the
coverage-and-competition program. Any later authorship of relations or
COMPAT rows is TRAIN-only and a separate reviewed act.

## Question

For real ambiguous competitions, can both alternatives be made
semantically describable enough that ranking compares meaning against
meaning — not meaning against silence?

Two parallel tracks, measured separately, not combined into one score:

- **Track A — named composition coverage.** Eliminate silent semantic
  competitors in the high-mass compositional families.
- **Track B — T1 correspondence coverage.** Make FEATURE_COMPAT
  actually fire across those same families.

## Chamber (frozen)

Identical to the 2026-08-17 decision-bearing census:

- EWT DEV, sentences ≤ 28 tokens (1,824 analysed)
- `semanticParticles.mode = 'observe'`
- glue exclusions: either child `PUNCT`/`COMMA`, leftover `SCOMMA+S→S`
- apposition (`NPCOMMA+NP`) and `FRONTED+S` remain decision-bearing
- lifts are competitors but never missing relations
- stable forest: fingerprints identical on 8 replay pairs, throws = 0
- TRAIN is readable for census frequencies and is the ONLY future
  authorship source; TEST remains sealed; gold trees are not used for
  bond-frequency ranking (gold-independent)

## Frozen metrics

| Name | Definition |
|---|---|
| `decisionBearingGroupRate` | Strongly distinguishable decision-competitive cells / decision-competitive cells. (Frozen reference: 24.3%.) |
| `weakDistinguishRate` | Same denominator; factor keys differ including named-versus-silent. Not the milestone. |
| `silentCompetitorRate` | Silent decision-bearing edges / decision-bearing edges. Silent = not (named AND complete) AND no T1 could-fire. |
| `t1DecisionCouldFireRate` | T1 could-fire / decision-bearing edges. Identical denominator to `decisionBearingEdgeCouldFireRate`. (Frozen reference: 0.6%.) |
| `namedCompleteRate` | Named AND complete / decision-bearing edges. (Frozen reference: 65.8%.) |
| `bothAlternativesNamedRate` | Decision-competitive cells with ≥2 named-complete non-glue alternatives / decision-competitive cells. |
| `bothAlternativesT1Rate` | Decision-competitive cells with ≥2 could-fire non-glue alternatives / decision-competitive cells. |
| `filledStableRootRate` | Cited from the frozen 2026-08-16 observe census: 14.5%. Not recomputed in this chamber. |
| `forestFingerprintMismatchCount` | Replay pairs with differing fingerprints. Must be 0. |
| `throws` | Chart construction exceptions. Must be 0. |

## Proposed milestone gates (proposals, frozen before outcomes)

These are PROPOSED values, frozen now, adjustable only by a later
prereg — never by looking at results:

- `decisionBearingGroupRate >= 40%`
- `silentCompetitorRate <= 35%`
- `namedCompleteRate >= 75%`
- `t1DecisionCouldFireRate >= 10%`
- two-sided T1 competition (`bothAlternativesT1Rate`) `>= 5%`
- `forestFingerprintMismatchCount = 0`
- `throws = 0`

`no-relation <= 50%` is NOT the center of this gate. It is polluted by
structurally valid but semantically irrelevant edges. T1 carries its
own gate and named composition may not carry T1 over the line.

## Waterfall stage labels (frozen before the census)

For every decision-bearing edge, cumulative stages:

1. `relationAvailable` — a coarse relation projects for the type pair.
2. `leftValueAvailable` — the oriented left end has ≥1 lit feature.
3. `rightValueAvailable` — the oriented right end has ≥1 lit feature.
4. `compatMappingAvailable` — some authored COMPAT row for this
   relation has BOTH required kinds lit on the oriented ends.
5. `actualCompatFire` — an authored row's values also match
   (equivalent to T1 could-fire for this edge).

`stages.actualCompatFire` MUST agree with the frozen
`diagnoseT1Edge` status; disagreement is an instrument bug, not a
finding.

## Silence taxonomy (frozen before the census)

Every decision-bearing edge receives at most one class:

- `C1-composition-missing` — bond uninterpreted OR named but roles
  incomplete. Track A target.
- `C2-lexical-missing` — composition named, but child lexical senses
  unknown. Track A target (lexical starvation).
- `C3-feature-missing` — composition named AND complete, but T1 dark:
  no could-fire. Track B target (the waterfall says which stage is
  starving).
- `C4-intentional-silence` — glue or lift. Structurally valid,
  semantically transparent by design. Never a target.

A rule genuinely semantically transparent stays transparent. Meaning
is not invented to light it up.

## Bond census ranking (frozen)

Silent bonds are ranked by **decision cells affected** (unique packed
cells), then sentences affected, then gold-independent TRAIN bond
frequency — NOT by raw DEV bond frequency. The question is "if this
relation existed, how many genuine competitions become two-sided?"

## Forbidden until the first SCORE tribunal

No pragmatics, no discourse model, no temporal layer, no modal layer,
no T2 resurrection, no T3, no grammar changes, no emission cleanup
mixed into this baseline, no TEST, no generic knownness bonus, no
punctuation semantics, no DEV-authored lexical entries, no "relation"
whose only purpose is increasing coverage.

## QA checklist (every observe rerun)

Forest fingerprint identical · event counts reported · bond
attempts/refusals reported · zero throws · deterministic report ·
null stays null · no unknown serialized as false · lone known feature
scores zero · COMPAT requires an explicit relation · TRAIN is the only
source of new classes · glue excluded from decision coverage · TEST
sealed.

## SCORE license (later, not now)

SCORE opens only when, in one frozen observe run:
coverage (two-sided competitions dense enough) AND mechanism (T1 fires
often enough to be a real treatment) AND control sensitivity (real vs
deranged semantics produce measurably different factor outputs) all
hold, with the forest identical. First SCORE experiment: four arms —
syntax only / +composition / +real T1 / +deranged T1 — forest
identical across all four.

Stay in OBSERVE. This prereg does not promote anything.
