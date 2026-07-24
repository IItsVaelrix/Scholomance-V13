# Career Graph: O*NET + ESCO + TurboQuant Design

**Status:** User-approved design
**Date:** 2026-07-24
**Scope:** `src/pages/Career`, `src/lib/career`, build-time career-data tooling, and browser-local semantic retrieval
**Primary outcome:** Job-specific résumé tailoring and skill-gap analysis

## 1. Executive Summary

The Career workspace will replace its small hard-coded skill lexicon and noisy
free-text keyword expansion with a sovereign, versioned Career Graph built from
the downloadable O*NET database, ESCO classification data, and the official
O*NET–ESCO occupation crosswalk.

SQLite is the canonical graph authority. It stores normalized concepts,
labels, explicit relations, provenance, source versions, and search
projections. FTS5 and deterministic graph traversal generate a bounded,
lawful candidate frontier. A dedicated natural-language career embedding lens
and TurboQuant rerank only that frontier.

The graph remains law; vectors provide intuition.

All résumé and job-description processing remains browser-local. User text,
evidence spans, query vectors, and analysis sessions are transient and are
never written into the published Career Graph.

## 2. User-Approved Decisions

The following decisions were explicitly approved:

1. The first product slice is job-specific résumé tailoring and skill-gap
   analysis.
2. SQLite is the canonical Career Graph authority.
3. O*NET and ESCO remain distinct source namespaces connected through explicit
   crosswalk relations.
4. FTS5 and explicit graph edges generate candidates before vector scoring.
5. TurboQuant is a bounded local reranker, never a source of graph truth.
6. The runtime executes locally in a browser Web Worker.
7. Suggestions must be evidence-backed and must never fabricate a
   qualification.
8. The Career UI retains a decomposed scorecard rather than presenting an
   overall ATS pass probability.
9. Source updates are deliberate, reproducible artifact ascensions rather than
   live API reads.

## 3. Problem Statement

The current Career analysis has several logical limitations:

- Canonical skills come from a small hand-maintained lexicon.
- Unigrams and n-grams can become duplicate or overlapping recommendations.
- A phrase match cannot reliably distinguish a canonical skill, an alias, a
  related skill, or an occupation-specific requirement.
- The analyzer has no authoritative occupation-to-skill graph.
- Missing keywords can be mistaken for missing competencies.
- Suggestions lack an ontology relation path that explains why they matter.
- Current semantic infrastructure uses a code-aware feature-hashing prototype,
  which is not an adequate natural-language career embedding lens.

O*NET and ESCO fill the occupation, skill, task, knowledge, ability,
technology, alias, hierarchy, and essentiality gaps. They do not prove that a
candidate possesses a skill and do not reveal an employer's hidden intent.
Those claims remain governed by résumé and job-description evidence.

## 4. Goals

- Infer likely target occupations from a job title and description.
- Match job language to canonical O*NET and ESCO concepts.
- Distinguish exact, alias, graph-related, and semantic matches.
- Classify relevant skills as demonstrated, adjacent, missing, not required,
  or ambiguous.
- Produce evidence-bearing résumé suggestions that can be reviewed and
  reversed.
- Preserve local-first operation, deterministic fallbacks, and bounded memory.
- Make every imported fact and every runtime inference explainable.
- Support reproducible source updates and rollback.

## 5. Non-Goals

- Predicting whether an ATS or employer will accept a résumé.
- Claiming that a candidate possesses a skill without résumé evidence.
- Replacing the résumé parser or review drawer.
- Training a custom embedding model.
- Replacing explicit graph relations with nearest-neighbor search.
- Sending user documents to a hosted vector or ontology service.
- Persisting user documents, query vectors, or analysis sessions in the graph.
- Building a general labor-market-demand or salary-forecasting product.
- Redistributing O*NET Career Exploration Tools.

## 6. Scholomance Laws Applied

### 6.1 Graph law before vector intuition

