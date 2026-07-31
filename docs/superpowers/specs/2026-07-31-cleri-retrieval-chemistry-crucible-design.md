# Cleri Retrieval Chemistry Crucible — Design

**Date:** 2026-07-31
**Status:** Design, awaiting implementation plan
**Probe id:** `retrieval.chemistry.crucible@1.0.0`

## Purpose

Concept Chemistry ranked a set of claims about applying chemical analogies
(octet/saturation, electronegativity/affinity, valence/bond multiplicity) to
retrieval. Every real reaction landed METASTABLE (0.3157–0.3857), the false
friend and the bare metaphor separated, and the law violation was killed. That
is a ranking. It is not a verdict, and under
`project-semantic-calculus-adjudicates-scores` it is never allowed to become
one.

This crucible is the probe that decides. It measures whether chemistry-derived
ranking laws change retrieval outcomes on a substrate with labelled ground
truth, and — more importantly — whether any change that appears is attributable
to the chemistry rather than to the machinery the chemistry arrived in.

**The framework is not merged into the substrate.** `mergeCandidates` and the
five nominators are untouched. This is the narrow crucible, not the integration.

## Substrate

Cleri Probe retrieval — `codex/core/immunity/cleri-probe/retrieval.js`.

`retrieveCandidates` runs five independent nominators (LITERAL, STRUCTURAL,
TOKEN, PRION, VECTOR) and hands their nominations to `mergeCandidates`, which
groups by `(path, factId, pathologyClass)`, takes `score = max` over each group,
and sorts on the lexicographic key:

```
(hasStructural, hasLiteral, |nominators|, score, path, startLine, factId)
```

then applies `slice(0, limit)` with `limit = 10`.

### Why this layer and not end-to-end findings

The verifier layer is at a ceiling. `precision` and `recall` are computed today
in `scripts/cleri-probe/commands.js:412-413` and asserted `=== 1` in every
verifier test file. All five families are perfect on the frozen corpus. An
end-to-end measurement therefore **cannot distinguish any configuration from any
other** — it is a check that cannot fail, the pathology recorded in
`project-checks-that-cannot-fail`.

The retrieval ranking layer has the headroom.
`docs/tooling/cleri-probe-baseline-2026-07-13.md` measured hard-negative
fixtures ranking *above* their verified counterparts in four of five families.
That is the defect under test.

### A consequence of the baseline sort key

`score` is nearly vestigial. Two binary flags and an integer count precede it,
so it only breaks ties among candidates with identical
`(hasStructural, hasLiteral, |nominators|)`. Two design facts follow:

1. Any chemistry that only re-weights `score` will change almost nothing. The
   affinity law must alter ordering *inside* the structural tier or it is inert.
2. The "cosine renamed with chemistry vocabulary" control is therefore not
   discriminating here — it will trivially reproduce the baseline. It is
   retained as a **harness leak detector**, not as evidence. See Controls.

## Gold set

`tests/qa/fixtures/cleri-probe/manifest.json` — 20 cases already labelled, no
new annotation required.

- 10 `VERIFIED`, 10 `NO_FINDING`
- 5 pathology families, each carrying all four subtypes: `CLEAR_POSITIVE`,
  `REAL_WORLD_POSITIVE`, `DIRECT_HARD_NEGATIVE`, `ADVERSARIAL_HARD_NEGATIVE`
- Each case carries `path` **and** `expectedLine`

Adversarial hard negatives are purpose-built to resemble their positives (e.g.
`listener-lifecycle-socket-off`: `socket.on` paired with `socket.off` in the
same `useEffect` shape as the leak).

**Hit definition:** a retrieved candidate counts as a hit when its `path`
matches a `VERIFIED` case *and* its `span` contains that case's `expectedLine`.
Path-only matching is forbidden — verified and hard-negative cases share files
within a family, so path matching alone would score hard negatives as hits.

## Configurations

Four pure ranking functions in `codex/core/immunity/cleri-probe/crucible/`,
identical signatures:

```
(nominations[], { k, seed }) → { ranked[], admitted, shells, timings }
```

The harness calls the real nominators once per query and routes the resulting
array through all four. Every configuration sees byte-identical input, so any
difference is the ranking law and nothing else. This also holds token count and
corpus exposure constant across configurations by construction — the confound
that makes the Concept Chemistry R0 row uninterpretable cannot occur here.

### A — baseline

`mergeCandidates(nominations, { limit: k })`, verbatim.

### B — baseline + saturation stopping rule

