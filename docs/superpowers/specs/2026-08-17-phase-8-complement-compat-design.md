# DESIGN — Phase 8: complement COMPAT circuit

Status: **SPEC FROZEN 2026-08-17**. Implementation plan:
`docs/superpowers/plans/2026-08-17-phase-8-complement-compat.md`.
Prereg: `docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-compat.md`.

Parent program: `docs/superpowers/evidence/2026-08-17-PREREG-semantic-competition-coverage.md`.
Prior walls: Phase 3A (relation projection) · Phase 3B (lexical values).
This act is wall three: which value-pairs matter under those complement
relations. Nothing else.

---

## 1. Question

The reactor already has the complement relation and the participant
values. Does a **relation-keyed** compatibility table reach real
complement edges, fire on authored class pairs, and abstain on
everything else — without changing the forest, the grammar, or any
non-mapping waterfall stage?

The causal question this circuit is built to answer later (SCORE, gated):

> When two legal complement parses compete, does correctly aligned
> semantic compatibility beat scrambled compatibility?

Phase 8 does not open SCORE. It builds the circuit and measures it.

## 2. Scope (closed)

In:

- `INFINITIVAL_COMPLEMENT`
- `PROPOSITIONAL_COMPLEMENT`
- A relation-keyed COMPAT registry (governor class × complement class)
- Class projection from **existing** T1 features already on the oriented
  ends
- A complement-specific mapping waterfall
- One OBSERVE census
- One adversarial derangement control
- A **gated** complement-only SCORE sketch, run only if OBSERVE and
  derangement both pass

Out (forbidden in this act):

- Phase 4 inversion
- CLAUSAL / PARTICLE re-keying
- New feature dimensions
- New lemma bags, including desire / permission splits
- Clause-head event inheritance onto S / SBAR nodes
- Any change to `projectRelation`, `projectComplementRelation`,
  `composeMeanings` scores, emission, grammar, or bond admission
- Global T1 SCORE
- TEST
- Default compatibility because both ends are known

## 3. Why a new registry, not more FEATURE_COMPAT rows

`FEATURE_COMPAT` is a generic boolean matcher:

```
{ left: { kind, value }, relation, right: { kind, value }, weight }
```

After Phase 3B, every S / SBAR node carries `entity.abstract:true` and
every INF node carries `function.infinitival:true`. A generic row

```
entity.abstract × entity.abstract  on PROPOSITIONAL_COMPLEMENT
```

would fire on **all** S+SBAR and SBAR+S edges — compatibility because
both ends are structurally lit. That is the failure mode this phase
exists to refuse.

Complement compatibility is not “two known features.” It is:

```
INFINITIVAL_COMPLEMENT
  governorClass × complementEventClass

PROPOSITIONAL_COMPLEMENT
  governorPredicateClass × propositionContentClass
```

`want + leave` may fire. A physical-state predicate taking a proposition
must abstain. An S-governed clause whose only lit feature is structural
abstractness must abstain.

`FEATURE_COMPAT` stays the table for non-complement relations. It must
contain **zero** rows whose `relation` is `INFINITIVAL_COMPLEMENT` or
`PROPOSITIONAL_COMPLEMENT`. Tests pin that set-equality.

## 4. Class projection (existing features only)

Governor class comes only from **positive** `event.*` features on the
oriented left (governor) end. Multi-label is allowed: `write` may be
both communication and creation; every positive class is considered.

| Feature kind           | Governor class   |
|------------------------|------------------|
| `event.cognition`      | `cognition`      |
| `event.communication`  | `communication`  |
| `event.perception`     | `perception`     |
| `event.creation`       | `creation`       |
| `event.state`          | `state`          |
| `event.motion`         | `motion`         |
| `event.possession`     | `possession`     |
| `event.change`         | `change`         |

If no positive `event.*` is present, governor class is `UNKNOWN`.
`entity.abstract` is **never** a governor class. That is how S / SBAR
governors stay honest: they are lit (left-value stage already true)
and still semantically UNKNOWN as predicates.

Complement class is structural, because that is what 3B actually wrote
onto the right end:

| Relation                     | Required feature             | Complement class         |
|------------------------------|------------------------------|--------------------------|
| `INFINITIVAL_COMPLEMENT`     | `function.infinitival:true`  | `infinitival-event`      |
| `PROPOSITIONAL_COMPLEMENT`   | `entity.abstract:true`       | `abstract-proposition`   |

Anything else, including a dark or non-matching kind, is `UNKNOWN`.

`UNKNOWN` never matches a row. There is no default compatibility when
both ends are known.

Desire and permission are **not** classes in this act. They are not
lattice dimensions. Splitting them from cognition would be a new
lexical authorship act and is deferred.

## 5. Authored table (smallest defensible, TRAIN-gated)

Candidate pairs that **may** be authored if a TRAIN-only census shows
at least 30 complement decision edges of that pair:

**INFINITIVAL_COMPLEMENT** × `infinitival-event`:

- `cognition` (want / need / hope / intend / expect to VP)
- `communication` (ask / tell / promise to VP)
- `creation` (try / make to VP)
- `perception` (see / seem-adjacent perception to VP)
- `state` (seem / appear / remain to VP)

**PROPOSITIONAL_COMPLEMENT** × `abstract-proposition`:

- `cognition` (think / believe / know / hope that S)
- `communication` (say / tell / announce that S)
- `perception` (see / feel / notice that S)

**Forbidden even if TRAIN mass is large** (constructional or the
physical-state trap):

