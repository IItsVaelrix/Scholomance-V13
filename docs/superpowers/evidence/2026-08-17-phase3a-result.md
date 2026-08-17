# RESULT — Phase 3A: complement ontology, relation projection only

**Date:** 2026-08-17 · **Instrument:** `scripts/compat-waterfall-census.mjs` (unchanged) ·
**Prereg:** `2026-08-17-PREREG-semantic-competition-coverage.md` ·
**Predictions file:** `2026-08-17-phase3a-predictions.md` (written BEFORE this rerun)

SCORE was not run. TEST was not opened. **No COMPAT rows authored. No
lexical material added.** Phase 3A authored exactly two things: a
relation projection (T1 stage 1) and composition naming rules for the
seven census bond shapes. The census script's stock header line "no
relations authored" predates this phase and is amended here: relations
were authored; mappings and lexicon were not.

## What was authored

| Shape | Rule named | Relation projected |
|---|---|---|
| VP+SBAR→VP, V+SBAR→VP, S+SBAR→S, SBAR+S→S | `propositional-complement` | `PROPOSITIONAL_COMPLEMENT` |
| VP+INF→VP, V+INF→VP | `infinitival-complement` | `INFINITIVAL_COMPLEMENT` |
| VP+PRT→VP, V+PRT→VP | `particle-complement` | kept live `particle-of` (authored mappings exist; re-keying could delete fires) |

CLAUSAL is declared in the ontology and projected nowhere. ControlRelation
declared, never filled. Every complement reading scores exactly 0
(no-evidence law, pinned by tests).

## Protection invariants — BIT-IDENTICAL to the frozen baseline

analysed 1,824 · parsed 585 · threw 0 · eventsMean 77.11677631578948 ·
fingerprints 8/8 · edges 57,012 · cells 35,558 · TRAIN pass 10,763.
TEST sealed (`testFileOpened: false`), SCORE off (`scored: false`).

**Worktree honesty note:** the census ran on a worktree containing other
agents' uncommitted in-flight changes (compose-packed.js, grimoire
families). The protection block reproduced the frozen baseline exactly,
proving those changes chamber-neutral. My Phase 3A changes were likewise
uncommitted at run time (report `commit` field reads the last commit
74e30d33); this document is committed together with them.

## Waterfall law accounting — declared vs measured

| Stage / metric | Baseline | Predicted | Measured | Verdict |
|---|---|---|---|---|
| relationAvailable | 40.7% | ↑ ~50–53% | **51.9%** (29,570) | ✅ designed movement, at predicted bound |
| leftValueAvailable | 12.3% | small ↑ or flat | **12.8%** (7,305) | incidental exposure, not authorship |
| rightValueAvailable | 3.5% | small ↑ or flat | **3.5%** (1,967) | flat |
| compatMappingAvailable | 0.68% | flat | **0.68%** (390) | ✅ flat by design |
| actualCompatFire | 342 | exactly 342 | **342** | ✅ invariant held |
| namedCompleteRate | 65.8% | ↑ | **78.1%** (44,546) | ✅ crosses the 75% gate proposal |
| silentCompetitorRate | 34.0% | ↓ | **21.7%** (12,350) | ✅ inside the ≤35% gate proposal |
| bothAlternativesNamedRate | 35.2% | ↑ marked | **42.4%** (15,063) | ✅ named-vs-silent → named-vs-named |
| t1DecisionCouldFireRate | 0.60% | 0.60% | **0.60%** | ✅ identical to 17 digits |
| bothAlternativesT1Rate | 0.24% | unchanged | **0.24%** | ✅ |

Every declared movement occurred; no undeclared movement occurred.

## Silence motion — attributed by track, never blurred

Total silence exactly preserved: **56,786 = 56,786**. Pure
reclassification; no edge created, deleted, or hidden.

| Class | Owner track | Baseline | Now | Δ | Reading |
|---|---|---|---|---|---|
| C1 composition-missing | composition (THIS act) | 19,506 | 12,466 | **−7,040** | the compositional gain of Phase 3A |
| C2 lexical-missing | lexical-semantic (Phase 3B) | 22,024 | 27,777 | **+5,753** | newly named edges whose governor/complement lemmas are dark. NOT a compositional gain — it is demand |
| C3 feature-missing | feature/COMPAT substrate (Track B) | 15,256 | 16,543 | **+1,287** | named-complete but T1-dark, incl. new relations with zero mappings. Demand, not gain |

## Bond table: the seven shapes left the top-24 entirely

Baseline: S+SBAR (322 cells), VP+SBAR (272), VP+INF (247), SBAR+S (186),
V+SBAR (159), VP+PRT (156), V+INF (154) held six of the top-14 ranks,
6,361 silent edges. **Now: none of the seven appears in the top-24.**
Residuals exist only below the cutoff (e.g. COP+SBAR 14 cells, COP+INF 1
— copular governors outside the bounded ontology, honest remainder).

Named-alternative counts rose on the NEXT families (PP+S 263→502,
INV+NP 188→277, INV+VP 176→245, FRONTED+S 231→295): their competing
siblings just became named. Phase 3A pre-loaded the two-sided condition
for phases 4–6.

## Gates (frozen proposals; this run measures, it does not gate)

| Gate proposal | Status |
|---|---|
| silentCompetitorRate ≤ 35% | **MET** (21.7%) |
| namedCompleteRate ≥ 75% | **MET** (78.1%) |
| forestFingerprintMismatchCount = 0 | **MET** |
| throws = 0 | **MET** |
| decisionBearingGroupRate ≥ 40% | not measured here (decision-bearing census is a separate instrument; rerun recommended before the next authorship act) |
| t1DecisionCouldFireRate ≥ 10% | not met (0.60%) — Track B territory |
| bothAlternativesT1Rate ≥ 5% | not met (0.24%) — Track B territory |

## What the reactor says next (Phase 3B demand, from THIS run)

1. **Right-end values are the driest stage** (3.5%): complement head
   lemmas (SBAR/S/INF children) have almost no lit features. This is the
   demand-driven lexical growth target — TRAIN-only, keyed by the new
   relations.
2. **Mapping stage holds 390 edges, all on old relations.** The two new
   relations reach stage ≤3 and stop: zero authored rows. Phase 8's
   relation-keyed registry (INFINITIVAL_COMPLEMENT → governorClass ×
   eventClass, PROPOSITIONAL_COMPLEMENT → predicateClass ×
   propositionClass…) is the next structural need — but lexical values
   must exist first or the rows cannot fire.
3. **New top silent bonds** are exactly roadmap phases 4–6: inversion
   (INV/AUX/COP families, ~4,757 silent edges, and AUX/COP+NP→INV has
   ZERO named alternates — inversion semantics must be authored before
   those cells can ever be two-sided), clause attachment (PP+S 2,359,
   FRONTED+S 509), apposition (NPCOMMA+NP 1,999 across two result types).

## Tests

143/143 in `tests/core/constellation/semantic-particles/` (19 new in
`complement-ontology.test.js`), including: full pre-3A projection
regression table, the no-evidence law (score ≡ 0), PARTICLE non-re-keying,
fire invariance, bondFamily non-drift, and forest identity.

Stay in OBSERVE. Phase 3B (lexical completion demanded by these
relations) is a separate, TRAIN-only, reviewed act.
