/**
 * CONSTELLATION — Semantic Calculus bridge (inquiry side)
 *
 * A literary query is an INQUIRY, not an action: read-only, evidence-producing,
 * and answerable wrongly. That is the shape codex/core/semantic-calculus already
 * enforces, so ConstellationOS binds a Probe rather than growing its own ad-hoc
 * confidence scores.
 *
 * WHY .js AND NOT .ts. Production runs `node codex/server/index.js` with no TS
 * loader (Dockerfile CMD). A server module importing a .ts file throws
 * ERR_UNKNOWN_FILE_EXTENSION at runtime — which is why semantic-calculus is
 * imported only by tests today. The JSDoc `import(...)` types below are erased
 * and never evaluated, so this module stays importable from server code.
 *
 * WIRED. constellationPage.service runs this on every bound query via
 * semanticInquiry.adapter, and `semanticInquiry` is part of engineVersions, so
 * it participates in pageBytecode. It is still NOT registered in
 * probeRegistry.ts — that registry is the agent-authorization surface, and a
 * literary query has no business appearing there.
 *
 * @typedef {import('../semantic-calculus/types.ts').ProbeFormula} ProbeFormula
 * @typedef {import('../semantic-calculus/types.ts').ObservationRequest} ObservationRequest
 * @typedef {import('../semantic-calculus/types.ts').CausalHypothesis} CausalHypothesis
 */

/**
 * Structural binding, deliberately additive.
 *
 * The harvested probes bind on literal `patterns` ('why are covers blank').
 * A poet types arbitrary text, so no pattern list can cover the input. This
 * binds on the identity queryIdentity.js already computes — a CLOSED structural
 * space (4 kinds x 4 intents) over OPEN lexical input, which is what makes it
 * enumerable at all.
 *
 * Kept out of lexicons.ts routeUtterance on purpose: that module decides whether
 * agent acts are permitted, and a literary query has no business changing the
 * authorization path.
 */
export const CONSTELLATION_INQUIRY_BIND = Object.freeze({
  kind: Object.freeze(['word', 'phrase']),
  intent: Object.freeze(['literary', 'meta-query']),
  /** Refuse absurd input rather than interpret noise. */
  tokenCount: Object.freeze({ gte: 1, lte: 12 }),
});

/**
 * Does this query bind the Constellation sense probe?
 *
 * Returns false rather than throwing on malformed identity: a bind test is not
 * a validator, and a query that cannot be described cannot be claimed.
 *
 * @param {{ kind?: string, intent?: string, tokenCount?: number }} identity
 * @returns {boolean}
 */
export function bindsConstellationInquiry(identity) {
  if (!identity || typeof identity !== 'object') return false;
  const { kind, intent, tokenCount } = identity;
  if (!CONSTELLATION_INQUIRY_BIND.kind.includes(kind)) return false;
  if (!CONSTELLATION_INQUIRY_BIND.intent.includes(intent)) return false;
  if (typeof tokenCount !== 'number' || Number.isNaN(tokenCount)) return false;
  const { gte, lte } = CONSTELLATION_INQUIRY_BIND.tokenCount;
  return tokenCount >= gte && tokenCount <= lte;
}

/**
 * What a harness must collect. The compiler never runs these.
 *
 * Note what is absent: no embedding lookup. Sense evidence is symbolic —
 * wordnet_synset / wordnet_rel / senses_json.glosses — because that is the
 * substrate that is actually populated (304,764 relation rows against 0
 * non-null entry.embeddings_tq).
 *
 * @type {readonly ObservationRequest[]}
 */
const OBSERVATIONS = Object.freeze([
  Object.freeze({
    id: 'obs.lex.sense_candidates',
    description:
      'Candidate senses for the head token (id + raw gloss) and the raw query tokens. ' +
      'Raw on purpose: the overlap is counted by the predicate, not by the harness.',
    harness: 'lexicon.wordnet.sense_candidates',
    required: true,
  }),
  Object.freeze({
    id: 'obs.lex.relation_paths',
    description:
      'wordnet_rel edges reachable from the head token, and each near-kin with the ' +
      'relation path that justifies it.',
    harness: 'lexicon.wordnet.relation_paths',
    required: true,
  }),
  Object.freeze({
    id: 'obs.lex.lexical_entries',
    description:
      'Lexical entries for the spelling, grouped by part of speech, from wordnet_lemma. ' +
      'More than one group means more than one WORD, not more than one reading.',
    harness: 'lexicon.wordnet.lexical_entries',
    required: true,
  }),
  Object.freeze({
    id: 'obs.phon.neighbours',
    description:
      'Phonotopographic similarity (tq-phoneme-v2) between the head token and the ' +
      'winning sense lemma. Collected ONLY to be ruled out — see f_homophone_capture.',
    harness: 'semantic.phonotopography.similarity',
    required: true,
  }),
]);

