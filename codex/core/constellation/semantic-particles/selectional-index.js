/**
 * T2 — BIDIRECTIONAL SELECTIONAL-PREFERENCE CHARGES
 *
 * Soft, relation-specific log-compatibility. Missing evidence abstains.
 * A negative charge lowers a score; it does not delete a derivation.
 *
 * PURE AND ZERO-I/O. The index is preloaded. Charge is a pure lookup.
 *
 * @module codex/core/constellation/semantic-particles/selectional-index
 */

import { UNKNOWN, featuresFor } from './feature-provider.js';
import { quantizeScore } from './schema.js';

export const SELECTIONAL_ROLES = Object.freeze([
  'subject-like',
  'object-like',
  'pp-complement',
  'copular-complement',
  'modifier',
  'particle-complementizer',
]);

const INVERSE_ROLE = Object.freeze({
  'subject-like': 'has-subject',
  'object-like': 'has-object',
  'pp-complement': 'has-pp',
  'copular-complement': 'has-copular',
  modifier: 'has-modifier',
  'particle-complementizer': 'has-particle',
});

function lemmaOf(node) {
  const heads = node?.nucleus?.headLemmas;
  if (Array.isArray(heads) && heads[0]) return String(heads[0]).toLowerCase();
  const lemmas = node?.nucleus?.lemmas;
  if (Array.isArray(lemmas) && lemmas[0]) return String(lemmas[0]).toLowerCase();
  return String(node?.token || '').toLowerCase();
}

export function roleProjection(bond) {
  if (!bond || bond.length < 3) return null;
  const [left, right, result] = bond;
  if (left === 'NP' && right === 'VP' && result === 'S') {
    return { role: 'subject-like', predicateSide: 'right', fillerSide: 'left' };
  }
  if ((left === 'V' || left === 'VP') && (right === 'NP' || right === 'NPO') && result === 'VP') {
    return { role: 'object-like', predicateSide: 'left', fillerSide: 'right' };
  }
  if ((left === 'V' || left === 'VP') && right === 'PP') {
    return { role: 'pp-complement', predicateSide: 'left', fillerSide: 'right' };
  }
  if (left === 'COP') {
    return { role: 'copular-complement', predicateSide: 'left', fillerSide: 'right' };
  }
  if ((left === 'ADJ' && (right === 'N' || right === 'NC')) || left === 'ADV') {
    return { role: 'modifier', predicateSide: 'right', fillerSide: 'left' };
  }
  if (right === 'PRT' || left === 'REL' || left === 'SUB' || left === 'TO') {
    return { role: 'particle-complementizer', predicateSide: 'left', fillerSide: 'right' };
  }
  return null;
}

export function freezeSelectionalIndex({ corpusHash, rows } = {}) {
  if (!corpusHash) throw new Error('selectional index requires corpusHash');
  const table = Object.create(null);
  const unigram = Object.create(null);
  let total = 0;
  for (const row of rows || []) {
    if (!SELECTIONAL_ROLES.includes(row.role)) continue;
    const pred = String(row.predicate).toLowerCase();
    const filler = String(row.filler).toLowerCase();
    const role = row.role;
    const count = Number(row.count) || 0;
    if (count <= 0) continue;
    table[role] ||= Object.create(null);
    table[role][pred] ||= Object.create(null);
    table[role][pred][filler] = (table[role][pred][filler] || 0) + count;
    unigram[filler] = (unigram[filler] || 0) + count;
    total += count;
  }
  return Object.freeze({
    corpusHash: String(corpusHash),
    table: Object.freeze(table),
    unigram: Object.freeze(unigram),
    total,
  });
}

function countOf(index, role, pred, filler) {
  return index.table[role]?.[pred]?.[filler] || 0;
}

function predTotal(index, role, pred) {
  const row = index.table[role]?.[pred];
  if (!row) return 0;
  return Object.values(row).reduce((s, n) => s + n, 0);
}

function fillersForPred(index, role, pred) {
  return Object.keys(index.table[role]?.[pred] || {});
}

