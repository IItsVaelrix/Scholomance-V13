/**
 * ATOM NUCLEUS — the sealed self every chart atom carries.
 *
 * Silicone is load-bearing process chemistry and unstable without pressure.
 * The nucleus is that pressure's source: information the atom already is
 * (type, span, lemmas, head lemmas). Nothing from the corpus, the lexicon
 * sense counts, or a neighbour goes in.
 *
 * The aura is the fingerprint of the nucleus. Silicone bonds (preservative
 * and recursive-preservative) must present compatible auras. A collision is
 * the same lemma trying to modify itself after a lift laundered its type.
 * Constructive axioms do not consult the aura — they are already carbon.
 *
 * LAW: every atom has a nucleus. The aura is its fingerprint.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/atom-nucleus
 */

import { BOND_REACTION, classifyBond } from './bond-kind.js';

function fnv1aHex(text) {
  let hash = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function uniqueSorted(values) {
  return Object.freeze([...new Set(values.filter(Boolean).map((v) => String(v).toLowerCase()))].sort());
}

/**
 * Seal a nucleus. The aura is computed from the self only — type, span,
 * lemmas, head lemmas, kind. Two nuclei with the same self have the same aura.
 */
export function sealNucleus(partial = {}) {
  const lemmas = uniqueSorted(partial.lemmas || []);
  const headLemmas = uniqueSorted(partial.headLemmas || lemmas);
  const body = {
    kind: partial.kind || 'composed',
    type: partial.type || null,
    from: Number.isInteger(partial.from) ? partial.from : null,
    to: Number.isInteger(partial.to) ? partial.to : null,
    lemmas,
    headLemmas,
  };
  const aura = `aura1:${fnv1aHex([
    body.kind, body.type, body.from, body.to,
    lemmas.join(','), headLemmas.join(','),
  ].join('|'))}`;
  return Object.freeze({ ...body, aura });
}

export function leafNucleus(token, type, index) {
  const lemma = String(token ?? '').toLowerCase();
  return sealNucleus({
    kind: 'leaf',
    type,
    from: index,
    to: index,
    lemmas: lemma ? [lemma] : [],
    headLemmas: lemma ? [lemma] : [],
  });
}

function asNucleus(value) {
  if (!value) return sealNucleus({});
  if (value.nucleus && Array.isArray(value.nucleus.lemmas)) return value.nucleus;
  if (value.aura && Array.isArray(value.lemmas)) return value;
  return readNucleus(value);
}

export function readNucleus(node) {
  if (node && node.nucleus && Array.isArray(node.nucleus.lemmas)) return node.nucleus;
  if (node && node.aura && Array.isArray(node.lemmas)) return node;
  const lemma = node?.token != null ? String(node.token).toLowerCase() : null;
  return sealNucleus({
    kind: 'bare',
    type: node?.type,
    from: node?.from,
    to: node?.to,
    lemmas: lemma ? [lemma] : [],
    headLemmas: lemma ? [lemma] : [],
  });
}

export function liftNucleus(type, child) {
  const inner = asNucleus(child);
  return sealNucleus({
    kind: 'composed',
    type,
    from: inner.from,
    to: inner.to,
    lemmas: inner.lemmas,
    headLemmas: inner.headLemmas,
  });
}

export function bondNucleus(type, left, right, bond) {
  const l = asNucleus(left);
  const r = asNucleus(right);
  const head = bond && bond[3] === 1 ? r : l;
  return sealNucleus({
    kind: 'composed',
    type,
    from: l.from,
    to: r.to,
    lemmas: [...l.lemmas, ...r.lemmas],
    headLemmas: head.headLemmas,
  });
}

export function mergeNuclei(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return sealNucleus({
    kind: 'composed',
    type: existing.type,
    from: existing.from,
    to: existing.to,
    lemmas: [...existing.lemmas, ...incoming.lemmas],
    headLemmas: [...existing.headLemmas, ...incoming.headLemmas],
  });
}

export function nucleusFromDerivation(type, from, to, derivation) {
  if (derivation && derivation.lift && derivation.child) {
    const lifted = liftNucleus(type, derivation.child);
    return sealNucleus({ ...lifted, from, to, type });
  }
  if (derivation && derivation.bond && derivation.left && derivation.right) {
    return bondNucleus(type, derivation.left, derivation.right, derivation.bond);
  }
  return sealNucleus({ kind: 'composed', type, from, to, lemmas: [], headLemmas: [] });
}

/**
 * Silicone barrier. The adjunct's HEAD lemma may not be the host's head
 * lemma — that is a word modifying a clause or phrase it already is, after
 * a lift or a preservative bond laundered the type.
 *
 * HEAD-TO-HEAD, NOT SUBTREE-TO-HEAD. Comparing every lemma the adjunct
 * contains against the host's head rejects ordinary English: `day by day`
 * and `hand in hand` die because the PP *contains* the head lemma, and
 * `AP Photo/Nasser Nasser` dies because a surname repeats. Measured on the
 * gate corpus, the subtree form fired 28 times across 10 sentences and every
 * inspected firing was a false positive — the top offender being `NP+PP→NP`,
 * which is exactly the reduplicative shape. The head form still blocks the
 * uranium case, where the adjunct is a bare atom and so is its own head.
 *
 * Constructive bonds are carbon and are not pressured.
 * A missing nucleus cannot collide; the barrier only acts on sealed selves.
 */
export function auraCollision(left, right, bond) {
  if (!bond) return null;
  const kind = classifyBond(bond);
  if (kind === BOND_REACTION.CONSTRUCTIVE) return null;
  if (!left?.nucleus || !right?.nucleus) return null;
  const host = bond[3] === 1 ? right : left;
  const adjunct = bond[3] === 1 ? left : right;
  const hostHeads = new Set(readNucleus(host).headLemmas);
  if (hostHeads.size === 0) return null;
  for (const lemma of readNucleus(adjunct).headLemmas) {
    if (hostHeads.has(lemma)) return 'aura-collision';
  }
  return null;
}
