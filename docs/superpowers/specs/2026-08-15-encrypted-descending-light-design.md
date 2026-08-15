# DESIGN — Encrypted descending light (root-reachability identity)

Status: proposed, not implemented. Date: 2026-08-15.
Target: `codex/core/constellation/` — `compose-packed.js`, `resonance-beacon.js`,
`atom-nucleus.js`.
Scope: Approach A of three (see §9 for B and C).

---

## 1. The problem

A token carries several readings and nothing local tells it which one it is. The
existing light is **bottom-up and meaning-agnostic**: `emitLight(atom)` returns
`{aura, from, to, energy}` and the module header says outright "no type, no
lemma." `photosynthesize` reacts only to lights from *other* spans. The whole
field is assembled from what the atoms already hold, so it can re-rank them but
cannot tell any of them something it did not already know.

Consequence, measured: mean **~469 stable readings per parsed sentence** on the
UD gate corpus, and 275 of 395 sentences fail on grammar rather than tagging.

## 2. What already exists

| piece | where | what it gives us |
|---|---|---|
| `productiveTypes(bonds, lifts, roots)` | `grimoire/reactor.js` | top-down closure from `S` — the categories a root can *ever* derive. Position-independent, so a weak filter. |
| node `derivations` | `compose-packed.js` | binary `{bond, left, right}` and unary `{lift, child}`, holding **direct child references**. A downward walk is plain graph reachability. |
| `stable` | `compose-packed.js:231` | `spanning.filter(m => roots.includes(m.type))` — the root nodes to descend from. |
| `nucleus` / `aura` | `atom-nucleus.js` | `aura1:xxxxxxxx`, "computed from the self only — type, span, lemmas, head lemmas, kind." Span-distinguishing, therefore usable as a key. |

Half the mechanism is built. What is missing is the descent.

## 3. Mechanism

After the agenda drains and the chart is frozen, light is emitted **downward
from every spanning root** through its derivations. Each cell the light reaches
is stamped. An atom *decrypts* the light iff it carries a matching stamp.

```
descend(chart, roots):
    lit   = new Set()
    stack = [...chart.stable]
    while stack not empty:
        node = stack.pop()
        if lit.has(node): continue
        lit.add(node)
        for d in node.derivations:
            if d.child:  stack.push(d.child)
            if d.left:   stack.push(d.left); stack.push(d.right)
    return lit
```

An atom is **identified** when it is lit. A token whose readings reduce to
exactly one lit atom has resolved its identity; a token with several lit atoms
is genuinely ambiguous and stays that way.

This is exact, runs in O(derivations), and needs no new grammar.

### Why it cannot lose a parse

"Lit" is *defined* as reachable from a spanning root. A reading that
participates in any complete parse is, by construction, reachable from that
parse's root. So the set of complete parses is invariant under this operation.
That is not a hope about the implementation — it is what the operation means,
and §7 turns it into a check.

## 4. The encryption layer

The payload is the set of **auras** of lit cells; an atom's key is its own
`readNucleus(atom).aura`. Decryption is aura-match. This keeps Vaelrix's framing
literal — an atom learns who it is by unlocking the broadcast, not by being told
— and it reuses a sealed, tested fingerprint rather than inventing a second
identity scheme.

**Verify before relying on it.** The aura is `fnv1aHex(...)` truncated to 8 hex
characters — 32 bits. Over ~3,300 atoms the birthday probability of at least one
collision is roughly 0.13%, small but not zero, and a collision would let an
unlit atom decrypt. Task 1 measures the actual collision count on the gate
corpus. If it is non-zero, the transport key falls back to the tuple
`(type, from, to)` and the aura becomes a display detail. **The reachability
computation always uses node identity, never the aura**, so a collision can
only affect the encoding, never the result.

## 5. Law compliance

`resonance-beacon.js` and `electromagnetism.js` both state *the field ranks, it
never removes*, and that holds today: the field is built after the chart is
frozen, and `bond-admission.js` reads no `charge`/`potential`/`wonCells`.

This mechanism **also runs after the chart is frozen** and does not feed
admission, so molecules do not rearrange. But it does something the field has
never done: it marks readings as unidentified, and a consumer could drop them.

Therefore, phased:

- **Phase 1 — annotate only.** `lit: true|false` on each atom and molecule.
  Nothing is removed. Every existing metric must be byte-identical.
- **Phase 2 — consume.** Only if Phase 1 shows the collapse is real, and only
  behind `options.lightGate`, graded on spanning.

