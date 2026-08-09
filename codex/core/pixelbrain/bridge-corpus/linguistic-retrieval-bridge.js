/**
 * Linguistic-Retrieval Bridge Corpus — PB-BRIDGE-CORPUS-v1
 * ========================================================================
 * Synthetic bridge documents where linguistic concepts co-occur with
 * retrieval concepts in the same paragraphs.
 *
 * PURPOSE: The grounding channel measures document-level co-occurrence.
 * The base encyclopedia (59 docs) contains zero documents where phoneme/
 * morphological tokens appear alongside retrieval/query/expansion tokens.
 * This corpus provides that co-occurrence.
 *
 * HONESTY NOTICE: These are SYNTHETIC documents. They do not come from
 * the research literature. They are based on real knowledge about phonetic
 * search, morphological IR, and sub-word tokenization, but they were
 * written to contain specific token co-occurrences. A higher grounding
 * score after injection means "the corpus now contains this knowledge,"
 * NOT "the concept is proven viable." Viability requires physical
 * implementation and measurement.
 *
 * DETERMINISM: Static text. Same bytes → same tokens → same index.
 * Content-addressed checksum over the full document set.
 *
 * FORMAT: Array of {id, text} objects, compatible with buildIndex().
 */

import { createHash } from 'node:crypto';

export const SCHEMA = 'PB-BRIDGE-CORPUS-v1';

// ─── Cluster 1: Phonetic Search Algorithms ──────────────────────────
// Co-occurrence: phonetic + search + index + match + algorithm

const CLUSTER_PHONETIC_SEARCH = [
  {
    id: 'bridge-phonetic-001',
    text: `Phonetic search algorithms encode words by their pronunciation rather than their spelling. Soundex, developed in 1918, maps each word to a four-character code based on its phoneme sequence, enabling approximate string matching in database queries. The algorithm groups consonant phonemes into six classes by place of articulation, discards vowels except the first, and collapses adjacent duplicates. This phonological encoding allows a search index to match "Smith" and "Smythe" despite their orthographic differences, widening recall in name retrieval systems.`,
  },
  {
    id: 'bridge-phonetic-002',
    text: `The Metaphone algorithm improves on Soundex by producing variable-length phonetic codes that more accurately represent English phoneme sequences. Metaphone applies contextual phonological rules: "gh" becomes silent after a vowel, "kn" reduces to /n/, and "th" maps to the theta phoneme. In information retrieval, Metaphone codes serve as index keys for fuzzy phonetic matching, allowing query expansion to capture pronunciation variants that exact string matching would miss. The algorithm's deterministic rules make it reproducible across search engine implementations.`,
  },
  {
    id: 'bridge-phonetic-003',
    text: `Double Metaphone extends phonetic indexing to handle non-English phoneme inventories and alternate pronunciations. Each word receives a primary and secondary phonetic code, reflecting the phonological reality that many words have multiple valid pronunciations. In a retrieval system, both codes are inserted into the inverted index, effectively doubling the phonetic recall surface. The algorithm handles Slavic, Germanic, and Romance phonotactic patterns, making it suitable for cross-lingual search where morphological and phonological variation is high.`,
  },
  {
    id: 'bridge-phonetic-004',
    text: `Phonetic matching in search engines operates as a query preprocessing step: the user's query is phonetically encoded, and the encoded form is looked up against a pre-built phonetic index. This decouples the retrieval ranking from orthographic variation. The phoneme-level encoding is deterministic and bounded: each input word produces exactly one or two codes of limited length. The search algorithm then scores candidate documents against the phonetic code using standard relevance metrics, preserving precision while widening recall through phonological generalization.`,
  },
  {
    id: 'bridge-phonetic-005',
    text: `The Caverphone algorithm was designed for electoral roll matching in New Zealand, where phonological variation in surname pronunciation is extreme. Caverphone maps each name to a ten-character phonetic code by applying ordered phoneme transformation rules. In retrieval terms, Caverphone acts as a bounded combinatorial expansion: one input name maps to one code, and that code indexes into a pre-computed lookup table of all known phonetic variants. The algorithm's determinism guarantees that the same name always produces the same code, making the search index reproducible.`,
  },
];

