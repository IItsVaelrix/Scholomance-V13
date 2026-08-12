# Codebase Nuclei — Ablation Matrix

**Contract:** `PB-CODEBASE-NUCLEI-ABLATION-v1`
**Trials per arm:** 8,000 · **Seed:** 6045712
**Checksum:** `ablation1:a9eb3ab4232e048d6ff4b0b40e5bf97c02fe09dccc7f164337721f48932bbf97`

## Question

Not average energy. Not nucleus count. What does discovery *depend on*,
and which proposal architectures survive when the bank is damaged?

The long-horizon metric is **architectural hit rate** — implementation
survival vs topology-matched random controls. Ablation is the prerequisite:
if topology and grounding do not move the proposal set, the molecular
representation is not carrying architectural information.

## Matrix

| condition | question | unique nucleus topos | proposals | process-sensor | seal-heavy | collapse | jaccard vs baseline |
|---|---|---|---|---|---|---|---|
| `baseline` | Real extension atoms — control arm | 29 | 12 | 6 | 4 | 0.33 | 1.000 |
| `shuffled_ports` | Does topology matter? | 13 | 12 | 2 | 0 | 0.32 | 0.043 |
| `random_evidence` | Does grounding (evidence path) matter? | 29 | 12 | 6 | 4 | 0.33 | 1.000 |
| `entropy_off` | Does search collapse recur? | 29 | 12 | 6 | 4 | 0.33 | 1.000 |
| `extension_req_off` | Does the legacy bank monopolize discovery? | 29 | 12 | 0 | 10 | 0.33 | 0.000 |
| `no_process_sensor` | What architectures disappear? | 29 | 12 | 0 | 7 | 0.45 | 0.143 |
| `no_evidence_atoms` | What basin replaces them? | 35 | 12 | 0 | 7 | 0.62 | 0.143 |

## `baseline` — Real extension atoms — control arm

- atoms 56 · entropy true · requireExtension true
- engine nuclei 43 → 29 topologies (collapse 0.325581)
- proposals 12 · extension-bearing 12 · mean utility 0.532848
- process-sensor in proposals: 6 · test-contract: 6 · fission: 1
- jaccard(proposal topologies, baseline): **1.000**
- report checksum `cyclotron1:91f5b0a0cc7d60adcc3701b9cfcaa205`

Top proposals:

1. `u=0.617` `process-sensor + test-contract + valence-compiler` (HYPOTHESIS)
2. `u=0.559` `canonical-serializer + evidence-ledger + schema-verifier + test-contract` (NUCLEUS)
3. `u=0.549` `bytecode-seal + canonical-serializer + evidence-ledger + process-sensor` (NUCLEUS)
4. `u=0.539` `bytecode-seal + canonical-serializer + evidence-ledger + process-sensor + schema-verifier` (NUCLEUS)
5. `u=0.533` `process-sensor + retrieval-index` (HYPOTHESIS)
6. `u=0.522` `process-sensor + valence-compiler` (NUCLEUS)
7. `u=0.518` `bytecode-seal + canonical-serializer + evidence-ledger + immutable-packet + test-contract` (NUCLEUS)
8. `u=0.516` `schema-verifier + test-contract` (HYPOTHESIS)
9. `u=0.514` `canonical-serializer + evidence-ledger + immutable-packet + schema-verifier + test-contract` (NUCLEUS)
10. `u=0.512` `fission-reactor + law-gate + molecule-generator` (NUCLEUS)
11. `u=0.510` `canonical-serializer + schema-verifier + test-contract` (HYPOTHESIS)
12. `u=0.506` `process-sensor + retrieval-index + valence-compiler` (HYPOTHESIS)

Extension atoms absent from shortlist: `subtlety-closed-loop`, `ccg-channel`, `treebank-metrics`, `entropy-dampener`, `canonical-tokenizer-atom`

## `shuffled_ports` — Does topology matter?

- atoms 56 · entropy true · requireExtension true
- engine nuclei 19 → 13 topologies (collapse 0.315789)
- proposals 12 · extension-bearing 12 · mean utility 0.568305
- process-sensor in proposals: 2 · test-contract: 12 · fission: 3
- jaccard(proposal topologies, baseline): **0.043**
- report checksum `cyclotron1:408306216e5833d362da2134450d439c`

Top proposals:

