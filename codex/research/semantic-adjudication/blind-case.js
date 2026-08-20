/**
 * Blind view of a frozen case: hide Ballistics scores, split, and order.
 *
 * @module codex/research/semantic-adjudication/blind-case
 */

import { assertNoBallistics } from './adjudication-schema.js';
import { seededShuffle } from './util.js';

function scoreOrderIds(frozen) {
  return [...(frozen?.ballistics?.scores || [])]
    .filter((s) => typeof s?.semanticScore === 'number' && Number.isFinite(s.semanticScore))
    .sort((a, b) => b.semanticScore - a.semanticScore || String(a.senseId).localeCompare(String(b.senseId)))
    .map((s) => s.senseId);
}

function notScoreOrdered(candidates, frozen) {
  const ordered = [...candidates];
  const byScore = scoreOrderIds(frozen);
  if (ordered.length < 2 || byScore.length < 2) return ordered;
  const same = ordered.every((c, i) => c.senseId === byScore[i]);
  if (same) {
    [ordered[0], ordered[1]] = [ordered[1], ordered[0]];
  }
  return ordered;
}

/**
 * Adjudicator-facing packet. No scores, no split, no winner.
 * Candidate order is a caseId-seeded shuffle, never Ballistics rank.
 */
export function blindCase(frozen) {
  const shuffled = seededShuffle(frozen.candidateSenses || [], `blind:${frozen.caseId}`);
  const ordered = notScoreOrdered(shuffled, frozen);
  const candidateSenses = ordered.map((c, i) => Object.freeze({
    senseId: c.senseId,
    gloss: c.gloss,
    lemma: c.lemma,
    pos: c.pos,
    label: String.fromCharCode(65 + i),
  }));

  const view = Object.freeze({
    caseId: frozen.caseId,
    query: frozen.query,
    candidateSenses: Object.freeze(candidateSenses),
    probe: Object.freeze({
      status: frozen.probe?.status ?? null,
      predictions: frozen.probe?.predictions ?? null,
      falsifiers: frozen.probe?.falsifiers ?? null,
      observations: frozen.probe?.observations ?? null,
      receiptDigests: frozen.probe?.receiptDigests ?? [],
    }),
    frameEvidence: frozen.frameEvidence ?? null,
    lexicalEvidence: frozen.lexicalEvidence ?? null,
    identity: frozen.identity ?? null,
    versions: frozen.versions ?? null,
  });

  const check = assertNoBallistics(view);
  if (!check.ok) {
    throw new Error(`blind view leaked Ballistics (${check.reason})`);
  }
  return view;
}

/**
 * Reveal seam. Used only after Pass A and Pass B are recorded.
 */
export function revealBallistics(blind, frozen) {
  if (!blind || !frozen || blind.caseId !== frozen.caseId) {
    throw new Error('reveal requires the matching frozen packet');
  }
  return Object.freeze({
    ...blind,
    ballistics: frozen.ballistics,
  });
}

export function labelToSenseId(blind, label) {
  const found = (blind?.candidateSenses || []).find((c) => c.label === label);
  return found?.senseId ?? null;
}
