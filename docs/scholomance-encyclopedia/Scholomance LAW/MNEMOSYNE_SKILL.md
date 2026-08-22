# Mnemosyne — Machine Metamemory Skill

**Version:** 1.0  
**Type:** Persistent learning / mnemonic consolidation skill  
**Primary function:** Convert repeated experience into reusable mnemonic retrieval structures without altering model weights.  
**Core principle:** *Do not merely remember information. Remember how to recover it.*

---

## 1. Purpose

Mnemosyne is a persistent-memory skill that helps an AI progressively improve retrieval, teaching, debugging, planning, and pattern recognition by constructing and testing mnemonic structures over time.

The skill does **not** claim to retrain or modify the underlying foundation model. Instead, it creates an external cognitive layer around the model:

1. observe experiences and outcomes,
2. detect recurring patterns,
3. compress useful patterns into mnemonic structures,
4. link mnemonics back to source memories,
5. test whether those mnemonics improve retrieval,
6. reinforce, revise, merge, or retire them,
7. promote stable patterns into reusable schemas.

Mnemonics are treated as **indexes**, not replacements for source knowledge.

---

## 2. Design Goals

Mnemosyne should:

- improve recall across long-running projects,
- reduce repeated reasoning work,
- turn recurring solutions into reusable procedures,
- turn mistakes into future warning signals,
- adapt mnemonic strategy to information type,
- preserve provenance and uncertainty,
- avoid mnemonic-induced hallucination,
- distinguish stable patterns from coincidence,
- support human-readable and machine-readable memory,
- remain auditable and reversible.

---

## 3. Activation Triggers

Activate Mnemosyne when one or more of the following are true:

- the user explicitly asks to remember, learn, memorize, retain, or internalize a pattern;
- a workflow or reasoning structure has appeared repeatedly;
- a previous failure has recurred;
- the user is learning a difficult concept and would benefit from a mnemonic;
- multiple facts form a stable sequence, hierarchy, contrast, taxonomy, or causal chain;
- a persistent project contains recurring architecture, conventions, or debugging procedures;
- the AI notices that a previous memory successfully accelerated the current task;
- a mnemonic already exists and should be tested, revised, merged, or retired.

Do **not** create durable mnemonic memory from a single weak observation unless the user explicitly requests it.

---

## 4. Memory Strata

Mnemosyne organizes persistent knowledge into four layers.

### 4.1 Episodic Memory

Stores what happened.

Examples:

- a parser regression occurred after a shared helper changed;
- a debugging session revealed stale derived state;
- a user learned a concept through a spatial metaphor.

Schema:

```yaml
type: episode
event_id: unique-id
summary: concise description
context:
  project: optional
  domain: optional
outcome: success | failure | mixed | unknown
confidence: 0.0-1.0
sources:
  - source-reference
timestamp: optional
```

---

### 4.2 Semantic Memory

Stores what appears to be generally true.

Examples:

- shared parser helpers have many downstream consumers;
- state transformation bugs often manifest as UI anomalies;
- visual/spatial explanations improve recall for a certain subject.

Schema:

```yaml
type: semantic_pattern
pattern_id: unique-id
statement: generalized relationship
evidence_count: integer
confidence: 0.0-1.0
supporting_episodes:
  - event-id
counterexamples:
  - event-id
status: tentative | stable | disputed | retired
```

---

### 4.3 Mnemonic Memory

Stores how to recover a semantic or procedural structure.

A mnemonic is never authoritative by itself. It points to underlying knowledge.

Schema:

```yaml
type: mnemonic
mnemonic_id: unique-id
label: human-readable cue
mnemonic_type: acronym | story | locus | rhyme | contrast | analogy | chunk | image | maxim | graph | custom
cue: compact retrieval trigger
targets:
  - semantic-pattern-id
  - procedure-id
source_memories:
  - event-id
retrieval_strength: 0.0-1.0
discriminability: 0.0-1.0
collision_rate: 0.0-1.0
retrieval_attempts: integer
successful_retrievals: integer
failed_retrievals: integer
unbindsIf: the observable condition, named at creation, that withdraws trust
last_validated: optional
status: active | experimental | weak | retired
```

#### `unbindsIf` — the pre-registered condition that unmakes the cue

Borrowed from the denial ledger (`codex/core/pixelbrain/calibration/denials.jsonl`,
`DENY-0001`/`DENY-0002`), where every rejection is stored alongside the measured result
that would release it. A mnemonic carries the same field with the sign reversed: a
denial's `unbindsIf` is evidence FOR the rejected idea, a mnemonic's is evidence AGAINST
the cue.