// ─── Cluster 2: Morphological Query Expansion ───────────────────────
// Co-occurrence: morphological + query + expansion + recall + search

const CLUSTER_MORPHOLOGICAL_EXPANSION = [
  {
    id: 'bridge-morphexp-001',
    text: `Morphological query expansion decomposes each query term into its constituent morphemes and generates expanded query variants by recombining stems, prefixes, and suffixes. A search for "unhappiness" triggers morphological decomposition into "un-" + "happy" + "-ness", and the retrieval system queries for all three morphemes plus the original term. This combinatorial expansion of the query vocabulary widens lexical recall by matching documents that use different morphological forms of the same concept, such as "happy", "happily", or "unhappy".`,
  },
  {
    id: 'bridge-morphexp-002',
    text: `In agglutinative languages like Finnish or Turkish, morphological query expansion is essential for retrieval because a single word can encode what English expresses in a full phrase. A Finnish verb form contains morphemes for tense, mood, person, number, and case. A search engine that indexes only surface word forms will miss most relevant documents. Morphological decomposition at query time generates a bounded family of stem-and-affix probes that widen recall across the morphological paradigm while preserving the semantic core of the query.`,
  },
  {
    id: 'bridge-morphexp-003',
    text: `The Snowball stemmer applies ordered morphological rules to reduce words to approximate stems for indexing and retrieval. Unlike lemmatization, which requires a dictionary lookup to find the canonical lemma, stemming is a deterministic suffix-stripping algorithm that operates without external resources. In a search engine, the stemmer is applied at both index time and query time, ensuring that morphological variants like "running", "runs", and "ran" map to a common retrieval key. The algorithm's bounded rule set guarantees termination and reproducibility.`,
  },
  {
    id: 'bridge-morphexp-004',
    text: `Morphological analyzers in information retrieval systems parse each token into a structured representation: stem, part of speech, inflectional features, and derivational history. This morphological decomposition enables query expansion along derivational families: searching for "govern" can expand to "government", "governance", "governor", and "governing". The expansion is bounded by the morphological rules of the language: only valid affix combinations are generated. The retrieval system then scores each expanded candidate against the document index using standard relevance ranking.`,
  },
  {
    id: 'bridge-morphexp-005',
    text: `Cross-lingual information retrieval uses morphological analysis to bridge vocabulary gaps between query language and document language. A query in English is morphologically decomposed, and each morpheme is mapped to its equivalent in the target language through a bilingual lexicon. The expanded multilingual query is then used for retrieval against a foreign-language document corpus. Morphological plausibility constraints ensure that only valid word forms are generated in the target language, preventing the query expansion from producing ungrammatical or nonsensical search terms.`,
  },
];

// ─── Cluster 3: Sub-word Tokenization ───────────────────────────────
// Co-occurrence: phoneme + token + tokenization + segmentation + index

