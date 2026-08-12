# PREREGISTRATION — Does the top nucleus add value?

**Written 2026-08-11 BEFORE looking at any nucleus. The dump was running when this was
written; no nucleus content had been read.**

## Why this needs a preregistration

"The top nucleus looks plausible" is the false-friend trap in its purest form. The
2026-07-31 control already showed this engine rating a cache that does not exist above
every true statement, fluently. A nucleus I read *after* knowing it is the top-ranked one
will look meaningful to me whether or not it is. So the criteria are fixed here first.

## Value requires all three. Any one failing means no value.

**V1 — VALID.** The composition is structurally real: every bond resolves to a licensed
`offers → seeks` port pair in the atom bank, and the chain is connected. Mechanical.

**V2 — NOVEL.** The composition is not already implemented. Measured mechanically: for
each bond `A → B`, does the evidence file of A already reference the evidence file of B
(or vice versa), or do both appear together in any one file? `realizedFraction` = bonds
already present in code / total bonds.

**V3 — DISCRIMINATING.** The top nucleus must SEPARATE FROM CONTROLS on V1+V2. If a
REFUSED candidate or a random licensed molecule scores the same, the ranking carries no
information and there is no discoverability — only emission.

V3 is the whole experiment. V1 and V2 without V3 are decoration.

## Controls (evaluated by the identical mechanical procedure)

- **C1** — a REFUSED candidate from the same run.
- **C2** — randomly assembled licensed molecules of the same size, n ≥ 20.
- **C3** — the nuclei as a group (n = 26) vs C2, so the claim is not resting on one draw.

## Declared predictions

| # | Prediction | I expect |
|---|---|---|
| P1 | Top nucleus passes V1 (all bonds licensed) | **PASS** — the engine only emits licensed bonds, so this is near-tautological and proves little |
| P2 | Top nucleus has HIGH `realizedFraction` — it **rediscovers existing architecture** | **FAILS V2** |
| P3 | Nuclei do not separate from random licensed molecules on `realizedFraction` | **FAILS V3** |

**I predict no value.** Reasoning: `grounding` and `corpusPMI` both reward concepts the
encyclopedia corpus discusses together, and the corpus documents what the repository
ALREADY DOES. An engine tuned to corpus co-occurrence should preferentially surface
compositions that already exist. That is exactly why the v2 repair improved substrate
detection — and it is the same property that would make it a rediscovery engine rather
than a discovery engine.

## What would change my mind

The top nucleus is V1-valid, has a **low** `realizedFraction`, AND the nuclei group
separates from random molecules with the difference in the direction of *less* prior
realization. That combination would mean the ranking finds compositions that are
structurally sound but not yet built — which is discoverability, and would be the first
such result in this repository.

## Committed in advance

1. `realizedFraction` is computed by one function applied identically to nuclei, refused,
   and random molecules. No per-molecule judgement calls.
2. No nucleus will be swapped for "a better example" after seeing results.
3. If the mechanical test is inconclusive, that is reported as inconclusive — not
   supplemented with my own reading of whether the nucleus "sounds right."
4. A nucleus that merely restates existing architecture is a NEGATIVE result and will be
   reported as one, however coherent it reads.
