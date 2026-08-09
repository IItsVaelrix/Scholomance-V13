import { isValidVote, AUDITION_JUROR_IDS } from '../schemas.js';

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/**
 * CLAUSE_SHAPE — syntactic role of the projected pair (G2P SYNTACTIC analogue).
 *
 * Prefers declarative shape (subject before verb in the token stream) when
 * both are present; treats null-subject imperatives as legal but secondary.
 */
function scoreClauseShape(candidate) {
  if (!candidate || !candidate.answer) return null;

  const { subject, verb } = candidate.answer;
  const tokens = Array.isArray(candidate.tokens) ? candidate.tokens : [];
  const lower = tokens.map((t) => String(t).toLowerCase());

  let confidence = 0.55;
  let tokenWeight = 0.55;
  let stageSignal = 1;
  let syntaxModifier = 1;
  let grade = 'B';
  const notes = [];

  if (verb != null && verb !== '') {
    confidence += 0.1;
    notes.push('has-verb');
  }

  if (subject != null && subject !== '') {
    confidence += 0.1;
    tokenWeight += 0.1;
    notes.push('has-subject');

    if (tokens.length > 0) {
      const si = lower.indexOf(String(subject).toLowerCase());
      const vi = lower.indexOf(String(verb).toLowerCase());
      if (si >= 0 && vi >= 0) {
        if (si < vi) {
          confidence += 0.15;
          syntaxModifier = 1.15;
          stageSignal = 1.15;
          notes.push('subject-before-verb');
        } else {
          confidence -= 0.1;
          syntaxModifier = 0.85;
          notes.push('subject-after-verb');
          grade = 'C';
        }
      }
    }
  } else {
    // Imperative / null subject: legal, not preferred for multi-token S.
    if ((candidate.n || tokens.length) >= 3) {
      confidence -= 0.08;
      notes.push('null-subject-on-long-input');
      grade = 'C';
    } else {
      notes.push('imperative-or-fragment');
    }
  }

  return {
    candidateKey: candidate.candidateKey,
    jurorId: AUDITION_JUROR_IDS.CLAUSE_SHAPE,
    tokenWeight: clamp(tokenWeight, 0.05, 1.5),
    confidence: clamp(confidence, 0, 1),
    stageSignal: clamp(stageSignal, 0.05, 1.6),
    syntaxModifier: clamp(syntaxModifier, 0.2, 2.8),
    rationale: `Clause shape: ${notes.join(', ') || 'neutral'}.`,
    fidelityGrade: grade,
  };
}

export function createClauseShapeJuror() {
  return {
    id: AUDITION_JUROR_IDS.CLAUSE_SHAPE,
    vote(candidate) {
      const vote = scoreClauseShape(candidate);
      if (!vote || !isValidVote(vote)) return null;
      return vote;
    },
  };
}
