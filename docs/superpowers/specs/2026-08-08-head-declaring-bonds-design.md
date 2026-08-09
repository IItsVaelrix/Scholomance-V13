# Head-Declaring Bonds — Design

**Date:** 2026-08-08
**Branch:** `feature/semantic-calculus-lexical-predicates`
**Status:** **implemented and measured** (2026-08-08)
**Plan:** [`docs/superpowers/plans/2026-08-08-head-declaring-bonds.md`](../plans/2026-08-08-head-declaring-bonds.md)
**Evidence:** [`docs/superpowers/evidence/2026-08-08-head-declaration-result.md`](../evidence/2026-08-08-head-declaration-result.md)

### Result (banked)

| metric | before | after |
|---|---|---|
| correct (dev, scoreable) | 38/233 (16.3%) | **130/233 (55.8%)** |
| subject right, VERB wrong | 108 (46.4%) | 12 (5.2%) |
| head taken from inside | 13 (5.6%) | 4 (1.7%) |
| dev / test coverage | 21.7% / 21.9% | **unchanged** (control) |
| dev / test containment | 5.2% / 5.9% | 10.9% / 11.4% |

Reached 81.8% of the recorded ceiling (130 of 159). Dominant residual is
**different span won** (36.1%) — selection, not another head rule. Full write-up
in the evidence document.

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
was never tested was silently wrong. Three instances were measured (all **fixed**
by this work — status column is pre-fix):

| construction | head is | pre-fix status |
|---|---|---|
| `DET + N -> NP` | right | patched by the one exception |
| `ADJ + N -> N` | right | **broken** — reported the adjective |
| `COP / AUX / MODAL + VP -> VP` | right | **broken** — reported the auxiliary |

Reproduced pre-fix:

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

**As-built hardening** (post-implementation review, still in scope of the
invariant): load-time validation also rejects duplicate `(left, right, result)`
signatures — `headOf` looks bonds up by that triple, so uniqueness is a
prerequisite for a declared head to be unambiguous. The check is exported as
`validateBonds` so a test can prove the duplicate branch fires. Missing-bond
lookups in `headOf` **throw** rather than falling back to the left child; a
silent left fallback would reintroduce the positional bug through the one path
nobody was watching.

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

## Tests that asserted the bug (updated)

These encoded the defect on purpose and were updated, not weakened:

- `tests/qa/features/constellation-compose-packed.test.js` — the test formerly
  named `reproduces the classic chart, adjective-head bug included` was rewritten
  to `takes the noun as the head of a determined noun phrase` (expects `man`),
  preserving the history in the comment.
- Assertions in `tests/qa/features/constellation-compose.test.js` that read a
  subject or verb from sentences with prenominal adjectives, auxiliaries,
  modals, or copulas were corrected to the content-word heads.

New regression coverage (shipped): `ADJ + N`, `AUX + VP`, `MODAL + VP`, plus a
`DET + N` regression proving the deleted exception is still honoured by the data;
exhaustiveness test that every `BONDS` entry carries a head index; signature-
uniqueness / throw-on-missing-bond tests from review hardening.

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

### Outcome (measured after the work)

- **130/233 = 55.8% correct** — 81.8% of the ceiling; over-shoot factor 1.22x
  (tighter than the prior 1.47x punctuation miss).
- Coverage unchanged (21.7% / 21.9%) — control passed.
- Containment roughly doubled (dev 5.2%→10.9%, test 5.9%→11.4%).
- Dominant residual: **different span won** at 36.1% — selection, not heads.

See the evidence document for the full before/after tables and narrative.

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
- **The selection bucket** — was 30% pre-fix, **36.1% post-fix** (now
  dominant). Sentences where the right constituent was built and a different
  span won. Real, larger than the residual head bug, and a separate problem: it
  needs a selection principle, not a head declaration.

## Related

- `docs/superpowers/plans/2026-08-08-head-declaring-bonds.md` — implementation
  plan (all tasks complete; as-built notes record review hardening).
- `docs/superpowers/evidence/2026-08-08-head-declaration-result.md` — before/after
  against the prediction recorded above.
- `docs/superpowers/specs/2026-08-08-gold-treebank-failure-diagnosis-design.md` —
  the instrument that found this.
- `docs/superpowers/specs/2026-08-08-packed-chart-design.md` — the chart whose
  `headsOf` changes alongside `headOf`.

## Commits (implementation)

| commit | summary |
|---|---|
| `4cbd0aff` | every bond declares its head (inert data + guard) |
| `86cd3396` | `headOf` / `headsOf` follow the declaration; DET exception deleted |
| `463cd5f6` | `headsOf` JSDoc updated to the declared-head contract |
| `79dc565b` | evidence measured against the prediction |
| `052ec757` | review blockers: signature uniqueness, throw on missing bond, related packed-chart guards |
