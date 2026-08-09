# Closure Slice 1 — Terminal Punct Absorb — 2026-08-08

**Campaign:** clause-closure (not bond shopping)  
**Hypothesis:** Missing roots often already have clause/nominal structure; terminal
punct is a seatbelt, not skeleton. Multi-char `!!` / `...` were untyped, so
`S+PUNCT` never fired. Nominal roots need the same absorb on NP.

## Changes

1. **`atomsFor`:** terminal PUNCT atom from `/^[.!?…;:]+$/` (not only single-char).  
2. **Grimoire `np-terminal-punct`:** `NP + PUNCT → NP` head 0, status `grammar`.  
3. Existing **`S + PUNCT → S`** now reaches repeated marks.

No new local content bonds. No COP/AUX regression.

## Dev metrics (packed, before → after)

| Metric | Before (post COP→AUX) | After punct absorb | Δ |
|---|---|---|---|
| Coverage | 21.7% (435/2001) | **22.5% (451/2001)** | **+16 sents** |
| Containment | 10.9% | **11.3%** | +0.4 pp |
| **Root span recall** | 27.0% (540/2001) | **30.6% (613/2001)** | **+73 roots** |
| Contiguous span recall | 75.4% | **76.3%** | +0.9 pp (protected ↑) |
| nsubj span recall | 88.9% | **88.9%** | flat |
| Gold-in-ensemble (scoreable) | 52.2% | **52.7%** | +0.5 pp |

**Protect invariants: held.** Span recall and nsubj did not fall; headship unchanged by construction (no head edits).

## Interpretation

- Root recall moved more than coverage — classic **closure** signature (already-built S/NP finally covers gold root span once fringe absorbs).  
- Multi-char punct was a pure typing hole, not a missing theory of English.  
- Remaining root gaps (~69%) still dominated by partial S + left nominal/matrix fringe — next slices, not more local atoms.

## Tests

136/136 green (compose + packed + grimoire + anatomy).

## Next (still not bond shopping)

From root-closure autopsy: largest remaining classes are **S already built with left fringe** (topic/subject/matrix outside) and **partial fill**. Investigate:

1. Why NP sits left of S without `NP+VP→S` path (type mismatch vs genuine gap)  
2. Projection-through-endocentric for *measurement* of root-with-punct (optional diagnostic)  
3. Only then consider a tightly scoped combination law  

## Repro

```bash
# multi-char + NP+PUNCT in place
node -e "... root span metric ..."
npx vitest run tests/qa/features/constellation-compose*.test.js tests/core/constellation/grimoire.test.js
```
