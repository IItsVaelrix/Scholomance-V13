# PDR: ConstellationOS for Nexus Wikipedia

## Unified Literary Intelligence for Poetry, Language, Rhyme, Semantics, Linguistics, and Corpus Discovery

**Status:** Finalized — architecture ratified; Phase 1 (Search Chamber) shipped 2026-07-22 (see §26)
**Classification:** Architectural | Semantic Systems | Phonology | Corpus Search | Literary Analysis | UI Composition
**Priority:** Critical
**Date:** 2026-07-22
**Supersedes:** `PDR: Nexus Poetry Wikipedia`, Version 0.1
**Primary Surface:** Nexus
**Primary Runtime:** ConstellationOS
**Semantic Authority:** Leximancy
**Phonetic Authority:** Rhyme Astrology
**Author:** Damien + Engineering Agent

---

# 0. Decision

Nexus will become the primary user-facing literary discovery surface for Scholomance.

The unified engine beneath Nexus will be called **ConstellationOS**.

ConstellationOS is not a conventional operating system. It is a server-authoritative literary analysis and composition layer that coordinates multiple specialized engines through one deterministic contract.

Its two principal interpretive engines are:

1. **Leximancy**, which determines what language can lawfully mean.
2. **Rhyme Astrology**, which determines how language behaves acoustically, rhythmically, and relationally.

ConstellationOS combines their outputs with corpus evidence, literary-device detection, author and era resonance, school analysis, Nexus mastery, and GrimDesign presentation data.

The governing product law is:

> **Leximancy resolves meaning. Rhyme Astrology resolves sound. ConstellationOS resolves their relationships. Nexus reveals the resulting universe.**

---

# 1. Executive Summary

ConstellationOS turns Nexus into a unified search-first atlas for:

* words
* phrases
* rhymes
* lines
* poems
* literary devices
* semantic relationships
* phonetics
* morphology
* syntax
* meter
* cadence
* authors
* literary eras
* poetic schools
* corpus evidence
* Scholomance schools
* craft transformations

A user may submit anything from a single word to a complete passage.

Examples:

* `wound`
* `bright wound`
* `the bright wound of morning`
* `words that rhyme with gravity but feel spiritual`
* `compare the cadence of these two lines`
* `find authors with similar imagery`
* `make this phrase more SONIC without changing its meaning`
* `show the semantic and phonetic constellation around night`

ConstellationOS produces a deterministic literary page that explains the submitted language across multiple evidence channels.

The system does not merely return definitions or rhyme lists. It constructs a typed graph showing how meaning, sound, form, literary technique, corpus history, and creative possibility intersect.

The product thesis is:

> **Every piece of language has a semantic body, a phonetic orbit, a literary ancestry, and a field of possible transformations. ConstellationOS makes that structure visible.**

---

# 2. Why This Is Feasible

Most required capabilities already exist in partial or specialized form.

The work is primarily one of:

* contract unification
* engine adaptation
* evidence normalization
* orchestration
* graph composition
* deterministic ranking
* interface construction

ConstellationOS does not require replacing Leximancy or Rhyme Astrology.

It requires modifying both engines so they can emit stable, interoperable evidence packets.

The system should therefore be treated as an **architectural integration**, not a greenfield linguistic engine.

## 2.1 Existing substrate

The implementation can reuse or adapt:

* Leximancy morphology and lemmatization
* Leximancy word-sense resolution
* Semantic Calculus ambiguity handling
* Semantic Ballistics candidate ranking
* lexical evidence channels
* token-graph semantic relationships
* Rhyme Astrology contracts
* phoneme and stress analysis
* corpus search and snippets
* author and title metadata
* Nexus word mastery and synergies
* GrimDesign signals
* VerseIR or equivalent line representations
* existing Read integration
* existing deterministic seed and bytecode conventions

## 2.2 Primary engineering challenge

The difficult problem is not extracting more information.

The difficult problem is ensuring every engine speaks a compatible language without losing:

* provenance
* ambiguity
* confidence
* deterministic behavior
* evidence class
* version identity
* graceful degradation

ConstellationOS succeeds only when the resulting page feels like one coherent interpretation rather than several analyzer panels taped together.

---

# 3. Problem Statement

Scholomance already contains advanced language systems, but their knowledge is distributed across separate surfaces and contracts.

Leximancy can resolve lexical and semantic information.

Rhyme Astrology can model sound relationships.

Corpus search can locate literary evidence.

Nexus can track mastery and school relationships.

GrimDesign can translate analytical signals into visual decisions.

Read can provide an authoring and revision environment.

The missing layer is a common literary operating contract that answers:

> **What is this language, across meaning, sound, form, history, and creative possibility?**

Without ConstellationOS:

* semantic and phonetic results may use incompatible token boundaries
* ambiguity can be resolved differently by different engines
* duplicate semantic scoring may emerge in Nexus
* rhyme results remain detached from meaning
* author resonance may become an unsupported similarity claim
* literary devices may be detected without explaining their semantic or phonetic role
* multiple UI panels may present related information without exposing the relationship
* future engines may create additional incompatible result shapes

ConstellationOS exists to prevent that fragmentation.

---

# 4. Product Goal

Build Nexus Wikipedia as the primary interface for exploring literature and language through ConstellationOS.

For any submitted query, the system should be capable of answering:

## Meaning

* What does this word or phrase mean here?
* Which senses are possible?
* Which interpretation was selected?
* How confident is that interpretation?
* What alternatives remain plausible?
* Which semantic family surrounds it?
* What concepts oppose or transform it?

## Sound

* How is it pronounced?
* What is its phoneme structure?
* Where are its stresses?
* What rhymes exactly, approximately, internally, or structurally?
* What sound patterns recur?
* What is its cadence?
* Which words share its acoustic architecture?

## Literary form

* Which literary devices are present?
* How strongly are they expressed?
* Which tokens create them?
* How do meaning and sound cooperate to produce the device?
* What imagery, rhetoric, syntax, or line behavior is present?

## Literary context

* Which authors, works, eras, or movements use comparable language?
* Is the match exact, lexical, semantic, phonetic, rhythmic, or stylistic?
* What corpus evidence supports the comparison?
* What does the available corpus fail to represent?

## Craft

* How can the phrase be strengthened?
* How can it become more concise, musical, strange, concrete, lyrical, or school-aligned?
* Which substitutions preserve meaning while changing sound?
* Which substitutions preserve sound while changing meaning?
* What counterphrases and neighboring images are available?

