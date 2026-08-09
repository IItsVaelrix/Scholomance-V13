# Construction Autopsy — `PROPN|PROPN|N` head=0 — 2026-08-08

**Question:** what latent construction family explains why this bond works?

Gain definition: sentence has **no** spanning `S` under base BONDS, **has** spanning
`S` when the candidate is added.

## Yield

| | |
|---|---|
| Material coverage gains | **0** |
| Gains with no direct firing | 0 |
| Direct L+R firings on gains | **0** |

> **VACUOUS — `PROPN|PROPN|N` is already in BONDS at head 1.** The
> baseline contains the signature, so the trial chart and the base chart are
> identical and every count below is structurally zero. Proposing a different
> head (0) does not change that: BONDS admits one entry per signature and
> coverage gain asks only whether a spanning `S` exists, which no head choice
> affects. To measure what the active law contributes, ablate it instead:
> `node scripts/bond-ablation.mjs PROPN PROPN N 1`

## Purity

`purity = licensed share × family concentration`

| | |
|---|---|
| Licensed share (gold edge present) | n/a |
| Concentration (Simpson, licensed families) | n/a |
| **Purity** | **n/a** |
| Dominant licensed family | n/a |

## Borrowed types

A firing wears a **borrowed type** when both spans are one token wide and reached
their declared type by unary lift alone — nothing bonded inside them. A clausal
bond firing on two bare words is not joining clauses; it is collecting the
imperative `VP→S` lift over dual n/v nouns.

| | |
|---|---|
| Firings on two lift-only spans | 0 |
| **Borrowed share** | **n/a** |
| left `PROPN` ever carried by a bare atom | no |
| right `PROPN` ever carried by a bare atom | no |

> Both sides can be carried by a bare atom, so a low share here is a real
> measurement: the bond is joining constituents that earned their type.


## Family split

_No rows — the candidate produced no firings on material gains._

## Gold deprels between spans

_No rows — the candidate produced no firings on material gains._

## Morphology

_No rows — the candidate produced no firings on material gains._

## Refine

No clear multi-family split at ≥15%; keep approximation or dig deeper.

_no ≥15% families_

## Examples

_none_

## Repro

```bash
node scripts/construction-autopsy.mjs PROPN PROPN N 0
```
