# Autopsy — Quark Chamber v1 (PB-QUARK-CHAMBER-v1)

**Date:** 2026-08-12
**Status:** HALTED after Falsifier 1 and Falsifier 2. Layers 2–4 were never built.
**Design:** `docs/superpowers/specs/2026-08-12-quark-chamber-design.md` (`6b642359`)
**Plan:** `docs/superpowers/plans/2026-08-12-quark-chamber.md` (`50bb3ba8`, `3fdeb4e3`)
**Prereg:** `docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md` (`edb89de6`)

Both of the chamber's pre-registered empirical claims failed. This document
records what was measured, what it means, and what it does not mean. It is the
cheap outcome the Pressure Field Governor PDR asks for: *"Its most valuable
possible outcome is a clean refutation, which would cost two weeks and a JSONL
writer instead of five phases."* It cost part of a day and four modules.

---

## 1. What was built and verified

| | |
|---|---|
| `quark-chamber/slingshot.js` | Layer 1, depth-1 gravity assist, confinement law. 15 tests. |
| `quark-chamber/configuration-null.js` | Bipartite double-edge swap preserving both marginals. 6 tests. |
| `scripts/quark-authored-recovery.mjs` | Falsifier 2 + its degree-matched null. 3 tests. |
| `scripts/quark-confinement-null.mjs` | Falsifier 1, four pre-registered statistics. 5 tests. |

**Every published measurement in the design reproduced exactly**, which is worth
recording on its own — it means the design's arithmetic was sound and the
refutations below are about the world, not about a coding error.

| statistic | ritual bank (44 atoms, 8 bridges) | full bank (56 atoms, 20 bridges) |
|---|---|---|
| directed licensed port-edges | 98 | 191 |
| depth-1 candidate rules | 89 | 169 |
| witness multiplicity | `{1: 88, 2: 1}` | `{1: 154, 2: 14, 3: 1}` |
| confined (≥2 witnesses) | 1 | 15 |
| distinct compositions | — | 47 |
| `satisfies∘satisfies` | — | 96 of 169 (57%) |

The design's §3.2 claim also replicated: `shuffleOffersSeeks` is **structurally
inert** for topology — candidate counts are identical across 5 seeds — which is
why a new degree-matched null had to be written. That is now pinned by a
regression test.

---

## 2. Falsifier 2 — REFUTED, and the test was unpassable

```
held out             20
recovered             0
recall           0.0000
degree-matched null   0.005 ± 0.0705   z = -0.07   p = 1
```

Depth-1 gravity assist rediscovers **none** of the 20 authored bridges. The null
recovers nothing either, so the statistic cannot even separate them.

### 2.1 The mechanism, measured

A depth-1 slingshot can emit the rule `X → Y` only when some waypoint atom both
**seeks X** and **offers Y**. On the full bank:

- **19 of 20** authored bridges have no such waypoint anywhere.
- The one that does — `diagnostic-event → anomaly-signal`, via
  `subtlety-fingerprint` — has a **single** witness, below the confinement
  threshold of two.

Maximum attainable recall was therefore **1/20 before confinement and 0/20
after — for any implementation whatsoever.**

### 2.2 Why this matters more than the zero

F2's zero is evidence about the bank's topology, not about the generator. **A
check that cannot succeed is as broken an instrument as one that cannot fail**
(`project-checks-that-cannot-fail`), and this one could not succeed. The design
named F2 "the test most likely to kill the design outright"; in fact it was
never able to keep it alive either.

The reading the data does support, offered as a hypothesis rather than a result:
**authored bridges and derived quarks are complementary, not overlapping.** A
human writes a bridge precisely where the graph affords no path — that is *why*
it needed authoring. The slingshot generalises only where a waypoint already
exists. Under that reading the two mechanisms partition the space rather than
competing, and "does the machine rediscover human judgement?" was the wrong
question to have asked.

---

## 3. Falsifier 1 — does not clear its pre-registered threshold

200 degree-matched shuffles, full bank, seed `0x51554152`:

