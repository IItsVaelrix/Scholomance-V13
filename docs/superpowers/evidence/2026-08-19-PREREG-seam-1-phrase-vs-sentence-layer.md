# PREREG — SEAM-1: does the sentence layer answer what the phrase layer gets wrong?

- **Date:** 2026-08-19
- **Skill:** `Scholomance LAW/semantic-chemistry-skill.md` §1, §5, §17, §23, §25, §26, §28
- **Classification:** research/diagnostic. Reads only. No production wiring, no grammar change.

## 0. Why this experiment

ConstellationOS is one parser in two layers that share no import in either direction:

- **phrase layer** (shipped, 25 modules): `resolveHead` / `resolveReadings` / `resolveGovernor`.
  Answers *which token is the phrase's nominal anchor*.
- **sentence layer** (~8,109 lines, no consumer): `composePacked` -> `projectAnswers`.
  Answers *{subject, verb}* over a full derivation.

`treebank:gate` scores the sentence layer on UD's objective, where a match requires BOTH
subject and verb. The product vetoes the verb: `constellationPage.service.js` exists to make
the anchor "the phrase's nominal head", and cites `the wound healed` anchoring on `wound`.
So the sentence layer can climb the gate without ever producing something the page accepts.

This experiment scores BOTH layers on **the product's objective only**.

## 1. Mechanism template (§1)

```text
PHYSICS:         Two reaction pathways to one product; ask whether the expensive
                 pathway yields anything the cheap one does not.
SEMANTIC ANALOG: phrase-layer head selection vs sentence-layer derivation projection.
STATE:           token list; POS table; corpus frequencies.
OPERATOR:        A = selectHeadToken(tokens, freqMap, posMap)
                 B = composePacked(tokens, posMap) -> projectAnswers -> .subject
OBSERVABLE:      accuracy against gold nominal anchor; and COMPLEMENTARITY —
                 B's accuracy restricted to the records A gets wrong.
CONTROL:         shuffled POS table (§5); three non-empty null baselines (§23).
FALSIFIER:       §3.
```

## 2. Setup — frozen before execution

- **Gold objective:** `goldAnswer(record).subject` (UD `nsubj` / `nsubj:pass`). This is the
  product's target, not UD's clause head. Records with a null gold subject are EXCLUDED —
  the question "which token is the nominal anchor" has no defined answer there.
- **Corpus:** `cache/ud/en_ewt-ud-test.conllu` (2077 sentences). **Held out**: 0 sent_id
  overlap with the frozen `treebank-gate.conllu` sample (500), verified before prereg.
- **POS table:** `tests/qa/fixtures/constellation/treebank-gate-lexicon.json` (1659 entries).
  Real and frozen. **`goldPosMap` is NOT used by any arm** — measuring head selection under
  gold POS is a standing prohibition in this repo and would answer a different question.
- **Frequencies:** token counts from `en_ewt-ud-train.conllu`. Never from the test split.
- **Bound:** `maxTokens = 28`, matching `runTreebank`'s own bound. Skips are counted.
- **Sample:** seeded random draw, seed `20260819`, n reported as drawn.

## 3. Falsifiers — declared before execution

- **F1 (no aggregate gain).** If B-decided accuracy ≤ A accuracy on the full population,
  the sentence layer does not answer the product's question better.
- **F2 (no complementarity).** If, restricted to records A gets WRONG, B-decided is right
  no more often than B's own overall base rate, then the two layers fail together and the
  seam buys nothing where it would matter. **This is the experiment's real question.**
- **F3 (not using POS).** If either arm's accuracy survives a shuffled POS table at
  similar levels, that arm is not consuming POS and the comparison is measuring something else.
- **F4 (beaten by a one-liner).** If B-decided does not beat the "first token tagged n"
  null baseline, the sentence layer is an expensive re-derivation of a trivial rule.

**Committed in advance:** every arm is reported, including the sentence layer losing. No
arm is added or dropped after first execution.

## 4. Known impurities, disclosed before the run

- `compose.js`, `compose-packed.js`, `grimoire/*`, `resonance-beacon.js` are **other agents'
  dirty WIP**. Results depend on their in-flight state. They are imported, never modified;
  their git status and a content checksum are recorded in the artifact.
- `projectAnswers` returns `{subject, verb}`; only `.subject` is scored. The verb field is
  computed and discarded — this is deliberate and is the whole point.
- The phrase layer was built for short queries, not 28-token web sentences. It is being run
  outside its design envelope. That handicaps arm A and is disclosed rather than corrected;
  the complementarity question (F2) is unaffected by a uniform handicap.

## 5. What this cannot do (§28 Step 4)

- It cannot show the sentence layer is *shippable* — only whether it answers this question.
- It cannot attribute a win to any specific bond family or construction.
- A positive result is evidence for building the seam, not evidence the seam is cheap.

---

## 6. AMENDMENT — 2026-08-19, before scoring

**Deviation:** §2 froze the POS table as `treebank-gate-lexicon.json`. Measured after a
12-sentence smoke run (on which arm A scored 0/12, disclosed here because it preceded the
change): that lexicon holds 1,659 entries and covers **21.2%** of the held-out test split's
4,949 word types. It is frozen to the gate's own 500 sentences. Running the experiment on it
starves BOTH arms of the signal they consume, and would measure lexicon coverage rather than
the two engines.

**Resolution:** the experiment runs under **both** POS sources and reports both. Nothing is
swapped out.

- **P1 — `treebank-gate-lexicon.json`** — as preregistered. 21.2% type coverage.
- **P2 — `scholomance_dict.sqlite` via `createLexiconAdapter(...).batchLookupPos`** — the
  POS source `constellationPage.service.js:74` actually calls on the live path. This is the
  product's real signal and is still **not** gold POS: it is a WordNet lemma table that
  never sees the sentence's UD tags.

The falsifiers in §3 are unchanged and are evaluated on **P2**, the product-faithful source.
P1 is reported alongside as the preregistered arm. If the two disagree about which layer
wins, that disagreement is itself the finding and is reported as such.