Only concepts admitted through exact labels, aliases, FTS5 retrieval, explicit
occupation relations, or sanctioned crosswalks may enter the candidate
frontier. TurboQuant may reorder that frontier but may not create a candidate
or relation.

### 6.2 Sovereign Editor

Résumé text, job-description text, parsed evidence, and query vectors remain in
browser memory. The runtime has no hidden network dependency for analysis.

### 6.3 Schema sovereignty

The Career Graph has one canonical schema, stable namespaced identities, one
edge store, explicit embedding metadata, and a manifest that binds every
runtime shard to its source build.

### 6.4 Deterministic degradation

Every failure falls back toward graph and lexical truth. A failed semantic
layer cannot make the result more speculative.

## 7. Source Policy

### 7.1 O*NET

Use a pinned downloadable O*NET database release rather than live Web
Services. At design time, the current production release is O*NET 30.3.

The build records:

- Release identifier.
- Download location.
- File inventory.
- Source checksums.
- License classification and exceptions.
- Required USDOL/ETA attribution.
- Any Scholomance modifications or projections.

### 7.2 ESCO

Use a pinned downloadable ESCO release. At design time, the current release is
ESCO v1.2.1.

The build records:

- Release identifier.
- Download location.
- Language packs included.
- File inventory and checksums.
- Required European Commission acknowledgment.
- Original canonical URIs.

### 7.3 O*NET–ESCO crosswalk

Import the official crosswalk as source-authored mapping relations. A
crosswalk means `mapped_to`, not `same_as`. Source concepts and their
descriptions remain independently addressable.

### 7.4 No live source dependency

Source APIs may be used for research or verification but are not runtime
dependencies and are not the canonical ingestion path.

## 8. Canonical SQLite Contract

The canonical build artifact is `career_graph.sqlite`. It is immutable at
runtime and contains normalized facts, search projections, and vector
artifacts.

The names below describe the required contract. Exact DDL and migration
versions will be defined in the implementation plan and then promoted into the
repository schema contract before production use.

### 8.1 `career_graph_manifest`

One sealed build identity containing:

- Career Graph schema version.
- O*NET and ESCO release identifiers.
- Crosswalk release identifier.
- Build timestamp for audit only.
- Sorted source checksums.
- Deterministic build checksum.
- License and attribution inventory.
- Search projection version.
- Embedding lens, model, dimensions, seed, and quantization format.
- Runtime shard inventory and checksums.
- Occupation inference policy identity.
- Candidate frontier policy identity.
- Relation traversal policy identity.
- Shard selection and eviction policy identity.
- Evidence reconciliation and skill classification policy identity.
- Scorecard policy identity.
- Canonical serialized threshold bundle and checksum.

Runtime behavior must not depend on the timestamp.

The initial policy identities are:

- `occupation_inference_policy: occupation-inference-v1`
- `candidate_frontier_policy: career-frontier-v1`
- `relation_traversal_policy: career-traversal-v1`
- `shard_policy: career-shard-v1`
- `skill_classification_policy: career-evidence-v1`
- `scorecard_policy: career-scorecard-v2`

Changing a formula, threshold, frontier limit, traversal depth, evidence rule,
or shard-selection rule requires a new policy identity. Runtime artifacts and
analysis results carry the complete policy bundle identity so results from
different policy versions are never presented as directly comparable.

### 8.2 `career_concept`

Canonical namespaced concepts:

- O*NET occupations.
- ESCO occupations.
- Skills and competencies.
- Knowledge areas.
- Abilities.
- Tasks and work activities.
- Technologies and tools.
- Competency groups or hierarchy nodes.

Illustrative IDs:

- `onet:15-1252.00`
- `esco:<canonical-uri>`

Source identifiers are preserved rather than replaced by generated numeric
identities.

### 8.3 `career_label`

Labels associated with a concept:

- Preferred labels.
- Alternative labels.
- Synonyms and aliases.
- Locale.
- Source and source-record identity.
- Normalized lookup form.

Label normalization is a search projection. It does not overwrite the source
label.

### 8.4 `career_relation`

