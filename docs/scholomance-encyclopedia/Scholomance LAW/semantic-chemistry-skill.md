---
name: semantic-chemistry
version: 1.0.0
description: >
  Use when proposing, evaluating, or defending a physics- or chemistry-flavored
  mechanism in a meaning system - atoms, bonds, valence, molecules, charge and
  fields, resonance, catalysts, perturbation or semantic DMT, descending light,
  dark atoms, probe beams, tomography, spectral response vectors, immune
  rejection, grounding, root admission, or phase sweeps - and whenever such a
  claim needs falsifiers, matched and shuffled controls, ablations, and honest
  measurement before it may influence production behavior.
---

# Semantic Chemistry Skill

## 0. Mission

Use chemistry and related physical sciences as **mechanistic design languages** for semantic computation.

The goal is not decorative metaphor.

The goal is to ask:

> What computational operator does this physical concept imply, what observable
> quantities does it produce, and what experiment could falsify the claim?

A successful semantic-chemistry abstraction must produce at least one of:

- a new state variable,
- a new transformation,
- a new constraint,
- a new measurement,
- a new causal experiment,
- a new failure mode,
- or a simpler architectural decomposition.

If a physical analogy changes only vocabulary, reject it.

---

# 1. Prime Law: Metaphor Must Cash Out as Mechanism

For every proposed chemistry analogy, explicitly define:

1. **Physical source concept**
   - Example: catalysis, resonance, bond polarity, spectroscopy, diffusion.

2. **Semantic object**
   - Example: atom, bond, molecule, root, parse, ambiguity class.

3. **State variables**
   - Example: charge, potential, valence vacancy, resonance score, stability.

4. **Operator**
   - What changes?
   - Example: reorientation, bond eligibility, ranking, excitation, decay.

5. **Observable**
   - What can be measured?
   - Example: parse coverage, ambiguity collapse, survival rate, topology shift.

6. **Control**
   - What happens when the mechanism is removed, shuffled, randomized, or held constant?

7. **Falsifier**
   - What result would demonstrate that the mechanism does not carry useful structure?

Use this template:

```text
PHYSICS:
SEMANTIC ANALOG:
STATE:
OPERATOR:
OBSERVABLE:
CONTROL:
FALSIFIER:
```

If any field is missing, the abstraction is incomplete.

---

# 2. Semantic Matter Model

## 2.1 Atom

A **semantic atom** is the smallest independently addressable interpretation unit in the system.

An atom may contain:

- span,
- type/category,
- lemma readings,
- head candidates,
- valence requirements,
- charge/potential,
- aura/nucleus identity,
- provenance,
- excitation state,
- confidence,
- and reaction history.

An atom is not necessarily a token.

A token may create several competing atoms.

### Law

Never collapse multiple readings merely because they share surface text.

Identity belongs to the internal state, not the label.

---

## 2.2 Bond

A **semantic bond** represents a lawful compositional relation between atoms or molecules.

A bond should expose:

- participants,
- direction,
- order,
- head assignment,
- valence consumed,
- valence remaining,
- energy/cost,
- provenance,
- and admission reason.

Do not treat similarity as a bond.

Similarity may be a field or attraction term.

A bond is a structural commitment.

---

## 2.3 Molecule

A **semantic molecule** is a composed structure whose behavior is not reducible to one atom.

Examples:

- noun phrase,
- clause,
- relation,
- idiom,
- semantic frame,
- cyclic corroboration structure,
- full-width utterance.

Track topology explicitly:

```text
LINEAR
A → B → C

CYCLIC
A → B → C
↑       ↓
└───────┘

NETWORK
      B
     / \
A → C   D
 \ / \ /
  E   F
```

Topology is not cosmetic.

It can alter:

- stability,
- interpretability,
- search behavior,
- redundancy,
- propagation,
- and failure mode.

---

# 3. Valence

Use **valence** to represent the number and kind of semantic connections a structure can lawfully accept.

Valence should be typed.

Bad:

```text
vacancies = 2
```

Better:

```text
vacancies = {
  subject: 1,
  object: 0,
  modifier: 2
}
```

A **valence vacancy** is a missing structural requirement, not merely an empty slot.

A vacancy may drive search.

Example:

```text
VP requires subject
→ subject vacancy exposed
→ compatible NP atoms receive attraction
```

### Constraint

Do not allow valence to become a universal "bonus score."

It should constrain or characterize admissible structure.

---

