# Gap Grammar Simulation — 2026-08-08

**Goal:** Discover new grammatical chemical laws targeting **coverage** gaps.  
**Method:** Mine unlicensed adjacent pairs on unparsed DEV sentences → propose only
via Result Conservation or named gap constructions → blind DEV/TEST reactor.

## Pipeline

```
coverage failures
    → unlicensed adjacent maximal pairs
    → propose (projection | named gap construction)
    → DEV protect floors + gain
    → TEST holdout
    → nuclei (for human Grimoire review — not auto-merged)
```

## Gap mining (DEV, no spanning S)

Top unlicensed pairs:

| Count | Pair |
|---|---|
| 376 | \`NP+NP\` |
| 210 | \`S+NP\` |
| 201 | \`NP+S\` |
| 162 | \`NP+N\` |
| 157 | \`S+TO\` |
| 153 | \`N+NP\` |
| 146 | \`PROPN+NP\` |
| 141 | \`NP+PROPN\` |
| 115 | \`S+S\` |
| 107 | \`TO+NP\` |
| 92 | \`S+P\` |
| 85 | \`PROPN+PROPN\` |
| 84 | \`N+S\` |
| 74 | \`S+DET\` |
| 74 | \`N+N\` |
| 66 | \`PROPN+S\` |
| 62 | \`S+N\` |
| 61 | \`PROPN+N\` |
| 60 | \`NP+ADJ\` |
| 58 | \`VP+NP\` |

Pairs with no legal proposal: 34

## Candidates reacted: 17

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | 22.5% (451) | 22.9% (476) |
| Root | 613 | 644 |
| Ensemble | 138 | 130 |
| Span / nsubj | 76.26% / 88.88% | 75.65% / 88.28% |

## DEV funnel

| Fate | n |
|---|---|
| SURVIVE | 16 |
| NO-GAIN | 1 |
| PROTECT-FAIL | 0 |
| EXPLODE | 0 |

## Held-out nuclei

### \`NP|NP|NP\` head=0

- law: gap:nominal-juxtaposition
- status proposal: approximation
- rationale: Adjacent NPs (names, titles, flat multiword nominals).
- gap count (unparsed adjacency): 376
- DEV: cov 451→692 (Δ241), root 613→923, ens 138→230, spanΔ 3.92pp
- TEST: cov 476→720 (Δ244), root 644→958, ens 130→215, spanΔ 3.57pp

### \`NP|S|S\` head=1

- law: gap:left-nominal-plus-clause
- status proposal: approximation
- rationale: Subject/topic NP immediately left of an already-built S; matrix is the S.
- gap count (unparsed adjacency): 201
- DEV: cov 451→662 (Δ211), root 613→821, ens 138→200, spanΔ 1.61pp
- TEST: cov 476→656 (Δ180), root 644→821, ens 130→183, spanΔ 1.31pp

### \`S|NP|S\` head=0

- law: gap:clause-plus-right-nominal
- status proposal: approximation
- rationale: Trailing NP after a complete S (titles, appositions, fringe).
- gap count (unparsed adjacency): 210
- DEV: cov 451→611 (Δ160), root 613→773, ens 138→144, spanΔ 1.42pp
- TEST: cov 476→638 (Δ162), root 644→806, ens 130→141, spanΔ 1.21pp

### \`S|S|S\` head=0

- law: gap:asyndetic-clause-sequence
- status proposal: approximation
- rationale: Adjacent full clauses without coordinator; first clause technical head (UD conj-like).
- gap count (unparsed adjacency): 115
- DEV: cov 451→590 (Δ139), root 613→752, ens 138→156, spanΔ 0.90pp
- TEST: cov 476→621 (Δ145), root 644→789, ens 130→148, spanΔ 0.98pp

### \`N|N|N\` head=0

- law: gap:noun-noun-compound
- status proposal: approximation
- rationale: English N-N compound; left technical head (UD compound).
- gap count (unparsed adjacency): 74
- DEV: cov 451→573 (Δ122), root 613→750, ens 138→189, spanΔ 2.13pp
- TEST: cov 476→612 (Δ136), root 644→797, ens 130→175, spanΔ 2.06pp

### \`S|VP|S\` head=0

- law: gap:clause-plus-vp
- status proposal: approximation
- rationale: S followed by VP fragment.
- gap count (unparsed adjacency): 0
- DEV: cov 451→555 (Δ104), root 613→717, ens 138→151, spanΔ 0.69pp
- TEST: cov 476→573 (Δ97), root 644→741, ens 130→136, spanΔ 0.65pp

### \`N|S|S\` head=1

- law: gap:bare-noun-plus-clause
- status proposal: approximation
- rationale: Bare N left of S when NP lift did not feed subject position.
- gap count (unparsed adjacency): 84
- DEV: cov 451→545 (Δ94), root 613→706, ens 138→168, spanΔ 0.72pp
- TEST: cov 476→573 (Δ97), root 644→738, ens 130→155, spanΔ 0.73pp

### \`VP|S|S\` head=1

- law: gap:vp-plus-clause
- status proposal: approximation
- rationale: VP adjacent to S (imperative/control-ish residual).
- gap count (unparsed adjacency): 30
- DEV: cov 451→508 (Δ57), root 613→670, ens 138→140, spanΔ 0.39pp
- TEST: cov 476→527 (Δ51), root 644→695, ens 130→131, spanΔ 0.41pp

### \`PROPN|N|N\` head=0

- law: gap:proper-plus-noun
- status proposal: approximation
- rationale: Name + common noun sequence.
- gap count (unparsed adjacency): 61
- DEV: cov 451→492 (Δ41), root 613→668, ens 138→156, spanΔ 1.17pp
- TEST: cov 476→520 (Δ44), root 644→694, ens 130→147, spanΔ 1.15pp

### \`PROPN|S|S\` head=1

- law: gap:proper-plus-clause
- status proposal: approximation
- rationale: Proper name left of S.
- gap count (unparsed adjacency): 66
- DEV: cov 451→477 (Δ26), root 613→638, ens 138→141, spanΔ 0.22pp
- TEST: cov 476→493 (Δ17), root 644→661, ens 130→134, spanΔ 0.16pp

### \`PROPN|PROPN|N\` head=0

- law: gap:proper-name-sequence
- status proposal: approximation
- rationale: Multi-token proper names before NP lift.
- gap count (unparsed adjacency): 85
- DEV: cov 451→474 (Δ23), root 613→674, ens 138→144, spanΔ 0.89pp
- TEST: cov 476→506 (Δ30), root 644→700, ens 130→139, spanΔ 0.89pp

### \`N|PROPN|N\` head=1

- law: gap:noun-plus-proper
- status proposal: approximation
- rationale: Common noun + name.
- gap count (unparsed adjacency): 45
- DEV: cov 451→472 (Δ21), root 613→651, ens 138→153, spanΔ 0.78pp
- TEST: cov 476→515 (Δ39), root 644→702, ens 130→142, spanΔ 0.93pp

### \`DET|NP|NP\` head=1

- law: gap:determiner-on-np
- status proposal: approximation
- rationale: DET attaching to a completed NP (residual after ADJ+N stacks).
- gap count (unparsed adjacency): 46
- DEV: cov 451→461 (Δ10), root 613→623, ens 138→142, spanΔ 0.27pp
- TEST: cov 476→482 (Δ6), root 644→649, ens 130→130, spanΔ 0.27pp

### \`COMMA|S|S\` head=1

- law: gap:comma-led-clause
- status proposal: scaffold
- rationale: Leading comma before S in list/afterthought shapes.
- gap count (unparsed adjacency): 31
- DEV: cov 451→454 (Δ3), root 613→616, ens 138→138, spanΔ 0.55pp
- TEST: cov 476→476 (Δ0), root 644→644, ens 130→130, spanΔ 0.68pp

### \`ADJ|PUNCT|ADJ\` head=0

- law: gap:adj-punct-absorb
- status proposal: grammar
- rationale: Seatbelt: adjectival fragments with terminal punct.
- gap count (unparsed adjacency): 43
- DEV: cov 451→453 (Δ2), root 613→622, ens 138→138, spanΔ 0.04pp
- TEST: cov 476→476 (Δ0), root 644→650, ens 130→130, spanΔ 0.03pp

### \`APPOS|NP|APPOS\` head=0

- law: gap:appos-extend
- status proposal: scaffold
- rationale: Extend apposition chain.
- gap count (unparsed adjacency): 39
- DEV: cov 451→452 (Δ1), root 613→618, ens 138→138, spanΔ 0.05pp
- TEST: cov 476→478 (Δ2), root 644→654, ens 130→131, spanΔ 0.07pp


## DEV survivors that failed TEST

_none_

## Interpretation (after measurement)

Nuclei here are **empirical survivors**, not Grimoire law until stamped.
Prefer promoting high Δcoverage / Δroot with small spanΔ and named rationale.
Scaffold proposals that only inflate coverage via list junk should stay scaffold or die.

## Repro

```bash
node scripts/gap-grammar-simulation.mjs
```
