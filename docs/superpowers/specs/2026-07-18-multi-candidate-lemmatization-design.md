# Multi-Candidate Lemmatization with Semantic Ballistics — Design

**Date:** 2026-07-18

**Status:** Approved

**Branch:** `feat/lexical-graph-foundation`

**Extends:** `2026-07-18-analyze-ui-retrieval-design.md`

**Semantic-calculus source:** `scripts/scholo-gate.mjs` and `codex/core/semantic-calculus/`

## Goal

Make the Read IDE Analyze tool resolve an entered surface form to every lawful
lemma/POS candidate, rank those candidates by semantic proximity to an explicit
context envelope, and preserve ambiguity whenever the available evidence does
not establish a clear winner.

The feature repurposes Semantic Calculus's closed-candidate, deterministic
ranking, evidence-trace, and margin disciplines. It does not import intent
capabilities, `Do`, LAW permission, or execution semantics into lexical analysis.

## Problem

`lexicalAnalyze.service.js` currently trims and lowercases the query, then sends
that exact string to dictionary and WordNet lookups. This loses semantic coverage
for inflected and ambiguous forms:

- `axes` may mean `ax` or `axis`.
- `leaves` may mean `leaf` or `leave`.
- `saw` may be the lemma `saw` or the irregular past of `see`.
- `better` may retain its surface lemma or resolve through the comparative bases
  `good` and `well`.

Suffix stripping cannot solve this honestly. English surface-to-lemma mapping is
one-to-many, irregular, and sensitive to part of speech. Semantic proximity alone
also cannot define lemma identity: `ran` may be near `sprint`, `jog`, and `race`,
but those are semantic neighbors rather than its grammatical lemma.

## Non-goals

- No unrestricted nearest-neighbor result may become a lemma candidate.
- No hidden use of the whole editor document.
- No typing-triggered requests; Analyze remains submit-only.
- No silent suppression of alternative candidates after a clear-margin result.
- No collapse of lemma, part-of-speech, and synset/sense ambiguity into one axis.
- No client-authoritative ranking, hashing, or game-mechanic decision.
- No reuse of Semantic Calculus capability minting, permission, or execution paths.
- No replacement of the Lexicon Oracle.

## Design principles

1. **Inverse morphology nominates; ballistics ranks.** A candidate must first be
   licensed by a versioned morphology relation over a known lexicon.
2. **The candidate world is closed.** A scorer may rank known candidates and may
   never invent a lemma.
3. **Axes remain separate.** Lemma/POS candidates contain nested sense candidates;
   semantic proximity is evaluated at the sense level.
4. **A margin changes epistemic presentation, not evidence retention.** Alternatives
   remain available even when one candidate is clearly ahead.
5. **Context is explicit and replayable.** Ranking reads only the selected scope,
   and the server hashes the canonical effective context.
6. **Missing evidence degrades.** An unavailable or incompatible ballistic channel
   is named in the trace and never represented as a synthetic zero.

## Alternatives considered

### A. Query-time suffix reversal

Reverse common suffixes on every request and accept any resulting dictionary hit.
This is inexpensive but brittle. Rule ordering can turn a one-to-many relation
into an accidental winner, irregulars require an expanding exception chain, and
the request path repeatedly performs work that depends only on dictionary state.

### B. Precomputed inverse morphology index plus semantic ballistics — selected

Generate legal surface forms from known lemmas, persist the inverted relation,
retrieve every candidate for the submitted surface, and use context ballistics to
rank the closed set. This preserves ambiguity, gives each edge an auditable rule,
and makes request-time behavior bounded and deterministic.

### C. Unrestricted semantic nearest-neighbor retrieval

Embed the query/context and treat nearest dictionary entries as lemmas. This is
valuable for Related Language, but it confuses semantic neighborhood with
morphological identity and therefore cannot be the lemmatization authority.

## Context envelope

### Input contract

The request uses a discriminated union so scope escalation is structurally
invalid rather than conventionally ignored:

```ts
type AnalysisContextInput =
  | {
      scope: "word";
      surface: string;
    }
  | {
      scope: "selection";
      surface: string;
      selection: string;
    }
  | {
      scope: "line";
      surface: string;
      containingLine: string;
    }
  | {
      scope: "local";
      surface: string;
      containingLine: string;
      neighboringLines: string[];
    }
  | {
      scope: "document";
      surface: string;
      documentContext: string;
    };
```