function classOf(lemma, type, provider) {
  if (!provider) return null;
  const feats = featuresFor(lemma, type, provider);
  const animacy = feats.find((f) => f.kind === 'entity.animacy');
  if (animacy && animacy.value !== UNKNOWN) return `animacy:${animacy.value}`;
  const concrete = feats.find((f) => f.kind === 'entity.concreteness');
  if (concrete && concrete.value !== UNKNOWN) return `concreteness:${concrete.value}`;
  const motion = feats.find((f) => f.kind === 'event.motion');
  if (motion && motion.value !== UNKNOWN) return `motion:${motion.value}`;
  return null;
}

function backoffFillers(index, role, pred, filler, options) {
  const provider = options?.featureProvider;
  if (!provider) return null;
  const cls = classOf(filler.lemma, filler.type, provider);
  if (!cls) return null;
  const candidates = fillersForPred(index, role, pred);
  const matched = candidates.filter((other) => (
    classOf(other, filler.type, provider) === cls
  ));
  if (matched.length === 0) return null;
  const count = matched.reduce((s, other) => s + countOf(index, role, pred, other), 0);
  return { count, fillers: matched };
}

function logCharge(joint, given, background, bgTotal) {
  if (joint <= 0 || given <= 0 || background <= 0 || bgTotal <= 0) return null;
  return Math.log(joint / given) - Math.log(background / bgTotal);
}

export function selectionalCharge(left, right, bond, index, options = {}) {
  const abstain = (reason) => Object.freeze({
    abstain: true,
    score: null,
    confidence: null,
    reason,
    forward: null,
    inverse: null,
    support: 0,
    backoff: null,
    corpusHash: index?.corpusHash || null,
  });
  if (!index?.table) return abstain('no-index');
  const projected = roleProjection(bond);
  if (!projected) return abstain('unprojectable-role');

  const predNode = projected.predicateSide === 'left' ? left : right;
  const fillNode = projected.fillerSide === 'left' ? left : right;
  const pred = lemmaOf(predNode);
  const filler = lemmaOf(fillNode);
  const role = projected.role;

  let joint = countOf(index, role, pred, filler);
  let backoff = null;
  let classUsed = null;
  if (joint <= 0) {
    const proxy = backoffFillers(index, role, pred, { lemma: filler, type: fillNode?.type }, options);
    if (proxy) {
      joint = proxy.count;
      backoff = 'semantic-class';
      classUsed = proxy.fillers.slice().sort().join(',');
    }
  }
  const given = predTotal(index, role, pred);
  const minSupport = options.minSupport == null ? 0 : Number(options.minSupport);
  if (joint <= 0 || given <= 0) return abstain('unseen-relation');
  if (minSupport > 0 && joint < minSupport) return abstain('sparse-count');

  const fillerBg = index.unigram[filler]
    || (backoff ? joint : 0);
  const predBg = Object.keys(index.table[role] || {})
    .reduce((s, p) => s + predTotal(index, role, p), 0);
  const predUnigram = given;
  const forward = logCharge(joint, given, fillerBg || joint, index.total || given);
  const inverse = logCharge(joint, fillerBg || joint, predUnigram, predBg || given);
  if (forward == null || inverse == null) return abstain('unseen-relation');

  const fwd = quantizeScore(forward);
  const inv = quantizeScore(inverse);
  const direction = options.direction || 'both';
  let raw = 0;
  if (direction === 'forward') raw = fwd;
  else if (direction === 'inverse') raw = inv;
  else raw = fwd + inv;
  const cap = options.scoreCap;
  const capped = cap == null ? raw : Math.max(-cap, Math.min(cap, raw));
  return Object.freeze({
    abstain: false,
    score: quantizeScore(capped),
    confidence: quantizeScore(Math.min(1, joint / (joint + 1))),
    reason: null,
    forward: fwd,
    inverse: inv,
    support: joint,
    backoff,
    classUsed,
    role,
    inverseRole: INVERSE_ROLE[role],
    predicate: pred,
    filler,
    pairCount: joint,
    predicateCount: given,
    fillerCount: fillerBg || 0,
    direction,
    raw: quantizeScore(raw),
    corpusHash: index.corpusHash,
  });
}
