# Codebase Nuclei Mining — Results

**Contract:** `PB-CODEBASE-NUCLEI-MINE-v1`
**Date:** 2026-08-11
**Trials:** 20,000 · **Seed:** 6045712
**Atom bank:** 56 atoms (44 ritual + 12 codebase extensions)
**Report checksum:** `cyclotron1:8b9893a81e948bb0ebed6c84c82b916b`
**Mine checksum:** `codemine1:48b875e3a7ad1d740d3f58768114675793570919ecc26356557e586ef78a679e`

## What this experiment asks

Not "what scores highest chemically." The prior 100k ritual already answered
that, and the answer collapsed to seal+serializer variants. This run asks:

> Which *unbuilt*, *evidence-real*, *port-coherent* nuclei would help *this* codebase?

## Counts

| metric | value |
|---|---|
| unique molecules | 11254 |
| shortlisted | 256 |
| nuclei (engine) | 48 |
| hypotheses | 29 |
| unique nucleus topologies | 25 |
| unique hypothesis topologies | 15 |
| already-shipped rediscoveries | 2 |
| build proposals (utility ≥ 0.45) | 12 |

## Top build proposals

### 1. `canonical-serializer + evidence-ledger + schema-verifier + test-contract`

- **utility** 0.5586 · **chemistry** 0.7274 · **verdict** NUCLEUS
- **domains** artifact, governance, memory
- **evidence realized** 100%
- **internal ports** artifact, schema-verdict, structure, validation-verdict
- **open ports** experiment-receipt, integrity-verdict, process-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Crosses 3 domains: artifact, governance, memory.
  - Many open ports (3) — likely under-specified.

### 2. `canonical-serializer + evidence-ledger + process-sensor + schema-verifier`

- **utility** 0.5408 · **chemistry** 0.6856 · **verdict** HYPOTHESIS
- **domains** artifact, governance, immunity, memory
- **evidence realized** 100%
- **internal ports** artifact, experiment-receipt, structure
- **open ports** candidate-frontier, feasibility-score, validation-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Crosses 4 domains: artifact, governance, immunity, memory.
  - Many open ports (3) — likely under-specified.

### 3. `process-sensor + retrieval-index`

- **utility** 0.5331 · **chemistry** 0.6507 · **verdict** HYPOTHESIS
- **domains** immunity, retrieval
- **evidence realized** 100%
- **internal ports** candidate-frontier
- **open ports** feasibility-score, probe-family, validation-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (3) — likely under-specified.

### 4. `process-sensor + valence-compiler`

- **utility** 0.5222 · **chemistry** 0.7192 · **verdict** NUCLEUS
- **domains** immunity, synthesis
- **evidence realized** 100%
- **internal ports** candidate-frontier
- **open ports** atom-inventory, feasibility-score, trial-counter, validation-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (4) — likely under-specified.

### 5. `schema-verifier + test-contract`

- **utility** 0.5159 · **chemistry** 0.7541 · **verdict** HYPOTHESIS
- **domains** governance
- **evidence realized** 100%
- **internal ports** schema-verdict
- **open ports** artifact, integrity-verdict, process-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (3) — likely under-specified.

### 6. `fission-reactor + law-gate + molecule-generator`

- **utility** 0.5132 · **chemistry** 0.7269 · **verdict** NUCLEUS
- **domains** governance, linguistic, synthesis
- **evidence realized** 100%
- **internal ports** proposal
- **open ports** atom-inventory, corpus-grounding, operator-law, semantic-relation, token-stream
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Crosses 3 domains: governance, linguistic, synthesis.
  - Many open ports (5) — likely under-specified.

### 7. `canonical-serializer + schema-verifier + test-contract`

- **utility** 0.5098 · **chemistry** 0.6750 · **verdict** HYPOTHESIS
- **domains** artifact, governance
- **evidence realized** 100%
- **internal ports** artifact, schema-verdict
- **open ports** integrity-verdict, process-verdict, structure
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (3) — likely under-specified.

### 8. `bytecode-seal + canonical-serializer + schema-verifier + test-contract`

- **utility** 0.5065 · **chemistry** 0.7658 · **verdict** NUCLEUS
- **domains** artifact, governance
- **evidence realized** 100%
- **internal ports** artifact, schema-verdict
- **open ports** integrity-verdict, process-verdict, structure
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (3) — likely under-specified.
  - Cyclotron nucleus score 0.7658.

### 9. `process-sensor + retrieval-index + valence-compiler`