## Scholomance identity

* Which school dominates the phrase?
* Which secondary schools contribute?
* What evidence produces that classification?
* Which discovered words or synergies are involved?
* How would specific mutations shift its school distribution?

---

# 5. Non-Goals

ConstellationOS is not:

* a generic web search engine
* an unsourced literary claim generator
* a replacement for the Read editor
* a replacement for Leximancy
* a replacement for Rhyme Astrology
* a plagiarism detector
* an influence detector
* a factual probability that one author inspired another
* a free-form author biography generator
* a client-authoritative scoring system
* a live web crawler
* a system that silently stores private writing
* a monolithic engine containing every linguistic algorithm
* an excuse to duplicate token-graph logic in Nexus
* a single magical score that collapses all literary properties

The operating system must preserve distinct dimensions even when it provides combined rankings.

---

# 6. System Vocabulary

## 6.1 ConstellationOS

The orchestration, fusion, evidence, graph, and response-contract layer.

ConstellationOS:

* validates and normalizes submitted queries
* requests analysis from specialized engines
* verifies contract compatibility
* joins evidence by token and span identity
* constructs typed relationships
* calculates task-specific rankings
* records provenance
* emits one deterministic page packet

## 6.2 Nexus Wikipedia

The user-facing literary encyclopedia and search interface.

Nexus:

* accepts the query
* renders ConstellationOS results
* supports navigation and comparison
* exposes evidence
* provides explicit craft actions
* displays mastery overlays
* does not independently calculate semantic or phonetic truth

## 6.3 Leximancy

The semantic and lexical authority.

Leximancy owns:

* token normalization
* grapheme-aware tokenization
* lemmatization
* morphology
* part-of-speech candidates
* word senses
* phrase interpretation
* semantic anchors
* synonyms and near kin
* antonymic counterfields
* semantic transformations
* Semantic Ballistics rankings
* Semantic Calculus ambiguity and refusal
* lexical evidence traces

## 6.4 Rhyme Astrology

The phonetic, prosodic, and rhyme authority.

Rhyme Astrology owns:

* phoneme sequences
* syllable boundaries
* stress contours
* rhyme keys
* exact rhyme
* slant rhyme
* internal rhyme
* multisyllabic alignment
* assonance
* consonance
* alliteration
* cadence similarity
* terminal signatures
* recurrence windows
* rhyme constellations
* phonetic evidence traces

## 6.5 Literary Device Resolver

A ConstellationOS analysis layer that consumes evidence from Leximancy, Rhyme Astrology, syntax analysis, and VerseIR.

It does not duplicate their measurements.

It determines whether their combined evidence supports devices such as:

* metaphor
* simile
* personification
* paradox
* antithesis
* alliteration
* assonance
* consonance
* anaphora
* epistrophe
* internal rhyme
* enjambment
* caesura
* polysyndeton
* asyndeton
* chiasmus
* imagery
* symbolism
* metonymy
* synecdoche
* apostrophe
* hyperbole
* litotes

Each detected device must identify:

* relevant spans
* supporting evidence
* confidence
* competing interpretation
* detector version

## 6.6 Constellation

A constellation is a typed graph centered on the submitted language.

Possible node types include:

* query
* token
* lemma
* sense
* phrase
* phoneme
* syllable
* rhyme family
* stress contour
* literary device
* semantic concept
* author
* work
* corpus fragment
* literary era
* literary movement
* Scholomance school
* mastery record
* transformation candidate

Possible edge types include:

* `HAS_LEMMA`
* `HAS_SENSE`
* `SEMANTICALLY_NEAR`
* `SEMANTICALLY_OPPOSED`
* `RHYMES_EXACTLY`
* `RHYMES_SLANT`
* `SHARES_CADENCE`
* `SHARES_STRESS`
* `USES_DEVICE`
* `EVIDENCED_BY`
* `RESONATES_WITH_AUTHOR`
* `ASSOCIATED_WITH_ERA`
* `EXPRESSES_SCHOOL`
* `TRANSFORMS_TO`
* `PRESERVES_MEANING`
* `PRESERVES_SOUND`
* `CONTRASTS_WITH`
* `MASTERED_BY_USER`

---

# 7. Core Design Laws

## 7.1 Specialized sovereignty

Each engine remains authoritative within its own domain.

ConstellationOS may combine evidence, but it may not silently overwrite an engine’s result.

## 7.2 Shared token identity

All engines must refer to a common normalized token and span map.

A semantic result and a phonetic result cannot be joined by guessing that two independently tokenized strings represent the same span.

## 7.3 Evidence before explanation

Every factual or analytical claim must identify its evidence channel.

No page section may manufacture authoritative prose without supporting packet data.

## 7.4 Ambiguity is data

When Leximancy cannot lawfully select a meaning, ConstellationOS preserves the alternatives.

The UI may display multiple semantic skies for the same phrase.

It must not force a false certainty merely to complete the page.

## 7.5 Dimensions remain visible

Meaning, sound, cadence, literary form, school, and corpus resonance remain separate values.

Combined rankings are task-specific views, not universal truth.

## 7.6 Deterministic generation

The same:

* normalized query
* analysis mode
* engine versions
* configuration versions
* corpus checksum
* user-independent options

must produce the same canonical page packet.

## 7.7 Procedural presentation cannot alter analysis

A seed may determine:

* constellation layout
* section ornament
* promoted metrics
* glyph density
* visual emphasis
* animation route

A seed may not determine:

* selected meaning
* author ranking
* rhyme strength
* literary-device presence
* school truth
* corpus evidence
* craft recommendation scores

## 7.8 Failure remains local

If one optional engine fails, the entire page should not collapse.

Examples:

* corpus failure removes author resonance
* GrimDesign failure uses neutral chrome
* mastery failure removes user progression
* Rhyme Astrology failure preserves Leximancy interpretation
* Leximancy ambiguity preserves phonetic analysis but blocks unsupported semantic claims

## 7.9 Search does not mutate

Submitting a query:

* awards no XP
* modifies no document
* pins no page
* saves no private phrase
* changes no mastery state

Mutation requires an explicit user action.

---

# 8. User Experience

## 8.1 Entry state

Nexus opens as a quiet literary search chamber.

Primary control:

**Search a word, phrase, line, rhyme, image, device, or fragment.**

Supported query kinds:

* word
* phrase
* line
* multiline passage
* natural-language discovery request
* comparison
* transformation request

Examples may be drawn from a local static set or installed public corpus.

Typing remains client-side by default.

No server request occurs before submission unless live suggestions are explicitly enabled.

## 8.2 Query examples

### Direct object queries

* `gravity`
* `digital snow`
* `the bright wound of morning`

### Relationship queries

* `words semantically near grief that rhyme with sea`
* `phrases with the cadence of heartbreak halloween`
* `opposites of silence with long-I vowels`

### Literary queries

* `what devices are active in this stanza?`
* `find public-domain poets with similar imagery`
* `compare the sound architecture of these lines`

### Craft queries

* `make this more VOID without losing the meaning`
* `preserve the rhyme but intensify the image`
* `find a counterphrase with the same stress pattern`

---

# 9. Generated Nexus Page

A completed result page contains the following sections.

## 9.1 Phrase Identity

Displays:

* raw query
* normalized query
* query kind
* token count
* grapheme count
* ConstellationOS bytecode
* analysis mode
* engine versions
* corpus signature
* semantic status
* dominant school
* overall warnings

This section answers:

> What did ConstellationOS believe the user submitted?

## 9.2 Leximancy Meaning Field

Displays:

* selected interpretation
* alternate interpretations
* confidence and margin
* token lemmas
* morphology
* parts of speech
* senses
* semantic anchors
* near kin
* counterfield
* lexical rarity
* transformation candidates
* evidence traces

When ambiguity is unresolved, the panel displays the competing interpretations rather than inventing one answer.

## 9.3 Rhyme Constellation

Displays:

* phoneme sequence
* syllables
* stress contour
* rhyme keys
* exact rhyme routes
* slant-rhyme routes
* multisyllabic alignments
* internal recurrence
* terminal signature
* cadence family
* vowel field
* consonant skeleton
* phonetic novelty
* constellation density

This panel should visually behave like a navigable star chart, while retaining a complete text and table representation for accessibility.

## 9.4 Literary Device Observatory

Displays detected literary structures and explains their construction.

Each device card contains:

* device type
* participating spans
* semantic evidence
* phonetic evidence
* syntactic evidence
* confidence
* explanation trace
* alternative classification
* detector version

Example:

**Paradox: “bright wound”**

* `bright` contributes illumination and positive visibility
* `wound` contributes injury and rupture
* semantic polarity creates productive contradiction
* shared stress prominence binds the pair into one image unit
* classification confidence: high
* competing interpretation: compressed metaphor

## 9.5 Phrase Genome

Displays the compact anatomy of the query:

* tokens
* lemmas
* phonemes
* syllables
* stress
* meter shape
* vowel distribution
* consonant distribution
* onset signatures
* coda signatures
* alliteration force
* assonance field
* lexical rarity
* semantic density
* syntactic shape
* imagery density
* speech-act tendency

This is the ConstellationOS equivalent of an encyclopedia infobox.

## 9.6 Unified Atlas

The Unified Atlas merges semantic and phonetic traversal without conflating them.

The user can switch traversal intent:

* Meaning
* Sound
* Rhyme
* Cadence
* Device
* Imagery
* Opposites
* Literary history
* Scholomance school
* Craft transformations

A result may appear in several routes with different scores and evidence.

For example, `mourning` may be:

* phonetically close to `morning`
* semantically distant from `morning`
* symbolically related through contrast
* highly useful in a transformation preserving cadence

## 9.7 Author, Work, Era, and Movement Resonance

Ranks corpus-backed literary relationships.

Possible rollups:

* authors
* individual works
* literary eras
* movements
* poetic forms
* schools of criticism
* corpus collections

Every result must distinguish:

* exact use
* lexical overlap
* semantic resemblance
* phonetic resemblance
* cadence resemblance
* device resemblance
* imagery resemblance
* Scholomance resonance

The system must never describe resonance as proof of influence.

## 9.8 Corpus Evidence

Displays short, attributed evidence fragments.

Each result includes:

* author
* title
* date when available
* corpus source
* license class
* match offsets
* evidence kinds
* component scores
* context expansion availability

Copyright-sensitive sources use metadata-first presentation and shorter excerpts.

## 9.9 Craft Routes

Available actions include:

* Open in Read
* Compare Variant
* Preserve Meaning, Change Sound
* Preserve Sound, Change Meaning
* Forge Counterphrase
* Find Stronger Rhymes
* Increase Alliteration
* Reduce Abstraction
* Intensify Imagery
* Shift Cadence
* Make More WILL
* Make More SONIC
* Make More VOID
* Make More ALCHEMY
* Make More PSYCHIC
* Make More NECROMANCY

Craft actions return candidates and traces.

They do not mutate saved writing until explicitly applied.

## 9.10 Nexus Mastery Overlay

For discovered words:

* mastery level
* usage count
* resonance XP
* unlocked synergies
* connected mastered terms
* phrase-level mastery projection

For undiscovered words:

* quiet undiscovered state
* no implied reward
* no automatic progression

---

# 10. ConstellationOS Architecture

## 10.1 High-level flow

```text
[Nexus Search Surface]
          |
          | submit
          v
[ConstellationOS Route]
          |
          v
[Query Validation and Canonicalization]
          |
          v
[Shared Token and Span Map]
          |
          +---------------------------+
          |                           |
          v                           v
[Leximancy Atlas Mode]       [Rhyme Astrology Atlas Mode]
          |                           |
          +-------------+-------------+
                        |
                        v
             [Evidence Alignment Layer]
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
 [Device Resolver] [Corpus Atlas] [School Synthesis]
          |             |             |
          +-------------+-------------+
                        |
          +-------------+-------------+
          |                           |
          v                           v
 [GrimDesign Adapter]       [Nexus Mastery Adapter]
          |                           |
          +-------------+-------------+
                        |
                        v
         [ConstellationOS Page Composer]
                        |
                        v
          [ConstellationOSPage Packet]
                        |
                        v
             [Nexus Wikipedia UI]
```

## 10.2 The shared token and span map

ConstellationOS creates one canonical representation before invoking downstream engines.

```ts
interface ConstellationToken {
  tokenId: string;
  raw: string;
  normalized: string;
  startGrapheme: number;
  endGrapheme: number;
  lineIndex: number;
  tokenIndex: number;
}
```

All engine results must refer to:

