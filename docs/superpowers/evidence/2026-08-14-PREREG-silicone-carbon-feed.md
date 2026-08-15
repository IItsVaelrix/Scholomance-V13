# PREREGISTRATION — Silicone graduated into carbon, feeding the Grimoire

**Written 2026-08-14 BEFORE the run. Predictions below are declared, not fitted.**

## The question

The transmutation experiment showed the Cyclotron does not *create* carbon.
Promotion is a human Grimoire act. This run *does that act*, in a sandbox,
and asks what the chart becomes.

If the axiom-shaped silicone constructions (`approximation` status, but
constructive phrase results) are stamped `grammar` and those axioms are what
feed the Grimoire's bond table — what happens to coverage, cascade, and
linguistic-fact claims?

## What "feeding the Grimoire" means here

`ACTIVE_CONSTRUCTIONS` already projects every non-deprecated construction
into `BONDS`, including approximations and scaffolds. A status flip alone
does **not** change the chart. That is P0, and it is a check that the
experiment is not a no-op in disguise.

The feed that *can* change chemistry is a **restricted bond table**:

| Arm | Bond table |
|---|---|
| CARBON-ONLY | the 11 constructions that are carbon today |
| GRADUATED | carbon + the graduation queue (silicone that *becomes* carbon if status → `grammar`) |
| FULL | today's active Grimoire (baseline) |
| OVERFEED | FULL + gap-simulation proposals whose signatures are not already licensed, admitted as if they were grammar axioms |

A fifth measurement is ontology-only and does not touch the chart:

| Arm | Question |
|---|---|
| ONTOLOGY | how many constructions `mayClaimLinguisticFact` before vs after stamping the queue `grammar` |

## Graduation queue (declared, not fitted)

A construction is on the queue iff it is silicone today and carbon after
`status` is rewritten to `grammar`. That is exactly the surprise list from
the transmutation run: constructive phrase builders living under
`approximation` / `scaffold`.

Preservative silicone (`ADJ+N→N`, `NP+PP→NP`, `ADV+S→S`, …) cannot become
carbon by a status stamp. The classifier still sees category preservation.
Those rules are excluded from GRADUATED on purpose.

## Substrate

Hermetic treebank gate: `tests/qa/fixtures/constellation/treebank-gate.{conllu,lexicon.json}`.
Packed parser, `maxTokens` from the frozen baseline. One variable per arm:
the bond table.

Uranium probe (cascade): eight copies of `round` with `n+v+a+r`, same four
tables. Events and recursive-preservative firings.

## Preregistered predictions

| # | Prediction | If wrong |
|---|---|---|
| P0 | ONTOLOGY changes; FULL and a status-only rewrite of FULL produce identical charts | the experiment is confused about what BONDS reads |
| P1 | CARBON-ONLY coverage is materially below FULL (drop ≥ 5pp or ≥ 15 parsed sentences) | carbon axioms already span the gate; silicone is decoration |
| P2 | GRADUATED recovers most but not all of FULL (coverage in (CARBON-ONLY, FULL)) | either preservative silicone is load-bearing (gap stays large) or the queue *is* the productive core (gap vanishes) |
| P3 | OVERFEED coverage ≥ FULL, and mean events and recursive-preservative firings both rise | new axioms are free; the uranium cascade does not care |
| P4 | CARBON-ONLY uranium events < FULL; OVERFEED ≥ FULL | cascade mass lives in silicone / gap proposals, not in the 11 axioms |

## What would count as a reason to actually promote

All of:

- GRADUATED coverage ≥ FULL − 1pp
- OVERFEED does not raise recursive-preservative firings on the uranium probe
- P0 holds

Anything else is a measurement, not a promotion.

## Committed in advance

1. The standing Grimoire is not edited. Tables are sandboxed `options.bonds`.
2. No threshold in `element-phase.js` is moved after seeing yields.
3. If a prediction is wrong, the prediction was wrong.
4. Pairwise chamber from the previous experiment is not re-litigated.

## Repro

    node scripts/silicone-carbon-feed.mjs
