# Constellation Ultimate Diagnostic — 2026-08-08

**Instrument:** `scripts/constellation-ultimate-diagnostic.mjs`  
**Splits:** dev, test  
**Parser:** packed chart + audition cast + Grimoire ontology

## Executive summary

| | dev | test |
|---|---|---|
| Coverage | 21.7% | 21.9% |
| Containment | 10.9% | 11.4% |
| Audition cast (scoreable) | 45.5% | 44.8% |
| Gold-in-ensemble | 52.2% | 52.3% |
| Span recall | 75.4% | 74.9% |
| Root span recall | 27.0% | 27.3% |

**Spine is sound (headship, local spans). Ceiling is grammar coverage + ensemble membership. Theory dirt (COP/AUX, approximations) rides on correct answers.**


## dev

| Metric | Value |
|---|---|
| Sentences | 2001 |
| Coverage | 435/2001 (21.7%) |
| Containment | 218/2001 (10.9%) |
| Scoreable | 255 |
| Gold-in-ensemble | 133/255 (52.2%) |
| Baseline cast | 108/255 (42.4%) |
| Audition cast | 116/255 (45.5%) |
| Span recall (contiguous) | 18937/25107 (75.4%) |
| nsubj span recall | 1871/2105 (88.9%) |
| root span recall | 540/2001 (27.0%) |
| Theory-clean paths | 2/133 (1.5%) |
| Headship-clean paths | 114/133 (85.7%) |
| COP+VP with gold aux | 18/30 (60.0%) |

### Audition wrongness (scoreable)

| Bucket | Baseline | Audition |
|---|---|---|
| OK | 108 (42.4%) | 116 (45.5%) |
| VERB_WRONG | 15 (5.9%) | 14 (5.5%) |
| SUBJ_MISSING | 4 (1.6%) | 4 (1.6%) |
| SUBJ_HEAD_BUG | 3 (1.2%) | 2 (0.8%) |
| SUBJ_SELECTION | 105 (41.2%) | 98 (38.4%) |

### Length cliff

| Len | n | Coverage | Containment |
|---|---|---|---|
| 1-5 | 565 | 28.1% | 17.5% |
| 6-12 | 656 | 30.6% | 15.5% |
| 13-20 | 408 | 15.4% | 3.9% |
| 21+ | 372 | 3.2% | 0.3% |


## test

| Metric | Value |
|---|---|
| Sentences | 2077 |
| Coverage | 454/2077 (21.9%) |
| Containment | 236/2077 (11.4%) |
| Scoreable | 239 |
| Gold-in-ensemble | 125/239 (52.3%) |
| Baseline cast | 93/239 (38.9%) |
| Audition cast | 107/239 (44.8%) |
| Span recall (contiguous) | 18773/25064 (74.9%) |
| nsubj span recall | 1815/2056 (88.3%) |
| root span recall | 567/2077 (27.3%) |
| Theory-clean paths | 1/125 (0.8%) |
| Headship-clean paths | 111/125 (88.8%) |
| COP+VP with gold aux | 18/32 (56.3%) |

### Audition wrongness (scoreable)

| Bucket | Baseline | Audition |
|---|---|---|
| OK | 93 (38.9%) | 107 (44.8%) |
| VERB_WRONG | 13 (5.4%) | 15 (6.3%) |
| SUBJ_MISSING | 4 (1.7%) | 4 (1.7%) |
| SUBJ_HEAD_BUG | 0 (0.0%) | 1 (0.4%) |
| SUBJ_SELECTION | 112 (46.9%) | 90 (37.7%) |

### Length cliff

| Len | n | Coverage | Containment |
|---|---|---|---|
| 1-5 | 643 | 30.9% | 19.6% |
| 6-12 | 661 | 28.0% | 13.9% |
| 13-20 | 411 | 13.9% | 3.6% |
| 21+ | 362 | 3.6% | 0.8% |


## Grimoire

| Status | n |
|---|---|
| grammar | 24 |
| scaffold | 13 |
| approximation | 31 |
| deprecated | 0 |
| Headship green | 64/68 |

### Families

| Family | n | G | S | A |
|---|---|---|---|---|
| adposition | 2 | 2 | 0 | 0 |
| auxiliary | 2 | 1 | 0 | 1 |
| clause | 3 | 2 | 0 | 1 |
| comparative | 3 | 0 | 0 | 3 |
| coordination | 7 | 3 | 3 | 1 |
| copular | 5 | 0 | 0 | 5 |
| determination | 1 | 1 | 0 | 0 |
| inversion | 6 | 2 | 3 | 1 |
| modifier | 6 | 3 | 0 | 3 |
| nonfinite | 2 | 1 | 0 | 1 |
| participial | 2 | 0 | 0 | 2 |
| possession | 3 | 1 | 1 | 1 |
| punctuation | 11 | 2 | 6 | 3 |
| relative-clause | 3 | 1 | 0 | 2 |
| subordination | 3 | 2 | 0 | 1 |
| verb | 9 | 3 | 0 | 6 |

