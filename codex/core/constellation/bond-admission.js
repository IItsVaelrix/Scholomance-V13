/**
 * BOND ADMISSION — one gate for every pairing path.
 *
 * LAW: Bond admission must be independent of agenda direction.
 *
 * `composePacked` dequeues a node and offers it as LEFT and as RIGHT. A
 * receptor that lives in only one of those loops makes the forest a function
 * of pop order. Classic `compose` has a single CKY loop, so the same mistake
 * cannot happen there — unless the two charts copy the receptor body. This
 * module is the body. Both charts call it. Neither chart writes a second copy.
 *
 * LAW: Lexical ambiguity may increase alternative derivations, but must not
 * create new recursive privileges solely through category lifting.
 *
 * VP→S is a licensed imperative. The resulting S is root-eligible and not
 * adjunct-eligible until a constructive clause derivation (NP+VP, inversion,
 * inherited eligible matrix) promotes it. ADJ+S and ADV+S consult that bit.
 * They do not consult how many POS tags the token carries. PP+S / FRONTED+S
 * remain available: a real fronted PP on an imperative is a clause, not a
 * recursive privilege created by lifting.
 *
 * LAW: every atom has a nucleus. The aura is its fingerprint. Silicone
 * bonds (preservative / recursive-preservative) require compatible auras.
 * A lemma may not modify a host whose head lemma is itself.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/bond-admission
 */

import { auraCollision } from './atom-nucleus.js';

export const CYCLOTRON_LAWS = Object.freeze({
  AGENDA_INDEPENDENT_ADMISSION:
    'Bond admission must be independent of agenda direction.',
  LIFTING_IS_NOT_A_RECURSIVE_PRIVILEGE:
    'Lexical ambiguity may increase alternative derivations, but must not create new recursive privileges solely through category lifting.',
  EVERY_ATOM_HAS_A_NUCLEUS:
    'Every atom has a nucleus. The aura is its fingerprint. Silicone bonds require compatible auras.',
  BEACONS_RANK_ONLY:
    'Beacons broadcast atom state. The field ranks readings. It never removes a bond or an atom.',
  LIGHT_IS_MEANING_AGNOSTIC:
    'Light is meaning-agnostic. Chlorophyll reacts to the data. The reaction dictates the informative state.',
  CHLOROPLAST_SENSES_THE_FIELD:
    'The chloroplast is a solar-panel array. Irradiance is meaning-agnostic. Voltage is the reaction. The consumer reads who won each cell.',
  MOLECULES_SELF_ORGANIZE:
    'Voltage is charge. Rivals at one span repel. Complementary cell-winners attract. The field organizes; it does not prune.',
});

/**
 * @param {object} left
 * @param {object} right
 * @param {[string, string, string, 0|1]} bond
 * @returns {string|null} receptor reason, or null if the receptor is silent
 */
export function receptorReject(left, right, bond) {
  const [l, r, result] = bond;
  if (l === 'ADJ' && r === 'S' && result === 'S' && left.from !== 0) {
    return 'adj-s-not-initial';
  }
  if (l === 'NP' && r === 'PART' && result === 'NP' && (right.to - right.from > 7)) {
    return 'np-part-overgrown';
  }
  if (l === 'V' && r === 'PP' && result === 'PART' && (right.to - right.from > 5)) {
    return 'v-pp-part-overgrown';
  }
  if (l === 'VP' && r === 'INF' && result === 'VP' && (right.to - right.from > 8)) {
    return 'vp-inf-overgrown';
  }
  return null;
}

/**
 * Bare adjective/adverb adjunction onto S. These are the rules that turned
 * an imperative lift into generic internal clause material. PP+S and
 * FRONTED+S are utterance-level fronting and can license a real imperative.
 */
const CLAUSE_ADJUNCT_LEFT = new Set(['ADJ', 'ADV']);

export function isClauseAdjunctBond(bond) {
  return bond[2] === 'S' && bond[1] === 'S' && CLAUSE_ADJUNCT_LEFT.has(bond[0]);
}

/**
 * An S is adjunct-eligible when at least one derivation was licensed as a
 * real clause, not merely lifted from a VP.
 *
 * Packed nodes carry the bit on each derivation. Classic molecules carry it
 * on the molecule. Absence means eligible — only the imperative lift opts out.
 */
export function isAdjunctEligible(node) {
  if (!node || node.type !== 'S') return true;
  if (Array.isArray(node.derivations) && node.derivations.length > 0) {
    return node.derivations.some((d) => d.adjunctEligible !== false);
  }
  return node.adjunctEligible !== false;
}

export function imperativeLiftProvenance() {
  return {
    clauseOrigin: 'imperative',
    rootEligible: true,
    adjunctEligible: false,
  };
}

export function isImperativeLift(src, dst) {
  return src === 'VP' && dst === 'S';
}

/**
 * Provenance stamped on a newly built S. Constructive NP+VP is a real clause.
 * An S built by attaching to an existing S inherits that S's eligibility.
 * Other S-building bonds (inversion, etc.) are real clauses.
 */
export function clauseProvenance(left, right, bond) {
  if (!bond || bond[2] !== 'S') return null;
  if (bond[0] === 'NP' && bond[1] === 'VP') {
    return { clauseOrigin: 'subject-predicate', rootEligible: true, adjunctEligible: true };
  }
  /**
   * Utterance-level fronting is the contextual evidence that promotes an
   * embryonic imperative into a real clause. Bare ADJ+S / ADV+S are not.
   */
  if ((bond[0] === 'PP' || bond[0] === 'FRONTED') && bond[1] === 'S') {
    return { clauseOrigin: 'fronted-adjunct', rootEligible: true, adjunctEligible: true };
  }
  const sChild = bond[1] === 'S' ? right : bond[0] === 'S' ? left : null;
  if (sChild) {
    const eligible = isAdjunctEligible(sChild);
    return {
      clauseOrigin: eligible ? 'inherited-clause' : 'imperative',
      rootEligible: true,
      adjunctEligible: eligible,
    };
  }
  return { clauseOrigin: 'constructed-clause', rootEligible: true, adjunctEligible: true };
}

/**
 * Admit or reject one (left, right, bond) triple.
 *
 * @param {object} left
 * @param {object} right
 * @param {[string, string, string, 0|1]} bond
 * @param {{disableMacrophage?: boolean, disableClauseProvenance?: boolean, disableAura?: boolean}} [options]
 * @returns {{ok: boolean, reason?: string}}
 */
export function admitBond(left, right, bond, options = {}) {
  if (!left || !right || !bond) return { ok: false, reason: 'missing' };
  if (left.type !== bond[0] || right.type !== bond[1]) {
    return { ok: false, reason: 'type-mismatch' };
  }
  if (!options.disableMacrophage) {
    const receptor = receptorReject(left, right, bond);
    if (receptor) return { ok: false, reason: receptor };
  }
  if (!options.disableClauseProvenance && isClauseAdjunctBond(bond) && !isAdjunctEligible(right)) {
    return { ok: false, reason: 'imperative-not-adjunct-eligible' };
  }
  if (!options.disableAura) {
    const collision = auraCollision(left, right, bond);
    if (collision) return { ok: false, reason: collision };
  }
  return { ok: true };
}
