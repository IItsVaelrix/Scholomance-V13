# SEAM-1 / SEAM-1b — does the sentence layer answer what the phrase layer gets wrong?

- **Date:** 2026-08-19 · **Frozen HEAD:** `48d31119`
- **Preregs:** `2026-08-19-PREREG-seam-1-phrase-vs-sentence-layer.md` (+ §6 amendment),
  `2026-08-19-PREREG-seam-1b-nominal-subjects.md`
- **Artifacts:** `2026-08-19-seam-1-phrase-vs-sentence.json` (checksum `3df2c64d60f199d5`),
  `2026-08-19-seam-1b-nominal-subjects.json` (checksum `cd875cd50f658541`)
- **Classification:** research/diagnostic. Nothing wired, no grammar changed, no gold POS used.

---

## VERDICT: the seam is not worth building as designed — and both layers lose to a one-line rule

On its own objective, on held-out text, **three of the four preregistered falsifiers failed.**
The sentence layer does not beat the phrase layer, does not rescue it where it fails, and
neither beats "the first word tagged as a noun."

| Arm (P2, live dict, n=357) | Accuracy | 95% CI |
|---|---|---|
| **null: first token tagged `n`** | **0.4930** | — |
| A — phrase layer `selectHeadToken` | 0.2913 | [0.2437, 0.3389] |
| B* — sentence layer, canonical `pickResonantDerivation` | 0.1905 | [0.1513, 0.2325] |
| B — sentence layer, top-of-ranking | 0.1849 | [0.1457, 0.2241] |
| B — contained (any derivation, upper bound) | 0.2045 | — |
| oracle union of A and B | 0.4034 | — |

**Even a perfect oracle that always picked the better of the two layers (0.4034) scores below
the one-line baseline (0.4930).**

Ordering is identical under the preregistered frozen lexicon (P1, 33% type coverage):
null 0.2661 > A 0.2129 > B 0.0784. The conclusion does not depend on the POS source.

## 1. Falsifier results

| # | Falsifier | Result |
|---|---|---|
| F1 | sentence layer does not exceed phrase layer | **FAILED** — 0.1905 vs 0.2913, CIs disjoint |
| F2 | no complementarity where the phrase layer is wrong | **FAILED** — see below |
| F3 | an arm survives shuffled POS ⇒ not using POS | **SURVIVED** — B halves (0.185→~0.096); A drops 0.291→~0.198 |
| F4 | sentence layer beaten by `firstTaggedNoun` | **FAILED** — 0.1905 vs 0.4930 |

**F2 in detail.** On the 253 records the phrase layer got wrong, the sentence layer was right
on 40 — **0.1581, BELOW its own 0.1849 base rate**. Where the phrase layer was right it scored
0.2500. The two layers succeed together and fail together. Swapping to the sentence layer
rescues 40 records and loses 78 (McNemar χ² = 11.60, but signed against the sentence layer).

**F3 nuance.** The sentence layer is strongly POS-dependent (halves under a shuffled table).
The phrase layer retains ~68% of its accuracy under shuffled POS, so most of what it is doing
is rarity and position, not category.

**The decision rule is not the bottleneck.** `contained` (0.2045) barely exceeds `decided`
(0.1849/0.1905), so no better ranking rescues the sentence layer. **Parse rate is** — it
produces any derivation on 28.6% of records, and is right on 71.6% of those.

## 2. Mechanism — the phrase layer is not broken, it answers a different question

`resolveHead` reports `decidedBy: 'rarity'`. It ranks content nouns by corpus rarity, which
finds *the most distinctive noun*, not *the grammatical subject*. On a short query those
coincide; on a full sentence they systematically do not:

| Sentence | Gold subject | Phrase layer picks |
|---|---|---|
| `Google is a nice search engine .` | Google | engine |
| `John Donovan from Argghhh! has put out a excellent slide show` | John | slide |
| `However , this toolbar is really bad news .` | toolbar | bad |
| `Iran says it is creating nuclear energy without wanting nuclear weapons` | Iran | weapons |
| `The United States does n't believe the Iranian Government .` | States | Government |

Every miss is the object or complement — the rarer noun. This is the layer working as
designed, outside the envelope it was designed for.

## 3. SEAM-1's population was invalid — recorded, not hidden

The first run's numbers are kept in full. They do not answer the question:

- **60.3% of UD `nsubj` gold subjects are PRONOUNS** (362/600).
- The phrase layer's `STOPWORDS` (107 entries) blocks every English subject pronoun
  (`i you he she it we they who that this there`) inside `resolveHead` before ranking. Arm A
  was **structurally disqualified on 60% of the population**, not losing on it.
- `firstTaggedNoun` scored 0.5100 there largely by winning that same 60%: the WordNet lemma
  table tags `i`, `he`, `it`, `one`, `someone`, `u`, `nothing` as nouns — **0.5331 on pronoun
  subjects vs 0.4748 on nominal ones**.

SEAM-1 therefore largely measured how often an English subject is a pronoun. This is the same
class of error as the one already on file — *a gold objective that does not match what the
product answers* — caught one level down: SEAM-1 corrected "verb vs noun" and missed
"pronoun vs content noun." SEAM-1b's restriction was declared from the STOPWORDS mechanism
**before** re-running, not carved out of SEAM-1's results after seeing which subgroup helped.

Under SEAM-1's invalid population the direction was **reversed** (B 0.1883 > A 0.1350,
McNemar p≈0.011). That reversal is entirely an artifact of disqualifying arm A.

## 4. Defects found in my own instrument, and what they cost

| Defect | Effect | Status |
|---|---|---|
| `lastContentToken` did not filter punctuation | returned the sentence-final `.`; scored a meaningless 0.0000 | fixed in 1b (0.0140) |
| arm B used top-of-ranking, not `runTreebank`'s `pickResonantDerivation` | could have understated the sentence layer | canonical arm added and declared; difference is 2 records (0.1849 vs 0.1905) |
| a spot check ran with an empty freqMap | suggested the phrase layer picks punctuation as a head | **withdrawn** — with real frequencies it is 1/357 (0.3%) |
| the frozen gate lexicon covers 21.2% of the held-out split | would have starved both arms | both POS sources reported; amendment recorded before scoring |

## 5. What this does and does not license

**Does:** stop treating "wire the sentence layer behind the phrase layer" as an obvious win.
It loses 78 records to gain 40, and the combination cannot reach a trivial baseline.

**Does not:** conclude the sentence layer is worthless, or that the phrase layer is bad at its
job. Both were measured on **28-token UD web sentences, outside the phrase layer's design
envelope** — short queries. That was disclosed in the prereg before running. What is
established is that neither layer answers *this* question on *this* text.

**The gap this exposes:** there is no gold set for the product's actual envelope — short
content queries. Every measurement available scores against UD sentences. Building that gold
set is the prerequisite for any further seam work, and is a smaller job than either layer.
