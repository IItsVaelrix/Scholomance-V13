# PREREG — SEAM-2: the nominal anchor the parser already computes

- **Date:** 2026-08-19
- **Follows:** `2026-08-19-seam-1-results.md`
- **Skill:** semantic-chemistry §5, §17, §20, §21, §23, §25, §27.4, §28
- **Classification:** research/diagnostic. **No grammar change. Nothing promoted. Nothing wired.**

## 0. What SEAM-1b measured, and what it missed

SEAM-1b concluded the sentence layer scores 0.1905 on the nominal anchor. That measured the
**clause projection** (`projectAnswers` -> `{subject, verb}`), which reads only `chart.stable`.

Inspecting mechanism afterwards: on short noun phrases the parser builds the right answer and
the projection discards it.

| input | `stable` | `spanning` | full-span molecule |
|---|---|---|---|
| `the shadowy wood` | 0 | 1 | `NP[0-2] head=["wood"]` ✓ |
| `the red barn` | 0 | 1 | `NP[0-2] head=["barn"]` ✓ |
| `nuclear weapons` | 0 | 3 | `NP[0-1] head=["weapons"]` ✓ |

`projectAnswers` returns `[]` for all three, because only `S` reaches `stable`. This is
semantic-chemistry **§20 Root Doorway**: `root = S` is not the same as *valid complete
utterance*, and an NP utterance is a legitimate root the doorway does not admit.

## 1. The change under test — and the change deliberately NOT made

**§21 Purity Law: a diagnostic signal is not permission to rewrite the grammar.**
**§27.4 Fake Coverage: admitting broad root categories because coverage rises is the
named failure mode.** So:

- **NOT DONE:** promoting `NP` into `stable`. That would change what the parser admits, move
  every treebank-gate number, and is exactly the forbidden move.
- **DONE:** a **read-only projection**, `npAnchor(chart)`, that reads the full-span `NP`
  molecule out of `chart.spanning` and returns its head lemma. It writes nothing, promotes
  nothing, and changes no existing output. New file; the dirty WIP modules of other agents
  (`compose*.js`, `grimoire/*`, `resonance-beacon.js`) are read, never modified.

## 2. Gold set — the product's envelope, which did not exist before

Every instrument in this repo scores against full UD sentences. The product answers **short
content queries**. So the gold set is built, not borrowed:

- Source: `cache/ud/en_ewt-ud-test.conllu` (held out; 0 sent_id overlap with the gate sample).
- An item is the **subtree of a NOUN/PROPN head** where the span is contiguous, 2-6 tokens,
  and contains only `DET ADJ NOUN PROPN NUM` (no verbs, no punctuation, no clauses).
- **Gold anchor = the head token's form.** UD's NP head and the product's nominal anchor
  agree — unlike UD's clause head, which is the verb and which the product vetoes.
- Deduplicated by lowercased token sequence. n reported as found, no sampling.

## 3. Arms

- **A** — `selectHeadToken(tokens, freqMap, posMap)`, the shipped phrase layer. This is its
  design envelope, unlike SEAM-1b.
- **B_clause** — `projectAnswers(stable).subject`, the SEAM-1b path. Expected near 0; included
  so the claim "the projection is what fails" is measured, not asserted.
- **B_np** — `npAnchor(chart)`, the read-only projection under test.
- **Nulls (§23, plausible-wrong not empty):**
  - `lastTaggedNoun` — **the one to beat.** English NP heads are usually final; this is the
    honest one-line rule for this envelope, and the analogue of the `firstTaggedNoun` rule
    that beat everything in SEAM-1b.
  - `firstTaggedNoun`, `randomContentToken`.

POS from both sources as before (P1 frozen gate lexicon, P2 live dict). **No gold POS.**
Frequencies from the train split only.

## 4. Falsifiers — declared before execution

- **F1.** If `B_np` does not beat `lastTaggedNoun`, the projection is an expensive
  re-derivation of "take the last noun" and must not be wired. **This is the decisive test.**
- **F2.** If `B_np` does not beat arm A, the seam adds nothing over what already ships.
- **F3.** If `B_np` survives a shuffled POS table at similar accuracy, it is not reading the
  lexicon and the result is positional.
- **F4.** If `B_clause` is NOT near-zero, then the clause projection was not the problem and
  this whole diagnosis is wrong.
- **F5 (coverage is not correctness, §27.4).** `B_np` must be scored on the FULL gold set with
  no-answer counted as wrong — never on the subset where it happens to produce an answer.
  Its answer-rate is reported separately so coverage and accuracy are never conflated.

**Committed in advance:** all arms reported including `B_np` losing. No arm added or dropped
after execution. If F1 fails, the projection is not proposed for wiring.

## 5. What this cannot do

- It cannot show the projection helps on long sentences — it is scoped to short NPs.
- It cannot license promoting NP to a root. Nothing here tests purity or head accuracy on the
  treebank, and §21 requires those before any doorway change.
- UD NP-head is still a proxy for "the phrase's nominal anchor", though a much closer one
  than SEAM-1's.