- `motion` × either complement class (`going to` is a future marker)
- `possession` × either (`have to` is obligation, not possession)
- `change` × either
- `state` × `abstract-proposition` (physical-state taking a proposition)
- any pair whose governor class would be `entity.abstract`
- any lemma-specific row
- any row on a non-complement relation
- PARTICLE / CLAUSAL

Weights (same scale as `FEATURE_COMPAT`, never a reject):

- cognition / communication: `2`
- perception / creation / state: `1.5`

`illegal` is always `false`. A weak or missing pairing is abstention,
not a bond refusal. Composition scores on complement rules stay `0`.

The TRAIN census (Task 3 of the plan) intersects observed mass with
this allow-list. The forbidden list wins. The authored row set is
written into the OBSERVE evidence **before** T1 is wired, then frozen.

## 6. Mapping waterfall (complement edges only)

The parent program's five global stages stay frozen. Phase 8 adds a
**parallel** instrument over edges whose projected relation is one of
the two complement relations:

1. `relationExists` — projected relation is in scope
2. `bothValuesExist` — oriented left and right each have ≥1 known feature
3. `mappingExists` — the registry has ≥1 row for this relation
4. `mappingFires` — at least one projected (governorClass, complementClass)
   pair hits an authored row
5. `mappingAbstains` — `bothValuesExist && mappingExists && !mappingFires`

`mappingAbstains` is the honest remainder: S-governed clauses, motion
governors, cutoff lemmas, forbidden pairs. A table that exists but
never reaches an edge is a failed act, even if unit tests pass.

Global stage movement (declared):

| Stage                    | Movement                                      |
|--------------------------|-----------------------------------------------|
| `relationAvailable`      | flat (29,570)                                 |
| `leftValueAvailable`     | flat (11,568)                                 |
| `rightValueAvailable`    | flat (10,989)                                 |
| `compatMappingAvailable` | up, complement relations only                 |
| `actualCompatFire`       | up, complement relations only                 |

`actualCompatFire` must remain equivalent to `diagnoseT1Edge` status
`could-fire`. Non-complement fires stay 827. Complement fires start at
0 and must become > 0.

Downstream of fire, and only there:

- C3 decreases by exactly the new complement fires (those edges were
  already named+complete)
- `silentCompetitorRate` stays flat (those edges were not silent)
- `namedComplete` stays flat
- `bothAlternativesT1Rate` may rise only via complement-relation fires

## 7. Architecture

```
oriented ends (already exist)
        │
        ▼
governorClasses(leftFeats)     complementClass(rightFeats, relation)
        │                              │
        └──────────┬───────────────────┘
                   ▼
        COMPLEMENT_COMPAT[relation]
        lookup (govClass × compClass)
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
   hit → fire + weight    miss / UNKNOWN → abstain
         │
         ▼
   feature-score.js  (complement relations only)
   compat-waterfall.js stage 4–5
   diagnoseT1Edge / scoreLexicalReading
```

New module: `codex/core/constellation/semantic-particles/complement-compat.js`.

`feature-score.js` consults the registry **only** when
`isComplementRelation(relation)`. The `FEATURE_COMPAT` loop is unchanged.

`compat-waterfall.js` `waterfallStages` consults the same registry for
those two relations so stage 4–5 cannot drift from T1.

Composition (`composeMeanings`) is not a scoring channel. The
no-evidence law stays: complement readings score exactly 0.

## 8. Derangement control (before SCORE)

Reuse `derangeFeatureValues(provider, seed)` with a seed frozen in the
prereg. Derange values, not coverage:

- known-count per lemma preserved
- relation counts preserved
- left/right value-available counts preserved
- `FEATURE_COMPAT` non-complement rows untouched

Compare, on the same DEV chamber:

- complement `mappingFires` real vs deranged
- which governor classes fire
- `efficacyVerdict` from `exposure-gate.js`

If real and deranged complement mappings behave the same, Phase 8 has
not demonstrated semantics. Do not open SCORE.

## 9. Gated SCORE (not this act's default)

Only after OBSERVE matches the prereg and derangement discriminates.

Four arms, **complement-competitive cells only**, forest identical:

1. syntax-only
2. composition-only (named, score 0)
3. real complement COMPAT
4. deranged complement COMPAT

Not global T1. TEST sealed. Authorship remains TRAIN-only. DEV gold
may be used as an evaluation label, never as a row source.

If this experiment is negative or flat, the honest report is that the
circuit reaches edges but does not yet rank. That is still a result.
Inversion (Phase 4) waits either way until this vertical slice is
closed.

## 10. Success signature (OBSERVE)

```
relationAvailable        = 29,570
leftValueAvailable       = 11,568
rightValueAvailable      = 10,989
compatMappingAvailable   ↑  (complement relations only)
actualCompatFire         ↑  (complement relations only)
complement mappingFires  > 0
forest fingerprints      8/8 identical
eventsMean               77.11677631578948
TEST                     sealed
SCORE                    off
composition complement   score ≡ 0
FEATURE_COMPAT           zero complement-relation rows
```

## 11. Main risk

Over-authoring the table. A row that is too specific writes an answer
instead of a reusable class. A row that is too broad (`state ×
proposition`, `abstract × abstract`, `motion × infinitival`) lights
constructional or physical pairings and makes derangement look like
the real table.

Keep the rows broad, relation-scoped, TRAIN-derived, allow-listed, and
reusable across many lemmas. When in doubt, abstain.
