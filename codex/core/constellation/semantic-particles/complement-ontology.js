/**
 * COMPLEMENT ONTOLOGY — Phase 3A (relation projection only).
 *
 * A bounded ontology for the six highest-leverage silent compositional
 * families in the 2026-08-17 waterfall census (S+SBAR, VP+SBAR, V+SBAR,
 * SBAR+S, VP+INF, V+INF) plus VP+PRT / V+PRT:
 *
 *   COMPLEMENT
 *   ├── PROPOSITIONAL   governor takes a proposition/clause
 *   ├── INFINITIVAL     governor takes an infinitival event
 *   ├── CLAUSAL         RESERVED — declared, not projected in Phase 3A
 *   └── PARTICLE        verb-particle composition
 *
 * Each named composition answers exactly four questions:
 *   What is the governor? What is the complement? What kind of
 *   complement is it? What semantic head survives?
 *
 * LAW: describe what a derivation MEANS IF IT IS CHOSEN. Never encode
 * evidence that it SHOULD be chosen. Composition scores from these rules
 * are exactly 0. ControlRelation is declared but never filled here —
 * control facts belong to a later, separately reviewed authorship act.
 *
 * PROJECTION SPLIT (frozen decision, pinned by tests):
 *   - classifyComplement reports ontology truth (includes PARTICLE).
 *   - projectComplementRelation projects only PROPOSITIONAL and
 *     INFINITIVAL into the T1 layer. PARTICLE is NOT projected: the
 *     live 'particle-of' relation already carries authored COMPAT
 *     mappings, and re-keying it would orphan those rows and could
 *     delete live fires.
 *   - CLAUSAL is projected nowhere in Phase 3A.
 *
 * Expected waterfall movement (declared before the rerun):
 *   relationAvailable ↑, namedCompleteRate ↑.
 *   compatMappingAvailable and actualCompatFire: unchanged by design
 *   (no COMPAT rows, no lexical material authored in Phase 3A).
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/complement-ontology
 */

export const COMPLEMENT_ONTOLOGY_VERSION = '1.0.0';

export const COMPLEMENT_SLOTS = Object.freeze([
  'Governor',
  'Complement',
  'ComplementType',
  'ControlRelation',
  'Finite',
]);

export const COMPLEMENT_TYPES = Object.freeze({
  PROPOSITIONAL: Object.freeze({
    id: 'PROPOSITIONAL',
    relation: 'PROPOSITIONAL_COMPLEMENT',
    status: 'PROJECTED',
    description: 'The governor takes a proposition or clause as its complement.',
  }),
  INFINITIVAL: Object.freeze({
    id: 'INFINITIVAL',
    relation: 'INFINITIVAL_COMPLEMENT',
    status: 'PROJECTED',
    description: 'The governor takes an infinitival (non-finite) event as its complement.',
  }),
  CLAUSAL: Object.freeze({
    id: 'CLAUSAL',
    relation: 'CLAUSAL_COMPLEMENT',
    status: 'RESERVED',
    description:
      'Reserved for clause compositions whose complement kind cannot be '
      + 'determined structurally. Declared so the ontology is honest about '
      + 'the gap; projected nowhere in Phase 3A.',
  }),
  PARTICLE: Object.freeze({
    id: 'PARTICLE',
    relation: 'PARTICLE_COMPLEMENT',
    status: 'PROJECTED_COMPOSITION_ONLY',
    description:
      'Verb-particle composition. Named by composition, but the T1 layer '
      + 'keeps the live particle-of relation (see PROJECTION SPLIT).',
  }),
});

const VERB_TYPES = Object.freeze(['V', 'VP']);

/**
 * Observed census bond shapes, frozen. Governor side is a structural
 * fact of the bond, not a preference: SBAR+S (fronted subordinate) has
 * the matrix clause on the RIGHT; every other shape governs from the
 * left. `finite` describes the complement where structure determines it
 * (INF is non-finite by construction); null means undetermined — never
 * guessed.
 */
const COMPLEMENT_BONDS = Object.freeze([
  Object.freeze({ left: VERB_TYPES, right: Object.freeze(['SBAR']), type: 'PROPOSITIONAL', governorSide: 'left', finite: null }),
  Object.freeze({ left: Object.freeze(['S']), right: Object.freeze(['SBAR']), type: 'PROPOSITIONAL', governorSide: 'left', finite: null }),
  Object.freeze({ left: Object.freeze(['SBAR']), right: Object.freeze(['S']), type: 'PROPOSITIONAL', governorSide: 'right', finite: null }),
  Object.freeze({ left: VERB_TYPES, right: Object.freeze(['INF']), type: 'INFINITIVAL', governorSide: 'left', finite: false }),
  Object.freeze({ left: VERB_TYPES, right: Object.freeze(['PRT']), type: 'PARTICLE', governorSide: 'left', finite: null }),
]);

/**
 * Ontology truth for one ordered type pair. Returns a frozen descriptor
 * { relation, complementType, governorSide, finite, controlRelation }
 * or null when the pair is not a complement composition.
 */
export function classifyComplement(leftType, rightType) {
  for (const bond of COMPLEMENT_BONDS) {
    if (!bond.left.includes(leftType)) continue;
    if (!bond.right.includes(rightType)) continue;
    const type = COMPLEMENT_TYPES[bond.type];
    return Object.freeze({
      relation: type.relation,
      complementType: bond.type,
      governorSide: bond.governorSide,
      finite: bond.finite,
      controlRelation: null,
    });
  }
  return null;
}

/**
 * T1-layer relation projection. Deliberately narrower than the ontology:
 * PARTICLE keeps its live 'particle-of' key (authored mappings exist),
 * CLAUSAL is reserved. Phase 3B may widen this — by a reviewed act.
 */
export function projectComplementRelation(leftType, rightType) {
  const hit = classifyComplement(leftType, rightType);
  if (!hit) return null;
  if (hit.complementType === 'PARTICLE') return null;
  if (hit.complementType === 'CLAUSAL') return null;
  return hit.relation;
}
