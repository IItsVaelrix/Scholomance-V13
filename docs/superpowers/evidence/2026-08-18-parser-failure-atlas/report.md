# Parser failure atlas

Contract: `PB-PARSER-FAILURE-ATLAS-v1`
Compose was not modified. No root was admitted. TEST was not opened for ranking.

## Collection

- splits: train, dev
- scored: 12587
- skipped too long: 1958
- threw: 0
- atlas cases: 11188

## Plates

| Plate | Cases |
|---|---:|
| LEXICAL | 234 |
| GRAMMAR | 7801 |
| ROOT_TYPE_MISMATCH | 1128 |
| CONTAINMENT_MISS | 411 |
| OVERGENERATED | 1614 |

## Construction holes (GRAMMAR sole-cause)

`promisedUnblock` is the number of sentences whose entire frontier is this one category. Mixed frontiers are counted as failures and are not promised.

| Category | Failures | Sole cause / promised unblock | Gold-root lemmas |
|---|---:|---:|---:|
| root (VERB -> ROOT) | 539 | 473 | 262 |
| punct (PUNCT -> NOUN) | 765 | 277 | 522 |
| punct (PUNCT -> PROPN) | 368 | 178 | 291 |
| root (NOUN -> ROOT) | 178 | 176 | 150 |
| list (NUM -> NUM) | 182 | 172 | 100 |
| advmod (PART -> VERB) | 451 | 154 | 231 |
| root (PROPN -> ROOT) | 138 | 135 | 133 |
| punct (PUNCT -> VERB) | 463 | 130 | 300 |
| obl (NOUN -> VERB) | 321 | 130 | 237 |
| aux (AUX -> VERB) | 345 | 120 | 208 |
| obj (NOUN -> VERB) | 277 | 118 | 184 |
| root (ADJ -> ROOT) | 110 | 105 | 78 |
| conj (VERB -> VERB) | 248 | 96 | 178 |
| nmod (NOUN -> NOUN) | 186 | 91 | 153 |
| advcl (VERB -> VERB) | 196 | 80 | 144 |
| punct (PUNCT -> ADJ) | 191 | 65 | 156 |
| conj (NOUN -> NOUN) | 188 | 62 | 151 |
| acl (VERB -> NOUN) | 122 | 61 | 82 |
| obj (PRON -> VERB) | 137 | 59 | 100 |
| obl (PRON -> VERB) | 108 | 54 | 84 |

## Leftover types on ROOT_TYPE_MISMATCH

Illumination is not admission. These are spanning types that are not licensed roots.

| Type | Cases |
|---|---:|
| NP | 959 |
| NC | 489 |
| N | 480 |
| PROPN | 248 |
| NPCOMMA | 102 |
| ADJ | 71 |
| APPOS | 51 |
| PP | 16 |
| PUNCT | 13 |
| INF | 3 |
| SBAR | 3 |
| CONJNP | 2 |
| DET | 2 |
| ADV | 1 |
| CONJADJ | 1 |
| FRONTED | 1 |
| MODAL | 1 |
| PRON | 1 |

## Interior sole-cause holes (root * -> ROOT excluded)

| Category | Failures | promisedUnblock |
|---|---:|---:|
| punct (PUNCT -> NOUN) | 765 | 277 |
| punct (PUNCT -> PROPN) | 368 | 178 |
| list (NUM -> NUM) | 182 | 172 |
| advmod (PART -> VERB) | 451 | 154 |
| punct (PUNCT -> VERB) | 463 | 130 |
| obl (NOUN -> VERB) | 321 | 130 |
| aux (AUX -> VERB) | 345 | 120 |
| obj (NOUN -> VERB) | 277 | 118 |
| conj (VERB -> VERB) | 248 | 96 |
| nmod (NOUN -> NOUN) | 186 | 91 |
| advcl (VERB -> VERB) | 196 | 80 |
| punct (PUNCT -> ADJ) | 191 | 65 |

## DEV vs TRAIN replication

Watchlist interiors recurring in both top 8: 4/5. TEST not opened.

| Category | DEV rank | DEV share | TRAIN rank | TRAIN share | Recurred |
|---|---:|---:|---:|---:|---|
| punct (PUNCT -> NOUN) | 1 | 0.071 | 1 | 0.071 | yes |
| punct (PUNCT -> PROPN) | 2 | 0.056 | 3 | 0.044 | yes |
| list (NUM -> NUM) | 3 | 0.039 | 2 | 0.045 | yes |
| nmod (NOUN -> NOUN) | 4 | 0.036 | 10 | 0.021 | no |
| advmod (PART -> VERB) | 5 | 0.032 | 4 | 0.041 | yes |

## Punctuation families (sole-cause punct only)

promisedUnblock is inside each family. There is no bag-level promise.

| Family | Cases / promisedUnblock | Lemmas | Example |
|---|---:|---:|---|
| QUOTE_FINAL | 197 | 139 | ' Bush fails reporter's pop quiz on international leaders |
| APPOSITION | 0 | 0 |  |
| FRAGMENT | 0 | 0 |  |
| PARENTHETICAL | 213 | 176 | [This killing of a respected cleric will be causing us trouble for years |
| LIST_PUNCT | 45 | 40 | - acd] |
| SENTENCE_FINAL | 0 | 0 |  |
| HYPHEN_COMPOUND | 241 | 200 | The cells were operating in the Ghazaliyah and al-Jihad districts of the |
| OTHER | 62 | 52 | Judge Hughes wrote: `government knowingly used false evidence against hi |

## Top 3 construction holes

1. **root (VERB -> ROOT)** — 473 promised unblock / 539 failures / 262 lemmas — clause unreached, not a root bond
2. **punct (PUNCT -> NOUN)** — 277 promised unblock / 765 failures / 522 lemmas
3. **punct (PUNCT -> PROPN)** — 178 promised unblock / 368 failures / 291 lemmas

Hyphen compounds are the mass of sole-cause punct (`Al-Jazeera`, `well-informed`).
That is tokenizer/lexical, not a missing punct-absorb law. Commas and `.?!`
do not appear in this sole-cause bag (0 / 3429 punct frontier sites).

The clean grammar candidate, if one intervention is run, is `list (NUM -> NUM)`
(172/182 sole-cause, replicates). See
`docs/superpowers/evidence/2026-08-18-PREREG-parser-failure-atlas-intervention.md`.

Stop. Do not add a bond. Do not open a doorway. TEST stays sealed.