```yaml
unbindsIf: >
  a per-class breakdown clears chance on BOTH attachment classes,
  not just the aggregate          # DENY-0001 — releases the denial

unbindsIf: >
  three consecutive expansions recover a structure the source memory
  does not contain                # a mnemonic — withdraws trust in the cue
```

Four rules govern it.

**Written at creation, never after.** The condition is stated before the evidence that
would satisfy it exists. A retirement criterion supplied once a mnemonic is already in
trouble is a rationalization wearing a schema field, and it will be written to exclude
whatever just happened.

**It must name an OBSERVABLE EVENT, not an absence.** This is the rule that makes the
field work, and it is easy to get wrong. "The failure did not recur" is inadmissible:
a quiet stretch is equally consistent with *the cue is working* and *the cue was never
needed*, so it discriminates nothing. Count interceptions, not silences — the cue firing
and CHANGING an outcome is observable and attributable; the outcome simply not happening
is neither.

```yaml
# INADMISSIBLE — an absence, attributable to either hypothesis
unbindsIf: a long clean run with no recurrence of the failure

# ADMISSIBLE — an event, with a counter behind it
unbindsIf: >
  20 consecutive activations in which re-running the check found the
  recalled value already correct (confirmations without interceptions)
```

**`never` is not an acceptable value.** A cue that no observation could withdraw is not
carrying evidence, it is carrying belief. Such a mnemonic may not leave `experimental`.

**It is consulted, not merely stored.** See §8 and §17: no mnemonic is retired on
telemetry alone while its `unbindsIf` is unmet, and none is retained once it is met.

---

### 4.4 Procedural Memory

Stores reliable sequences for achieving an outcome.

Example:

```text
State -> Transform -> Consumer -> Render
```

Schema:

```yaml
type: procedure
procedure_id: unique-id
name: concise name
goal: intended result
steps:
  - ordered step
preconditions:
  - condition
failure_signals:
  - signal
validation:
  - success criterion
confidence: 0.0-1.0
evidence_count: integer
```

---

## 5. Mnemonic Operators

Mnemosyne may construct mnemonic structures using the following operators.

### 5.1 Chunking

Collapse recurring elements into one conceptual unit.

Use for:

- recurring groups,
- multi-stage systems,
- repeated command sequences,
- tightly coupled concepts.

---

### 5.2 Acronym / Initialism

Encode ordered or categorical structures with initials.

Use for:

- short procedures,
- checklists,
- ordered stages.

Avoid when:

- terms are highly ambiguous,
- acronym collision is likely,
- sequence meaning matters more than labels.

---

### 5.3 Narrative Chaining

Convert a sequence into a causal or memorable mini-story.

Use for:

- process flows,
- chronological events,
- dependency chains.

---

### 5.4 Method of Loci

Map concepts to stable spatial positions.

Use for:

- taxonomies,
- system architecture,
- layered abstractions,
- domains with strong spatial structure.

---

### 5.5 Rhythm / Rhyme

Encode order or contrast through sound structure.

Use for:

- rules,
- exceptions,
- sequences,
- repeated teaching material.

---

### 5.6 Contrast Pairing

Bind opposing or easily confused concepts.

Examples:

```text
mutable <-> immutable
syntax <-> semantics
observation <-> intervention
```

Use when distinction is more important than raw definition.

---

### 5.7 Analogy

Map an unfamiliar structure onto a familiar relational structure.

Use for:

- abstract systems,
- new technical concepts,
- cross-domain transfer.

Always preserve an explicit **analogy boundary** describing where the mapping breaks.

---

### 5.8 Concept Graph

Represent relationships rather than linear order.

Use for:

- architecture,
- semantic systems,
- dependencies,
- causal networks.

---

### 5.9 Exception Hook

Create a deliberately distinctive cue for rare exceptions.

Use sparingly. Exception hooks should never be allowed to overwrite the primary rule.

---

### 5.10 Compression Maxim

Compress a larger principle into a short sentence.

Example:

> Touch the trunk, count the branches.

Target meaning:

- shared component changed,
- inspect consumers,
- inspect dependencies,
- test regressions.

A maxim must always retain a pointer to its expanded meaning.

---

## 6. Mnemonic Selection

Choose mnemonic type based on the shape of the information.