1. `u=0.651` `process-sensor + test-contract + valence-compiler` (HYPOTHESIS)
2. `u=0.640` `fission-reactor + test-contract + valence-compiler` (NUCLEUS)
3. `u=0.589` `fission-reactor + query-expander + test-contract` (HYPOTHESIS)
4. `u=0.575` `fission-reactor + osmosis-receptor + phonetic-encoder + test-contract` (NUCLEUS)
5. `u=0.572` `test-contract + valence-compiler` (HYPOTHESIS)
6. `u=0.561` `canonical-serializer + test-contract + valence-compiler` (HYPOTHESIS)
7. `u=0.555` `canonical-serializer + corpus-loader + test-contract` (HYPOTHESIS)
8. `u=0.542` `correspondence-registry + test-contract + valence-compiler` (NUCLEUS)
9. `u=0.538` `canonical-serializer + phonetic-encoder + process-sensor + test-contract + valence-compiler` (HYPOTHESIS)
10. `u=0.535` `law-gate + osmosis-receptor + phonetic-encoder + raid-healer + test-contract` (HYPOTHESIS)
11. `u=0.534` `canonical-serializer + test-contract` (HYPOTHESIS)
12. `u=0.526` `canonical-serializer + corpus-loader + correspondence-registry + test-contract + valence-compiler` (HYPOTHESIS)

Extension atoms absent from shortlist: `subtlety-fingerprint`, `treebank-metrics`, `precedent-compose`, `entropy-dampener`

## `random_evidence` — Does grounding (evidence path) matter?

- atoms 56 · entropy true · requireExtension true
- engine nuclei 43 → 29 topologies (collapse 0.325581)
- proposals 12 · extension-bearing 12 · mean utility 0.532848
- process-sensor in proposals: 6 · test-contract: 6 · fission: 1
- jaccard(proposal topologies, baseline): **1.000**
- report checksum `cyclotron1:cadfd3e9847d45030d35a08179585e7f`

Top proposals:

1. `u=0.617` `process-sensor + test-contract + valence-compiler` (HYPOTHESIS)
2. `u=0.559` `canonical-serializer + evidence-ledger + schema-verifier + test-contract` (NUCLEUS)
3. `u=0.549` `bytecode-seal + canonical-serializer + evidence-ledger + process-sensor` (NUCLEUS)
4. `u=0.539` `bytecode-seal + canonical-serializer + evidence-ledger + process-sensor + schema-verifier` (NUCLEUS)
5. `u=0.533` `process-sensor + retrieval-index` (HYPOTHESIS)
6. `u=0.522` `process-sensor + valence-compiler` (NUCLEUS)
7. `u=0.518` `bytecode-seal + canonical-serializer + evidence-ledger + immutable-packet + test-contract` (NUCLEUS)
8. `u=0.516` `schema-verifier + test-contract` (HYPOTHESIS)
9. `u=0.514` `canonical-serializer + evidence-ledger + immutable-packet + schema-verifier + test-contract` (NUCLEUS)
10. `u=0.512` `fission-reactor + law-gate + molecule-generator` (NUCLEUS)
11. `u=0.510` `canonical-serializer + schema-verifier + test-contract` (HYPOTHESIS)
12. `u=0.506` `process-sensor + retrieval-index + valence-compiler` (HYPOTHESIS)

Extension atoms absent from shortlist: `subtlety-closed-loop`, `ccg-channel`, `treebank-metrics`, `entropy-dampener`, `canonical-tokenizer-atom`

## `entropy_off` — Does search collapse recur?

- atoms 56 · entropy false · requireExtension true
- engine nuclei 43 → 29 topologies (collapse 0.325581)
- proposals 12 · extension-bearing 12 · mean utility 0.532848
- process-sensor in proposals: 6 · test-contract: 6 · fission: 1
- jaccard(proposal topologies, baseline): **1.000**
- report checksum `cyclotron1:91f5b0a0cc7d60adcc3701b9cfcaa205`

Top proposals:

1. `u=0.617` `process-sensor + test-contract + valence-compiler` (HYPOTHESIS)
2. `u=0.559` `canonical-serializer + evidence-ledger + schema-verifier + test-contract` (NUCLEUS)
3. `u=0.549` `bytecode-seal + canonical-serializer + evidence-ledger + process-sensor` (NUCLEUS)
4. `u=0.539` `bytecode-seal + canonical-serializer + evidence-ledger + process-sensor + schema-verifier` (NUCLEUS)
5. `u=0.533` `process-sensor + retrieval-index` (HYPOTHESIS)
6. `u=0.522` `process-sensor + valence-compiler` (NUCLEUS)
7. `u=0.518` `bytecode-seal + canonical-serializer + evidence-ledger + immutable-packet + test-contract` (NUCLEUS)
8. `u=0.516` `schema-verifier + test-contract` (HYPOTHESIS)
9. `u=0.514` `canonical-serializer + evidence-ledger + immutable-packet + schema-verifier + test-contract` (NUCLEUS)
10. `u=0.512` `fission-reactor + law-gate + molecule-generator` (NUCLEUS)
11. `u=0.510` `canonical-serializer + schema-verifier + test-contract` (HYPOTHESIS)
12. `u=0.506` `process-sensor + retrieval-index + valence-compiler` (HYPOTHESIS)

