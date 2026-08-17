# RESULT — Remaining UNKNOWN census

TEST was not opened. Inventory and emission were not changed.

- commit `8495daa2103bf5c00ac65360244fbd79aa20e828`
- inventory 1.1.0
- TRAIN unknown mass 116636 across 14990 keys
  A function 5.7% / B content 85.2% / C spurious 9.1% / uncertain 0.0%
  B mass split: novel 72725 / known-elsewhere-content 24375 / known-elsewhere-function 2287
- DEV chamber ambiguous 8073, evidence 46.6%, UNKNOWN 53.4%
  items needed to reach 60% evidence: 1080
- Picked UNKNOWN by bucket: A 87 (2.0%); B 3771 (87.5%); C 451 (10.5%); uncertain 0 (0.0%)
- Picked novelty: novel 2957; known-elsewhere-content 930; known-elsewhere-function 422
- Inside B: novel 2730; known-elsewhere-content 917; known-elsewhere-function 124
- UNKNOWN groups that already have a known sibling atom: 1375 (31.9%). If those counted as evidence: 63.7%
- Gold diagnostic (not used for values): picked misses gold UPOS 2508; known sibling hits gold 948
- If picked key became known: A → 47.7%; B → 93.3%; C → 52.2%; A+B → 94.4%
- If C atoms were dropped (not scored): leave chamber 436, remaining 7637, evidence 48.3%, UNKNOWN 51.7%

## Top remaining UNKNOWN (TRAIN mass)

| rank | key | mass | bucket | novelty | action |
|---:|---|---:|---|---|---|
| 1 | i::PROPN | 1732 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 2 | 's::POSS | 907 | A_FUNCTION | novel | type-default |
| 3 | do::V | 852 | B_CONTENT | known-elsewhere-function | train-enrichment |
| 4 | there::ADV | 571 | A_FUNCTION | known-elsewhere-content | type-default |
| 5 | so::ADV | 539 | A_FUNCTION | novel | type-default |
| 6 | so::N | 539 | C_SPURIOUS | novel | fix-emission |
| 7 | out::ADJ | 449 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 8 | out::ADV | 449 | A_FUNCTION | known-elsewhere-function | type-default |
| 9 | out::N | 449 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 10 | out::V | 449 | B_CONTENT | known-elsewhere-function | train-enrichment |
| 11 | like::ADJ | 410 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 12 | like::N | 410 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 13 | time::V | 400 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 14 | up::ADJ | 396 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 15 | up::ADV | 396 | A_FUNCTION | known-elsewhere-function | type-default |
| 16 | up::V | 396 | B_CONTENT | known-elsewhere-function | train-enrichment |
| 17 | get::N | 395 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 18 | just::ADJ | 394 | B_CONTENT | novel | train-enrichment |
| 19 | just::ADV | 394 | A_FUNCTION | novel | type-default |
| 20 | know::N | 346 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 21 | very::ADJ | 330 | C_SPURIOUS | novel | fix-emission |
| 22 | very::ADV | 330 | A_FUNCTION | novel | type-default |
| 23 | more::ADV | 318 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 24 | more::N | 318 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 25 | good::ADV | 296 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 26 | good::N | 296 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 27 | go::ADJ | 280 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 28 | go::N | 280 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 29 | new::ADV | 280 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 30 | only::ADJ | 269 | B_CONTENT | novel | train-enrichment |
| 31 | only::ADV | 269 | A_FUNCTION | novel | type-default |
| 32 | if::PROPN | 267 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 33 | if::SUB | 267 | A_FUNCTION | novel | type-default |
| 34 | please::ADV | 260 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 35 | people::V | 243 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 36 | then::ADJ | 237 | C_SPURIOUS | novel | fix-emission |
| 37 | then::ADV | 237 | A_FUNCTION | novel | type-default |
| 38 | then::N | 237 | C_SPURIOUS | novel | fix-emission |
| 39 | back::ADJ | 236 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 40 | back::ADV | 236 | A_FUNCTION | known-elsewhere-function | type-default |

## Top picked UNKNOWN (DEV chamber items)

| rank | key | items | bucket | novelty | action |
|---:|---|---:|---|---|---|
| 1 | i::PROPN | 128 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 2 | 's::POSS | 87 | A_FUNCTION | novel | type-default |
| 3 | do::V | 82 | B_CONTENT | known-elsewhere-function | train-enrichment |
| 4 | good::N | 59 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 5 | very::ADJ | 56 | C_SPURIOUS | novel | fix-emission |
| 6 | great::N | 48 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 7 | like::N | 48 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 8 | get::N | 46 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 9 | best::N | 41 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 10 | so::N | 40 | C_SPURIOUS | novel | fix-emission |
| 11 | just::ADJ | 39 | B_CONTENT | novel | train-enrichment |
| 12 | if::PROPN | 31 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 13 | work::N | 30 | B_CONTENT | novel | train-enrichment |
| 14 | now::N | 29 | B_CONTENT | novel | train-enrichment |
| 15 | out::N | 29 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 16 | up::V | 28 | B_CONTENT | known-elsewhere-function | train-enrichment |
| 17 | thanks::N | 27 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 18 | go::N | 26 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 19 | know::N | 26 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 20 | take::N | 24 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 21 | going::N | 23 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 22 | more::N | 22 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 23 | let::N | 21 | B_CONTENT | novel | train-enrichment |
| 24 | only::ADJ | 21 | B_CONTENT | novel | train-enrichment |
| 25 | well::N | 21 | B_CONTENT | novel | train-enrichment |
| 26 | see::N | 20 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 27 | staff::N | 20 | B_CONTENT | novel | train-enrichment |
| 28 | make::N | 19 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 29 | find::N | 18 | B_CONTENT | novel | train-enrichment |
| 30 | friendly::N | 18 | B_CONTENT | novel | train-enrichment |
| 31 | much::N | 17 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 32 | name::N | 16 | B_CONTENT | novel | train-enrichment |
| 33 | attached::V | 14 | B_CONTENT | novel | train-enrichment |
| 34 | back::N | 14 | C_SPURIOUS | known-elsewhere-function | fix-emission |
| 35 | clean::N | 14 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 36 | give::N | 14 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 37 | look::N | 14 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 38 | looking::N | 14 | B_CONTENT | known-elsewhere-content | train-enrichment |
| 39 | try::N | 14 | B_CONTENT | novel | train-enrichment |
| 40 | why::N | 14 | B_CONTENT | novel | train-enrichment |