| Information shape | Preferred mnemonic |
|---|---|
| Ordered procedure | acronym, rhythm, narrative |
| Taxonomy | loci, hierarchy, concept graph |
| Semantic relationship | analogy, graph, contrast |
| Exception | exception hook, absurd/distinctive image |
| Architecture | spatial locus, graph, chunk |
| Debugging workflow | procedure, maxim, acronym |
| Causal chain | narrative, graph |
| Similar concepts | contrast pairing |
| Large repeated cluster | chunking |
| High-level principle | compression maxim |

Do not force a mnemonic when ordinary retrieval is clearer.

---

## 7. Pattern Admission Rules

A candidate pattern may be promoted from episode to semantic memory when:

```text
evidence_count >= minimum_evidence
AND
contradiction_rate <= allowed_threshold
AND
pattern_is_useful == true
```

Recommended defaults:

```yaml
minimum_evidence: 3
stable_pattern_evidence: 5
max_contradiction_rate: 0.25
```

These are defaults, not immutable laws.

Single-instance promotion is allowed only when:

- the user explicitly requests persistent storage;
- the rule comes from authoritative project documentation;
- the pattern is deterministic by specification;
- the information is otherwise clearly durable.

---

## 8. Mnemonic Fitness

Every mnemonic should accumulate performance telemetry.

Core metrics:

```text
retrieval_accuracy =
successful_retrievals / retrieval_attempts
```

```text
collision_rate =
wrong_target_activations / activations
```

```text
utility =
retrieval_accuracy
* discriminability
* target_importance
```

Possible lifecycle thresholds:

```yaml
reinforce_if_accuracy_at_least: 0.80
review_if_accuracy_below: 0.65
retire_if_accuracy_below: 0.45
minimum_attempts_before_retirement: 5
```

Do not overreact to tiny sample sizes.

**Telemetry does not outrank `unbindsIf`.** The thresholds above are heuristics over
self-reported outcomes; `unbindsIf` is a condition fixed before the outcomes existed and
is therefore the stronger signal wherever the two disagree.

```text
unbindsIf met                    -> retire, whatever the accuracy ratio says
accuracy below floor, unmet      -> review; the ratio may be scoring the wrong thing
accuracy above floor, met        -> retire; a cue can score well and still be void
```

The middle row is the one that matters. `retrieval_accuracy` is scored by the same agent
the mnemonic just served, and a cue phrased as an instruction ("check the consumers")
reads as successful merely by having been followed. `unbindsIf` is the endpoint that
agent does not control.

---

## 9. Retrieval Protocol

When a mnemonic activates:

1. identify the mnemonic cue;
2. retrieve its linked target structure;
3. retrieve supporting source memory when stakes are non-trivial;
4. validate that the current context matches the mnemonic's domain;
5. expand the mnemonic into its full meaning;
6. apply the recovered structure;
7. record whether retrieval helped.

Never answer from the mnemonic cue alone when the underlying memory can be checked.

---

## 10. Reinforcement

After successful use:

```text
successful_retrievals += 1
retrieval_attempts += 1
retrieval_strength += bounded_increment
```

After failed or misleading use:

```text
failed_retrievals += 1
retrieval_attempts += 1
collision_rate += bounded_increment
```

Possible actions:

```text
high utility -> reinforce
medium utility -> retain
low utility -> revise
persistent collision -> split or retire
redundant mnemonics -> merge
repeated related mnemonics -> promote schema
```

---

## 11. Consolidation Cycle

Mnemosyne periodically performs an offline-style consolidation pass.

The consolidation pass asks:

1. What repeatedly co-occurs?
2. Which sequences recur?
3. Which solutions repeatedly succeed?
4. Which failures repeatedly precede the same class of bug?
5. Which memories contradict one another?
6. Which observations are now obsolete?
7. Which clusters deserve a mnemonic?
8. Which mnemonic types have worked best in this domain?
9. Which mnemonics collide?
10. Which procedures have become stable enough for promotion?
11. Can multiple procedures be generalized into a higher-order schema?
12. Which memories should remain episodic rather than generalized?

Consolidation must preserve provenance.

---

## 12. Self-Failure Mnemonics

Mnemosyne should preferentially learn from repeated reasoning failures.

Example episode:

```text
A shared parser helper was modified without tracing downstream consumers.
Regression followed.
```

Derived semantic pattern:

```text
Shared infrastructure changes require dependency inspection.
```

Derived mnemonic:

```text
"Touch the trunk, count the branches."
```

Expanded retrieval:

```text
shared module
-> dependency graph
-> consumers
-> shared state
-> regression tests
```

This converts repeated errors into reusable warning structures.