Three suppression mechanisms have been measured on this parser and all three
destroyed sentences while reporting success — the aura shield's `rec-pres
69 → 0` was `spanning 6 → 0`. Phase 2 does not ship without the spanning check.

## 6. The four measurements

On the frozen 395-sentence gate corpus (`tests/qa/fixtures/constellation/`),
via `options.bonds` and `npm run treebank:graduate`:

| # | quantity | today | requirement |
|---|---|---|---|
| 1 | coverage, containment | read from `treebank-gate-baseline.json` at run time | **byte-identical** — this is the invariant, not a result |
| 2 | mean stable readings per parsed sentence | ~469 | report after |
| 3 | multi-reading tokens collapsing to exactly one lit identity | unmeasured | report as a fraction of ambiguous tokens |
| 4 | #2 and #3 under a **shuffled** light | — | must beat it, or the light carries nothing |

**The shuffled control** is degree-preserving: keep the same *number* of lit
cells, assign them to uniformly random cells of the same span-width
distribution, re-run #2 and #3. The bar is that control's p95 over ≥20 shuffles,
not a chosen constant. A light that only appears informative because *some*
cells got marked will sit at the control's level.

Also report, because it is free and diagnostic: **unlit fraction of the chart**
— how much of what the parser builds participates in no answer at all.

## 7. Falsifiers

Declared before the run.

- **F1 — the invariant.** If coverage or containment moves at all in Phase 1,
  the implementation is wrong. Not a finding, a bug.
- **F2 — the point.** If mean stable readings per sentence does not fall, the
  chart has little garbage and the mechanism buys nothing.
- **F3 — the control.** If token collapse (#3) fails to beat the shuffled p95,
  the light is not carrying structure and the work is refuted.
- **F4 — the honest null.** If the collapse is real but concentrated entirely in
  tokens that were already unambiguous, nothing was disambiguated. Report #3
  restricted to tokens with ≥2 readings, never over all tokens.

## 8. What this does NOT do

It prunes readings that cannot reach a root. **It does not choose between two
complete competing parses** — if both are root-reachable, both decrypt. Genuine
structural rivalry stays the resonance beacon's problem, and the beacon's own
sentence-level claim is currently null (12 wins / 13 losses, p = 1).

So "solves ambiguous notions" holds for ambiguity arising from chart garbage and
dead atoms. It does not hold for two valid readings of the same sentence.

Also: it says nothing about the 275 of 395 gate sentences that never span. With
no root, there is no light. That blind spot is exactly what Approach B addresses
and is the reason B stays on the table.

## 9. Approaches B and C, deferred

- **B — predictive light.** Per-position Earley prediction sets computed
  left-to-right from the grammar plus left context, broadcast *before* the chart
  fills, pruning the agenda. Works on failing sentences and does less work, but
  the parser is span-based CKY with no left-to-right pass, and predictions are a
  superset where A is exact.
- **C — A, then B if A earns it.** Chosen. A's measurement #3 decides: if most
  ambiguous tokens already collapse under A, B buys speed and ordering rather
  than answers.

## 10. Implementation surface

| file | change |
|---|---|
| `atom-nucleus.js` | export `auraCollisionCensus(nodes)` for Task 1 |
| `compose-packed.js` | `descendFromRoots(chart)` after `stable` is computed; attach `lit` to atoms and molecules; return `lit` set. Opt-in via `options.light`, default off, so the gate baseline is untouched until deliberately re-frozen |
| `resonance-beacon.js` | `emitDescendingLight(chart)` — the aura-keyed payload; `decrypt(atom, payload)` |
| `scripts/descending-light-report.mjs` | the four measurements plus the shuffled control |
| `tests/core/constellation/descending-light.test.js` | invariants, §11 |

## 11. Tests that must exist

1. **Coverage invariance** — same corpus with `options.light` on and off produces
   byte-identical `coverage`, `containment`, `spanning`, `stable`.
2. **No parse lost** — every node in every complete derivation of every spanning
   root is lit. Property test over the gate corpus, not a fixture.
3. **Unlit atoms are genuinely unreachable** — for a sample of unlit atoms,
   assert no path exists to any root. The converse of test 2, and the one that
   catches an over-eager walk.
4. **Relabelling changes nothing** — renaming a node's `type` string without
   changing its derivations must not change what is lit. Reachability is a graph
   property; if a label moves it, the walk is reading the wrong thing.
5. **Shuffled light scores at chance** — the control must not collapse tokens.
   A control that succeeds means the metric is saturated.

Test 4 exists because the last four defects found in the sibling reactor were
all a screen reading a label instead of a structure.

## 12. Open questions

1. **Phase 2 consumption policy.** If a reading is unlit, is it dropped, or
   ranked last? Dropping is cleaner but makes this a suppression mechanism with
   three failed predecessors. Recommend ranked-last first.
2. **Do lit atoms need to be lit *per root*?** Descending from all roots at once
   unions the parses. Per-root descent would say "under reading R of the
   sentence, this token is a noun" — richer, and closer to what disambiguation
   means, at the cost of one walk per stable root.
3. **Should the light reach the ledgers?** `options.ledger` already records
   refusals and non-couplings. An unlit atom that was refused is a different
   story from an unlit atom that never bonded, and the ledgers could separate
   them for free.
