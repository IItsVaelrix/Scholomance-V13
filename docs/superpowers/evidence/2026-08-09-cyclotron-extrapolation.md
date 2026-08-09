# Cyclotron Extrapolation Simulation — 2026-08-09

**Question:** What new grammatical elements appear when every known law is
extrapolated to every atom we have, and smashed together?
**Method:** Emulate the 83-bond baseline → build the extrapolation
slate (projection sweep + host-adjunct grid + named new elements) → blind
DEV/TEST reactor with a purity gate calibrated by 24 shuffled
controls, reported under **two gate runs** (designed bar; volume-qualified bar)
→ nuclei for human Grimoire review.

## Beamline

```
known laws (83 BONDS, emulated baseline)
    → extrapolation slate
        1. projection sweep — every licensed law × every observed atom
        2. host-adjunct grid — modify-preserve schema generalization
        3. new elements — named constructions with no existing instance
    → fireability → DEV protect floors → gain → purity vs control bar
    → TEST holdout (blind)
    → dead-end hazard check
    → nuclei (NOT auto-merged)
```

## Headline result

**0 nuclei synthesized.** The generic law space is saturated (the projection
sweep found nothing new), and every extrapolated element was refused by the
purity gate under both gate runs. The strongest signal — `TO|NP|PP`, the
prepositional-`to` element — cleared the protect floors with DEV +29 coverage /
+12 ensemble and 90.3% licensed firings, but its purity (0.730) sits below the
volume-qualified control bar (0.901): its firings include the
infinitival-`to` isomer, fed by dual-POS atom debt. It is refused, and the
autopsy names exactly what would have to change to re-enter. See § Strongest
refused signal.

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | 24.5% (490) | 24.2% (502) |
| Root | 712 | 730 |
| Ensemble | 209 | 186 |
| Span / nsubj | 77.75% / 92.21% | 77.09% / 92.61% |
| Events̄ | 85.2 | 79.4 |

## The extrapolation slate

**Projection sweep** (every PAIR_OPERATIONS affinity × licensed result, over
the 42-type observed inventory, minus existing BONDS, minus the
blocklist, minus already-measured): **0 hits — the generic law space is
saturated.** Every remaining derivable law is either already a bond, was
measured at this exact baseline by the hint simulation, or is a deprecated
construction. New elements can only come from named constructions now.

**Host-adjunct grid + new elements reacted:** 11 singles.
**Coordination closure pairs:** 2 (INF, SBAR — phrase types never bridged).

## Carried forward (already measured at this exact baseline)

30 verdicts from the 2026-08-08 hint
simulation were measured against this identical BONDS state (DEV cov 490
/ TEST cov 502) and are cited, not re-reacted — the reactor is
deterministic, so re-running them would reproduce the same numbers. Source:
`2026-08-08-hint-grammar-simulation.md`.

## DEV funnel (singles)

| Candidate | h | Run 1 fate | Run 2 fate | Δcov | Δroot | Δens | firings | licensed | conc | purity |
|---|---|---|---|---|---|---|---|---|---|---|
| `ADJ|ADV|ADJ` | 0 | GAIN-IMPURE | LOW-VOLUME | 1 | 1 | 0 | 1 | 0.0% | 0.000 | 0.000 |
| `ADJ|PP|ADJ` | 0 | GAIN-IMPURE | LOW-VOLUME | 2 | 3 | 2 | 3 | 33.3% | 1.000 | 0.333 |
| `ADJ|PROPN|N` | 1 | NO-GAIN | NO-GAIN | 0 | 0 | 0 | — | — | — | — |
| `ADV|PP|PP` | 1 | NO-FIRINGS | LOW-VOLUME | 0 | 2 | 0 | 0 | n/a | n/a | n/a |
| `DET|ADJ|NP` | 1 | GAIN-IMPURE | GAIN-IMPURE | 4 | 4 | 2 | 8 | 12.5% | 1.000 | 0.125 |
| `INF|ADV|INF` | 0 | NO-GAIN | NO-GAIN | 0 | 0 | 0 | — | — | — | — |
| `INF|PP|INF` | 0 | NO-GAIN | NO-GAIN | 0 | 0 | 0 | — | — | — | — |
| `NP|ADJ|NP` | 0 | GAIN-IMPURE | GAIN-IMPURE | 14 | 15 | 5 | 19 | 57.9% | 0.174 | 0.100 |
| `NP|ADV|NP` | 0 | GAIN-IMPURE | LOW-VOLUME | 2 | 2 | 0 | 2 | 50.0% | 1.000 | 0.500 |
| `NP|TO|NP` | 0 | GAIN-IMPURE | GAIN-IMPURE | 5 | 3 | 0 | 5 | 20.0% | 1.000 | 0.200 |
| `TO|NP|PP` | 1 | GAIN-IMPURE | GAIN-IMPURE | 29 | 29 | 12 | 31 | 90.3% | 0.809 | 0.730 |

## Control arm (24 shuffled bonds, seed 20260809)

| Control | Firings | Purity | Qualifies (≥5) |
|---|---|---|---|
| `RELC|NP|THAN` | 2 | 1.000 | no |
| `PRON|INV|PROPN` | 24 | 0.920 | yes |
| `N|PRT|RELC` | 1 | 1.000 | no |
| `PP|ADV|NP` | 1 | 0.000 | no |
| `SUB|PRON|COP` | 3 | 0.000 | no |
| `APPOS|CONJ|FRONTED` | 1 | 0.000 | no |
| `PRONACC|S|AUX` | 27 | 0.541 | yes |
| `INF|PART|VP` | 1 | 1.000 | no |

