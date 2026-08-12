# Cyclotron C-Sensor — break-it-on-purpose proof

**Contract:** `PB-CYCLOTRON-SENSOR-v1`  
**Date:** 2026-08-11  
**Status:** observed on real 2000-trial runs  

Until DEVIATION has been observed on purpose, no claim that the sensor works
may be made. This document records that observation.

## Setup

- Trials: 2000  
- Seed: `6045712` (`0x5c4010` is the ritual default; this proof uses 6045712 as preregistered)  
- Baseline report: `/tmp/c-sensor-baseline.json`  
- Approved input class:
  `inclass1:c757f76328e39ac66d33dc78c6f6cb260082c386b6aec85c1205e61444639963`  
- Baseline report checksum: `cyclotron1:edce675e94066adb6643f51fcd7a713a`  
- Baseline receipt: `cyclosensor1:34470930f4a93c947c348941390a0d40bc4890ee1ac8b6f5992789469f0d0c71`  
- Ledger: `docs/superpowers/evidence/CYCLOTRON-SENSOR-LEDGER.json`  
- Approval reason: `2000-trial reference run for the C-sensor proof`

## Observed verdicts

### 1. Approve first reading → `NO_BASELINE` then `APPROVED`

```
node scripts/semantic-valence-cyclotron.mjs --trials=2000 --seed=6045712 \
  --out=/tmp/c-sensor-baseline.json
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-baseline.json \
  --approve --reason="2000-trial reference run for the C-sensor proof"
```

`VERDICT NO_BASELINE`, then baseline written. Exit 0.

### 2. Identical replay → `STABLE` (no false positive)

```
node scripts/semantic-valence-cyclotron.mjs --trials=2000 --seed=6045712 \
  --out=/tmp/c-sensor-replay.json
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-replay.json
```

```
inputClass  inclass1:c757f76328e39ac66d33dc78c6f6cb260082c386b6aec85c1205e61444639963
receipt     cyclosensor1:34470930f4a93c947c348941390a0d40bc4890ee1ac8b6f5992789469f0d0c71
VERDICT     STABLE
exit=0
```

Identical inputs produced a byte-identical receipt seal. Determinism holds.

### 3. Weight perturbation in a worktree → `ABSTAIN` (not DEVIATION)

In `/tmp/c-sensor-perturbed` (git worktree at HEAD, with the untracked cyclotron
modules and working-tree `concept-chemistry.js` copied in so the run could
execute), `WEIGHTS_V2.relation` was changed from `0.45` → `0.44` and
`coherence` from `0.15` → `0.16` (still sum to 1.0).

```
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-perturbed.json
```

```
inputClass  inclass1:66d5711e252b92d1ae9def47ca21d2fc834257cbce03a10943b06b56698c01d1
VERDICT     ABSTAIN (INPUT_CLASS_CHANGED)
  input changed  atomBankChecksum
  input changed  chemistryWeights
  input changed  groundingIndexChecksum
exit=0
```

Weights are part of the input class via `chemistryProvenance` stamped into the
report. Changing them is a *declared* class change, not silent code drift, so
the sensor abstains rather than crying DEVIATION. That distinction is the whole
point of the input class.

The worktree also differed in encyclopedia substrate (HEAD vs dirty working tree),
so `atomBankChecksum` and `groundingIndexChecksum` moved as well. Both are input
fields; both correctly produced ABSTAIN, never DEVIATION.

### 4. Implementation drift (not in the input class) → `DEVIATION`

Encyclopedia was synced into the worktree so substrate checksums matched the
baseline. Weights were restored. Then `relationScore()` was altered to round
to 4 decimal places — implementation detail, not declared provenance.

```
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-drift.json
```

```
inputClass  inclass1:c757f76328e39ac66d33dc78c6f6cb260082c386b6aec85c1205e61444639963
receipt     cyclosensor1:eca04c38efdee7a292b699f3ee387635a29343eef68b3197462cfac12857052e
VERDICT     DEVIATION
  output moved   meanChemistryFeasibility: 0.34116171875 -> 0.3411625
  output moved   meanFinalScore: 0.667286539062 -> 0.667286804687
  output moved   reportChecksum: "cyclotron1:edce675e94066adb6643f51fcd7a713a" -> "cyclotron1:4a5539e221d00f8eac83827264400fcb"
  output moved   shortlistDigest: "shortlist1:d9adaef0e556cff4947f1cc5bb944b2f70f61c68cfa0ec8e78edca9b946a3734" -> "shortlist1:3bf7484abfa84f2358ce353d1a2ff6a3f7eb6f97f1c0cfdb4e875e81c7b3f0b3"
exit=1
```

Inputs matched. Outputs moved. The sensor can fail. That is the proof.

### 5. Worktree removed → sticky-state check `STABLE`

```
git worktree remove /tmp/c-sensor-perturbed --force
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-replay.json
```

```
VERDICT     STABLE
exit=0
```

No residual state from the perturbed tree.

## What the two perturbations prove

| perturbation | in input class? | verdict | meaning |
|---|---|---|---|
| WEIGHTS_V2 relation/coherence | yes (`chemistryWeights`) | `ABSTAIN` | class changed; do not call it drift |
| `relationScore` rounding to 4 places | no | `DEVIATION` | same class, different process |

A2 audits artifacts at rest. C audits the process that produces them. Both are
required; neither replaces the other.

## Repro

    node scripts/semantic-valence-cyclotron.mjs --trials=2000 --seed=6045712 --out=/tmp/c-sensor-replay.json
    node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-replay.json
    npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js
    npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js
    npx vitest run tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js
