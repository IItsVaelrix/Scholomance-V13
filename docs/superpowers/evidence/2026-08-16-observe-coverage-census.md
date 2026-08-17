# RESULT — Observe-only lexical + compositional coverage

SCORE was not run. TEST was not opened. The forest was not rewritten.

- commit `8495daa2103bf5c00ac65360244fbd79aa20e828`
- DEV sentences ≤ 28 tokens: analysed 1824, parsed 585 (32.1%), threw 0
- fingerprints identical on 8/8 replay pairs
- ambiguous readings 18453: sense 56.6%, T1-features 52.2%, either 56.6%
- bond derivations 116479: named rule 59.4%, roles complete 59.4%, unknown 68.9%
- T1 edges 33236: could-fire 4.2%, one-side-missing 22.7%
- starvation among incomplete derivations: lexical 37681 (44.4%), compositional 47257 (55.6%)
- stable roots 585: unknown 491, filled 85
- milestone: sense 56.6% PASS; no-relation 55.4% FAIL; could-fire 4.2% FAIL; filled roots 14.5% PASS

## Observe conduction (post-treatment)

SCORE was not run. TEST was not opened. Emission was not changed.
Prereg: `2026-08-16-PREREG-observe-conduction.md`.

Two TRAIN-only tracks landed in OBSERVE:

- **Lexical.** Class-fallback senses from `classifyLemma`. Novel-B bags (`work`, `use`, `let`, `staff`, `name`, ordinals, small numerals, residual verbs). `*::ADV` only because it now participates in `FEATURE_COMPAT` adverbial rules.
- **Compositional.** Named rules for adverbial, compound, adjunction, infinitival, auxiliary, relative, subordinate, and coordination families. Unknownness follows the **head**, so a dark modifier no longer unfills a known predicate.

### Versus the previous observe census

| Signal | Before | After |
|---|---:|---:|
| Sense rate | 0.4% | **56.6%** |
| Named rules | 26.0% | **59.4%** |
| Unknown derivations | ~100% | 68.9% |
| T1 no-relation | 68.5% | 55.4% |
| T1 could-fire | 3.1% | 4.2% |
| One-side-missing | 17.8% | 22.7% |
| Filled stable roots | 0 / 585 | **85 / 585 (14.5%)** |
| Starvation lexical / compositional | 26% / 74% | 44% / 56% |

### Frozen milestone

| Gate | Need | Got | |
|---|---:|---:|---|
| sense ≥ 15% | 15% | 56.6% | PASS |
| no-relation ≤ 50% | 50% | 55.4% | FAIL |
| could-fire ≥ 15% | 15% | 4.2% | FAIL |
| filled roots ≥ 10% | 10% | 14.5% | PASS |
| fingerprints identical | 8/8 | 8/8 | PASS |
| throws | 0 | 0 | PASS |

**Stay in OBSERVE.** Could-fire is still a tail. SCORE would still mostly rank with silence.

The 4.2% could-fire is the honest number. Lighting more sides moved one-side-missing *up* (17.8% → 22.7%): one word now has a sense, its neighbor still does not. That is conduction starting, not a licence to score.

Remaining blank music is not "add punctuation semantics." Top uninterpreted bonds are `S+PUNCT`, `NP+PUNCT`, `PP+S`, `SCOMMA+S`, `S+SBAR`. Top no-relation pairs are `V|P`, `N|PUNCT`, `V|DET`. Punctuation and leftover adjacency are not COMPAT-worthy sheet music.

Reproduction: `node scripts/observe-coverage-census.mjs`

