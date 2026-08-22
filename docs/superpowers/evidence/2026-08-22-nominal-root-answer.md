# RESULT — SCHOL-NOMINAL-ROOT-ANSWER-v1

**Reproduce:** `npx vitest run tests/qa/features/constellation-treebank-gate.test.js`
**Held-out arm:** `cache/ud/en_ewt-ud-test.conllu`, 500 sentences ≤28 tokens, product
lexicon (`scholomance_dict.sqlite`, `lemma_form`), no gold POS anywhere.

## What was wrong

43% of UD English-EWT sentences have a NON-VERB gold root. `composePacked` composes
them correctly — `chart.spanning` holds a full-span `NP`/`APPOS`/`DATE`/`PROPN` and the
bond table has already declared its head — but `ROOT_DOORWAY.CLAUSAL` filters `stable`
down to `['S']`, `ranked = rankByResonance(stable, …)` is therefore empty, and
`treebank-run.js` never entered its decision block at all. The parser held the answer
and reported nothing.

Of the 277 failing sentences in the frozen gate, **71 have a residual frontier of size
one** — the chart spanned the entire sentence with a single molecule: `N` ×20, `NP` ×11,
`NPCOMMA` ×9, `PROPN` ×9, `DATE` ×7, `APPOS` ×3.

## What changed

`nominalRootAnswer(chart, tokenCount)` in `codex/core/constellation/np-anchor.js`. It
reads the widest full-span nominal from `spanning` and returns the head `headsOf`
already computed. `treebank-run.js` consults it only when the clausal path produced no
answer.

**It changes what the parser REPORTS, never what it ACCEPTS.** `stable` is not touched.
`coverage` (0.29873417721518986) and `containment` (0.1949367088607595) are byte-identical
to the frozen baseline, asserted in the gate.

## Held-out result

| | answers | precision | right overall |
|---|---|---|---|
| incumbent | 81 (16.2%) | 69.1% | 56 (11.2%) |
| **+ nominalRootAnswer** | 175 (35.0%) | 66.3% | **116 (23.2%)** |

**+60 / −0**, McNemar chi²cc 58.0. Zero regressions because it only fires where the
parser previously said nothing. Dev replicates: 67 → 113, +46/−0, chi²cc 44.0.

Frozen fixture (1,659-entry lexicon, hermetic): answered 118 → 176, right 68 → 113,
precision 57.6% → **64.2%**. Precision rose.

## The control that had to pass

The chart must beat a rule that ignores it. **Same trigger, same 175 sentences**,
`lastTaggedNoun` substituted for the chart's head:

| | right |
|---|---|
| chart head | **116** |
| chart-free last-tagged-noun | 95 |

**+25 / −4, chi²cc 13.8** on held-out (dev +19/−3, chi²cc 10.2). The chart head equals
the last token only 33.0% of the time; on the 50 of 94 rows where the two rules disagree
the chart wins **25 to 4**, on PP attachment (`Fascinating viewpoint of the future in
Epic` → `viewpoint`), appositives (`Tayib Rauf , 21 , Birmingham` → `Rauf`), dates
(`07/06/2000 14:57` → `07/06/2000`) and vocatives (`Dear Mr. Lavorato :` → `Lavorato`).

## What this REFUTES

The 2026-08-20 doorway result — open `ROOT_DOORWAY` to `ALL` plus a nominal head rule —
is confounded, and reproduces on today's tree only in its confounded form.

| held-out arm | right |
|---|---|
| incumbent | 56 (11.2%) |
| doorway `ALL` **alone** | 53 (10.6%) |
| doorway `ALL` + `lastTaggedNoun` | 88 (17.6%) |
| **CLAUSAL doorway + chart head (this work)** | **116 (23.2%)** |

Opening the doorway alone makes the strict endpoint WORSE. The gain attributed to it was
the head rule, and the head rule it used was the weak one. Widening what the parser
ACCEPTS was never necessary and never helped — the fix is on the reporting side, and the
CLAUSAL doorway is untouched by this work.

## Standing limits

- **Not the product.** `composePacked` is still not on the request path
  (`compose-packed.js:60`). This moves a bench endpoint.
- **The head set was a singleton on all 164 rows it fired on.** `headsOf` unions heads
  across a packed node's derivations; that union is a real wound elsewhere and simply did
  not bite here. `nominalRootAnswer` ABSTAINS on a non-singleton set rather than guessing
  inside it, so the wound cannot leak in silently — but it also means the fix is untested
  against genuinely ambiguous nominal roots.
- **DENY-0002 is not overturned.** That refutation is about SHORT NOUN PHRASES, where
  `lastTaggedNoun` beat the chart 0.8616 to 0.7874. This measures sentences whose clausal
  parse abstained — a population that study never contained. The two do not overlap.
- 23.2% right on held-out is double 11.2%, not working.
- Two test failures predate this work and were confirmed at HEAD in a detached worktree:
  `reactor.test.js` (2 assertions) and the classic-run test in
  `constellation-treebank.test.js` (a 20s budget this machine takes 23.5s to meet).