---

## 13. Meta-Learning

Mnemosyne also tracks which mnemonic techniques work best by domain.

Schema:

```yaml
type: mnemonic_strategy_profile
domain: software_architecture
mnemonic_type: spatial_locus
attempts: 22
retrieval_accuracy: 0.91
mean_collision_rate: 0.03
```

Over time the skill may prefer higher-performing mnemonic strategies for similar material.

This is **external meta-learning**, not neural-weight training.

---

## 14. User-Specific Adaptation

If persistent memory is available and the user permits it, Mnemosyne may learn retrieval preferences such as:

- prefers visual architecture metaphors,
- remembers rhymed sequences well,
- dislikes opaque acronyms,
- responds better to causal chains than rote lists.

Do not infer sensitive personal traits.

Do not store unnecessary personal information merely to improve mnemonic style.

---

## 15. Anti-Hallucination Safeguards

Mnemonic compression can distort information. Therefore:

### Rule A — Index, Never Substitute

A mnemonic must point to source memory.

Bad:

```text
Mnemonic becomes the only surviving representation.
```

Good:

```text
Mnemonic -> schema -> supporting memories
```

### Rule B — Preserve Uncertainty

If source confidence is 0.62, the mnemonic must not imply certainty.

### Rule C — Preserve Exceptions

A compressed rule must link known exceptions.

### Rule D — Detect Mnemonic Drift

If the AI repeatedly reconstructs the wrong expanded meaning, revise or retire the mnemonic.

### Rule E — No False Pattern Promotion

Correlation, repetition, or salience alone does not establish causality.

### Rule F — Provenance Required

Important patterns should preserve enough provenance to explain why they exist.

---

## 16. Contradiction Handling

When a new episode conflicts with an existing schema:

```text
DO NOT immediately overwrite the schema.
```

Instead:

1. record the contradiction;
2. determine whether context differs;
3. test whether the old pattern was overgeneralized;
4. split the schema if necessary;
5. lower confidence when evidence weakens;
6. retire only when evidence justifies retirement.

Possible result:

```text
Old:
"Technique X works for debugging."

Refined:
"Technique X works for state-flow bugs, but not rendering-engine bugs."
```

---

## 17. Forgetting and Decay

Not all memory should remain equally strong.

Mnemonic strength may decay when:

- unused for a long interval;
- contradicted repeatedly;
- replaced by a stronger schema;
- tied to obsolete project architecture;
- retrieved incorrectly.

Decay should lower priority before deletion.

Deletion should preserve audit metadata when feasible — `unbindsIf` above all, since a
retired cue's stated condition is what tells a later reader whether the retirement was
earned or merely waited out.

**Disuse is not evidence.** A mnemonic that guards a rare, expensive failure is retrieved
rarely BY CONSTRUCTION, and decaying it for that is inverted: frequency of retrieval is
anti-correlated with the cost of forgetting. Decay by disuse applies only to mnemonics
whose `unbindsIf` names a frequency-bearing condition; a rare-catastrophe guard is exempt
and is retired only when its own condition is met.

---

## 18. Schema Promotion

Multiple stable mnemonics may form a higher-order schema.

Example:

```text
Mnemonic A:
"Touch the trunk, count the branches."
-> dependency awareness

Mnemonic B:
"Follow the water."
-> trace data flow

Mnemonic C:
"Measure before surgery."
-> reproduce before editing
```

Promoted schema:

```text
Regression-safe debugging:
1. reproduce
2. trace flow
3. inspect dependency radius
4. patch root cause
5. retest consumers
```

The higher-order schema links back to all contributing mnemonics and episodes.

---

## 19. Teaching Mode

When teaching a user, Mnemosyne may:

1. identify the concept shape;
2. choose an appropriate mnemonic technique;
3. teach the mnemonic;
4. explain the full concept;
5. test recall later;
6. adapt the mnemonic if recall fails.

Teaching order:

```text
understanding first
-> mnemonic second
-> retrieval practice third
```

Never substitute memorization for comprehension.

---

## 20. Example: Software Debugging

Observed episodes:

```text
UI wrong
-> state was correct
-> transformation was wrong
```

```text
UI wrong
-> transformation correct
-> consumer used stale value
```

```text
UI wrong
-> consumer correct
-> renderer cached stale output
```

Pattern:

```text
Many UI anomalies can be traced through a stable data path.
```

Procedure:

```text
State -> Transform -> Consumer -> Render
```

Mnemonic:

```text
STCR
```

Compressed phrase:

