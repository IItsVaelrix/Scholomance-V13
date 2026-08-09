# Hint Nuclei — Mock Batch + Promotion — 2026-08-08

**Question:** Do the 8 held-out hint nuclei, applied **together**, improve coverage /
accuracy / general metrics? If yes, promote into the Grimoire.

## Mock batch (all 8, packed chart)

Baseline BONDS = 73. Trial = 73 + 8 nuclei.

| Split | Coverage | Root | Ensemble | Span | nsubj | Events |
|---|---|---|---|---|---|---|
| DEV base | 22.1% (443) | 671 | 149 | 77.07% | 91.45% | 81 |
| DEV +8 | **24.3% (486)** | **707** | **164** | **77.72%** | **92.21%** | 85 |
| DEV Δ | **+43** | **+36** | **+15** | **+0.64pp** | **+0.76pp** | ×1.05 |
| TEST base | 22.5% (467) | 697 | 136 | 76.52% | 91.59% | 75 |
| TEST +8 | **23.9% (497)** | **719** | **150** | **77.11%** | **92.61%** | 79 |
| TEST Δ | **+30** | **+22** | **+14** | **+0.58pp** | **+1.02pp** | ×1.05 |

Protect floors: **OK** on both splits.  
**Verdict: IMPLEMENT** — gains on coverage, root, ensemble, span, and nsubj.

Nuclei in the mock:

1. `ADJ+S→S` h=1 — adj-front-clause  
2. `DET+NP→NP` h=1 — det residual rewrap  
3. `N+PUNCT→N` h=0 — punct-parity N  
4. `VP+INF→VP` h=0 — host extension  
5. `ADJ+NC→NC` h=1 — adj-nc-stack  
6. `CONJ+ADJ→CONJADJ` h=1 — coord bridge  
7. `NC+PUNCT→NC` h=0 — punct-parity NC  
8. `VP+SBAR→VP` h=0 — host extension  

## Promotion decisions

### Promoted (7)

| Bond | Family | Status |
|---|---|---|
| `ADJ+S→S` | clause | approximation |
| `N+PUNCT→N` | punctuation | grammar |
| `NC+PUNCT→NC` | punctuation | grammar |
| `VP+INF→VP` | verb | approximation |
| `VP+SBAR→VP` | verb | approximation |
| `ADJ+NC→NC` | modifier | approximation |
| `CONJ+ADJ→CONJADJ` | coordination | scaffold |

### Held: `DET+NP→NP`

Packed mock gain was real (+13 DEV cov / +5 TEST), but on the **classic unpaked**
chart every determined NP becomes dual-derived (`DET+N` and `DET+(N→NP)`), so
stable S counts explode:

| Sentence | base stables | +DET+NP |
|---|---|---|
| the man saw a comet | 1 | 4 |
| garden path horse/barn | 1 | 6 |
| PP attach dog/cat/garden | 2 | 20 |

Unit tests that pin garden-path uniqueness and PP-attachment count fail.
**Do not promote until packing (or a non-overlapping residual law) exists.**

## Projection fix (required by ADJ+S)

`projectAnswers` / `projectAnswer` treated every binary S as `[subject, predicate]`.
Fronted adjuncts (`ADV+S`, `PP+S`, **`ADJ+S`**, `FRONTED+S`, …) declare head on the
matrix; positional projection invented adjunct subjects (`old men ran` → subject
`old`).

**Fix:** when the bond head child is itself an `S`, re-project from that matrix
(same spirit as PUNCT absorb). This also repairs pre-existing ADV/PP fronting.

## Live remeasure (7 promoted + projection fix)

Baseline here = 73 bonds **with** the new projection (so ensemble base is higher
than the pre-fix mock baseline).

| Split | Coverage | Root | Ensemble | Span | nsubj | Events |
|---|---|---|---|---|---|---|
| DEV base (73) | 22.1% (443) | 671 | 196 | 77.07% | 91.45% | 81 |
| DEV live (80) | **23.6% (472)** | **694** | **200** | **77.42%** | **91.50%** | 84 |
| DEV Δ | **+29** | **+23** | **+4** | **+0.35pp** | **+0.05pp** | ×1.04 |
| TEST base (73) | 22.5% (467) | 697 | 171 | 76.52% | 91.59% | 75 |
| TEST live (80) | **23.6% (491)** | **714** | **178** | **76.84%** | **91.68%** | 78 |
| TEST Δ | **+24** | **+17** | **+7** | **+0.31pp** | **+0.10pp** | ×1.04 |

Protect floors: **OK**. General gains: **YES** on both splits.

## Attribution — the projection fix, not the nuclei, carried the ensemble

Two 73-bond baselines were measured in this note: the mock's (pre-fix) and the
live remeasure's (post-fix). They are the **same grammar on the same splits**, so
their difference isolates the projection fix exactly.

The isolation is checkable rather than asserted: every non-ensemble metric in the
two rows is identical to the digit — DEV 22.1% (443) / root 671 / span 77.07% /
nsubj 91.45%, TEST 22.5% (467) / root 697 / span 76.52% / nsubj 91.59%. The fix
touches `projectAnswers` only, never chart construction, so nothing but the
answer ensemble could move. Nothing else did.

| Ensemble | Pre-fix, 73 bonds | Post-fix, 73 bonds | Post-fix, 80 bonds |
|---|---|---|---|
| DEV | 149 | **196** | 200 |
| TEST | 136 | **171** | 178 |

| Split | Δ from projection fix | Δ from the 7 promoted bonds | Fix's share |
|---|---|---|---|
| DEV | **+47** | +4 | **92%** |
| TEST | **+35** | +7 | **83%** |

So the headline `+15 ensemble` in the packed mock above is not a property of the
nuclei. The mock's baseline was itself mismeasured — it scored fronted-adjunct
clauses with positional projection, which invented adjunct subjects — and roughly
three quarters of the mock's apparent ensemble gain was the batch partially
compensating for that bug rather than adding answers.

**On coverage and root the nuclei are real** (+29 / +23 DEV, +24 / +17 TEST, and
these baselines are identical pre- and post-fix). On the ensemble they are noise
beside the fix. Report them that way.

Method note: a batch measurement cannot attribute anything to a member. Use
`scripts/bond-ablation.mjs` to ask the subtractive question per bond before
writing a per-bond claim.

## Tests

```text
npx vitest run tests/core/constellation/*.test.js \
  tests/qa/features/constellation-compose*.test.js
# 147 passed
```

## Files touched

- `codex/core/constellation/grimoire/families/{clause,punctuation,verb,modifier,coordination,determination}.js`
- `codex/core/constellation/grimoire/index.js` (ORDER)
- `codex/core/constellation/compose.js` + `compose-packed.js` (matrix-preserving projection)

## Follow-ups

1. Pack classic `compose` (or a residual-only DET law) so `DET+NP` can land.  
2. Complete adj coordination: `ADJ+CONJADJ→ADJ` when it gains.  
3. Optional: clause-level `S+PP` / `S+ADV` postposed (NO-GAIN alone in hint sim).
