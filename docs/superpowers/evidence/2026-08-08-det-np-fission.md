# Semantic Nuclear Fission — DET+NP — 2026-08-08

**Question:** Can we fission the held parent `DET+NP→NP` into mono-family
daughters that help, without classic forest explosion?

**Answer:** Yes. Parent retired. Daughters `DET+PROPN→NP` (main) and
`DET+PRON→NP` (minor) promoted. `DET+NC` projection-legal but toxic — not promoted.

## Parent (retired mass)

| | DEV Δ | TEST Δ |
|---|---|---|
| Coverage | +14 (472→486) | +6 (491→497) |
| Root | +13 | +5 |
| Ensemble | +4 | +1 |
| Span / nsubj | +0.29 / +0.71pp | +0.27 / +0.93pp |

**Classic forest stable-S** (man / horse / dog / old / US-army / AP):

```
base    1  1  2  3  1  0
parent  4  6 20  3  2  1   ← isomer explosion
```

Cause: every `DET+N` path also yields `DET+(N→NP)`.

## Autopsy (fissility)

On DEV sample with parent active, DET+NP firings clustered as:

| Bucket | Role |
|---|---|
| Width-1 N on same span | **Isomer mass** — already covered by DET+N; causes forest multiply |
| Multi-token + N/NC | Partial overlap with compounds; DET+NC toxic |
| Residual, no N on span | **True fission fuel** — mostly PROPN lift, some PRON, complex NP+PP noise |

Gain-stable residual examples: `the | AP`, `the | US` (DET+PROPN via PROPN→NP).

## Daughter reactor (parent retired)

| Daughter | DEV fate | DEV Δcov/root/ens | Forest | TEST holdout |
|---|---|---|---|---|
| **DET+PROPN→NP** | **SURVIVE** | **+11 / +10 / +3** | **clean (1 1 2 3 1 1)** | **PASS +3/+2/0** |
| DET+PRON→NP | SURVIVE (span) | +0 / +0 / +0 (+0.04pp span) | clean | PASS +1/+1/+1 |
| DET+APPOS→NP | NO real gain | 0 | clean | flat |
| DET+NC→NP | NO-GAIN metrics | 0 | **toxic 4 4 16** | — |

**Recovery:** DET+PROPN alone recovers **79%** of parent DEV coverage gain
(+11 of +14) with **zero** garden-path / PP-attach forest multiplier.
AP pin goes 0→1 (new legal parse).

All-daughters bundle: DEV +11 / TEST +4 — same mass as PROPN alone;
sisters do not stack meaningfully.

## Promotion (true fission = parent retired)

| Bond | Status | Family |
|---|---|---|
| `DET+PROPN→NP` h=1 | **grammar** | determination (`det-propn`) |
| `DET+PRON→NP` h=1 | approximation | determination (`det-pron`) |
| `DET+NP→NP` | **retired** | never active |
| `DET+NC→NP` | not promoted | projection-legal only |

Projection laws: `DET+PROPN` / `DET+PRON` / `DET+NC` → `determine`;
PROPN/PRON/NC `determine` → NP transitions added.

## Live after fission promotion

Relative to pre-fission live (80 BONDS → 82):

| Split | Coverage | Root | Ensemble | Span | nsubj |
|---|---|---|---|---|---|
| DEV | 472→**483** (+11) | 694→**704** | 200→**203** | +0.19pp | +0.57pp |
| TEST | 491→**494** (+3) | 714→**716** | 178→178 | +0.16pp | +0.83pp |

Protect floors OK. Classic unit pins (garden path, PP attach) unchanged.

## Tests

```text
npx vitest run tests/core/constellation/*.test.js \
  tests/qa/features/constellation-compose*.test.js
# 143 passed (incl. DET+PROPN fission daughter pin)
```

## Law stated

```text
FUSION:   promote L+R→C under Result Conservation
FISSION:  polydisperse / isomer parent → mono-family daughters
          + retire parent mass
          + reject daughters that re-isomerize the forest
```

DET+NP was a superheavy: packed energy, classic shatter. Fission kept the
PROPN core and discarded the N-lift isomer shell.

## Files

- `codex/core/constellation/grimoire/families/determination.js`
- `codex/core/constellation/grimoire/index.js`
- `codex/core/constellation/grimoire/projection-laws.js`
- `tests/qa/features/constellation-compose-packed.test.js`