`surface` is always the target being lemmatized. `selection`, line, local, and
document fields are ranking evidence, not replacement targets.

### Resolved server contract

```ts
interface AnalysisContextIdentity {
  version: "ANALYSIS_CONTEXT_v1";
  scope: "word" | "selection" | "line" | "local" | "document";
  contextHash: string;
}

type AnalysisContext = AnalysisContextInput & AnalysisContextIdentity;
```

The browser submits `AnalysisContextInput`. The server validates the discriminant,
canonicalizes the effective fields, computes the authoritative hash, and uses the
resolved `AnalysisContext` internally. The v1 request does not accept a client
hash; `contextHash` first appears in the server response and internal cache key.

### Context cascade

1. Explicit selection uses `selection` scope.
2. The containing lyric line is the default contextual scope.
3. Neighboring lines enter only through explicit `local` scope.
4. The entire document enters only through explicit `document` scope.
5. An isolated word uses ranked morphology and corpus priors while preserving
   ambiguity unsupported by contextual evidence.

### Canonical hashing

The server hashes a canonical record containing:

- `ANALYSIS_CONTEXT_v1`;
- the scope;
- `surface`;
- exactly the context fields permitted by the selected union member.

Before canonical serialization, text is Unicode NFC-normalized and CRLF/CR line
endings become LF. Case, punctuation, spaces, line breaks, and neighboring-line
order are preserved. The hash excludes timestamps, request IDs, cache state, and
fields outside the active scope. The encoded value is
`sha256-canonical-v1:<64 lowercase hex>`.

### Input limits

- `surface`: 1–80 characters after trim.
- `selection`: 1–1,000 characters.
- `containingLine`: 1–2,000 characters.
- `neighboringLines`: 1–4 entries, each 1–2,000 characters.
- `documentContext`: 1–20,000 characters.

The route rejects missing required fields, fields forbidden by the selected scope,
oversized values, and empty values. It does not silently truncate ranking input.

### Sovereignty

The Analyze surface visibly displays the active scope before submission. Clicking
Analyze with that visible scope is the explicit consent boundary. Local mode shows
how many neighboring lines will be included. Document mode displays an inline
sovereignty notice before submission. No modal is used. The client never attaches
a broader field than the selected scope permits.

## Inverse morphology index

### Relation contract

The index stores a relation rather than a single answer:

```ts
interface LemmaForm {
  surface: string;
  lemma: string;
  pos: string;
  transformId: string;
  source: string;
  irregular: boolean;
  morphologicalConfidence: number;
}

interface MorphologyIndexState {
  version: string;
  status: "complete" | "partial" | "unavailable";
  sourceDigest: string;
  expectedLemmaCount: number;
  indexedLemmaCount: number;
}
```

The SQLite representation is an additive `lemma_form` table whose logical unique
identity is `(surface_lower, lemma_lower, pos, transform_id, source)`. It has an
index beginning with `surface_lower` for bounded request-time lookup. The schema
contract and migration version must be updated before the table is written.

### Construction

An offline builder reads known lemmas and POS values from `wordnet_lemma` plus
the legacy entry lexicon. It applies versioned forward rules for noun number,
verb agreement/tense/aspect, and adjective/adverb degree, then inverts the emitted
edges. Irregular mappings come only from a declared source or curated versioned
registry; a query-time scorer may not invent one.

Identity edges are emitted for known surface lemmas. They coexist with derived
edges and never suppress them.

Representative edges:

```text
axes   -> ax/noun    noun.plural.s
axes   -> axis/noun  noun.plural.is_to_es
leaves -> leaf/noun  noun.plural.f_to_ves
leaves -> leave/verb verb.third_person.s
saw    -> saw/noun   identity
saw    -> see/verb   verb.past.irregular
```

Every edge records its rule/source so morphology contributes explainable evidence.

The builder writes a manifest only after its transaction completes. The index is
`complete` only when the schema/morphology versions match the runtime, the source
digest matches the current closed lexicon, all required sources were readable,
and `indexedLemmaCount === expectedLemmaCount`. A failed or interrupted build is
`partial`; a missing table/manifest is `unavailable`. Request-time row count alone
cannot upgrade either state to `complete`.

