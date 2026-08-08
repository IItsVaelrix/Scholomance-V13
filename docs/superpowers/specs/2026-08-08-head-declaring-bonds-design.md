# Head-Declaring Bonds — Design

**Date:** 2026-08-08
**Branch:** `feature/semantic-calculus-lexical-predicates`
**Status:** approved, not implemented

## Problem

`headOf` in `compose.js` finds a constituent's head by **position**:

```js
function headOf(m) {
  if (m.parts.length === 0) return m.token;
  if (m.type === 'NP' && m.parts[0].type === 'DET') return headOf(m.parts[1]);
  return headOf(m.parts[0]);
}
```

Take the leftmost child, with exactly one hand-carved exception for determiners.
English puts the head on the right in several constructions, and each one that
was never tested is silently wrong. Three instances are now measured:

| construction | head is | status |
|---|---|---|
| `DET + N -> NP` | right | patched by the one exception |
| `ADJ + N -> N` | right | **broken** — reports the adjective |
| `COP / AUX / MODAL + VP -> VP` | right | **broken** — reports the auxiliary |

Reproduced directly:

```
the old man fell             -> subject "old"      (gold: man)
the dog is chasing the cat . -> verb "is"          (gold: chasing)
the dog will run .           -> verb "will"        (gold: run)
the dog was chased .         -> verb "was"         (gold: chased)
```

### How much this costs, measured

EWT dev, packed parser, 435 sentences with a spanning `S`, of which 233 have a
gold `nsubj` and are therefore scoreable:

```
correct                                       38   16.3%
subject right, VERB wrong                    108   46.4%   <- auxiliaries
subject constituent NOT BUILT                  4    1.7%
built, head taken from inside it              13    5.6%   <- ADJ head bug
built, but a different span won               70   30.0%   <- selection
```

**The subject is correct in 146 of 233 (62.7%).** The parser has been finding
the right subject and reporting the wrong verb.

Note the 1.7%: the chart almost always builds the correct subject constituent.
Vocabulary, subcategorisation frames, and retrieval are therefore **not** what
limits correctness once a sentence parses. That direction was considered and the
measurement rejected it.

## The fix: the head is data, not a traversal

Each bond declares which of its two children is the head, written when the bond
fires. `BONDS` entries become 4-tuples:

```js
const BONDS = [
  ['DET', 'N',  'NP', 1],   // head is the noun
  ['AUX', 'VP', 'VP', 1],   // head is the verb phrase
  ['V',   'NP', 'VP', 0],   // head is the verb
  // ... and so on for all 68
];
```

`headOf` then follows the declared child, and **the `DET` exception is deleted** —
it becomes one row of data like every other bond. The bug class stops being
"which constructions did somebody remember to except" and becomes a field that
either is or is not filled in.

### The 4th element is REQUIRED on all 68 bonds

Not optional with a default. A default of `0` would reproduce exactly the failure
being fixed: the bonds nobody reviewed would silently keep the old behaviour,
which is how `ADJ + N` and `AUX + VP` survived this long. Module load asserts
every entry has a head index in `{0, 1}` and throws otherwise, so an
unreviewed bond cannot run.

`LIFTS` needs no change: a unary lift has one child, which is trivially the head.

## Assigning the 68 heads

Runtime classification of the current table:

```
result type === LEFT child's type     16   endocentric, head = left
result type === RIGHT child's type    14   endocentric, head = right
result type === NEITHER               38   exocentric
```

The 38 look like 38 separate judgement calls. They are not, because **we are
scored against Universal Dependencies, and UD has a convention: the head is the
content word.** Function words — determiners, prepositions, auxiliaries,
copulas, infinitival `to`, subordinators, complementisers, coordinators — are
dependents (`det`, `case`, `aux`, `cop`, `mark`, `cc`), never heads.

Adopting UD's convention is not deference to an outside authority; it is the only
choice under which our answer can agree with the answer key. A different but
defensible convention would be wrong *for this measurement* by construction.

That single principle decides most of the 38:

```
P + NP -> PP        head = NP    (the preposition is `case`)
TO + VP -> INF      head = VP    (`mark`)
SUB + S -> SBAR     head = S     (`mark`)
REL + VP -> RELC    head = VP
CONJ + NP -> CONJNP head = NP    (`cc`)
COP + ADJ -> VP     head = ADJ   (the copula is `cop`)
GEN + N -> NP       head = N
NP + VP -> S        head = VP    (UD roots a clause on its verb)
V + NP -> VP        head = V
```

