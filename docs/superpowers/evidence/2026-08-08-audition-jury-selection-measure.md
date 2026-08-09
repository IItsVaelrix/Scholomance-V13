# Audition Jury — Selection Measure — 2026-08-08

**Question:** Does the constellation audition jury recover a good chunk of the
~30–36% “different span won” residual left after head-declaring bonds?

**Instrument:** `scripts/audition-selection-measure.mjs`  
**Split:** UD English-EWT **dev**, packed chart, scoreable = spanning `S` + gold `nsubj`  
**n scored:** 233 (435 spanning S; 202 no gold nsubj)

## Prediction under test

That casting among projected answers would fix a **good chunk** of the selection
bucket (~30% of scoreable under the pre-work wrongness table; 36.1% post
head-declaration under containment-style wrongness).

## Result — **weak confirm; “good chunk of ~30%” denied**

| metric | value |
|---|---|
| gold IN ensemble (casting ceiling) | **130 / 233 (55.8%)** |
| gold NOT in ensemble | **103 / 233 (44.2%)** — casting cannot help |
| baseline cast correct (first slip of `stable[0]`) | **106 / 233 (45.5%)** |
| audition cast correct | **115 / 233 (49.4%)** |
| **delta** | **+9 (+3.9 pp)** |

### Among gold-in-ensemble only (n=130)

| | n | % of ceiling |
|---|---|---|
| already correct both | 104 | 80.0% |
| **FIXED** (baseline wrong → cast right) | **11** | **8.5%** |
| MISSED (gold present, not cast) | 13 | 10.0% |
| REGRESSED (baseline right → wrong) | 2 | 1.5% |
| net gain | +9 | |

### Baseline `SUBJ_SELECTION` subset (single-cast wrongness)

| | n | % |
|---|---|---|
| baseline cast in SUBJ_SELECTION | 105 | 45.1% of scored |
| … audition FIXED | **8** | **7.6%** of that bucket |
| … still wrong | 97 | 92.4% |

Single-cast wrongness buckets (baseline → audition):

| bucket | baseline | audition | delta |
|---|---|---|---|
| OK | 106 (45.5%) | 115 (49.4%) | **+9** |
| VERB_WRONG | 15 (6.4%) | 14 (6.0%) | −1 |
| SUBJ_MISSING | 4 (1.7%) | 4 (1.7%) | 0 |
| SUBJ_HEAD_BUG | 3 (1.3%) | 2 (0.9%) | −1 |
| **SUBJ_SELECTION** | **105 (45.1%)** | **98 (42.1%)** | **−7** |

## Interpretation

1. **The jury works** on the cases it is competent for. Net +9 correct casts,
   only 2 regressions, and the wins are coherent CONTENT_HEAD fixes — e.g.
   `was|thinking` → `I|thinking`, `will|come` → `I|come`, `They|be` →
   `They|imprisoned`. That is real cast selection, not noise.

2. **It does not move “a good chunk of ~30%.”** Only **7.6%** of the baseline
   single-cast selection bucket is recovered. Absolute selection bucket shrinks
   105 → 98 (−7 sentences, −3.0 pp of scored).

3. **The binding constraint is ensemble membership, not casting skill.**
   Gold is absent from the projected answer set on **44.2%** of scoreable
   sentences. No jury can cast what was never projected. Mean ensemble size is
   only 1.81; only 41.6% of scored sentences even have more than one distinct
   answer to choose among.

4. **Containment (55.8%) is not cast accuracy (45.5% → 49.4%).** Prior
   “correct” figures in the head-declaration wrongness table were closer to
   *gold somewhere in projections from the first stable root*. Single-cast
   decision is the harder metric; audition is the first packed **decision**
   layer and improves it modestly.

5. **Among the ceiling, 13/130 (10%) still miss** — gold is present and the
   jury still picks wrong (e.g. `look|forward` over `I|look`,
   `bedroom|now` over `bedroom|nicer`). Next jury work is high-precision
   structural cues, not more content-head pressure.

6. **Regressions (2)** are real: `games|have` → `have|Sun`,
   `They|do` → `do|lots`. Any weight change must not trade these for more
   aux-subject fixes without a regression test.

## Verdict line

> **WEAK CONFIRM** of jury competence (+3.9 pp cast accuracy, net +9).  
> **DENIED** as the fix for ~30% selection residual (only 7.6% of that bucket
> moves). The next lever is still **getting gold into the ensemble**
> (grammar / projection / which roots project), not only ranking.

## Repro

```bash
node scripts/audition-selection-measure.mjs dev
```

## Related

- Jury: `codex/core/constellation/audition/`
- Prior residual: `docs/superpowers/evidence/2026-08-08-head-declaration-result.md`
- Wrongness instrument: `.superpowers/sdd/2026-08-08-packed-chart/wrongness.mjs`
