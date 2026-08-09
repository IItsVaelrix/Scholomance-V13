# Compound Family Fix + Retest — 2026-08-08

**From autopsy:** do not promote raw `N+N` / `NP+NP`.  
**Implemented:** gated compound chemistry + atom hygiene.

## Fixes shipped

### 1. Atom hygiene (kills orphan N)

- Closed-class words no longer also emit content `N`/`V`/`ADJ`/`ADV` from the lexicon.
- Pure nouns emit **`NC`** (compoundable) only; dual n+v emit **`N`** only (subjects without compound).
- Lift: `NC → N → NP`.

### 2. Compound family (Grimoire)

| id | Bond | Head | Status |
|---|---|---|---|
| `compound-nn` | `NC + NC → NC` | **1** (UD right) | approximation |
| `proper-compound` | `PROPN + PROPN → N` | 1 | approximation |
| `proper-plus-noun` | `PROPN + N → N` | 1 | approximation |
| `noun-plus-proper` | `N + PROPN → N` | 1 | approximation |
| `adj-terminal-punct` | `ADJ + PUNCT → ADJ` | 0 | grammar |

**Not promoted:** `NP+NP→NP`, `NP+S→S`, `S+S→S` (polydisperse autopsy).

### 3. Garden-path safety

`NC+NC` only — dual verbs never enter compound chemistry (`barn`+`fell` cannot fire).  
Tests: garden path still `horse|fell`.

## Retest vs post–punct-absorb baseline

| Metric | Before (punct absorb) | After compounds | Δ |
|---|---|---|---|
| **DEV coverage** | 22.5% (451) | **22.1% (443)** | −8 sents |
| **DEV containment** | 11.3% | **11.7% (235)** | **+0.4 pp** |
| **DEV root span** | 30.6% (613) | **33.5% (671)** | **+58** |
| **DEV span recall** | 76.3% | **77.1%** | **+0.8 pp** |
| **DEV nsubj** | 88.9% | **91.4%** | **+2.5 pp** |
| **DEV ensemble** | 52.7% (138) | **56.4% (149)** | **+11** |
| DEV mean events | ~86.6 | **80.9** | quieter |
| **TEST coverage** | 22.9% (476) | **22.5% (467)** | −9 |
| **TEST root span** | ~31.0% (644) | **33.6% (697)** | **+53** |
| **TEST span recall** | 75.7% | **76.5%** | **+0.8** |
| **TEST nsubj** | 88.3% | **91.6%** | **+3.3** |
| **TEST ensemble** | 130 | **136** | **+6** |
| TEST mean events | ~82.9 | **75.4** | quieter |

## Interpretation

- **Coverage ticked down** while **correctness-shaped metrics rose** (containment, ensemble, nsubj, root). Closed-class / dual-POS hygiene removed soft false spans that inflated coverage.
- **Root + nsubj + ensemble** are the discovery signature: compounds help close real nominal structure without free `NP+NP` glue.
- Protect floors for span/nsubj: **held and improved**.
- Chart is **less event-heavy** (cleaner atom inventory).

## Tests

**142/142** green (compose, packed, grimoire, projection, synthesizer).

## Not done (still open)

- Split PROPN into flat-name vs compound vs nmod-desc (still one compound-biased law).
- Re-sim gated families for NP+S / S+S after subject-gated autopsy.
- Operations for unproposable S+TO / S+P gaps.

## Repro

```bash
npx vitest run tests/qa/features/constellation-compose.test.js \
  tests/qa/features/constellation-compose-packed.test.js
# metrics: packed measure over en_ewt-ud-{dev,test}
```