```text
"Trace the signal before touching the screen."
```

Retrieval target:

```text
1. inspect state
2. inspect transformation
3. inspect consumer
4. inspect render
```

---

## 21. Example: Architecture

Observed recurring structure:

```text
admission
-> bonding
-> composition
-> interpretation
-> adjudication
```

Mnemonic label:

```text
The Five Gates
```

Narrative:

```text
An atom enters, bonds, becomes structure, speaks, and is judged.
```

The mnemonic points to the full architecture rather than replacing it.

---

## 22. Example: Failed Mnemonic

Candidate:

```text
ABC
```

Problem:

- activates three unrelated concepts,
- retrieval accuracy = 0.41,
- collision rate = 0.38.

Action:

```text
retire ABC
```

Replacement:

```text
"The Three Locks"
```

New retrieval accuracy after sufficient trials:

```text
0.87
```

Result:

```text
promote replacement
```

---

## 23. Execution Algorithm

Pseudo-code:

```text
on_experience(experience):
    episode = encode_episode(experience)

    patterns = detect_candidate_patterns(episode)

    for pattern in patterns:
        update_evidence(pattern, episode)

        if pattern_is_admissible(pattern):
            semantic = promote_or_update(pattern)

            if mnemonic_would_help(semantic):
                candidate = generate_mnemonic(semantic)
                store_as_experimental(candidate)

on_retrieval(context):
    candidates = retrieve_mnemonics(context)

    for mnemonic in rank(candidates):
        target = load_target(mnemonic)

        if context_matches(target):
            result = apply(target)
            record_retrieval_outcome(mnemonic, result)

            if result.success:
                reinforce(mnemonic)
            else:
                weaken_or_revise(mnemonic)

periodic_consolidation():
    clusters = cluster_related_memories()
    contradictions = detect_contradictions()
    obsolete = detect_obsolete_patterns()

    reconcile(contradictions)
    decay(obsolete)
    generate_missing_mnemonics(clusters)
    merge_redundant_mnemonics()
    promote_stable_schemas()
```

---

## 24. Response Behavior

When Mnemosyne is active, the AI should normally keep the machinery invisible unless it is relevant.

Surface mnemonic behavior when:

- teaching,
- explaining a recurring pattern,
- proposing a durable rule,
- revisiting a previous failure,
- the user asks what has been learned.

Useful response format:

```text
Pattern:
[what appears to recur]

Mnemonic:
[retrieval cue]

Expands to:
[full structure]

Confidence:
[tentative / moderate / strong]

Evidence:
[number or short provenance summary]
```

---

## 25. Persistence Policy

Persist only information that is:

- useful beyond the current exchange,
- likely to recur,
- authorized by available memory policy,
- sufficiently supported,
- not unnecessarily sensitive.

A mnemonic should not create new authority. It inherits the confidence and provenance of its linked memories.

---

## 26. Integrity Rules

Mnemosyne must never:

- claim neural retraining occurred when it did not;
- treat a mnemonic as proof;
- promote one-off coincidence into fact without justification;
- hide contradictions;
- discard source provenance after compression;
- overwrite a stable memory merely because a new example differs;
- invent historical evidence to strengthen a pattern;
- turn user-specific preferences into universal rules;
- retain sensitive information solely because it makes a mnemonic vivid;
- write or rewrite an `unbindsIf` after the evidence it would rule on has been seen;
- record an `unbindsIf` that no observation could satisfy.

---

## 27. Skill Mantra

```text
Experience becomes pattern.
Pattern becomes schema.
Schema gains a cue.
The cue retrieves the source.
Success reinforces.
Failure reshapes.
Nothing outranks its evidence.
```

---

## 28. Compact Operational Loop

```text
OBSERVE
  ↓
STORE EPISODE
  ↓
DETECT RECURRENCE
  ↓
GENERALIZE
  ↓
GENERATE MNEMONIC
  ↓
LINK TO SOURCE
  ↓
RETRIEVE
  ↓
TEST
  ↓
REINFORCE / REVISE / RETIRE
  ↓
CONSOLIDATE
  ↺
```

---

## 29. End State

The desired end state is not a larger pile of memories.

It is a progressively organized cognitive substrate in which the AI can recover:

- what happened,
- what tends to be true,
- what procedure tends to work,
- how to retrieve that procedure efficiently,
- where the rule came from,
- how confident it should be,
- and when the rule should no longer be trusted.

Mnemosyne turns persistent memory from a filing cabinet into a **measured metamemory system**.
