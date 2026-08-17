/**
 * COMPOSITIONAL SEMANTICS
 *
 * Grammar decides the tree. These rules combine child meanings into a
 * phrase meaning. A rule may leave a role unbound. It may not license a
 * bond the chart did not already admit.
 *
 * LAW: a known feature is not a point. Only a value correspondence
 * (or a filled proto-role) contributes to a reading score.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/compositional-semantics
 */

import { DEFAULT_LEXICAL_LEXICON, sensesFor } from './lexical-semantics.js';

export const COMPOSITIONAL_SEMANTICS_VERSION = '1.0.0';
const MAX_READINGS = 16;

const TYPE_ALIASES = Object.freeze({
  NP: Object.freeze(['NP', 'N', 'PROPN', 'PRON', 'PRONACC']),
  NPO: Object.freeze(['NPO', 'N', 'PRONACC', 'PRON', 'PROPN']),
  NC: Object.freeze(['NC', 'N']),
  VP: Object.freeze(['VP', 'V']),
  N: Object.freeze(['N', 'NP', 'NC']),
  V: Object.freeze(['V', 'VP']),
});

function lemmaOf(node) {
  const heads = node?.nucleus?.headLemmas;
  if (Array.isArray(heads) && heads[0]) return String(heads[0]).toLowerCase();
  const lemmas = node?.nucleus?.lemmas;
  if (Array.isArray(lemmas) && lemmas[0]) return String(lemmas[0]).toLowerCase();
  if (node?.token != null) return String(node.token).toLowerCase();
  return null;
}

function sensesForNode(node, lexicon) {
  const lemma = lemmaOf(node);
  if (!lemma) return Object.freeze([]);
  const types = TYPE_ALIASES[node?.type] || [node?.type];
  for (const type of types) {
    const hit = sensesFor(lemma, type, lexicon);
    if (hit.length) return hit;
  }
  return Object.freeze([]);
}

function freezeReading(row) {
  return Object.freeze({
    sense: row.sense || null,
    lemma: row.lemma || null,
    type: row.type || null,
    features: Object.freeze({ ...(row.features || {}) }),
    frame: row.frame || null,
    roles: Object.freeze({ ...(row.roles || {}) }),
    unknown: Boolean(row.unknown),
    score: row.score == null ? null : row.score,
    rule: row.rule || 'leaf',
  });
}

function correspondence(leftFeatures, rightFeatures) {
  let n = 0;
  const keys = new Set([
    ...Object.keys(leftFeatures || {}),
    ...Object.keys(rightFeatures || {}),
  ]);
  for (const key of keys) {
    const lv = leftFeatures?.[key];
    const rv = rightFeatures?.[key];
    if (lv == null || rv == null) continue;
    if (lv === rv && lv !== false) n += 1;
  }
  return n;
}

export function leafMeaning(node, lexicon = DEFAULT_LEXICAL_LEXICON) {
  const lemma = lemmaOf(node);
  const senses = sensesForNode(node, lexicon);
  if (senses.length === 0) {
    return Object.freeze({
      readings: Object.freeze([freezeReading({
        lemma,
        type: node?.type || null,
        unknown: true,
        score: null,
        rule: 'leaf',
      })]),
    });
  }
  return Object.freeze({
    readings: Object.freeze(senses.map((sense) => freezeReading({
      sense: sense.id,
      lemma: sense.lemma,
      type: node?.type || sense.type,
      features: sense.features,
      frame: sense.frame,
      unknown: false,
      score: null,
      rule: 'leaf',
    }))),
  });
}

