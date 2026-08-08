# Packed Chart with an Activation Agenda — Design

**Date:** 2026-08-08
**Branch:** `feature/semantic-calculus-lexical-predicates`
**Status:** approved, not implemented

## Problem

`codex/core/constellation/compose.js` does not terminate on real input.

Measured 2026-08-08: a single UD English-EWT sentence of **fewer than 28 tokens** held
node at 100% CPU and **1,382 MB resident for 8m15s** before being killed. A 28-token
input has only 406 cells, so the cost is not spread over a large chart — it is
concentrated inside cells that are already fully active. At roughly 100 bytes per
molecule that run had built on the order of 14 million molecules across those 406 cells.

The cause is at `compose.js:565`:

```js
cell[from][to].push({ type: result, from, to, parts: [left, right] });
```

Every *derivation* becomes its own object. If a span is buildable as `NP` in 400 ways,
the cell holds 400 separate `NP` objects, and the next layer up multiplies against all
400. The chart is an **unpacked** parse forest, so its size follows the Catalan numbers —
1, 2, 5, 14, 42, and 16,796 at ten prepositions, all previously measured — asymptotically
~4^n / n^1.5.

The immediate consequence is that the treebank baseline cannot be produced. A 28-token
cap was added to the report runner (`08646e4c`) as a stopgap; it is insufficient, because
the quantity that fills the chart is not length but ambiguity density, and a short
sentence whose tokens each type several ways explodes faster than a long unambiguous one.
Under that cap the held-out number would mean "coverage among sentences that did not
explode".

## The fix: store the factors, not the product

Catalan growth comes from multiplying out. A left span buildable 400 ways and a right span
buildable 300 ways currently materialise 400 x 300 = 120,000 molecules, and that product
becomes a factor in the next layer.

Packing stores **400 + 300** instead of **400 x 300**: each `(span, category)` is one node,
carrying its alternative derivations as back-pointers. Turning a product into a sum is the
defining property of a logarithm, so the packed chart is the inverse operator applied to
the exponent rather than to the result. The bound goes from **4^n to n^3**.

Nothing is discarded. The same set of parses is still represented; it merely stops being
enumerated.

**A damper is explicitly rejected.** Pruning, decay, or a per-cell molecule cap can only
act on molecules that already exist, so it does not buy back the memory spent creating
them; and to stay small it must discard readings, after which a failure cannot be
attributed — a missing grammar rule and a discarded reading look identical. That is the
lossy-beam option, and it is a check that cannot fail.

## Current grammar, for the bound

Verified 2026-08-08 against `compose.js`: **64 binary bonds, 6 unary lifts, 39 distinct
categories** (`ADJ ADV APPOS AUX COMMA CONJ CONJNP CONJS CONJVP COP DET FRONTED GEN INF INV
MODAL N NP NPCOMMA NPO P PART POSS PP PRON PRONACC PROPN PRT REL RELC S SBAR SCOMMA SUB THAN
THANP TO V VP`).

## Architecture

`compose.js` is **not modified**. The packed parser is a new module beside it.

| Component | Change |
|---|---|
| `codex/core/constellation/compose.js` | untouched |
| `codex/core/constellation/compose-packed.js` | new — packed chart, activation agenda, `headsOf`, `projectAnswers` |
| `codex/core/constellation/failure-diagnosis.js` | none — it reads only `{type, from, to}` plus `spanning`/`stable`, which a packed node satisfies |
| `scripts/treebank-report.mjs` | add `--parser packed\|classic` so both run through the same instrument |
| `scripts/parser-equivalence.mjs` | new — differential harness |

This is safe to do in parallel because `compose.js` has **zero production consumers**:
verified 2026-08-08, it is imported only by `tests/qa/features/constellation-compose.test.js`,
`tests/qa/features/constellation-irregular.test.js`, and `scripts/treebank-report.mjs`.

### Return shape

`compose(tokens, posMap, options)` returns the same four keys, so `failure-diagnosis.js`
and `frontierSignature` work unchanged:

```js
{
  atoms,      // every atom node
  molecules,  // EVERY node in the chart, flattened — each carries {type, from, to}
  spanning,   // nodes covering 0..n-1
  stable,     // spanning nodes whose type is a declared root (default ['S'])
}
```

`molecules` is what the diagnoser reads for reachability
(`molecules.some(m => m.from === i && m.to === j)`), and a packed node answers that
identically — with far fewer entries to scan. What changes is the *count* of entries, never
which spans are present.

### One meaning changes, and it must be advertised

Today `stable.length` is the number of complete parses. Packed, there is at most one `S`
node per span, so `stable.length` becomes 0 or 1. Coverage — "does a spanning `S` exist" —
is preserved exactly. Anything reading `stable.length` as a parse count now reads something
else, and every such site must be found and updated deliberately. Parse count was never the
quantity worth reporting; it is the number the neutrality result concluded to stop using.

## The cell and the wake rule

A cell is a `Map<category, Node>`, not an array. That single change is the dedup.

