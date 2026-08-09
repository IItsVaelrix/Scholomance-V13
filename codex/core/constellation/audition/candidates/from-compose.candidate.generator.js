/**
 * Generate audition slips from a compose / compose-packed result.
 *
 * Candidates are projected answers — the same `{subject, verb}` shape the
 * treebank scores — not raw molecules. Multiple roots may project the same
 * answer; agreement is counted so the ENSEMBLE juror can reward consensus.
 *
 * PURE AND ZERO-I/O.
 */

import {
  CANDIDATE_SOURCES,
  MAX_CANDIDATES,
  answerKey,
  generateCandidateId,
  dedupeCandidates,
} from '../schemas.js';
import { projectAnswer } from '../../compose.js';
import { projectAnswers } from '../../compose-packed.js';

/**
 * @param {string[]} tokens
 * @param {{stable?: object[], spanning?: object[]}|null} composeResult
 * @param {{source?: string, preferPacked?: boolean}} [options]
 * @returns {object[]}
 */
export function generateFromComposeResult(tokens, composeResult, options = {}) {
  const source = options.source || CANDIDATE_SOURCES.PACKED_STABLE;
  const roots = (composeResult && (composeResult.stable || composeResult.spanning)) || [];
  if (!Array.isArray(roots) || roots.length === 0) return [];

  const n = (tokens || []).length;
  const raw = [];
  let order = 0;

  for (const root of roots) {
    const answers = collectAnswers(root);
    const from = Number.isFinite(root.from) ? root.from : 0;
    const to = Number.isFinite(root.to) ? root.to : Math.max(0, n - 1);
    const spanning = n > 0 && from === 0 && to === n - 1;

    for (const answer of answers) {
      const key = answerKey(answer);
      raw.push({
        id: generateCandidateId(tokens, answer, source, order),
        answer: {
          subject: answer.subject ?? null,
          verb: answer.verb ?? null,
        },
        candidateKey: key,
        source,
        from,
        to,
        n,
        spanning,
        rootType: root.type || 'S',
        confidence: spanning ? 0.9 : 0.55,
        agreement: 1,
        order,
        tokens: tokens || [],
      });
      order += 1;
    }
  }

  // Count agreement across raw slips before dedupe.
  const counts = new Map();
  for (const c of raw) {
    counts.set(c.candidateKey, (counts.get(c.candidateKey) || 0) + 1);
  }
  for (const c of raw) {
    c.agreement = counts.get(c.candidateKey) || 1;
    // Consensus raises source confidence slightly without inventing structure.
    c.confidence = Math.min(1, c.confidence + 0.05 * Math.max(0, c.agreement - 1));
  }

  const deduped = dedupeCandidates(raw);
  // Preserve first-seen order for ORDER juror / determinism.
  deduped.sort((a, b) => a.order - b.order);
  return deduped.slice(0, MAX_CANDIDATES);
}

/**
 * Manual slips for tests and for callers that already projected answers.
 *
 * @param {string[]} tokens
 * @param {Array<{subject?: string|null, verb?: string|null}>} answers
 * @param {object} [meta]
 */
export function generateFromAnswers(tokens, answers, meta = {}) {
  const source = meta.source || CANDIDATE_SOURCES.MANUAL;
  const n = (tokens || []).length;
  const list = Array.isArray(answers) ? answers : [];
  const raw = list.map((answer, order) => {
    const key = answerKey(answer);
    return {
      id: generateCandidateId(tokens, answer, source, order),
      answer: {
        subject: answer?.subject ?? null,
        verb: answer?.verb ?? null,
      },
      candidateKey: key,
      source,
      from: meta.from ?? 0,
      to: meta.to ?? Math.max(0, n - 1),
      n,
      spanning: meta.spanning !== false && n > 0,
      rootType: meta.rootType || 'S',
      confidence: meta.confidence ?? 0.7,
      agreement: 1,
      order,
      tokens: tokens || [],
    };
  });

  const counts = new Map();
  for (const c of raw) {
    counts.set(c.candidateKey, (counts.get(c.candidateKey) || 0) + 1);
  }
  for (const c of raw) {
    c.agreement = counts.get(c.candidateKey) || 1;
  }

  return dedupeCandidates(raw).slice(0, MAX_CANDIDATES);
}

function collectAnswers(root) {
  // Packed nodes carry `derivations`; classic molecules carry `parts`.
  if (root && Array.isArray(root.derivations)) {
    return projectAnswers(root) || [];
  }
  if (root && Array.isArray(root.parts)) {
    const one = projectAnswer(root);
    if (!one || (one.subject == null && one.verb == null)) return [];
    return [one];
  }
  // Already an answer-shaped object.
  if (root && ('subject' in root || 'verb' in root) && !root.type) {
    return [{ subject: root.subject ?? null, verb: root.verb ?? null }];
  }
  try {
    return projectAnswers(root) || [];
  } catch {
    return [];
  }
}
