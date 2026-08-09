# Extra-Bond Reactor — Blind Screen — 2026-08-08

**Protocol:** all synthesizer extras (not in ACTIVE_CONSTRUCTIONS) collided on DEV;
survivors re-collided on TEST. No hand-picking.

**Candidates:** 78  
**Baseline BONDS:** 68

## Protect floors

- contiguous span recall ≥ baseline − 0.5 pp  
- nsubj span recall ≥ baseline − 0.5 pp  
- mean events ≤ 1.5 × baseline  
- max events ≤ max(2× baseline max, baseline max + 5000)  

## Survival on DEV

Must pass protect **and** improve at least one of: rootBuilt, goldInEnsemble, parsed (absolute +1).

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | 22.5% (451/2001) | 22.9% (476/2077) |
| Root built | 613 | 644 |
| Gold-in-ensemble | 138/262 | 130/249 |
| Span recall | 76.26% | 75.65% |
| nsubj recall | 88.88% | 88.28% |
| Mean events | 86.6 | 82.9 |

## DEV funnel

| Bucket | n |
|---|---|
| Input extras | 78 |
| Protect fail (non-explosion) | 0 |
| Explode / throw | 0 |
| No gain | 34 |
| **DEV survivors** | **44** |
| Held-out FAIL | 0 |
| **Held-out PASS (synthesized nuclei)** | **44** |

## Held-out survivors

### \`ADJ|N|ADJ\` head=0

- law: order-prior+projection
- DEV: root 613→664, ens 138→160, cov 451→494
- TEST: root 644→693, ens 130→155, cov 476→520

### \`ADJ|N|NP\` head=0

- law: order-prior+projection
- DEV: root 613→613, ens 138→139, cov 451→451
- TEST: root 644→644, ens 130→135, cov 476→476

### \`ADV|ADJ|ADV\` head=0

- law: order-prior+projection
- DEV: root 613→626, ens 138→142, cov 451→463
- TEST: root 644→652, ens 130→132, cov 476→485

### \`ADV|COMMA|ADV\` head=0

- law: comma-scaffold
- DEV: root 613→614, ens 138→138, cov 451→452
- TEST: root 644→644, ens 130→130, cov 476→477

### \`ADV|S|ADV\` head=0

- law: order-prior+projection
- DEV: root 613→679, ens 138→173, cov 451→516
- TEST: root 644→724, ens 130→169, cov 476→554

### \`ADV|VP|ADV\` head=0

- law: order-prior+projection
- DEV: root 613→650, ens 138→150, cov 451→488
- TEST: root 644→686, ens 130→141, cov 476→518

### \`AUX|NP|NP\` head=1

- law: order-prior+projection
- DEV: root 613→614, ens 138→139, cov 451→452
- TEST: root 644→649, ens 130→130, cov 476→481

### \`CONJ|NP|NP\` head=1

- law: order-prior+projection
- DEV: root 613→613, ens 138→141, cov 451→453
- TEST: root 644→645, ens 130→133, cov 476→479

### \`CONJ|NP|S\` head=1

- law: order-prior+projection
- DEV: root 613→615, ens 138→138, cov 451→455
- TEST: root 644→646, ens 130→130, cov 476→480

### \`CONJ|VP|VP\` head=1

- law: order-prior+projection
- DEV: root 613→614, ens 138→139, cov 451→454
- TEST: root 644→645, ens 130→132, cov 476→478

### \`COP|ADJ|ADJ\` head=1

- law: order-prior+projection
- DEV: root 613→614, ens 138→138, cov 451→452
- TEST: root 644→649, ens 130→131, cov 476→481

### \`COP|NP|NP\` head=1

- law: order-prior+projection
- DEV: root 613→614, ens 138→138, cov 451→452
- TEST: root 644→647, ens 130→130, cov 476→479

### \`DET|N|N\` head=1

- law: order-prior+projection
- DEV: root 613→627, ens 138→140, cov 451→464
- TEST: root 644→662, ens 130→132, cov 476→490