## Candidate and sense contracts

```ts
interface CandidateEvidence {
  channel: "morphology" | "semantics" | "pos" | "corpus";
  score: number;
  available: boolean;
  source: string;
  reason: string;
  contextSegments?: string[];
}

interface SenseCandidate {
  synsetId: string;
  definition: string;
  semanticScore?: number;
  bucketIds?: string[];
  embeddingKind?: string;
  embeddingVersion?: string;
  embeddingDimensions?: number;
}

interface LemmaCandidate {
  id: string;
  lemma: string;
  pos: string;
  rank: number;
  score: number;
  evidence: CandidateEvidence[];
  senses: SenseCandidate[];
}

type LemmaResolutionStatus = "clear" | "ambiguous" | "unbound";

interface LemmaResolution {
  surface: string;
  status: LemmaResolutionStatus;
  margin: number;
  threshold: number;
  formulaVersion: string;
  morphologyIndex: MorphologyIndexState;
  candidates: LemmaCandidate[];
}
```

Candidate identity is lemma plus POS, not spelling alone. Synsets stay nested so
polysemy does not disappear into one undifferentiated lemma vector.

## Semantic ballistics

### Responsibility boundary

Inverse morphology defines candidate admissibility. Semantic ballistics ranks
the admissible set. A high-proximity dictionary neighbor without a `lemma_form`
edge may appear in Related Language but cannot become a lemma candidate.

### Sense-level comparison

The effective context is embedded once under a declared embedding kind, version,
and dimension. Each candidate sense is compared only when all three metadata
fields match and neither version is `unknown`. TurboQuant/QBIT supplies the
deterministic similarity estimate and lattice bucket trace.

All sense scores remain in the result. The strongest compatible sense supplies
the candidate's semantic channel because the ranking question is whether any
lawful sense explains the context. Using a sum would reward candidates merely for
having more recorded senses.

Word scope has no semantic channel. A surface-word embedding is a polysemous
aggregate of the ambiguity being resolved and therefore cannot disambiguate it.
Word scope also has no contextual-POS channel: it ranks through morphology and
corpus priors only, then preserves any ambiguity those channels cannot resolve.
This intentional scope mask is not reported as degradation or missing evidence.

### Ranking formula

```text
candidate score = normalized weighted combination of:
  morphology compatibility
  semantic-ballistic proximity
  contextual POS compatibility
  corpus prior
```

`LEMMA_RANK_v1` declares these contextual-scope base weights for `selection`,
`line`, `local`, and `document`:

| Channel | Weight | Normalization |
|---|---:|---|
| Morphology | 0.40 | strongest lawful edge: identity or sourced irregular `1.0`; curated irregular registry `0.95`; productive forward rule `0.85` |
| Semantic ballistics | 0.40 | strongest compatible sense cosine transformed from `[-1,1]` to `[0,1]` by `(cosine + 1) / 2` |
| Contextual POS | 0.15 | compatible `1.0`, contradicted `0.0`; unavailable when the deterministic context analyzer emits no POS evidence |
| Corpus prior | 0.05 | `log1p(candidateFrequency) / log1p(maxCandidateFrequency)`; unavailable when every candidate lacks frequency data |

Multiple morphology edges for the same lemma/POS candidate are all retained in
the evidence trace and their maximum supplies the morphology channel. Missing
channels are removed from the denominator and the remaining declared weights are
renormalized. They are not assigned zero. Every missing or used channel produces
a `CandidateEvidence` record.

For `word` scope, `LEMMA_RANK_v1` instead declares morphology `0.80` and corpus
prior `0.20`. Semantic-ballistic and contextual-POS evidence records are omitted,
because those channels are outside that scope rather than failed observations.

Candidate ordering is descending score, then normalized lemma, then POS, then
candidate ID. Scores are clamped to `[0,1]` and serialized to a fixed six decimal
places at the API boundary.

### Margin policy

The top-two score difference is compared with the declared threshold for the
active scope:

- no candidates -> `unbound`;
- one candidate with a `complete` morphology index -> `clear`;
- one candidate with a `partial` or `unavailable` morphology index -> `ambiguous`
  with margin `0.0` and an index degradation;
- two or more candidates whose top-two difference meets the threshold -> `clear`;
- otherwise -> `ambiguous`.

All candidates survive all three statuses. `clear` selects the initial UI focus;
it is not destructive filtering. `LEMMA_RANK_v1` freezes these top-two margin
thresholds:

| Scope | Threshold |
|---|---:|
| `word` | 0.20 |
| `selection` | 0.12 |
| `line` | 0.12 |
| `local` | 0.10 |
| `document` | 0.10 |

Word scope is stricter because priors alone carry weaker disambiguating evidence.
The ambiguity fixture corpus verifies these constants; changing any value requires
a new formula version and cache identity.

## Analyze result composition

The result separates three retrieval anchors:

- **Surface-anchored:** Sound and rhyme operate on the submitted surface form.
- **Lemma-anchored:** Meaning, Related Language, Oppositions, Symbols, and Corpus
  Examples are retrieved separately for each lemma/POS candidate.
- **Context-anchored:** Literary Techniques use the explicit effective context.

Phrases remain honest-empty until their ingest exists.

```ts
interface AnalysisDegradation {
  code: string;
  channel: "morphology" | "semantics" | "pos" | "corpus" | "retrieval";
  reason: string;
}

interface CandidateAnalyzeResult {
  candidateId: string;
  groups: AnalyzeGroup[];
}

interface AnalyzeResult {
  context: AnalysisContextIdentity;
  resolution: LemmaResolution;
  sharedGroups: AnalyzeGroup[];
  candidateResults: CandidateAnalyzeResult[];
  degradation: AnalysisDegradation[];
}
```

`AnalyzeResult` contains no `generatedAt`. Wall-clock telemetry belongs outside
the deterministic domain result. The schema contract must register these additive
types before backend and UI consumers ship.

For `leaves`, Sound describes `leaves`; lemma-anchored groups branch between
`leaf/noun` and `leave/verb`. The service never silently blends those meanings.

## UI behavior

The query bar remains submit-only and gains a visible scope selector:

```text
Word | Selection | Line | Local | Document
```

Unavailable scopes are disabled. Candidate chips show lemma, POS, score, and the
resolution state. The highest ranked candidate receives initial focus, but all
alternatives remain visible. Selecting another chip changes only lemma-anchored
groups; surface- and context-anchored groups remain stable.

An evidence surface lists morphology rule, semantic proximity and sense, POS
support, corpus prior, unavailable channels, formula version, and abstract context
segment IDs such as `surface`, `selection`, `line:0`, `line:-1`, and `line:+1`.
The response does not echo raw submitted context text.

Changing distant text cannot invalidate Word, Selection, Line, or Local results
unless that text belongs to the active envelope. Document results change whenever
the canonical document input changes.

## Cache identity

The cache key includes:

```text
contextHash
+ morphologyVersion
+ lexiconVersion
+ embeddingKind
+ embeddingVersion
+ embeddingDimensions
+ latticeMapVersion
+ rankingFormulaVersion
```

This replaces the current query-only identity for the new result path. An engine
version change cannot reuse a stale ranking. Cache state never enters the result
or candidate scores.

## Failure and degradation behavior

- Invalid scope/field combination, empty required field, or size violation:
  reject with the repository's registered `PB-ERR-v1` VALUE pattern.
- Missing morphology table/index: return `unbound`, preserve lawful surface-backed
  groups, and record `morphology_index_unavailable`.
- Partial or source-stale morphology index: retain its candidates, record
  `morphology_index_incomplete`, and prohibit lone-candidate `clear` status.
- Unknown surface: return `unbound` and honest-empty lemma groups; do not fabricate
  stems.
- Missing semantic embedding: rank through available channels and record
  `semantic_ballistics_unavailable`.
- Embedding kind/version/dimension mismatch: refuse the comparison and record the
  exact incompatibility.
- Ballistics timeout: preserve candidates and completed retrieval, rank through
  available channels, and mark the semantic channel unavailable.
- Thin margin: return `ambiguous`; do not force or hide a winner.
- Missing candidate retrieval rows: return an honest-empty group for that candidate.