function ruleName(leftType, rightType, result) {
  if (leftType === 'NP' && rightType === 'VP' && result === 'S') return 'clause-predication';
  if ((leftType === 'V' || leftType === 'VP') && (rightType === 'NP' || rightType === 'NPO') && result === 'VP') {
    return 'object-predication';
  }
  if (leftType === 'ADJ' && (rightType === 'N' || rightType === 'NC') && (result === 'N' || result === 'NC')) {
    return 'intersective-modification';
  }
  if (leftType === 'DET' && (rightType === 'N' || rightType === 'PROPN' || rightType === 'PRON') && result === 'NP') {
    return 'determination';
  }
  if (leftType === 'P' && rightType === 'NP' && result === 'PP') return 'adposition';
  if (leftType === 'COP' && (rightType === 'ADJ' || rightType === 'NP') && result === 'VP') return 'copular-predication';
  if (leftType === 'ADV' && (rightType === 'VP' || rightType === 'ADJ' || rightType === 'S') && (result === rightType)) {
    return 'adverbial-modification';
  }
  if ((leftType === 'VP' || leftType === 'S') && rightType === 'ADV' && result === leftType) {
    return 'adverbial-modification';
  }
  if ((leftType === 'NC' && rightType === 'NC' && result === 'NC')
    || (leftType === 'PROPN' && rightType === 'PROPN' && (result === 'N' || result === 'PROPN'))
    || (leftType === 'N' && rightType === 'N' && (result === 'N' || result === 'NC'))) {
    return 'compound-nominal';
  }
  if (leftType === 'NP' && rightType === 'PP' && result === 'NP') return 'nominal-adjunction';
  if ((leftType === 'V' || leftType === 'VP') && rightType === 'PP' && result === 'VP') return 'verbal-adjunction';
  if (leftType === 'TO' && rightType === 'VP' && result === 'INF') return 'infinitival-composition';
  if (leftType === 'NP' && rightType === 'INF' && result === 'NP') return 'infinitival-adjunction';
  if ((leftType === 'AUX' || leftType === 'MODAL') && rightType === 'VP' && result === 'VP') {
    return 'auxiliary-composition';
  }
  if (leftType === 'REL' && (rightType === 'VP' || rightType === 'S') && (result === 'RELC' || result === 'SBAR' || result === 'S')) {
    return 'relativization';
  }
  if (leftType === 'NP' && rightType === 'RELC' && result === 'NP') return 'relative-adjunction';
  if (leftType === 'SUB' && (rightType === 'S' || rightType === 'VP')) return 'subordination';
  // Phase 3A complement naming (complement-ontology.js). Describes what
  // each derivation means IF chosen; scores stay 0 — no evidence that a
  // derivation SHOULD be chosen is encoded here. Governor side is a
  // structural fact of the bond: SBAR+S governs from the right.
  if ((leftType === 'V' || leftType === 'VP') && rightType === 'SBAR' && result === 'VP') {
    return 'propositional-complement';
  }
  if (leftType === 'S' && rightType === 'SBAR' && result === 'S') {
    return 'propositional-complement';
  }
  if (leftType === 'SBAR' && rightType === 'S' && result === 'S') {
    return 'propositional-complement';
  }
  if ((leftType === 'V' || leftType === 'VP') && rightType === 'INF' && result === 'VP') {
    return 'infinitival-complement';
  }
  if ((leftType === 'V' || leftType === 'VP') && rightType === 'PRT' && result === 'VP') {
    return 'particle-complement';
  }
  if (
    (leftType === 'CONJ' && (rightType === 'NP' || rightType === 'VP' || rightType === 'S' || rightType === 'ADJ'))
    || ((leftType === 'NP' || leftType === 'VP' || leftType === 'S' || leftType === 'ADJ')
      && (rightType === 'CONJNP' || rightType === 'CONJVP' || rightType === 'CONJS' || rightType === 'CONJADJ'))
  ) {
    return 'coordination';
  }
  return 'uninterpreted-bond';
}

function headUnknown(name, left, right, bond) {
  if (name === 'uninterpreted-bond') return Boolean(left.unknown || right.unknown);
  if (name === 'adverbial-modification') {
    const head = bond[2] === bond[0] ? left : right;
    return Boolean(head.unknown);
  }
  if (name === 'propositional-complement' && bond[0] === 'SBAR') {
    // SBAR+S: the governor (semantic head) is the right child.
    return Boolean(right.unknown);
  }
  if (
    name === 'propositional-complement'
    || name === 'infinitival-complement'
    || name === 'particle-complement'
  ) {
    return Boolean(left.unknown);
  }
  if (
    name === 'object-predication'
    || name === 'copular-predication'
    || name === 'nominal-adjunction'
    || name === 'verbal-adjunction'
    || name === 'relative-adjunction'
    || name === 'infinitival-adjunction'
  ) {
    return Boolean(left.unknown);
  }
  return Boolean(right.unknown);
}