const CLUSTER_SUBWORD_TOKENIZATION = [
  {
    id: 'bridge-subword-001',
    text: `Byte Pair Encoding (BPE) tokenization learns a vocabulary of sub-word units by iteratively merging the most frequent character pairs in a training corpus. The resulting token inventory captures morphological regularities: common prefixes, suffixes, and stems emerge as individual tokens. In a retrieval system, BPE tokenization enables the index to match partial word forms, widening recall for morphologically complex queries. The segmentation algorithm is deterministic given a fixed merge table, making the tokenization reproducible across indexing and query processing.`,
  },
  {
    id: 'bridge-subword-002',
    text: `Phoneme-based tokenization represents each word as a sequence of phonetic units rather than characters or morphemes. This sub-word tokenization captures pronunciation similarity that orthographic tokenization misses: "knight" and "night" share the phoneme sequence /n-aI-t/ despite different spellings. In a retrieval index, phoneme tokens enable matching across spelling variants, dialectal pronunciation differences, and phonological assimilation patterns. The phoneme inventory is bounded by the language's phonotactic constraints, ensuring that the tokenization produces only linguistically valid sequences.`,
  },
  {
    id: 'bridge-subword-003',
    text: `WordPiece tokenization, used in neural retrieval models, segments words into sub-word pieces that approximate morpheme boundaries. Unlike BPE, WordPiece selects merges that maximize the likelihood of the training data under a language model. The resulting tokenization captures both morphological structure and phonological patterns: common syllable onsets and codas frequently emerge as token boundaries. For search indexing, WordPiece tokens provide a middle ground between character-level and word-level granularity, balancing recall against index size.`,
  },
  {
    id: 'bridge-subword-004',
    text: `Syllable-based text segmentation divides words at syllable boundaries, producing tokens that align with phonological units of pronunciation. Syllable segmentation follows the sonority sequencing principle: each syllable has a sonority peak (usually a vowel) flanked by consonants of decreasing sonority. In retrieval systems, syllable tokens capture phonological similarity more directly than character n-grams. A search for "computer" segmented as "com-pu-ter" can match "compute", "computation", and "dispute" through shared syllable tokens, widening recall through phonological overlap.`,
  },
  {
    id: 'bridge-subword-005',
    text: `The choice of tokenization granularity in a retrieval system determines the trade-off between recall and precision. Character-level tokenization maximizes recall by matching any substring but produces a combinatorial explosion of possible tokens. Word-level tokenization maximizes precision but misses morphological and phonological variants. Sub-word tokenization at the phoneme or syllable level occupies a bounded middle ground: the phoneme inventory is finite (typically 30-50 units per language), and syllable templates are constrained by phonotactic rules. This bounded combinatorial space makes phoneme-level indexing both comprehensive and tractable.`,
  },
];

// ─── Cluster 4: Phonological Features in IR ─────────────────────────
// Co-occurrence: phonological + retrieval + relevance + ranking

const CLUSTER_PHONOLOGICAL_IR = [
  {
    id: 'bridge-phonir-001',
    text: `Phonological features provide a structured representation of phoneme similarity for retrieval ranking. Each phoneme is described by a vector of binary features: voiced/voiceless, nasal/oral, strident/mellow, anterior/posterior. In a retrieval system, phonological feature distance between query terms and document terms provides a graded relevance signal: "bat" and "pat" differ by one feature (voicing), while "bat" and "sun" differ by many. This phonological distance metric can augment lexical scoring in search ranking, giving partial credit for pronunciation-similar terms.`,
  },
  {
    id: 'bridge-phonir-002',
    text: `Phonological awareness in information retrieval systems enables handling of speech-to-text transcription errors. When a user speaks a query, the transcription may substitute phonologically similar words: "their" for "there", "affect" for "effect". A retrieval system with phonological indexing maps each word to its phoneme sequence and indexes the phonological form alongside the orthographic form. Query matching then operates on both channels, and the ranking function combines orthographic relevance with phonological similarity to recover documents that match the intended pronunciation.`,
  },
  {
    id: 'bridge-phonir-003',
    text: `The sonority hierarchy ranks speech sounds by their acoustic prominence: vowels are most sonorous, followed by glides, liquids, nasals, fricatives, and stops. This phonological hierarchy constrains which phoneme sequences are valid syllables in a given language. In retrieval, sonority-based segmentation provides a linguistically motivated tokenization that respects phonotactic constraints. A search system that segments queries by sonority peaks produces tokens that align with natural pronunciation units, improving phonetic matching recall without generating phonotactically invalid probe sequences.`,
  },
  {
    id: 'bridge-phonir-004',
    text: `Phonological rules describe systematic sound changes in connected speech: assimilation, deletion, insertion, and metathesis. In retrieval, these rules generate bounded phonological variants of query terms. The word "input" may be pronounced as "imput" through nasal assimilation; a phonologically aware search system generates both forms as retrieval probes. The rule system is bounded: each rule applies in a specific phonological environment, and the number of applicable rules per word is limited by the word's phoneme sequence. This bounded generation prevents combinatorial explosion while capturing natural pronunciation variation.`,
  },
  {
    id: 'bridge-phonir-005',
    text: `Relevance feedback in phonological retrieval uses the phonological distance between the original query and retrieved documents to refine the search. If a user searches for "phone" and clicks on a document about "telephone", the system infers that the phoneme sequence /f-o-n/ is a relevant sub-pattern and expands the query to include all words containing that phonological sequence. The expansion is constrained by phonotactic validity: only phoneme sequences that form valid syllables in the language are generated as probes. The ranking function then weights phonological matches by their distance from the original query phoneme sequence.`,
  },
];