A's ordering. `slice(0, k)` is replaced by an octet rule: walk the ranked list
maintaining a coverage set of distinct **shells**
`(pathologyClass, nominator-family, span-region)`. Stop after `S` consecutive
candidates that add zero new shells. Emits variable `k`.

### C — baseline + affinity and valence constraints

**Affinity (electronegativity).** Replaces `score = max(nominator scores)` with
a noisy-OR under per-source weights:

```
affinity = 1 − Π_s (1 − w_s · score_s)
```

Independent evidence compounds; an isolated weak VECTOR hit stays weak. This
re-ranks within the structural tier, which is where the baseline is blind.

**Valence.** A hard admission constraint, not a sort key. Each pathology class
declares a required valence: a minimum count of **independent** nominator
families, where LITERAL and TOKEN collapse to one family because both are
lexical. A candidate whose valence is unfilled is rejected regardless of
affinity.

The asymmetry is C's entire claim: the baseline can *sort* by nominator count;
it can never *refuse*.

### D — full chemistry composition

B ∘ C. Saturation computed over the valence-filtered, affinity-ordered stream.

## The variable-k comparability trap

B and D emit variable `k`. Recall and precision are not comparable across
different `|retrieved|`: a configuration returning 4 items earns flattering
precision and punishing recall by arithmetic alone. Every B/D row is therefore
reported three ways:

1. **Fixed-k** — the stopping rule used for ordering only.
2. **Variable-k** — with `|retrieved|` printed beside every number.
3. **Matched-budget** — A truncated, per query, to exactly the `|retrieved|`
   that B chose.

Row 3 carries the real question: does the saturation rule pick a *better cutoff*
than a fixed cutoff of the same size? Without it, "B wins" is indistinguishable
from "B chose a different k". `h_saturation_helps` is falsified against row 3,
never against row 2.

## Shape: the crucible is a Probe formula, not a script

Running the crucible's own question through the semantic calculus gate returned
the missing unit by name:

```
$ npx tsx scripts/scholo-gate.mjs --json \
    "why does the cleri probe rank hard negatives above verified fixtures"
  kind=Theory  gap=procedure  method=absent  warrantPresent=[]  probeId=null
```

The inquiry lexicon claimed the question and no formula bound it —
`scholo-gate.mjs:206`: *"The inquiry lexicon claimed this and has no formula for
it. Write a Probe formula (observations + falsifiers) — that is the missing
unit."*

A second phrasing routed to the action lexicon instead and came back
underspecified:

```
$ npx tsx scripts/scholo-gate.mjs --json \
    "does chemistry-derived ranking beat the cleri retrieval baseline"
  kind=Clarify  gap=required_slot  method=underspecified
  warrantRequired=[human,lexicon]  warrantPresent=[lexicon]
  pick=cleri:probe 0.143  rival=cleri 0.071  margin 0.014 < 0.15
```

So the crucible is authored as `retrieval.chemistry.crucible@1.0.0` in
`PROBE_FORMULAS` (`codex/core/semantic-calculus/probeRegistry.ts`), with an
external harness `scripts/cleri-crucible.mjs` collecting receipts.

Three properties come free, each replacing something this design would otherwise
have hand-rolled:

- **Pre-registration is structural.** `buildProbePlan` seals observations,
  hypotheses and falsifiers before the harness runs. Nothing can be added after
  the numbers are visible.
- **Unfalsifiable claims are unrepresentable.** `assertFalsifiable`
  (`probeRegistry.ts:876`) throws at module load for a hypothesis with zero
  falsifiers, and for a falsifier naming an `observationId` the probe never
  collects. Dropping an ablation breaks the import rather than quietly
  weakening the experiment.
- **Replay is already built.** `ObservationReceipt` carries `inputHash`,
  `environmentHash`, `resultHash`, and a four-way
  `status: observed | refused | error | inconclusive` that distinguishes the
  zero-evidence kinds instead of collapsing them.

Registering a formula touches `probeRegistry.ts`, but that module runs nothing
(`maxRisk: 'read_only'`; the compiler seals plans and never executes harnesses).
The chemistry does not enter cleri retrieval.

## Observations

Each becomes an `ObservationRequest` with a `harness` string. The compiler never
runs these.