* `tokenId`
* canonical span IDs
* canonical line IDs

This prevents semantic, phonetic, syntax, corpus, and UI layers from developing incompatible offsets.

## 10.3 Engine adapters

Existing engines should not be rewritten around Nexus.

Instead, ConstellationOS adapters translate existing outputs into shared evidence contracts.

```text
Leximancy engine
    -> Leximancy Constellation Adapter
    -> ConstellationSemanticEvidence[]

Rhyme Astrology engine
    -> Rhyme Constellation Adapter
    -> ConstellationPhoneticEvidence[]

Corpus service
    -> Corpus Constellation Adapter
    -> ConstellationCorpusEvidence[]
```

---

# 11. Leximancy Integration

## 11.1 New analysis mode

Leximancy gains a purpose-built mode:

```ts
type LeximancyAnalysisMode =
  | "word"
  | "selection"
  | "line"
  | "document"
  | "constellation_atlas";
```

`constellation_atlas` is not a UI mode.

It is a server-authoritative packet mode intended for composition by ConstellationOS.

## 11.2 Leximancy atlas result

```ts
interface LeximancyAtlasResult {
  version: 1;
  schema_id: "scholomance/leximancy-atlas-result";

  query: {
    normalized: string;
    kind: ConstellationQueryKind;
  };

  status: "resolved" | "ambiguous" | "unsupported";

  interpretations: LeximancyInterpretation[];
  selectedInterpretationId: string | null;

  tokens: LeximancyTokenResult[];
  semanticAnchors: SemanticAnchor[];
  relations: SemanticRelation[];
  counterfield: SemanticRelation[];
  transformations: SemanticTransformation[];

  schoolSignals: SchoolSignal[];

  confidence: number;
  margin: number | null;

  evidence: LeximancyEvidenceTrace[];
  warnings: string[];

  provenance: {
    engineVersion: string;
    morphologyVersion: string;
    semanticBallisticsVersion: string;
    semanticCalculusVersion: string;
    graphVersion: string;
  };
}
```

## 11.3 Semantic refusal law

Let the ranked interpretation scores be:

```text
s₁ >= s₂ >= ... >= sₙ
```

The interpretation margin is:

```text
m = s₁ - s₂
```

Leximancy may select the leading interpretation only when:

```text
s₁ >= minimumConfidence
and
m >= minimumMargin
```

Both thresholds must be versioned configuration values calibrated against fixtures.

When either condition fails:

```text
status = "ambiguous"
selectedInterpretationId = null
```

ConstellationOS must not bypass this refusal.

Rhyme and phonetic analysis may continue because pronunciation can sometimes be resolved independently, but semantic claims must remain conditional.

---

# 12. Rhyme Astrology Integration

## 12.1 New atlas mode

Rhyme Astrology gains a composition-oriented mode:

```ts
type RhymeAstrologyMode =
  | "query"
  | "comparison"
  | "constellation_atlas";
```

## 12.2 Rhyme atlas result

```ts
interface RhymeConstellationResult {
  version: 1;
  schema_id: "scholomance/rhyme-constellation-result";

  pronunciations: PronunciationCandidate[];
  selectedPronunciationId: string | null;

  tokens: RhymeTokenResult[];
  syllables: SyllableResult[];
  stressContour: number[];

  rhymeKeys: RhymeKey[];
  exactRoutes: RhymeRoute[];
  slantRoutes: RhymeRoute[];
  internalRoutes: InternalRhymeRoute[];

  cadence: CadenceProfile;
  vowelField: VowelField;
  consonantSkeleton: ConsonantSkeleton;

  recurrence: RecurrenceResult[];
  constellations: RhymeConstellation[];
  novelty: number;

  confidence: number;
  warnings: string[];

  provenance: {
    engineVersion: string;
    phonemeEngineVersion: string;
    pronunciationBundleVersion: string;
    scoringProfileVersion: string;
  };
}
```

## 12.3 Pronunciation ambiguity

Pronunciation alternatives must remain visible where relevant.

Examples include:

* `read`
* `lead`
* `wind`
* `tear`
* `does`
* proper names
* invented words

Leximancy context may help Rhyme Astrology select a pronunciation, but the selection must be recorded as an evidence-backed cross-engine decision.

The dependency must be explicit:

```text
Leximancy sense evidence
    -> pronunciation constraint
    -> Rhyme Astrology candidate ranking
```

It must not become hidden shared state.

---

# 13. Constellation Fusion

ConstellationOS does not calculate a universal literary quality score.

It calculates task-specific relationship scores from a common evidence vector.

For candidate relationship `x`:

```text
V(x) = [
  semantic,
  lexical,
  phonetic,
  rhyme,
  cadence,
  device,
  imagery,
  syntax,
  school,
  rarity,
  corpus
]
```

Each dimension is normalized to:

```text
0 <= vᵢ <= 1
```

For task profile `p`, the combined score is:

```text
Cₚ(x) =
  clamp01(
    Σ(wₚ,ᵢ × vᵢ) / Σ(wₚ,ᵢ)
  )
```

Where:

* weights are non-negative
* at least one weight is positive
* missing dimensions are excluded from both numerator and denominator
* the applied profile version is returned in provenance

## 13.1 Example task profiles

### Semantic-neighbor search

Prioritizes:

* semantic similarity
* lexical relation
* imagery relation
* device compatibility

### Rhyme-route search

Prioritizes:

* phonetic similarity
* rhyme alignment
* cadence compatibility
* stress compatibility

### Meaning-preserving transformation

Prioritizes:

* semantic preservation
* grammatical compatibility
* school target
* requested phonetic change

### Sound-preserving transformation

Prioritizes:

* phonetic preservation
* stress preservation
* cadence preservation
* requested semantic shift

### Author resonance

Recommended initial profile:

```text
authorResonance =
    0.30 × semanticSimilarity
  + 0.22 × phoneticSimilarity
  + 0.18 × cadenceSimilarity
  + 0.12 × lexicalCoverage
  + 0.10 × schoolAffinity
  + 0.08 × rarityAlignment
```

The displayed percentage is:

```text
round(100 × clamp01(authorResonance))
```

This number is called **resonance**, never probability.

---

# 14. Evidence Classes