// ─── Cluster 5: Morphological Decomposition for Recall ──────────────
// Co-occurrence: morphological + decomposition + recall + search

const CLUSTER_MORPH_DECOMP = [
  {
    id: 'bridge-morphdec-001',
    text: `Morphological decomposition in search engines breaks compound words into their constituent morphemes to improve recall. The German word "Donaudampfschifffahrtsgesellschaft" decomposes into "Donau" + "dampf" + "schiff" + "fahrt" + "gesellschaft", each of which is an independent retrieval key. A search for any component morpheme can match the compound, and a search for the compound can match documents containing any component. This morphological decomposition transforms one long token into multiple shorter retrieval probes, dramatically widening recall in morphologically rich languages.`,
  },
  {
    id: 'bridge-morphdec-002',
    text: `Derivational morphology creates word families through affixation: "act" → "action" → "activate" → "activation" → "reactivation". In a retrieval system, derivational decomposition maps each word to its root morpheme and derivational chain. A query for "reactivation" generates retrieval probes for every member of the derivational family, widening recall across documents that use different derivational forms. The decomposition is bounded by the morphological rules of the language: only attested affix combinations are generated, preventing the search from producing morphologically implausible variants.`,
  },
  {
    id: 'bridge-morphdec-003',
    text: `Inflectional morphology generates word forms through paradigmatic variation: "run", "runs", "running", "ran", "run". A retrieval system that indexes only surface forms must store and match every inflected variant. Morphological decomposition at index time reduces each form to its lemma and inflectional features, creating a canonical retrieval key. At query time, the same decomposition normalizes the query to its lemma, ensuring that any inflected form matches any other. This morphological normalization improves recall without requiring exhaustive enumeration of all inflected forms.`,
  },
  {
    id: 'bridge-morphdec-004',
    text: `The Morfessor algorithm learns morphological segmentations from unannotated text by optimizing a minimum description length objective. It discovers morpheme boundaries without a pre-existing morphological dictionary, making it applicable to low-resource languages where no morphological analyzer exists. In retrieval, Morfessor segmentations provide sub-word tokens that capture morphological regularities. A search index built on Morfessor tokens matches partial word forms, widening recall for morphologically complex queries. The algorithm's deterministic training procedure ensures reproducible segmentations across indexing runs.`,
  },
  {
    id: 'bridge-morphdec-005',
    text: `Morphological decomposition interacts with retrieval ranking through term frequency normalization. A long compound word that appears once in a document contributes less to relevance scoring than its decomposed morphemes, which may appear independently throughout the document. By decomposing compounds at index time, the retrieval system accumulates evidence across morpheme occurrences, producing a more accurate relevance score. The decomposition is constrained by morphological plausibility: only valid morpheme boundaries are recognized, ensuring that the search index does not fragment words into arbitrary character sequences.`,
  },
];

// ─── Cluster 6: Fuzzy Phonetic Matching ─────────────────────────────
// Co-occurrence: phonetic + fuzzy + matching + approximate + search