function objectRole(frame) {
  const roles = frame?.roles || [];
  if (roles.includes('Stimulus')) return 'Stimulus';
  if (roles.includes('Theme')) return 'Theme';
  if (roles.includes('Patient')) return 'Patient';
  return 'Theme';
}

function subjectRole(frame) {
  const roles = frame?.roles || [];
  if (roles.includes('Agent')) return 'Agent';
  if (roles.includes('Experiencer')) return 'Experiencer';
  return 'Agent';
}

function applyRule(name, left, right, bond) {
  const resultType = bond[2];
  const roles = { ...(left.roles || {}), ...(right.roles || {}) };
  let sense = right.sense || left.sense;
  let lemma = right.lemma || left.lemma;
  let features = { ...(right.features || {}) };
  let frame = right.frame || left.frame;
  let score = 0;
  const unknown = headUnknown(name, left, right, bond);

  if (name === 'clause-predication') {
    const role = subjectRole(right.frame);
    roles[role] = left.lemma;
    roles.Event = right.lemma;
    lemma = right.lemma;
    frame = right.frame;
    sense = right.sense;
    features = { ...(right.features || {}) };
    if (
      role === 'Agent'
      && left.features?.['role.agentCapable'] === true
      && (right.features?.['event.motion'] === true || right.features?.['event.perception'] === true)
    ) {
      score += 1;
    }
    if (
      role === 'Experiencer'
      && left.features?.['role.experiencerCapable'] === true
      && right.features?.['event.perception'] === true
    ) {
      score += 1;
    }
  } else if (name === 'object-predication') {
    const role = objectRole(left.frame);
    roles[role] = right.lemma;
    roles.Event = left.lemma;
    lemma = left.lemma;
    frame = left.frame;
    sense = left.sense;
    features = { ...(left.features || {}) };
    if (right.lemma) score += 1;
  } else if (name === 'intersective-modification') {
    roles.Entity = right.lemma;
    roles.Property = left.lemma;
    lemma = right.lemma;
    sense = right.sense;
    features = { ...(right.features || {}), ...(left.features || {}) };
    frame = right.frame;
    score = correspondence(left.features, right.features);
  } else if (name === 'determination') {
    roles.Entity = right.lemma;
    roles.Determiner = left.lemma;
    lemma = right.lemma;
    sense = right.sense;
    features = { ...(right.features || {}) };
  } else if (name === 'adposition') {
    roles.Relatum = right.lemma;
    roles.Relator = left.lemma;
    lemma = right.lemma;
    sense = right.sense;
  } else if (name === 'copular-predication') {
    roles.State = right.lemma;
    roles.Event = left.lemma;
    lemma = left.lemma;
    sense = right.sense;
    features = { ...(right.features || {}) };
  } else if (name === 'adverbial-modification') {
    const head = resultType === left.type ? left : right;
    const mod = head === left ? right : left;
    roles.Event = head.lemma;
    roles.Adverbial = mod.lemma;
    lemma = head.lemma;
    sense = head.sense;
    features = { ...(head.features || {}) };
    frame = head.frame;
    score = correspondence(mod.features, head.features);
  } else if (name === 'compound-nominal') {
    roles.Entity = right.lemma;
    roles.Modifier = left.lemma;
    lemma = right.lemma;
    sense = right.sense;
    features = { ...(right.features || {}) };
    score = correspondence(left.features, right.features);
  } else if (name === 'nominal-adjunction' || name === 'relative-adjunction' || name === 'infinitival-adjunction') {
    roles.Entity = left.lemma;
    roles.Adjunct = right.lemma;
    lemma = left.lemma;
    sense = left.sense;
    features = { ...(left.features || {}) };
  } else if (name === 'verbal-adjunction') {
    roles.Event = left.lemma;
    roles.Adjunct = right.lemma;
    lemma = left.lemma;
    sense = left.sense;
    features = { ...(left.features || {}) };
    frame = left.frame;
  } else if (name === 'infinitival-composition' || name === 'auxiliary-composition' || name === 'relativization' || name === 'subordination') {
    roles.Event = right.lemma;
    roles.Marker = left.lemma;
    lemma = right.lemma;
    sense = right.sense;
    features = { ...(right.features || {}) };
    frame = right.frame;
  } else if (
    name === 'propositional-complement'
    || name === 'infinitival-complement'
    || name === 'particle-complement'
  ) {
    // Phase 3A complement ontology: governor / complement / type / the
    // surviving semantic head (the governor). score stays 0 — this rule
    // describes the derivation; it does not argue for it.
    const governorIsLeft = bond[0] !== 'SBAR';
    const governor = governorIsLeft ? left : right;
    const complement = governorIsLeft ? right : left;
    const complementType = name === 'propositional-complement'
      ? 'PROPOSITIONAL'
      : name === 'infinitival-complement' ? 'INFINITIVAL' : 'PARTICLE';
    roles.Governor = governor.lemma;
    roles.Complement = complement.lemma;
    roles.ComplementType = complementType;
    lemma = governor.lemma;
    sense = governor.sense;
    features = { ...(governor.features || {}) };
    frame = governor.frame;
  } else if (name === 'coordination') {
    roles.Conjunct = right.lemma;
    roles.Coordinator = left.lemma;
    lemma = right.lemma;
    sense = right.sense;
    features = { ...(right.features || {}) };
  }

  return freezeReading({
    sense,
    lemma,
    type: resultType,
    features,
    frame,
    roles,
    unknown,
    score,
    rule: name,
  });
}