### The ones that genuinely need a ruling

These are not settled by the content-head rule and must be decided explicitly,
each with its UD relation named in a comment:

- **Coordination** — `NPCOMMA + NP -> APPOS`, `APPOS + COMMA -> NP`, and the
  `CONJ*` family. UD attaches `conj` to the **first** conjunct, so the head is
  the left conjunct, which is the opposite of the content-head intuition for
  `CONJ + NP`.
- **Inversion** — `MODAL/AUX/COP + NP -> INV`, then `INV + VP -> S`,
  `INV + ADJ -> S`, `INV + NP -> S`. `INV` bundles an auxiliary with the subject,
  so no child is cleanly the head; the ruling must say which and why.
- **Fronting** — `ADV/SBAR/PP + COMMA -> FRONTED`, `S + COMMA -> SCOMMA`. The
  comma is punctuation, so the head is the non-comma child, but the resulting
  category is not a projection of it.
- **`NP + POSS -> GEN`** — UD makes the possessor an `nmod:poss` dependent of the
  possessed noun, which sits outside this bond entirely.

Each ruling is a line of comment naming the UD relation it follows. A bond whose
ruling cannot be stated in one line is a sign the bond itself is wrong, and that
should be reported rather than guessed.

## Both charts change together

`compose.js` `headOf` and `compose-packed.js` `headsOf` must both read the
declared head. `compose-packed.js` imports `BONDS` from `compose.js`, so the
table itself is shared; only the two traversal functions need editing, and they
must stay behaviourally identical — a differential harness proves the two charts
equivalent across 2,001 sentences, and it compares exactly these functions.

## Tests that assert the bug and must be updated

These currently encode the defect on purpose and will fail. That is correct and
expected; they are updated, not weakened:

- `tests/qa/features/constellation-compose-packed.test.js` — the test named
  `reproduces the classic chart, adjective-head bug included`, which asserts the
  head of `the old man` is `old`. It becomes `man`, and its comment — which says
  the fix belongs in `compose.js` where both charts inherit it — is now
  satisfied and should be rewritten rather than deleted, so the history stays
  legible.
- Any assertion in `tests/qa/features/constellation-compose.test.js` that reads a
  subject or verb from a sentence containing a prenominal adjective, an
  auxiliary, a modal, or a copula.

New tests, one per instance of the bug class, each of which must fail against
today's code: `ADJ + N`, `AUX + VP`, `MODAL + VP`, `COP + VP`, plus a `DET + N`
regression proving the deleted exception is still honoured by the data. And one
exhaustiveness test asserting every `BONDS` entry carries a head index.

## Prediction, recorded before the work

Fixing head declaration should convert most of the 108 verb-wrong and 13
head-bug cases: a **ceiling of 159/233 ≈ 68%** of scored parses, against 16.3%
today.

Expect meaningfully less than the ceiling. The last recorded prediction — that
punctuation would take coverage to ~32% — landed at 21.7%, over-shooting by
about 1.5x, because the estimator treats failure causes as independent when they
co-occur. The value here is the size of the gap between ceiling and actual, not
the hit.

Containment on the held-out `test` split is **5.9%** at the time of writing;
that is the number this work is trying to move.

## Out of scope

- **Unifying the punctuation projection.** `projectAnswers` currently has an
  explicit rule for looking through `PUNCT`. With declared heads, that could
  generalise to "descend while the result type equals the head child's type".
  It is left alone deliberately: it is a second behaviour change, it would move
  answers for cases nobody has measured, and it should follow its own
  measurement.
- **Subcategorisation frames, semantic valence, retrieval.** The 1.7%
  "constituent not built" figure says these do not limit correctness-given-a-parse.
  They remain relevant to *coverage*, which is a different measurement.
- **The 30% selection bucket** — sentences where the right constituent was built
  and a different span won. Real, larger than the head bug, and a separate
  problem: it needs a selection principle, not a head declaration.

## Related

- `docs/superpowers/specs/2026-08-08-gold-treebank-failure-diagnosis-design.md` —
  the instrument that found this.
- `docs/superpowers/specs/2026-08-08-packed-chart-design.md` — the chart whose
  `headsOf` changes alongside `headOf`.
