/**
 * Two independent deterministic rubrics for Pass A.
 *
 * Neither rubric may read Ballistics. Bare unframed tokens refuse.
 * Overlap is scored first (the probe's own observable). Typed cues
 * fire only when overlap is zero — that is the Type I regime.
 *
 * @module codex/research/semantic-adjudication/rubric-adjudicator
 */

import { glossOverlapCount } from '../../core/semantic-calculus/hypothesisStatus.js';
import { assertNoBallistics, isGoldRefusal } from './adjudication-schema.js';
import { CUE_LEXICON, familyScores, tokenize } from './cue-lexicon.js';
import { contextTokensOf } from './util.js';

function contextOf(blind) {
  const fromIdentity = contextTokensOf(blind.identity);
  if (fromIdentity.length) return fromIdentity;
  const obs = (blind.probe?.observations || []).find((o) => o.observationId === 'obs.lex.sense_candidates');
  return Array.isArray(obs?.result?.queryTokens) ? obs.result.queryTokens : [];
}

function nearDuplicateGlosses(candidates) {
  if (candidates.length < 2) return false;
  const sets = candidates.map((c) => new Set(tokenize(c.gloss)));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const a = sets[i];
      const b = sets[j];
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const w of a) if (b.has(w)) inter += 1;
      const dice = (2 * inter) / (a.size + b.size);
      if (dice >= 0.85) return true;
    }
  }
  return false;
}

function scoreCandidate(queryText, candidate, extraLexicon) {
  const families = familyScores(queryText, candidate.gloss);
  let score = families.reduce((s, r) => s + r.score, 0);
  if (extraLexicon) {
    const q = new Set(tokenize(queryText));
    const g = new Set(tokenize(candidate.gloss));
    for (const word of extraLexicon) {
      if (q.has(word) && g.has(word)) score += 1;
    }
  }
  return score;
}

function decide({
  blind,
  adjudicatorId,
  minScore,
  minMargin,
  extraLexicon,
  useFrame,
}) {
  const leaked = assertNoBallistics(blind);
  if (!leaked.ok) throw new Error(`${adjudicatorId} saw Ballistics (${leaked.reason})`);

  const candidates = blind.candidateSenses || [];
  if (!candidates.length) {
    return Object.freeze({ adjudicatorId, gold: 'BAD_CANDIDATE_SET', notes: 'empty candidate set' });
  }
  if (nearDuplicateGlosses(candidates) && candidates.length > 1) {
    return Object.freeze({ adjudicatorId, gold: 'BAD_CANDIDATE_SET', notes: 'near-duplicate glosses' });
  }

  const tokenCount = blind.identity?.tokenCount
    ?? String(blind.query || '').split(/\s+/).filter(Boolean).length;
  const context = contextOf(blind);
  if (tokenCount <= 1 || context.length === 0) {
    return Object.freeze({ adjudicatorId, gold: 'INSUFFICIENT_CONTEXT', notes: 'bare or unframed token' });
  }
  if (blind.frameEvidence?.isHeteronym && !blind.frameEvidence?.framePos && tokenCount <= 2) {
    return Object.freeze({ adjudicatorId, gold: 'INSUFFICIENT_CONTEXT', notes: 'unframed heteronym' });
  }

  const overlaps = candidates.map((c) => ({
    senseId: c.senseId,
    n: glossOverlapCount(c.gloss, context),
  })).sort((a, b) => b.n - a.n || a.senseId.localeCompare(b.senseId));
  const bestOverlap = overlaps[0]?.n ?? 0;
  if (bestOverlap >= 1) {
    const winners = overlaps.filter((o) => o.n === bestOverlap);
    if (winners.length === 1) {
      return Object.freeze({
        adjudicatorId,
        gold: winners[0].senseId,
        notes: `unique gloss overlap ${bestOverlap}`,
      });
    }
    return Object.freeze({
      adjudicatorId,
      gold: 'AMBIGUOUS',
      notes: `tied gloss overlap ${bestOverlap} x${winners.length}`,
    });
  }

  const queryText = [blind.query, ...context].join(' ');
  const scored = candidates.map((c) => {
    let score = scoreCandidate(queryText, c, extraLexicon);
    if (useFrame && blind.frameEvidence?.framePos && c.pos === blind.frameEvidence.framePos) {
      score += 1;
    }
    return { senseId: c.senseId, score };
  }).sort((a, b) => b.score - a.score || a.senseId.localeCompare(b.senseId));

  const top = scored[0];
  const second = scored[1] ?? { score: 0 };
  if (top.score < minScore) {
    return Object.freeze({ adjudicatorId, gold: 'INSUFFICIENT_CONTEXT', notes: 'no cue support' });
  }
  if (top.score - second.score < minMargin) {
    return Object.freeze({ adjudicatorId, gold: 'AMBIGUOUS', notes: 'cue margin too thin' });
  }
  return Object.freeze({ adjudicatorId, gold: top.senseId, notes: 'typed-cue recovery' });
}

/** Strict rubric: needs a clear typed-cue margin. */
export function adjudicateRubricA(blind) {
  return decide({
    blind,
    adjudicatorId: 'rubric-A-strict',
    minScore: 1,
    minMargin: 1,
    extraLexicon: null,
    useFrame: false,
  });
}

const RUBRIC_B_EXTRA = Object.freeze([
  'loan', 'teller', 'money', 'cash', 'picnic', 'grassy', 'wading',
  'marsh', 'steel', 'solo', 'fried', 'ungrammatical', 'prison',
  ...CUE_LEXICON.DOMAIN,
]);

/** Commonsense rubric: extra domain tokens + frame POS bonus. */
export function adjudicateRubricB(blind) {
  return decide({
    blind,
    adjudicatorId: 'rubric-B-commonsense',
    minScore: 1,
    minMargin: 1,
    extraLexicon: RUBRIC_B_EXTRA,
    useFrame: true,
  });
}

export function isLegalRubricGold(gold, candidates) {
  if (isGoldRefusal(gold)) return true;
  return (candidates || []).some((c) => c.senseId === gold);
}
