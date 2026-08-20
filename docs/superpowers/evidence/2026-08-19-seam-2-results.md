# SEAM-2 — the nominal anchor, measured in the product's own envelope

- **Date:** 2026-08-19 · **Frozen HEAD:** `48d31119`
- **Prereg:** `2026-08-19-PREREG-seam-2-np-anchor.md` (falsifiers declared before execution)
- **Artifact:** `2026-08-19-seam-2-np-anchor.json` (checksum `24f1bb7708aadf71`)
- **Refusal recorded:** `DENY-0002` (`deny1:9b12a6641030dbc0`)
- **Classification:** research/diagnostic. No grammar change, nothing promoted, nothing wired.

---

## VERDICT: the diagnosis was right, the fix does not pay, and it is not being wired

`npAnchor` is refused for wiring per the preregistered F1. The uncomfortable finding stands:
**on short noun phrases with a good lexicon, one line of code beats everything.**

| Arm (P2, live dict, n=809) | Accuracy | 95% CI |
|---|---|---|
| **null: last token tagged `n`** | **0.8616** | — |
| B — `npAnchor` (new projection) | 0.7874 | [0.7577, 0.8158] |
| A — shipped phrase layer | 0.7676 | [0.7392, 0.7973] |
| null: random content token | 0.4388 | — |
| null: first token tagged `n` | 0.3832 | — |
| B — clause projection (`projectAnswers`) | 0.0099 | [0.0037, 0.0173] |

## 1. Falsifier results

| # | Falsifier | Result |
|---|---|---|
| F1 | `npAnchor` must beat `lastTaggedNoun` | **FAILED** — 0.7874 vs 0.8616; McNemar 89 vs 29, χ²=29.5 |
| F2 | `npAnchor` must beat the shipped layer | **FAILED** — 0.7874 vs 0.7676; 84 vs 68, χ²=1.48, p≈0.22 |
| F3 | must not survive shuffled POS | **SURVIVED** — 0.7874 → ~0.682 |
| F4 | clause projection must be near-zero | **SURVIVED** — 0.0099, the diagnosis holds |
| F5 | scored on the full set, no-answer = wrong | **HONOURED** — answer rate 0.8603 reported separately |

F1 was declared decisive in advance, so `npAnchor` is not proposed. `DENY-0002` records it by
mechanism rather than by name, with the condition that would unbind it (§2).

## 2. The correction that matters most

**SEAM-1b measured the shipped phrase layer at 0.2913. In its own envelope it scores 0.7676.**
That earlier number was the layer being run on 28-token web sentences it was never built for —
disclosed in the SEAM-1 prereg as a handicap, and now quantified: the same code is 2.6× better
when asked the question it was designed to answer. Any reading of SEAM-1b as "the shipped
parser is weak" was wrong, and this supersedes it.

## 3. The clause projection really was throwing the answer away

F4 confirms the mechanism claim rather than leaving it as an argument. `projectAnswers` scores
**0.0099** on short NPs — it demands `{subject, verb}` and reads only `chart.stable`, which
admits `S` alone. Meanwhile `chart.spanning` holds the right answer:

| input | `stable` | full-span molecule |
|---|---|---|
| `the shadowy wood` | 0 | `NP[0-2] head=["wood"]` ✓ |
| `the red barn` | 0 | `NP[0-2] head=["barn"]` ✓ |
| `search engine` | 1 (typed `S`) | clause projection said `{subject: null, verb: "search"}`; NP head is `engine` ✓ |

This is semantic-chemistry §20 (root doorway) exactly. **It was not fixed by promoting NP into
`stable`** — that changes what the parser admits, moves every treebank-gate number, and is the
named §27.4 failure mode. The fix was read-only, and it still did not earn its place.

## 4. The one genuine engineering finding: lexicon robustness

The baseline's win is entirely a function of POS coverage, and this is the result worth keeping:

| Arm | P1 (31% coverage) | P2 (85% coverage) | degradation |
|---|---|---|---|
| null `lastTaggedNoun` | 0.4116 | 0.8616 | **−45.0 pp** |
| `npAnchor` | 0.4747 | 0.7874 | −31.3 pp |
| **shipped phrase layer** | **0.7033** | 0.7676 | **−6.4 pp** |

**The one-liner beats the parser only when the lexicon is rich, and collapses when it is not.
The shipped phrase layer barely moves.** It is the most lexicon-robust arm by a wide margin —
it holds 0.7033 where the trivial rule falls to 0.4116. That is what the phrase layer is
actually buying, and no previous measurement had isolated it.

This also explains SEAM-1b's `firstTaggedNoun` upset in reverse: NP heads are final in English,
so `firstTaggedNoun` is strong on clause subjects (0.4930 there) and weak on NPs (0.3832 here),
while `lastTaggedNoun` inverts. Neither is a stable baseline; both are position priors.

## 5. The gold set now exists

`cache/ud/en_ewt-ud-test.conllu` → 809 deduplicated short NPs: contiguous NOUN/PROPN subtrees,
2–6 tokens, UPOS in `{DET, ADJ, NOUN, PROPN, NUM}`, gold anchor = the head form. Held out
(0 sent_id overlap with the frozen gate sample). No gold POS is used by any arm.

Before this, every instrument in the repo scored against full UD sentences, which is why a
layer built for short queries measured at 0.29. The set is cheap to regenerate
(`scripts/seam-2-np-anchor.mjs`) and is the missing envelope-matched instrument named at the
end of SEAM-1.

## 6. What is NOT licensed

- No claim that the sentence layer is useless — it was measured on one question, in one envelope.
- No doorway change. §21 requires head accuracy, purity, coverage and containment
  non-regression, and matched negative controls before any admission change. None were run.
- No claim about the product's real traffic. UD NP-heads are a close proxy for the nominal
  anchor, and still a proxy.
