# PREREG — Parser failure atlas, first intervention

Contract: `PB-PARSER-FAILURE-ATLAS-v1`
Date: 2026-08-18
Status: **SCORED.** Results:
`docs/superpowers/evidence/2026-08-18-parser-failure-atlas-list-bond/PREREG-SCORE.md`.
Predictions below are the frozen card and are not edited after the fact.
Splits: EWT **train + dev** only. **TEST sealed.**

## What this is not

This is not a punctuation-absorption bond.

Sole-cause `punct` on train+dev (758 cases) contains **zero commas and zero
`.?!`**. The bag is:

| Family | promisedUnblock | What it actually is |
|---|---:|---|
| HYPHEN_COMPOUND | 241 | `Al-Jazeera`, `well-informed`, `F-102` — tokenizer leaves `-` as PUNCT |
| PARENTHETICAL | 213 | `(`, `[`, `--` |
| QUOTE_FINAL | 197 | `"` / `'` |
| LIST_PUNCT | 45 | leading `-` bullets |
| OTHER | 62 | `/`, `~`, rules, markup |
| APPOSITION / FRAGMENT / SENTENCE_FINAL | 0 | not in this sole-cause bag |

A single punct-absorb law would count as a huge promisedUnblock on the
`punct (PUNCT -> NOUN)` row (277) and still be three or four constructions
plus a tokenizer leak. That is the ugly win this prereg exists to forbid.

Hyphen compounds are **not a grammar hole**. They belong in a lexical /
tokenization experiment, not a Grimoire bond.

## Replication (interior watchlist)

| Category | DEV rank / share | TRAIN rank / share | Recurred in top 8 |
|---|---|---|---|
| punct (PUNCT -> NOUN) | 1 / 0.071 | 1 / 0.071 | yes |
| punct (PUNCT -> PROPN) | 2 / 0.056 | 3 / 0.044 | yes |
| list (NUM -> NUM) | 3 / 0.039 | 2 / 0.045 | yes |
| advmod (PART -> VERB) | 5 / 0.032 | 4 / 0.041 | yes |
| nmod (NOUN -> NOUN) | 4 / 0.036 | 10 / 0.021 | **no** |

`nmod` is a DEV quirk. Do not target it.

## Chosen family, if one grammar intervention is run

**`list (NUM -> NUM)`**

Why this one, and not punct:

- Replicates (DEV #3, TRAIN #2).
- Sole-cause ratio **172 / 182 = 0.945**. That is a clean causal claim.
- One UD relation. Not a bag.
- promisedUnblock stays conservative: 172 sentences, not the 765 punct-NOUN
  failures.

Not chosen:

- `root (* -> ROOT)` — clause unreached, not a root bond.
- any `punct (*)` row — mixed families, see above.
- `advmod (PART -> VERB)` — only 154/451 sole (0.34). Mixed frontier.

## Predictions (to be scored on DEV and TRAIN only)

If a **narrow** `list` construction is added, and nothing else:

1. `list (NUM -> NUM)` promisedUnblock on the post-atlas falls by ≥ 150.
2. Coverage may rise. That is not the claim.
3. **Containment must not fall.** The inversion anchor
   `From the AP comes this story` stays `CONTAINMENT_MISS` or becomes
   contained. It must not vanish into a worse plate.
4. False new parses: OVERGENERATED must not rise by more than 1% of scored
   sentences on DEV.
5. Other interior families' promisedUnblock change by ≤ 10 each
   (no collateral punct "fix").

Falsifier: promisedUnblock on `list (NUM -> NUM)` drops and OVERGENERATED
or CONTAINMENT_MISS worsens past the bounds above.

## What will be measured

Same atlas plates, same `promisedUnblock` definition (sole-cause only).
No TEST. No ranker. No doorway change.

## What is frozen as *not* this intervention

- No `PUNCT + X → X` absorption.
- No hyphen join pretending to be grammar.
- No NP leftover admission.

## Next act

Implement only after this card is accepted. Rerun:

```
node scripts/parser-failure-atlas.mjs --splits train,dev
```

Compare `atlas-dev.json` / `atlas-train.json` against this baseline.
