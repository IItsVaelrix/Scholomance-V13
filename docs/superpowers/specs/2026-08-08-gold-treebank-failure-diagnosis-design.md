# Gold Treebank and Failure Diagnosis — Design

**Date:** 2026-08-08
**Branch:** `feature/semantic-calculus-lexical-predicates`
**Status:** approved, not implemented

## Problem

`codex/core/constellation/compose.js` reports one number: coverage, the fraction
of sentences for which some molecule of type `S` spans the input. Coverage rose
0.9% -> 36.6% on 2026-08-07. Three things that number cannot express:

1. **Whether the parse is right.** A sentence that spans as `S` with the wrong
   subject scores as a success. 36.6% coverage is consistent with any accuracy,
   including zero.
2. **Why a sentence failed.** The existing split (`gap.mjs`) is lexical-gap vs
   rule-gap, inferred from whether any token lacks a POS entry. That is a guess
   about the cause, not a measurement of it.
3. **Which construction is missing.** The existing marker analysis (`diag.mjs`)
   asks whether a failing sentence *contains* a hand-listed marker. It is
   correlational, cannot localise the failure to a span, and is blind to any
   construction absent from the list.

Both diagnostics live in a session scratchpad and are not checked in.

A further standing caveat: every coverage number so far is measured against
Gutenberg, whose archaic register (`unto`, `ye`, `thy`, `hath`) is not the target
domain. 36.6% is a floor for modern text by an unquantified margin.

## What is being built

Two instruments and one baseline report. **No grammar changes.** This work does
not attempt to raise coverage; it makes coverage falsifiable and turns failure
into named, located categories.

### Components

| Unit | Purpose | Depends on |
|---|---|---|
| `codex/core/constellation/treebank.js` | Pure CoNLL-U reader. `parseConllu(text)` -> records; `goldAnswer(record)` -> `{subject, verb}`; `goldPosMap(record)` -> oracle UPOS. No I/O. | nothing |
| `codex/core/constellation/failure-diagnosis.js` | Pure. `diagnose(record, composeResult)` -> `{outcome, categories, evidence}`. | `compose.js` types |
| `scripts/fetch-ud-treebank.mjs` | Downloads EWT train/dev/test into `cache/ud/`. Idempotent, skips existing files. | network |
| `scripts/treebank-report.mjs` | Runner. Reads corpus, runs `compose`, aggregates, prints tables. | both above |

Data flow: `.conllu` text -> records -> `(tokens, posMap)` -> `compose()` ->
outcome vs gold -> `diagnose()` -> aggregated report.

Tests: `tests/qa/features/constellation-treebank.test.js` and
`tests/qa/features/constellation-failure-diagnosis.test.js`.

## The gold

**Source: Universal Dependencies English-EWT**, CC BY-SA 4.0, human-annotated.
Verified live 2026-08-08 at
`https://raw.githubusercontent.com/UniversalDependencies/UD_English-EWT/master/en_ewt-ud-{train,dev,test}.conllu`
(all three return 200).

Chosen over annotating our own Gutenberg gold because an annotation produced by
the same model that wrote the parser is partly self-agreement — a check that can
barely fail. EWT is also modern web English, which attacks the register caveat
directly rather than inheriting it.

`cache/ud/` is gitignored, following `cache/gutenberg`. The treebank is not
vendored. What is checked in is the reader, the diagnoser and the fetch script,
so every number is reproducible from a clean clone with one command.

### Why a dependency treebank fits without conversion

`projectAnswer` returns `{subject, verb}` = `headOf(parts[0])`, `headOf(parts[1])`.
In dependency terms that is `nsubj` + `root`. UD supplies the primary metric
directly; no lossy dependency-to-constituent conversion is needed.

The first sentence of `en_ewt-ud-dev.conllu` already demonstrates the value:
`From the AP comes this story` has `root` at token 4 and `nsubj` at token 6.
`projectAnswer` reads the subject positionally from `parts[0]`, so subject-verb
inversion is scored wrong the moment gold exists. Coverage-only measurement
cannot see this class of error at all.

### Records

Per sentence the gold carries:

- **tokens** — UD's own tokenization. We do not re-tokenize; re-tokenizing
  misaligns every downstream index.
- **gold UPOS** per token.
- **gold answer** — `{subject: head of the nsubj edge or null, verb: root}`.
  `root` may be non-verbal.

The reader must skip CoNLL-U range lines (`1-2  don't`) and empty nodes (`8.1`),
which are not tokens.

### Split discipline

Iterate on `dev` + `train`. Report headline numbers on `test`, which is not read
during grammar work. Without this, "coverage went up" and "the eval set was
fitted" are indistinguishable, and hand-fitting a grammar to its own test set is
the same failure shape as a check that cannot fail.

## Metric contract

Coverage splits into three numbers:

- **coverage** — a spanning `S` exists.
- **containment** — the gold answer is among the projected answers.
- **decision** — `rankByAttraction`'s top parse projects to the gold answer.

**Containment minus decision is exactly the value the ranker adds**, and it is
currently unmeasured. Given mean answers of 1.54 on Gutenberg, these are expected
to be close; if the ranker is nearly idle, the report says so.

`rankByAttraction(molecules, senseMap)` has **no production caller** — it is
reached only from `tests/qa/features/constellation-compose.test.js`. Its
`senseMap` is per-POS WordNet sense counts, which live server-side behind
`codex/server/services/constellation/semanticInquiry.adapter.js`. The runner
sources senses from that same path.

**If the sense source is unavailable, `decision` reports `null`.** It must not
fall back to an empty map: with no counts every score is `1`, ties keep their
original order, and `decision` silently becomes "the first parse the chart
enumerated" while still printing as an accuracy. That is a check that cannot
fail, wearing a metric's name.

