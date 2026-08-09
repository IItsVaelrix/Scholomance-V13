# Clause-Closure Campaign (post–ultimate diagnostic)

**Date:** 2026-08-08  
**Status:** Steps 1–3a complete (COP→AUX; autopsy; punct-absorb closure slice banked)  
**Do not:** open a bond-shopping campaign from the deprel gap table alone.

## Why this campaign exists

Ultimate diagnostic profile:

| Layer | Recall / rate |
|---|---|
| Local contiguous spans | ~75% |
| Subject (nsubj) spans | ~89% |
| Headship when answer right | ~86–89% |
| Root spans | ~27% |
| Full coverage | ~22% |

**Interpretation:** The parser understands substantially more local syntax than it can close into complete English clauses. Next breakthrough is **molecular assembly at clause scale**, not smarter local atoms.

Audition ceiling gain on scoreable is only ~6–7 pp (45.5% → 52.2%). **Raising the ensemble** is the bigger lever. Pause jury polish.

## Campaign steps

### 1. COP → AUX (DONE — banked)

- Theory-only; head unchanged  
- Evidence: `docs/superpowers/evidence/2026-08-08-cop-to-aux-theory-intervention.md`  
- Coverage/containment/headship flat; COP+VP on correct paths → 0  

### 2. Root-closure autopsy (DONE — banked)

- Instrument: `scripts/root-closure-autopsy.mjs`  
- Evidence: `docs/superpowers/evidence/2026-08-08-root-closure-autopsy.md`  

**Headline (dev, 1461 missing roots):**

| Finding | n | % of missing |
|---|---|---|
| Largest built structure is already **S** | 923 | **63.2%** |
| Some **S** present as a piece inside the root span | 1178 | **80.6%** |
| **NP and VP** both present as pieces | 273 | 18.7% |
| Empty chart under root (∅) | 46 | 3.1% |

**Piece co-occurrence leaders:** `NP+S` 20.7%, bare `S` 18.6%, `NP+VP+S` 10.8%, `NP+S+PUNCT` 9.0%.

**Conclusion:** Most “missing roots” are **not** “NP and VP never built.” They are **S built but root span not closed** — fringe material (punct, extra clause, titles, noise) or combination of already-good clauses. Punctuation gap table is suspicious: high punct span recall + root failure ≈ **projection / absorb**, not skeleton.

### 3. Smallest closure families

#### 3a. Terminal punct absorb (DONE — banked)

- Multi-char `!!` / `...` typed as PUNCT; `NP+PUNCT→NP` seatbelt  
- Evidence: `docs/superpowers/evidence/2026-08-08-closure-slice-punct-absorb.md`  
- Root span **27.0% → 30.6%**; coverage 21.7% → 22.5%; nsubj **flat 88.9%**; span recall **up** 75.4% → 76.3%  

#### 3b. NEXT — left fringe / partial S (not started)

Autopsy residual after 3a still says: largest built is often S with **left nominal/matrix** outside the S, or fill ≪ 1.0.

1. Sample NP immediately left of S that would cover gold root if combined — diagnose *why* subject is outside S (wrong S vs missing law)  
2. **Do not** add free `NP+S→S` without that diagnosis (overgeneration risk)  
3. Matrix + embedded S combination only if cluster evidence remains after 3a re-autopsy  
4. True NP+VP-ready-no-S remains ~19% — inspect type mismatch before new bonds  

**Protect after every family:**

- ~75%+ contiguous span recall (now 76.3%)  
- ~89% nsubj span recall  
- ~94% static headship green  
- coverage may rise; if span/headship fall, revert  

### 4. Re-run ultimate diagnostic after each family

```bash
node scripts/constellation-ultimate-diagnostic.mjs both
node scripts/root-closure-autopsy.mjs dev
```

### 5. Return to audition only after gold-in-ensemble rises

Casting polish waits until the courtroom is larger.

## Ontology rule (phrasing layer)

| Status | May claim |
|---|---|
| grammar | Linguistic structure |
| approximation | Only declared limited facts |
| scaffold | **Nothing** about linguistic ontology |
| deprecated | Nothing (historical) |

Future metric (better than GGGG path rate):

> Did the final semantic representation rely on any fact the underlying construction wasn’t licensed to claim?

Scaffolds may exist in the tree without contaminating interpretation.

## Explicit non-goals (this phase)

- Adding bonds for every deprel in the gap table  
- Treating punct as core skeleton without projection experiment  
- Audition weight tuning  
- Library-of-Alexandria grammar DB  
