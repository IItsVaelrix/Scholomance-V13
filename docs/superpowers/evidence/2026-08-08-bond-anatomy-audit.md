# Bond Anatomy Audit — 2026-08-08

**Premise:** A bond can produce the correct answer while expressing the wrong
theory of grammar. The treebank has been the scorekeeper; this run makes it the
**anatomy examiner**.

**Instruments:**
- Static catalogue: `codex/core/constellation/bond-anatomy.js` (68 rows, locked to `BONDS`)
- Runtime autopsy: `scripts/bond-anatomy-audit.mjs`
- Split: UD English-EWT **dev**, packed chart

## Four questions per bond

| Code | Question |
|---|---|
| **C** | Constituency — do these actually combine? |
| **R** | Result type — is the combination correctly named? |
| **H** | Headship — is the declared child linguistically the head? |
| **X** | eXclusivity — one construction, or several conflated? |

Grades: **G** green / **Y** yellow / **R** red.

## Static table (68 bonds)

| dim | G | Y | R | % green |
|---|---|---|---|---|
| **C** constituency | 47 | 21 | 0 | **69%** |
| **R** result type | 44 | 24 | 0 | **65%** |
| **H** headship | **64** | 4 | 0 | **94.1%** |
| **X** exclusivity | 37 | 28 | 3 | **54%** |

| Aggregate | |
|---|---|
| All four green | **22 / 68 (32.4%)** |
| Scaffold result types | 16 (CONJNP, FRONTED, INV, RELC, …) |
| Critical / red-X | **3** |

### Critical flags (theory wrong even when head is right)

1. **`COP + VP → VP`** — progressive/passive *be* is UD **aux**, not **cop**. Head (lexical VP) is correct; **category is wrong theory**.
2. **`REL + VP → RELC`** — only subject-gap relatives in practice; object/oblique/poss not modeled; RELC is scaffold.
3. **`THAN + NP → THANP`** — one of several *than* constructions collapsed into a scaffold.

### Preliminary verdict (confirmed)

> The parser does not have a crazy view of English. Headship is **94% green**.
> Errors sit in **category granularity and construction modeling** (R, X), not
> the fundamental direction of syntax (H).

## Runtime: correct answer → legitimate path?

Among scoreable sentences (gold nsubj + verb) with **gold in the ensemble**
(n=**133**):

| Path property | n | % of contained |
|---|---|---|
| Fully theory-clean (all bonds GGGG) | **2** | **1.5%** |
| Headship-clean (every bond H=G) | **114** | **85.7%** |
| Path includes yellow | 100 | 75.2% |
| Path includes red | 31 | 23.3% |
| Critical flag hit | **36** | **27.1%** |

**Reading:** When the answer is right, **headship is almost always still right**
(85.7%). Almost never is the *whole derivation* free of computational shortcuts
(1.5% theory-clean) — Catalan attachments, stack-hack `ADJ+N→N`, coordination
scaffolds, and COP packaging appear constantly on *winning* trees.

That is the nastier test working: **right answer ≠ pure grammar.**

## COP vs AUX (live confirmation of the biggest yellow flag)

Among contained sentences that use **`COP+VP→VP`** (n=30):

| Gold on *be* | n | % of COP+VP uses |
|---|---|---|
| `aux` / `aux:pass` | **18** | **60%** |
| `cop` | 13 | 43% |

Examples (answer often still correct):

- *…were provoked…* — `were:aux:pass` via **COP**+VP  
- *I was thinking…* — `was:aux` via **COP**+VP  
- *…are taking their toll* — `are:aux` via **COP**+VP  

**Headship saved the score; the atom type lied about the construction.**

## Flags most common on correct paths

| flag | % of contained |
|---|---|
| ud-aligned (somewhere) | 100% |
| punct absorption | 90% |
| object-bundle (`V+NP`) | 61% |
| stack-hack (`ADJ+N→N`) | 54% |
| ud-cop / result-as-vp | 44% |
| scaffold-result | 41% |
| catalan / attachment-ambiguous | 36% |
| **cop-vs-aux** | **27%** |

## Anatomy examiner verdict

| Claim | Result |
|---|---|
| Spine of grammar is UD-sound | **Confirmed** — H=94% table, H-clean path 86% when right |
| Shortcuts are category/construction, not head direction | **Confirmed** — R/X yellow mass; only 3 red-X |
| Correct answers often arrive for imperfect reasons | **Confirmed** — 1.5% fully clean paths |
| COP+VP mislabels progressive/passive *be* | **Confirmed live** — 60% of COP+VP uses on gold aux |

### What to fix next (theory, not just coverage)

1. **Retype progressive/passive *be* as AUX** (or drop `COP+VP`); keep head on VP.  
2. **Split or document relatives** — subject-gap only, or add object-gap machinery.  
3. **Mark scaffolds as non-ontological** in consumers (CONJ*, FRONTED, INV, THANP).  
4. **Grow grammar** for missing constructions *without* promoting yellow shortcuts to “truth.”

## Repro

```bash
node scripts/bond-anatomy-audit.mjs dev
```

## Related

- Head declaration result: `docs/superpowers/evidence/2026-08-08-head-declaration-result.md`
- Audition selection measure: `docs/superpowers/evidence/2026-08-08-audition-jury-selection-measure.md`
