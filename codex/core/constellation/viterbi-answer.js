/**
 * PROJECTING AN ANSWER FROM ONE COMMITTED TREE.
 *
 * `projectAnswers` and `derivationCandidates` both read a PACKED node: they walk
 * every derivation it has and return the union of everything those derivations
 * could mean. That is the correct shape for "what readings exist" and the wrong
 * shape for "what does this sentence say", because the union has already thrown
 * away which tree each reading came from. `headedAtoms` does the same thing one
 * level down, unioning the heads of every derivation of a node.
 *
 * `inferForest` resolves exactly that: Viterbi over the derivation hypergraph
 * picks ONE derivation per node. This module reads that choice back out. Same
 * projection laws as `projectAnswers` — PUNCT absorb, COMMA, matrix-preserving
 * adjunction, non-clausal roots — but with no union anywhere, because at every
 * node there is only one edge to take.
 *
 * PURE AND ZERO-I/O. Takes a viterbi Map and a root node; returns an answer or
 * null. Nothing is mutated. It cannot license a bond: every derivation it walks
 * was already admitted by the Grimoire, and Viterbi only chooses among them.
 *
 * @module codex/core/constellation/viterbi-answer
 */

import { ATOM_VALENCE } from './atom-valence.js';

export const VITERBI_ANSWER_CONTRACT = 'PB-VITERBI-ANSWER-v1';

/**
 * Types that may fill a subject, from the declared valence table plus the
 * nominal heads it predates. Same set `resonance-beacon` filters on — a verb is
 * not a subject, and neither is an auxiliary.
 */
const SUBJECT_TYPES = new Set([
  ...(ATOM_VALENCE.V?.subject?.accept || ['NP', 'N', 'PRON']),
  'PROPN', 'NC', 'GEN', 'PRONACC',
]);

/** The derivation Viterbi chose for this node, or null for a leaf. */
const chosen = (viterbi, node) => viterbi?.get?.(node)?.derivation || null;

/**
 * The head token of `node`, following committed edges and the bond's declared
 * head index. One token, never a set — that is the whole point.
 */
function committedHead(viterbi, node, seen = new Set()) {
  if (!node || seen.has(node)) return null;
  seen.add(node);
  const d = chosen(viterbi, node);
  if (!d) return node.token != null ? { token: node.token, type: node.type, from: node.from } : null;
  if (d.lift) return committedHead(viterbi, d.child, seen);
  const headIdx = Array.isArray(d.bond) && (d.bond[3] === 0 || d.bond[3] === 1) ? d.bond[3] : 0;
  return committedHead(viterbi, headIdx === 1 ? d.right : d.left, seen);
}

/**
 * The answer this committed tree states.
 *
 * @param {Map<object, {derivation: object}>} viterbi from `inferForest`
 * @param {object} root a node in `chart.stable`
 * @returns {{subject: string|null, verb: string}|null}
 */
export function projectViterbiAnswer(viterbi, root, seen = new Set()) {
  if (!root || seen.has(root)) return null;
  seen.add(root);

  // A non-clausal root has no subject and no verb; its head IS the answer.
  if (root.type !== 'S') {
    const head = committedHead(viterbi, root);
    return head ? { subject: null, verb: head.token } : null;
  }

  const d = chosen(viterbi, root);
  if (!d) {
    const head = committedHead(viterbi, root);
    return head ? { subject: null, verb: head.token } : null;
  }
  if (d.lift) {
    const verb = committedHead(viterbi, d.child, new Set());
    return verb ? { subject: null, verb: verb.token } : null;
  }

  // Seatbelts, not skeletons: punctuation and a trailing comma absorb away.
  if (d.right?.type === 'PUNCT' || d.right?.type === 'COMMA') {
    return projectViterbiAnswer(viterbi, d.left, seen);
  }

  /**
   * MATRIX-PRESERVING ADJUNCTION. When the bond declares its head on a clausal
   * child, the answer is whatever that clause already says — `ADJ+S`, `ADV+S`,
   * `PP+S`, `SBAR+S`, `FRONTED+S` on the right; `S+SBAR`, `S+CONJS`,
   * `SCOMMA+S` on the left. `SCOMMA` is a clause wearing a comma.
   */
  const headIdx = Array.isArray(d.bond) && (d.bond[3] === 0 || d.bond[3] === 1) ? d.bond[3] : null;
  if (headIdx === 1 && d.right?.type === 'S') return projectViterbiAnswer(viterbi, d.right, seen);
  if (headIdx === 0 && (d.left?.type === 'S' || d.left?.type === 'SCOMMA')) {
    return projectViterbiAnswer(viterbi, d.left, seen);
  }

  // Otherwise this bond IS the clause: left supplies the subject, right the verb.
  const verb = committedHead(viterbi, d.right, new Set());
  if (!verb) return null;
  const subj = committedHead(viterbi, d.left, new Set());
  const subject = subj && SUBJECT_TYPES.has(subj.type) ? subj.token : null;
  return { subject, verb: verb.token };
}

/**
 * The answer for a whole chart: the highest-scoring stable root's committed tree.
 *
 * @param {object} chart a chart composed with `options.semanticParticles`
 * @returns {{subject: string|null, verb: string}|null}
 */
export function viterbiAnswer(chart) {
  const forest = chart?.semanticParticles?.forest;
  const viterbi = forest?.viterbi;
  const root = forest?.best?.node;
  if (!viterbi || !root) return null;
  return projectViterbiAnswer(viterbi, root);
}