| id | Definition |
|---|---|
| `obs.rank.accuracy` | Recall@k / Precision@k per configuration against the manifest, hit defined as path + span-contains-`expectedLine`. |
| `obs.rank.order` | MRR (primary) and nDCG@k (secondary), per family. MRR leads: 2 relevant items per query is too thin for nDCG to say much. |
| `obs.context.redundancy` | `1 − distinctShells / retrievedCount`, shells as defined in B. Always reported alongside `retrievedCount`. |
| `obs.answer.unsupported` | Fraction of retrieved candidates that `deriveEpistemic` types `Theory` (nothing binds) rather than `Probe` (carries `supportingEvidence` + `verificationSteps`). |
| `obs.hop.validity` | Fraction of retrieved candidates whose `nominator → factId → verifier family` chain resolves. A `factId` that does not resolve in `codex/services/cleri-probe/babel-facts.adapter.js` is a dangling hop. |
| `obs.retrieval.latency` | Median and p95 over N runs of ranking only. IDF index construction is **excluded and reported separately** — the 2026-07-13 baseline measured it at 9903 ms, which would swamp every ranking difference. |
| `obs.replay.checksum` | Hash of `stableStringify(ranked)`, 3× in-process plus 1× fresh process, per configuration. |
| `obs.ablation.shuffled` | Full metric set under ≥8 seeded permutations of which nominator source receives which weight and valence. **Reports the spread. This is the noise floor.** |
| `obs.ablation.matched_token` | Full metric set for an unrelated framework with matched parameter count and matched constraint shape (ecology: niche / trophic level / carrying capacity). |
| `obs.ablation.random_valence` | Full metric set with admission by seeded coin flip at C's measured admission rate. |
| `obs.corpus.scale` | All of the above at two corpus sizes. Small: the fixture tree alone. Large: the fixture tree embedded in the full ~4677-file source substrate. |

### `obs.replay.checksum` is a guard, not a result

Configuration A is already deterministic and cannot fail this observation. Its
only job is to catch nondeterminism *introduced* by B, C or D. Reporting it as
a finding would be a check that cannot fail; it is recorded as a precondition
on the other observations.

## Effect sizes are expressed in noise units

`PredicateSpec` takes a literal `value`, so a falsifier cannot say "≤ the
shuffled-label spread". The harness therefore returns the **ratio** and the
sealed formula holds the threshold:

```
gainInNoiseUnits = (config − comparator) / spread(obs.ablation.shuffled)
predicate: { op: 'lte', path: '<...>InNoiseUnits', value: 1 }
```

This is deliberate on two counts. It is the units-trap correction from
`project-semantic-calculus-adjudicates-scores` — an absolute threshold applied
across distributions is the `STABLE_MIN` error, and normalising against the
noise floor is the fix. And it keeps the judgement inside the sealed formula:
`types.ts:275-278` records that having the harness return a boolean it computed
itself moves the judgement out of the formula, which is precisely what a
threshold-free falsifier would do.

**The governing rule:** no difference smaller than the between-seed spread of
the shuffled-label ablation counts as a difference. The control travels with the
question and sets the bar — the law from
`feedback-concept-chemistry-is-ordinal`, moved to this instrument.

With 10 relevant items, a single case swings recall by 10 points, so this floor
will be wide. That is the honest resolution of a 20-case corpus, not a defect to
tune away.

## Parameters are frozen at seal time

The configurations carry free parameters: `k`; the saturation patience `S`; the
per-source affinity weights `w_s`; the required valence per pathology class; the
run count `N` for latency; the seed count for the shuffled-label ablation.

Every one of them is fixed in the sealed formula **before** the harness runs, and
their values are part of `retrieval.chemistry.crucible@1.0.0`. Retuning any of
them requires a version bump and a fresh seal, and the previous run's receipts do
not transfer.

Without this rule the crucible is tunable until it wins: D has more parameters
than A, so given free retuning after seeing results it can be made to beat A on
any single metric. That would be a check that cannot fail, wearing the costume of
an experiment. The frozen-parameter rule is what makes `h_chemistry_not_machinery`
answerable at all — the shuffled-label ablation permutes *assignments* of these
same frozen values, so it holds parameter count and magnitude constant and varies
only which source receives which.

## Hypotheses

Every falsifier names an observation the probe collects, so `assertFalsifiable`
passes at module load.

