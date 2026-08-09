# Construction Autopsy — `S|S|S` head=0 — 2026-08-08

**Question:** what latent construction family explains why this bond works?

Gain definition: sentence has **no** spanning `S` under base BONDS, **has** spanning
`S` when the candidate is added.

## Yield

| | |
|---|---|
| Material coverage gains | **93** |
| Gains with no direct firing | 0 |
| Direct L+R firings on gains | **152** |


## Purity

`purity = licensed share × family concentration`

| | |
|---|---|
| Licensed share (gold edge present) | 78.9% |
| Concentration (Simpson, licensed families) | 0.101 |
| **Purity** | **0.080** |
| Dominant licensed family | compound (21.7%) |

## Borrowed types

A firing wears a **borrowed type** when both spans are one token wide and reached
their declared type by unary lift alone — nothing bonded inside them. A clausal
bond firing on two bare words is not joining clauses; it is collecting the
imperative `VP→S` lift over dual n/v nouns.

| | |
|---|---|
| Firings on two lift-only spans | 74 |
| **Borrowed share** | **48.7%** |
| left `S` ever carried by a bare atom | no |
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
| compound | 26 | 17.1% |
| juxtaposition-orphan | 21 | 13.8% |
| other:xcomp | 17 | 11.2% |
| modifier | 14 | 9.2% |
| no-direct-gold-link | 11 | 7.2% |
| other:nsubj | 9 | 5.9% |
| other:obj | 8 | 5.3% |
| other:advmod | 6 | 3.9% |
| other:aux:pass | 4 | 2.6% |
| other:case | 4 | 2.6% |
| other:aux | 4 | 2.6% |
| clausal-mod | 4 | 2.6% |
| other:ccomp | 3 | 2.0% |
| list-conj | 3 | 2.0% |
| other:obl:unmarked | 3 | 2.0% |
| other:obl | 2 | 1.3% |
| other:discourse | 2 | 1.3% |
| other:nsubj:pass | 2 | 1.3% |
| other:parataxis | 2 | 1.3% |
| nmod | 2 | 1.3% |
| other:mark | 1 | 0.7% |
| other:csubj | 1 | 0.7% |
| other:cop | 1 | 0.7% |
| other:advcl | 1 | 0.7% |
| other:vocative | 1 | 0.7% |

## Gold deprels between spans

| deprel | n |
|---|---|
| (none) | 32 |
| compound | 23 |
| xcomp | 20 |
| nsubj | 14 |
| amod | 14 |
| obj | 10 |
| ccomp | 9 |
| advmod | 9 |
| obl | 9 |
| case | 7 |
| nsubj:pass | 5 |
| aux:pass | 4 |

## Morphology

| shape | n |
|---|---|
| multi|mixedCase|adjacent | 78 |
| 1+1|mixedCase|adjacent | 72 |
| 1+1|Properish|adjacent | 2 |

## Refine

Dominant family «compound» (17%) — refine that one law rather than the giant.

- **compound** (17%)

## Examples

**compound**
- In the eastern city of Baqubah, guerrillas detonated a car bomb outside a police station, killing several peop
  - A [14-14] «police»
  - B [15-15] «station»
  - compound B→A station←police
- The hottest item on Christmas wish lists this year is nuclear weapons.
  - A [5-5] «wish»
  - B [6-6] «lists»
  - compound B→A lists←wish
- Someone in the CPA sat down and thought up ways to stir them up by closing their newspaper and issuing 28 arre
  - A [21-21] «arrest»
  - B [22-22] «warrants»
  - compound B→A warrants←arrest
- just call me on my cell phone.
  - A [1-5] «call me on my cell»
  - B [6-6] «phone»
  - case B→A phone←on; nmod:poss B→A phone←my; compound B→A phone←cell; obl A→B call←phone

**juxtaposition-orphan**
- In an apparently unrelated incidents, some eleven Iraqis were killed by snipers on Tuesday, including a group 
  - A [24-24] «bus»
  - B [25-25] «near»
  - (no direct gold edge)
- When their precious cartoons are released I highly doubt it will look like the end of the world.
  - A [11-11] «look»
  - B [12-12] «like»
  - (no direct gold edge)
- Every move Google makes brings this particular future closer.
  - A [1-1] «move»
  - B [2-2] «Google»
  - (no direct gold edge)
- Every move Google makes brings this particular future closer.
  - A [3-3] «makes»
  - B [4-4] «brings»
  - (no direct gold edge)

**other:xcomp**
- Let me know
  - A [0-1] «Let me»
  - B [2-2] «know»
  - xcomp A→B Let←know
- Let me know if acceptable and I will go ahead and execute.
  - A [0-1] «Let me»
  - B [2-2] «know»
  - xcomp A→B Let←know
- Lets get together soon.
  - A [0-1] «Let s»
  - B [2-2] «get»
  - xcomp A→B Let←get
- I really enjoyed reading it.
  - A [2-2] «enjoyed»
  - B [3-3] «reading»
  - xcomp A→B enjoyed←reading

**modifier**
- the following weekend i will be ready to rock.
  - A [1-1] «following»
  - B [2-2] «weekend»
  - amod B→A weekend←following
- Catriona is well and has landed herself a pretty cool job in PR.
  - A [9-9] «cool»
  - B [10-10] «job»
  - amod B→A job←cool
- You are correct, I will make the appropriate changes and give you another review before sending execution pape
  - A [8-8] «appropriate»
  - B [9-9] «changes»
  - amod B→A changes←appropriate
- some members of the traveler community bare knuckle box.
  - A [6-6] «bare»
  - B [7-7] «knuckle»
  - amod B→A knuckle←bare

## Repro

```bash
node scripts/construction-autopsy.mjs S S S 0
```