# 4. Charge, Polarity, and Electromagnetic Fields

Use electromagnetism when the desired behavior is **reorientation or attraction**, not arbitrary mutation.

A semantic electromagnetic field can:

- rank compatible partners,
- change orientation,
- bias collision probability,
- encourage local alignment,
- or expose repulsive incompatibilities.

It should not silently rewrite grammar.

## 4.1 Charge

Charge can encode directional compatibility.

Example:

```text
subject-seeking VP:   +subject
subject-capable NP:   -subject
```

Attraction raises interaction likelihood.

Repulsion suppresses incompatible encounters.

## 4.2 Reorientation Principle

Prefer:

> change the orientation of valid structures

over:

> destroy and rebuild the structure until something works

This is a major semantic-chemistry design principle.

A good field reduces search by making lawful structures easier to encounter.

## 4.3 Field Law

Fields may:

- rank,
- orient,
- energize,
- attenuate,
- or gate reactions.

Fields must not invent structure unsupported by the grammar or semantic substrate.

---

# 5. Resonance

Use **resonance** when multiple structures support a shared interpretation.

Resonance is useful for:

- ambiguity ranking,
- mutual reinforcement,
- repeated semantic compatibility,
- distributed evidence,
- closed-loop corroboration.

Example:

```text
A supports B
B supports C
C independently supports A
```

This cyclic structure may be more stable than a one-way chain.

## Resonance Score

A resonance score should be derived from measurable interactions.

Possible contributors:

- compatible bonds,
- shared heads,
- repeated root reachability,
- semantic agreement,
- topology closure,
- field alignment.

### Falsifier

Shuffle the participating structures while preserving degree/count.

If resonance performs no better than the shuffled control, it is not carrying structure.

---

# 6. Catalysis

A **semantic catalyst** changes the probability or pathway of a reaction without being the final semantic answer.

This is one of the most useful chemistry abstractions.

Catalysts may:

- lower search barriers,
- favor certain topologies,
- expose rare pathways,
- prevent premature local minima,
- or accelerate lawful closure.

They must not encode the target answer directly.

## 6.1 Semantic DMT Pattern

Semantic DMT is a **perturbational catalyst**, not a truth source.

Its role is to change the search landscape.

Possible behavior:

- increase exploratory reach,
- favor cyclic topology,
- suppress sprawling networks,
- preserve unusual candidates under stress,
- produce more false candidates while increasing discovery.

Track at least:

```text
kappa
divergence
bondDistance
categoryPermeability
associativeDepth
dose
```

Every candidate created under perturbation must retain provenance.

```text
origin: semantic-dmt
kappa: 0.75
generation: 3
baselineEligible: false
```

## 6.2 Post-Perturbation Test

Never trust a perturbation-generated structure merely because it formed.

Perform:

```text
perturb
→ generate
→ remove perturbation
→ quench
→ independent validation
→ compare against matched control
```

Useful measures:

### PPSP

Post-Perturbation Semantic Persistence:

```text
persistent validated perturbation structures
--------------------------------------------
total perturbation structures
```

### SDG

Semantic Discovery Gain:

```text
persistent perturbation structures absent from matched control
--------------------------------------------------------------
all persistent perturbation structures
```

Novelty without baseline comparison is not discovery.

---

# 7. Reaction Kinetics and Phase Boundaries

Use reaction kinetics when behavior changes as a parameter crosses a threshold.

Examples:

- spin,
- field strength,
- resonance,
- temperature analog,
- pressure analog,
- perturbation dose.

Do not assume one "critical point."

There may be several:

1. **Ignition boundary**
   - reactions first become possible.

2. **Topology boundary**
   - output geometry changes.

3. **Persistence crossover**
   - one regime becomes more stable than another.

4. **Catastrophic failure threshold**
   - nearly all structures collapse.

Use sweeps, not single points.

Bad:

```text
spin = 85 works
```

Better:

```text
spin ∈ [20, 40, 55, 65, 75, 85, 95, 110, 130, 150]
```

Then microsweep around transitions.

---

# 8. Reaction Energy and Stability

Semantic energy must correspond to a computational quantity.

Potential interpretations:

- derivation cost,
- unresolved valence,
- incompatibility,
- entropy,
- ambiguity,
- edit burden,
- field mismatch,
- structural tension.

Do not assign joules unless the simulation intentionally defines a synthetic unit.

If physical units are used, label them as **simulated model units**, not claims about literal chemistry.