## Verdict

The remaining 13.4 points to 60% evidence are **not** mostly spurious emissions.

On the 8,073 DEV chamber items, 4,309 are still all-UNKNOWN. Of the picked unknown key:

| bucket | items | share of UNKNOWN | evidence if that bucket became known |
|---|---:|---:|---:|
| A function / systematic | 87 | 2.0% | 47.7% |
| B legitimate content | 3,771 | 87.5% | 93.3% |
| C spurious emission | 451 | 10.5% | 52.2% |

C cannot close the gate. A cannot close the gate. B can, many times over.

That is not permission to dump particles onto every B key.

### B is not one population

| B subtype | DEV picked-UNKNOWN items | Meaning |
|---|---:|---|
| novel | 2,730 | lemma has no authored content type |
| known-elsewhere-content | 917 | another content type already has particles (`good::N` while `good::ADJ` is known) |
| known-elsewhere-function | 124 | lemma is already a closed-class function word (`do::V` while `do` is AUX) |

TRAIN unknown mass tells the same story: B is 85.2% of remaining mass, and 72,725 of that 99,387 B-mass is novel.

### The hidden exposure leak

1,375 UNKNOWN groups (31.9%) already contain a **known sibling atom**. If those counted as evidence, the chamber would already be at 63.7%.

They do not count, because the gate inspects the **picked** reading, and with no relational score the pick is the first emitted type. `atomsFor` emits `PROPN` then `N` before `ADJ`/`V`/`PRON`. So:

- mid-sentence `I` → pick `i::PROPN` (C), sibling `i::PRON` is already known
- `good` → pick `good::N` (B, known-elsewhere), sibling `good::ADJ` is already known

This is not missing ontology. It is first-atom starvation. Changing the evidence definition to "any known atom in the group" would cross 60% without adding a word, and it would also be a gate change. The frozen 60% threshold stays. This number is a diagnosis, not a waiver.

Gold UPOS was used only as a diagnostic: 2,508 UNKNOWN picks miss gold; in 948 of those a known sibling hits gold. Values were not authored from DEV gold.

### What C actually buys

Dropping C atoms, without adding particles:

- 436 items leave the chamber (no longer ambiguous)
- remaining evidence 48.3%, UNKNOWN 51.7%

That is a hypothesis-space cleanup, not an exposure win. Highest-frequency C keys: `i::PROPN` (128 DEV items), `very::ADJ` (56), `so::N` (40), `if::PROPN` (31), particle-as-N/ADJ (`out`, `up`, `back`).

Do **not** add particles to those keys. Any emission cleanup is a separate preregistered treatment. Forest fingerprints may change. T1 exposure restarts from the new parser baseline.

### What A still is

Remaining A is small and systematic: `'s::POSS` (87 DEV items, the entire A pick mass in this chamber), plus discourse/particle ADVs and leftover `SUB`/`MODAL` in TRAIN mass. Type defaults here are lawful only if they come with `FEATURE_COMPAT` relations. A bland `*::POSS` that never fires a correspondence is cheap coverage.

### Recommended next T1 treatment (not executed here)

1. Keep the frozen exposure gate.
2. Do **not** inherit `good::ADJ` onto `good::N` just to make the pick known.
3. Author TRAIN-only class assignments for **novel B**, type-conditioned:
   - activity: `work`, `use`
   - permission/causation: `let`
   - human-role leftovers: `staff`
   - label/name nouns: `name`
   - evaluative adjectives: `just`, `only`, `same`, `friendly`
   - ordinal/temporal: `first`, `last`
   - quantity: `two`, `much`
   - residual verbs: `do` as main verb, `find`, `try`, `attached`
4. Type-default the leftover A classes only with new correspondences (POSS, discourse ADV, particle ADV, SUB).
5. Open a **separate** emission-cleanup prereg for C. Do not mix it into this substrate freeze.
6. Re-run exposure only. Do not interpret T1 accuracy until evidence ≥ 60% and UNKNOWN ≤ 40%, with score disagreement still ≥ 10% and rank disagreements still ≥ 30.
7. T2 stays quarantined until forward ≠ inverse on score or rank.

Reproduction: `node scripts/unknown-remainder-census.mjs`

