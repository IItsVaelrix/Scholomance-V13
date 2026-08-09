# Construction Autopsy — Split the Giants — 2026-08-08

**Job change:** not “what bond closes this?” but
**“what latent construction family explains why this bond works?”**

Gain definition: sentence has **no** spanning `S` under base BONDS, **has** spanning
`S` when the candidate is added.

This file indexes the **default slate only**. Each target's tables live in their
own file, so a later single-target run cannot erase them.

## Slate

| Bond | head | Gains | Firings | Licensed | Concentration | Purity | Borrowed | Dominant | Detail |
|---|---|---|---|---|---|---|---|---|---|
| `N|N|N` | 0 | 39 | 81 | 74.1% | 0.352 | **0.261** | 16.0% | compound | [detail](2026-08-08-construction-autopsy-n-n-n-h0.md) |
| `NP|NP|NP` | 0 | 92 | 226 | 64.6% | 0.204 | **0.131** | 99.1% ⌊ | compound | [detail](2026-08-08-construction-autopsy-np-np-np-h0.md) |
| `PROPN|PROPN|N` | 0 | _already law_ | — | — | — | — | — | — | [detail](2026-08-08-construction-autopsy-propn-propn-n-h0.md) |
| `NP|S|S` | 1 | 120 | 194 | 76.8% | 0.211 | **0.162** | 86.1% ⌊ | other:nsubj | [detail](2026-08-08-construction-autopsy-np-s-s-h1.md) |
| `S|S|S` | 0 | 93 | 152 | 78.9% | 0.101 | **0.080** | 48.7% ⌊ | compound | [detail](2026-08-08-construction-autopsy-s-s-s-h0.md) |

Rows marked _already law_ carry that signature in BONDS already — at whatever
head — so their trial chart equals the baseline chart and the autopsy question
is undefined for them. Use `scripts/bond-ablation.mjs` to measure what an active
law contributes.

Purity = licensed share × Simpson concentration over licensed families. A law
scores high on both factors; a multi-tool fails at least one.

**Borrowed** is the share of firings where both spans are single tokens that
reached their declared type by unary lift alone. A high borrowed share means the
bond is not operating on the constituents its signature names — read it before
reading purity, because a bond can look licensed and concentrated while standing
entirely on promoted atoms.

A **⌊** marks a *floored* share: no atom emits either of that bond's types, so
every one-token firing is borrowed by construction and the figure could not have
come out low. Floored shares are comparable to each other and to nothing else.
Unfloored on this slate — where the share is a real measurement: `N|N|N`.

## Promotion policy (this autopsy)

- **Do not** promote a giant as a single grammar law because it raised coverage.
- Prefer targets whose licensed mass is high **and** concentrated in one family.
- Split multi-modal giants into named approximation families, re-simulate each.
- Unproposable gaps (S+TO, S+P, TO+NP, …) → missing **operations**, not more free C.

## Repro

```bash
node scripts/construction-autopsy.mjs
```