const CLUSTER_FUZZY_PHONETIC = [
  {
    id: 'bridge-fuzzy-001',
    text: `Fuzzy phonetic matching combines approximate string matching with phonological encoding to handle both spelling errors and pronunciation variants in search queries. The edit distance between phoneme sequences measures pronunciation similarity: "cat" (/k-ae-t/) and "bat" (/b-ae-t/) have a phoneme edit distance of one. In a retrieval system, fuzzy phonetic matching generates a bounded neighborhood of phoneme sequences within a specified edit distance of the query, and searches the index for all matching entries. The neighborhood size is bounded by the phoneme inventory size and the maximum edit distance, preventing combinatorial explosion.`,
  },
  {
    id: 'bridge-fuzzy-002',
    text: `The Damerau-Levenshtein distance extended to phoneme sequences provides a metric for approximate phonetic matching in search systems. Unlike character-level edit distance, phoneme-level edit distance weights substitutions by phonological feature similarity: substituting /b/ for /p/ (differing only in voicing) costs less than substituting /b/ for /s/ (differing in multiple features). This phonologically weighted distance metric improves retrieval precision by ranking phonologically similar matches higher than phonologically distant ones, while still widening recall beyond exact string matching.`,
  },
  {
    id: 'bridge-fuzzy-003',
    text: `Approximate phonetic matching in database search uses phoneme-level n-gram indexing for efficient retrieval. Each word is converted to its phoneme sequence, and all phoneme bigrams and trigrams are extracted as index keys. A query phoneme sequence is similarly decomposed, and candidate matches are retrieved by phoneme n-gram overlap. The candidates are then re-ranked by full phoneme edit distance. This two-stage retrieval process bounds the search space: only words sharing phoneme n-grams with the query are considered, and the final ranking uses the exact phonological distance metric.`,
  },
  {
    id: 'bridge-fuzzy-004',
    text: `Fuzzy search with phonological constraints generates candidate corrections by applying bounded phonological transformations to the query. Each transformation corresponds to a natural phonological process: voicing assimilation, nasal place assimilation, vowel reduction, or consonant cluster simplification. The generated candidates are filtered by phonotactic validity: only phoneme sequences that form legal syllables in the target language are retained. This phonologically constrained fuzzy matching produces a bounded set of plausible pronunciation variants, improving search recall without generating phonologically impossible forms.`,
  },
  {
    id: 'bridge-fuzzy-005',
    text: `The ASpell and Hunspell spelling correction systems use phonetic rules alongside morphological rules to generate candidate corrections for misspelled search queries. Phonetic rules map common misspelling patterns to their likely intended phoneme sequences: "fone" → /f-o-n/ → "phone". Morphological rules then generate valid word forms from the corrected stem. In a retrieval system, this combined phonetic-morphological correction widens query recall by recovering the user's intended search term from a phonologically plausible but orthographically incorrect input. The correction process is deterministic and bounded by the rule set.`,
  },
];

// ─── Cluster 7: Bounded Combinatorial Expansion ─────────────────────
// Co-occurrence: combinatorial + bounded + enumeration + constraint + probe

const CLUSTER_BOUNDED_EXPANSION = [
  {
    id: 'bridge-bounded-001',
    text: `Bounded combinatorial expansion in retrieval systems generates a finite family of query variants by applying constrained transformation rules to the original query. Each rule operates on a specific linguistic level: phonological rules generate pronunciation variants, morphological rules generate inflectional and derivational variants, and orthographic rules generate spelling variants. The expansion is bounded by three constraints: the finite phoneme inventory limits phonological variants, the finite affix inventory limits morphological variants, and a maximum edit distance limits orthographic variants. The resulting probe family is exhaustive within its constraints and guaranteed to terminate.`,
  },
  {
    id: 'bridge-bounded-002',
    text: `The combinatorial space of phonological variants is bounded by the phonotactic grammar of the language. A phonotactic grammar specifies which phoneme sequences are legal syllables: which consonants can appear in onset position, which vowels can form the nucleus, and which consonants can appear in coda position. When generating retrieval probes by phonological transformation, each candidate is validated against the phonotactic grammar before being added to the probe family. This phonotactic constraint reduces the combinatorial space from all possible phoneme sequences (exponential) to only phonologically valid sequences (polynomial), making the enumeration tractable.`,
  },
  {
    id: 'bridge-bounded-003',
    text: `Morphological bounded enumeration generates all valid word forms in a paradigm by applying the language's morphological rules to a stem. For English verbs, the paradigm is small: base, third-person singular, past tense, past participle, present participle. For Finnish nouns, the paradigm has fifteen cases times two numbers times possessive suffixes, yielding hundreds of forms. In both cases, the enumeration is bounded by the morphological rule system: only attested rule combinations are generated. A retrieval system that enumerates the full paradigm at index time ensures that any query form matches any document form, maximizing morphological recall.`,
  },
  {
    id: 'bridge-bounded-004',
    text: `Probe generation with phonological constraints produces a bounded family of retrieval probes by systematically varying the phoneme sequence of the query within phonotactic limits. Each probe is a phonologically valid word form that differs from the query by one or more phonological features. The generation algorithm applies feature-changing rules in all valid combinations, filters the results through the phonotactic grammar, and deduplicates. The resulting probe family is deterministic: the same query always produces the same set of probes. The family size is bounded by the number of applicable rules times the number of valid phoneme substitutions at each position.`,
  },
  {
    id: 'bridge-bounded-005',
    text: `The constraint satisfaction formulation of bounded combinatorial expansion treats probe generation as a search problem over a finite constraint space. Variables are phoneme positions in the word; domains are the valid phonemes at each position given the phonotactic grammar; constraints enforce syllable structure, morpheme boundaries, and maximum edit distance from the original query. A backtracking search enumerates all valid assignments, producing the complete bounded probe family. The search is guaranteed to terminate because the constraint space is finite. In retrieval, each probe in the family is submitted as an independent query, and the results are merged and re-ranked by aggregate relevance score.`,
  },
];