The sole Career Graph edge store. Supported predicates include:

- Occupation requires or benefits from skill.
- Occupation uses knowledge or ability.
- Occupation performs task or work activity.
- Occupation uses technology.
- Broader, narrower, and related skill.
- Occupation or skill mapping across source namespaces.

Relations carry, where supplied:

- Source authority.
- Source-record identity.
- Essential or optional classification.
- Importance.
- Level or proficiency.
- Scale identity.
- Provenance.

Machine-inferred runtime matches are never written to this table.

### 8.5 `career_search_document`

Deterministic FTS5 projections composed from approved source fields:

- Preferred label.
- Aliases.
- Definition or description.
- Selected task and technology context.
- Namespace and concept kind.

Projection order and separators are versioned so identical inputs yield
identical indexed text.

### 8.6 `career_embedding`

Precomputed semantic artifacts containing:

- Concept or search-document identity.
- Embedding kind.
- Model and lens version.
- Dimensions.
- Seed.
- Centering and normalization policy.
- TurboQuant format and bit width.
- Quantized payload and norm.
- Fidelity grade.
- Full artifact checksum.

Embeddings are comparable only when kind, model, lens, dimensions, seed, and
quantization contract match.

## 9. Runtime Artifact Strategy

The canonical database is the build authority. Runtime packaging derives:

1. A compact core occupation SQLite index.
2. Occupation-family SQLite skill shards.
3. Matching TurboQuant vector shards.
4. A signed or checksummed manifest binding all shards to the canonical build.

The core index contains enough labels, descriptions, FTS5 data, and crosswalk
metadata to infer occupations. Once the occupation frontier is known, the
worker loads only the relevant family shard.

Artifacts are cached locally after first use. SQLite and vectors are opened in
a browser Web Worker through a pinned browser-compatible SQLite/WASM adapter.
React components never execute raw SQL.

### 9.1 Formal shard law

The initial family partition is based on the two-digit O*NET-SOC major
occupation group. ESCO occupations inherit a family only through a recorded
O*NET crosswalk. An unmapped ESCO occupation remains in the core ambiguity
index until the user selects it or a later source-authored mapping is added.

Shard loading follows `career-shard-v1`:

1. Always load the core occupation index.
2. Load the family shard for the highest-ranked occupation.
3. Load another distinct family when its occupation score lies inside the
   versioned ambiguity band of the leader.
4. Load at most three family shards simultaneously.
5. If more than three families remain inside the ambiguity band, stop
   automatic missing-skill classification and request occupation confirmation.
6. After confirmation, load the confirmed family and any directly mapped
   secondary family required by an official crosswalk.

Cross-family recall is protected in two ways:

- Each family shard includes the minimal concept, label, relation, and vector
  records needed by its occupations, even when those skills are also present
  in another family shard.
- A universal bridge shard contains hierarchy connectors, crosswalk connector
  nodes, and skills explicitly linked to occupations in two or more major
  groups.

Duplicate source concepts retain one canonical identity. Loading multiple
shards performs a deterministic identity merge and source-relation union;
result ordering cannot depend on shard arrival order.

Runtime residency follows an LRU policy with these invariants:

- The core index and universal bridge shard are pinned.
- No more than three family shards are resident.
- A shard participating in the active analysis cannot be evicted.
- Prior graph versions are evicted before current-version shards.
- Cache Storage or OPFS quota failure is non-fatal and falls back to
  session-only caching.
- Memory pressure cancels semantic reranking before evicting graph data needed
  for the current result.

The implementation plan must derive the ambiguity band, shard byte budgets,
universal-skill inclusion rule, and cache watermarks from the frozen benchmark
and record them in the versioned threshold bundle.

## 10. Runtime Retrieval Ritual

### 10.1 Inputs

- Parsed `ResumeDocument`.
- Job-description text.
- Optional user-confirmed occupation.
- Career Graph manifest identity.

### 10.2 Pass 1: occupation inference

Candidate occupations are generated from:

- Exact job-title labels.
- Alternative labels and aliases.
- FTS5 occupation retrieval.
- Occupation descriptions.
- Tasks and technologies explicitly present in the job description.
- Official O*NET–ESCO mappings.

Exact and source-authored matches outrank semantic similarity. Low-confidence
or closely competing occupation candidates require user confirmation.

### 10.3 Pass 2: lawful graph expansion

The selected occupation frontier expands through explicit relations to:

- Essential and optional ESCO skills.
- O*NET skills, knowledge, abilities, tasks, and technologies.
- Broader, narrower, and related skill concepts.
- Sanctioned mapped concepts in the other namespace.

The frontier is bounded, deterministically ordered, and deduplicated by
concept identity plus sanctioned crosswalk relationships.

### 10.4 Pass 3: semantic reranking

A dedicated natural-language career lens embeds the résumé evidence and job
description. The current code-aware feature-hashing lens is not reused as the
production semantic model.

The initial model candidate is a pinned, locally executable GTE-Small-class
encoder, consistent with the existing TurboQuant bridge direction. It must
pass browser memory, quality, determinism, and licensing gates before its
identity becomes schema law.

The embedding runtime is a separately gated ascension, not a prerequisite for
shipping the graph-only product. The model bake-off must measure:

- Model, tokenizer, runtime, and total transferred asset size.
- Cold initialization and warm query latency.
- Peak worker memory and steady-state worker memory.
- SIMD and non-SIMD WASM behavior.
- Supported Chrome, Firefox, Safari, and mobile browser behavior.
- Cache Storage and OPFS quota behavior.
- Full-precision versus quantized retrieval fidelity.
- Cross-browser score and ordering variance.
- Model and tokenizer redistribution licenses.

The existing 32 MB Sovereign gate applies to the incremental TurboQuant
reranking working set. It does not, by itself, prove that a natural-language
encoder and its runtime fit in 32 MB. The implementation plan must establish a
separate total semantic-worker memory budget from measured target-device data.
No model is ascended if it satisfies reranker memory while violating total
worker memory.

The deterministic baseline uses the CPU/WASM path. Optional WebGPU or SIMD
acceleration may be enabled only if its final score buckets and stable
concept-ID tie-breaks produce the same ordered classifications as the
baseline. Raw floating-point bit identity is not assumed across browser
engines.

TurboQuant reranks only the bounded graph frontier. It cannot:

- Add a concept.
- Create or modify a graph relation.
- Mark a skill as demonstrated.
- Override a source-authored essentiality classification.
- Promote an unsupported résumé claim.

### 10.5 Pass 4: evidence reconciliation

Each relevant canonical skill receives one classification:

- `demonstrated`: supported by one or more résumé evidence spans.
- `adjacent`: related résumé evidence exists, but the canonical skill is not
  directly established.
- `missing`: required or important to the target with no supporting résumé
  evidence.
- `not_required`: ontology-related but not relevant to the specific posting.
- `ambiguous`: evidence is insufficient for a safe determination.

Missing evidence means “not found in this résumé,” never “the user does not
possess this skill.”

### 10.6 Missing-skill classification law

An occupation-only skill can never become `missing`. Posting evidence is
mandatory.

For skill `s`, let:

- `J_required(s)` mean the posting explicitly requires the canonical skill or
  a sanctioned alias.
- `J_preferred(s)` mean the posting explicitly marks it preferred or optional.
- `J_score(s)` be the posting-to-concept evidence score.
- `O_score(s)` be the occupation-relevance score from source-authored graph
  relations.
- `R_score(s)` be the résumé evidence score.
- `negated(s)` mean the posting explicitly excludes or negates the skill.
- `out_of_scope(s)` mean the evidence appears only in boilerplate, equal
  opportunity text, unrelated benefits, or another excluded section.

The versioned `career-evidence-v1` policy is:

```text
posting_gate(s) =
  J_required(s)
  OR J_preferred(s)
  OR (J_score(s) >= τ_job AND O_score(s) >= τ_occupation)

missing(s) =
  posting_gate(s)
  AND R_score(s) < τ_resume
  AND NOT negated(s)
  AND NOT out_of_scope(s)
```