## Data flow

```text
POST /api/lexical/analyze
  -> validate discriminated AnalysisContextInput
  -> canonicalize effective context and compute contextHash
  -> lookup lemma_form by normalized surface
  -> validate every candidate against the closed dictionary lexicon
  -> hydrate POS and WordNet senses
  -> embed effective context
  -> compare compatible sense vectors through TurboQuant/QBIT
  -> compute traced candidate scores
  -> assess top-two margin without filtering candidates
  -> retrieve surface-, candidate-, and context-anchored groups
  -> return deterministic AnalyzeResult
```

## Architecture boundaries

- Morphology generation and ranking primitives are pure Core functions.
- SQLite reads and embedding storage access stay behind Services adapters.
- The Analyze service composes candidates, ranking, and retrieval without writing.
- Runtime owns cache, timeout, and deduplication policy.
- Server validates the request and is authoritative for the resolved context hash.
- UI controls explicit scope consent and renders results; it never computes an
  authoritative lemma decision.

The generic closed-candidate validation and margin primitives move to
`codex/core/candidate-lattice/`. Semantic Calculus imports those primitives from
the domain-neutral module, preserving its existing public proposer API and tests.
Lexical analysis imports the same primitives without depending on intent
execution. The full intent compiler is not a dependency of lexical Analyze.

## Verification matrix

### Morphology

- `axes` produces `ax/noun` and `axis/noun`.
- `leaves` produces `leaf/noun` and `leave/verb`.
- `saw` produces `saw/noun` and `see/verb`.
- An identity edge never suppresses an irregular or derived edge.
- Every candidate exists in the declared closed lexicon.
- Unknown surfaces produce `unbound` without invented candidates.

### Context and ballistics

- Carpentry context ranks `saw/noun` first.
- Perception context ranks `see/verb` first.
- Isolated `saw` preserves ambiguity.
- Word scope emits no semantic or contextual-POS score/evidence/degradation.
- Every sense score uses compatible embedding metadata.
- Incompatible embedding metadata is refused and traced.
- Missing ballistics degrades to other channels without emptying candidates.
- A lone candidate is `clear` only with a complete, version-matching, source-current
  morphology manifest.
- A lone candidate from a partial index is `ambiguous` with margin `0.0` and
  `morphology_index_incomplete`.
- Repeated identical inputs produce identical candidate order and scores.

### Context hashing and isolation

- NFC-equivalent text and equivalent line endings hash identically.
- Case, punctuation, whitespace, scope, and neighboring-line order affect the hash.
- Line scope ignores distant document edits.
- Local scope changes only when the containing or included neighboring lines change.
- Document scope changes when any canonical document input changes.
- Forbidden extra fields are rejected instead of ignored.

### Retrieval composition

- Sound stays anchored to the submitted surface.
- Lemma-backed groups contain only rows for their candidate.
- Context-backed literary results use only the effective context.
- Candidate switching cannot alter shared groups.
- Honest-empty behavior survives `clear`, `ambiguous`, and `unbound` resolutions.

### UI and sovereignty

- No request fires on keystroke.
- The visible scope exactly matches the submitted union member.
- Local shows the included neighbor count.
- Document context is never submitted without the explicit document scope action.
- All alternatives remain keyboard-accessible after a clear-margin result.
- Evidence traces expose channel sources and context segment IDs without echoing
  the raw surrounding draft.

### Cache and versioning

- Any morphology, lexicon, embedding, lattice, or formula version change misses
  the prior cache entry.
- Cache hits and misses return identical deterministic domain results.

## Success criteria

The feature is complete when Analyze can reproduce the ambiguity fixtures above,
context changes only affect scopes that include the changed text, semantic
ballistics improve candidate ordering without widening the candidate set, every
score is traceable to declared evidence, and no ambiguity or missing channel is
silently converted into certainty.

## Law evaluation

No Vaelrix Law change is required. The design already follows schema sovereignty,
server truth, determinism, pure-analysis separation, allow-list validation,
immutability, and Sovereign Editor consent. `SCHEMA_CONTRACT.md` requires an
additive version bump and change notice for the new morphology and Analyze result
contracts before implementation consumers ship.