```ts
type ConstellationEvidenceKind =
  | "EXACT_TEXT"
  | "EXACT_PHRASE"
  | "LEMMA_OVERLAP"
  | "LEXICAL_RELATION"
  | "SENSE_RELATION"
  | "SEMANTIC_RESONANCE"
  | "PHONETIC_RESONANCE"
  | "EXACT_RHYME"
  | "SLANT_RHYME"
  | "CADENCE_RESONANCE"
  | "STRESS_RESONANCE"
  | "DEVICE_RESONANCE"
  | "IMAGERY_RESONANCE"
  | "SYNTACTIC_RESONANCE"
  | "SCHOOL_RESONANCE"
  | "RARITY_AFFINITY"
  | "CORPUS_OCCURRENCE";
```

Every evidence item includes:

```ts
interface ConstellationEvidence {
  evidenceId: string;
  kind: ConstellationEvidenceKind;
  sourceEngine: string;
  sourceVersion: string;
  spans: string[];
  score: number | null;
  sourceRef: string | null;
  explanationCode: string;
}
```

Human-readable explanation is rendered from typed evidence.

The explanation must not replace the evidence.

---

# 15. Primary Page Contract

```ts
interface ConstellationOSPage {
  version: 1;
  schema_id: "scholomance/constellation-os-page";

  pageBytecode: string;

  query: {
    raw: string;
    normalized: string;
    kind: ConstellationQueryKind;
    intent: ConstellationQueryIntent;
    tokenCount: number;
    graphemeCount: number;
  };

  seed: {
    algorithm: "fnv1a32";
    value: string;
    basis: string[];
    deterministic: true;
  };

  tokenMap: ConstellationToken[];

  leximancy: LeximancyAtlasResult;
  rhymeAstrology: RhymeConstellationResult | null;

  literaryDevices: LiteraryDeviceResult[];
  phraseGenome: ConstellationPhraseGenome;
  unifiedAtlas: ConstellationGraph;

  school: ConstellationSchoolThesis;

  literaryResonance: {
    authors: AuthorResonance[];
    works: WorkResonance[];
    eras: EraResonance[];
    movements: MovementResonance[];
  };

  corpusEvidence: ConstellationCorpusEvidence[];
  transformations: ConstellationTransformation[];

  grimDesign: ConstellationGrimDesign | null;
  masteryOverlay: ConstellationMasteryOverlay | null;

  diagnostics: {
    queryTimeMs: number;
    cacheHit: boolean;
    degradedChannels: string[];
    candidateCounts: Record<string, number>;
    warnings: string[];
  };

  provenance: {
    contractVersion: string;
    engineVersions: Record<string, string>;
    scoringProfiles: Record<string, string>;
    corpusChecksum: string | null;
    configurationChecksum: string;
  };
}
```

---

# 16. Stable Bytecode

Each page receives:

```text
COS-PAGE-v1-{checksum}
```

The bytecode basis includes:

* normalized query
* query kind
* parsed intent
* contract version
* Leximancy version
* Semantic Calculus version
* Semantic Ballistics version
* Rhyme Astrology version
* phoneme-engine version
* device-resolver version
* scoring-profile versions
* school-mapping version
* corpus checksum when corpus is enabled
* deterministic option flags

The bytecode should not include:

* request time
* cache status
* measured duration
* user identity
* animation state
* random values
* temporary diagnostics

Personal mastery must either:

1. remain outside the canonical page bytecode, or
2. use a separate user-overlay bytecode.

The preferred design is separate identity:

```text
COS-PAGE-v1-{canonicalChecksum}
COS-OVERLAY-v1-{userStateChecksum}
```

This preserves shareable canonical pages without leaking or entangling personal progression.

---

# 17. HTTP Contracts

## 17.1 Generate page

```http
GET /api/constellation/page
```

Query parameters:

```ts
{
  query: string;
  mode?: "standard" | "deep";
  includeCorpus?: boolean;
  includeGrimDesign?: boolean;
  includeMastery?: boolean;
}
```

## 17.2 Compare language

```http
POST /api/constellation/compare
```

Body:

```ts
{
  left: string;
  right: string;
  profile?:
    | "meaning"
    | "sound"
    | "rhyme"
    | "cadence"
    | "device"
    | "full";
}
```

## 17.3 Transform language

```http
POST /api/constellation/transform
```

Body:

```ts
{
  query: string;
  operation:
    | "preserve_meaning_change_sound"
    | "preserve_sound_change_meaning"
    | "forge_counterphrase"
    | "increase_alliteration"
    | "increase_imagery"
    | "shift_cadence"
    | "shift_school";

  targetSchool?: School;
  limit?: number;
}
```

Transformations do not modify a saved document.

## 17.4 Pin page

```http
POST /api/constellation/pages/pin
```

Requires:

* authenticated session
* CSRF protection
* explicit user action

## 17.5 Compatibility route

During migration:

```http
GET /api/nexus/page
```

may act as a compatibility alias to:

```http
GET /api/constellation/page
```

The alias should be deprecated after all Nexus consumers use the canonical ConstellationOS route.

---

# 18. Layer Law

## Core

Pure logic only:

* bytecode and seed generation
* evidence normalization
* score-vector operations
* task-profile weighting
* stable sorting
* literary-device fusion
* school synthesis
* packet validation

No:

* DOM
* fetch
* database handles
* request objects
* mutable global state

## Services

Adapters for:

* Leximancy
* Rhyme Astrology
* corpus search
* author aggregation
* token graph
* GrimDesign
* mastery
* VerseIR
* phoneme engine

## Runtime

Owns:

* request coalescing
* transient caching
* engine timeouts
* bounded concurrency
* degradation policy
* diagnostics
* version reconciliation

## Server

Owns:

* request validation
* rate limiting
* session policy
* CSRF for mutation
* response authority
* content-length limits

## UI

Owns:

* input state
* submitted-query state
* section navigation
* graph viewport
* accessible alternatives
* explicit craft actions
* loading and error presentation

The UI does not calculate linguistic truth.

---

# 19. Proposed Module Layout

## 19.1 ConstellationOS core

```text
codex/core/constellation/
  contracts.js
  queryIdentity.js
  tokenMap.js
  evidence.js
  fusion.js
  scoringProfiles.js
  literaryDevices.js
  schoolSynthesis.js
  phraseGenome.js
  pageBytecode.js
  stableSort.js
  degradation.js
```

## 19.2 Engine adapters

```text
codex/services/constellation/
  leximancy.adapter.js
  rhymeAstrology.adapter.js
  corpus.adapter.js
  phoneme.adapter.js
  verseIR.adapter.js
  grimDesign.adapter.js
  mastery.adapter.js
```