An explicit posting requirement remains authoritative even when an ontology is
stale or assigns low occupation relevance. Ontology relevance is mandatory
only for inferred, non-explicit requirements. Required and preferred gaps are
reported separately; optionality changes severity rather than being erased.

If no posting evidence survives the gate:

- A strongly occupation-related skill becomes `not_required`.
- A weak or disputed occupation relation becomes `ambiguous`.
- It never becomes `missing`.

The values of `τ_job`, `τ_occupation`, and `τ_resume`, plus the exact evidence
section exclusions, are frozen from the benchmark calibration split and
stored in the manifest threshold bundle.

## 11. Explainable Scoring

The analyzer does not produce an ATS pass probability. It produces decomposed
dimensions:

- Parse quality.
- Section coverage.
- Literal job-language coverage.
- Essential-skill coverage.
- Preferred-skill coverage.
- Occupation alignment.
- Evidence strength.
- Quantification quality.
- Formatting risk.

Every skill result exposes:

- Canonical concept identity and label.
- Source authorities.
- Relation path.
- Importance or essentiality.
- Job-description evidence spans.
- Résumé evidence spans.
- Lexical match contribution.
- Semantic rerank contribution.
- Final classification and rationale.

Semantic scores influence ordering. Source authority, explicit job evidence,
graph relations, and résumé proof determine classification.

## 12. Suggestion Safety

Suggestions are divided into:

- Demonstrated strengths.
- Safe wording opportunities.
- Adjacent skills requiring confirmation.
- Missing requirements for learning or interview preparation.
- Related concepts ignored for this posting.

Only safe wording opportunities supported by résumé evidence may be directly
accepted as résumé edits. Adjacent or missing skills require new user-supplied
evidence before they can enter résumé copy.

The existing reversible suggestion workflow remains authoritative:

- Accept.
- Reject.
- Edit.
- Accept all low-risk.
- Export only approved changes.

## 13. Career UI Integration

### 13.1 Target Role panel

Displayed above the scorecard:

- Inferred occupation and confidence.
- O*NET and ESCO identities.
- Alternative candidates.
- Evidence explaining the inference.
- Control to confirm or choose another occupation.

### 13.2 Evidence trail

Selecting a skill reveals:

```text
job-description phrase
→ inferred occupation
→ O*NET/ESCO relation
→ canonical skill and aliases
→ résumé evidence or missing-evidence decision
→ lexical and semantic ranking contributions
```

### 13.3 Data Archive

The existing Data Archive drawer gains:

- Source releases.
- Attribution notices.
- Artifact checksum.
- Relation paths.
- Diagnostics and active fallback layers.

### 13.4 Accessibility and trust

- Text accompanies every loading and failure state.
- Occupation confirmation and evidence inspection are keyboard accessible.
- Reduced-motion preferences disable nonessential animation.
- Scores are not communicated by color alone.
- The UI states that document processing remains local.
- “Not found” and “does not possess” are never conflated.

## 14. Code Ownership Boundary

- `CareerPage.tsx` owns UI orchestration and visible state.
- The parser continues to own `ResumeDocument`.
- A Career Graph client owns typed communication with the worker.
- The worker owns SQLite, FTS5, graph traversal, embedding, and TurboQuant.
- The analysis layer reconciles graph output with evidence and scorecards.
- Suggestion generation consumes evidence-bearing classifications.
- Export consumes only user-approved suggestion state.
- React components do not import `better-sqlite3`, vector kernels, or raw
  database adapters.

The current synchronous `handleConfirmAndAlign` path becomes cancellable and
asynchronous. New visible states cover graph initialization, occupation
review, matching, fallback, completion, and error recovery.

## 15. Failure and Recovery Contract

