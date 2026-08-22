# RESULT — SCHOL-VERSE-COVERAGE-v1

**Prereg:** `2026-08-21-PREREG-verse-vs-prose-coverage.md` (registered before any arm ran)
**Data:** `2026-08-21-verse-vs-prose-coverage.json`
**Reproduce:** `node scripts/verse-vs-prose-coverage.mjs --books 40 --units-per-book 300`

40 poetry books vs 40 fiction books from `cache/gutenberg`, author-birth-decade
matched, length-matched by exact token count over 3..20, product lexicon
(`lemma_form`, 351,501 forms). n ≈ 4,400–5,100 units per matched arm. 0 throws.

## Prediction 1 — REFUTED

I predicted verse lines would cover WORSE than length-matched prose. They cover
BETTER, in all four tokenizer × doorway configurations.

| tokenizer | doorway | V-LINE | P-SENT | Δ |
|---|---|---|---|---|
| codex | CLAUSAL | 33.3% | 31.5% | **+1.8pp** |
| codex | ALL | 39.2% | 33.4% | **+5.9pp** |
| surface | CLAUSAL | 29.2% | 25.5% | **+3.7pp** |
| surface | ALL | 35.4% | 27.5% | **+7.9pp** |

Wilson 95% intervals are disjoint in every row except codex/CLAUSAL, where they
overlap slightly (33.3 [31.9, 34.7] vs 31.5 [30.2, 32.9]).

## Prediction 3 — REFUTED, and its mechanism runs backwards

I predicted verse would carry MORE unknown vocabulary. It carries far less:

| | atomless-unit rate | atoms/token |
|---|---|---|
| V-LINE | 20.5% | 1.466 |
| P-SENT | 29.6% | 1.474 |

**atoms/token is flat across arms** (1.466 vs 1.474; 1.388 vs 1.362 on the
surface tokenizer). The verse advantage was NOT bought with lexical vagueness —
that falsifier is clean.

### Where the atomless gap actually comes from — measured, not assumed

Earlier drafts of this file asserted the cause was character names. That was a
story told over a rate. The script now records every atomless surface form and
splits the mass three ways. Per matched arm (codex/CLAUSAL, ~32,270 tokens each):

| | atomless tokens | punctuation | name-like | other unknown words |
|---|---|---|---|---|
| V-LINE | 1,213 | 25 | 203 | **985** |
| P-SENT | 1,563 | 16 | 658 | **889** |

"Name-like" = the form appears capitalised non-initially somewhere in that arm's
own text, with dialogue openings, post-terminal positions and quote-led words
excluded (`verse-vs-prose-coverage.mjs`, `capitalizedNonInitialForms`). Before
those exclusions prose scored 59.3%; the dialogue bias was worth 17 points of it.

Two things follow, and the second was not predicted by anyone:

1. **Names more than account for the whole gap.** Prose carries 350 more atomless
   tokens; it carries 455 more name-like ones.
2. **Strip the names and the gap inverts.** On non-name unknown words verse is
   *worse*: 985 vs 889, 3.05% vs 2.75% of tokens. That is prediction 3's archaic
   morphology (`twas`, `hae`, `lo`, `amid`, `heav`) — the mechanism was real, it
   was just outweighed by prose's proper nouns.

**The mechanism is tokenizer-dependent, and both branches point at fiction, not
at verse.** Under `surface`, names are essentially absent from the atomless pool
(0.5% of verse alpha tokens, **0.0%** of prose) because `compose.js:334` hands
every capitalised token at index > 0 a `PROPN` atom. There the gap is punctuation
instead: 3,908 atomless punctuation tokens in prose vs 2,366 in verse, dominated
by dialogue quote marks (`"` alone appears 2,133 times). Lowercase the text and
fiction's dialogue costs it character names; keep the case and it costs it
quotation marks. Either way the thing being measured is prose fiction's dialogue
machinery.

**The verse advantage is lexical, not grammatical.** Nothing here says the chart
parser understands verse. It says verse hands it fewer unknown tokens.

## Prediction 2 — survives in a weakened form

The predicted deficit never existed, so the "gap closure" falsifier is moot. But
opening the doorway to `NP/APPOS/PP` helps verse roughly three times as much as
prose (V-LINE +5.9pp vs P-SENT +1.8pp; surface +6.2 vs +2.0). Verse lines do lean
harder on non-clausal roots, as predicted — it just never cost them coverage.

## The unit choice is worth ~5pp, and only under one tokenizer

**Not preregistered — exploratory.** Recorded as `vLineVsVSent` in the JSON with
`preregistered: false`.

An earlier draft put this at **+8.4pp** by comparing the pooled V-LINE rate
(33.3%) against the pooled V-SENT rate (24.9%). Those come from two different
matched draws: V-LINE averages 7.41 tokens, V-SENT 10.23, and coverage falls
steeply with length (43% at 3 tokens, 12% at 13). Most of that headline was the
length difference being priced as a unit effect — the one confound §5 of the
prereg exists to remove, skipped in the one section that was not preregistered.

Run through the same `lengthMatch` as every other contrast, on the same poetry
books:

| tokenizer | doorway | V-LINE | V-SENT | Δ | n |
|---|---|---|---|---|---|
| codex | CLAUSAL | 34.7% [33.1, 36.4] | 29.8% [28.3, 31.4] | **+4.9pp** | 3,316 |
| codex | ALL | 41.4% [39.7, 43.1] | 36.3% [34.7, 37.9] | **+5.1pp** | 3,316 |
| surface | CLAUSAL | 30.7% [29.2, 32.2] | 31.8% [30.3, 33.4] | −1.1pp | 3,649 |
| surface | ALL | 38.3% [36.8, 39.9] | 41.5% [39.9, 43.1] | −3.1pp | 3,649 |

**The sign flips with the tokenizer.** The line beats the sentence under `codex`
with disjoint intervals, and loses to it under `surface`. So "prefer the
typographic line" is not established: it holds only where punctuation is
discarded, which is a property of `codex/core/tokenizer.js`, not of verse. The
honest reading is that the unit question is open and worth its own prereg.

## Standing limits

- **Not the product.** `composePacked` is not on the request path
  (`compose-packed.js:60`).
- **Coverage is not accuracy.** No gold poetry treebank exists on disk. Every
  number above is "a spanning derivation existed", never "it was the right one".
- **The name proxy is a proxy.** Capitalisation is evidence of a name, not proof.
  Verse personifies (`Death`, `Love`, `Spring`) and those count as name-like here,
  which biases *against* the finding rather than for it. It bounds the name
  hypothesis; it does not prove it.
- Absolute rates are not comparable to the treebank gate: that reads gold
  CoNLL-U surface forms, this reads `codex/core/tokenizer.js`, which lowercases
  and discards punctuation.