| Hypothesis | Claim | Falsifier | Predicate |
|---|---|---|---|
| `h_saturation_helps` | B's stopping rule picks a better cutoff than a fixed cutoff of the same size | `f_no_matched_budget_gain` | `lte(bGainOverMatchedBudgetInNoiseUnits, 1)` |
| `h_valence_constrains` | C's hard refusal beats any pruning at the same admission rate | `f_random_pruning_matches` | `lte(cGainOverRandomValenceInNoiseUnits, 1)` |
| `h_chemistry_not_machinery` | The gain survives shuffled chemistry labels | `f_shuffled_matches` | `lte(dGainOverShuffledInNoiseUnits, 1)` |
| `h_framing_load_bearing` | A matched-parameter unrelated framework does not reproduce D | `f_ecology_matches` | `lte(dGainOverEcologyInNoiseUnits, 1)` |
| `h_composition_superadditive` | D exceeds both B and C | `f_composition_subadditive` | `lte(dOverBestComponentInNoiseUnits, 1)` |
| `h_scale_survives` | The effect holds on the ~4677-file substrate, not only the fixture tree | `f_small_corpus_only` | `lte(dGainLargeCorpusInNoiseUnits, 1)` |

`h_chemistry_not_machinery` is the crucible's false-friend control and the
hypothesis most likely to die. If shuffled labels reproduce D, the gain belongs
to the machinery — an extra weighting stage plus a hard admission filter — and
the chemistry is decoration.

`h_composition_superadditive` re-tests the Concept Chemistry R0 result under
conditions where its confound is impossible. There, R0 scored highest while also
carrying the largest token set, and `grounding` at `W_GROUND = 0.65` rises
mechanically with token count; "composition helps" and "the composed string is
longer" were not separable. Here every configuration consumes an identical
nomination array.

## Controls

| Control | What it kills | Filed as |
|---|---|---|
| Shuffled chemistry labels (≥8 seeds) | "The gain is the machinery, not the chemistry" | Observation — sets the noise floor |
| Matched-token unrelated framework | "Any framework of this size would do" | Observation |
| Cosine renamed with chemistry vocabulary | Harness leaks | **Precondition** — must return metrics bit-identical to A |
| Random valence at matched admission rate | "Any pruning at that rate would have helped" | Observation |
| Larger and smaller corpora | "The effect is a small-corpus artifact" | Observation |

The renamed-cosine control is deliberately not evidence. It is a
behaviour-preserving relabelling, so any metric difference it produces is a bug
in the crucible. Admitting it as evidence would let a broken harness generate a
finding.

Both corpus sizes are reported or neither is. The 2026-07-13 baseline shows the
small-corpus condition is the optimistic one.

## Acceptance check for the registration itself

This is a claim about the work rather than about retrieval, so it gets its own
falsifier — the same command before and after:

```
npx tsx scripts/scholo-gate.mjs --json \
  "why does the cleri probe rank hard negatives above verified fixtures"
```

- **Before:** `kind=Theory`, `gap=procedure`, `method=absent`, `probeId=null`
- **Required after:** `kind=Probe`, `phase=plan`,
  `probeId=retrieval.chemistry.crucible`

## What the crucible cannot conclude

Sealing the plan supplies the `lexicon` warrant. The `human` warrant the gate
asked for is Vaelrix's. Under F10 the crucible cannot promote anything past
`Hypothesis` without receipts *and* human authority, however the numbers land.

The known risk to the whole experiment is resolution: 5 queries over 20 cases
may not separate anything smaller than a large effect from the noise floor. That
is measurable on the first run rather than arguable in advance, and
`obs.ablation.shuffled` is exactly the observation that reports it. A crucible
that returns "no configuration clears the floor" is a successful crucible.

## Deliverables

1. `codex/core/immunity/cleri-probe/crucible/` — four ranking functions plus the
   ablation variants, pure, no substrate edits.
2. `retrieval.chemistry.crucible@1.0.0` in
   `codex/core/semantic-calculus/probeRegistry.ts`, with `patterns` and
   `keywords` sufficient to bind the acceptance-check utterance.
3. `scripts/cleri-crucible.mjs` — harness; collects receipts, computes noise
   units, never judges.
4. Tests: the renamed-cosine precondition, the identical-input invariant across
   configurations, and `assertFalsifiable` coverage for the new formula.
5. A results document recording every observation, adjudicated through
   `scripts/cleri-gate.mjs` at write-up.

## Related

- `project-semantic-calculus-adjudicates-scores` — the ranking is never the
  verdict; the units trap
- `feedback-concept-chemistry-is-ordinal` — controls set the bar, never a global
  threshold
- `project-checks-that-cannot-fail` — the ceiling at the verifier layer
- `project-cleri-probe-v2` — vacuous coverage; `NO_VERIFIED_FINDINGS` is not
  absence
- `docs/tooling/cleri-probe-baseline-2026-07-13.md` — the measured defect under
  test
