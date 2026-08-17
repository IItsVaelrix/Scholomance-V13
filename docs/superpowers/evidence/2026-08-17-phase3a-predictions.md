# Phase 3A — Predicted waterfall transitions (frozen BEFORE the rerun)

Commit context: complement ontology + relation projection + composition
naming for S+SBAR, VP+SBAR, V+SBAR, SBAR+S, VP+INF, V+INF (+ VP+PRT /
V+PRT naming only). No COMPAT rows authored. No lexical material added.
PARTICLE keeps the live `particle-of` T1 key.

## Declared stage movements

| Stage / metric | Baseline (8495daa2) | Prediction | Why |
|---|---|---|---|
| `relationAvailable` | 40.7% | **↑ ~50–53%** | Six bond shapes newly project. Upper bound from silent edges alone: +6,361 / 57,012 = +11.2pp; non-silent edges on those bonds also gain relations. This is the DESIGNED movement. |
| `namedCompleteRate` | 65.8% | **↑** (exact value open) | Same shapes now name with Governor+Complement roles; completeness requires both lemmas, so some named edges stay incomplete (C1). |
| `silentCompetitorRate` | 34.0% | **↓** | Newly named-complete edges exit silence. |
| `bothAlternativesNamedRate` | 35.2% | **↑, possibly marked** | Census recorded 1,188 / 622 / 1,081 / 940 named-alternate silent edges on the four biggest shapes — these convert named-vs-silent into named-vs-named. |
| `leftValueAvailable` / `rightValueAvailable` | 12.3% / 3.5% | small ↑ or flat — NOT designed | Phrasal head lemmas sometimes carry lit features; this is exposure, not authorship. |
| `compatMappingAvailable` | 0.68% | **flat** | Zero new COMPAT rows for the new relations. |
| `actualCompatFire` | 342 | **exactly 342** | Fire requires an authored mapping; none added. Cannot rise, must not fall. |
| `t1DecisionCouldFireRate` | 0.60% | **0.60%** | Same reason. |

## Silence reclassification (predicted DIRECTION only)

- C1 (19,506) **↓** — composition now names the six shapes.
- C2 (22,024) **↑** — named-but-lexically-dark edges move here. This is
  the lexical-semantic track's demand signal for Phase 3B. NOT a
  compositional gain; reported separately.
- C3 (15,256) **↑** — named-complete-but-T1-dark edges move here. This
  is the feature/COMPAT substrate track's demand signal. NOT a
  compositional gain; reported separately.

## Protection invariants (must hold exactly)

analysed 1,824 · parsed 585 · threw 0 · eventsMean 77.11677631578948 ·
fingerprints 8/8 · edges 57,012 · cells 35,558 · TEST sealed · SCORE off.

## If any of these fail

- fire count moves → projection touched an authored pathway: revert.
- fingerprints differ → forest leak: revert.
- relationAvailable does not move → projection unreachable from the
  chamber: census before commit, not after.