### \`FRONTED|S|FRONTED\` head=0

- law: order-prior+projection
- DEV: root 613→616, ens 138→138, cov 451→454
- TEST: root 644→651, ens 130→130, cov 476→483

### \`INV|NP|INV\` head=1

- law: order-prior+projection
- DEV: root 613→620, ens 138→138, cov 451→458
- TEST: root 644→658, ens 130→130, cov 476→490

### \`INV|VP|INV\` head=1

- law: order-prior+projection
- DEV: root 613→618, ens 138→138, cov 451→456
- TEST: root 644→652, ens 130→130, cov 476→484

### \`NP|COMMA|NP\` head=0

- law: comma-scaffold
- DEV: root 613→613, ens 138→138, cov 451→460
- TEST: root 644→648, ens 130→131, cov 476→481

### \`NP|COMMA|S\` head=0

- law: comma-scaffold
- DEV: root 613→614, ens 138→138, cov 451→487
- TEST: root 644→644, ens 130→130, cov 476→512

### \`NP|INF|S\` head=0

- law: order-prior+projection
- DEV: root 613→613, ens 138→138, cov 451→452
- TEST: root 644→644, ens 130→130, cov 476→477

### \`NP|PP|S\` head=0

- law: order-prior+projection
- DEV: root 613→616, ens 138→139, cov 451→466
- TEST: root 644→647, ens 130→130, cov 476→490

### \`NP|PUNCT|S\` head=0

- law: punct-absorb
- DEV: root 613→633, ens 138→138, cov 451→526
- TEST: root 644→660, ens 130→130, cov 476→544

### \`NP|RELC|S\` head=0

- law: order-prior+projection
- DEV: root 613→614, ens 138→138, cov 451→453
- TEST: root 644→645, ens 130→130, cov 476→477

### \`NP|VP|NP\` head=0

- law: order-prior+projection
- DEV: root 613→724, ens 138→197, cov 451→559
- TEST: root 644→751, ens 130→185, cov 476→581

### \`NPCOMMA|NP|NPCOMMA\` head=0

- law: order-prior+projection
- DEV: root 613→622, ens 138→141, cov 451→457
- TEST: root 644→658, ens 130→133, cov 476→486

### \`P|NP|NP\` head=1

- law: order-prior+projection
- DEV: root 613→621, ens 138→141, cov 451→459
- TEST: root 644→645, ens 130→132, cov 476→477

### \`P|NP|S\` head=1

- law: order-prior+projection
- DEV: root 613→615, ens 138→138, cov 451→456
- TEST: root 644→646, ens 130→130, cov 476→480

### \`P|NPO|VP\` head=1

- law: order-prior+projection
- DEV: root 613→614, ens 138→138, cov 451→455
- TEST: root 644→644, ens 130→130, cov 476→476

### \`PP|COMMA|PP\` head=0

- law: comma-scaffold
- DEV: root 613→613, ens 138→138, cov 451→452
- TEST: root 644→645, ens 130→130, cov 476→477

### \`PP|S|PP\` head=0

- law: order-prior+projection
- DEV: root 613→650, ens 138→158, cov 451→485
- TEST: root 644→693, ens 130→153, cov 476→523

### \`REL|S|S\` head=1

- law: order-prior+projection
- DEV: root 613→613, ens 138→139, cov 451→453
- TEST: root 644→646, ens 130→133, cov 476→478

### \`REL|VP|S\` head=1

- law: order-prior+projection
- DEV: root 613→613, ens 138→138, cov 451→453
- TEST: root 644→646, ens 130→133, cov 476→478

### \`REL|VP|VP\` head=1

- law: order-prior+projection
- DEV: root 613→616, ens 138→139, cov 451→457
- TEST: root 644→647, ens 130→131, cov 476→479

### \`S|COMMA|S\` head=0

- law: comma-scaffold
- DEV: root 613→613, ens 138→138, cov 451→469
- TEST: root 644→645, ens 130→130, cov 476→492