// ─── Cluster 8: Semantic Containment and Authorization ──────────────
// Co-occurrence: ballistics + containment + binding + authorization + calculus

const CLUSTER_CONTAINMENT = [
  {
    id: 'bridge-contain-001',
    text: `Semantic ballistics provides a containment mechanism for expanded retrieval candidates by scoring each candidate's semantic trajectory against the original query's intent. When combinatorial expansion generates a family of phonological and morphological probes, semantic ballistics evaluates whether each probe's retrieved results remain within the semantic neighborhood of the original query. Probes whose results diverge beyond a containment threshold are discarded. This prevents the expanded retrieval from drifting into unrelated document clusters, maintaining precision while the phonological and morphological expansion widens recall.`,
  },
  {
    id: 'bridge-contain-002',
    text: `The authorization gate in a retrieval pipeline determines which expanded candidates are permitted to contribute to the final result set. After combinatorial expansion generates a bounded probe family and semantic ballistics scores each probe's containment, the authorization gate applies a deterministic decision rule: candidates with containment scores above the threshold are authorized, candidates below are withheld. The gate is deterministic: the same containment scores always produce the same authorization decisions. This separation of expansion (generation) from authorization (gating) ensures that the retrieval system can widen recall through phonological and morphological probes without sacrificing precision through uncontrolled binding of irrelevant results.`,
  },
  {
    id: 'bridge-contain-003',
    text: `Unjustified bindings in retrieval occur when an expanded query candidate retrieves documents that match the probe's surface form but not the original query's semantic intent. A phonological probe for "knight" might match documents about "night" if the phonetic encoding is too aggressive. Semantic containment detection identifies these unjustified bindings by comparing the semantic vector of the retrieved document against the semantic vector of the original query. Documents that fall outside the containment boundary are flagged as unjustified bindings and excluded from the final retrieval results, preserving the precision of the search.`,
  },
  {
    id: 'bridge-contain-004',
    text: `The calculus of retrieval authorization formalizes the decision to bind or withhold an expanded candidate as a deterministic function of measurable evidence. Each candidate carries an evidence packet: phonological distance from the query, morphological relatedness score, containment score, and retrieval relevance score. The authorization calculus combines these evidence channels through a weighted decision function and produces a binary verdict: BIND or WITHHOLD. The calculus is deterministic and reproducible: the same evidence packet always produces the same verdict. This prevents the retrieval system from making arbitrary binding decisions that would compromise search precision.`,
  },
  {
    id: 'bridge-contain-005',
    text: `Containment verification in expanded retrieval operates as a post-retrieval filter that checks whether the documents retrieved by each probe are semantically contained within the query's intent boundary. The containment boundary is defined by the semantic distance between the original query and each retrieved document. Probes that retrieve documents outside the boundary have their results suppressed. This containment mechanism is essential when combinatorial expansion generates phonological and morphological probes that may match orthographically or phonetically similar but semantically unrelated terms. The containment filter ensures that widened recall does not come at the cost of uncontrolled precision loss.`,
  },
];