## 19.3 Corpus and resonance

```text
codex/services/constellation-corpus/
  candidate.repo.js
  authorResonance.js
  workResonance.js
  eraAggregation.js
  movementAggregation.js
  snippetPolicy.js
```

## 19.4 Server

```text
codex/server/services/
  constellationPage.service.js
  constellationCompare.service.js
  constellationTransform.service.js

codex/server/routes/
  constellation.routes.js
```

## 19.5 UI

```text
src/pages/Nexus/
  NexusPage.jsx

src/components/Constellation/
  ConstellationSearch.jsx
  ConstellationPage.jsx
  PhraseIdentity.jsx
  LeximancyMeaningField.jsx
  RhymeConstellation.jsx
  LiteraryDeviceObservatory.jsx
  PhraseGenome.jsx
  UnifiedAtlas.jsx
  LiteraryResonance.jsx
  CorpusEvidence.jsx
  CraftRoutes.jsx
  MasteryOverlay.jsx
  ConstellationDiagnostics.jsx

src/hooks/
  useConstellationPage.js
  useConstellationCompare.js
  useConstellationTransform.js
```

## 19.6 Modules explicitly not created

Do not create independent Nexus implementations of:

* lexical lookup
* phrase semantic neighborhoods
* sense ranking
* synonym expansion
* antonym expansion
* phoneme analysis
* rhyme scoring
* cadence scoring

Those responsibilities already belong to specialized engines.

Nexus components consume ConstellationOS packets.

---

# 20. Migration Strategy

## Phase 0: Contract archaeology

* Inventory current Leximancy response shapes.
* Inventory current Rhyme Astrology contracts.
* Confirm token and span conventions.
* Identify duplicated morphology, phoneme, semantic, and scoring logic.
* Define the canonical shared token map.
* Publish ConstellationOS contracts in `SCHEMA_CONTRACT.md`.

### Acceptance

* Every engine dependency has a named owner.
* No shared capability has two proposed authorities.
* Contract fixtures exist before UI implementation.

## Phase 1: Dual-engine canonical packet

* Add `constellation_atlas` mode to Leximancy.
* Add `constellation_atlas` mode to Rhyme Astrology.
* Build adapters.
* Emit `ConstellationOSPage` with:

  * Phrase Identity
  * Leximancy Meaning Field
  * Rhyme Constellation
  * Phrase Genome
* Preserve current Nexus mastery as an overlay.

### Acceptance

* Single words, phrases, lines, and multiline input validate.
* Leximancy ambiguity survives composition.
* Rhyme results share canonical token IDs.
* Same input produces byte-identical canonical analysis.

## Phase 2: Unified Atlas

* Build typed graph nodes and edges.
* Add semantic traversal.
* Add rhyme traversal.
* Add cadence traversal.
* Add meaning-preserving and sound-preserving relationships.
* Add accessible non-graph presentation.

### Acceptance

* Every rendered edge identifies evidence.
* Graph and list views expose equivalent information.
* No visual edge exists without typed packet data.

## Phase 3: Literary Device Observatory

* Implement evidence-fusion device resolver.
* Begin with high-confidence devices:

  * alliteration
  * assonance
  * consonance
  * exact rhyme
  * internal rhyme
  * simile
  * repeated structure
  * antithesis
* Add more interpretive devices only after fixture calibration.

### Acceptance

* Structural devices use measurable spans.
* Interpretive devices expose alternatives.
* Device explanations cite semantic, phonetic, or syntactic evidence.

## Phase 4: Corpus constellation

* Add author and work aggregation.
* Add era and movement rollups.
* Add evidence classes.
* Add license-aware snippet policy.
* Add corpus-scope disclosure.

### Acceptance

* No author result appears without evidence.
* Exact text outranks analog resemblance where appropriate.
* Influence is never inferred from resonance.
* Corpus-unavailable mode preserves the rest of the page.

## Phase 5: Craft routes

* Implement transformations.
* Separate candidate generation from candidate ranking.
* Apply Semantic Calculus to transformations.
* Add explicit Open in Read and Apply actions.

### Acceptance

* No transformation silently mutates user work.
* Every candidate states what it preserves and changes.
* Unsupported transformations return a lawful refusal.

## Phase 6: Procedural visual system

* Connect GrimDesign.
* Add deterministic constellation layouts.
* Add school-responsive chrome.
* Add reduced-motion behavior.
* Add mobile and desktop visual baselines.

### Acceptance

* Analysis remains identical across presentation variants.
* Same seed produces the same layout.
* Reduced motion exposes all information statically.
* Visuals map to packet data rather than decoration alone.

## Phase 7: Nexus migration

* Make ConstellationOS the default Nexus experience.
* Move legacy Nexus mastery into the overlay.
* Deprecate the old Nexus semantic route.
* Add compatibility telemetry without storing query content.
* Remove duplicated Nexus semantic modules.

### Acceptance

* Nexus no longer calculates independent semantic truth.
* Existing mastery behavior remains intact.
* Legacy route removal causes no orphaned consumers.

---

# 21. QA Requirements

## 21.1 Determinism

Test:

* same input, same versions, same corpus checksum
* different cache states
* cold and warm server
* repeated process startup
* stable tie sorting
* stable graph IDs
* stable page bytecode
* stable evidence ordering

## 21.2 Leximancy integrity

Test:

* ambiguous polysemes
* inflected words
* compound phrases
* unknown words
* invented words
* proper names
* context-dependent meaning
* refusal thresholds
* alternate interpretation preservation

Required fixtures should include difficult words such as:

* set
* saw
* leaves
* axes
* bound
* lying
* better
* weather

## 21.3 Rhyme integrity

Test:

* exact rhymes
* slant rhymes
* multisyllabic rhymes
* pronunciation ambiguity
* stress mismatch
* spelling divergence
* identical spelling with different pronunciation
* internal rhyme windows
* repeated vowel chains
* invented pronunciations

## 21.4 Cross-engine alignment

Test:

* every engine span maps to a canonical span
* punctuation differences do not corrupt offsets
* contractions remain stable
* Unicode graphemes remain stable
* multiline boundaries remain stable
* pronunciation selected from semantic context records provenance

## 21.5 Literary devices

Test:

* measurable devices produce deterministic spans
* interpretive devices preserve uncertainty
* no device is emitted without evidence
* overlapping devices remain independently represented
* removal of phonetic evidence changes phonetic-device confidence only

## 21.6 Corpus and copyright

Test:

* exact phrase evidence
* analog evidence
* absent author metadata
* unknown publication date
* public-domain source
* licensed source
* restricted source
* no-corpus mode
* snippet truncation
* match offset escaping

## 21.7 Security

Test:

* control-character rejection
* grapheme-length limits
* markup escaping
* no `dangerouslySetInnerHTML`
* CSRF for pin and apply actions
* rate limiting
* no query persistence by default
* no private phrase in diagnostic logs
* bounded candidate expansion

## 21.8 Accessibility

Test:

* keyboard-only operation
* visible search label
* screen-reader result announcement
* graph alternative
* textual score equivalents
* evidence not encoded only by color
* reduced-motion compliance
* focus preservation during section hydration

## 21.9 Performance targets

Provisional targets:

### Standard mode

* warm p95 under 700 ms
* cached first content under 300 ms
* bounded author candidates
* bounded graph nodes
* optional panels may stream after canonical core

### Deep mode

* p95 under 2000 ms
* explicit loading phases
* engine timings visible in diagnostics
* cancellation through abort signal

Targets must be measured against the Steam Deck development environment as well as deployment hardware.

---

# 22. Risks and Mitigations

## Risk: ConstellationOS becomes a god-engine

**Mitigation:** Preserve engine sovereignty. ConstellationOS coordinates typed packets and owns only cross-domain fusion.

## Risk: Nexus duplicates Leximancy

**Mitigation:** Nexus renders ConstellationOS results. All lexical and semantic authority remains inside Leximancy.

## Risk: Sound and meaning become one misleading score

**Mitigation:** Preserve the evidence vector. Combined scores require named, versioned task profiles.

## Risk: Literary-device analysis overclaims interpretation

**Mitigation:** Separate structural devices from interpretive devices. Use confidence, alternatives, and refusal.

## Risk: Author resonance implies influence

**Mitigation:** Mandatory caveat, evidence labels, corpus-scope disclosure, and prohibition on influence language without direct historical evidence.

## Risk: Corpus bias becomes invisible

**Mitigation:** Display corpus coverage, candidate counts, source classes, and missing-data warnings.

## Risk: Cross-engine token offsets drift

**Mitigation:** Generate the canonical token and span map before downstream analysis.

## Risk: Latency grows with every engine

**Mitigation:** Parallel independent channels, bounded candidates, request coalescing, transient caching, standard/deep modes, and local degradation.

## Risk: Procedural visuals obscure scholarship

**Mitigation:** Every visual relationship maps to typed evidence. Every graph has a text representation.

## Risk: Version changes silently alter pages

**Mitigation:** Include engine, configuration, scoring-profile, and corpus versions in page provenance and bytecode basis.

## Risk: Private writing is exposed

**Mitigation:** Submit-only search, no content telemetry, no persistence without pinning, and sanitized diagnostics.

---

# 23. Success Criteria

ConstellationOS succeeds when:

1. A user can search any word, phrase, line, or poem and receive one coherent literary page.

2. Leximancy and Rhyme Astrology produce interoperable evidence without surrendering their individual authority.

3. The system can explain both what language means and how it sounds.

4. Semantic and phonetic relationships can be traversed separately or together.

5. Literary devices identify the spans and evidence that create them.

6. Author, work, era, and movement resonance remain corpus-backed and carefully labeled.

7. Ambiguity is displayed rather than buried.

8. Search results remain deterministic under identical versions and corpus state.

9. Craft transformations state what they preserve, what they change, and why they were ranked.

10. Nexus mastery remains available without contaminating canonical page identity.

11. The product cannot be mistaken for a dictionary, thesaurus, rhyme site, corpus browser, literary encyclopedia, or generic AI chatbot.

12. ConstellationOS feels like all of those instruments have been tuned into one observatory.

---

# 24. Architectural Acceptance Statement

Implementation should not begin until the following statement is true:

> ConstellationOS has one canonical query identity, one shared token and span map, one published page contract, named authority for every analytical dimension, versioned scoring profiles, explicit ambiguity behavior, and local degradation laws.

If that statement is false, UI work risks fossilizing incompatible contracts.

---

# 25. Final Product Thesis

Nexus Wikipedia is the place where language becomes explorable.

Leximancy reveals the semantic structure.

Rhyme Astrology reveals the acoustic structure.

Corpus evidence reveals the literary structure.

The Literary Device Observatory reveals the craft structure.

Nexus mastery reveals the user’s relationship to the language.

GrimDesign reveals the structure visually.

ConstellationOS is the law that keeps every one of those systems in the same universe.

**Search is the doorway.
The constellation is the answer.**

---

# 26. Implementation Status (finalization, 2026-07-22)

This section is the finalization record. Everything above is the ratified target;
this section states what has actually landed against it and where the shipped
reality deviates. It is normative for anyone continuing the work.

## 26.1 Phase 1 — Search Chamber: SHIPPED

The Nexus mastery archive UI has been replaced by the **ConstellationOS Search
Chamber**, a single-scene morph (idle search → submitted rail + result shell)
routed at `/constellation`, with `/nexus` redirecting.

| Concern | Shipped reality |
|---|---|
| Design spec | `docs/superpowers/specs/2026-07-22-constellationos-search-chamber-design.md` |
| Plan | `docs/superpowers/plans/2026-07-22-constellationos-search-chamber.md` |
| Commit range | `994f7cab` (spec) … `6833a930` (idle→rail morph) |
| Route / nav | `/constellation` live; `/nexus` → `/constellation`; nav label **Constellation** |
| Surface | `src/pages/Constellation/` — page, backdrop, search, result shell |
| Data | `useConstellationPage` → **fixture only, no network** (`fixtures/samplePagePacket.js`) |
| Sections live | Phrase Identity, Leximancy Meaning Field, Rhyme Constellation, Phrase Genome |
| Mastery UI | removed from this surface (deferred to the §9.10 overlay) |

