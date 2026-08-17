# RESULT — Silence-classifier commutativity control + latent-deficit census

OBSERVE-only. TEST sealed. No relations, COMPAT rows, or lexicon entries authored.

- commit `9bffa9f4c7c684c20015a0ffd634d649847d37d3`
- chamber: DEV ≤ 28 tokens — analysed 1824, parsed 585, threw 0
- fingerprints identical on 8/8 replay pairs
- faithfulness: natural-order reconstruction matched row.silenceClass on 57012/57012 edges

## Experiment 1 — classifier commutativity

classifySilence is a priority cascade C4→C1→C2→C3→null. All 24 branch orders
were evaluated over identical reconstructed inputs.

- order-sensitive edges: **22542 / 57012** (39.54%)
- commutator magnitude C_classifier = 0.395390444117028
- verdict: C>0 — classifier is priority-order-sensitive on the reported region

## Experiment 2 — observed class vs latent deficit set

| observed (priority) | count |
|---|---|
| C1-composition-missing | 12466 |
| C2-lexical-missing | 22542 |
| C3-feature-missing | 21295 |
| null | 709 |

| latent deficit combo | count |
|---|---|
| C2+C3 | 22542 |
| C3 | 21295 |
| C1 | 12466 |
| none | 709 |

- C2∩C3 overlap (named ∧ unknown ∧ complete ∧ ¬couldFire): **22542**
- of 22542 observed-C2 edges, also carry latent C3: **22542** (100.00%)
- silent edges with ≥2 latent deficits: 0/12348