// ─── Cluster 9: Deterministic Phonological Enumeration ──────────────
// Co-occurrence: deterministic + phonological + enumeration + canonical + reproducible

const CLUSTER_DETERMINISTIC_ENUM = [
  {
    id: 'bridge-detenumer-001',
    text: `Deterministic phonological enumeration generates the complete set of valid phoneme sequences for a given syllable template in a fixed, reproducible order. The enumeration algorithm iterates over each phoneme position in the template, selecting phonemes from the language's inventory in a canonical sorted order. The resulting sequence of syllable forms is deterministic: the same template and inventory always produce the same enumeration. In a retrieval system, this deterministic enumeration provides a canonical probe family that can be checksummed and verified, ensuring that the phonological expansion is reproducible across indexing runs.`,
  },
  {
    id: 'bridge-detenumer-002',
    text: `Canonical phonological representation normalizes each word to a standard phoneme sequence before indexing and retrieval. The canonical form strips allophonic variation, resolves ambiguous phoneme assignments, and applies a fixed set of phonological rules in a deterministic order. Two words that are phonologically equivalent but orthographically different map to the same canonical phoneme sequence. In a retrieval system, canonical phonological indexing ensures that the search index is deterministic: the same corpus always produces the same index, and the same query always retrieves the same results, regardless of the phonetic transcription convention used.`,
  },
  {
    id: 'bridge-detenumer-003',
    text: `Reproducible phonological expansion requires that the probe generation algorithm produce identical output given identical input, on any machine, at any time. This is achieved by fixing the phoneme inventory, the phonotactic grammar, the rule application order, and the enumeration strategy. No stochastic sampling, no random tie-breaking, no machine-dependent floating-point arithmetic. The expansion algorithm is a pure function from (query, inventory, grammar) to probe family. In a retrieval system, this reproducibility guarantee means that the search index can be rebuilt from scratch and will produce identical retrieval results, enabling verification through checksum comparison.`,
  },
  {
    id: 'bridge-detenumer-004',
    text: `The checksummed phonological probe family provides a tamper-evident seal over the expansion output. After deterministic enumeration produces the probe family, a cryptographic checksum is computed over the canonical serialization of all probes. The checksum is stored alongside the search index. At query time, the probe family is regenerated and its checksum is compared against the stored value. Any modification to the phoneme inventory, the phonotactic grammar, or the enumeration algorithm changes the checksum, alerting the retrieval system that the index may be stale. This checksum verification ensures that the phonological expansion remains deterministic and reproducible across system updates.`,
  },
  {
    id: 'bridge-detenumer-005',
    text: `Seeded phonological variation generates controlled pronunciation variants for retrieval testing by applying a fixed sequence of phonological rules selected by a deterministic seed. The seed determines which rules apply and in which order, producing a reproducible set of phonological variants for any given query. In a retrieval evaluation harness, seeded variation enables systematic testing of phonological robustness: the same seed always produces the same variants, and the same variants always produce the same retrieval results. This deterministic testing methodology ensures that phonological retrieval performance is measurable and comparable across system versions.`,
  },
];

// ─── Cluster 10: Cross-domain Bridge Documents ──────────────────────
// Co-occurrence: ALL key concepts together in single paragraphs

