/**
 * SEMANTIC PRIMITIVE CONSTANTS
 *
 * The semantic equivalent of phoneme.constants.js.
 *
 * Phonotopography uses 41 ARPAbet phonemes as its closed inventory.
 * Semantotopography uses 40 semantic primitives as its closed inventory.
 *
 * Each primitive has:
 *   - A fixed feature vector (analogous to PHONOLOGICAL_FEATURES_V1)
 *   - A gravity value (analogous to SONORITY_HIERARCHY)
 *   - Deterministic assignment rules (analogous to G2P)
 *
 * The inventory is organized into 5 domains of 8 primitives each:
 *   ENTITY (what things are)
 *   EVENT (what happens)
 *   RELATION (how things connect)
 *   COGNITION (mental operations)
 *   MODALITY (how things hold)
 *
 * Pure data. Zero I/O. PDR §18 compliant.
 */

// ── Canonical Semantic Primitive Inventory (40 primitives) ───────────────────

export const SEMANTIC_INVENTORY = Object.freeze([
  // ENTITY domain (8) — what things are
  'PHYS_OBJ',    // physical object
  'ABSTRACT',    // abstract concept
  'PERSON',      // human agent
  'GROUP',       // collective
  'PLACE',       // location
  'TIME_REF',    // temporal reference
  'QUANTITY',    // amount / measure
  'SUBSTANCE',   // material / stuff

  // EVENT domain (8) — what happens
  'ACTION',      // volitional act
  'PROCESS',     // non-volitional change
  'STATE',       // static condition
  'CAUSE',       // causal relation
  'MOTION',      // spatial movement
  'TRANSFER',    // exchange / giving
  'CREATION',    // making / producing
  'DESTRUCTION', // breaking / ending

  // RELATION domain (8) — how things connect
  'POSSESSION',  // ownership
  'PART_WHOLE',  // meronymy
  'TYPE_OF',     // hyponymy / categorization
  'SIMILAR',     // analogy / resemblance
  'OPPOSITE',    // antonymy / contrast
  'CAUSE_EFFECT',// causation chain
  'TEMPORAL_REL',// sequence / ordering
  'SPATIAL_REL', // location relation

  // COGNITION domain (8) — mental operations
  'KNOW',        // epistemic
  'BELIEVE',     // doxastic
  'WANT',        // desiderative
  'FEEL',        // affective
  'PERCEIVE',    // sensory
  'COMMUNICATE', // speech act
  'EVALUATE',    // judgment
  'CLASSIFY',    // categorization

  // MODALITY domain (8) — how things hold
  'FACTUAL',     // asserted true
  'HYPOTHETICAL',// conditional
  'OBLIGATIVE',  // deontic
  'POSSIBLE',    // epistemic possibility
  'NECESSARY',   // logical necessity
  'NEGATED',     // denial
  'FUTURE',      // prospective
  'PAST',        // retrospective
]);

export const SEMANTIC_INDEX = new Map(SEMANTIC_INVENTORY.map((p, i) => [p, i]));

// ── Semantic Feature Matrix ──────────────────────────────────────────────────
// Analogous to PHONOLOGICAL_FEATURES_V1.
//
// Features:
//   concreteness:  0 = abstract, 1 = concrete
//   animacy:       0 = inanimate, 1 = animate
//   volition:      0 = non-volitional, 1 = volitional
//   polarity:      0 = positive, 1 = negative
//   transitivity:  0 = intransitive, 1 = transitive
//   boundedness:   0 = unbounded, 1 = bounded
//   stativity:     0 = dynamic, 1 = stative
//   specificity:   0 = generic, 1 = specific

