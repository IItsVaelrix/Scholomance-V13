# Does the top nucleus add value? — Results

Criteria fixed in `2026-08-11-PREREG-nucleus-value.md` before any nucleus was read.

## Verdict: NO VALUE DEMONSTRATED. V3 fails.

Not because the nucleus is bad — because the ranking does not discriminate.

## First, a broken instrument (recorded, not hidden)

The initial mechanical test matched atom evidence artifacts by **basename**, and returned
`pairwiseRealized = 1.0000` for nuclei, refused candidates, AND random 5-atom subsets.
Cause: tokens like `evidence`, `server`, `reactor`, `permission`, `tokenizer` match
thousands of files. A metric that returns 1.0 for random input cannot fail and proves
nothing. Both of its "predictions HELD" verdicts were artifacts.

v2 uses the last two path segments of each evidence path and requires an actual
cross-reference between the two artifacts. **It ships with a saturation check that aborts
before reporting any verdict if random pairs score above 0.85.**

    random 5-atom pairwiseRealized: mean 0.0665  sd 0.0879   -> OK, metric can return low

## Results

| arm | n | V1 valid | pairwise already-realized | sd |
|---|---|---|---|---|
| NUCLEI | 26 | 0.8846 | **0.0077** | 0.0272 |
| REFUSED | 20 | 0.9750 | 0.0000 | 0.0000 |
| RANDOM 5-atom | 300 | 0.0000* | **0.0665** | 0.0879 |

\* random subsets carry no bonds, so `validFraction` is 0 by construction — not a
meaningful comparison. Note also that v1's `validFraction` only checks direct
`offers → seeks` matches and ignores bridge-rule licensing, which is why nuclei (0.8846)
score *below* refused (0.9750). That is an instrument limitation, not a finding.

### Top nucleus

    bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + semantic-memory

    bytecode-seal        -> immutable-packet    ALREADY CROSS-REFERENCED: false
    canonical-serializer -> immutable-packet    ALREADY CROSS-REFERENCED: false
    canonical-serializer -> schema-verifier     ALREADY CROSS-REFERENCED: false
    immutable-packet     -> semantic-memory     ALREADY CROSS-REFERENCED: false

    validFraction 1.0   pairwiseRealized 0.0   comparablePairs 10

## Predictions

- **P2 — FAILED. I was wrong.** I predicted the top nucleus would be a rediscovery of
  existing architecture (`realizedFraction >= 0.5`). It scored **0.0** — not one of its
  bonds exists as a cross-reference in the codebase.
- **P3 — HELD.** Nuclei (0.0077) do not separate from random molecules (0.0665). They are
  in fact marginally *lower*.

## Why P2 failing does not rescue the result

Novelty is the **default state** of this substrate. Random 5-atom subsets are ~93%
unrealized; nuclei are ~99% unrealized; refused candidates are 100% unrealized. Almost no
pair of these 44 atoms cross-references any other, so "this composition is not already
built" is true of essentially every combination the engine could emit.

**A property shared by the winners, the losers, and random noise carries no information.**
The nucleus being novel is not evidence of discovery, for the same reason that
`strengthPreserved > 0` was not evidence the dampener worked.

## Second finding: 26 nuclei are 3 compositions

| count | atom set |
|---|---|
| 14 | bytecode-seal + canonical-serializer + diagnostic-event-bus + immutable-packet + schema-verifier |
| 10 | bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + semantic-memory |
| 2 | bytecode-seal + canonical-serializer + cyclotron-reactor + evidence-ledger + schema-verifier |

All three share the core triple `bytecode-seal + canonical-serializer + schema-verifier`;
the rest are bond permutations of the same atom sets. `shortlistFamilyCap: 2` is not
binding on bond-order variants of an identical atom set. **"26 nuclei" overstates the
result by roughly an order of magnitude** — it is one composition with two variable slots.

## What this test does NOT answer

Whether *building* the proposed pipeline — canonical serialization → schema verification →
bytecode seal → immutable packet → semantic memory — would improve anything. That is the
usefulness question, and no mechanical test here touches it.

## The design fix that would make discoverability testable

The novelty signal has **no dynamic range on this substrate**. To show that ranking finds
good compositions, the substrate must contain a mix: some compositions already built, some
not, so the ranking has something to be right or wrong about. On a bank where ~97% of all
pairs are unrealized, no ranking can demonstrate discoverability.

Concretely: build the atom bank from a domain with a known dependency graph (real module
imports, where composition is verifiable), then ask whether high-ranked molecules
correspond to compositions that are *sound but unbuilt* at a higher rate than chance.
That is a testable claim. The current bank cannot support one.