## Stability

A molecule is stable only relative to a specified stress test.

Examples:

- quench,
- perturbation removal,
- field withdrawal,
- deletion stress,
- semantic grounding,
- topology stress.

"Stable" without a test is meaningless.

---

# 9. Photosynthetic Semantic Architecture

The photosynthetic model should separate four responsibilities.

## 9.1 Chloroplast: Ingestion

The chloroplast answers:

> What signal arrived?

It handles:

- source,
- distance,
- attenuation,
- irradiance,
- timing.

It must not consult semantic type.

## 9.2 Aura Regulator: Permission

The regulator answers:

> May this receiver react to this sender?

It handles:

- registered sender,
- aura compatibility,
- damping,
- refusal reason.

## 9.3 Chlorophyll: Interpretation

Chlorophyll answers:

> What does this receiver make of the incoming signal?

This is where semantic specificity may live.

Same incoming signal + different pigment state may yield different responses.

## 9.4 Photosynthesis: Composition

Photosynthesis should orchestrate:

```text
ingest
→ regulate
→ absorb
```

It should not contain hidden semantic logic of its own.

### Architectural invariant

Transport ≠ interpretation.

The light can remain structurally generic while the atom's pigment determines the local semantic reaction.

---

# 10. Descending Light

Descending light is a **root-reachability identity signal**.

After a chart is frozen:

1. begin from all valid spanning roots,
2. walk downward through derivations,
3. mark every reachable cell,
4. encode the reachable identities into a transport payload,
5. allow atoms to decrypt the payload using their own identity key.

An atom is "lit" iff it participates in at least one complete parse.

## Key Property

Descending light does not need to guess meaning.

It transmits a graph fact:

> this atom belongs to at least one complete answer.

## Identity Collapse

For a token with multiple readings:

```text
readings = 5
lit readings = 1
→ identity resolved
```

If multiple readings remain lit, ambiguity is genuine.

If zero remain lit, either the parser has no root or the implementation is wrong.

## Required Controls

- chart must be byte-identical with light on/off in annotate-only mode,
- no complete parse may be lost,
- relabeling must not alter reachability,
- shuffled light must score near chance,
- ambiguous-token collapse must beat shuffled p95.

---

# 11. Encryption and Identity Transport

Encryption is useful when the system needs a receiver-specific way to interpret a global signal.

The payload should not directly say:

```text
you are a noun
```

Instead:

```text
payload contains reachable identity keys
atom tests whether its own key is present
```

This preserves local identity.

Possible key:

```text
aura = hash(type, span, lemmas, head lemmas, kind)
```

But transport identity and computational truth must remain separate.

### Collision Law

Reachability should use exact node identity.

Hash/aura is only a transport key.

If a hash collides, transport may fail, but the underlying reachability result must remain correct.

---

# 12. Dark Atoms and Dark Matter

A **dark atom** is not necessarily nonexistent.

Distinguish:

1. **unreachable atom**
   - participates in no complete parse.

2. **dark atom**
   - structure exists but is invisible to the current root-recognition or search mechanism.

3. **latent atom**
   - becomes relevant under a controlled perturbation.

4. **invalid atom**
   - structurally unsupported noise.

Do not conflate them.

---

# 13. Probe Beams

Use a probe beam to infer hidden structure by observing how a known signal changes after interaction.

Semantic probe model:

```text
known probe
→ target structure
→ perturbation response
→ measured difference
→ inference
```

The probe does not need to see the hidden structure directly.

It needs only to reveal a reproducible interaction.

## Probe Families as Wavelengths

Treat distinct perturbations as distinct wavelengths.

Examples:

```text
lambda_del       token deletion
lambda_edge      prefix/suffix trimming
lambda_sub       lexical substitution
lambda_mask      type-neutral masking
lambda_suppress  bond/aura damping
```

Each wavelength probes a different failure mechanism.

### Broadband vs Narrowband

A true structural obstruction may react to several related probe families.

A lexical mirage may react only to substitution.

This gives the system a spectral signature.

---

# 14. Semantic Tomography

Semantic tomography reconstructs hidden structure from multiple controlled perturbations.

Pipeline:

```text
dark chart
→ multi-frequency probes
→ response vectors
→ residual traces
→ matched controls
→ descending-light back-projection
→ latent subgraph
→ obstruction taxonomy
```

The goal is not to invent a parse.

The goal is to reconstruct evidence about why a valid parse is almost present.