Extension atoms absent from shortlist: `subtlety-closed-loop`, `ccg-channel`, `treebank-metrics`, `entropy-dampener`, `canonical-tokenizer-atom`

## `extension_req_off` — Does the legacy bank monopolize discovery?

- atoms 56 · entropy true · requireExtension false
- engine nuclei 43 → 29 topologies (collapse 0.325581)
- proposals 12 · extension-bearing 1 · mean utility 0.23767
- process-sensor in proposals: 0 · test-contract: 1 · fission: 0
- jaccard(proposal topologies, baseline): **0.000**
- report checksum `cyclotron1:91f5b0a0cc7d60adcc3701b9cfcaa205`

Top proposals:

1. `u=0.200` `bytecode-seal + canonical-serializer + schema-verifier` (NUCLEUS)
2. `u=0.200` `schema-verifier + server-authority` (HYPOTHESIS)
3. `u=0.350` `semantic-memory + valence-compiler` (NUCLEUS)
4. `u=0.200` `bytecode-seal + canonical-serializer + immutable-packet + schema-verifier` (NUCLEUS)
5. `u=0.200` `bytecode-seal + canonical-serializer + evidence-ledger + schema-verifier` (NUCLEUS)
6. `u=0.200` `bytecode-seal + canonical-serializer + immutable-packet + semantic-memory` (NUCLEUS)
7. `u=0.200` `bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + server-authority` (NUCLEUS)
8. `u=0.200` `bytecode-seal + canonical-serializer + immutable-packet` (HYPOTHESIS)
9. `u=0.200` `canonical-serializer + evidence-ledger + schema-verifier` (NUCLEUS)
10. `u=0.200` `bytecode-seal + canonical-serializer` (HYPOTHESIS)
11. `u=0.200` `bytecode-seal + canonical-serializer + evidence-ledger + immutable-packet + schema-verifier` (NUCLEUS)
12. `u=0.502` `bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + test-contract` (NUCLEUS)

Extension atoms absent from shortlist: `subtlety-closed-loop`, `ccg-channel`, `treebank-metrics`, `entropy-dampener`, `canonical-tokenizer-atom`

## `no_process_sensor` — What architectures disappear?

- atoms 55 · entropy true · requireExtension true
- engine nuclei 53 → 29 topologies (collapse 0.45283)
- proposals 12 · extension-bearing 12 · mean utility 0.503525
- process-sensor in proposals: 0 · test-contract: 10 · fission: 1
- jaccard(proposal topologies, baseline): **0.143**
- report checksum `cyclotron1:25bfa4869d9f3d2453c5b18f2b85c759`

Top proposals:

1. `u=0.536` `canonical-serializer + evidence-ledger + immutable-packet + schema-verifier + treebank-metrics` (NUCLEUS)
2. `u=0.516` `schema-verifier + test-contract` (HYPOTHESIS)
3. `u=0.514` `canonical-serializer + evidence-ledger + schema-verifier + server-authority + test-contract` (NUCLEUS)
4. `u=0.514` `canonical-serializer + evidence-ledger + immutable-packet + test-contract` (NUCLEUS)
5. `u=0.513` `fission-reactor + law-gate + molecule-generator` (NUCLEUS)
6. `u=0.509` `canonical-serializer + schema-verifier + test-contract` (HYPOTHESIS)
7. `u=0.508` `bytecode-seal + canonical-serializer + hypothesis-registry + schema-verifier + test-contract` (NUCLEUS)
8. `u=0.507` `bytecode-seal + canonical-serializer + schema-verifier + test-contract` (NUCLEUS)
9. `u=0.502` `bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + test-contract` (NUCLEUS)
10. `u=0.497` `evidence-ledger + operator-registry + schema-verifier + test-contract` (HYPOTHESIS)
11. `u=0.465` `immutable-packet + schema-verifier + test-contract` (HYPOTHESIS)
12. `u=0.461` `canonical-serializer + immutable-packet + schema-verifier + test-contract` (HYPOTHESIS)

Extension atoms absent from shortlist: `subtlety-fingerprint`, `ccg-channel`, `precedent-compose`, `entropy-dampener`, `canonical-tokenizer-atom`

## `no_evidence_atoms` — What basin replaces them?

