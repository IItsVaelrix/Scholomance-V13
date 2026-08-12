# Nucleus Geometry — Is the SHAPE Viable?

Reframe from Vaelrix, 2026-08-11: a nucleus is a proposal *for a human*. The question is
not whether the semantic scorer predicted it, but whether the proposed **shape** is viable.
That is decidable from the port algebra alone.

## Six falsifiable geometric properties

| | property | test |
|---|---|---|
| G1 | TYPE-SOUND | every bond is a real `offers → seeks` match (exact or bridged) |
| G2 | ACYCLIC | the bond graph is a DAG — a pipeline, not a loop |
| G3 | EXECUTABLE | in topological order, each atom's seeks are covered by upstream offers |
| G4 | CONNECTED | one weakly-connected component |
| G5 | HAS-SINK | a terminal atom whose offers nobody consumes |
| G6 | SPANNING | every atom participates in a bond |

Applied identically to nuclei, refused candidates, and **random licensed walks from the
same generator**. The connection rule is a faithful replica of `connectionBetween()`.

## Results

```
arm            n   G1 sound  G2 acyclic  G3 exec  G4 conn  G5 sink  G6 span  dangling
NUCLEI          26    1.0000      1.0000   0.9698   1.0000   1.0000   1.0000      0.19
REFUSED         20    1.0000      1.0000   0.8881   1.0000   1.0000   1.0000      0.70
RANDOM walks   500    1.0000      1.0000   0.8158   1.0000   1.0000   1.0000      1.45
```

**Five of six properties are saturated at 1.0000 for every arm** — the generator only emits
licensed connected walks, so G1/G2/G4/G5/G6 cannot fail and carry no information. Reported
so nobody mistakes them for evidence.

**G3 is not saturated** (random = 0.8158, so it can go down) and it separates:

```
arm             n   mean dangling   sd     zero-dangling
NUCLEI          26      0.192      0.402       80.8%
REFUSED         20      0.700      0.865       55.0%
RANDOM         500      1.448      1.078       19.6%
```

## CLAIM 1 — the shape is VIABLE. Established.

Top nucleus, mechanically verified:

    canonical-serializer --artifact-->      schema-verifier
    canonical-serializer --artifact-->      immutable-packet
    bytecode-seal        --checksum-->      immutable-packet
    immutable-packet     --sealed-packet--> semantic-memory

    g1 1  g2 1  g3 1  g4 1  g5 1  g6 1   dangling 0 / totalSeeks 6

All six seeks across the molecule are satisfied by upstream offers. Zero dangling
requirements. Type-sound, acyclic, connected, terminating. **This is a closed, executable
pipeline** — not a plausible-sounding list. That is a verified property of the specific
shape, independent of any score.

## CLAIM 2 — the ranking reliably finds viable shapes. NOT established.

Mann-Whitney on dangling counts, nuclei vs random: **z = −5.980, p = 6.5e-11.**

**That p-value is inflated by pseudo-replication and must not be quoted.** The 26 nuclei are
only **3 distinct atom sets**; the rest are bond-order permutations. Effective n = 3.

    dangling [0,0,0,0,0,0,1,0,0,0]         bytecode-seal+canonical-serializer+immutable-packet+schema-verifier+semantic-memory
    dangling [0,0,0,0,0,0,0,0,0,1,0,0,0,1] bytecode-seal+canonical-serializer+diagnostic-event-bus+immutable-packet+schema-verifier
    dangling [1,1]                         bytecode-seal+canonical-serializer+cyclotron-reactor+evidence-ledger+schema-verifier

    per-composition means: 0.10, 0.14, 1.00
    all 3 below random mean (1.45) -> sign test p = 0.25

At the level of independent compositions the correct statistic is **p = 0.25**. Direction
right, magnitude large, significance absent. Note also the third composition sits at 1.00,
close to the random mean — the effect is carried by two of three.

Nuclei vs REFUSED is also not significant: **z = −1.762, p = 0.072.** So the ranking's
advantage over its own rejects is not demonstrated either.

## The cheap fix that would establish it

`shortlistFamilyCap: 2` does not bind on bond-order permutations of an identical atom set,
so a 100k run yields 26 nuclei that are 3 compositions. Deduplicate the shortlist by sorted
`atomIds` before applying the family cap, and the same run should surface many more distinct
compositions. With n ≈ 20 independent compositions, a sign test can reach p < 0.05 and
Claim 2 becomes testable rather than suggestive.

**No new theory is required — this is a deduplication bug standing between a suggestive
result and an establishable one.**

## What is still untested

Whether *building* the pipeline improves anything. Executable ≠ useful. G3 proves the shape
can run, not that running it is worth doing.
