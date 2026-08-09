# Construction Autopsy — `N|N|N` head=0 — 2026-08-08

**Question:** what latent construction family explains why this bond works?

Gain definition: sentence has **no** spanning `S` under base BONDS, **has** spanning
`S` when the candidate is added.

## Yield

| | |
|---|---|
| Material coverage gains | **39** |
| Gains with no direct firing | 0 |
| Direct L+R firings on gains | **81** |


## Purity

`purity = licensed share × family concentration`

| | |
|---|---|
| Licensed share (gold edge present) | 74.1% |
| Concentration (Simpson, licensed families) | 0.352 |
| **Purity** | **0.261** |
| Dominant licensed family | compound (55.0%) |

## Borrowed types

A firing wears a **borrowed type** when both spans are one token wide and reached
their declared type by unary lift alone — nothing bonded inside them. A clausal
bond firing on two bare words is not joining clauses; it is collecting the
imperative `VP→S` lift over dual n/v nouns.

| | |
|---|---|
| Firings on two lift-only spans | 13 |
| **Borrowed share** | **16.0%** |
| left `N` ever carried by a bare atom | yes |
| right `N` ever carried by a bare atom | yes |

> Both sides can be carried by a bare atom, so a low share here is a real
> measurement: the bond is joining constituents that earned their type.


## Family split

| Family | n | % |
|---|---|---|
| compound | 33 | 40.7% |
| juxtaposition-orphan | 20 | 24.7% |
| modifier | 12 | 14.8% |
| other:case | 3 | 3.7% |
| other:advmod | 3 | 3.7% |
| other:obj | 3 | 3.7% |
| other:nsubj | 2 | 2.5% |
| flat-name-orphan | 1 | 1.2% |
| other:obl:unmarked | 1 | 1.2% |
| other:mark | 1 | 1.2% |
| flat-name | 1 | 1.2% |
| nmod | 1 | 1.2% |

## Gold deprels between spans

| deprel | n |
|---|---|
| compound | 33 |
| (none) | 21 |
| amod | 12 |
| case | 3 |
| advmod | 3 |
| obj | 3 |
| nsubj | 2 |
| obl:unmarked | 1 |
| mark | 1 |
| flat | 1 |
| nmod:unmarked | 1 |

## Morphology

| shape | n |
|---|---|
| 1+1|mixedCase|adjacent | 78 |
| 1+1|Properish|adjacent | 3 |

## Refine

Split into 2 construction families (each ≥15%).

- **compound** (41%)
- **juxtaposition-orphan** (25%)

## Examples

**compound**
- They actively excluded State Department Iraq hands like Tom Warrick.
  - A [3-3] «State»
  - B [4-4] «Department»
  - compound B→A Department←State
- They actively excluded State Department Iraq hands like Tom Warrick.
  - A [5-5] «Iraq»
  - B [6-6] «hands»
  - compound B→A hands←Iraq
- Someone in the CPA sat down and thought up ways to stir them up by closing their newspaper and issuing 28 arre
  - A [21-21] «arrest»
  - B [22-22] «warrants»
  - compound B→A warrants←arrest
- you should get a cockerspaniel.
  - A [4-4] «cocker»
  - B [5-5] «spaniel»
  - compound B→A spaniel←cocker

**juxtaposition-orphan**
- Every move Google makes brings this particular future closer.
  - A [1-1] «move»
  - B [2-2] «Google»
  - (no direct gold edge)
- Every move Google makes brings this particular future closer.
  - A [7-7] «future»
  - B [8-8] «closer»
  - (no direct gold edge)
- They actively excluded State Department Iraq hands like Tom Warrick.
  - A [6-6] «hands»
  - B [7-7] «like»
  - (no direct gold edge)
- Someone in the CPA sat down and thought up ways to stir them up by closing their newspaper and issuing 28 arre
  - A [3-3] «CPA»
  - B [4-4] «sat»
  - (no direct gold edge)

**modifier**
- Every move Google makes brings this particular future closer.
  - A [6-6] «particular»
  - B [7-7] «future»
  - amod B→A future←particular
- It was a good opportunity to know about Enron and its finance sector.
  - A [3-3] «good»
  - B [4-4] «opportunity»
  - amod B→A opportunity←good
- If you can check with the other airlines during this period, you may get excellent discount airfare, which may
  - A [16-16] «discount»
  - B [17-17] «airfare»
  - amod B→A airfare←discount
- In exchange for sucking vast amounts of water out of the local land, the mighty corporation promised to bring 
  - A [11-11] «local»
  - B [12-12] «land»
  - amod B→A land←local

**other:case**
- They actively excluded State Department Iraq hands like Tom Warrick.
  - A [7-7] «like»
  - B [8-8] «Tom»
  - case B→A Tom←like
- My cats name is Twinky.
  - A [1-1] «cat»
  - B [2-2] «s»
  - case A→B cat←s
- You should treat all pets like children.
  - A [5-5] «like»
  - B [6-6] «children»
  - case B→A children←like

## Repro

```bash
node scripts/construction-autopsy.mjs N N N 0
```