---

# 15. Spectral Response Vector

Do not reduce perturbation outcomes to one Boolean.

For each perturbation p, compute a response vector such as:

```text
R_delta(p) = [
  rootReachabilityDelta,
  headDivergence,
  derivationDensityDelta,
  topologyDelta,
  resonanceFluxDelta,
  spanApertureDelta
]
```

Interpretation:

- **rootReachabilityDelta**
  - did a root become reachable?

- **headDivergence**
  - did the resulting head move toward or away from the expected head?

- **derivationDensityDelta**
  - did the perturbation unlock or destroy derivations?

- **topologyDelta**
  - how much did the chart's active structure change?

- **resonanceFluxDelta**
  - how did field/resonance scores change?

- **spanApertureDelta**
  - how much sentence width remains captured?

Two perturbations that both "illuminate" may still have completely different response vectors.

---

# 16. Residual Traces

A probe interaction may leave a computational trace.

The trace records where structure changed.

Possible trace stores:

```text
T_atom(i)
T_span(i, j)
T_bond(i, j, k)
```

Accumulate across independent probes.

High-confidence obstruction regions should show **focal convergence**:

```text
many probes
→ same local deformation region
→ likely obstruction epicenter
```

A trace should record both:

- magnitude,
- direction of structural change.

Example:

```text
SBAR → S
NP → VP
PP → FRONTED
```

---

# 17. Counterfactual Controls

Never interpret a perturbation in isolation.

For candidate perturbation p:

1. run p,
2. select a matched control perturbation,
3. preserve comparable degree, span width, or intervention size,
4. compute both response vectors,
5. subtract.

```text
R_excess = R_candidate - R_control
```

A useful signal should show **contrastive excess**.

The question is not:

> Did this region react?

The question is:

> Did this region react more strongly or more correctly than comparable regions?

---

# 18. Optical Fusion

The strongest dark-matter pattern combines probe beams with descending light.

Procedure:

```text
1. probe dark chart
2. minimal perturbation creates temporary valid root S'
3. descend light from S'
4. collect lit identities
5. intersect with original dark atoms
6. reconstruct latent participating subgraph
7. identify original obstruction residue
```

This allows the system to answer:

- what hidden structure was nearly present,
- which original atoms belonged to it,
- what prevented it from becoming visible.

This is more informative than "the perturbation made S appear."

---

# 19. Obstruction Taxonomy

Prefer mechanistic obstruction classes over blanket grammar promotion.

Useful categories may include:

- punctuation mask,
- complementizer trap,
- lexical mirage,
- subject strip,
- head inversion,
- finished nominal,
- appositive list,
- prepositional fragment,
- missing absorption law,
- missing matrix closure,
- wrong head declaration.

The taxonomy should emerge from measurable response signatures.

Do not force every case into a prewritten class.

Unknown is a valid outcome.

---

# 20. Root Doorway / Output Aperture

Do not equate:

```text
root = S
```

with:

```text
valid complete utterance
```

Human language contains both:

### Clausal roots

- declaratives,
- questions,
- imperatives.

### Non-clausal utterance roots

- titles,
- names,
- bylines,
- lists,
- salutations,
- fragments used as complete discourse acts.

Do not solve this by converting every NP into S.

Use a typed root doorway.

Conceptually:

```text
ROOT_DOORWAY = {
  CLAUSAL: [
    S,
    WHQ,
    IMP
  ],

  UTTERANCE: [
    NP_UTTERANCE,
    APPOS_LIST,
    SALUTATION,
    PP_FRAGMENT
  ]
}
```

Admission must depend on lawful full-width conditions, not category membership alone.

---

# 21. Purity Law

The Purity Law is central.

> A diagnostic signal is not permission to rewrite the grammar.

Examples:

- illumination is not root admission,
- high resonance is not a bond,
- head match is not a grammar rule,
- perturbation success is not proof of the original construction,
- coverage gain is not correctness.

Every proposed grammar or doorway change must pass:

1. head accuracy,
2. construction purity,
3. coverage non-regression,
4. containment non-regression,
5. chart-size sanity,
6. matched negative controls.

If a rule only increases coverage, reject it.

---

# 22. Macrophage / Immune System

The semantic immune system rejects structures that are:

- structurally invalid,
- provenance-tainted,
- contradictory,
- ungrounded,
- impossible under valence,
- or generated only by an active perturbation.

