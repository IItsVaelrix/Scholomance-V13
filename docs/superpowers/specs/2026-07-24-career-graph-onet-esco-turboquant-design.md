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

Runtime behavior must not depend on the timestamp.

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

### 18.1 Artifact integrity

- Identical inputs produce an identical deterministic checksum.
- Zero orphaned edges.
- Stable namespaced IDs.
- Every concept and relation has provenance.
- Every source file has a license classification.
- Runtime shard checksums match the canonical manifest.

### 18.2 Retrieval quality

- Occupation Recall@5 benchmark.
- Skill Recall@K against curated résumé and job-description fixtures.
- Exact labels and aliases cannot be displaced by semantic similarity.
- Essential skills outrank merely related concepts when job evidence is equal.
- Quantized reranking preserves at least 85% approved top-K overlap.
- Unsupported-claim rate is exactly zero in adversarial fixtures.

### 18.3 Determinism and compatibility

- Identical input and artifact produce identical ordered results.
- Node and browser-worker paths produce equivalent classifications.
- Incompatible embeddings are never compared.
- Graph-only fallback has independent snapshot coverage.
- Worker cancellation cannot commit a stale result to the UI.

### 18.4 Sovereign performance

- Warm indexed retrieval p95 under 50 ms.
- TurboQuant reranking of 200 candidates p95 under 12 ms on the target
  Steam Deck-class device.
- Semantic worker heap delta below the existing 32 MB gate.
- No user document, evidence, or query vector appears in a network request.
- Main-thread responsiveness is protected by worker-only heavy processing.

### 18.5 Career safety

- No fabricated qualifications.
- No overall ATS pass probability.
- No protected-trait inference.
- No unexplained recommendation.
- No conflation of missing evidence with evidence of absence.

## 19. Prerequisite Repairs

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

## 20. Rollout

### Phase 1: deterministic substrate

- Source fetch and checksum tooling.
- Canonical schema and ingestion.
- FTS5 projections.
- Crosswalk and provenance validation.
- Graph-only Node query service and fixtures.

### Phase 2: sovereign runtime

- Browser SQLite/WASM worker.
- Core occupation index and family shards.
- Occupation inference and confirmation.
- Graph-only Career integration and fallback behavior.

### Phase 3: semantic ascension

- Select and pin the natural-language career lens.
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

## 21. Success Criteria

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

## 22. References

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