| Failure | Required behavior |
|---|---|
| Invalid schema, manifest, or checksum | Reject the artifact |
| Missing vector model | Continue with FTS5 and graph traversal |
| Embedding contract mismatch | Disable semantic comparison |
| TurboQuant fidelity failure | Restore graph-baseline ordering |
| Worker timeout or memory breach | Cancel semantic pass and return graph results |
| Low occupation confidence | Request user confirmation |
| Unsupported résumé claim | Block the suggestion |
| Missing occupation shard | Retain lexical ATS analysis and explain degradation |
| Orphaned relation or corrupt source row | Fail the build |

Every degraded result reports which layers were active. No failure silently
changes the interpretation of a score.

## 16. Build and Update Governance

1. Download pinned releases.
2. Verify source checksums and expected inventories.
3. Import into a temporary database.
4. Normalize identities and labels without overwriting source values.
5. Import source-authored relations and crosswalks.
6. Validate referential integrity and provenance.
7. Build deterministic FTS5 projections.
8. Generate full-precision embeddings with the pinned career lens.
9. Quantize and grade artifacts through TurboQuant.
10. Produce runtime shards and their manifest.
11. Run integrity, quality, privacy, and performance gates.
12. Seal and publish an immutable version.
13. Retain the prior passing artifact for rollback.

## 17. Licensing and Attribution

### 17.1 O*NET

The downloadable O*NET database is generally licensed under CC BY 4.0.
Scholomance must:

- Credit the O*NET database and USDOL/ETA.
- Link to the license.
- Identify modifications or derived projections.
- Inventory and exclude or separately govern license-exception content.
- Use O*NET trademark wording in accordance with the source guidance.

### 17.2 ESCO

ESCO classification data may be reused under the European Commission document
reuse decision. Scholomance must publish the required acknowledgment:

> This service uses the ESCO classification of the European Commission.

ESCO API software licenses are separate from classification-data reuse. This
design integrates downloadable classification data, not the ESCO Local API
software.

### 17.3 Provenance separation

Source records, normalized Scholomance projections, crosswalk facts, and
machine-generated embeddings remain distinguishable in the artifact and UI.

## 18. QA Gates

### 18.1 Frozen benchmark corpus

The benchmark is constructed and checksummed before retrieval thresholds are
tuned. Annotators do not see system rankings while creating ground truth.

The first release benchmark contains 180 résumé/job-description pairs:

- 144 positive or mixed pairs.
- 36 negative or adversarial pairs.
- At least 72 distinct target occupations.
- Representation from all 23 two-digit O*NET-SOC major occupation groups.
- At least two occupations from each major group.
- At least five deliberately cross-family roles, including technical product
  management, developer advocacy, computational linguistics, audio software,
  and clinical data engineering.

The corpus uses twelve named industry contexts with exactly fifteen pairs per
context:

- Software and internet.
- Healthcare and life sciences.
- Finance and insurance.
- Manufacturing and industrial systems.
- Education.
- Public sector and nonprofit.
- Media, creative, and audio.
- Professional services, legal, and compliance.
- Retail and hospitality.
- Logistics and transportation.
- Energy and environment.
- Science and research.

Every item records source, license or consent basis, transformation history,
industry assignment, occupation assignment, and authorship method. Production
user documents are prohibited. No more than 25% of pairs may be fully
synthetic, and synthetic items must be written or reviewed by annotators before
ground-truth labeling. Synthetic generation may not inspect the evaluated
system's rankings or failure outputs.

The seniority distribution is fixed at:

- 36 entry or early-career pairs.
- 72 mid-level pairs.
- 45 senior individual-contributor pairs.
- 27 lead, manager, or executive pairs.

The 36 adversarial pairs cover, at minimum:

- Adjacent but incorrect occupations.
- Unrelated résumé and posting pairs.
- Keyword stuffing without experience evidence.
- Negated and “not required” skills.
- Preferred-versus-required ambiguity.
- Acronym collisions.
- Boilerplate and equal-opportunity language.
- Cross-family hybrid roles.
- Ontology concepts absent from the posting.
- Résumé evidence that is semantically related but insufficient to prove the
  canonical skill.

