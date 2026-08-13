# Grammar Valence Discovery — 2026-08-13

**Instrument:** `PB-CONSTELLATION-GRAMMAR-GAP-v1` Grammar Valence Cyclotron  
**Question:** Which molecules repeatedly want to connect but cannot under the active Grimoire?  
**Verdict:** One lexical-grammar nucleus survived DEV and blind TEST: English `to`
must offer both the adpositional atom `P` and infinitival-marker atom `TO`.

No bond was added to `BONDS` during this investigation.

## Full DEV scan

- Records: 2,001
- Unresolved adjacency events: 2,155 across the top 40 gap types
- Construction hypotheses: 7
- Rejected pair types with no legal proposal: 33
- Report checksum: `grammar-cyclotron1:779feba06fdf4648`

The seven broad construction hypotheses were screened on a deterministic 201-record
DEV slice against the repository's established volume-qualified shuffled-control
purity bar (`p95 = 0.901`).

| Hypothesis | Gap events | Δ coverage | Δ root | Δ ensemble | Purity | Verdict |
|---|---:|---:|---:|---:|---:|---|
| `NP+S→S` | 109 | +9 | +9 | +2 | 0.200 | GAIN-IMPURE |
| `NP+NP→NP` | 82 | +11 | +13 | +6 | 0.262 | GAIN-IMPURE |
| `S+NP→S` | 77 | +9 | +9 | +7 | 0.378 | GAIN-IMPURE |
| `S+S→S` | 75 | +15 | +15 | +11 | 0.181 | GAIN-IMPURE |
| `COMMA+S→S` | 37 | 0 | 0 | 0 | — | NO-GAIN |
| `S+CONJ→SCOMMA` | 35 | 0 | 0 | 0 | — | NO-GAIN |
| `VP+S→S` | 29 | +7 | +7 | 0 | 0.232 | GAIN-IMPURE |

The broad bonds raise coverage, but their material firings do not concentrate in
one gold construction family. None is eligible for Grimoire promotion.

## Specific nucleus: `to` is `P ∪ TO`

The strongest rejected gap was `TO+NP` (99 DEV events). Its gold frontier evidence
was overwhelmingly prepositional: 59 oblique links plus nominal modifiers. The
active atomizer emits `TO` for `to`, but `to` is absent from `PREPOSITION_CUES`, so
the already-existing `P+NP→PP` grammar cannot fire.

The experiment added `to` to `PREPOSITION_CUES` in process memory only. This made
`atomsFor("to")` offer both readings while preserving the infinitival `TO` atom.

### Treebank gate

| Metric | DEV base | DEV `P ∪ TO` | Δ | TEST base | TEST `P ∪ TO` | Δ |
|---|---:|---:|---:|---:|---:|---:|
| Complete parses | 508 | 543 | **+35** | 505 | 548 | **+43** |
| Root built | 729 | 764 | **+35** | 734 | 781 | **+47** |
| Gold in ensemble | 224 | 239 | **+15** | 188 | 213 | **+25** |
| Span recall | 78.094% | 79.070% | **+0.976 pp** | 77.426% | 78.567% | **+1.141 pp** |
| `nsubj` recall | 92.209% | 92.447% | **+0.238 pp** | 92.607% | 92.802% | **+0.195 pp** |
| Mean chart events | 85.80 | 89.22 | +3.42 | 79.83 | 83.79 | +3.96 |
| Maximum chart events | — | — | — | 832 | 832 | **0** |

The TEST protection gate returned `ok: true` with no reasons.

### Gap collapse

| Gap | DEV base → dual | TEST base → dual |
|---|---:|---:|
| `TO+NP` | 99 → **0** | 119 → **0** |
| `S+TO` | 156 → **42** | 168 → **46** |
| `VP+TO` | 51 → **0** | 54 → **0** |
| `NP+TO` | 43 → **0** | 33 → **0** |
| `TO+S` | 43 → **0** | 45 → **0** |
| `TO+N` | 29 → **0** | 29 → **0** |

Across the top 80 gaps, unresolved events fell 3,001→2,718 on DEV and
2,604→2,312 on TEST.

## Interpretation

This is not evidence for a new free binary bond. It is evidence for a missing
semantic atom on a known polyfunctional word:

```text
to ──offers──► P   ── P+NP→PP ──► prepositional phrase
  └─offers──► TO  ── TO+VP→INF ─► infinitival phrase
```

That distinction explains why the broad clause/nominal glue candidates looked
productive but impure: the parser was trying to repair an earlier lexical-valence
omission at a later chart frontier.

## Recommendation

Promote `to: P ∪ TO` as a candidate lexical-grammar correction, with tests that:

1. assert both atoms are emitted;
2. preserve `TO+VP→INF`;
3. exercise `P+NP→PP` for adpositional `to`;
4. rerun DEV/TEST protection and termination gates.

The scan supplied no prior antigen memory cells or verified Cleri report, so
`antigenMatches = 0`. The result is grounded in treebank frontier evidence and
the reactor, not an external recurrence match.