### Oracle-POS ablation

Run the composer twice per sentence — once with the `lemma_form` POS table, once
with gold UPOS. The 2x2 replaces the inferred lexical/rule split with a measured
one:

| | parses w/ gold POS | fails w/ gold POS |
|---|---|---|
| **parses w/ real POS** | grammar and tagger both fine | `PARSED` + `overGenerated`: a parse gold POS forbids |
| **fails w/ real POS** | tagging failure, definitively | grammar failure, definitively |

The top-right cell counts parses the grammar finds *only because* the POS table
was vague. Coverage-only measurement scores those as wins.

### Breakouts that must not be averaged

EWT is web text. Many roots are non-verbal (`Great food!` roots on a NOUN) and
many segments are not sentences (headers, URLs, signatures). The report breaks
out by **root UPOS** rather than averaging across them, so a low number cannot be
explained away as "it's the fragments" without that being visible in the table.

Because gold tokenization is used anyway, the runner reports one extra number:
agreement between the repo's tokenizer and UD's. A tokenizer bug silently
deleting commas cost coverage points once already, and was found by accident.

## Failure diagnosis

### Algorithm

The gold tree gives the correct bracketing; the chart gives how far up the
composer actually got.

A gold subtree is **reachable** if some chart cell spans exactly its token range.
This is readable from `compose`'s existing return value: `result.molecules` is
`cell.flat().flat()`, and every molecule — atoms included, which are built as
`{type, from: index, to: index, parts: [], token}` — carries `from` and `to`. So
reachability of span `[i, j]` is `molecules.some(m => m.from === i && m.to === j)`.
**No change to `compose.js` is required**, which is what keeps this work honest
about not touching the thing it measures.

Walk the gold tree bottom-up. The diagnosis is the set of **minimal unreachable
subtrees**: every child reachable, the subtree itself not. Each is a failure site
located to a token span, categorised by the deprel on its incoming edge together
with the UPOS of the heads it failed to join.

```
xcomp (VERB -> VERB)          412 failures
advcl (VERB -> VERB)          287
conj  (VERB -> VERB)          193
expl  (PRON -> VERB)           88
```

There is no authored bond-to-relation mapping. The chart supplies location, UD
supplies the name, the ranking comes from our own failures. The external resource
is used as a data port for the vocabulary of a fix, never as a priority ordering —
importing an expert inventory's ranking underdelivered twice on 2026-08-07
(Link Grammar particles +0.1 pts, adverbs +0.4 and reverted).

### Outcomes

- `PARSED` — spanning `S` exists. Carries an `overGenerated` flag when the
  sentence parses with the real POS table but *not* with gold POS: the parse
  exists only because the tagger was vague. This is the 2x2's top-right cell,
  and it is a flag rather than an outcome because the sentence did parse — but
  an unflagged coverage number counts it as a clean win.
- `LEXICAL` — fails with real POS, parses with gold POS.
- `GRAMMAR` — fails with both; reported with its minimal unreachable subtrees.
- `ROOT_TYPE_MISMATCH` — every gold subtree including the root's is reachable,
  but no spanning `S` formed. Not a missing construction: this is the `(end)`
  blocker shape, where sentences composed fully and failed a type check. Kept
  separate so it is not miscounted as a grammar gap.

Multiple minimal unreachable subtrees are all reported. The instrument does not
select a primary cause; selecting one would be inventing it.

### Off-gold fallback

On Gutenberg there is no gold tree. The classifier takes the maximal chart
constituents tiling the input and emits that type sequence as a raw signature
(`NP V PP`). Signatures are reported **unnamed**. A name is earned only by
matching a signature to a deprel category on the golded side. Unmatched
signatures report as `UNCLASSIFIED` with a count, never folded into an "other"
bucket — a classifier with an "other" bucket always achieves 100% coverage.

### The instrument's own honesty check

The report states what fraction of failures were classified and how many causes
were assigned per failure. An instrument that explains every failure and assigns
four causes to each is a horoscope, and the report shows that rather than hides
it.

### Falsifiable prediction

For each category the report states: *adding a bond for this relation unblocks N
sentences.* That number is recorded before the rule is built. After building,
re-run and compare predicted against actual. An instrument whose predictions do
not land is wrong; without this step "the diagnosis was useful" is unfalsifiable.

## Testing

`treebank.js` and `failure-diagnosis.js` are pure and get unit tests on
hand-built fixtures:

- a CoNLL-U snippet containing a range line and an empty node — both skipped
- `From the AP comes this story` — gold subject after the verb; asserts
  `goldAnswer` reads the `nsubj` edge, not position
- a nominal-root fragment — asserts a non-verbal `root` is carried, not dropped
- a synthetic chart with a known unreachable subtree — asserts the minimal
  frontier is found and no ancestor of it is also reported
- a synthetic chart where everything is reachable but no `S` formed — asserts
  `ROOT_TYPE_MISMATCH`, not a grammar gap
- a sentence parsing under a deliberately vague POS map and failing under gold —
  asserts `PARSED` + `overGenerated`, so the flag cannot quietly never fire

The runner gets no unit test. Its output is the measurement.

## Out of scope

- Any rule or lexicon change to `compose.js`. Acting on the printed roadmap is
  separate work, and if the baseline shows decision accuracy far below coverage,
  the roadmap changes anyway.
- Wiring `compose.js` into any consumer. It is still imported by nothing.
- The Gutenberg pre-existing working-tree changes (pixelbrain/subtlety), which
  stay untouched.

## Related

- `docs/superpowers/specs/` — sibling specs follow the same format.
- Memory: parse-ambiguity-neutrality (count answers, not parses),
  measure-own-failures-not-roadmaps, checks-that-cannot-fail.