### \`SBAR|S|SBAR\` head=0

- law: order-prior+projection
- DEV: root 613→625, ens 138→140, cov 451→463
- TEST: root 644→654, ens 130→132, cov 476→486

### \`SCOMMA|S|SCOMMA\` head=0

- law: order-prior+projection
- DEV: root 613→618, ens 138→138, cov 451→456
- TEST: root 644→656, ens 130→130, cov 476→488

### \`SUB|S|S\` head=1

- law: order-prior+projection
- DEV: root 613→614, ens 138→138, cov 451→453
- TEST: root 644→644, ens 130→130, cov 476→476

### \`TO|VP|S\` head=1

- law: order-prior+projection
- DEV: root 613→615, ens 138→138, cov 451→453
- TEST: root 644→644, ens 130→130, cov 476→477

### \`TO|VP|VP\` head=1

- law: order-prior+projection
- DEV: root 613→617, ens 138→138, cov 451→456
- TEST: root 644→648, ens 130→130, cov 476→481

### \`V|ADJ|V\` head=0

- law: verb-complement
- DEV: root 613→618, ens 138→140, cov 451→456
- TEST: root 644→654, ens 130→137, cov 476→486

### \`V|INF|V\` head=0

- law: verb-complement
- DEV: root 613→619, ens 138→144, cov 451→457
- TEST: root 644→648, ens 130→135, cov 476→480

### \`V|NP|V\` head=0

- law: verb-complement
- DEV: root 613→760, ens 138→215, cov 451→597
- TEST: root 644→802, ens 130→218, cov 476→634

### \`V|NPO|V\` head=0

- law: verb-complement
- DEV: root 613→632, ens 138→147, cov 451→469
- TEST: root 644→666, ens 130→139, cov 476→498

### \`V|PP|V\` head=0

- law: verb-complement
- DEV: root 613→624, ens 138→148, cov 451→462
- TEST: root 644→654, ens 130→136, cov 476→486

### \`V|SBAR|V\` head=0

- law: verb-complement
- DEV: root 613→619, ens 138→141, cov 451→457
- TEST: root 644→651, ens 130→134, cov 476→483


## DEV survivors that failed TEST

_None._


## Top DEV gains among protect-pass (whether or not held-out)

- \`V|NP|V\` rootΔ=147 ensΔ=77 covΔ=146
- \`NP|VP|NP\` rootΔ=111 ensΔ=59 covΔ=108
- \`ADV|S|ADV\` rootΔ=66 ensΔ=35 covΔ=65
- \`ADJ|N|ADJ\` rootΔ=51 ensΔ=22 covΔ=43
- \`PP|S|PP\` rootΔ=37 ensΔ=20 covΔ=34
- \`ADV|VP|ADV\` rootΔ=37 ensΔ=12 covΔ=37
- \`NP|PUNCT|S\` rootΔ=20 ensΔ=0 covΔ=75
- \`V|NPO|V\` rootΔ=19 ensΔ=9 covΔ=18
- \`DET|N|N\` rootΔ=14 ensΔ=2 covΔ=13
- \`ADV|ADJ|ADV\` rootΔ=13 ensΔ=4 covΔ=12
- \`SBAR|S|SBAR\` rootΔ=12 ensΔ=2 covΔ=12
- \`V|PP|V\` rootΔ=11 ensΔ=10 covΔ=11
- \`NPCOMMA|NP|NPCOMMA\` rootΔ=9 ensΔ=3 covΔ=6
- \`P|NP|NP\` rootΔ=8 ensΔ=3 covΔ=8
- \`INV|NP|INV\` rootΔ=7 ensΔ=0 covΔ=7

## Protocol note

Linguistic interpretation of survivors belongs **after** this table, not before.
Do not promote to Grimoire without a status stamp and a second human review of theory.

## Repro

```bash
node scripts/extra-bond-reactor.mjs
```