| statistic | null mean ± sd | real | z | p |
|---|---|---|---|---|
| edges | 190.32 ± 1.7081 | 191 | +0.398 | 0.4826 |
| rules | 185.965 ± 9.1216 | 169 | **−1.860** | 0.9801 |
| **confined** | 8 ± 2.9138 | **15** | **+2.402** | **0.0199** |
| maxWaypoints | 2.36 ± 0.52 | 3 | +1.231 | 0.3433 |

**Required: p < 0.0125** (α = 0.05, Bonferroni m = 4, fixed in advance).
**Verdict: FAILS.**

### 3.1 What replicated

The design's predicted signature — *concentration, not yield* — appeared exactly
as described. The real bank emits **fewer** distinct candidates than chance
(169 vs 186, z = −1.86) while emitting nearly **twice as many** independently
witnessed (15 vs 8, z = +2.40). The effect is slightly stronger than the
design's exploratory z = +2.15.

The `rules` statistic running backwards is a **prediction of this design, not an
embarrassment to it** — and it is the reason any future claim that "the
slingshot finds many new rules" is refuted by this table rather than supported
by it.

### 3.2 What did not

Uncorrected, p = 0.0199 would pass at α = 0.05. That is not the test that was
pre-registered. The prereg fixed the statistic list and m = 4 before the run,
and relaxing the correction after seeing the number is the precise manoeuvre a
prereg exists to block — the repo has already paid for that lesson once
(`feedback-no-posthoc-subgroups`: a +5.00pp effect manufactured by dropping a
flat relation).

### 3.3 The honest characterisation

**Underpowered, not absent.** z = +2.40 on a single 56-atom bank is a suggestive
effect that failed a strict correction. It is not a null result, and it should
not be cited as one. It is also not a positive result, and it must not be cited
as one of those either. n = 1 bank.

---

## 4. What is now known, and what is not

**Established:**
- The design's arithmetic reproduces exactly, on two banks.
- `shuffleOffersSeeks` is inert for topology; a degree-matched null is required.
- Depth-1 slingshots cannot reach 19/20 authored bridges, by construction.
- Confinement's direction is as predicted; its significance is not established.

**Not established, and not touched:**
- Whether the relation algebra carries information (F4 — never run).
- Whether a grant can be marked wrong (F3 — never run).
- Whether λ has an admissible bracket at all (never swept).
- **Whether a quark is useful.** Nothing here bears on that. Utility needs 40
  resolved grants through F8a and was always out of scope for v1.

---

## 5. If this is resumed

The blocking problem is **sample size, not mechanism**. §9 of the design already
names it: reaching the F9 floor of `MIN_RESOLVED = 40` requires either depth 2
(132 confined, never run against its own null, and partly mechanical because
more paths mean more chances at ≥2 witnesses) or a bigger bank.

Two things to carry forward:

1. **Re-run F1 unchanged after growing the bank.** The identical statistic list,
   the identical correction, the identical estimator. If the effect is real it
   will clear; if it was noise at n = 1 it will not. Do not re-tune the test.
2. **Do not rebuild F2 as specified.** Any recovery test must hold out bridges
   that the mechanism could in principle find — i.e. bridges with ≥2 mediating
   waypoints — or it measures topology instead of the generator.

---

## 6. Prior work corrected along the way

Task 1 of the plan repaired an unrelated defect found while clearing the
baseline: `relationScore` **rewarded ignorance**. A false friend built from
tokens the corpus had never seen scored 0.9929 against a real correspondence's
0.0053, because `conceptPMI` dropped unattested pairs while flooring
attested-but-never-co-occurring ones. Root cause was substrate-level — only
17.6% of attested pairs co-occur in the test corpus and ~6.5% in the
encyclopedia, so *the floor is the background*. Fixed by taking direction from
the co-occurring pairs alone and confidence from coverage × excess over the
corpus's measured base rate. See `c3e5bd47`. That repair stands on its own
merits and is independent of everything above.
