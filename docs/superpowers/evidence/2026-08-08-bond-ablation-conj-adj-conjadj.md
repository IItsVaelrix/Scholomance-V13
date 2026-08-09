# Bond Ablation — −CONJ|ADJ|CONJADJ — 2026-08-08

**Question:** what does an *already promoted* law contribute on its own?

The gap and hint reactors only ask the additive question. A bond promoted inside
a batch is never asked the subtractive one, so a bond with no individual effect
rides in on the batch's aggregate.

## Structural analysis (no corpus)

| | |
|---|---|
| Bonds | 82 |
| Distinct chart types | 41 |
| Types that cannot reach a spanning `S` | `CONJADJ` |
| Dead-end bonds | **1** |

| Bond | head | Result | Construction | Status |
|---|---|---|---|---|
| `CONJ|ADJ|CONJADJ` | 1 | `CONJADJ` | coord-adj-bridge | scaffold |

A dead-end bond's result type is consumed by no bond and carried to `S` by no
lift chain. It **cannot** change coverage or the answer ensemble. It can still
move span recall and root-built, because those score raw chart cells against gold
contiguous subtrees — a cosmetic hit, not participation in a parse.

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | 24.1% (483) | 23.8% (495) |
| Root | 704 | 717 |
| Ensemble | 203 | 179 |
| Span / nsubj | 77.65% / 92.16% | 77.01% / 92.61% |

## Trials

Deltas are **trial − baseline**. For a `−BOND` row, a delta of `0` means removing
the law changed nothing measurable; a negative delta is what the law was worth.

| Trial | Bonds | Split | Δcov | Δroot | Δens | Δspan | Δnsubj |
|---|---|---|---|---|---|---|---|
| `−CONJ|ADJ|CONJADJ` | 81 | DEV | 0 | -1 | 0 | -0.12pp | 0.00pp |
| | | TEST | 0 | 0 | 0 | -0.08pp | 0.00pp |

## Repro

```bash
node scripts/bond-ablation.mjs
```
