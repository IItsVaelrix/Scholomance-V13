import { isValidVote, AUDITION_JUROR_IDS } from '../schemas.js';
import {
  DETERMINERS,
  AUXILIARIES,
  CONJUNCTIONS,
  RELATIVIZERS,
  SUBORDINATORS,
  PREPOSITION_CUES,
} from '../../../lexical-analysis/closed-class.js';

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

const PUNCT_RE = /^[.!?;:,]+$/;

/** Function words that must not win subject or verb under UD content-head. */
function isFunctionWord(token) {
  if (token == null || token === '') return false;
  const lower = String(token).toLowerCase();
  if (PUNCT_RE.test(lower)) return true;
  return (
    DETERMINERS.has(lower)
    || AUXILIARIES.has(lower)
    || CONJUNCTIONS.has(lower)
    || RELATIVIZERS.has(lower)
    || SUBORDINATORS.has(lower)
    || PREPOSITION_CUES.has(lower)
  );
}

/**
 * CONTENT_HEAD — primary structural juror (G2P's PHONOTACTIC analogue).
 *
 * Head-declaration made bond heads content-first. This juror still ranks
 * among slips: a reading whose subject is an adjective residue or whose verb
 * is an auxiliary loses to one that names content words.
 *
 * Vetoes only categorical impossibilities (empty verb, pure punctuation verb).
 */
function scoreContentHead(candidate) {
  if (!candidate || !candidate.answer) return null;

  const subject = candidate.answer.subject;
  const verb = candidate.answer.verb;
  const key = candidate.candidateKey;

  if (verb == null || verb === '') {
    return {
      candidateKey: key,
      jurorId: AUDITION_JUROR_IDS.CONTENT_HEAD,
      veto: true,
      rationale: 'No verb projected — not a castable clause answer.',
      fidelityGrade: 'F',
    };
  }

  if (PUNCT_RE.test(String(verb))) {
    return {
      candidateKey: key,
      jurorId: AUDITION_JUROR_IDS.CONTENT_HEAD,
      veto: true,
      rationale: `Verb is punctuation (${verb}) — terminal PUNCT must not cast as predicate.`,
      fidelityGrade: 'F',
    };
  }

  const subjectFn = isFunctionWord(subject);
  const verbFn = isFunctionWord(verb);

  let confidence = 0.75;
  let tokenWeight = 0.7;
  let stageSignal = 1;
  let grade = 'B';

  if (subject != null && !subjectFn) {
    confidence += 0.12;
    tokenWeight += 0.15;
  } else if (subject != null && subjectFn) {
    confidence -= 0.25;
    tokenWeight -= 0.2;
    stageSignal -= 0.2;
    grade = 'D';
  }

  if (!verbFn) {
    confidence += 0.1;
    tokenWeight += 0.1;
  } else {
    confidence -= 0.3;
    tokenWeight -= 0.25;
    stageSignal -= 0.25;
    grade = grade === 'D' ? 'F' : 'D';
  }

  // Imperatives: null subject is legal, not a content-head failure.
  if (subject == null) {
    confidence = clamp(confidence - 0.05, 0, 1);
  }

  confidence = clamp(confidence, 0, 1);
  tokenWeight = clamp(tokenWeight, 0.05, 1.5);
  stageSignal = clamp(stageSignal, 0.05, 1.6);

  if (grade === 'F' && !verbFn) grade = 'D';

  return {
    candidateKey: key,
    jurorId: AUDITION_JUROR_IDS.CONTENT_HEAD,
    tokenWeight,
    confidence,
    stageSignal,
    syntaxModifier: 1,
    rationale:
      `Content-head: subject=${subject ?? '∅'}${subjectFn ? ' (function)' : ''}, `
      + `verb=${verb}${verbFn ? ' (function)' : ''}.`,
    fidelityGrade: grade === 'F' ? 'D' : grade,
  };
}

export function createContentHeadJuror() {
  return {
    id: AUDITION_JUROR_IDS.CONTENT_HEAD,
    vote(candidate) {
      const vote = scoreContentHead(candidate);
      if (!vote || !isValidVote(vote)) return null;
      return vote;
    },
  };
}

export { isFunctionWord };
