# PREREG — Does the constellation parser handle verse as well as prose?

**Registered:** 2026-08-21, before any arm was run.
**Contract:** `SCHOL-VERSE-COVERAGE-v1`
**Asked by:** Vaelrix — "is our parser good for poetry yet?"

---

## 0. What is already known without running anything

`codex/core/constellation/compose-packed.js:60` records a verified fact: **nothing
on the request path calls `composePacked`.** The shipped page service imports
`queryIdentity`, `phraseAnalysis`, `pageBytecode`, `governor` and `readings`; it
does not import the chart parser. Every number below therefore describes a bench
engine, not a served request. That is stated here so the result cannot later be
read as a product claim.

Every existing measurement of this parser is on **UD English-EWT** (web text:
blogs, emails, reviews, newsgroups) or on **Gutenberg prose**. There is no verse
in the treebank gate, no verse in the failure atlas, and no poetry fixture
anywhere in `tests/`. The honest pre-registration answer to the question is
"nobody has ever measured it," and this document exists to stop that being the
whole answer.

## 1. Question

Does the packed chart parser build structure over **verse** at the rate it builds
structure over **prose**, at matched length, under the product lexicon?

## 2. What this CANNOT answer

**Coverage is not accuracy.** The endpoint below is "did a spanning derivation
exist", not "was it the right one". There is no gold-annotated poetry treebank on
disk and none is being fetched, so nothing here licenses a claim that the trees
are correct. The treebank gate already names the way coverage lies — a vaguer
lexicon spans more — so the vagueness proxy in §5 is gated alongside it.

## 3. Population and denominator (Tribunal rules 1, 2, 6, 10)

- Source: `cache/gutenberg` (5,294 English texts present offline), classified via
  `cache/pg_catalog.csv` — 1,329 poetry-only, 2,839 fiction-only, 39 both.
  The 39 both-tagged books are **excluded from both arms**.
- Books are sampled seeded-random, **matched on author birth decade** parsed from
  the catalog `Authors` field, so the contrast is verse-vs-prose and not
  1650-vs-1890 English. Books with no parseable birth year are excluded and counted.
- Every exclusion carries a reason code and appears in the emitted ledger. Accepted
  counts are reported next to the population they came from, never alone.
- `stripGutenbergWrapper` from `scripts/lib/gutenberg-corpus-sanitizer.mjs` is the
  single sanitation authority for both arms. No second segmenter is written.

## 4. Arms

| Arm | Text | Unit |
|-----|------|------|
| **V-LINE** | poetry books | the typographic verse line (author's own boundary) |
| **V-SENT** | poetry books | sentence, via `sanitizeGutenbergText` after de-lineation |
| **P-SENT** | fiction books | sentence, via `sanitizeGutenbergText` |

V-LINE is what the product would actually see. V-SENT exists so there is one
contrast where the unit-kind confound is removed. Rule 8 does not apply: neither
arm has gold boundaries to override.

Each arm is run at **both doorways**: `CLAUSAL` (`['S']`, the default) and `ALL`
(`['S','NP','APPOS','PP']`). A verse line is frequently a noun phrase or a
fragment; under the default doorway that fails for a reason that has nothing to do
with verse being hard. Running both separates "this line is not a clause" from
"the parser cannot build this line."

## 5. Endpoints

**Primary.** Spanning-parse rate: `composePacked(tokens, posMap, {roots}).stable.length > 0`.

**Length matching is by construction, not by regression.** Units are binned by
exact token count over 3..20. For each bin `k`, `min(n_arm)` units are drawn
seeded-random from each arm, so the two length histograms are *identical*. The
pooled rate is over that matched sample. Per-bin rates are reported too.

**Secondary, both pre-registered:**
- **Atomless-unit rate** — share of units carrying ≥1 token for which
  `atomsFor` returns `[]`. This is the lexical wall, measured separately from the
  grammatical one.
- **Mean atoms per token** — lexical vagueness. If verse coverage matches prose
  only while carrying more atoms per token, the match was bought, not earned.

**Lexicon:** `scholomance_dict.sqlite` `lemma_form`, 351,501 surface forms — the
product table, not the 1,659-entry gate fixture.

## 6. Predictions (committed before running)

1. **V-LINE coverage < P-SENT coverage** at matched length, at the default
   CLAUSAL doorway. Mechanism: enjambment. A verse line is often not a
   constituent at all, so the parser is asked to span something that is not a
   sentence.
2. **The V-LINE gap shrinks substantially at doorway=ALL** — much of the deficit
   is the clausal door, not the grammar.
3. **V-SENT coverage < P-SENT coverage**, but by less than V-LINE, and driven
   more by the atomless rate (archaic morphology: `thee`, `hath`, `-est`,
   elisions like `o'er`) than by grammar.

## 7. Falsifiers

- If **V-LINE ≥ P-SENT** at matched length at both doorways, prediction 1 is
  refuted and "verse is harder for this parser" is dead as stated.
- If the V-LINE→ALL gap closure is **< 25% of the CLAUSAL gap**, prediction 2 is
  refuted: the doorway is not the story.
- If **V-SENT atomless rate ≤ P-SENT atomless rate**, prediction 3's mechanism is
  refuted; any remaining gap is grammatical and must be named as such.

## 8. Analysis is fixed here

Pooled matched-sample rates, per-bin rates, two-proportion difference with a
Wilson interval on each arm. No subgroup is introduced after seeing the data. If
something interesting appears in a subgroup, it is written down as a *new*
prereg, not folded into this result.