## Prioritised improvement backlog

### P0 — Most sentences never form a spanning S

- **Area:** `grammar-coverage`
- **Evidence:** 435/2001 (21.7%) coverage; 1566 unparsed
- **Impact:** Corpus-level accuracy ceiling is ~coverage × containment rate
- **Action:** Grow bond families from failure categories (punct, root, obl, conj, nmod) — measured sole-cause list
- **Metric:** coverage 21.7% → target 35%+

### P0 — Gold root spans rarely built

- **Area:** `root-span`
- **Evidence:** 540/2001 (27.0%)
- **Impact:** Local NP/PP structure exists; clause glue missing
- **Action:** Bonds that close S over real roots (verbal + nominal/adj web roots)
- **Metric:** root span recall 27.0%

### P1 — COP+VP mislabels progressive/passive be

- **Area:** `cop-vs-aux`
- **Evidence:** 18/30 (60.0%) of COP+VP uses on correct paths have gold aux/aux:pass
- **Impact:** Right head, wrong theory — poisons phrasing if trusted as cop
- **Action:** Retype be+V as AUX (or deprecate cop-vp-mislabel); keep head on VP
- **Metric:** copVpGoldAux rate 60%

### P1 — Gold often in ensemble but not cast

- **Area:** `decision-cast`
- **Evidence:** ceiling 133/255 (52.2%); cast 116/255 (45.5%); gap 17
- **Impact:** Decision accuracy lags containment
- **Action:** Improve audition judges; projection of competing roots
- **Metric:** cast 45.5% vs ceiling 52.2%

### P1 — Different-span / wrong-subject residual

- **Area:** `selection-bucket`
- **Evidence:** audition SUBJ_SELECTION 98/255 (38.4%); baseline fixed 8/105 (7.6%)
- **Impact:** Dominant residual among scoreable wrongs after head-declaration
- **Action:** Ensemble growth first; then cast; generalized projection descent
- **Metric:** selection 38.4% of scoreable

### P1 — Correct answers almost never fully theory-clean

- **Area:** `theory-clean-paths`
- **Evidence:** 2/133 (1.5%)
- **Impact:** Winning trees carry scaffolds/approximations as if grammar
- **Action:** Consumers must check mayClaimLinguisticFact; shrink approximation mass in hot families
- **Metric:** theory-clean 1.5%; headship-clean 85.7%

### P2 — Family "comparative" has no pure grammar entries

- **Area:** `family:comparative`
- **Evidence:** n=3 G:0 S:0 A:3
- **Impact:** Entire family is approximation/scaffold — high fiction risk
- **Action:** Promote one construction in comparative to measured grammar or split approximations
- **Metric:** approximation-only family

### P2 — Family "copular" has no pure grammar entries

- **Area:** `family:copular`
- **Evidence:** n=5 G:0 S:0 A:5
- **Impact:** Entire family is approximation/scaffold — high fiction risk
- **Action:** Promote one construction in copular to measured grammar or split approximations
- **Metric:** approximation-only family

### P2 — Long sentences almost never parse

- **Area:** `length-cliff`
- **Evidence:** 21+ tokens: coverage 12/372 (3.2%), containment 1/372 (0.3%)
- **Impact:** Web/news sentences dominate residual unparsed mass
- **Action:** Punct, conj, multi-clause, and attachment rules under measurement
- **Metric:** 21+ coverage 3.2%

### PROTECT — Headship spine is strong — do not regress

- **Area:** `headship`
- **Evidence:** table H-green 94.1%; path headship-clean 114/133 (85.7%)
- **Impact:** Core UD content-head alignment
- **Action:** Any bond edit must keep head indices + validateBonds + anatomy grades H
- **Metric:** H ≥ 90% green

### PROTECT — Local constituent span recall is a strength

- **Area:** `local-spans`
- **Evidence:** all contiguous 18937/25107 (75.4%); nsubj 1871/2105 (88.9%)
- **Impact:** Grammar is not random; grow from this base
- **Action:** Prefer new bonds that close roots/clauses without destroying local recall
- **Metric:** span recall 75.4%


## Repro

```bash
node scripts/constellation-ultimate-diagnostic.mjs both
```
