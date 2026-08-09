# Hint Grammar Simulation — 2026-08-08

**Question:** Which bonds do our existing laws *hint at* but not apply?
**Prediction:** ≥5 held-out nuclei.

## Method

Pattern completion from the live BONDS / projection table:

1. Punct-absorb parity
2. Coordination parity
3. NC ports for N-laws
4. Projection extras
5. Host extensions (S+PP, S+ADV, VP+INF, …)
6. Missing construction schemas

Then fireability → DEV protect floors + gain → paired retry → TEST holdout.

## Fireability comes before gain

A candidate that consumes a type the base grammar never builds cannot fire once,
so its zero is structural, not empirical. Reporting it as `NO-GAIN` is how the
second half of a two-bond construction gets discarded while its first half —
which scores a cosmetic span bump — gets promoted as a dead end.

| Fate | Meaning |
|---|---|
| `UNFIREABLE` | consumes a type nothing in the base grammar produces |
| `PAIRED-ONLY` | unfireable alone, but a sibling candidate supplies the type — re-reacted as a pair |
| `NO-GAIN` | fired, and nothing improved (the only honest negative) |

## Candidates: 28

- `ADJ|NC|N` h=1 — nc-port-right:ADJ|N|N
- `ADV|CONJADV|ADV` h=0 — coord-complete:ADV
- `CONJ|ADV|CONJADV` h=1 — coord-bridge:ADV
- `CONJ|N|CONJN` h=1 — coord-bridge:N
- `CONJ|NC|CONJNC` h=1 — coord-bridge:NC
- `CONJ|PP|CONJPP` h=1 — coord-bridge:PP
- `COP|VP|VP` h=1 — projection-extra:project:auxiliary
- `DET|NC|NP` h=1 — nc-port-right:DET|N|NP
- `DET|NP|NP` h=1 — det-np
- `GEN|NC|NP` h=1 — nc-port-right:GEN|N|NP
- `INF|PUNCT|INF` h=0 — punct-parity:INF
- `N|CONJN|N` h=0 — coord-complete:N
- `N|PP|NP` h=0 — n-pp
- `NC|CONJNC|NC` h=0 — coord-complete:NC
- `NC|PP|NP` h=0 — nc-pp
- `NC|PROPN|N` h=1 — nc-port-left:N|PROPN|N
- `NC|PUNCT|N` h=0 — nc-port-left:N|PUNCT|N
- `PART|PUNCT|PART` h=0 — punct-parity:PART
- `POSS|NC|N` h=1 — nc-port-right:POSS|N|N
- `POSS|NC|NC` h=1 — poss-nc
- `PP|CONJPP|PP` h=0 — coord-complete:PP
- `PP|PUNCT|PP` h=0 — punct-parity:PP
- `PROPN|NC|N` h=1 — nc-port-right:PROPN|N|N
- `RELC|PUNCT|RELC` h=0 — punct-parity:RELC
- `S|ADV|S` h=0 — clause-adv-post
- `S|PP|S` h=0 — clause-pp-adjunct
- `SBAR|PUNCT|SBAR` h=0 — punct-parity:SBAR
- `VP|PUNCT|VP` h=0 — punct-parity:VP

## Baselines

| | DEV | TEST |
|---|---|---|
| Coverage | 24.5% (490) | 24.2% (502) |
| Root | 712 | 730 |
| Ensemble | 209 | 186 |
| Span / nsubj | 77.75% / 92.21% | 77.09% / 92.61% |

## DEV funnel

| Fate | n |
|---|---|
| SURVIVE (single) | 1 |
| SURVIVE (paired) | 2 |
| NO-GAIN | 23 |
| UNFIREABLE | 0 |
| PAIRED-ONLY (retried as pairs) | 4 |
| PROTECT-FAIL | 0 |
| EXPLODE | 0 |

## Paired trials

| Pair | Fate | Δcov | Δroot | Δens |
|---|---|---|---|---|
| `ADV|CONJADV|ADV + CONJ|ADV|CONJADV` | SURVIVE | 2 | 2 | 1 |
| `N|CONJN|N + CONJ|N|CONJN` | NO-GAIN | 0 | 0 | 0 |
| `NC|CONJNC|NC + CONJ|NC|CONJNC` | NO-GAIN | 0 | 0 | 0 |
| `PP|CONJPP|PP + CONJ|PP|CONJPP` | SURVIVE | 1 | 1 | 1 |

## Held-out nuclei (3)

### 1. `DET|NP|NP`

- **hint:** det-np
- DEV: cov 490→493 (Δ3), root 712→715 (Δ3), ens 209→210 (Δ1), spanΔ 0.06pp
- TEST: cov 502→504 (Δ2), root 730→732 (Δ2), ens 186→186 (Δ0)

### 2. `ADV|CONJADV|ADV + CONJ|ADV|CONJADV` **[PAIR]**

- **hint:** coord-complete:ADV; coord-bridge:ADV
- DEV: cov 490→492 (Δ2), root 712→714 (Δ2), ens 209→210 (Δ1), spanΔ 0.03pp
- TEST: cov 502→502 (Δ0), root 730→730 (Δ0), ens 186→186 (Δ0)

### 3. `PP|CONJPP|PP + CONJ|PP|CONJPP` **[PAIR]**

- **hint:** coord-complete:PP; coord-bridge:PP
- DEV: cov 490→491 (Δ1), root 712→713 (Δ1), ens 209→210 (Δ1), spanΔ 0.04pp
- TEST: cov 502→502 (Δ0), root 730→730 (Δ0), ens 186→186 (Δ0)


## Promotion hazards

_None — no surviving nucleus would land a bond whose result type nothing consumes._

## Verdict

**UNDER TARGET — 3 nuclei (wanted ≥5).**

These are still **empirical survivors for review**, not auto-promoted Grimoire law.
A survivor that gains but has no autopsy purity behind it is a coverage hammer;
run `scripts/construction-autopsy.mjs` before stamping one.

## Repro

```bash
node scripts/hint-grammar-simulation.mjs
```
