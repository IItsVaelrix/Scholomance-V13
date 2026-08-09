# Construction Autopsy — `NP|NP|NP` head=0 — 2026-08-08

**Question:** what latent construction family explains why this bond works?

Gain definition: sentence has **no** spanning `S` under base BONDS, **has** spanning
`S` when the candidate is added.

## Yield

| | |
|---|---|
| Material coverage gains | **92** |
| Gains with no direct firing | 0 |
| Direct L+R firings on gains | **226** |


## Purity

`purity = licensed share × family concentration`

| | |
|---|---|
| Licensed share (gold edge present) | 64.6% |
| Concentration (Simpson, licensed families) | 0.204 |
| **Purity** | **0.131** |
| Dominant licensed family | compound (36.3%) |

## Borrowed types

A firing wears a **borrowed type** when both spans are one token wide and reached
their declared type by unary lift alone — nothing bonded inside them. A clausal
bond firing on two bare words is not joining clauses; it is collecting the
imperative `VP→S` lift over dual n/v nouns.

| | |
|---|---|
| Firings on two lift-only spans | 224 |
| **Borrowed share** | **99.1%** |
| left `NP` ever carried by a bare atom | no |
| right `NP` ever carried by a bare atom | no |

> **FLOORED — read this share as a description, not a verdict.** Neither
> side's type is emitted by any atom in the sampled spans, so every one-token
> firing is borrowed by construction and this number could not have come out
> low however the grammar behaved. What it still tells you is how far the
> bond's gain rides on single words rather than assembled phrases — compare
> it against other bonds over the same types, never against a lexical bond.


## Family split

| Family | n | % |
|---|---|---|
| juxtaposition-orphan | 78 | 34.5% |
| compound | 53 | 23.5% |
| modifier | 28 | 12.4% |
| other:nsubj | 22 | 9.7% |
| other:obj | 11 | 4.9% |
| other:advmod | 7 | 3.1% |
| other:case | 6 | 2.7% |
| flat-name | 4 | 1.8% |
| nmod | 4 | 1.8% |
| other:xcomp | 3 | 1.3% |
| other:iobj | 3 | 1.3% |
| flat-name-orphan | 2 | 0.9% |
| other:goeswith | 1 | 0.4% |
| other:obl:unmarked | 1 | 0.4% |
| other:expl | 1 | 0.4% |
| other:mark | 1 | 0.4% |
| list-conj | 1 | 0.4% |

## Gold deprels between spans

| deprel | n |
|---|---|
| (none) | 80 |
| compound | 53 |
| amod | 25 |
| nsubj | 22 |
| obj | 11 |
| case | 7 |
| advmod | 7 |
| flat | 4 |
| xcomp | 3 |
| nummod | 3 |
| iobj | 3 |
| nmod:poss | 3 |

## Morphology

| shape | n |
|---|---|
| 1+1|mixedCase|adjacent | 213 |
| 1+1|Properish|adjacent | 11 |
| multi|mixedCase|adjacent | 2 |

## Refine

Split into 2 construction families (each ≥15%).

- **juxtaposition-orphan** (35%)
- **compound** (23%)

## Examples

**juxtaposition-orphan**
- In the eastern city of Baqubah, guerrillas detonated a car bomb outside a police station, killing several peop
  - A [11-11] «bomb»
  - B [12-12] «outside»
  - (no direct gold edge)
- When their precious cartoons are released I highly doubt it will look like the end of the world.
  - A [8-8] «doubt»
  - B [9-9] «it»
  - (no direct gold edge)
- When their precious cartoons are released I highly doubt it will look like the end of the world.
  - A [11-11] «look»
  - B [12-12] «like»
  - (no direct gold edge)
- The hottest item on Christmas wish lists this year is nuclear weapons.
  - A [4-4] «Christmas»
  - B [5-5] «wish»
  - (no direct gold edge)

**compound**
- In the eastern city of Baqubah, guerrillas detonated a car bomb outside a police station, killing several peop
  - A [10-10] «car»
  - B [11-11] «bomb»
  - compound B→A bomb←car
- In the eastern city of Baqubah, guerrillas detonated a car bomb outside a police station, killing several peop
  - A [14-14] «police»
  - B [15-15] «station»
  - compound B→A station←police
- The hottest item on Christmas wish lists this year is nuclear weapons.
  - A [5-5] «wish»
  - B [6-6] «lists»
  - compound B→A lists←wish
- Where it risks fighting dual Sunni Arab and Shiite insurgencies simultaneously, at a time when US troops are r
  - A [16-16] «US»
  - B [17-17] «troops»
  - compound B→A troops←US

**modifier**
- Every move Google makes brings this particular future closer.
  - A [6-6] «particular»
  - B [7-7] «future»
  - amod B→A future←particular
- Where it risks fighting dual Sunni Arab and Shiite insurgencies simultaneously, at a time when US troops are r
  - A [5-5] «Sunni»
  - B [6-6] «Arab»
  - amod B→A Arab←Sunni
- One answer is that the Pentagon prevented the State Department from running the CPA.
  - A [0-0] «One»
  - B [1-1] «answer»
  - nummod B→A answer←One
- the following weekend i will be ready to rock.
  - A [1-1] «following»
  - B [2-2] «weekend»
  - amod B→A weekend←following

**other:nsubj**
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
- i think they are all bark and no bite.
  - A [0-0] «i»
  - B [1-1] «think»
  - nsubj B→A think←i

## Repro

```bash
node scripts/construction-autopsy.mjs NP NP NP 0
```