The immune system must be independent from the generator.

Avoid circular validation:

```text
generator uses feature X
validator checks feature X
→ fake confidence
```

Use contrastive or orthogonal checks.

---

# 23. Semantic Grounding

Grounding asks whether a structure corresponds to meaningful semantic content rather than merely satisfying simulated chemistry.

Use hard negatives.

Bad negative:

```text
empty graph
```

Better negative:

```text
structurally plausible but semantically wrong graph
```

A robust grounding assay should distinguish:

- correct structure,
- plausible wrong structure,
- shuffled structure,
- empty/ghost structure.

---

# 24. Causal Ablation

When a mechanism appears useful, isolate its cause.

Example:

```text
Control-generated rings
DMT-generated rings
Control-generated chains
DMT-generated chains
```

Then control for:

- size,
- composition,
- atom set,
- topology,
- initial state.

Best test:

```text
same exact candidate
same exact topology
same exact edges
same initial state

kappa = 0
vs
kappa = 0.75
```

If behavior differs, treatment has an intrinsic effect.

If not, the effect is population selection.

Both are useful, but they are different claims.

---

# 25. Measurement Discipline

Every experiment should print:

- sample size,
- seed,
- treatment,
- control,
- shared starting population if applicable,
- raw counts,
- percentages,
- effect size,
- confidence/statistical test when meaningful,
- checksum,
- provenance.

Do not report only percentages.

Example:

```text
Control: 36/108 = 33.3%
DMT:     60/162 = 37.0%
```

Raw counts expose population-size effects.

---

# 26. Statistical Honesty

Watch for clustered observations.

Token-level samples inside the same sentence are not necessarily independent.

When possible:

- permute by sentence,
- bootstrap by sentence,
- hold out entire sentences,
- then hold out entire corpora/domains.

A spectacular token-level p-value may shrink after cluster-aware testing.

That is not failure.

It is calibration.

---

# 27. Semantic Chemistry Failure Modes

## 27.1 Metaphor Inflation

Symptom:

```text
"electricity made it smarter"
```

without an operator or measurement.

Fix:

define the field equation or ranking rule.

## 27.2 Hidden Answer Injection

Symptom:

light payload directly contains the correct type.

Fix:

transmit structural evidence; let local state interpret it.

## 27.3 Circular Validation

Symptom:

generator and validator use the same feature.

Fix:

use independent grounding or shuffled controls.

## 27.4 Fake Coverage

Symptom:

admit broad root categories because coverage rises.

Fix:

head accuracy + purity + non-regression.

## 27.5 Threshold Theater

Symptom:

one hand-picked spin/dose "works."

Fix:

sweep and identify phase boundaries.

## 27.6 Unit Theater

Symptom:

teslas, joules, or volts are printed but have no defined computational meaning.

Fix:

define synthetic units or remove physical units.

## 27.7 PRNG Topology

Symptom:

topology is selected by random coin flip rather than geometry or constraints.

Fix:

derive topology from strain, valence, compatibility, and closure.

## 27.8 Color Baptism (REJECTED)

Three operators that tried to turn chloroplast energy into grammatical color
were preregistered and killed on treebank-gate. They are not open questions.

Ledger: `codex/core/constellation/spectral-rejections.js`.
Laws: `COLOR_IS_NOT_A_RULE`, `SYNC_MUST_NOT_ERASE_LINES`,
`COLOR_IS_NOT_A_PREDICTOR`, `LIGHT_ENERGY_IS_A_SHADOW`.

| Operator | Claim | Death |
|---|---|---|
| paint | absorption buckets are a unique rule fingerprint | type-only 47.5% vs paint 18.3%; everyone glowed gold/blue |
| lock-split | syncing pigment frequencies is the molecular color | κ=0 child lines 60.7% vs lock/split 33.4% on NP-internal family |
| predict | leftover field color forecasts gold as a type-pair tie-breaker | type-pair 61.6% vs hybrid 50.2%; net −285 (333 fixes, 618 breaks) |

Symptom of trying again:

```text
"this time the color is a prediction / a vibration / a unique hue"
```

without a target that types and the bond table do not already decide.

Fix:

do not promote. Annotate-only looking remains legal. A new color claim must
beat type-pair (or type-only) on an independent gold label, beat a shuffled
spectrum, and beat κ=0 if it overwrites child lines. If it cannot, it is
this failure mode under a new name.

---

# 28. Agent Reasoning Protocol