The corpus is split once and frozen:

- 60 calibration pairs, including 12 adversarial pairs.
- 120 held-out evaluation pairs, including 24 adversarial pairs.

Thresholds may be fitted only on the calibration split. Release metrics are
reported only on the held-out split. Both split membership and content
checksums are stored outside the runtime artifact.

### 18.2 Annotation law

Each pair is independently annotated by two trained annotators using the
written annotation guide. A third adjudicator resolves disagreements before
the benchmark is frozen.

Annotators record:

- Primary and acceptable alternative occupation IDs.
- Posting evidence spans for occupation inference.
- Relevant canonical skill IDs.
- Required, preferred, optional, negated, or out-of-scope status.
- Résumé evidence spans.
- Expected demonstrated, adjacent, missing, not-required, or ambiguous class.
- O*NET/ESCO source disagreement flags.

A relevant skill is one with posting evidence that maps to a canonical concept
or sanctioned alias and is not negated or out of scope. An occupation-linked
skill without posting evidence is occupational context, not a relevant missing
skill.

The benchmark cannot be frozen until:

- Krippendorff's alpha is at least 0.80 for occupation and skill
  classifications.
- Evidence-span overlap F1 is at least 0.80.
- Every below-threshold category is re-annotated after guide clarification.

O*NET and ESCO disagreements are not resolved by silently preferring one
source. Metrics report:

- Source-exact Recall@K.
- Official-crosswalk-aware Recall@K.
- Results on the source-disagreement subset.

An exact concept hit and an official mapped-concept hit are reported
separately; partial credit is not blended into one opaque score. Essentiality
conflicts remain visible, and explicit posting evidence controls runtime
missing-skill classification.

### 18.3 Artifact integrity

- Identical inputs produce an identical deterministic checksum.
- Zero orphaned edges.
- Stable namespaced IDs.
- Every concept and relation has provenance.
- Every source file has a license classification.
- Runtime shard checksums match the canonical manifest.

### 18.4 Retrieval quality

- Occupation Recall@5 benchmark.
- Skill Recall@K against curated résumé and job-description fixtures.
- Exact labels and aliases cannot be displaced by semantic similarity.
- Essential skills outrank merely related concepts when job evidence is equal.
- Quantized reranking preserves at least 85% approved top-K overlap.
- Unsupported-claim rate is exactly zero in adversarial fixtures.
- Frontier-bounded recall is reported against an unbounded graph baseline so
  sharding or frontier limits cannot hide lost candidates.
- Multi-family and universal-bridge recall are reported separately.

### 18.5 Determinism and compatibility

- Identical input and artifact produce identical ordered results.
- Node and browser-worker paths produce equivalent classifications.
- Incompatible embeddings are never compared.
- Graph-only fallback has independent snapshot coverage.
- Worker cancellation cannot commit a stale result to the UI.
- Every result records the full policy bundle identity and threshold checksum.

### 18.6 Sovereign performance

- Warm indexed retrieval p95 under 50 ms.
- TurboQuant reranking of 200 candidates p95 under 12 ms on the target
  Steam Deck-class device.
- TurboQuant incremental working-set delta below the existing 32 MB gate.
- Total semantic-worker peak memory satisfies the separately approved
  model-runtime budget on each supported device tier.
- No user document, evidence, or query vector appears in a network request.
- Main-thread responsiveness is protected by worker-only heavy processing.

### 18.7 Career safety

- No fabricated qualifications.
- No overall ATS pass probability.
- No protected-trait inference.
- No unexplained recommendation.
- No conflation of missing evidence with evidence of absence.

## 19. Risk Register

### 19.1 Low-risk foundations

- Canonical namespaced graph.
- FTS5 lexical retrieval.
- Explicit provenance.
- Source checksums.
- Graph-only fallback.
- Evidence-span preservation.
- Reversible suggestion workflow.

### 19.2 Medium-risk systems