- atoms 48 · entropy true · requireExtension true
- engine nuclei 92 → 35 topologies (collapse 0.619565)
- proposals 12 · extension-bearing 12 · mean utility 0.498319
- process-sensor in proposals: 0 · test-contract: 9 · fission: 3
- jaccard(proposal topologies, baseline): **0.143**
- report checksum `cyclotron1:db2e52199c64ce0c95a853f8a4bd3f47`

Top proposals:

1. `u=0.556` `correspondence-registry + fission-reactor + law-gate` (NUCLEUS)
2. `u=0.516` `schema-verifier + test-contract` (HYPOTHESIS)
3. `u=0.513` `fission-reactor + law-gate + molecule-generator` (NUCLEUS)
4. `u=0.509` `canonical-serializer + schema-verifier + test-contract` (HYPOTHESIS)
5. `u=0.507` `bytecode-seal + canonical-serializer + schema-verifier + test-contract` (NUCLEUS)
6. `u=0.507` `fission-reactor + law-gate + molecule-generator + semantic-memory` (NUCLEUS)
7. `u=0.504` `bytecode-seal + canonical-serializer + immutable-packet + schema-verifier + test-contract` (NUCLEUS)
8. `u=0.501` `bytecode-seal + immutable-packet + schema-verifier + test-contract` (NUCLEUS)
9. `u=0.480` `canonical-serializer + immutable-packet + operator-registry + schema-verifier + test-contract` (HYPOTHESIS)
10. `u=0.465` `immutable-packet + schema-verifier + test-contract` (HYPOTHESIS)
11. `u=0.463` `canonical-serializer + immutable-packet + schema-verifier + test-contract` (HYPOTHESIS)
12. `u=0.461` `canonical-serializer + schema-verifier + server-authority + test-contract` (HYPOTHESIS)

Extension atoms absent from shortlist: `raid-healer`, `ccg-channel`, `treebank-metrics`, `entropy-dampener`


## Findings (this run)

| condition | jaccard vs baseline | answer |
|---|---|---|
| shuffled_ports | **0.043** | Topology **matters**. Port derangement destroys proposal overlap. |
| random_evidence | **1.000** | Evidence paths **do not** move engine ranking (grounding is label-based). Utility realization still sees paths at filter time when required. |
| entropy_off | **1.000** | At 8k trials on this bank, occupancy entropy **did not** change the proposal set vs baseline (collapse 0.33). Collapse recurrence is **not** demonstrated at this scale. |
| extension_req_off | **0.000** | Chemistry-only ranking (no utility extension bias) has **zero** overlap with utility proposals — legacy seal basin monopolizes unfiltered discovery. |
| no_process_sensor | **0.143** | process-sensor architectures **disappear** (0 of 12). Not a synonym of remaining atoms. |
| no_evidence_atoms | **0.143** | Basin shifts; collapse rises to **0.62**. Seal/test/fission remain. |

### Architectural hit rate (live)

```
implementation_survival_rate = 1 / 1 = 1.0000
control_survival_rate        = not yet measured (0 placebo architectures built)
```

First selected nucleus `process-sensor + valence-compiler` **survived** design + tests + adversarial proof.
n=1. Do not overclaim.

## Architectural hit rate (ledger)

```
implementation_survival_rate =
  proposals_surviving(design + tests + adversarial proof)
  / proposals_selected_for_implementation
```

Current ledger: `docs/superpowers/evidence/ARCHITECTURAL-HIT-RATE.json`

- selected: **1**
- survived: **1**
- rate: **1.0000**
- control survival (topology-matched random): **0/0** (n/a)

First selected proposal: `process-sensor + valence-compiler` — wired because
it makes every subsequent experiment harder to fool, not because it is flashy.

## Interpretation rules (pre-registered)

| if… | then… |
|---|---|
| shuffled_ports jaccard ≈ 1.0 with baseline | topology is not load-bearing; ports are decoration |
| shuffled_ports jaccard ≪ 1.0 | port topology shapes discovery |
| random_evidence jaccard ≈ 1.0 | evidence paths do not move engine ranking (expected if grounding is label-based) |
| entropy_off collapse ≫ baseline collapse | search collapse recurs without occupancy entropy |
| extension_req_off seal-heavy ≈ proposalCount | legacy bank monopolizes unfiltered discovery |
| no_process_sensor drops process-sensor architectures | those proposals were not redundant synonyms |
| no_evidence_atoms basin shifts to seal/linguistic only | evidence atoms were carrying a real basin |

## Repro

```bash
node scripts/ablate-codebase-nuclei.mjs --trials=8000 --seed=6045712
```

