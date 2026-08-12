# Osmosis as Equilibrium, Not Novelty

**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`
**Date:** 2026-08-12
**Status:** approved design, not yet implemented

## The correction

> "osmosis should never rate novelty. it should only help arrange the molecules to even
> states. That is what osmosis does, equilibrium." — Vaelrix, 2026-08-12

Osmosis is currently wired into the Semantic Valence Cyclotron as a **scorer**. It carries
15% of `finalScore` and hard-gates every verdict. Both are category errors: osmosis is
transport toward equilibrium, not a judgement of worth.

## Measured evidence that the current wiring is broken

All figures from the DENSITY bank, seed `0x44454e53`, 8000 trials, 256 shortlisted.

| finding | measurement |
|---|---|
| `osmoticNovelty` is a constant | distinct values `[1]` over 256 rows, in **both** banks |
| it inflates every score by a flat amount | contributes `0.15 × 1.0 = 0.1500` to every `finalScore` |
| the `concentration` branch is dead code | `concentrationLimit: 1` (`:389`) vs `concentration = clamp01(energy) ≤ 1` — fires only at exactly 1.0 |
| so everything falls to `baseline_drift` | which then saturates `confidence` at 1.0 |
| the verdict gate cannot fail | `anomalyKind === 'baseline_drift'` (`:721`, `:731`) admits 256/256 |
| concentration is fed a score | `:708` passes `concentration: row.molecule.energy` |

Two related facts that shape the redesign:

- On the shortlist `valenceSatisfaction` is pinned at `1` (distinct values `[1]`) and every
  link has `strength = 1`, so `energy = 0.65 + 0.20·grounding + 0.15·novelty` exactly
  (max |error| 5.5e-7 over 256 rows).
- The equilibration machinery **already exists** as the entropic decay dampener, and was
  disabled (`entropyEnabled: false`) in every experiment run to date.

## Design

### 1. Boundary — unchanged

`evaluateMemoryCellOsmosis` keeps its signature and semantics. Other consumers exist
(`divtube_downloader/scripts/scholomance-bridge.mjs`, `tests/core/immunity/memory-cell-osmosis.test.js`)
and it is a general immune primitive. Only the cyclotron's *use* of it changes.

The entropic decay dampener's transport law is also unchanged:

```
E_effective   = E_intrinsic · exp(−λ · occupancyHeat)
occupancyHeat = α·ln(1 + R_exact) + β·ln(1 + R_family)
```

### 2. Membrane over occupancy

Invert the call so osmosis fires on the branch it was named for:

```js
const crowding = occupancyHeat / (1 + occupancyHeat);   // [0,1)
const osmosis = evaluateMemoryCellOsmosis(prepared.baselineCell, {
  vector: row.vector,
  concentration: crowding,        // crowding, NOT energy
  seed: 42,
});
// anomalyKind === 'concentration'  ->  apply equilibration pressure
```

`membrane.concentrationLimit` becomes the permeability threshold and **replaces the magic
number `entropyActivationHeat: 5`** (`:68`). Osmosis governs *when* flow happens; the
dampener computes *how much*. Neither rates anything.

`concentrationLimit` must sit inside the reachable range of `crowding` — the current `1` is
unreachable by construction. It is derived, not guessed, by this procedure:

1. Run the DENSITY and CLIQUE banks with equilibration off and record the full distribution
   of `crowding` across all trials (not just the shortlist).
2. Set `concentrationLimit` to the value that the observed distribution exceeds in roughly
   the top decile — the point at which a region is genuinely over-concentrated rather than
   merely occupied.
3. Assert the chosen limit is reachable *and* not always exceeded: if `crowding` clears it on
   0% or 100% of trials, the membrane is another check that cannot fail and the run aborts
   before reporting.

### 3. Scoring

```js
const finalScore = clamp01(0.588 * energy + 0.412 * feasibility);
```

`osmoticNovelty` is deleted. `0.588` and `0.412` are `0.50/0.85` and `0.35/0.85` — the
designer's original 50:35 ratio rescaled to the full range. No new judgement is introduced;
the only change is removing a constant.

`osmosis` remains in the candidate output as a **diagnostic field only** — reported, never
scored.

### 4. Verdict predicate

Remove `osmosis.anomalyKind === 'baseline_drift'` from the NUCLEUS predicate (`:721`) and
the HYPOTHESIS predicate (`:731`). It admits 256/256 today, so removing it changes no
current outcome — which is precisely the argument for removing it.

### 5. Recalibration

`DEFAULTS.entropyEnabled` becomes `true` (`:62`). A membrane that is off does nothing.

Every floor is then **re-derived from a measured run**, not carried over. `nucleusScoreFloor:
0.765` is meaningless against the new range: the DENSITY ceiling falls from `0.770834` to
approximately `0.7303` from the reweighting alone (`0.588 × 0.8835 + 0.412 × 0.5117`), and
enabling equilibration will move it again by an amount that must be measured rather than
predicted.

`PB-GATE-REACHABILITY-v1` enforces this. Any floor left above the achievable ceiling yields
`VACUOUS` rather than a false negative.

### 6. Testing

TDD. Each test is watched to fail before implementation.

| test | fails today because |
|---|---|
| osmosis fires on crowding | current call passes energy; `concentration` branch is dead |
| osmosis is silent when sparse | ditto — proves the guard discriminates, not just complains |
| `finalScore` has no osmosis term | two molecules with identical energy+feasibility but different osmosis results must score identically |
| verdict ignores `anomalyKind` | predicate currently reads it |
| **occupancy flattens** | with equilibration on, the shortlist's occupancy distribution must be measurably flatter than with it off |

The last one is the break-on-purpose. Without it we have built a second membrane that does
nothing, which is the failure this whole redesign exists to correct.

## Risks

**All published evidence becomes non-comparable.** The four artefacts regenerated earlier
today (`2026-08-11-super-heavy-nucleus-attack.{md,json}`,
`2026-08-11-architectural-density-control.{md,json}`) must be regenerated again, and their
conclusions may move.

Specific predictions, recorded before the work so they can be wrong:

- The topology result (Δceiling = 0.010502, sd = 0 over 12 seeds) is a **difference**, not a
  level, and is the most likely to survive. Re-measure; do not assume.
- The `inventory-seed` exclusion runs through novelty and feasibility, neither of which this
  change touches. Expect it to persist.
- Crown counts at every size will change, because every floor changes.

## Out of scope

- The mechanism excluding `inventory-seed` and all size-6 molecules remains unidentified.
  Two candidate explanations (grounding, the `seeks: []` source-node role) were refuted by
  measurement on 2026-08-12. This design does not attempt a third.
- No change to `concept-chemistry.js`, which has unrelated uncommitted work in progress.
- No reweighting of `energy`'s four internal terms.