- O*NET/ESCO normalization.
- Crosswalk interpretation.
- Browser SQLite sharding.
- Asynchronous cancellation.
- Occupation-confidence calibration.

### 19.3 High-risk systems

- Browser-local natural-language embedding runtime.
- Meeting total worker-memory targets on mobile devices.
- Cross-browser deterministic ordering.
- Maintaining recall while bounding the frontier and shard count.
- Model and tokenizer redistribution licensing.

Each high-risk system receives an explicit proof-of-feasibility gate before
dependent UI work begins. Failure of semantic feasibility does not block the
graph-only product.

## 20. Prerequisite Repairs

Before graph quality can be trusted, implementation must repair or supersede
known issues in the current Career path:

- Replace browser-incompatible `Buffer.byteLength` usage in pasted-text
  parsing.
- Normalize parse-confidence units consistently before percentage display.
- Replace free n-gram suggestion identity with canonical concept identity and
  deduplication.
- Preserve the existing evidence-span contract through asynchronous worker
  analysis.

These repairs are implementation prerequisites, not changes to the approved
ontology authority model.

## 21. Rollout

### Phase 1: deterministic substrate

- Frozen benchmark and annotation guide.
- Source fetch and checksum tooling.
- Canonical schema and ingestion.
- FTS5 projections.
- Crosswalk and provenance validation.
- Graph-only Node query service and fixtures.

### Phase 2: sovereign runtime

- Browser SQLite/WASM worker.
- Core occupation index and family shards.
- Formal multi-shard, universal-bridge, and cache-policy verification.
- Occupation inference and confirmation.
- Graph-only Career integration and fallback behavior.

### Phase 3: semantic ascension

- Run the browser model and tokenizer bake-off.
- Establish the total semantic-worker device budgets.
- Select and pin the natural-language career lens only after feasibility proof.
- Build and validate full-precision baselines.
- Generate TurboQuant artifacts.
- Add bounded reranking and fidelity gates.

### Phase 4: evidence experience

- Target Role panel.
- Skill classifications and evidence trails.
- Scorecard expansion.
- Provenance and attribution archive.
- Accessibility and privacy verification.

### Phase 5: release gates

- Full quality battery.
- Sovereign performance battery.
- Cross-browser worker verification.
- Artifact rollback rehearsal.
- Production feature flag and staged activation.

## 22. Success Criteria

The design is successful when:

1. Career analysis uses O*NET and ESCO concepts instead of the hard-coded
   lexicon as its canonical skill authority.
2. Every material skill recommendation has a source relation and user-text
   evidence trail.
3. TurboQuant improves ordering without creating candidates or unsupported
   claims.
4. Graph-only analysis remains complete and usable when semantic assets fail.
5. Résumé and job-description text remain local.
6. The runtime meets the approved latency and memory gates.
7. Source updates are reproducible, attributed, and reversible.
8. Benchmark construction, policy formulas, thresholds, traversal limits, and
   shard behavior are versioned and reproducible.

## 23. References

- O*NET database downloads and license:
  <https://www.onetcenter.org/database.html>
- O*NET release archive:
  <https://www.onetcenter.org/db_releases.html>
- O*NET–ESCO crosswalk:
  <https://www.onetcenter.org/crosswalks.html>
- ESCO downloads:
  <https://esco.ec.europa.eu/en/use-esco/download>
- ESCO reuse FAQ:
  <https://esco.ec.europa.eu/en/about-esco/faq?page=1>
- ESCO API licensing distinction:
  <https://esco.ec.europa.eu/en/use-esco/use-esco-services-api>
- Scholomance TurboQuant service manual:
  `docs/scholomance-encyclopedia/Scholomance White Papers/TURBOQUANT-SERVICE-MANUAL.md`
- Scholomance TurboQuant architecture:
  `docs/scholomance-encyclopedia/ARCH Scholomance Docs/ARCH-2026-04-26-TURBOQUANT-VECTOR-BRIDGE.md`
- Existing ATS parser design:
  `docs/superpowers/specs/2026-07-24-ats-parser-architecture-design.md`
