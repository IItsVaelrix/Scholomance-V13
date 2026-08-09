# Construction Autopsy — `NP|S|S` head=1 — 2026-08-08

**Question:** what latent construction family explains why this bond works?

Gain definition: sentence has **no** spanning `S` under base BONDS, **has** spanning
`S` when the candidate is added.

## Yield

| | |
|---|---|
| Material coverage gains | **120** |
| Gains with no direct firing | 0 |
| Direct L+R firings on gains | **194** |


## Purity

`purity = licensed share × family concentration`

| | |
|---|---|
| Licensed share (gold edge present) | 76.8% |
| Concentration (Simpson, licensed families) | 0.211 |
| **Purity** | **0.162** |
| Dominant licensed family | other:nsubj (34.9%) |

## Borrowed types

A firing wears a **borrowed type** when both spans are one token wide and reached
their declared type by unary lift alone — nothing bonded inside them. A clausal
bond firing on two bare words is not joining clauses; it is collecting the
imperative `VP→S` lift over dual n/v nouns.

| | |
|---|---|
| Firings on two lift-only spans | 167 |
| **Borrowed share** | **86.1%** |
| left `NP` ever carried by a bare atom | no |
| right `S` ever carried by a bare atom | no |

> **FLOORED — read this share as a description, not a verdict.** Neither
> side's type is emitted by any atom in the sampled spans, so every one-token
> firing is borrowed by construction and this number could not have come out
> low however the grammar behaved. What it still tells you is how far the
> bond's gain rides on single words rather than assembled phrases — compare
> it against other bonds over the same types, never against a lexical bond.


## Family split

| Family | n | % |
|---|---|---|
| other:nsubj | 52 | 26.8% |
| compound | 37 | 19.1% |
| juxtaposition-orphan | 33 | 17.0% |
| modifier | 20 | 10.3% |
| no-direct-gold-link | 11 | 5.7% |
| other:advmod | 9 | 4.6% |
| other:xcomp | 8 | 4.1% |
| other:obj | 6 | 3.1% |
| other:nsubj:pass | 4 | 2.1% |
| list-conj | 3 | 1.5% |
| clausal-mod | 2 | 1.0% |
| other:obl:unmarked | 2 | 1.0% |
| other:cop | 1 | 0.5% |
| flat-name-orphan | 1 | 0.5% |
| other:aux:pass | 1 | 0.5% |
| other:punct | 1 | 0.5% |
| other:mark | 1 | 0.5% |
| nmod | 1 | 0.5% |
| other:case | 1 | 0.5% |

## Gold deprels between spans

| deprel | n |
|---|---|
| nsubj | 52 |
| (none) | 45 |
| compound | 34 |
| amod | 18 |
| advmod | 9 |
| xcomp | 8 |
| obj | 6 |
| nsubj:pass | 4 |
| compound:prt | 3 |
| conj | 3 |
| acl | 2 |
| obl:unmarked | 2 |

## Morphology

| shape | n |
|---|---|
| 1+1|mixedCase|adjacent | 160 |
| multi|mixedCase|adjacent | 27 |
| 1+1|Properish|adjacent | 7 |

## Refine

Split into 3 construction families (each ≥15%).

- **other:nsubj** (27%)
- **compound** (19%)
- **juxtaposition-orphan** (17%)

## Examples

**other:nsubj**
- Today's incident proves that Sharon has lost his patience and his hope in peace.
  - A [2-2] «incident»
  - B [3-3] «proves»
  - nsubj B→A proves←incident
- Every move Google makes brings this particular future closer.
  - A [2-2] «Google»
  - B [3-3] «makes»
  - nsubj B→A makes←Google
- Malach, What you say makes sense.
  - A [3-3] «you»
  - B [4-4] «say»
  - nsubj B→A say←you
- Where it risks fighting dual Sunni Arab and Shiite insurgencies simultaneously, at a time when US troops are r
  - A [1-1] «it»
  - B [2-2] «risks»
  - nsubj B→A risks←it

**compound**
- The hottest item on Christmas wish lists this year is nuclear weapons.
  - A [5-5] «wish»
  - B [6-6] «lists»
  - compound B→A lists←wish
- It's this sort of enlightened self interest that keeps large open source projects alive.
  - A [6-6] «self»
  - B [7-7] «interest»
  - compound B→A interest←self
- It's this sort of enlightened self interest that keeps large open source projects alive.
  - A [12-12] «source»
  - B [13-13] «projects»
  - compound B→A projects←source
- Where it risks fighting dual Sunni Arab and Shiite insurgencies simultaneously, at a time when US troops are r
  - A [16-16] «US»
  - B [17-17] «troops»
  - compound B→A troops←US

**juxtaposition-orphan**
- When their precious cartoons are released I highly doubt it will look like the end of the world.
  - A [11-11] «look»
  - B [12-12] «like»
  - (no direct gold edge)
- The hottest item on Christmas wish lists this year is nuclear weapons.
  - A [4-4] «Christmas»
  - B [5-5] «wish»
  - (no direct gold edge)
- Every move Google makes brings this particular future closer.
  - A [1-1] «move»
  - B [2-2] «Google»
  - (no direct gold edge)
- Every move Google makes brings this particular future closer.
  - A [3-3] «makes»
  - B [4-4] «brings»
  - (no direct gold edge)

**modifier**
- The intrepid Ed Wong of the NYT has more on the Sunni boycott of the elections.
  - A [11-11] «Sunni»
  - B [12-12] «boycott»
  - amod B→A boycott←Sunni
- It's this sort of enlightened self interest that keeps large open source projects alive.
  - A [11-11] «open»
  - B [12-12] «source»
  - amod B→A source←open
- the following weekend i will be ready to rock.
  - A [1-1] «following»
  - B [2-2] «weekend»
  - amod B→A weekend←following
- I hope you have a good flight back to home.
  - A [5-5] «good»
  - B [6-6] «flight»
  - amod B→A flight←good

## Repro

```bash
node scripts/construction-autopsy.mjs NP S S 1
```