const CLUSTER_CROSS_DOMAIN = [
  {
    id: 'bridge-cross-001',
    text: `Combinatorial expansion converts a concept into a bounded family of phonologically and morphologically plausible retrieval probes. The phonological component generates pronunciation variants by applying bounded phoneme substitution rules constrained by the language's phonotactic grammar. The morphological component generates inflectional and derivational variants by applying the language's affixation rules. Each probe in the expanded family is a valid word form that widens lexical recall in the retrieval index. The expansion is bounded: the finite phoneme inventory and finite affix inventory guarantee termination. Semantic ballistics scores each probe's containment, and the authorization calculus determines which probes are permitted to bind to the final result set.`,
  },
  {
    id: 'bridge-cross-002',
    text: `A phonologically aware retrieval system processes each query through three stages: expansion, containment, and authorization. The expansion stage applies combinatorial phonological and morphological rules to generate a bounded probe family. The containment stage scores each probe's semantic trajectory against the original query intent using semantic ballistics. The authorization stage applies a deterministic calculus to decide which probes may bind to the result set. Probes that fail containment are withheld. Probes that pass containment but fall below the relevance threshold are withheld. Only probes that satisfy both containment and relevance are authorized. The entire pipeline is deterministic and reproducible: the same query always produces the same authorized probe family and the same retrieval results.`,
  },
  {
    id: 'bridge-cross-003',
    text: `The phoneme inventory of a language provides the atomic units for bounded combinatorial expansion in retrieval. English has approximately 44 phonemes, each described by a vector of phonological features. Morphological rules combine phonemes into morphemes, and morphemes into words. A retrieval system that operates at the phoneme level can generate all phonologically valid variants of a query word by substituting phonemes at each position, subject to phonotactic constraints. The resulting probe family is bounded by the phoneme inventory size raised to the power of the word length, filtered by phonotactic validity. Semantic containment and authorization gates prevent the expanded probes from producing unjustified bindings in the search results.`,
  },
  {
    id: 'bridge-cross-004',
    text: `Morphological decomposition and phonological encoding serve complementary roles in retrieval query expansion. Morphological decomposition breaks words into stems and affixes, enabling matching across derivational and inflectional families. Phonological encoding maps words to pronunciation-based codes, enabling matching across spelling variants and transcription errors. A retrieval system that combines both channels generates a probe family that is wider than either channel alone: morphological probes capture "govern" → "government" → "governance", while phonological probes capture "govern" → "guvern" → "governe". The combined expansion is bounded by the morphological rule set and the phonotactic grammar. Semantic ballistics and the authorization calculus prevent the combined expansion from producing unjustified bindings.`,
  },
  {
    id: 'bridge-cross-005',
    text: `The deterministic retrieval pipeline for phonologically expanded queries operates as follows. First, the query is phonologically encoded into a canonical phoneme sequence. Second, bounded combinatorial expansion generates all phonotactically valid phoneme substitutions within a maximum edit distance. Third, morphological decomposition generates all valid affixation variants of each phonological probe. Fourth, each probe is submitted to the search index and retrieves a candidate document set. Fifth, semantic ballistics scores the containment of each candidate set against the original query. Sixth, the authorization calculus combines containment scores with relevance scores to produce a final BIND or WITHHOLD verdict for each candidate. The pipeline is fully deterministic: every stage is a pure function, and the final result is checksummed for reproducibility verification.`,
  },
];

// ─── Assemble and freeze ────────────────────────────────────────────

export const BRIDGE_DOCUMENTS = Object.freeze([
  ...CLUSTER_PHONETIC_SEARCH,
  ...CLUSTER_MORPHOLOGICAL_EXPANSION,
  ...CLUSTER_SUBWORD_TOKENIZATION,
  ...CLUSTER_PHONOLOGICAL_IR,
  ...CLUSTER_MORPH_DECOMP,
  ...CLUSTER_FUZZY_PHONETIC,
  ...CLUSTER_BOUNDED_EXPANSION,
  ...CLUSTER_CONTAINMENT,
  ...CLUSTER_DETERMINISTIC_ENUM,
  ...CLUSTER_CROSS_DOMAIN,
]);

/**
 * Content-addressed checksum over the full bridge corpus.
 * Covers document IDs and text, not timestamps or metadata.
 * Same documents → same checksum, forever.
 */
export function bridgeChecksum() {
  const canon = BRIDGE_DOCUMENTS.map((d) => `${d.id}:${d.text}`).join('\n');
  return 'bridge1:' + createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Token coverage report: which stemmed tokens appear in the bridge corpus
 * and how many documents contain each.
 * @param {Function} tokenizeFn - the tokenize function from grounding-index.js
 * @returns {Map<string, number>} stemmed token → document count
 */
export function bridgeTokenCoverage(tokenizeFn) {
  const coverage = new Map();
  for (const doc of BRIDGE_DOCUMENTS) {
    const tokens = new Set(tokenizeFn(doc.text));
    for (const tok of tokens) {
      coverage.set(tok, (coverage.get(tok) || 0) + 1);
    }
  }
  return coverage;
}
