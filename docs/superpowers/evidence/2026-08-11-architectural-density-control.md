# Architectural Density Control

**Contract:** `PB-ARCHITECTURAL-DENSITY-CONTROL-v1`
**Trials/arm:** 8000 · **Seed:** `0x44454e53`
**Checksum:** `archdensity1:089d5b9abc017b57812436cf7c01dc2d547179cc44ae0847c6cee27cd8cdb6dd`

## Question

Is the Cyclotron imposing a **mass penalty**, or something closer to an
**architectural information-density** requirement?

| arm | structure | expected if density matters |
|---|---|---|
| CLIQUE | large + maximally connected + generic | stays HYPOTHESIS / never heavy NUCLEUS |
| DENSITY | large + coherent + novel + restrained + real evidence | can crown NUCLEUS at size 5–6 |

## Interpretation

- NEGATIVE ARM INADMISSIBLE — VACUOUS: 0 NUCLEUS was guaranteed by configuration, not measured — nucleusScoreFloor=0.7195695 > arm ceiling 0.715513. No crown/no-crown contrast may be drawn from this arm. The CLIQUE/DENSITY contrast therefore cannot attribute anything to architecture: the two arms differ in bank size, topology, labels, grounding spread, domain distribution and evidence diversity at once, and the floor lands between their score ceilings. Use a single-variable mutant (same atoms, rewired ports) instead.
- PARTIAL: DENSITY crowns 25 NUCLEUS at size≥5, which refutes a PURE MASS VETO on its own — that conclusion needs no contrast and stands. The attribution to "density" does not.
- CLIQUE at max legal size 6: 0/2 crowned (ceiling 0.6713 vs floor 0.7195695).
- DENSITY at max legal size 6: 1/41 crowned (ceiling 0.7210 vs floor 0.7195695).
- TOPOLOGY ISOLATED (single variable): rewiring the DENSITY atoms into a clique — same labels, evidence, grounding, domains and bank size — moves the score ceiling 0.725747 → 0.713392 (Δ=0.012355) and nuclei 33 → 0. The ceiling delta is the load-bearing number: it does not depend on where the floor sits. Architecture is worth 1.24 points of finalScore in this bank.
- DESIGNED TOPOLOGY LOST: the intended 6-atom pipeline (inventory-seed → valence-compiler → feasibility-scorer → process-sensor → frontier-process-gate → schema-seal) does not appear in the DENSITY top-10. The arm was built around it; the winners are smaller subsets of it. The diagram documents the design, not the result.

## Contrast

| metric | CLIQUE | DENSITY | MUTANT (density atoms, clique wiring) |
|---|---|---|---|
| nuclei (any size) | 0 | 33 | 0 |
| heavy nuclei (size ≥ 5) | 0 | 25 | 0 |
| nuclei at max size 6 | 0 | 1 | 0 |
| shortlisted | 256 | 256 | 256 |
| **arm score ceiling** (floor 0.7195695) | **0.715513** | **0.725747** | **0.713392** |
| could this arm crown at all? | **NO** | yes | **NO** |
| report checksum | `cyclotron1:9d9bc3aa8fd769c363389424c84ee71c` | `cyclotron1:b009f26c0de76ca850877eaf904f5934` | `cyclotron1:0b3a6cfe590525d8c6f87f9496cd9b1c` |

The ceiling row is the precondition for reading the nuclei row. If an arm's ceiling
sits below the floor, its zero is a property of the configuration.

## ARM CLIQUE

| size | n | NUCLEUS | HYPOTHESIS | REFUSED | max final | max novelty |
|---|---|---|---|---|---|---|
| 2 | 98 | 0 | 98 | 0 | 0.7155 | 0.4275 |
| 3 | 113 | 0 | 113 | 0 | 0.7093 | 0.4214 |
| 4 | 33 | 0 | 33 | 0 | 0.7026 | 0.3998 |
| 5 | 10 | 0 | 10 | 0 | 0.6895 | 0.3912 |
| 6 | 2 | 0 | 2 | 0 | 0.6713 | 0.3665 |

Top candidates:

- **HYPOTHESIS** size=2 final=0.7155 nov=0.3861 E=0.8819 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7155 nov=0.3861 E=0.8819 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7148 nov=0.3783 E=0.8807 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7148 nov=0.3783 E=0.8807 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7143 nov=0.3725 E=0.8799 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7143 nov=0.3725 E=0.8799 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7131 nov=0.3592 E=0.8779 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7131 nov=0.3592 E=0.8779 feas=0.4778 `clique-atom-4 + clique-atom-9`
- **HYPOTHESIS** size=2 final=0.7108 nov=0.3762 E=0.8724 feas=0.4799 `clique-atom-3 + clique-atom-4`
- **HYPOTHESIS** size=2 final=0.7108 nov=0.3762 E=0.8724 feas=0.4799 `clique-atom-3 + clique-atom-4`

## ARM DENSITY