/** @type {readonly CausalHypothesis[]} */
const HYPOTHESES = Object.freeze([
  Object.freeze({
    id: 'h_sense_by_gloss_overlap',
    claim:
      'The intended sense of the head token is the candidate whose gloss shares the most ' +
      'content words with the rest of the query.',
    predictions: Object.freeze([
      Object.freeze({
        id: 'p_candidates_exist',
        description: 'At least one candidate sense was retrieved',
        required: true,
        observationId: 'obs.lex.sense_candidates',
        predicate: Object.freeze({ op: 'gte', path: 'candidates.length', value: 1 }),
      }),
    ]),
    falsifiers: Object.freeze([
      Object.freeze({
        id: 'f_thin_overlap',
        description:
          'No candidate shares at least two content words with the query context. One ' +
          'shared word is noise: measured on the real dictionary, every selection that ' +
          'won on an overlap of exactly 1 was either a self-match or semantically wrong ' +
          '("light illumination lamp bright" selected the DIVINE sense on a single hit). ' +
          'Two independent content words is the floor for calling a sense evidenced.',
        observationId: 'obs.lex.sense_candidates',
        predicate: Object.freeze({
          op: 'gloss_overlap_lt',
          candidatesPath: 'candidates',
          queryTokensPath: 'queryTokens',
          n: 2,
        }),
      }),
      Object.freeze({
        id: 'f_tie_is_not_a_decision',
        description:
          'The top two senses overlap the query equally. Naming either "the selected sense" ' +
          'claims a disambiguation that never happened.',
        observationId: 'obs.lex.sense_candidates',
        predicate: Object.freeze({
          op: 'gloss_overlap_margin_lt',
          candidatesPath: 'candidates',
          queryTokensPath: 'queryTokens',
          n: 1,
        }),
      }),
      Object.freeze({
        id: 'f_heteronym_unresolved',
        description:
          'The spelling has more than one PRONUNCIATION, so the candidate senses were ' +
          'pooled across DIFFERENT WORDS. `wound` is one row carrying "put in a coil" ' +
          '(/W AW1 N D/) beside "an injury to living tissue" (/W UW1 N D/); choosing among ' +
          'them is not disambiguation, it is picking a word at random and calling the ' +
          'result a sense. Nothing can be evidenced until the word itself is settled — ' +
          'which needs a syntactic frame. `the wound healed` and `he wound the clock` ' +
          'resolve; a bare `wound` does not, and refusing there is correct. ' +
          'Pronunciation is the test, NOT part-of-speech count: bank n/v and crane n/v ' +
          'are each one word. A missing count reads inconclusive, never as proof.',
        observationId: 'obs.lex.lexical_entries',
        predicate: Object.freeze({ op: 'gt', path: 'viableWordCount', value: 1 }),
      }),
      Object.freeze({
        id: 'f_homophone_capture',
        description:
          'THE KNIGHT/NIGHT KILLER. The winning lemma is a near-perfect phonetic twin of the ' +
          'head token. tq-phoneme-v2 gives knight and night an IDENTICAL vector, so anything ' +
          'selecting on sound surfaces a homophone and calls it meaning. If this fires, the ' +
          'sense channel is measuring phonetics.',
        observationId: 'obs.phon.neighbours',
        // A MEASURED cosine is the harness's to report; the threshold on it is the
        // formula's to decide. That split is why this stays a generic `gte`.
        predicate: Object.freeze({ op: 'gte', path: 'winner.crossLemmaCosine', value: 0.99 }),
      }),
    ]),
    citeSeeds: Object.freeze([
      'codex/core/constellation/phraseAnalysis.js',
      'scholomance_dict.sqlite:wordnet_synset',
    ]),
  }),
  Object.freeze({
    id: 'h_near_kin_by_edge',
    claim:
      'Near-kin are reachable by a wordnet_rel edge from the head token, and each one can ' +
      'name the edge that justifies it.',
    predictions: Object.freeze([
      Object.freeze({
        id: 'p_edge_types_known',
        description: 'Every edge carries a known relation kind, not a bare score',
        required: true,
        observationId: 'obs.lex.relation_paths',
        predicate: Object.freeze({
          op: 'every_field_in',
          path: 'edges',
          field: 'rel',
          values: Object.freeze(['hypernym', 'hyponym', 'similar', 'antonym', 'mero_part', 'holo_part']),
        }),
      }),
      Object.freeze({
        id: 'p_every_kin_has_edge',
        description:
          'Every emitted near-kin names its relation path — otherwise it is a similarity ' +
          'score wearing an explanation, which PDR §7.3 forbids.',
        required: true,
        observationId: 'obs.lex.relation_paths',
        predicate: Object.freeze({ op: 'every_field_truthy', path: 'kin', field: 'relPath' }),
      }),
    ]),
    falsifiers: Object.freeze([
      Object.freeze({
        id: 'f_no_edges_at_all',
        description:
          'The head token has no relation edges, so any near-kin shown beside it came from ' +
          'somewhere other than the graph.',
        observationId: 'obs.lex.relation_paths',
        predicate: Object.freeze({ op: 'lte', path: 'edges.length', value: 0 }),
      }),
    ]),
    citeSeeds: Object.freeze(['scholomance_dict.sqlite:wordnet_rel']),
  }),
]);

/** @type {ProbeFormula} */
export const CONSTELLATION_SENSE_PROBE = Object.freeze({
  id: 'constellation.sense.disambiguation',
  version: '1.0.0',
  /**
   * Courtesy only, for explicitly meta phrasings. The real route in is
   * bindsConstellationInquiry — these must never be the sole binding mechanism,
   * or open vocabulary silently collapses back to a keyword list.
   */
  patterns: Object.freeze(['what does this mean', 'which sense of', 'what is this word doing']),
  keywords: Object.freeze(['sense', 'meaning', 'gloss', 'synset', 'near-kin']),
  observations: OBSERVATIONS,
  hypotheses: HYPOTHESES,
  maxRisk: 'read_only',
  citeSeeds: Object.freeze(['codex/server/services/constellationPage.service.js']),
});

/** Observation ids a harness must satisfy for a complete report. */
export const CONSTELLATION_SENSE_OBSERVATION_IDS = Object.freeze(
  OBSERVATIONS.map((o) => o.id),
);