```js
Node = {
  type, from, to,
  derivations: [ {bond, left, right} | {lift, child} ],  // every way to build it
  token,                                                  // atoms only
}
```

```
offer(from, to, category, derivation):
    existing = cell[from][to].get(category)
    if existing:  existing.derivations.push(derivation)   // record it, broadcast NOTHING
    else:         cell[from][to].set(category, node)      // new category — wake the neighbours
                  agenda.push(node)
```

Seeds are the atoms. Dequeuing a node tries it against every existing neighbour on both
sides plus its unary lifts. A neighbour created later re-examines this node when it is
itself dequeued, so no pairing is missed.

### Termination

A node is enqueued only on the first appearance of a `(span, category)` pair, so the agenda
accepts at most `n(n+1)/2 x 39` items — **15,834 for a 28-token sentence**, against the ~14
million molecules measured. Ambiguity does not appear in that bound: it only lengthens
`derivations` arrays, which are never iterated during the parse.

### A cycle guard disappears

`closeUnderLifts` currently needs an identity guard so a lift cannot feed itself forever.
Under the wake rule a lift producing an already-present category appends a derivation and
broadcasts nothing, so lift cycles terminate for free.

### No `parts` field, on purpose

Exposing `parts = derivations[0]`'s children would let `headOf` and `leavesOf` keep working
untouched — while silently answering about one arbitrarily chosen tree out of hundreds.
Consumers get explicit plural accessors instead, so anything that walks `parts` fails loudly
at the point of change rather than lying.

## Heads and answers

`headsOf(node)` returns a Set, memoised per node:

- an atom's head is its token
- a bond derivation's head is its left child's, except `DET + N -> NP` which takes the right —
  the rule `headOf` uses today
- a lift's head is its child's
- a node's heads are the union over its derivations

Lifts can cycle, so a `visiting` guard returns the empty set on re-entry: a cycle contributes
nothing rather than looping. Same discipline as `subtreeSpans` in the diagnoser.

`projectAnswers(sNode)` returns a Set of distinct `{subject, verb}`: for each top-level
derivation, the cross product of the two children's head sets, deduped by string key. A
single child is an imperative, so subject is null.

**This makes the neutrality result native.** Today the pipeline builds 42 parses and then
projects them to 1 answer. Packed, it never builds the 42 — it reads the answer set off the
forest. The 4^n was work spent on a distinction discarded at the last step.

## Ranking is deferred, with evidence

`rankByAttraction` scores a complete parse's leaves as a geometric mean,
`exp(logSum / counted)`. A mean is not Viterbi-decomposable here, because different
derivations type different tokens into scoring categories, so `counted` varies. Making it
decomposable means switching to a plain log-sum — a real change to how readings rank, which
deserves its own measurement.

The instrument already measured what that ranker is worth on EWT dev: containment 34
sentences, decision 32. Across 2,001 sentences it distinguishes **two**.

So `compose-packed.js` reports `decision: null` initially — honestly absent rather than
faked. Whether the score becomes a log-sum is a separate, measured decision.

## Testing

### Unit tests — the packing invariants

- a cell never holds two nodes of the same `(span, category)`
- where classic produced N molecules for a span+category, packed produces one node with N
  derivations — nothing lost, only un-multiplied
- the agenda accepts each `(span, category)` at most once, asserted with a counter
- a lift cycle terminates with no identity guard present
- `headsOf` returns the union across derivations, not the first — the fixture needs two
  derivations with genuinely different heads or the test proves nothing

### The acceptance test is differential

`scripts/parser-equivalence.mjs`: for every EWT sentence the classic parser can finish, run
both and compare

1. does a spanning `S` exist
2. the set of distinct `{subject, verb}` answers
3. the failure categories `diagnose()` reports

Any divergence is printed with its sentence. Agreement across 2,001 real sentences is a far
stronger claim than any unit test. A divergence is either a packing bug or a bug in the
classic parser that packing exposed — both are findings worth having.

Sentences the classic parser cannot finish are **excluded and counted**, never silently
dropped. That count is itself a headline: it is how much of the corpus was previously
unmeasurable.

### Two claims measured, not asserted

- peak agenda events against the predicted `n(n+1)/2 x 39`; exceeding it means the wake rule
  is leaking
- the specific sentence that hung at 1,382 MB, run packed, reporting event count, node count,
  and time

## Payoff

Re-run the treebank baseline with `--parser packed`, **uncapped**. The held-out figure stops
being "coverage among sentences under 28 tokens" and becomes coverage over the whole split.

## Out of scope

- Changing `compose.js`.
- Changing the grammar — no new bonds, no new lifts. This is a representation change and
  coverage must not move. If coverage moves, that is a divergence and a bug.
- Making `rankByAttraction` decomposable (see above).
- The punctuation gap found by the diagnoser (`compose.js:369` types only `,`). Real, and
  separate work.

## Related

- `docs/superpowers/specs/2026-08-08-gold-treebank-failure-diagnosis-design.md` — the
  instrument used as the oracle here.
- Memory: parse-ambiguity-neutrality (count answers, not parses), checks-that-cannot-fail.
