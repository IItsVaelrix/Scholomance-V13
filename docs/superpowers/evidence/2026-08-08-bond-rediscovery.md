# Bond Rediscovery Experiment — 2026-08-08

**Question:** Can theoretical laws (atom inventory + content-head + order priors +
construction schemas) regenerate the human Grimoire without reading BONDS?

**Threshold:** ~40 / ~68 signature hits ⇒ approach viable.

**Instrument:** `codex/core/constellation/grimoire/bond-synthesizer.js`  
**Runner:** `scripts/bond-rediscovery.mjs`

## Results — active chart chemistry (68 constructions)

### Full theory cloud (order priors + projection + schemas)

| Metric | Value |
|---|---|
| Theoretical candidates | 146 |
| Signature hits | **68** (100.0% recall) |
| Signature + head hits | **65** (95.6% recall) |
| Head mismatches | 3 |
| Missed | 0 |
| Extra proposals | 78 (precision 46.6%) |
| **Viable ≥40 (signature)** | **YES** |
| **Viable ≥40 (full)** | **YES** |

### Minimal schemas only (honest compression floor)

| Metric | Value |
|---|---|
| Candidates | 30 |
| Signature hits | **29** / 68 (42.6%) |
| Full hits | **29** (42.6%) |
| Viable ≥40 | **NO** |

**Honesty note:** Full mode uses English order priors for licensed pairs (direction physics), not a copy of the 68 result tuples. Result types and heads are predicted by law. Minimal mode drops the pair table and keeps only abstract templates — lower recall, truer compression floor.

## Full constitution (incl. deprecated): 69/69 signature

## Missed bonds (active)

_none_

## Head mismatches

- `GEN|N|NP` gold=1 theory=0
- `NPCOMMA|NP|NP` gold=0 theory=1
- `SCOMMA|S|S` gold=0 theory=1

## Family recall (signature)

| Family | Hit | Gold | % |
|---|---|---|---|
| adposition | 2 | 2 | 100% |
| auxiliary | 2 | 2 | 100% |
| clause | 3 | 3 | 100% |
| comparative | 3 | 3 | 100% |
| coordination | 7 | 7 | 100% |
| copular | 4 | 4 | 100% |
| determination | 1 | 1 | 100% |
| inversion | 6 | 6 | 100% |
| modifier | 6 | 6 | 100% |
| nonfinite | 2 | 2 | 100% |
| participial | 2 | 2 | 100% |
| possession | 3 | 3 | 100% |
| punctuation | 12 | 12 | 100% |
| relative-clause | 3 | 3 | 100% |
| subordination | 3 | 3 | 100% |
| verb | 9 | 9 | 100% |

## Verdict

**VIABLE — full theory cloud 65/68 full hits; minimal schemas 29/68 signatures**

### Interpretation

- The synthesizer does **not** copy BONDS; it expands order priors × projection laws × a few schema families (coordination, comma, verb complement, punct).
- Signature recall is the viability metric for “island of stability” search: the cloud must cover the known stable nuclei.
- Head mismatches mean the **category law** is right but **headship prediction** needs another rule (often coordination / inversion / GEN rulings).
- Extra proposals are the search space for *new* stable bonds — score them in the corpus reactor next, do not auto-merge.

## Repro

```bash
node scripts/bond-rediscovery.mjs
```