When asked to invent or evaluate a semantic-chemistry feature, follow this order.

## Step 1 — Classify the desired behavior

Choose one:

- composition,
- ranking,
- exploration,
- stabilization,
- disambiguation,
- detection,
- repair localization,
- grounding,
- or output admission.

## Step 2 — Choose the chemistry concept by function

Examples:

```text
reorientation      → electromagnetic field
closure            → cyclization
search acceleration→ catalysis
hidden structure   → spectroscopy/tomography
distributed support→ resonance
survival            → stability/quench
ambiguity           → competing states
noise rejection     → immune system
```

## Step 3 — Map states and operators

Explicitly define data structures and transitions.

## Step 4 — Declare what the mechanism cannot do

Example:

```text
descending light cannot solve sentences with no root
```

## Step 5 — Declare falsifiers before implementation

Prefer at least three.

## Step 6 — Build annotate-only first

Observe before suppressing or mutating.

## Step 7 — Add negative and shuffled controls

Never grade only against no-op.

## Step 8 — Measure causal contribution

Run ablations.

## Step 9 — Only then allow the mechanism to influence production behavior

---

# 29. Example: Evaluating a New "Semantic Acid"

Suppose someone proposes:

> semantic acid dissolves weak bonds.

Do not accept it at face value.

Ask:

```text
PHYSICS:
Acid changes protonation and reaction behavior.

SEMANTIC ANALOG:
A perturbation that weakens bonds lacking sufficient independent support.

STATE:
bond.support
bond.provenance
bond.valenceConsistency

OPERATOR:
temporarily reduce effective bond strength.

OBSERVABLE:
which molecules fragment.

CONTROL:
apply equal random weakening.

FALSIFIER:
if correct and incorrect structures fragment equally,
the acid carries no useful structural information.
```

Now the metaphor has become an experiment.

---

# 30. Example: Semantic Catalyst

Proposal:

> A catalyst helps atoms find valid molecules faster.

Good implementation:

```text
baseline:
A and B collide only through generic search.

catalyst:
compatible valence orientations receive lower search cost.

validation:
final molecule must remain valid when catalyst is removed.
```

Bad implementation:

```text
if catalyst:
    validityScore += 0.5
```

The latter is not chemistry.

It is a magic number.

---

# 31. Example: Light-Based Identity

Proposal:

> Light tells an atom what it is.

Reject that phrasing.

Better:

> A root-derived structural broadcast contains the identities of cells that
> participate in complete derivations. Each atom tests whether its own sealed
> identity appears in the signal.

This preserves:

- locality,
- identity,
- graph truth,
- falsifiability.

---

# 32. Example: Dark-Matter Detection

Proposal:

> Invisible semantic structures should become visible when illuminated.

Better mechanism:

```text
known perturbation
→ hidden structure reacts
→ response vector changes
→ trace accumulates
→ matched control subtracted
→ likely obstruction localized
```

The detector infers structure from interaction.

It does not assume visibility.

---

# 33. Naming Discipline

Poetic names are allowed.

But every poetic name must have a boring technical definition.

Example:

```text
"chlorophyll"
= receiver-local transformation from regulated light arrival to semantic voltage
```

```text
"dark matter beam"
= controlled perturbation assay over root-inaccessible full-span structures
```

```text
"DMT"
= parameterized exploratory catalyst that changes assembly topology
```

If an engineer cannot explain the component without metaphor, the component is underspecified.

---

# 34. Handoff Requirements

When an agent proposes a semantic-chemistry feature, return:

## Summary
What the mechanism does.

## Physical source
What chemistry/physics concept inspired it.

## Semantic mapping
What each physical entity corresponds to.

## Operator
Exact computational transformation.

## Expected benefit
What measurable outcome should change.

## Falsifiers
What would prove it ineffective.

## Controls
No-op, shuffled, matched, and ablation controls.

## Risks
What could be confounded or circular.

## Implementation surface
Files/modules likely affected.

## QA
Tests required before enabling the feature.

---

# 35. Final Principle

Semantic chemistry is valuable when it converts vague reasoning into:

- constrained interactions,
- local state,
- measurable energy,
- explicit topology,
- perturbable dynamics,
- controlled experiments,
- and falsifiable predictions.

The machine should not say:

> "This feels chemically plausible."

It should say:

> "This operator changes this state, under these conditions, produces this
> measurable effect, survives these controls, and fails under these falsifiers."

That is the standard.
