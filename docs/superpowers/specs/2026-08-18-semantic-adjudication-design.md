# DESIGN — Gold Adjudication of Measured-Unwarranted Semantic Holes

Status: **RESEARCH HARNESS** — not a production feature.
Date: 2026-08-18.
Contract: `PB-SEMANTIC-ADJUDICATION-v1`.
Target: `codex/research/semantic-adjudication/`.

---

## 1. Question

When the Constellation sense probe refuses and an exposed Ballistics axis
still distinguishes the candidates, what missing semantic predicates would
have allowed the probe to test that distinction legitimately?

This is not a request to prove Ballistics right. Ballistics never enters
warranting during this study.

## 2. Jurisdiction

Production inquiry (`semanticInquiry.adapter.js`, `inquiry-coverage.js`)
already exposes a diagnosis. The research harness consumes that diagnosis.
It does not:

- change `MIN_COVERAGE_SPLIT`
- write a Ballistics winner onto a selection
- widen the live inquiry packet
- implement a new probe predicate in this phase

`measured-unwarranted` remains incompleteness evidence: investigate this
region. It is not evidence the rejected candidate should have won.

## 3. Corpus gate

A case enters the semantic-hole corpus only when all three hold:

```
semantic === 'measured-unwarranted'
instrumentation === 'exposed'
opportunity === true
```

Excluded (different research questions):

- `flat-unwarranted`
- `unexposed-measurement`
- `unavailable`
- already `warranted`

## 4. Frozen packet

Each opportunity is frozen as a complete case packet. Ballistics scores and
split are stored. No `winner` / `preferredSense` field is written onto the
packet.

A blind view of the same packet hides:

- scores
- Ballistics ordering
- any derived Ballistics winner
- the raw split magnitude

Candidate order in the blind view is a `caseId`-seeded shuffle, not score
order. Gold labels bind to `senseId`, never to a Ballistics rank.

## 5. Stratification and splits

Do not take the first N holes. Sample across:

- POS
- candidate count
- query length
- sense-frequency band when available
- gloss-overlap pattern (unique / tied / none)
- morphological ambiguity
- heteronym / homograph status
- frame type
- Ballistics split band: `0.01–0.03`, `0.03–0.07`, `0.07–0.15`, `>0.15`

Pilot size: 200–300 cases, deliberately balanced. Target **250**.

From the moment of sampling, assign:

- 60% discovery
- 20% development
- 20% sealed holdout

Holdout case ids are written and then refused by clustering, ranking, and
hypothesis-card construction. Gold labels may be collected on holdout
(truth is not design). Predicate design must not read holdout contents.

## 6. Gold task

Not “which candidate does Ballistics prefer” and not merely “which gloss
sounds closest.”

**A. Is the intended sense recoverable from the supplied context?**

Legal labels:

- a candidate `senseId`
- `AMBIGUOUS`
- `NONE_OF_THE_ABOVE`
- `INSUFFICIENT_CONTEXT`
- `BAD_CANDIDATE_SET`

Refusal labels are first-class. Forced choice is a disease this process
exists to prevent.

**B. If a legitimate intended sense exists, what observable distinction
separates it from its competitors?**

Use the predicate-family taxonomy, with `OTHER` + notes as an escape hatch.
The pilot is allowed to discover missing families.

## 7. Failure layers

Every labeled case lands in exactly one bucket:

| Type | Name | Meaning |
|---|---|---|
| I | Real probe hole | Gold sense is clear; an identifiable distinction exists; the probe does not test it |
| II | Ballistics-only artifact | Humans also refuse, or the geometric split is irrelevant |
| III | Candidate-generation failure | Gold is `NONE_OF_THE_ABOVE` or `BAD_CANDIDATE_SET` — do not patch the probe |
| IV | Unused existing evidence | Frame, morphology, POS, lexical metadata, or existing observations already distinguish gold |

Type IV is a wiring/coverage defect, not a new semantic predicate.

## 8. Two-pass adjudication

Pass A sees the blind view only. It answers question A.

Pass B sees the blind view plus Pass A’s gold (not Ballistics). It labels
the missing family and the failure layer.

Two independent rubrics (or adjudicators) run Pass A. Agreement is
recorded. Disagreement is **not** majority-voted. It is classified:

- context genuinely ambiguous
- gloss underspecified
- candidate senses overlap
- annotation mistake
- domain knowledge required

Unresolved disagreements stay unresolved. They do not become gold.

Ballistics is revealed only after both passes, for the secondary
calibration experiment.

## 9. Hole ledger and ranking

The primary artifact is a ledger, not a code change.

Rank families by opportunity, not raw frequency:

```
recurrence
× gold-recoverability
× discriminative power
× implementation feasibility
× cross-lexeme generality
```

Wanted: predicates that explain many unrelated holes. Not bespoke patches
for individual words.

## 10. Predicate cards (later phase)

A proposed predicate is a hypothesis card with observations, expected
effect, falsifier, risk, and preregistered development cases. It cannot
read Ballistics. It cannot be derived from one case and tested on that
same case.

This phase **does not implement** any predicate. The first milestone
stops at the top three recurring Type I holes.

Promotion (when a later intervention is proposed) requires all of:

1. Repeats across multiple lemmas
2. Independently observable semantic basis
3. Does not depend on Ballistics score
4. Explicit predictions
5. Explicit falsifiers
6. Improves sealed holdout resolution
7. Does not materially increase false warrant
8. Preserves deterministic receipts

Preferably also survives ablation and explains cases beyond the examples
that inspired it.

False warrant is the metric guarded hardest.

## 11. Secondary Ballistics evaluation

Once gold exists, measure

```
P(Ballistics top candidate = gold | split band)
```

on discovery (and, separately, on sealed holdout after design freeze).
Do not feed that calibration into warranting in the same experiment.

Flipping Ballistics scores must not change gold, selection, or receipts.

## 12. First milestone

```
collect measured-unwarranted + exposed
  → freeze packets
  → stratify ~250
  → assign 60/20/20
  → blind gold (two rubrics)
  → classify failure layer
  → cluster predicate families
  → name top 3 Type I holes
```

Stop. Do not implement the three. Do not touch `MIN_COVERAGE_SPLIT`.