export function composeMeanings(left, right, bond) {
  const name = ruleName(bond?.[0], bond?.[1], bond?.[2]);
  const leftReadings = left?.readings?.length ? left.readings : [freezeReading({ unknown: true, rule: 'leaf' })];
  const rightReadings = right?.readings?.length ? right.readings : [freezeReading({ unknown: true, rule: 'leaf' })];
  const readings = [];
  for (const lr of leftReadings) {
    for (const rr of rightReadings) {
      readings.push(applyRule(name, lr, rr, bond || []));
    }
  }
  readings.sort((a, b) => (
    (b.score || 0) - (a.score || 0)
    || String(a.sense || '').localeCompare(String(b.sense || ''))
    || String(a.lemma || '').localeCompare(String(b.lemma || ''))
  ));
  return Object.freeze({
    rule: name,
    readings: Object.freeze(readings.slice(0, MAX_READINGS)),
  });
}

export function meaningOf(node, lexicon = DEFAULT_LEXICAL_LEXICON, memo = new WeakMap()) {
  if (!node) return Object.freeze({ readings: Object.freeze([]) });
  if (memo.has(node)) return memo.get(node);
  const hold = { readings: Object.freeze([]) };
  memo.set(node, hold);
  let result;
  if (!node.derivations || node.derivations.length === 0) {
    result = leafMeaning(node, lexicon);
  } else {
    const collected = [];
    for (const derivation of node.derivations) {
      if (derivation.lift && derivation.child) {
        const child = meaningOf(derivation.child, lexicon, memo);
        for (const reading of child.readings) {
          collected.push(freezeReading({
            ...reading,
            type: node.type,
            rule: reading.rule === 'leaf' ? 'lift' : reading.rule,
          }));
        }
      } else if (derivation.bond) {
        const composed = composeMeanings(
          meaningOf(derivation.left, lexicon, memo),
          meaningOf(derivation.right, lexicon, memo),
          derivation.bond,
        );
        for (const reading of composed.readings) collected.push(reading);
      }
    }
    if (collected.length === 0) result = leafMeaning(node, lexicon);
    else {
      collected.sort((a, b) => (
        (b.score || 0) - (a.score || 0)
        || String(a.sense || '').localeCompare(String(b.sense || ''))
      ));
      result = Object.freeze({ readings: Object.freeze(collected.slice(0, MAX_READINGS)) });
    }
  }
  memo.set(node, result);
  return result;
}
