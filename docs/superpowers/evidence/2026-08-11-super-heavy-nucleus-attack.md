# Super-Heavy Nucleus Attack

**Contract:** `PB-SUPER-HEAVY-ATTACK-v1`
**Trials:** 5000 · **Seed:** `0x48454156`
**Report checksum:** `cyclotron1:7a36a6410a1c9e227dd49a7f071f07d8`
**Attack checksum:** `superheavy1:9216400938dab53483b1b512dd6f7c98263891a614bf6dfa4b92ed73962f5eb9`

## Question

If you artificially create a super-heavy nucleus, will the Cyclotron reject it?

## Verdict

- P1 HOLD: super-heavy above size 6 is rejected at config (hard cap 6).
- P2 HOLD: 1 size-6 molecules shortlisted; 0 promoted to NUCLEUS (1 HYPOTHESIS, 0 REFUSED). Super-heavy is not crowned.
- P3 top kill gates on size-6 non-NUCLEUS: noveltyGteFloor=1 (fires on 127/256 of ALL sizes), finalScoreGteFloor=1 (fires on 231/256 of ALL sizes)
- P3 heaviness tax (MEAN finalScore): size2=0.6761 → size6=0.6550 (Δ=0.0212 — heavier scores lower). Max-based Δ=0.0440 is an order statistic over n=122 vs n=1 and is NOT evidence of a tax.

## P0 — Gate reachability (can this bank clear the nucleus floors at all?)

| gate | floor | arm ceiling | cleared by | reachable |
|---|---|---|---|---|
| `nucleusScoreFloor` | 0.688738 | 0.698936 | 25/256 | yes |
| `nucleusNoveltyFloor` | 0.189864 | 0.217335 | 129/256 | yes |

**Verdict admissible:** yes

## P1 — Config ceiling (size > 6)

- rejected: **true**
- detail: `maxMoleculeSize must be an integer in 2..6`

## P2 — Max legal heaviness (size = 6, clique bank)

| size | shortlisted | NUCLEUS | HYPOTHESIS | REFUSED | max finalScore | max energy |
|---|---|---|---|---|---|---|
| 2 | 122 | 0 | 122 | 0 | 0.6989 | 0.8537 |
| 3 | 93 | 0 | 93 | 0 | 0.6912 | 0.8459 |
| 4 | 35 | 0 | 35 | 0 | 0.6857 | 0.8417 |
| 5 | 5 | 0 | 5 | 0 | 0.6706 | 0.8320 |
| 6 | 1 | 0 | 1 | 0 | 0.6550 | 0.8302 |

Size-6: shortlisted **1**, NUCLEUS **0**, HYPOTHESIS **1**, REFUSED **0**.

## P3 — Which gates kill heavies?

| failed gate | count among size-6 non-NUCLEUS | count among ALL shortlisted |
|---|---|---|
| `noveltyGteFloor` | 1/1 | 127/256 |
| `finalScoreGteFloor` | 1/1 | 231/256 |

The right-hand column is the discrimination check: a gate that fires on the whole
shortlist is not selecting against heaviness.

### Example heavies

- size 6 **HYPOTHESIS** final=0.6550 nov=0.1838 feas=0.4046 failed=[noveltyGteFloor, finalScoreGteFloor] `heavy-atom-1 + heavy-atom-3 + heavy-atom-4 + heavy-atom-6 + heavy-atom-8 + heavy-atom-9`
- size 5 **HYPOTHESIS** final=0.6706 nov=0.1940 feas=0.4418 failed=[finalScoreGteFloor] `heavy-atom-4 + heavy-atom-5 + heavy-atom-7 + heavy-atom-8 + heavy-atom-9`
- size 5 **HYPOTHESIS** final=0.6592 nov=0.1430 feas=0.4161 failed=[noveltyGteFloor, finalScoreGteFloor] `heavy-atom-11 + heavy-atom-3 + heavy-atom-4 + heavy-atom-8 + heavy-atom-9`
- size 5 **HYPOTHESIS** final=0.6592 nov=0.1430 feas=0.4161 failed=[noveltyGteFloor, finalScoreGteFloor] `heavy-atom-11 + heavy-atom-3 + heavy-atom-4 + heavy-atom-8 + heavy-atom-9`
- size 5 **HYPOTHESIS** final=0.6523 nov=0.1816 feas=0.3956 failed=[noveltyGteFloor, finalScoreGteFloor] `heavy-atom-11 + heavy-atom-4 + heavy-atom-7 + heavy-atom-8 + heavy-atom-9`
- size 5 **HYPOTHESIS** final=0.6498 nov=0.2105 feas=0.3925 failed=[finalScoreGteFloor] `heavy-atom-1 + heavy-atom-2 + heavy-atom-7 + heavy-atom-8 + heavy-atom-9`

## Method

1. Artificial **clique atom bank** (12 atoms, 6 domains) so missing edges cannot explain rejection.
2. Engine hard cap probe: `maxMoleculeSize=12` must throw.
3. Run at `maxMoleculeSize=6` (legal maximum) and tally verdicts by size.
4. Autopsy nucleus predicate components on every size ≥ 5 shortlist row.

## Repro

```bash
node scripts/super-heavy-nucleus-attack.mjs --trials=5000
```

## Honest limits

- Clique bank is synthetic; chemistry labels are borrowed encyclopedia phrases, not real module evidence paths.
- "Super heavy" cannot exceed size 6 inside this engine — that is itself a rejection mechanism.
- Shortlist already requires valenceSatisfaction=1 and energy > control bar; failures before shortlist are not in P3.