export const SEMANTIC_FEATURES_V1 = Object.freeze({
  // ENTITY
  'PHYS_OBJ':    { concreteness: 1, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 1 },
  'ABSTRACT':    { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'PERSON':      { concreteness: 1, animacy: 1, volition: 1, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 1 },
  'GROUP':       { concreteness: 1, animacy: 1, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'PLACE':       { concreteness: 1, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 1 },
  'TIME_REF':    { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'QUANTITY':    { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 1 },
  'SUBSTANCE':   { concreteness: 1, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },

  // EVENT
  'ACTION':      { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'PROCESS':     { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 0, specificity: 0 },
  'STATE':       { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'CAUSE':       { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'MOTION':      { concreteness: 1, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 0, specificity: 0 },
  'TRANSFER':    { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'CREATION':    { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'DESTRUCTION': { concreteness: 0, animacy: 1, volition: 1, polarity: 1, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },

  // RELATION
  'POSSESSION':  { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 1, boundedness: 1, stativity: 1, specificity: 0 },
  'PART_WHOLE':  { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'TYPE_OF':     { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'SIMILAR':     { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'OPPOSITE':    { concreteness: 0, animacy: 0, volition: 0, polarity: 1, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'CAUSE_EFFECT':{ concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'TEMPORAL_REL':{ concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'SPATIAL_REL': { concreteness: 1, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },

  // COGNITION
  'KNOW':        { concreteness: 0, animacy: 1, volition: 0, polarity: 0, transitivity: 1, boundedness: 1, stativity: 1, specificity: 0 },
  'BELIEVE':     { concreteness: 0, animacy: 1, volition: 0, polarity: 0, transitivity: 1, boundedness: 0, stativity: 1, specificity: 0 },
  'WANT':        { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 0, stativity: 1, specificity: 0 },
  'FEEL':        { concreteness: 0, animacy: 1, volition: 0, polarity: 0, transitivity: 1, boundedness: 0, stativity: 1, specificity: 0 },
  'PERCEIVE':    { concreteness: 0, animacy: 1, volition: 0, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'COMMUNICATE': { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'EVALUATE':    { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },
  'CLASSIFY':    { concreteness: 0, animacy: 1, volition: 1, polarity: 0, transitivity: 1, boundedness: 1, stativity: 0, specificity: 0 },

  // MODALITY
  'FACTUAL':     { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 1 },
  'HYPOTHETICAL':{ concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'OBLIGATIVE':  { concreteness: 0, animacy: 0, volition: 1, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'POSSIBLE':    { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'NECESSARY':   { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 1 },
  'NEGATED':     { concreteness: 0, animacy: 0, volition: 0, polarity: 1, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
  'FUTURE':      { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 0, stativity: 1, specificity: 0 },
  'PAST':        { concreteness: 0, animacy: 0, volition: 0, polarity: 0, transitivity: 0, boundedness: 1, stativity: 1, specificity: 0 },
});

// ── Semantic Gravity Hierarchy ───────────────────────────────────────────────
// Analogous to SONORITY_HIERARCHY.
// Higher gravity = more information-dense / contentful.
// Used for directional weighting of bigram transitions.
//
// Hierarchy: ENTITY > EVENT > RELATION > COGNITION > MODALITY
// Within each domain: concrete > abstract, specific > generic, bounded > unbounded

export const SEMANTIC_GRAVITY = Object.freeze({
  // ENTITY (highest gravity — most concrete, most referential)
  'PHYS_OBJ':    10,
  'PERSON':      10,
  'SUBSTANCE':    9,
  'PLACE':        9,
  'GROUP':        8,
  'QUANTITY':     8,
  'TIME_REF':     7,
  'ABSTRACT':     7,

  // EVENT (high gravity — dynamic, information-rich)
  'ACTION':       6,
  'CREATION':     6,
  'DESTRUCTION':  6,
  'TRANSFER':     5,
  'MOTION':       5,
  'CAUSE':        5,
  'PROCESS':      4,
  'STATE':        4,

  // RELATION (medium gravity — structural)
  'CAUSE_EFFECT': 4,
  'POSSESSION':   3,
  'PART_WHOLE':   3,
  'TYPE_OF':      3,
  'SPATIAL_REL':  3,
  'TEMPORAL_REL': 3,
  'SIMILAR':      2,
  'OPPOSITE':     2,

  // COGNITION (lower gravity — internal, less observable)
  'KNOW':         3,
  'PERCEIVE':     3,
  'COMMUNICATE':  3,
  'EVALUATE':     2,
  'CLASSIFY':     2,
  'BELIEVE':      2,
  'WANT':         2,
  'FEEL':         1,

  // MODALITY (lowest gravity — grammatical, least contentful)
  'FACTUAL':      2,
  'NECESSARY':    2,
  'OBLIGATIVE':   1,
  'POSSIBLE':     1,
  'HYPOTHETICAL': 1,
  'NEGATED':      1,
  'FUTURE':       1,
  'PAST':         1,
});

// ── Domain membership ────────────────────────────────────────────────────────

export const SEMANTIC_DOMAINS = Object.freeze({
  ENTITY:    ['PHYS_OBJ', 'ABSTRACT', 'PERSON', 'GROUP', 'PLACE', 'TIME_REF', 'QUANTITY', 'SUBSTANCE'],
  EVENT:     ['ACTION', 'PROCESS', 'STATE', 'CAUSE', 'MOTION', 'TRANSFER', 'CREATION', 'DESTRUCTION'],
  RELATION:  ['POSSESSION', 'PART_WHOLE', 'TYPE_OF', 'SIMILAR', 'OPPOSITE', 'CAUSE_EFFECT', 'TEMPORAL_REL', 'SPATIAL_REL'],
  COGNITION: ['KNOW', 'BELIEVE', 'WANT', 'FEEL', 'PERCEIVE', 'COMMUNICATE', 'EVALUATE', 'CLASSIFY'],
  MODALITY:  ['FACTUAL', 'HYPOTHETICAL', 'OBLIGATIVE', 'POSSIBLE', 'NECESSARY', 'NEGATED', 'FUTURE', 'PAST'],
});

export const PRIMITIVE_TO_DOMAIN = Object.freeze(
  Object.fromEntries(
    Object.entries(SEMANTIC_DOMAINS).flatMap(([domain, primitives]) =>
      primitives.map((p) => [p, domain])
    )
  )
);