| size | n | NUCLEUS | HYPOTHESIS | REFUSED | max final | max novelty |
|---|---|---|---|---|---|---|
| 2 | 22 | 0 | 22 | 0 | 0.7191 | 0.4364 |
| 3 | 25 | 0 | 25 | 0 | 0.7203 | 0.4232 |
| 4 | 65 | 8 | 57 | 0 | 0.7257 | 0.4088 |
| 5 | 103 | 24 | 79 | 0 | 0.7250 | 0.4115 |
| 6 | 41 | 1 | 40 | 0 | 0.7210 | 0.4047 |

Top candidates:

- **NUCLEUS** size=4 final=0.7257 nov=0.4088 E=0.8813 feas=0.5035 `feasibility-scorer + frontier-process-gate + schema-seal + valence-compiler`
- **NUCLEUS** size=4 final=0.7252 nov=0.4027 E=0.8804 feas=0.5035 `feasibility-scorer + frontier-process-gate + schema-seal + valence-compiler`
- **NUCLEUS** size=5 final=0.7250 nov=0.4115 E=0.8813 feas=0.5017 `feasibility-scorer + frontier-process-gate + process-sensor + schema-seal + valence-compiler`
- **NUCLEUS** size=4 final=0.7249 nov=0.3888 E=0.8803 feas=0.5029 `feasibility-scorer + process-sensor + schema-seal + valence-compiler`
- **NUCLEUS** size=5 final=0.7248 nov=0.4088 E=0.8809 feas=0.5017 `feasibility-scorer + frontier-process-gate + process-sensor + schema-seal + valence-compiler`
- **NUCLEUS** size=5 final=0.7245 nov=0.4060 E=0.8805 feas=0.5017 `feasibility-scorer + frontier-process-gate + process-sensor + schema-seal + valence-compiler`
- **NUCLEUS** size=4 final=0.7239 nov=0.3874 E=0.8781 feas=0.5035 `feasibility-scorer + frontier-process-gate + schema-seal + valence-compiler`
- **NUCLEUS** size=5 final=0.7238 nov=0.3981 E=0.8793 feas=0.5017 `feasibility-scorer + frontier-process-gate + process-sensor + schema-seal + valence-compiler`
- **NUCLEUS** size=4 final=0.7238 nov=0.3763 E=0.8784 feas=0.5029 `feasibility-scorer + process-sensor + schema-seal + valence-compiler`
- **NUCLEUS** size=4 final=0.7237 nov=0.3861 E=0.8779 feas=0.5035 `feasibility-scorer + frontier-process-gate + schema-seal + valence-compiler`

## ARM MUTANT

| size | n | NUCLEUS | HYPOTHESIS | REFUSED | max final | max novelty |
|---|---|---|---|---|---|---|
| 2 | 66 | 0 | 66 | 0 | 0.7134 | 0.3040 |
| 3 | 141 | 0 | 141 | 0 | 0.7104 | 0.2283 |
| 4 | 34 | 0 | 34 | 0 | 0.7099 | 0.2312 |
| 5 | 15 | 0 | 15 | 0 | 0.7073 | 0.2211 |

Top candidates:

- **HYPOTHESIS** size=2 final=0.7134 nov=0.2150 E=0.8602 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7134 nov=0.2150 E=0.8602 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7132 nov=0.2123 E=0.8598 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7132 nov=0.2123 E=0.8598 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7109 nov=0.1872 E=0.8561 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7109 nov=0.1872 E=0.8561 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7105 nov=0.1824 E=0.8554 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=2 final=0.7105 nov=0.1824 E=0.8554 feas=0.5036 `feasibility-scorer + schema-seal`
- **HYPOTHESIS** size=3 final=0.7104 nov=0.2054 E=0.8541 feas=0.5051 `feasibility-scorer + schema-seal + valence-compiler`
- **HYPOTHESIS** size=3 final=0.7104 nov=0.2054 E=0.8541 feas=0.5051 `feasibility-scorer + schema-seal + valence-compiler`

## DENSITY arm design

Novel extension: `frontier-process-gate` → `codex/core/pixelbrain/frontier-process-gate.js`

Intended size-6 topology:

```
inventory-seed → valence-compiler → feasibility-scorer → process-sensor → frontier-process-gate → schema-seal
```

Ports are a **pipeline with one back-edge** (process-sensor seeks
validation-verdict; gate offers it). Not a clique.

## Repro

```bash
node scripts/architectural-density-control.mjs --trials=8000
```

## Honest limits

- Both arms are still engineered banks; this is a controlled contrast, not field data.
- Labels are chosen for chemistry-friendly encyclopedia phrasing — that is part of the positive control, not hidden.
- Gate reachability is now checked per arm (PB-GATE-REACHABILITY-v1), not just for DENSITY. An arm whose ceiling is below 0.7195695 is marked inadmissible above.
- The arms differ in bank size, topology, labels, grounding spread, domain distribution and evidence diversity simultaneously. This contrast cannot attribute an effect to any one of them; a single-variable mutant can.

