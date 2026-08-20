# PREREG — SEAM-1b: the phrase/sentence seam on NOMINAL subjects

- **Date:** 2026-08-19
- **Supersedes the population of:** `2026-08-19-PREREG-seam-1-phrase-vs-sentence-layer.md`
- **Skill:** semantic-chemistry §5, §17, §23, §25, §26, §28
- **Classification:** research/diagnostic. Reads only.

## 0. Why SEAM-1's population was invalid

SEAM-1 ran and its numbers are kept in `2026-08-19-seam-1-phrase-vs-sentence.json`. They do
not answer the question, for a reason found by inspecting mechanism, not outcome:

- **60.3% of the gold subjects are PRONOUNS** (362/600: PRON 362, NOUN 171, PROPN 60, NUM 2,
  ADJ 3, DET 2).
- The phrase layer's `STOPWORDS` (107 entries) blocks **every** English subject pronoun —
  `i you he she it we they who that this there` are all filtered in `resolveHead` before
  ranking. Arm A is therefore structurally incapable on 60.3% of the population **by design**,
  not by weakness.
- The null baseline `firstTaggedNoun` scored 0.5100 largely by winning that same 60%: the
  WordNet lemma table tags `i`, `he`, `it`, `one`, `someone`, `u`, `nothing` as nouns, giving
  it **0.5331 on pronoun subjects** vs 0.4748 on nominal ones.

So the SEAM-1 comparison largely measured *how often an English subject is a pronoun*. This
is the same class of error as the one already on file — a gold objective that does not match
what the product answers — caught one level down: SEAM-1 fixed "verb vs noun" and missed
"pronoun vs content noun."

**This restriction is declared from mechanism (the STOPWORDS list) before re-running, not
carved out of SEAM-1's results after seeing which subgroup was favourable.**

## 1. Population — frozen before execution

- All eligible records with a gold subject whose **UPOS is NOUN or PROPN**, `<= 28` tokens,
  from `cache/ud/en_ewt-ud-test.conllu` (held out, 0 sent_id overlap with the gate sample).
- **No sampling** — the entire qualifying population is used, so there is no sample-draw
  variance and no seed to choose. n is reported as found.
- Everything else is unchanged from SEAM-1: same two POS sources (P1 frozen gate lexicon,
  P2 live `scholomance_dict.sqlite`), same train-derived frequencies, no gold POS anywhere.

## 2. Arms

- **A** — `selectHeadToken(tokens, freqMap, posMap)` (shipped phrase layer).
- **B** — `composePacked` -> `projectAnswers(ranked[0])`, subject only. As in SEAM-1.
- **B-canonical** — `pickResonantDerivation(ranked[0], field, bonds)`, subject only. **Added
  here and declared in advance**: this is the decision rule `runTreebank`'s packed path
  actually uses, and SEAM-1's arm B was a plainer top-of-ranking rule that may understate the
  sentence layer. Both are reported.
- **B-contained** — any derivation carries the right subject. Upper bound on any decision rule.
- **Nulls** — `firstTaggedNoun`, `lastContentToken`, `randomContentToken`.
  **Bug fixed and disclosed:** SEAM-1's `lastContentToken` and `randomContentToken` did not
  filter punctuation, so `lastContentToken` returned the sentence-final `.` and scored a
  meaningless 0.0000. Punctuation is now excluded from both. `firstTaggedNoun` was unaffected
  (punctuation is not tagged `n`) and its SEAM-1 value stands.

## 3. Falsifiers — declared before execution

- **F1.** If B (either decision rule) does not exceed A, the sentence layer does not answer
  the product's question better on the population where both are permitted to answer.
- **F2.** If, restricted to records A gets wrong, B is right no more often than B's own base
  rate, the layers fail together and the seam buys nothing where it matters.
- **F3.** If any arm survives a shuffled POS table at similar accuracy, it is not consuming POS.
- **F4.** If B does not beat `firstTaggedNoun` **on this population**, the sentence layer is an
  expensive re-derivation of a one-line rule. SEAM-1's F4 comparison was confounded by the
  pronoun population; this is the clean test.

Significance on paired data by McNemar with continuity correction. CIs by 2000-sample
bootstrap over records (§26 — records are separate sentences, so the record IS the cluster).

**Committed in advance:** all arms reported, including the sentence layer losing to a
one-line baseline. No arm added or dropped after execution.

## 4. What this still cannot do

- It cannot show either layer is good — `firstTaggedNoun` at ~0.47 on nominal subjects is the
  bar, and both SEAM-1 arms were far below it on the mixed population.
- It cannot separate "the parser is weak" from "the parse rate is low." Parse rate is reported
  alongside so the two are not conflated.
- UD `nsubj` restricted to NOUN/PROPN is a proxy for "the phrase's nominal anchor." It is a
  much closer proxy than SEAM-1's, and it is still a proxy.