Controls gaining but unscored/zero-firing: 0.
Controls not gaining: 16.

**Run 1 bar:** p95 of 8 scored controls = **1.000**.
**Run 2 bar:** p95 of 2 volume-qualified controls = **0.901**.

| Gate | Candidates | Controls |
|---|---|---|
| gain-only (protect + any metric up) | 8/11 (73%) | 8/24 (33%) |
| Run 1: gain + purity > bar | 0/11 | 0/24 |
| Run 2: gain + purity > volume-qualified bar | 0/11 | 1/24 |

### Gate flaw found by the beam (recorded, not rescued)

Run 1's bar was pinned at 1.000 by three controls that fired **1–2
times**. Purity at that volume is vacuous: Simpson concentration is degenerate
for n<3, and licensed share at n=1 is 0/1 — a single lucky firing sets the bar
where nothing at production volume can follow. This is the same shape of
vacuity the autopsy module already polices for heads ("a number that cannot
fail is not evidence"). Run 2's volume qualification (firings ≥ 5,
applied symmetrically to both arms) is the correction. **The verdict on every
candidate is the same under both runs** — the correction changed no outcome,
which is what makes the correction honest instead of a rescue.

A second, subtler finding: the top volume-qualified control,
`PRON|INV|PROPN` (0.920, 24 firings), is 100% licensed — but its
firings sit on genuine **subject seams** (PRON left of a COP/AUX+NP inversion
span: "they|are all bark|", "you|have a good|"), i.e. a nonsense result type
scoring on a real grammatical adjacency. Purity measures seam licensing, not
construction sense. Certification therefore requires purity **and** family
autopsy **and** human review — purity alone can never promote. (This is the
existing house rule, now with a measured reason.)

## Pairs (bridge + completion collided together)

| Pair | Fate | Δcov | Δroot | Δens |
|---|---|---|---|---|
| `CONJ|INF|CONJINF + INF|CONJINF|INF` | NO-GAIN | 0 | 0 | 0 |
| `CONJ|SBAR|CONJSBAR + SBAR|CONJSBAR|SBAR` | NO-GAIN | 0 | 0 | 0 |

INF and SBAR coordination adds nothing: the bottleneck for those types is
elsewhere (their complements do not reach the chart in the first place).

## TEST holdout

**No trial was certified by either gate run — the holdout magnet had nothing to bend.** This is a result, not an error: the beam produced signals, the detector refused all of them.

## Informational TEST sweep — refused candidates, NOT promotion paths

Volume-qualified candidates refused by the purity bar, measured on blind data
so the refusal's shape is known. Nothing here may be promoted without re-entry
through the gate.

| Candidate | DEV purity | TEST floors | Root | Ensemble | Coverage |
|---|---|---|---|---|---|
| `TO|NP|PP` | 0.730 | hold | 730→774 | 186→211 | 502→542 |
| `NP|TO|NP` | 0.200 | hold | 730→733 | 186→186 | 502→506 |
| `DET|ADJ|NP` | 0.125 | hold | 730→735 | 186→190 | 502→507 |
| `NP|ADJ|NP` | 0.100 | hold | 730→745 | 186→188 | 502→514 |

## Strongest refused signal — `TO|NP|PP` (element:to-preposition)

The preposition `to` emits **only** the TO atom (never P), so "to the store"
has no case-wrap path: 107 `TO+NP` and 157 `S+TO` unparsed adjacencies on DEV —
the 5th and 10th largest gaps on the board. The proposed element mirrors
`P|NP|PP` (UD case, head on the nominal).

| | |
|---|---|
| DEV | cov +29, root +29, ens +12, span +0.86pp — protect floors hold |
| TEST (informational) | cov 502→542, root 730→774, ens 186→211 |
| Autopsy | 31 firings, 90.3% licensed, dominant family **other:case 89.3%** |
| Purity | 0.730 — below Run-1 bar (1.000) and Run-2 bar (0.901) |

**Why the 9.7% unlicensed share exists:** the autopsy's `other:mark` family
("to reach", "to tan") is the infinitival-`to` isomer — and it fires because
dual n+v verbs emit an `N` atom that lifts `N→NP`, so a *verb* presents as TO's
object. That is the same atom-typing debt the compound-family split documented
(amod/nummod firings under `N+N`). The construction itself is 89.3% real
`case` edges: "Talk to you later", "going to happy hour", "in response to the
publication".

**Re-entry path (not taken here — requires law/lexicon changes):**
1. Atom hygiene: dual n+v tokens must not lift N→NP when a verb reading is in
   play (same fix class as compound-nn's closed-class gate).
2. Re-react `TO|NP|PP` after hygiene; the `mark` family should starve,
   concentration should rise, and the purity verdict is then an honest number.
3. Until then the element is **refused** — the same verdict path as raw
   `NP+NP`, for the same reason, with the same split-then-gate remedy.

## Synthesized nuclei

**None.** Every candidate was refused by the gate under both runs. The honest output of this cyclotron pass is a catalogue of refusals with reasons — and one element (`TO|NP|PP`) with a named, testable re-entry path.

## Repro

```bash
node scripts/cyclotron-extrapolation-simulation.mjs
```