**Deliberate deviation from §15.** v1 does **not** emit the full `ConstellationOSPage`
packet. It uses a slim `ConstellationPhase1Packet` (`src/pages/Constellation/types.js`)
shaped *toward* §15 — no `tokenMap`, `unifiedAtlas`, `literaryResonance`,
`corpusEvidence`, `transformations`, `grimDesign`, or `masteryOverlay`. This is
YAGNI, not an amendment to §15: the canonical contract and the §24 acceptance
statement remain the gate for wiring live engines. No live Leximancy or Rhyme
Astrology is connected; §7.4 ambiguity is honoured by the `the bright wound of
morning` fixture (status `ambiguous`, `selectedInterpretationId: null`), and unknown
queries return an awaiting packet rather than an invented sense (§7.3).

**Still not built** (per §5 non-goals / §20 phases): the ConstellationOS core
(`codex/core/constellation/`), engine adapters, the HTTP contracts (§17), the
Unified Atlas graph (§9.6), Literary Device Observatory (§9.4), corpus/resonance
(§9.7–9.8), and craft routes (§9.9). Phases 2–7 are unstarted.

## 26.2 Visual guardrail — validated against this real surface

§7.7 (procedural presentation cannot alter analysis) and the UI-drift risk are
enforced by the **visual phenotype measurement vector** built the same day
(`src/core/phenotype/`, dev route `/__immune/phenotype`, matrix
`tests/visual/phenotype-orthogonality.spec.ts`; design in
`docs/superpowers/specs/2026-07-22-visual-phenotype-calculus-design.md`). It
decompiles a rendered surface into six orthogonal blocks (luminance, stacking,
size, chromaticity, shape, density) so that a CSS change may move only the block
whose axis was declared.

The phenotype spec's own success criteria 1 and 3 are satisfied only "on a **real
page, not a fixture**." The Search Chamber is the first real production surface, so
finalization included pointing the harness at it. Measured results:

- **Localization holds on the real page.** A `width: 400px` mutation on
  `.constellation-search__submit` moved **only** the `size` block (control→panel);
  a `border-radius: 20px` mutation moved **only** the `shape` block (round→pill).
  Slot 0 stable in both. Criterion 3 demonstrated off-fixture.
- **Confirmed blind spot — do not read this harness as an accessibility verdict.**
  The submit button decompiles to `luminance: fail`, a **false negative**. Its
  computed background is `rgba(123,108,255,0.12)`; the quantizer reads the computed
  fg/bg pair and `parseCssColor` discards alpha, so it scores arc-on-solid-amethyst
  = **2.88:1** (below the 3.0 UI floor). The *composited* background is
  `rgb(22,21,47)` (12% amethyst over the void), giving arc-on-that = **>7:1 →
  `high`**. This is exactly the compositing blindness the spec declares in §1.2/§3.3
  — accepted as the price of luminance⊥stacking orthogonality. It is a live trap for
  anyone tuning ConstellationOS chrome: **translucent backgrounds make the luminance
  axis lie in both directions.** Effective contrast belongs to the semantic/
  accessibility phenotype layer, not this one.

The orthogonality matrix must be re-run only when a quantizer changes; ordinary
chamber CSS tweaks use the before/after single-block loop above.

## 26.3 Live-system reconciliation (2026-08-19) — SUPERSEDES the §26.1 "still not built" record

The 2026-08-19 feedback audit
(`docs/Scholomance-Feedback-Report/scholomance-feedback-constellationos.md`)
found this section materially stale: work landed after finalization without a
finalization update, and §26.1 was actively misdescribing the repository. This
subsection is the corrected normative record. §26.1 remains as history.

**Every "still not built" and "fixture only" claim in §26.1 is now false.**
Verified against the repository on 2026-08-19:

| §26.1 claim (2026-07-22) | Live reality (2026-08-19) |
|---|---|
| Data: `useConstellationPage` → **fixture only, no network** | The hook fetches `GET /api/constellation/page` live; the fixture survives only as a *degraded fallback* stamped by `markEngineUnreached` (see §26.4) |
| The ConstellationOS core is not built | `codex/core/constellation/` — **59 modules, 9,356 lines**: queryIdentity, phraseAnalysis, readings, governor, pageBytecode, compose, scale machinery |
| Engine adapters absent | `codex/server/services/constellation/` — **8 adapters, 2,149 lines**: leximancy, rhymeAstrology, genome, semanticInquiry, scaleField, discovery, precedent, senseProbe harness |
| HTTP contracts (§17) not built | `GET /api/constellation/page` live in `codex/server/routes/constellation.routes.js`, registered at `codex/server/index.js:1384`, with query bounds, control-character rejection, and rate limiting |
| Slim Phase-1 packet | Producer emits `version: 2` / `schema_id: scholomance/constellation-os-page-phase2` with phraseStructure, semanticInquiry, scaleField, readings, governed, discovery channels. Published as **SCHOL-COS-PAGE-v2** in SCHEMA_CONTRACT v1.45; canonical typedef: `src/hooks/constellation.types.js` (`ConstellationPagePacket`) |
| Phases 2–7 unstarted | Phrase analysis, semantic inquiry, scale field, competing readings, governed pairs, and discovery have all shipped |
| No runtime orchestration | `codex/runtime/constellationRuntime.js` (2026-08-19): channel isolation, timeout policy, request coalescing, deterministic telemetry — the PDR's Server → Runtime → Services → Core flow is now real |

**Bytecode reconciliation.** The page bytecode basis was rebuilt on 2026-08-19 to
the full §16 set: parsed intent, scoring-profile slot, corpus checksum
(computed once from `corpus_meta` at route registration), and deterministic
option flags join contract/normalized/kind/engineVersions. Contract constant:
`cos-page-v2`. Sealed golden pin: `COS-PAGE-v1-4922C817`
(`tests/qa/features/constellation-pageBytecode.test.js`).

**Still deferred** (honestly, as of 2026-08-19): the Unified Atlas graph (§9.6),
Literary Device Observatory (§9.4), corpus/resonance as a *channel* (§9.7–9.8 —
though corpus-distance already feeds scaleField and governed-sense selection),
craft routes (§9.9), and the mastery overlay (§9.10). The §24 acceptance
statement remains the gate for each.

## 26.4 Epistemic honesty of the fallback (2026-08-19)

The audit's experiential finding stood: when the live engine is unreachable the
hook serves the rich sample packet, stamped degraded. A rich sample can still be
mistaken for partial live analysis. The accepted standard: the fallback must
carry `diagnostics.degradedChannels` containing the live-engine marker and a
warning naming the failure, and the shell must render the degraded banner — an
explicit "engine unreachable" state, never a silent sample. `markEngineUnreached`
is the enforcement point; tests pin it.