- **utility** 0.5058 · **chemistry** 0.6932 · **verdict** HYPOTHESIS
- **domains** immunity, retrieval, synthesis
- **evidence realized** 100%
- **internal ports** candidate-frontier
- **open ports** atom-inventory, feasibility-score, probe-family, trial-counter, validation-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Crosses 3 domains: immunity, retrieval, synthesis.
  - Many open ports (5) — likely under-specified.

### 10. `bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + test-contract`

- **utility** 0.5030 · **chemistry** 0.7591 · **verdict** NUCLEUS
- **domains** artifact, governance
- **evidence realized** 100%
- **internal ports** artifact, checksum, schema-verdict
- **open ports** integrity-verdict, process-verdict, structure
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (3) — likely under-specified.

### 11. `bytecode-seal + immutable-packet + schema-verifier + test-contract`

- **utility** 0.5010 · **chemistry** 0.7409 · **verdict** NUCLEUS
- **domains** artifact, governance
- **evidence realized** 100%
- **internal ports** checksum, schema-verdict
- **open ports** artifact, integrity-verdict, process-verdict
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (3) — likely under-specified.

### 12. `canonical-serializer + immutable-packet + schema-verifier + test-contract`

- **utility** 0.4629 · **chemistry** 0.6951 · **verdict** HYPOTHESIS
- **domains** artifact, governance
- **evidence realized** 100%
- **internal ports** artifact, schema-verdict
- **open ports** checksum, integrity-verdict, process-verdict, structure
- **why**
  - Every atom resolves to a real file in this tree.
  - Includes 1 codebase-extension atom(s) absent from the ritual bank.
  - Many open ports (4) — likely under-specified.

## Best hit per extension atom

Even when a grammar or sensor atom loses the global ranking, this table
shows the strongest shortlisted molecule that contains it — or notes absence.

| extension | best molecule | utility | chemistry | verdict |
|---|---|---|---|---|
| `process-sensor` | `canonical-serializer + evidence-ledger + process-sensor + schema-verifier` | 0.541 | 0.6856 | HYPOTHESIS |
| `artifact-auditor` | _(not in shortlist)_ | — | — | — |
| `subtlety-fingerprint` | _(not in shortlist)_ | — | — | — |
| `subtlety-closed-loop` | _(not in shortlist)_ | — | — | — |
| `raid-healer` | _(not in shortlist)_ | — | — | — |
| `fission-reactor` | `fission-reactor + law-gate + molecule-generator` | 0.513 | 0.7269 | NUCLEUS |
| `ccg-channel` | _(not in shortlist)_ | — | — | — |
| `treebank-metrics` | _(not in shortlist)_ | — | — | — |
| `precedent-compose` | _(not in shortlist)_ | — | — | — |
| `entropy-dampener` | _(not in shortlist)_ | — | — | — |
| `test-contract` | `canonical-serializer + evidence-ledger + schema-verifier + test-contract` | 0.559 | 0.7274 | NUCLEUS |
| `canonical-tokenizer-atom` | _(not in shortlist)_ | — | — | — |

## Shipped rediscoveries (suppressed as build targets)

- `bytecode-seal|canonical-serializer|immutable-packet|schema-verifier|semantic-memory` · chemistry 0.7749 · utility capped 0.1200
- `bytecode-seal|canonical-serializer|diagnostic-event-bus|immutable-packet|schema-verifier` · chemistry 0.6655 · utility capped 0.1200

## Method

1. Start from the ritual atom bank; retarget `diagnostic-event-bus` evidence to the A2 harness.
2. Append 12 codebase-grounded atoms (sensors, fission/CCG, constellation, healer, tests).
3. Run the Semantic Valence Cyclotron with occupancy-entropy **on**.
4. Collapse bond-order isomers to unique sorted atom-id topologies.
5. Score utility = chemistry + evidence-on-disk + port closure + new-atom fraction + multi-domain − dangling penalty; hard-cap shipped sets.

## Repro

```bash
node scripts/mine-codebase-nuclei.mjs --trials=20000 --seed=6045712 --out=docs/superpowers/evidence/2026-08-11-codebase-nuclei-mine.json
```

## Honest limits

- Utility is a **ranking heuristic**, not a measured effect size on the codebase.
- Building a proposal is a separate decision. This script never writes production code.
- Nuclei can still be port-coherent and useless; human review before build is mandatory.
- Entropy and the extended bank change the input class — do not compare chemistry scores 1:1 with the 100k ritual.

