# PREREGISTRATION — Decision-bearing could-fire coverage

**Written 2026-08-17 BEFORE the restricted census is read.**
SCORE is not run. TEST is not opened. Emission is not changed.
No punctuation semantics are authored. No `ADMIT_BOND`.

The 2026-08-16 observe census remains the frozen raw substrate:

- T1 could-fire **4.2%** of all candidate edges
- T1 no-relation **55.4%**
- filled stable roots **14.5%**
- sense **56.6%**

Those numbers stay. This milestone does not replace them.

## Question

Among packed cells that already contain two genuinely different
derivations, what fraction have semantic factors on enough competing
interfaces that ranking could tell the alternatives apart?

The goal is not “give every edge semantics.” The goal is:

> Give enough competing derivations different semantic consequences
> that real and deranged meaning can actually choose between them.

## Why this is not the raw 4.2%

Raw could-fire and raw no-relation mix two populations:

- **Glue.** `S+PUNCT`, leftover `SCOMMA+S`, `V|DET` adjacency. Blank
  music here is not a semantic failure. Filling it would paint fake
  sheet music onto empty stands.
- **Decision-bearing interfaces.** Complement, modifier, argument,
  coordination, clause attachment, relative, and similar bonds. These
  are the places a semantic distinction could change the winner.

If ordinary could-fire is 4.2% but decision-bearing coverage is much
higher, we are closer than the raw tail looks. If it is also ~4%, the
next TRAIN work belongs exactly at those competing interfaces.

## Unit

A **packed cell** is one molecule: same `(from, to, type)`.

A derivation is **genuinely different** from another when its
structural signature differs. The signature is the bond (or lift) plus
the child spans and child types. Two copies of `S+PUNCT→S` on the same
children are not two alternatives.

**Glue** (excluded from the decision-bearing denominator):

- either child type is `PUNCT` or `COMMA`
- leftover comma absorb `SCOMMA+S→S`

`NPCOMMA+NP→APPOS` / `NPCOMMA+NP→NP` stay in the denominator.
Apposition versus listing is a real choice. `FRONTED+S` is clause
attachment after the comma was already absorbed, not glue.

Lifts are not glue. `VP→S` competing with `NP+VP→S` is a real choice.

## Frozen labels (metric honesty)

These names are declared before the run. They are not interchangeable.

| Name | Meaning |
|---|---|
| `rawT1CouldFireRate` | Existing observe census: could-fire / all T1 edges. Reference only. |
| `competitiveCells` | Packed cells with ≥2 distinct structural signatures. |
| `decisionCompetitiveCells` | Competitive cells with ≥2 distinct **non-glue** signatures. |
| `decisionBearingGroupRate` | Distinguishable decision-competitive cells / `decisionCompetitiveCells`. **This is the milestone.** |
| `weakDistinguishRate` | Same denominator; a cell counts if factor *keys* differ, including named-versus-silent. |
| `decisionBearingEdgeCouldFireRate` | T1 could-fire / decision-bearing child interfaces inside decision-competitive cells. |
| `missingDecisionBonds` | Uninterpreted or no-relation interfaces inside decision-competitive cells, by family. TRAIN targets. |

A cell is **strongly distinguishable** only when at least two
non-glue alternatives have a non-silent factor and those factor keys
differ. Non-silent means a named complete composition **or** a T1
could-fire on that derivation’s child interface.

Named-versus-silent is reported as `weakDistinguishRate`. It is not
the milestone. Silence versus music is not two songs.

## Chamber

Same observe chamber as the frozen census: EWT DEV, `maxTokens = 28`,
`semanticParticles.mode = 'observe'`. TEST file is not read.

Protection: throws 0; forest fingerprints identical on 8 replay pairs;
coverage and events are reported, not required to move.

## What this does not do

- Does not score.
- Does not author `FEATURE_COMPAT` rows.
- Does not invent punctuation or leftover-adjacency semantics.
- Does not promote SCORE. Stay in OBSERVE after the number is read.
- Any later authorship of missing decision-bearing relations is
  TRAIN-only and is a separate reviewed act.

## Reproduction

```
node scripts/decision-bearing-coverage-census.mjs
```
